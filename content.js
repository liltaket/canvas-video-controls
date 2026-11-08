// Canvas Video Controls
// Körs i alla frames, men aktiverar sig bara på kth.se / kaltura.com eller i
// iframes som ligger inbäddade på en kth.se-sida (t.ex. spelaren i Canvas).
(() => {
  'use strict';

  // Aktiv överallt utom på stora streamingsajter som har egna kortkommandon
  // (om de inte är inbäddade på en kth.se-sida).
  const KTH_HOST = /(^|\.)(kth\.se|kaltura\.com)$/i;
  const BLOCKED_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|netflix\.com|twitch\.tv|primevideo\.com|disneyplus\.com|hbomax\.com|max\.com|spotify\.com|svtplay\.se|svt\.se)$/i;
  const MSG = 'kth-video-controls';

  function hostOf(origin) {
    try { return new URL(origin).hostname; } catch (_) { return ''; }
  }
  const hosts = [location.hostname]
    .concat(Array.from(location.ancestorOrigins || []).map(hostOf));
  const isKth = hosts.some((h) => KTH_HOST.test(h));
  if (!isKth && hosts.some((h) => BLOCKED_HOST.test(h))) return;
  if (window.__kthVideoControls) return;
  window.__kthVideoControls = true;

  // ---------------------------------------------------------------- settings
  const SPEED_STEP = 0.25;
  const SPEED_MIN = 0.25;
  const SPEED_MAX = 4;
  const SEEK_SMALL = 5;
  const SEEK_BIG = 10;
  const VOLUME_STEP = 0.05;

  const prefs = { rate: null, hud: false };
  try {
    chrome.storage.local.get(['rate', 'showHud'], (r) => {
      if (r && typeof r.rate === 'number') prefs.rate = r.rate;
      if (r && typeof r.showHud === 'boolean') prefs.hud = r.showHud;
    });
  } catch (_) { /* storage ej tillgängligt – gå vidare utan */ }
  function savePrefs() {
    try { chrome.storage.local.set({ rate: prefs.rate, showHud: prefs.hud }); } catch (_) {}
  }

  // ------------------------------------------------------------------ helpers
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }
  function clock(date) {
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
  function fmtRate(r) {
    return String(Math.round(r * 100) / 100) + 'x';
  }

  function collectVideos(root, out, depth) {
    root.querySelectorAll('video').forEach((v) => out.push(v));
    if (depth > 6) return;
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectVideos(el.shadowRoot, out, depth + 1);
    });
  }
  let videoCache = [];
  let videoCacheAt = 0;
  function allVideos() {
    const now = Date.now();
    if (now - videoCacheAt > 700) {
      videoCache = [];
      collectVideos(document, videoCache, 0);
      videoCacheAt = now;
    }
    return videoCache;
  }

  function pickVideo() {
    let best = null;
    let bestScore = -1;
    for (const v of allVideos()) {
      const r = v.getBoundingClientRect();
      if (r.width < 100 || r.height < 60) continue;
      const score = (v.paused ? 0 : 1e9) + r.width * r.height;
      if (score > bestScore) { best = v; bestScore = score; }
    }
    if (best) return best;
    // Reserv: spelaren kan ha en liten/dold <video>. Ta den längsta med känd längd.
    let longest = 0;
    for (const v of allVideos()) {
      if (isFinite(v.duration) && v.duration > longest) { best = v; longest = v.duration; }
    }
    return best;
  }
  function boxOf(v) {
    const r = v.getBoundingClientRect();
    if (r.width >= 100 && r.height >= 60) return r;
    return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight,
             width: window.innerWidth, height: window.innerHeight };
  }

  function isTyping(e) {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    if (!(t instanceof Element)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const type = (t.type || '').toLowerCase();
      return !['range', 'checkbox', 'radio', 'button', 'submit'].includes(type);
    }
    return false;
  }

  // ---------------------------------------------------------------- overlay
  const baseStyle =
    'position:fixed;z-index:2147483647;pointer-events:none;margin:0;' +
    'font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'font-variant-numeric:tabular-nums;color:#fff;background:rgba(0,0,0,.68);' +
    'border-radius:6px;padding:4px 8px;white-space:nowrap;display:none;';
  const hudEl = document.createElement('div');
  hudEl.style.cssText = baseStyle + 'opacity:.85;';
  const toastEl = document.createElement('div');
  toastEl.style.cssText = baseStyle + 'font-size:26px;padding:8px 16px;border-radius:10px;';
  let toastTimer = 0;

  function hostFor(v) {
    const fs = document.fullscreenElement;
    if (fs && fs !== v && fs.contains(v)) return fs;
    return document.documentElement;
  }
  function mount(el, v) {
    const host = hostFor(v);
    if (el.parentNode !== host) host.appendChild(el);
  }

  function updateHud() {
    const v = pickVideo();
    if (!v || !prefs.hud || !isFinite(v.duration) || v.duration <= 0) {
      hudEl.style.display = 'none';
      return;
    }
    const rate = v.playbackRate || 1;
    const remaining = Math.max(0, (v.duration - v.currentTime) / rate);
    let text = fmtRate(rate) + ' · ' + fmt(remaining) + ' kvar';
    if (!v.paused && !v.ended) text += ' · klar ' + clock(new Date(Date.now() + remaining * 1000));
    mount(hudEl, v);
    hudEl.textContent = text;
    const r = boxOf(v);
    hudEl.style.display = 'block';
    hudEl.style.top = Math.max(0, r.top + 8) + 'px';
    hudEl.style.left = Math.max(0, r.right - hudEl.offsetWidth - 8) + 'px';
  }

  function toast(v, text) {
    mount(toastEl, v);
    toastEl.textContent = text;
    const r = boxOf(v);
    toastEl.style.display = 'block';
    toastEl.style.top = Math.max(0, r.top + r.height * 0.12) + 'px';
    toastEl.style.left = Math.max(0, r.left + r.width / 2 - toastEl.offsetWidth / 2) + 'px';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, 900);
  }


  // ---------------------------------------------------------------- actions
  function setRate(v, rate) {
    rate = Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate)) * 100) / 100;
    v.playbackRate = rate;
    prefs.rate = rate;
    savePrefs();
    toast(v, fmtRate(rate));
  }

  function run(action) {
    const v = pickVideo();
    if (!v) return false;
    switch (action.name) {
      case 'toggle':
        if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        else v.pause();
        break;
      case 'seek': {
        const max = isFinite(v.duration) ? v.duration : Infinity;
        v.currentTime = Math.min(max, Math.max(0, v.currentTime + action.by));
        toast(v, (action.by > 0 ? '+' : '−') + Math.abs(action.by) + ' s');
        break;
      }
      case 'volume':
        v.muted = false;
        v.volume = Math.min(1, Math.max(0, v.volume + action.by));
        toast(v, '🔊 ' + Math.round(v.volume * 100) + '%');
        break;
      case 'mute':
        v.muted = !v.muted;
        toast(v, v.muted ? '🔇' : '🔊 ' + Math.round(v.volume * 100) + '%');
        break;
      case 'faster': setRate(v, v.playbackRate + SPEED_STEP); break;
      case 'slower': setRate(v, v.playbackRate - SPEED_STEP); break;
      case 'reset': setRate(v, 1); break;
      case 'hud':
        prefs.hud = !prefs.hud;
        savePrefs();
        break;
      default: return false;
    }
    updateHud();
    return true;
  }

  function keyToAction(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    switch (k) {
      case ' ': case 'k': return { name: 'toggle' };
      case 'ArrowLeft': return { name: 'seek', by: -SEEK_SMALL };
      case 'ArrowRight': return { name: 'seek', by: SEEK_SMALL };
      case 'j': return { name: 'seek', by: -SEEK_BIG };
      case 'l': return { name: 'seek', by: SEEK_BIG };
      case 'ArrowUp': return { name: 'volume', by: VOLUME_STEP };
      case 'ArrowDown': return { name: 'volume', by: -VOLUME_STEP };
      case '+': case '>': case 'd': return { name: 'faster' };
      case '-': case '<': case 's': return { name: 'slower' };
      case 'r': return { name: 'reset' };
      case 'm': return { name: 'mute' };
      case 't': return { name: 'hud' };
      default: return null;
    }
  }

  // ------------------------------------------- frame-to-frame forwarding
  // Fokus kan ligga på Canvas-sidan medan videon ligger i en iframe. Frames med
  // video anmäler sig uppåt, och sidan skickar vidare tangenttryck neråt.
  const childFrames = new Map(); // Window -> senast sedd (ms)
  function liveChildren() {
    const now = Date.now();
    const out = [];
    for (const [w, seen] of childFrames) {
      if (now - seen < 6000) out.push(w); else childFrames.delete(w);
    }
    return out;
  }
  function tell(target, payload) {
    try { target.postMessage(Object.assign({ [MSG]: true }, payload), '*'); } catch (_) {}
  }
  function hello() {
    if (window.parent !== window && (pickVideo() || liveChildren().length)) {
      tell(window.parent, { type: 'hello' });
    }
  }

  function dispatch(action) {
    if (run(action)) return true;
    const kids = liveChildren();
    kids.forEach((w) => tell(w, { type: 'action', action }));
    return kids.length > 0;
  }
  function canHandle() {
    return !!pickVideo() || liveChildren().length > 0;
  }

  function onMessage(e) {
    const d = e.data;
    if (!d || d[MSG] !== true) return;
    if (d.type === 'hello' && e.source && e.source !== window) {
      childFrames.set(e.source, Date.now());
      hello();
    } else if (d.type === 'action' && e.source === window.parent && d.action) {
      dispatch(d.action);
    }
  }

  // ------------------------------------------------------------- keyboard
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isTyping(e)) return;
    const action = keyToAction(e);
    if (!action || !canHandle()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && action.name === 'toggle') return;
    dispatch(action);
  }
  // Mellanslag på en fokuserad knapp klickar först på keyup – stoppa även den.
  function onKeyUp(e) {
    if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    if (!canHandle()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  // Kaltura skriver om sitt dokument med document.open(), vilket rensar alla
  // lyssnare. Samma funktionsreferens ger ingen dubblett, så vi lägger tillbaka dem löpande.
  function bindListeners() {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', updateHud);
    window.addEventListener('scroll', updateHud, true);
    document.addEventListener('fullscreenchange', updateHud);
  }
  bindListeners();


  // ------------------------------------- spelarens egen tidsvisning (nederst)
  // Passerad tid lämnas orörd (hur långt du har tittat i videon). Totaltiden
  // till höger får ett tillägg med verklig återstående tid vid nuvarande
  // hastighet, t.ex. "1:31:06 · 1:12:53 kvar".
  const TIME_RE = /\d{1,2}(?::\d{2}){1,2}(?: · \d{1,2}(?::\d{2}){1,2} kvar)?/g;
  const tracked = new Map(); // Text-nod -> ['cur' | 'dur', ...] (en per tid i noden)
  function parseTime(str) {
    return str.split(' ')[0].split(':').reduce((a, n) => a * 60 + Number(n), 0);
  }
  function inOverlay(node) {
    return node.parentNode === hudEl || node.parentNode === toastEl;
  }
  function discover(v) {
    if (!document.body || v.duration - v.currentTime <= 3) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (tracked.has(n) || n.data.length > 60 || inOverlay(n)) continue;
      const tag = n.parentNode && n.parentNode.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      const matches = n.data.match(TIME_RE);
      if (!matches) continue;
      const roles = matches.map((m) => {
        const t = parseTime(m);
        if (Math.abs(t - v.duration) <= 1.5) return 'dur';
        if (Math.abs(t - v.currentTime) <= 1.5) return 'cur';
        return null;
      });
      if (roles.every(Boolean) && roles.includes('dur')) tracked.set(n, roles);
    }
  }
  // Kalturas hastighetsknapp ("1.25x") vet inte om att vi sätter playbackRate
  // direkt. Skriv rätt värde i den, men bara om exakt en synlig "Nx"-text finns
  // (flera synliga = menyn är öppen, då rör vi inget).
  const SPEED_RE = /^\s*\d+(?:\.\d+)?\s*[x×]\s*$/i;
  function fixSpeedLabel(rate) {
    if (!document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const visible = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.data.length > 12 || !SPEED_RE.test(n.data) || inOverlay(n)) continue;
      const el = n.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      visible.push(n);
    }
    if (visible.length !== 1) return;
    const want = fmtRate(rate);
    if (visible[0].data.trim() !== want) visible[0].data = visible[0].data.replace(/\d+(?:\.\d+)?\s*[x×]/i, want);
  }

  let applying = false;
  function applyNative() {
    const v = pickVideo();
    if (!v || !isFinite(v.duration) || v.duration <= 0) return;
    const rate = v.playbackRate || 1;
    const remaining = Math.max(0, (v.duration - v.currentTime) / rate);
    const total = fmt(v.duration) + ' · ' + fmt(remaining) + ' kvar';
    discover(v);
    applying = true;
    fixSpeedLabel(rate);
    for (const [node, roles] of tracked) {
      if (!node.isConnected) { tracked.delete(node); continue; }
      const found = node.data.match(TIME_RE);
      if (!found || found.length !== roles.length) { tracked.delete(node); continue; }
      let i = 0;
      const next = node.data.replace(TIME_RE, (m) => (roles[i++] === 'dur' ? total : m));
      if (next !== node.data) node.data = next;
    }
    applying = false;
  }
  let nativeQueued = false;
  function queueNative() {
    if (nativeQueued || applying) return;
    nativeQueued = true;
    queueMicrotask(() => { nativeQueued = false; applyNative(); });
  }
  let observedBody = null;
  function watchDom() {
    if (!document.body || document.body === observedBody) return;
    observedBody = document.body;
    new MutationObserver(queueNative).observe(document.body, {
      subtree: true, characterData: true, childList: true,
    });
  }

  // ------------------------------------------------------- video tracking
  const seen = new WeakSet();
  function attach(v) {
    if (seen.has(v)) return;
    seen.add(v);
    let applied = false;
    v.addEventListener('ratechange', () => {
      if (applied && v.playbackRate > 0 && prefs.rate !== v.playbackRate) {
        prefs.rate = v.playbackRate;
        savePrefs();
      }
    });
    const refresh = () => { updateHud(); applyNative(); };
    ['timeupdate', 'ratechange', 'durationchange', 'play', 'pause', 'seeked', 'loadedmetadata']
      .forEach((ev) => v.addEventListener(ev, refresh));
    // Använd senast valda hastighet en gång när en ny video börjar spelas.
    v.addEventListener('playing', () => {
      if (applied) return;
      applied = true;
      if (typeof prefs.rate === 'number' && v.playbackRate !== prefs.rate) {
        v.playbackRate = prefs.rate;
      }
    });
  }

  let tick = 0;
  setInterval(() => {
    allVideos().forEach(attach);
    updateHud();
    applyNative();
    watchDom();
    bindListeners();
    if (tick++ % 8 === 0) hello();
  }, 250);
})();
