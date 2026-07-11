const { app, BrowserWindow, ipcMain, Menu, screen, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const PET_NAME = 'Draco';
// URL di default: la home di Claude Code. Ogni utente imposta la propria sessione
// con "Cambia sessione Claude…" dal menu (viene salvata solo in locale).
const DEFAULT_SESSION_URL = 'https://claude.ai/code';
let SESSION_URL = DEFAULT_SESSION_URL;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let petWin = null;
let claudeWin = null;
let promptWin = null;
let manualOpen = false;

// ---- config persistente (dimensione + posizione) ----
const CFG_FILE = path.join(app.getPath('userData'), 'draco-config.json');
function loadCfg() { try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) { return {}; } }
function saveCfg(patch) { const c = loadCfg(); Object.assign(c, patch); try { fs.writeFileSync(CFG_FILE, JSON.stringify(c)); } catch (e) {} }
let scalePct = 100;

if (!app.requestSingleInstanceLock()) app.quit();

function createPetWindow() {
  const wa = screen.getPrimaryDisplay().workArea;   // overlay su tutta l'area utile
  petWin = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    movable: false, skipTaskbar: true, fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  petWin.loadFile('index.html');
  petWin.setAlwaysOnTop(true, 'floating');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setIgnoreMouseEvents(true, { forward: true });

  const cfg = loadCfg();
  scalePct = cfg.scalePct || 100;
  petWin.webContents.on('did-finish-load', () => petWin.webContents.send('init', { scalePct, pos: cfg.pos || null }));

  if (process.env.DRACO_CAPTURE) {
    setTimeout(async () => {
      try { fs.writeFileSync(process.env.DRACO_CAPTURE, (await petWin.capturePage()).toPNG()); } catch (e) {}
    }, Number(process.env.DRACO_CAPTURE_MS) || 2600);
  }
}

function createClaudeWindow() {
  claudeWin = new BrowserWindow({
    width: 520, height: 760, show: false, title: 'Accedi a Claude',
    webPreferences: { partition: 'persist:claude' },
  });
  claudeWin.loadURL(SESSION_URL, { userAgent: UA });

  const check = () => {
    const url = claudeWin.webContents.getURL();
    const login = url.includes('/login') || url.includes('/auth');
    if (login && !claudeWin.isVisible()) claudeWin.show();
    if (!login && claudeWin.isVisible() && !manualOpen) claudeWin.hide();
    if (petWin) petWin.webContents.send('claude', { login });
  };
  claudeWin.webContents.setWindowOpenHandler(({ url }) => {
    claudeWin.show(); claudeWin.loadURL(url, { userAgent: UA }); return { action: 'deny' };
  });
  claudeWin.webContents.on('did-navigate', check);
  claudeWin.webContents.on('did-navigate-in-page', check);
  claudeWin.on('close', (e) => { e.preventDefault(); claudeWin.hide(); manualOpen = false; });
}

// ---- ponte con la chat Claude (inietta e legge dal DOM reale) ----
const POLL = `(function(){try{
  var login = location.href.indexOf('/login')>-1 || location.href.indexOf('/auth')>-1;
  var arts = Array.from(document.querySelectorAll('[role="article"]'));
  function textOf(a){
    var md = a.querySelectorAll('.epitaxy-markdown');
    if (md.length) {
      var p=[]; for (var j=0;j<md.length;j++){ var t=(md[j].innerText||'').trim(); if(t) p.push(t); }
      return { role:'assistant', text:p.join('\\n\\n') };
    }
    var c=a.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.sr-only,[class*="sr-only"],h2,button,svg'), function(e){ e.remove(); });
    return { role:'user', text:String(c.innerText||'').replace(/\\s+/g,' ').trim() };
  }
  var msgs = arts.slice(-12).map(textOf).filter(function(m){ return m.text; });
  return JSON.stringify({ login:login, n:arts.length, messages:msgs });
}catch(e){return JSON.stringify({login:false,n:0,messages:[]});}})()`;

