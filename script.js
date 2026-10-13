// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDrcGUXdvxNv5_NI-M0J0hkFUVD5cA094s",
    authDomain: "frajola-tv.firebaseapp.com",
    projectId: "frajola-tv",
    storageBucket: "frajola-tv.firebasestorage.app",
    messagingSenderId: "489352889234",
    appId: "1:409362889234:web:a9c2cc4a6scbccf41a1cb"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let playlistData = [];
let liveChannelsData = [];
let moviesData = [];
let seriesData = [];
let kidsData = [];
let animeData = [];

let categories = {};
let favoriteChannels = JSON.parse(localStorage.getItem('frajola_favorites') || '[]');
let currentSelectedChannel = null;
let currentView = 'home';
let selectedCategoryName = 'all';
let isRegisterMode = false;

const OFFICIAL_PLAYLIST_URL = 'http://digsrv.me/get.php?username=18204197&password=48394902&type=m3u';

function alternarModoAuth() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authSubtitle').innerText = isRegisterMode ? 'Crie a sua nova conta' : 'Entre com a sua conta para acessar';
    document.getElementById('authBtn').innerText = isRegisterMode ? 'CRIAR CONTA' : 'ACESSAR CONTA';
    document.getElementById('authToggleText').innerText = isRegisterMode ? 'Já tem conta? Fazer login' : 'Não tem conta? Criar agora';
    document.getElementById('authError').innerText = '';
}

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
            .then(() => { erroEl.innerText = ''; })
            .catch((error) => { erroEl.innerText = 'Erro: ' + error.message; });
    } else {
        auth.signInWithEmailAndPassword(email, senha)
            .then(() => { erroEl.innerText = ''; })
            .catch((error) => { erroEl.innerText = 'E-mail ou senha incorretos.'; });
    }
}

auth.onAuthStateChanged(async (user) => {
    let finished = false;
    const safetyTimeout = setTimeout(() => {
        if (!finished) {
            document.getElementById('authOverlay').style.display = 'flex';
            document.getElementById('paymentOverlay').style.display = 'none';
        }
    }, 4000);

    if (user) {
        try {
            if (user.email === 'matheus.adrih@gmail.com' || user.email === 'tio.frajola@gmail.com') {
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
    fetch(OFFICIAL_PLAYLIST_URL, { redirect: 'follow' })
        .then(res => {
            if (!res.ok) throw new Error('Erro HTTP: ' + res.status);
            return res.text();
        })
        .then(data => {
            if (data && data.length > 10) {
                parseM3U(data);
            } else {
                console.error("A lista M3U veio vazia.");
            }
        })
        .catch(err => console.error('Erro ao carregar conteúdo:', err));
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const btn = document.getElementById('btn-' + viewName);
    if (btn) btn.classList.add('active');

    if (viewName === 'home') {
        document.getElementById('view-home').classList.add('active');
        renderHomeRows();
    } else if (viewName === 'live') {
        document.getElementById('view-live').classList.add('active');
        renderCategories();
        filterLiveChannels();
    } else if (viewName === 'favs') {
        document.getElementById('view-grid').classList.add('active');
        renderCustomGrid('Meus Favoritos', favoriteChannels);
    } else {
        document.getElementById('view-grid').classList.add('active');
        renderCategoryGrid(viewName);
    }
}

function parseM3U(data) {
    playlistData = [];
    liveChannelsData = [];
    moviesData = [];
    seriesData = [];
    kidsData = [];
    animeData = [];

    const lines = data.split('\n');
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            let cleanTitle = line.split(',')[1] || 'Sem título';
            let groupMatch = line.match(/group-title="([^"]+)"/i);
            let logoMatch = line.match(/tvg-logo="([^"]+)"/i);

            let cat = groupMatch ? groupMatch[1] : 'Outros';
            let logo = logoMatch ? logoMatch[1] : '';

            cleanTitle = cleanTitle.replace(/group-title="[^"]*"/gi, '').trim();

            currentItem = { 
                id: playlistData.length, 
                title: cleanTitle, 
                url: '', 
                category: cat, 
                logo: logo 
            };
        } else if (line && !line.startsWith('#')) {
            if (currentItem) {
                currentItem.url = line;
                playlistData.push(currentItem);
                
                // SEPARAÇÃO INTELIGENTE POR CATEGORIA E TIPO
                const catLower = currentItem.category.toLowerCase();
                const urlLower = currentItem.url.toLowerCase();

                if (catLower.includes('filme') || catLower.includes('movie') || catLower.includes('vod') || catLower.includes('cine') || catLower.includes('4k') || catLower.includes('lançamento') || urlLower.endsWith('.mp4') || urlLower.endsWith('.mkv')) {
                    moviesData.push(currentItem);
                } else if (catLower.includes('série') || catLower.includes('serie') || catLower.includes('temporada') || catLower.includes('episodes')) {
                    seriesData.push(currentItem);
                } else if (catLower.includes('infantil') || catLower.includes('kids') || catLower.includes('desenho')) {
                    kidsData.push(currentItem);
                } else if (catLower.includes('anime') || catLower.includes('otaku')) {
                    animeData.push(currentItem);
                } else {
                    liveChannelsData.push(currentItem);
                }

                currentItem = null;
            }
        }
    }

    processCategories();
    renderHomeRows();
}

