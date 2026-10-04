let playlistData = [];
let favoriteChannels = JSON.parse(localStorage.getItem('frajola_favorites') || '[]');

window.addEventListener('DOMContentLoaded', () => {
    const savedPlaylist = localStorage.getItem('frajola_playlist');
    if (savedPlaylist) {
        try {
            playlistData = JSON.parse(savedPlaylist);
            renderItems(playlistData);
            document.getElementById('status').innerText = '● Lista Guardada (' + playlistData.length + ' canais)';
            document.getElementById('count').innerText = playlistData.length + ' itens';
        } catch (e) {
            console.error('Erro ao carregar lista guardada:', e);
        }
    } else {
        loadBrazilChannels();
    }
});

function loadBrazilChannels() {
    document.getElementById('status').innerText = '● A carregar canais do Brasil...';
    const brUrl = 'https://iptv-org.github.io/iptv/countries/br.m3u';
    
    fetch(brUrl)
        .then(response => response.text())
        .then(data => parseM3U(data))
        .catch(err => {
            document.getElementById('status').innerText = '● Erro ao carregar lista BR';
            console.error(err);
        });
}

document.getElementById('file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        parseM3U(e.target.result);
    };
    reader.readAsText(file);
});

function showUrl() {
    document.getElementById('urlDialog').showModal();
}

function loadUrl() {
    const url = document.getElementById('url').value.trim();
    if (!url) return;

    fetch(url)
        .then(response => response.text())
        .then(data => {
            parseM3U(data);
            document.getElementById('urlDialog').close();
        })
        .catch(err => {
            alert('Erro ao carregar a lista via URL.');
            console.error(err);
        });
}

function parseM3U(data) {
    const lines = data.split('\n');
    playlistData = [];
    let currentItem = null;

    lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
            let cleanTitle = line.split(',')[1] || 'Sem título';
            let groupMatch = line.match(/group-title="([^"]+)"/i);
            let category = groupMatch ? groupMatch[1] : 'Geral';

            cleanTitle = cleanTitle
                .replace(/group-title="[^"]*"/gi, '')
                .replace(/tvg-[a-z]+="[^"]*"/gi, '')
                .replace(/Mozilla\/[^\s]+/gi, '')
                .replace(/AppleWebKit\/[^\s]+/gi, '')
                .replace(/Chrome\/[^\s]+/gi, '')
                .replace(/Safari\/[^\s]+/gi, '')
                .trim();

            currentItem = { title: cleanTitle, url: '', category: category };
        } else if (line && !line.startsWith('#')) {
            if (currentItem) {
                currentItem.url = line;
                playlistData.push(currentItem);
                currentItem = null;
            }
        }
    });

    try {
        localStorage.setItem('frajola_playlist', JSON.stringify(playlistData));
    } catch (e) {
        console.warn('Lista muito grande para guardar:', e);
    }

    renderItems(playlistData);
    document.getElementById('status').innerText = '● Lista Conectada (' + playlistData.length + ' canais)';
    document.getElementById('count').innerText = playlistData.length + ' itens';
}

function renderItems(items) {
    const container = document.getElementById('items');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="empty">Nenhum canal encontrado.</div>';
        return;
    }

    items.forEach(item => {
        const isFav = favoriteChannels.some(f => f.url === item.url);
        
        const div = document.createElement('div');
        div.className = 'tile';
        
        const titleSpan = document.createElement('span');
        titleSpan.innerText = item.title;
        titleSpan.style.flex = '1';
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.whiteSpace = 'nowrap';
        titleSpan.onclick = () => playStream(item.url);

        const favBtn = document.createElement('button');
        favBtn.innerText = isFav ? '★' : '☆';
        favBtn.style.background = 'none';
        favBtn.style.border = 'none';
        favBtn.style.color = isFav ? '#f1c40f' : '#64748b';
        favBtn.style.fontSize = '16px';
        favBtn.style.padding = '0 0 0 8px';
        favBtn.style.cursor = 'pointer';
        favBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(item);
        };

        div.appendChild(titleSpan);
        div.appendChild(favBtn);
        container.appendChild(div);
    });
}

function toggleFavorite(item) {
    const index = favoriteChannels.findIndex(f => f.url === item.url);
    if (index >= 0) {
        favoriteChannels.splice(index, 1);
    } else {
        favoriteChannels.push(item);
    }
    localStorage.setItem('frajola_favorites', JSON.stringify(favoriteChannels));
    filterChannels();
}

function showFavorites() {
    renderItems(favoriteChannels);
    document.getElementById('count').innerText = favoriteChannels.length + ' favoritos';
}

function filterCategory(type) {
    if (type === 'all' || type === 'live') {
        renderItems(playlistData);
        document.getElementById('count').innerText = playlistData.length + ' itens';
        return;
    }

    const filtered = playlistData.filter(item => {
        const title = item.title.toLowerCase();
        const cat = item.category.toLowerCase();
        
        if (type === 'news') return title.includes('news') || title.includes('notícia') || cat.includes('news');
        if (type === 'sports') return title.includes('sport') || title.includes('esporte') || cat.includes('sports');
        if (type === 'movies') return title.includes('cine') || title.includes('filme') || title.includes('hbo') || cat.includes('movie');
        if (type === 'series') return title.includes('série') || title.includes('series') || cat.includes('series');
        return true;
    });

    renderItems(filtered);
    document.getElementById('count').innerText = filtered.length + ' itens';
}

function filterChannels() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const filtered = playlistData.filter(item => item.title.toLowerCase().includes(query));
    renderItems(filtered);
    document.getElementById('count').innerText = filtered.length + ' itens';
}

function playStream(url) {
    const video = document.getElementById('player');
    video.scrollIntoView({ behavior: 'smooth' });

    if (window.hlsPlayer) {
        window.hlsPlayer.destroy();
    }

    if (Hls.isSupported()) {
        const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
        });
        window.hlsPlayer = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
            video.play().catch(e => console.log('Autoplay impedido:', e));
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        break;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play();
    }
}

function refresh() {
    localStorage.removeItem('frajola_playlist');
    loadBrazilChannels();
}

function clearSavedList() {
    localStorage.removeItem('frajola_playlist');
    playlistData = [];
    renderItems([]);
    document.getElementById('status').innerText = '● Lista não conectada';
    document.getElementById('count').innerText = '0 itens';
    alert('Lista removida com sucesso!');
}