function injectScript(text) {
  return `(function(t){try{
    var ed=document.querySelector('div.ProseMirror[contenteditable="true"]')
        || document.querySelector('[contenteditable="true"][aria-label="Prompt" i]')
        || document.querySelector('[contenteditable="true"]')
        || document.querySelector('textarea');
    if(!ed) return 'no-editor';
    ed.focus();
    if(ed.tagName==='TEXTAREA'){
      var s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; s.call(ed,t);
      ed.dispatchEvent(new Event('input',{bubbles:true}));
    } else {
      try{document.execCommand('selectAll',false,null);}catch(e){}
      var okIns=false; try{ okIns=document.execCommand('insertText',false,t); }catch(e){}
      ed.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:t}));
      if(!okIns && !(ed.innerText||'').trim()){ ed.textContent=t; ed.dispatchEvent(new InputEvent('input',{bubbles:true})); }
    }
    setTimeout(function(){
      var btns=Array.from(document.querySelectorAll('button[aria-label*="invia" i],button[aria-label*="send" i]'))
        .filter(function(b){return !b.disabled && b.offsetParent!==null;});
      var b=btns[btns.length-1];
      if(b){ b.click(); }
      else { ed.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true})); }
    },170);
    return 'ok';
  }catch(e){return 'err:'+e;}})(${JSON.stringify(text)})`;
}

let primed = false, lastReplyText = '', stable = 0, lastSent = '', lastSentN = -1;
function startClaudePoll() {
  setInterval(async () => {
    if (!claudeWin || claudeWin.isDestroyed() || !petWin) return;
    try {
      const s = JSON.parse(await claudeWin.webContents.executeJavaScript(POLL, true));
      if (s.login) { petWin.webContents.send('claude', { login: true }); return; }
      const msgs = s.messages || [];
      petWin.webContents.send('chat', { messages: msgs });
      let r = '';
      for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'assistant') { r = (msgs[i].text || '').trim(); break; } }
      if (!primed) { primed = true; lastReplyText = r; lastSent = r; lastSentN = s.n; petWin.webContents.send('claude', { generating: false }); return; }
      if (r !== lastReplyText) {
        lastReplyText = r; stable = 0;
        petWin.webContents.send('claude', { generating: true });
      } else {
        stable++;
        if (stable === 2 && r && (r !== lastSent || s.n !== lastSentN)) {
          lastSent = r; lastSentN = s.n; petWin.webContents.send('claude', { reply: r });
        } else if (stable >= 2) {
          petWin.webContents.send('claude', { generating: false });
        }
      }
    } catch (e) { /* pagina non pronta */ }
  }, 700);
}

