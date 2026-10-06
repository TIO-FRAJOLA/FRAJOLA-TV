let playlistData = [];
let categories = {};
let favoriteChannels = JSON.parse(localStorage.getItem('frajola_favorites') || '[]');
let currentSelectedChannel = null;
let currentView = 'home';
let selectedCategoryName = 'all';

window.addEventListener('DOMContentLoaded', () => {
    // Carrega a playlist do utilizador gravada no navegador, se existir
    const savedPlaylist = localStorage.getItem('frajola_custom_playlist');
    if (savedPlaylist) {
        parseM3U(savedPlaylist);
    }
});

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
    } else if (viewName === 'movies' || viewName === 'series') {
        document.getElementById('view-grid').classList.add('active');
        renderGridContent(viewName);
    }
}

document.getElementById('file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { 
        const content = e.target.result;
        localStorage.setItem('frajola_custom_playlist', content);
        parseM3U(content); 
    };
    reader.readAsText(file);
});

function showUrl() { document.getElementById('urlDialog').showModal(); }

function loadUrl() {
    const url = document.getElementById('url').value.trim();
    if (!url) return;
    document.getElementById('status').innerText = '● A carregar URL...';
    fetch(url)
        .then(res => res.text())
        .then(data => {
            localStorage.setItem('frajola_custom_playlist', data);
            parseM3U(data);
            document.getElementById('urlDialog').close();
        })
        .catch(err => {
            alert('Erro ao carregar a URL da playlist M3U.');
            document.getElementById('status').innerText = '● Erro ao carregar';
        });
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
    updateStatus();
    
    if (currentView === 'movies' || currentView === 'series') {
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

function updateStatus() {
    document.getElementById('status').innerText = '● Conectado (' + playlistData.length + ' itens)';
    document.getElementById('cat-count-all').innerText = playlistData.length;
    document.getElementById('cat-count-fav').innerText = favoriteChannels.length;
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
        container.innerHTML = '<div class="empty">Nenhum item encontrado nesta categoria.</div>';
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

    if (playlistData.length === 0) {
        viewGrid.innerHTML = `
            <div class="grid-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2>${type === 'movies' ? 'Filmes' : 'Séries'}</h2>
            </div>
            <div class="empty">Nenhuma lista M3U carregada. Adicione os seus filmes ou séries clicando em "🔗 URL M3U" ou "📂 Ficheiro M3U" no topo.</div>
        `;
        return;
    }

    const filtered = playlistData.filter(item => {
        const title = item.title.toLowerCase();
        const cat = item.category.toLowerCase();
        if (type === 'movies') return cat.includes('movie') || cat.includes('filme') || cat.includes('vod') || title.includes('filme');
        if (type === 'series') return cat.includes('serie') || cat.includes('série') || title.includes('s01') || title.includes('s02');
        return true;
    });

    if (filtered.length === 0) {
        viewGrid.innerHTML = `
            <div class="grid-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h2>${type === 'movies' ? 'Filmes' : 'Séries'}</h2>
                <input type="text" id="gridSearchInput" placeholder="Buscar título..." oninput="filterGridContent()" style="padding: 6px 10px; background: #0f172a; border: 1px solid #1e293b; color: #fff; border-radius: 4px; font-size: 12px;">
            </div>
            <div class="empty">Nenhum ${type === 'movies' ? 'filme' : 'série'} encontrado na lista atual.</div>
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
            <h2>${type === 'movies' ? 'Filmes' : 'Séries'}</h2>
            <input type="text" id="gridSearchInput" placeholder="Buscar título..." oninput="filterGridContent()" style="padding: 6px 10px; background: #0f172a; border: 1px solid #1e293b; color: #fff; border-radius: 4px; font-size: 12px;">
        </div>
        <div class="vod-grid">
            ${cardsHTML}
        </div>
    `;
}

function filterGridContent() {
    const query = document.getElementById('gridSearchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.vod-card');
    cards.forEach(card => {
        const title = card.querySelector('.info').innerText.toLowerCase();
        if (title.includes(query)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function clearSavedList() {
    playlistData = [];
    categories = {};
    localStorage.removeItem('frajola_custom_playlist');
    renderCategories();
    renderChannelList([]);
    document.getElementById('status').innerText = '● Nenhuma lista carregada';
    if (currentView === 'movies' || currentView === 'series') {
        renderGridContent(currentView);
    }
}