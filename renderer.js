// ===== Draco — overlay a tutto schermo: mascotte spostabile + chat dinamica =====
const canvas = document.getElementById('sprite');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const chat = document.getElementById('chat');
const chatLog = document.getElementById('chat-log');
const ask = document.getElementById('ask');
const fx = document.getElementById('fx');

const CW = 192, CH = 208;
const STATES = {
  idle:     { row: 0, frames: 6, fps: 5,  loop: true },
  runRight: { row: 1, frames: 8, fps: 14, loop: true },
  runLeft:  { row: 2, frames: 8, fps: 14, loop: true },
  waving:   { row: 3, frames: 4, fps: 6,  loop: false },
  jumping:  { row: 4, frames: 5, fps: 14, loop: false },
  failed:   { row: 5, frames: 8, fps: 8,  loop: false },
  waiting:  { row: 6, frames: 6, fps: 5,  loop: true },
  working:  { row: 7, frames: 6, fps: 9,  loop: true },
  review:   { row: 8, frames: 6, fps: 7,  loop: false },
};
const EXPAND_H = [200, 300, 400];
const clamp = (v, a, b) => Math.max(a, Math.min(v, b));

// ---- stato ----
let scalePct = 100, expandLevel = 1;
let catX = 100, catY = 100;
let oneshot = null, chatState = 'idle';
let cur = 'idle', frameIdx = 0, acc = 0, lastT = 0, imgReady = false;
let mx = -999, my = -999, lastMoveT = 0, facing = 1;
let dragging = false, moved = false, downX = 0, downY = 0, downT = 0, dragOffX = 0, dragOffY = 0;
let chatOpen = false, chatMessages = [], pendingUser = '', thinking = false, autoScroll = true, sentAt = 0;

const factor = () => scalePct / 100 * 0.9;
const catW = () => CW * factor();
const catH = () => CH * factor();

function updateCatPos() {
  canvas.style.left = Math.round(catX) + 'px';
  canvas.style.top = Math.round(catY) + 'px';
  canvas.style.width = catW() + 'px';
  canvas.style.height = catH() + 'px';
}

// ---- geometria dinamica dei pannelli ----
function panelGeom() {
  const W = window.innerWidth, H = window.innerHeight, M = 8, GAP = 12;
  const cw = catW(), ch = catH();
  const ccx = catX + cw / 2, ccy = catY + ch / 2;
  const pw = Math.min(300, W - 2 * M);
  const above = ccy > H / 2;                 // gatto in basso → chat sopra
  const onRight = ccx > W / 2;               // gatto a destra → chat verso sinistra
  let left = onRight ? (ccx + cw * 0.25 - pw) : (ccx - cw * 0.25);
  left = clamp(left, M, W - pw - M);
  return { W, H, M, GAP, cw, ch, above, left, pw };
}
function layoutChat() {
  const g = panelGeom();
  const availV = g.above ? (catY - g.GAP - g.M) : (g.H - (catY + g.ch + g.GAP) - g.M);
  const h = clamp(EXPAND_H[expandLevel], 140, Math.max(140, availV));
  let top = g.above ? (catY - g.GAP - h) : (catY + g.ch + g.GAP);
  top = clamp(top, g.M, g.H - h - g.M);
  chat.style.left = Math.round(g.left) + 'px';
  chat.style.top = Math.round(top) + 'px';
  chat.style.width = g.pw + 'px';
  chat.style.height = Math.round(h) + 'px';
}
function layoutBubble() {
  const g = panelGeom();
  bubble.style.left = Math.round(g.left) + 'px';
  bubble.style.width = g.pw + 'px';
  if (g.above) { bubble.style.top = 'auto'; bubble.style.bottom = Math.round(g.H - (catY - g.GAP)) + 'px'; }
  else { bubble.style.bottom = 'auto'; bubble.style.top = Math.round(catY + g.ch + g.GAP) + 'px'; }
}
function reposition() {
  if (chatOpen) layoutChat();
  if (!bubble.classList.contains('hidden')) layoutBubble();
}