// ---- cambio sessione Claude (stesso dominio → nessun re-login) ----
function changeSession(url) {
  SESSION_URL = url;
  saveCfg({ sessionUrl: url });
  primed = false; lastReplyText = ''; stable = 0; lastSent = ''; lastSentN = -1;
  if (claudeWin && !claudeWin.isDestroyed()) claudeWin.loadURL(url, { userAgent: UA });
  if (petWin) {
    petWin.webContents.send('chat', { messages: [] });
    petWin.webContents.send('claude', { generating: false });
    petWin.webContents.send('claude', { reply: 'Sessione cambiata ✓ — scrivimi pure.' });
  }
}
function openSessionPrompt() {
  if (promptWin) { promptWin.focus(); return; }
  promptWin = new BrowserWindow({
    width: 480, height: 200, resizable: false, minimizable: false, maximizable: false,
    title: 'Cambia sessione Claude', alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'prompt-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  promptWin.setMenuBarVisibility(false);
  promptWin.loadFile('prompt.html');
  promptWin.on('closed', () => { promptWin = null; });
  if (process.env.DRACO_PROMPT_CAP) {
    promptWin.webContents.on('did-finish-load', () => setTimeout(async () => {
      try { fs.writeFileSync(process.env.DRACO_PROMPT_CAP, (await promptWin.capturePage()).toPNG()); } catch (e) {}
    }, 700));
  }
}
ipcMain.on('session-current', (e) => { e.returnValue = SESSION_URL; });
ipcMain.on('session-submit', (_e, url) => {
  const u = (url || '').trim();
  if (/^https?:\/\/(www\.)?claude\.ai\//i.test(u)) changeSession(u);
  if (promptWin) promptWin.close();
});
ipcMain.on('session-cancel', () => { if (promptWin) promptWin.close(); });

// ---- IPC dal pet ----
ipcMain.on('set-ignore', (_e, ig) => { if (petWin) petWin.setIgnoreMouseEvents(!!ig, { forward: true }); });
ipcMain.on('save-pos', (_e, pos) => saveCfg({ pos }));
ipcMain.on('ask', (_e, text) => {
  if (!claudeWin) return;
  claudeWin.webContents.executeJavaScript(injectScript(text), true).then((res) => {
    if (res === 'no-editor') {
      // niente campo di scrittura: login scaduto o sessione senza chat → apri e avvisa
      manualOpen = true; claudeWin.show(); claudeWin.focus();
      if (petWin) petWin.webContents.send('claude', { reply: 'Non riesco a scrivere in questa sessione (login scaduto o sessione sbagliata). Ho aperto la finestra Claude: accedi via email o scegli una sessione valida, poi riprova.' });
    }
  }).catch(() => {});
  if (petWin) petWin.webContents.send('claude', { generating: true });
});
ipcMain.on('open-claude', () => { manualOpen = true; if (claudeWin) { claudeWin.show(); claudeWin.focus(); } });
ipcMain.on('show-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: `🐾 ${PET_NAME}`, enabled: false },
    { type: 'separator' },
    { label: 'Accedi a Claude (via email)', click: () => { manualOpen = true; if (claudeWin) { claudeWin.show(); claudeWin.focus(); } } },
    { label: 'Incolla link di login', click: () => {
        const url = (clipboard.readText() || '').trim();
        if (/^https?:\/\/\S*(claude|anthropic)/i.test(url) && claudeWin) {
          manualOpen = true; claudeWin.show(); claudeWin.focus(); claudeWin.loadURL(url, { userAgent: UA });
        } else if (petWin) {
          petWin.webContents.send('claude', { reply: 'Copia prima il link dalla mail “Secure link to log in to Claude.ai”, poi riprova.' });
        }
      } },
    { label: 'Scrivi a Draco', click: () => petWin && petWin.webContents.send('focus-input') },
    { label: 'Cambia sessione Claude…', click: openSessionPrompt },
    { type: 'separator' },
    { label: 'Dimensione mascotte', submenu: [50, 75, 100, 125, 150, 200].map((p) => ({
        label: p + '%', type: 'radio', checked: scalePct === p,
        click: () => { scalePct = p; saveCfg({ scalePct: p }); if (petWin) petWin.webContents.send('scale', p); },
      })) },
    { type: 'separator' },
    { type: 'checkbox', label: 'Sempre in primo piano', checked: petWin ? petWin.isAlwaysOnTop() : true,
      click: (i) => petWin && petWin.setAlwaysOnTop(i.checked, 'floating') },
    { type: 'checkbox', label: "Avvia all'accensione", checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: `Esci da ${PET_NAME}`, click: () => app.exit(0) },
  ]);
  menu.popup({ window: petWin });
});

app.on('second-instance', () => { if (petWin) { petWin.show(); petWin.focus(); } });

app.whenReady().then(() => {
  SESSION_URL = loadCfg().sessionUrl || DEFAULT_SESSION_URL;
  createPetWindow();
  createClaudeWindow();
  startClaudePoll();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createPetWindow(); });
});

app.on('window-all-closed', () => app.exit(0));
