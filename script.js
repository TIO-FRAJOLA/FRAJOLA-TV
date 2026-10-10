// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyO...", // Substitui pela tua chave real do Firebase se necessário
    authDomain: "frajola-tv.firebaseapp.com",
    projectId: "frajola-tv",
    storageBucket: "frajola-tv.firebasestorage.app",
    messagingSenderId: "489352889234",
    appId: "1:409362889234:web:a9c2cc4a6scbccf41a1cb"
};

// Inicialização das instâncias do Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Variáveis globais de estado
let playlistData = [];
let categories = {};
let favoriteChannels = JSON.parse(localStorage.getItem('frajola_favorites') || '[]');
let currentSelectedChannel = null;
let currentView = 'home';
let selectedCategoryName = 'all';
let isRegisterMode = false;

// URL DA LISTA XTREAM CODES DO FORNECEDOR
const XTREAM_URL = 'http://digsrv.me/get.php?username=49175447&password=30117803&type=m3u';

// Alterna a interface da modal entre Login e Cadastro
function alternarModoAuth() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authSubtitle').innerText = isRegisterMode ? 'Crie a sua nova conta' : 'Entre com a sua conta para acessar';
    document.getElementById('authBtn').innerText = isRegisterMode ? 'CRIAR CONTA' : 'ACESSAR CONTA';
    document.getElementById('authToggleText').innerText = isRegisterMode ? 'Já tem conta? Fazer login' : 'Não tem conta? Criar agora';
    document.getElementById('authError').innerText = '';
}

// Processa o Login ou o Cadastro de utilizadores
function executarAcaoAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const senha = document.getElementById('authPassword').value.trim();
    const erroEl = document.getElementById('authError');

    if (!email || !senha) {
        erroEl.innerText = 'Preencha todos os campos.';
        return;
    }

    erroEl.innerText = 'A processar...';

    if (isRegisterMode) {
        auth.createUserWithEmailAndPassword(email, senha)
            .then((userCredential) => {
                const uid = userCredential.user.uid;
                return db.collection('usuarios').doc(uid).set({
                    email: email,
                    ativo: true,
                    criadoEm: new Date()
                });
            })
            .then(() => {
                erroEl.innerText = '';
            })
            .catch((error) => {
                console.error(error);
                erroEl.innerText = 'Erro: ' + error.message;
            });
    } else {
        auth.signInWithEmailAndPassword(email, senha)
            .then(() => {
                erroEl.innerText = '';
            })
            .catch((error) => {
                console.error(error);
                erroEl.innerText = 'E-mail ou senha incorretos.';
            });
    }
}

// VERIFICAÇÃO DE ACESSO NO FIRESTORE COM SEGURANÇA
auth.onAuthStateChanged(async (user) => {
    let finished = false;
    
    const safetyTimeout = setTimeout(() => {
        if (!finished) {
            console.warn("Aviso: Verificação demorou muito, liberando interface por segurança.");
            document.getElementById('authOverlay').style.display = 'flex';
            document.getElementById('paymentOverlay').style.display = 'none';
        }
    }, 4000);

    if (user) {
        try {
            // SE FOR O TEU E-MAIL PRINCIPAL, LIBERA O ACESSO DIRETO
            if (user.email === 'tio.frajola@gmail.com') {
                finished = true;
                clearTimeout(safetyTimeout);
                document.getElementById('authOverlay').style.display = 'none';
                document.getElementById('paymentOverlay').style.display = 'none';
                loadOfficialPlaylist();
                return;
            }

            const docRef = db.collection('usuarios').doc(user.uid);
            const doc = await docRef.get();

            finished = true;
            clearTimeout(safetyTimeout);

            if (doc.exists && doc.data().ativo === true) {
                document.getElementById('authOverlay').style.display = 'none';
                document.getElementById('paymentOverlay').style.display = 'none';
                loadOfficialPlaylist();
            } else {
                document.getElementById('authOverlay').style.display = 'none';
                document.getElementById('paymentOverlay').style.display = 'flex';
            }
        } catch (error) {
            finished = true;
            clearTimeout(safetyTimeout);
            console.error("Erro ao verificar utilizador no Firestore:", error);
            document.getElementById('authOverlay').style.display = 'none';
            document.getElementById('paymentOverlay').style.display = 'flex';
        }
    } else {
        finished = true;
        clearTimeout(safetyTimeout);
        document.getElementById('authOverlay').style.display = 'flex';
        document.getElementById('paymentOverlay').style.display = 'none';
    }
});