// ---- nuvoletta transitoria ----
let bubbleTimer = null;
function bubbleSay(text, ms = 3000) {
  if (chatOpen) return;
  bubbleText.textContent = text;
  bubble.classList.remove('hidden');
  bubble.scrollTop = 0;
  layoutBubble();
  clearTimeout(bubbleTimer);
  if (ms > 0) bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), ms);
}
function spawnHearts(n = 4) {
  const icons = ['🧡', '✨', '🐾', '⭐️'];
  const cx = catX + catW() / 2;
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.textContent = icons[Math.floor(Math.random() * icons.length)];
    h.style.left = cx - 24 + Math.random() * 48 + 'px';
    h.style.top = catY + Math.random() * 30 + 'px';
    h.style.bottom = 'auto';
    h.style.animationDelay = Math.random() * 0.25 + 's';
    fx.appendChild(h);
    setTimeout(() => h.remove(), 1400);
  }
}

// ---- pannello chat ----
function renderLog() {
  chatLog.innerHTML = '';
  const msgs = chatMessages.slice(-40);
  for (const m of msgs) {
    const d = document.createElement('div');
    d.className = 'msg ' + (m.role === 'assistant' ? 'claude' : 'user');
    d.textContent = m.text;
    chatLog.appendChild(d);
  }
  const last = msgs[msgs.length - 1];
  if (pendingUser && !(last && last.role === 'user' && last.text === pendingUser)) {
    const d = document.createElement('div');
    d.className = 'msg user pending'; d.textContent = pendingUser;
    chatLog.appendChild(d);
  }
  if (thinking) {
    const d = document.createElement('div');
    d.className = 'msg claude typing'; d.textContent = '• • •';
    chatLog.appendChild(d);
  }
  if (autoScroll) chatLog.scrollTop = chatLog.scrollHeight;
}
chatLog.addEventListener('scroll', () => {
  autoScroll = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40;
});
function openChat() {
  chatOpen = true;
  bubble.classList.add('hidden');
  chat.classList.remove('hidden');
  autoScroll = true;
  layoutChat();
  renderLog();
  window.pet.setIgnore(false);
  setTimeout(() => ask.focus(), 40);
}
function closeChat() { chatOpen = false; chat.classList.add('hidden'); ask.blur(); }
function toggleChat() { chatOpen ? closeChat() : openChat(); }
function sendMsg() {
  const t = ask.value.trim();
  if (!t) return;
  ask.value = '';
  pendingUser = t; thinking = true; chatState = 'working'; autoScroll = true; sentAt = Date.now();
  window.pet.ask(t);
  renderLog();
}
document.getElementById('send').addEventListener('click', sendMsg);
document.getElementById('chat-close').addEventListener('click', closeChat);
document.getElementById('expand').addEventListener('click', () => { expandLevel = Math.min(expandLevel + 1, EXPAND_H.length - 1); autoScroll = true; layoutChat(); renderLog(); });
document.getElementById('collapse').addEventListener('click', () => { expandLevel = Math.max(expandLevel - 1, 0); layoutChat(); renderLog(); });
ask.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendMsg(); }
  else if (e.key === 'Escape') closeChat();
});

// ---- sprite ----
function lookCell(deg) {
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return { row: idx < 8 ? 9 : 10, col: idx % 8 };
}
function drawCell(row, col) {
  ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(img, col * CW, row * CH, CW, CH, 0, 0, CW, CH);
}
function desired() {
  if (dragging) return facing < 0 ? 'runLeft' : 'runRight';
  if (oneshot) return oneshot;
  if (chatState === 'working') return 'working';
  return 'idle';
}
function computeLook() {
  if (Date.now() - lastMoveT > 1500) return null;
  const cx = catX + catW() / 2, cy = catY + catH() * 0.4;
  const dx = mx - cx, dy = my - cy, dist = Math.hypot(dx, dy);
  if (dist < 20 || dist > 340) return null;
  return Math.atan2(dx, -dy) * 180 / Math.PI;
}
function loop(t) {
  if (!lastT) lastT = t;
  let dt = t - lastT; lastT = t;
  if (dt > 200) dt = 200;
  const want = desired();
  if (want !== cur) { cur = want; frameIdx = 0; acc = 0; }
  const stt = STATES[cur];
  acc += dt;
  const dur = 1000 / stt.fps;
  while (acc >= dur) {
    acc -= dur; frameIdx++;
    if (frameIdx >= stt.frames) {
      if (stt.loop) frameIdx = 0;
      else { frameIdx = stt.frames - 1; if (oneshot === cur) oneshot = null; }
    }
  }
  const deg = cur === 'idle' ? computeLook() : null;
  if (deg != null) { const c = lookCell(deg); drawCell(c.row, c.col); }
  else drawCell(stt.row, Math.min(frameIdx, stt.frames - 1));
  requestAnimationFrame(loop);
}
const img = new Image();
img.onload = () => { imgReady = true; requestAnimationFrame(loop); };
img.src = window.pet.spriteUrl();