function processCategories() {
    categories = {};
    liveChannelsData.forEach(item => {
        let cat = item.category || 'Outros';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });
}

function renderHomeRows() {
    const container = document.getElementById('homeRowsContainer');
    if (!container || playlistData.length === 0) return;

    let heroItem = playlistData.find(i => i.logo && i.logo.startsWith('http')) || playlistData[0];
    document.getElementById('heroTitle').innerText = heroItem.title;
    document.getElementById('heroDesc').innerText = 'Categoria: ' + heroItem.category;
    window.heroItemTarget = heroItem;

    let html = '';
    let categoryKeys = Object.keys(categories).slice(0, 10);

    categoryKeys.forEach(cat => {
        let items = categories[cat].slice(0, 20);
        let cardsHtml = items.map(item => {
            let safeStr = JSON.stringify(item).replace(/"/g, '&quot;');
            let img = (item.logo && item.logo.startsWith('http')) ? item.logo : 'frajola.jpg';
            return `
                <div class="media-card" onclick='playFromHome(${safeStr})'>
                    <img src="${img}" onerror="this.src='frajola.jpg'">
                    <div class="title">${item.title}</div>
                </div>
            `;
        }).join('');

        html += `
            <div class="content-row">
                <div class="row-title">${cat}</div>
                <div class="row-cards">${cardsHtml}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function playHeroStream() {
    if (window.heroItemTarget) {
        switchView('live');
        playLiveStream(window.heroItemTarget, null);
    }
}

function playFromHome(item) {
    switchView('live');
    playLiveStream(item, null);
}

function renderCategoryGrid(type) {
    let filtered = [];
    let title = '';

    if (type === 'movies') {
        title = 'Filmes & VOD';
        filtered = moviesData;
    } else if (type === 'series') {
        title = 'Séries Populares';
        filtered = seriesData;
    } else if (type === 'kids') {
        title = 'Infantil & Desenhos';
        filtered = kidsData;
    } else if (type === 'anime') {
        title = 'Animes';
        filtered = animeData;
    }

    // Se a categoria específica não contiver itens, faz um fallback gracioso
    if (filtered.length === 0) {
        filtered = playlistData.slice(0, 100);
    }

    renderCustomGrid(title, filtered);
}

function renderCustomGrid(title, items) {
    document.getElementById('gridTitle').innerText = `${title} (${items.length} itens)`;
    const container = document.getElementById('gridCardsContainer');
    
    let limit = items.slice(0, 200);
    container.innerHTML = limit.map(item => {
        let safeStr = JSON.stringify(item).replace(/"/g, '&quot;');
        let img = (item.logo && item.logo.startsWith('http')) ? item.logo : 'frajola.jpg';
        return `
            <div class="media-card" onclick='playFromGrid(${safeStr})'>
                <img src="${img}" onerror="this.src='frajola.jpg'">
                <div class="title">${item.title}</div>
            </div>
        `;
    }).join('');
}

function playFromGrid(item) {
    switchView('live');
    playLiveStream(item, null);
}

function filterGridContent() {
    const q = document.getElementById('gridSearchInput').value.toLowerCase();
    const cards = document.querySelectorAll('#gridCardsContainer .media-card');
    cards.forEach(card => {
        let title = card.querySelector('.title').innerText.toLowerCase();
        card.style.display = title.includes(q) ? 'flex' : 'none';
    });
}

function renderCategories() {
    const list = document.getElementById('liveCategoryList');
    if (!list) return;

    let html = `
        <li class="${selectedCategoryName === 'all' ? 'active' : ''}" onclick="selectCategory('all', this)">
            <span>Todos os Canais</span> <span>${liveChannelsData.length}</span>
        </li>
        <li class="${selectedCategoryName === 'fav' ? 'active' : ''}" onclick="selectCategory('fav', this)">
            <span>⭐ Favoritos</span> <span>${favoriteChannels.length}</span>
        </li>
    `;

    Object.keys(categories).forEach(cat => {
        html += `
            <li class="${selectedCategoryName === cat ? 'active' : ''}" onclick="selectCategory('${cat.replace(/'/g, "\\'")}', this)">
                <span>${cat}</span> <span>${categories[cat].length}</span>
            </li>
        `;
    });
    list.innerHTML = html;
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

    if (selectedCategoryName === 'all') channels = liveChannelsData;
    else if (selectedCategoryName === 'fav') channels = favoriteChannels;
    else channels = categories[selectedCategoryName] || [];

    if (query) channels = channels.filter(c => c.title.toLowerCase().includes(query));
    renderChannelList(channels);
}

function renderChannelList(channels) {
    const container = document.getElementById('channelList');
    if (!container) return;

    let limit = channels.slice(0, 300);
    container.innerHTML = limit.map((item, idx) => {
        let safeStr = JSON.stringify(item).replace(/"/g, '&quot;');
        let activeClass = (currentSelectedChannel && currentSelectedChannel.url === item.url) ? 'active' : '';
        return `
            <div class="channel-item ${activeClass}" onclick='playLiveStream(${safeStr}, this)'>
                <span style="width:30px; color:#666;">${idx + 1}</span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</span>
            </div>
        `;
    }).join('');
}

function playLiveStream(item, element) {
    currentSelectedChannel = item;

    console.log("=========================================");
    console.log("CANAL SELECIONADO:", item.title);
    console.log("LINK ORIGINAL:", item.url);

    document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('currentChannelTitle').innerText = item.title;
    document.getElementById('currentChannelSub').innerText = 'Categoria: ' + item.category;

    const video = document.getElementById('livePlayer');
    if (!video) return;

    if (window.hlsPlayer) {
        window.hlsPlayer.destroy();
        window.hlsPlayer = null;
    }

    video.pause();
    video.removeAttribute('src');
    video.load();

    let streamUrl = item.url.trim();

    // Se for um canal sem extensão, coloca .m3u8 para forçar HLS
    if (!streamUrl.endsWith('.m3u8') && !streamUrl.endsWith('.ts') && !streamUrl.endsWith('.mp4') && !streamUrl.endsWith('.mkv')) {
        streamUrl = streamUrl + '.m3u8';
    } else if (streamUrl.endsWith('.ts')) {
        streamUrl = streamUrl.replace(/\.ts$/, '.m3u8');
    }

    console.log("LINK PROCESSADO PARA O PLAYER:", streamUrl);
    console.log("=========================================");

    if (Hls.isSupported() && !streamUrl.endsWith('.mp4') && !streamUrl.endsWith('.mkv')) {
        const hls = new Hls({
            maxBufferLength: 15,
            liveSyncDurationCount: 2,
            enableWorker: true,
            lowLatencyMode: true,
            xhrSetup: function (xhr, url) {
                xhr.withCredentials = false;
            }
        });
        window.hlsPlayer = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {
                video.muted = true;
                video.play();
            });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                hls.destroy();
                window.hlsPlayer = null;
                
                let tsFallbackUrl = item.url.trim();
                if (!tsFallbackUrl.endsWith('.ts') && !tsFallbackUrl.endsWith('.mp4')) {
                    tsFallbackUrl = tsFallbackUrl + '.ts';
                }
                video.src = tsFallbackUrl;
                video.load();
                video.play().catch(err => console.log("Erro no fallback nativo:", err));
            }
        });
    } else {
        // Filmes e VOD (.mp4 / .mkv) reproduzem diretamente no leitor HTML5 nativo
        video.src = streamUrl;
        video.load();
        video.play().catch(() => {
            video.muted = true;
            video.play();
        });
    }
}

function toggleFavCurrent() {
    if (!currentSelectedChannel) return;
    const idx = favoriteChannels.findIndex(f => f.url === currentSelectedChannel.url);
    if (idx >= 0) {
        favoriteChannels.splice(idx, 1);
        alert('Removido dos favoritos!');
    } else {
        favoriteChannels.push(currentSelectedChannel);
        alert('Adicionado aos favoritos!');
    }
    localStorage.setItem('frajola_favorites', JSON.stringify(favoriteChannels));
}