function fazerLogout() {
    auth.signOut();
}

function loadOfficialPlaylist() {
    fetch(XTREAM_URL)
        .then(res => res.text())
        .then(data => parseM3U(data))
        .catch(err => console.error('Erro ao carregar conteúdo do fornecedor', err));
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const btn = document.getElementById('btn-' + viewName);
    if (btn) btn.classList.add('active');

    if (viewName === 'home') {
        document.getElementById('view-home').classList.add('active');
    } else if (viewName === 'live') {
        document.getElementById('view-live').classList.add('active');
        renderCategories();
        filterLiveChannels();
    } else {
        document.getElementById('view-grid').classList.add('active');
        renderGridContent(viewName);
    }
}

function parseM3U(data) {
    playlistData = [];
    const lines = data.split('\n');
    let currentItem = null;

    lines.forEach((line, idx) => {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
            let cleanTitle = line.split(',')[1] || 'Sem título';
            let groupMatch = line.match(/group-title="([^"]+)"/i);
            let logoMatch = line.match(/tvg-logo="([^"]+)"/i);

            let cat = groupMatch ? groupMatch[1] : 'Outros';
            let logo = logoMatch ? logoMatch[1] : '';

            cleanTitle = cleanTitle.replace(/group-title="[^"]*"/gi, '').trim();

            currentItem = { 
                id: idx, 
                title: cleanTitle, 
                url: '', 
                category: cat, 
                logo: logo 
            };
        } else if (line && !line.startsWith('#')) {
            if (currentItem) {
                currentItem.url = line;
                playlistData.push(currentItem);
                currentItem = null;
            }
        }
    });

    processCategories();
    if (currentView !== 'home' && currentView !== 'live') {
        renderGridContent(currentView);
    } else if (currentView === 'live') {
        renderCategories();
        filterLiveChannels();
    }
}

function processCategories() {
    categories = {};
    playlistData.forEach(item => {
        let cat = item.category || 'Outros';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });
}

function renderCategories() {
    const list = document.getElementById('liveCategoryList');
    list.innerHTML = `
        <li class="${selectedCategoryName === 'all' ? 'active' : ''}" onclick="selectCategory('all', this)">
            <span>Todos</span> <span class="badge">${playlistData.length}</span>
        </li>
        <li class="${selectedCategoryName === 'fav' ? 'active' : ''}" onclick="selectCategory('fav', this)">
            <span>⭐ Favoritos</span> <span class="badge">${favoriteChannels.length}</span>
        </li>
    `;

    Object.keys(categories).forEach(cat => {
        const li = document.createElement('li');
        if (selectedCategoryName === cat) li.className = 'active';
        li.innerHTML = `<span>${cat}</span> <span class="badge">${categories[cat].length}</span>`;
        li.onclick = () => selectCategory(cat, li);
        list.appendChild(li);
    });
}

function selectCategory(catName, el) {
    selectedCategoryName = catName;
    document.querySelectorAll('#liveCategoryList li').forEach(l => l.classList.remove('active'));
    if (el) el.classList.add('active');
    filterLiveChannels();
}

function filterLiveChannels() {
    const query = document.getElementById('liveSearchInput').value.toLowerCase();
    let channels = [];

    if (selectedCategoryName === 'all') {
        channels = playlistData;
    } else if (selectedCategoryName === 'fav') {
        channels = favoriteChannels;
    } else {
        channels = categories[selectedCategoryName] || [];
    }

    if (query) {
        channels = channels.filter(c => c.title.toLowerCase().includes(query));
    }

    renderChannelList(channels);
}

