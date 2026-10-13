const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// Ignora erros de certificado SSL/TLS do servidor de IPTV
app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');

function createWindow() {
    // Configura o User-Agent global para evitar bloqueios do fornecedor
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = 'IPTVSmartersPlayer/1.0';
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        icon: path.join(__dirname, 'frajola.jpg'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false // Permite carregar mídias de servidores HTTP sem bloqueio CORS
        }
    });

    // Oculta a barra de menus (File, Edit, View, etc.)
    mainWindow.setMenuBarVisibility(false);

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);