// ---- posizione iniziale di default (bottom-right) ----
(function initDefault() {
  catX = window.innerWidth - catW() - 10;
  catY = window.innerHeight - catH() - 10;
  updateCatPos();
})();

// ---- segnali da main ----
window.pet.onInit((d) => {
  scalePct = d.scalePct || 100;
  const cw = catW(), ch = catH();
  if (d.pos) {
    catX = clamp(d.pos.xr * window.innerWidth, 0, window.innerWidth - cw);
    catY = clamp(d.pos.yr * window.innerHeight, 0, window.innerHeight - ch);
  } else {
    catX = window.innerWidth - cw - 10;
    catY = window.innerHeight - ch - 10;
  }
  updateCatPos(); reposition();
});
window.pet.onScale((p) => {
  const ccx = catX + catW() / 2, ccy = catY + catH() / 2;
  scalePct = p;
  const cw = catW(), ch = catH();
  catX = clamp(ccx - cw / 2, 0, window.innerWidth - cw);
  catY = clamp(ccy - ch / 2, 0, window.innerHeight - ch);
  updateCatPos(); reposition();
  window.pet.savePos({ xr: catX / window.innerWidth, yr: catY / window.innerHeight });
});
window.pet.onFocusInput(() => openChat());
window.pet.onChat((d) => {
  chatMessages = d.messages || [];
  if (pendingUser) {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'user') { if (chatMessages[i].text === pendingUser) pendingUser = ''; break; }
    }
  }
  if (chatOpen) renderLog();
});
window.pet.onClaude((d) => {
  if (d.login) { bubbleSay('Accedi a Claude 📧 — clic destro → “Accedi via email”', 7000); return; }
  if (d.reply != null) {
    thinking = false; chatState = 'idle'; sentAt = 0; oneshot = 'review'; spawnHearts();
    if (chatOpen) renderLog(); else bubbleSay(d.reply, 20000);
  } else if (d.generating != null) {
    if (d.generating) { thinking = true; chatState = 'working'; }
    else if (Date.now() - sentAt > 4000) { thinking = false; chatState = 'idle'; }
    if (chatOpen) renderLog();
    else if (thinking) bubbleSay('Sto pensando… ⚙️', 0);
  }
});

// ---- interazione mouse ----
function overPet(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const x = (cx - r.left) / r.width * CW, y = (cy - r.top) / r.height * CH;
  if (!imgReady || x < 0 || y < 0 || x >= CW || y >= CH) return false;
  try { return ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 40; }
  catch (e) { return true; }
}
function interactiveAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (el && el.closest('.io')) return true;
  return overPet(x, y);
}
window.addEventListener('mousemove', (e) => {
  mx = e.clientX; my = e.clientY; lastMoveT = Date.now();
  if (dragging) {
    const nx = clamp(e.clientX - dragOffX, 0, window.innerWidth - catW());
    const ny = clamp(e.clientY - dragOffY, 0, window.innerHeight - catH());
    if (Math.abs(nx - catX) > 0.4) facing = nx > catX ? 1 : -1;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
    catX = nx; catY = ny; updateCatPos();
    if (chatOpen) layoutChat();
    return;
  }
  window.pet.setIgnore(!interactiveAt(e.clientX, e.clientY));
});
window.addEventListener('mousedown', (e) => {
  if (e.button === 2) { window.pet.showMenu(); return; }
  if (e.target.closest && e.target.closest('.io')) return;
  if (!overPet(e.clientX, e.clientY)) return;
  dragging = true; moved = false; downX = e.clientX; downY = e.clientY; downT = Date.now();
  dragOffX = e.clientX - catX; dragOffY = e.clientY - catY;
  window.pet.setIgnore(false);
});
window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  if (!moved && Date.now() - downT < 400) toggleChat();
  else window.pet.savePos({ xr: catX / window.innerWidth, yr: catY / window.innerHeight });
  window.pet.setIgnore(!interactiveAt(e.clientX, e.clientY));
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); window.pet.showMenu(); });
window.addEventListener('resize', () => { catX = clamp(catX, 0, window.innerWidth - catW()); catY = clamp(catY, 0, window.innerHeight - catH()); updateCatPos(); reposition(); });

setTimeout(() => { oneshot = 'waving'; bubbleSay('Ciao! Cliccami e scrivimi 🐾', 4000); }, 700);