function renderChannelList(channels) {
    const container = document.getElementById('channelList');
    container.innerHTML = '';

    if (channels.length === 0) {
        container.innerHTML = '<div class="empty">Nenhum item encontrado.</div>';
        return;
    }

    channels.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'channel-item';
        if (currentSelectedChannel && currentSelectedChannel.url === item.url) {
            div.classList.add('active');
        }

        div.innerHTML = `
            <span class="channel-num">${index + 1}</span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</span>
        `;

        div.onclick = () => playLiveStream(item, div);
        container.appendChild(div);
    });
}

function playLiveStream(item, element) {
    currentSelectedChannel = item;
    document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('currentChannelTitle').innerText = item.title;
    document.getElementById('currentChannelSub').innerText = 'Categoria: ' + item.category;

    const video = document.getElementById('livePlayer');

    if (window.hlsPlayer) window.hlsPlayer.destroy();

    const startPlayback = () => {
        let playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                video.muted = false;
            }).catch(() => {
                video.muted = true;
                video.play();
            });
        }
    };

    if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        window.hlsPlayer = hls;
        hls.loadSource(item.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => startPlayback());
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = item.url;
        startPlayback();
    }
}

function toggleFavCurrent() {
    if (!currentSelectedChannel) return;
    const index = favoriteChannels.findIndex(f => f.url === currentSelectedChannel.url);
    if (index >= 0) {
        favoriteChannels.splice(index, 1);
        alert('Removido dos favoritos!');
    } else {
        favoriteChannels.push(currentSelectedChannel);
        alert('Adicionado aos favoritos!');
    }
    localStorage.setItem('frajola_favorites', JSON.stringify(favoriteChannels));
    document.getElementById('cat-count-fav').innerText = favoriteChannels.length;
}

function renderGridContent(type) {
    const viewGrid = document.getElementById('view-grid');
    const titles = {
        'destaques': 'Destaques',
        'movies': 'Filmes',
        'series': 'Séries',
        'kids': 'Kids',
        'anime': 'Anime'
    };

    const filtered = playlistData.filter(item => {
        const title = item.title.toLowerCase();
        const cat = item.category.toLowerCase();
        
        if (type === 'destaques') return true;
        if (type === 'movies') return cat.includes('movie') || cat.includes('filme') || cat.includes('vod');
        if (type === 'series') return cat.includes('serie') || cat.includes('série') || title.includes('s01');
        if (type === 'kids') return cat.includes('infantil') || cat.includes('kids') || cat.includes('desenho');
        if (type === 'anime') return cat.includes('anime') || title.includes('naruto') || title.includes('dragon ball');
        return false;
    });

    if (filtered.length === 0) {
        viewGrid.innerHTML = `
            <div class="grid-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2>${titles[type]}</h2>
                <input type="text" id="gridSearchInput" placeholder="Buscar..." oninput="filterGridContent()" style="padding: 6px 10px; background: #120303; border: 1px solid #7f1d1d; color: #fff; border-radius: 4px; font-size: 12px;">
            </div>
            <div class="empty">Nenhum item encontrado nesta categoria.</div>
        `;
        return;
    }

    let cardsHTML = filtered.map(item => `
        <div class="vod-card" onclick="switchView('live'); playLiveStream(${JSON.stringify(item).replace(/"/g, '&quot;')}, null)">
            <img src="${item.logo || 'frajola.jpg'}" onerror="this.src='frajola.jpg'">
            <div class="info">${item.title}</div>
        </div>
    `).join('');

    viewGrid.innerHTML = `
        <div class="grid-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <h2>${titles[type]}</h2>
            <input type="text" id="gridSearchInput" placeholder="Buscar..." oninput="filterGridContent()" style="padding: 6px 10px; background: #120303; border: 1px solid #7f1d1d; color: #fff; border-radius: 4px; font-size: 12px;">
        </div>
        <div class="vod-grid">
            ${cardsHTML}
        </div>
    `;
}

function filterGridContent() {
    const queryInput = document.getElementById('gridSearchInput');
    if (!queryInput) return;
    const query = queryInput.value.toLowerCase();
    const cards = document.querySelectorAll('.vod-card');
    cards.forEach(card => {
        const titleEl = card.querySelector('.info');
        if (titleEl) {
            const title = titleEl.innerText.toLowerCase();
            if (title.includes(query)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        }
    });
}