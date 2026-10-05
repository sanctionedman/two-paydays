/* ===== Core: formatting, storage, shared state, writes ===== */
const { html, render, useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } = htmPreact;
const E = ENGINE;

/* ---------- formatting ---------- */
const _gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
function money(v, opt = {}) {
  const n = +v || 0;
  const whole = opt.whole || (opt.auto && Math.abs(n) >= 1000);
  const s = (whole ? _gbp0 : _gbp2).format(Math.abs(n));
  if (n < -0.004) return '−' + s;
  if (opt.sign && n > 0.004) return '+' + s;
  return s;
}
const rupees = v => 'Rs ' + Math.round(+v || 0).toLocaleString('en-GB');
const pct = (v, dp = 0) => ((+v || 0) * 100).toFixed(dp) + '%';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthLabel(key, short) { const [y, m] = key.split('-').map(Number); return (short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]) + ' ' + y; }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayLabel(dstr, opts) {
  if (!dstr) return '';
  const [y, m, d] = String(dstr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const o = Object.assign({ weekday: 'short', day: 'numeric', month: 'short' }, opts || {});
  const parts = [];
  if (o.weekday) parts.push(WD[new Date(y, m - 1, d, 12).getDay()]);
  if (o.day) parts.push(String(d));
  if (o.month) parts.push(MONTHS[m - 1].slice(0, 3));
  if (o.year) parts.push(String(y));
  return parts.join(' ');
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${E.pad(d.getMonth() + 1)}-${E.pad(d.getDate())}`; }
const thisMonth = () => todayStr().slice(0, 7);
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
function nest(path, value) { return path.reduceRight((acc, k) => ({ [k]: acc }), value); }
function parseMoney(s) { const n = E.num(String(s).replace(/^£/, '')); return n == null ? null : Math.round(n * 100) / 100; }
const cls = (...a) => a.filter(Boolean).join(' ');

/* ---------- local storage (per-viewer conveniences only) ---------- */
const pref = {
  get(k, d) { try { const v = localStorage.getItem('tp:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tp:' + k, JSON.stringify(v)); } catch (e) { } },
};

/* ---------- a device-only store with the same shape as the shared one ---------- */
function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = Object.assign({}, (a && typeof a === 'object' && !Array.isArray(a)) ? a : {});
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
  return out;
}
function LocalDB() {
  const KEY = 'tp:localdb';
  let docs = {};
  try { docs = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { docs = {}; }
  const subs = new Set();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) { } };
  const snapDoc = path => ({ id: path.split('/').pop(), exists: Object.prototype.hasOwnProperty.call(docs, path), data: () => (docs[path] ? clone(docs[path]) : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  const snapCol = path => {
    const pre = path + '/';
    const ds = Object.keys(docs).filter(p => p.startsWith(pre) && !p.slice(pre.length).includes('/')).sort().map(snapDoc);
    return { docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  let pending = false;
  const notify = () => { if (pending) return; pending = true; Promise.resolve().then(() => { pending = false; subs.forEach(s => s.fn(s.kind === 'doc' ? snapDoc(s.path) : snapCol(s.path))); }); };
  const docRef = path => ({
    id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    set: async d => { docs[path] = clone(d); persist(); notify(); },
    update: async d => { if (!Object.prototype.hasOwnProperty.call(docs, path)) throw { code: 'invalid_argument', message: 'Document does not exist' }; docs[path] = deepMerge(docs[path], clone(d)); persist(); notify(); },
    delete: async () => { delete docs[path]; persist(); notify(); },
    onSnapshot: (fn) => { const s = { kind: 'doc', path, fn }; subs.add(s); setTimeout(() => fn(snapDoc(path))); return () => subs.delete(s); },
    collection: sub => colRef(path + '/' + sub),
  });
  const colRef = path => ({
    path,
    doc: id => docRef(path + '/' + (id || uid())),
    add: async d => { const r = docRef(path + '/' + uid()); await r.set(d); return r; },
    get: async () => snapCol(path),
    onSnapshot: (fn) => { const s = { kind: 'col', path, fn }; subs.add(s); setTimeout(() => fn(snapCol(path))); return () => subs.delete(s); },
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
  });
  window.addEventListener('storage', e => { if (e.key === KEY) { try { docs = JSON.parse(e.newValue || '{}') || {}; } catch (x) { } notify(); } });
  return { doc: docRef, collection: colRef, local: true };
}

/* ---------- shared state ---------- */
// Mac app build: the page sets window.TP_APP before this script (version, update hooks). Data then lives in this
// app on this computer only.
const APP = (typeof window !== 'undefined' && window.TP_APP) || null;
const S = {
  update: null,
  phase: 'connecting', mode: null, plan: undefined, months: {}, checklist: undefined,
  viewerId: null, viewer: null, canWrite: null, readOnly: false, me: pref.get('me', null),
  profiles: {}, sample: null, downloads: null, user: null,
  page: pref.get('page', 'overview'), monthKey: null, toasts: [], modal: null, lastError: null,
};
const listeners = new Set();
let emitQueued = false;
// Re-render on the next frame, with a timer as a fallback: a window the system is throttling (hidden, minimised, or
// still settling after a reload) may hold back animation frames, and the screen must never get stuck.
let storeVersion = 0;
function flushEmit() { if (!emitQueued) return; emitQueued = false; storeVersion++; listeners.forEach(f => f()); }
function emit() { if (emitQueued) return; emitQueued = true; try { requestAnimationFrame(flushEmit); } catch (e) { } setTimeout(flushEmit, 80); }
function emitNow() { storeVersion++; listeners.forEach(f => f()); }
function useStore() {
  const [, set] = useState(0);
  const seen = useRef(storeVersion);
  seen.current = storeVersion;
  // if the data changed between this render and subscribing (fast local loads), catch up straight away
  useEffect(() => { const f = () => set(x => x + 1); listeners.add(f); if (storeVersion !== seen.current) f(); return () => listeners.delete(f); }, []);
  return S;
}
function go(page) { S.page = page; pref.set('page', page); S.modal = null; emit(); try { window.scrollTo({ top: 0 }); } catch (e) { } }
function setMonth(key) { S.monthKey = key; emit(); }

/* ---------- derived model cache ---------- */
const _models = new Map();
let _mFor = { plan: null, months: null };
function model(key) {
  key = key || S.monthKey;
  if (_mFor.plan !== S.plan || _mFor.months !== S.months) { _models.clear(); _mFor = { plan: S.plan, months: S.months }; }
  if (!_models.has(key)) _models.set(key, E.computeMonth(S.plan, S.months, key));
  return _models.get(key);
}
let _proj = { plan: null, months: null, key: null, v: null };
function projection() {
  const from = thisMonth();
  if (_proj.plan !== S.plan || _proj.months !== S.months || _proj.key !== from) _proj = { plan: S.plan, months: S.months, key: from, v: E.project(S.plan, S.months, from, 72) };
  return _proj.v;
}

/* ---------- writes ---------- */
let DB = null;
const queues = {};
function enqueue(path, op) {
  const p = (queues[path] || Promise.resolve()).then(op, op);
  queues[path] = p.catch(() => { });
  return p;
}
function onWriteError(e) {
  const code = e && e.code;
  if (code === 'invalid_argument' && S.canWrite !== true) S.readOnly = true;
  if (code === 'quota_exceeded') toast('The shared storage is full. Delete old transactions or months to make room.');
  else if (code === 'revoked') { S.readOnly = true; toast('Your access to this planner changed. Reload to see the latest.'); }
  else if (code === 'invalid_argument') toast("That change wasn't saved. You may only have view access: ask the owner to invite you by email as an Editor.");
  else toast("That change wasn't saved. Check your connection and try again.");
  S.lastError = code || 'error';
  emit();
  return false;
}
function writeDoc(path, patch, create) {
  if (S.readOnly) { toast('You can view this planner but not change it.'); return Promise.resolve(false); }
  return enqueue(path, async () => {
    const ref = DB.doc(path);
    try { await ref.update(patch); }
    catch (e) {
      if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 400 + Math.random() * 600)); await ref.update(patch); return true; }
      if (e && e.code === 'invalid_argument' && create) { await ref.set(create(patch)); return true; }
      throw e;
    }
    return true;
  }).catch(onWriteError);
}
const API = {
  plan: patch => writeDoc('config/plan', patch),
  month: (key, patch) => writeDoc('months/' + key, patch, p => deepMerge({ key }, p)),
  checklist: patch => writeDoc('config/checklist', patch, p => deepMerge({ items: {} }, p)),
  setDoc: (path, data) => enqueue(path, () => DB.doc(path).set(data)).then(() => true, onWriteError),
};

/* ---------- toasts ---------- */
function toast(msg, action, ms = 5200) {
  const id = uid('t');
  S.toasts = S.toasts.concat([{ id, msg, action }]).slice(-3);
  emit();
  setTimeout(() => { S.toasts = S.toasts.filter(t => t.id !== id); emit(); }, ms);
}
function closeToast(id) { S.toasts = S.toasts.filter(t => t.id !== id); emit(); }

/* ---------- tooltip (one for the whole page) ---------- */
const Tip = {
  el: null,
  show(evt, title, rows) {
    const el = this.el || (this.el = document.getElementById('tip'));
    if (!el) return;
    el.textContent = '';
    if (title) { const t = document.createElement('div'); t.className = 'muted tiny'; t.textContent = title; el.appendChild(t); }
    (rows || []).forEach(r => {
      const d = document.createElement('div'); d.className = 'tr';
      if (r.color) { const i = document.createElement('i'); i.style.background = r.color; d.appendChild(i); }
      const v = document.createElement('span'); v.className = 'tv'; v.textContent = r.value; d.appendChild(v);
      if (r.label) { const l = document.createElement('span'); l.className = 'muted'; l.textContent = r.label; d.appendChild(l); }
      el.appendChild(d);
    });
    this.move(evt);
    el.classList.add('on');
  },
  move(evt) {
    const el = this.el; if (!el) return;
    let x = 0, y = 0;
    if (evt && evt.clientX != null) { x = evt.clientX; y = evt.clientY; }
    else if (evt && evt.target && evt.target.getBoundingClientRect) { const r = evt.target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    const w = el.offsetWidth || 160, h = el.offsetHeight || 50;
    let left = x + 14, top = y - h - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    el.style.left = Math.max(8, left) + 'px'; el.style.top = top + 'px';
  },
  hide() { if (this.el) this.el.classList.remove('on'); },
};

/* ---------- icons ---------- */
const ICON = {
  overview: 'M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 11h8V3h-8z',
  payday: 'M2 7h20v12H2zM2 11h20M6 15h4',
  spending: 'M4 6h16M4 12h16M4 18h10',
  pots: 'M7 4h10M8 4v3a6 6 0 0 0-3 5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a6 6 0 0 0-3-5V4',
  review: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6',
  travel: 'M10.5 13.5 3 11l1.5-1.5 7 1 4-4a2 2 0 0 1 3 3l-4 4 1 7L20 22l-2.5-7.5-3 3V21l-1.5 1-1-3.5L8.5 17.5 5 16.5l1-1.5h3z',
  srilanka: 'M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  future: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plan: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 16v-4M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  bill: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
};
function Icon({ name, size }) {
  const d = ICON[name] || ICON.info;
  return html`<svg viewBox="0 0 24 24" width=${size || 18} height=${size || 18} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d} /></svg>`;
}

/* ---------- people ---------- */
const PCOLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s7)'];
function memberColor(id) { const ms = E.members(S.plan || {}); const i = ms.findIndex(m => m.id === id); return id === 'joint' ? 'var(--accent)' : PCOLORS[(i < 0 ? 0 : i) % PCOLORS.length]; }
// shared pools (joint account, grocery pot, ...)
function poolList() { return S.plan ? E.pools(S.plan) : []; }
function poolOf(id) { return poolList().find(p => p.id === id) || null; }
function poolShort(p) { return p ? (p.short || String(p.name).replace(/\s*\(.*\)\s*$/, '')) : ''; }
function payerLabel(payer, opts) { const p = poolOf(payer); return p ? poolShort(p) : memberName(payer, opts); }
function roleLabel(role) { const c = S.plan ? E.categories(S.plan).find(c => c.role === role) : null; return c ? String(c.name).replace(/^.*?'s\s+/, '').toLowerCase() : role; }
const capFirst = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
function methodText(method) { return method === 'remainder' ? 'one person pays what is left after their own commitments, the other covers the rest' : method === 'equal' ? 'half each' : method === 'fixed' ? 'fixed amounts' : 'in proportion to pay'; }
function memberName(id, opts = {}) {
  if (id === 'joint') return poolList().length > 1 ? 'Shared account' : 'Joint account';
  const m = S.plan && S.plan.members && S.plan.members[id];
  if (!m) return 'Someone';
  if (opts.you && S.me === id) return 'You';
  return m.label || 'Someone';
}
function possessive(id) { const n = memberName(id, { you: true }); return n === 'You' ? 'Your' : n + "'s"; }
function Avatar({ id, size }) {
  const m = S.plan && S.plan.members && S.plan.members[id];
  const p = m && m.userId && S.profiles[m.userId];
  const label = memberName(id);
  const letter = (label || '?').trim().charAt(0).toUpperCase();
  return html`<span class=${cls('avatar', size === 'sm' && 'sm')} style=${{ background: memberColor(id) }} title=${label}>${p && p.avatarUrl && p.name ? html`<img src=${p.avatarUrl} alt="" />` : letter}</span>`;
}

/* ---------- Mac app helpers ---------- */
// Save a file to the Downloads folder (the Mac app can do this directly).
function saveFileLocally(filename, data, type) {
  const blob = new Blob([data], { type: type || (filename.endsWith('.json') ? 'application/json' : 'text/plain') });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function backupData() { return JSON.stringify({ app: 'two-paydays', exportedAt: new Date().toISOString(), plan: S.plan, checklist: S.checklist, months: S.months }, null, 1); }
function daysSince(iso) { if (!iso) return Infinity; return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
// A copy of all data kept inside the app before each update (the last three), in case an update goes wrong.
function snapshotNow(reason) {
  try {
    const list = pref.get('snapshots', []);
    const raw = localStorage.getItem('tp:localdb');
    if (!raw) return;
    list.unshift({ at: new Date().toISOString(), reason: reason || '', version: APP ? APP.version : '', data: raw });
    pref.set('snapshots', list.slice(0, 3));
  } catch (e) { }
}
