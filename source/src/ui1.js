/* ===== UI part 1: shared widgets, shell, overview, payday ===== */

/* ---------- small widgets ---------- */
function EditMoney({ value, onCommit, overridden, title, allowEmpty, placeholder, cls: extra }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  const ref = useRef(null);
  const closed = useRef(false);
  useEffect(() => { if (edit && ref.current) { ref.current.focus(); ref.current.select(); } }, [edit]);
  if (!edit) {
    return html`<button type="button" class=${cls('editable amt', overridden && 'overridden', extra)} title=${title || 'Change amount'}
      onClick=${() => { closed.current = false; setV(value == null ? '' : String(E.r2(value))); setEdit(true); }}>${value == null ? html`<span class="muted">${placeholder || 'Add'}</span>` : money(value)}</button>`;
  }
  const finish = commit => {
    if (closed.current) return; closed.current = true; setEdit(false);
    if (!commit) return;
    if (v.trim() === '') { if (allowEmpty && value != null) onCommit(null); return; }
    const n = parseMoney(v);
    if (n == null) { toast('Type an amount like 12.50'); return; }
    if (value == null || Math.abs(n - value) > 0.004) onCommit(n);
  };
  return html`<input ref=${ref} class="inline" inputmode="decimal" value=${v} aria-label=${title || 'Amount'}
    onInput=${e => setV(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }} onBlur=${() => finish(true)} />`;
}
function EditText({ value, onCommit, placeholder, title, strong }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  const ref = useRef(null);
  const closed = useRef(false);
  useEffect(() => { if (edit && ref.current) { ref.current.focus(); ref.current.select(); } }, [edit]);
  if (!edit) return html`<button type="button" class=${cls('editable', strong && 'strong')} style=${{ textAlign: 'left' }} title=${title || 'Edit'} onClick=${() => { closed.current = false; setV(value || ''); setEdit(true); }}>${value || html`<span class="muted">${placeholder || 'Add'}</span>`}</button>`;
  const finish = commit => { if (closed.current) return; closed.current = true; setEdit(false); if (commit && v.trim() !== (value || '')) onCommit(v.trim()); };
  return html`<input ref=${ref} class="inline wide" value=${v} aria-label=${title || 'Text'} onInput=${e => setV(e.target.value)}
    onKeyDown=${e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }} onBlur=${() => finish(true)} />`;
}
function Check({ checked, onToggle, label, disabled }) {
  return html`<button type="button" class="check" role="checkbox" aria-checked=${checked ? 'true' : 'false'} aria-label=${label} disabled=${disabled}
    onClick=${disabled ? null : onToggle} style=${disabled ? { cursor: 'default' } : null}>${checked && html`<${Icon} name="check" size=${14} />`}</button>`;
}
function Panel({ title, sub, actions, children, cls: extra, id }) {
  return html`<section class=${cls('panel', extra)} id=${id}>
    ${(title || actions) && html`<div class="panel-head"><div>${title && html`<h2>${title}</h2>`}${sub && html`<p>${sub}</p>`}</div>${actions && html`<div class="row">${actions}</div>`}</div>`}
    ${children}
  </section>`;
}
function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="group" aria-label=${label}>${options.map(o => html`<button type="button" aria-pressed=${String(value === o.value)} onClick=${() => onChange(o.value)}>${o.label}</button>`)}</div>`;
}
function Modal({ title, onClose, wide, children, foot }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  return html`<div class="overlay" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${cls('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="modal-head"><h2>${title}</h2><button class="iconbtn" aria-label="Close" onClick=${onClose}><${Icon} name="x" /></button></div>
      ${children}
      ${foot && html`<div class="modal-foot">${foot}</div>`}
    </div>
  </div>`;
}
function openModal(type, props) { S.modal = { type, props: props || {} }; emit(); }
function closeModal() { S.modal = null; emit(); }

/* category options, including pots, debts and transfers */
function categoryOptions(plan, opts = {}) {
  const groups = [];
  const cats = E.categories(plan);
  const gnames = [];
  cats.forEach(c => { const g = c.group || 'Other'; if (!gnames.includes(g)) gnames.push(g); });
  const order = plan.groups || [];
  gnames.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  gnames.forEach(g => groups.push({ label: g, items: cats.filter(c => (c.group || 'Other') === g).map(c => ({ value: c.id, label: c.name })) }));
  const ps = E.pots(plan);
  groups.push({ label: 'Into a savings pot', items: ps.map(p => ({ value: 'pot:' + p.id + ':in', label: 'Into ' + p.name })) });
  groups.push({ label: 'Paid from a savings pot', items: ps.map(p => ({ value: 'pot:' + p.id + ':out', label: 'From ' + p.name })) });
  const ds = E.debts(plan);
  if (ds.length) groups.push({ label: 'Paying off debt', items: ds.map(d => ({ value: 'debt:' + d.id, label: 'Repay ' + d.name })) });
  const xfers = E.pools(plan).map(p => ({ value: 'xfer:' + p.id, label: 'Transfer to ' + (p.id === 'joint' ? 'joint account' : poolShort(p).toLowerCase()) }));
  groups.push({ label: 'Not spending', items: [...xfers, { value: 'xfer:own', label: 'Move between own accounts' }, { value: 'income', label: 'Money in / refund' }] });
  return groups;
}
function categoryName(plan, id) {
  if (!id) return 'Uncategorised';
  const p = E.parseCat(id);
  if (p.type === 'cat') return (plan.categories && plan.categories[id] && plan.categories[id].name) || 'Unknown category';
  if (p.type === 'potIn') return 'Into ' + ((plan.pots[p.pot] || {}).name || 'pot');
  if (p.type === 'potOut') return 'From ' + ((plan.pots[p.pot] || {}).name || 'pot');
  if (p.type === 'debt') return 'Repay ' + ((plan.debts[p.debt] || {}).name || 'debt');
  if (id === 'xfer:own') return 'Between own accounts';
  if (p.type === 'xferJoint') { const pl = E.poolMap(plan)[p.pool]; return 'Transfer to ' + (!pl || pl.id === 'joint' ? 'joint account' : poolShort(pl).toLowerCase()); }
  if (id === 'income') return 'Money in / refund';
  return id;
}
function CatSelect({ value, onChange, id, label, emptyLabel }) {
  const groups = categoryOptions(S.plan);
  return html`<select class="field" id=${id} aria-label=${label || 'Category'} value=${value || ''} onChange=${e => onChange(e.target.value)}>
    <option value="">${emptyLabel || 'Choose a category…'}</option>
    ${groups.map(g => html`<optgroup label=${g.label}>${g.items.map(i => html`<option value=${i.value}>${i.label}</option>`)}</optgroup>`)}
  </select>`;
}
function MemberSelect({ value, onChange, id, includeJoint }) {
  const ms = E.members(S.plan);
  return html`<select class="field" id=${id} aria-label="Who paid" value=${value || ''} onChange=${e => onChange(e.target.value)}>
    ${ms.map(m => html`<option value=${m.id}>${memberName(m.id)}${S.me === m.id ? ' (you)' : ''}</option>`)}
    ${includeJoint && html`<option value="joint">${memberName('joint')}</option>`}
  </select>`;
}
function AccountSelect({ value, onChange, id, filter }) {
  const as = E.accounts(S.plan).filter(a => !filter || filter(a));
  return html`<select class="field" id=${id} aria-label="Account" value=${value || ''} onChange=${e => onChange(e.target.value)}>
    <option value="">Not set</option>
    ${as.map(a => html`<option value=${a.id}>${a.name}</option>`)}
  </select>`;
}
function PotSelect({ value, onChange, id, includeNone, noneLabel }) {
  return html`<select class="field" id=${id} aria-label="Pot" value=${value || ''} onChange=${e => onChange(e.target.value)}>
    ${includeNone && html`<option value="">${noneLabel || 'None'}</option>`}
    ${E.pots(S.plan).map(p => html`<option value=${p.id}>${p.name}</option>`)}
  </select>`;
}

/* ---------- attention list (used by overview and nav badges) ---------- */
function attentionItems(M) {
  const out = [];
  const key = M.key, td = todayStr();
  for (const mem of M.members) {
    const r = M.res[mem.id];
    const open = r.lines.filter(l => l.transfer && l.left > 0.005 && !(l.kind === 'buffer' && !l.pot));
    if (open.length) {
      const due = E.transferDate(mem, key);
      const amt = E.sum(open, l => l.left);
      out.push({ id: 'xfer-' + mem.id, tone: due < td && key <= thisMonth() ? 'warn' : 'info', text: `${memberName(mem.id, { you: true })}: ${money(amt)} to move across ${open.length} transfer${open.length > 1 ? 's' : ''}`, sub: (due < td ? 'Due since ' : 'Due ') + dayLabel(due), go: 'payday' });
    }
    if (r.short > 0.005) out.push({ id: 'short-' + mem.id, tone: 'crit', text: `${memberName(mem.id, { you: true })} is ${money(r.short)} short this month`, sub: 'Lower some lines on Payday', go: 'payday' });
  }
  for (const pv of (M.pools || [])) if (pv.deficit > 0.005) out.push({ id: 'pool-' + pv.id, tone: 'crit', text: `${poolShort(pv)} is ${money(pv.deficit)} short`, sub: 'Nobody is covering part of it this month', go: 'payday' });
  if (M.uncategorised.length) out.push({ id: 'uncat', tone: 'warn', text: `${M.uncategorised.length} transaction${M.uncategorised.length > 1 ? 's need' : ' needs'} a category`, go: 'spending' });
  const noAcc = M.txns.filter(t => !t.account && t.category !== 'income');
  if (noAcc.length) out.push({ id: 'noacc', tone: 'info', text: `${noAcc.length} transaction${noAcc.length > 1 ? 's have' : ' has'} no card or account set`, sub: noAcc[0].desc, go: 'spending' });
  for (const c of M.totals.overspent) out.push({ id: 'over-' + c.id, tone: 'crit', text: `${c.name} is ${money(c.spent - c.budget)} over budget`, sub: 'Cover it from another budget', go: 'spending' });
  const unlogged = M.cats.filter(c => c.kind === 'bill' && c.budget > 0 && c.count === 0);
  if (unlogged.length && key <= thisMonth()) out.push({ id: 'bills', tone: 'info', text: `${unlogged.length} regular bill${unlogged.length > 1 ? 's' : ''} not logged yet`, sub: 'Log them in one go on Spending', go: 'spending' });
  const L = M.ledger;
  for (const d of E.debts(S.plan)) {
    const b = L.debtEnd[d.id];
    if (b == null) out.push({ id: 'debt-' + d.id, tone: 'info', text: `Add the balance left on “${d.name}”`, go: 'pots' });
    else if (b > 0.005 && d.payInFull) out.push({ id: 'debt-' + d.id, tone: 'warn', text: `Clear ${money(b)} on the ${d.name} in full`, sub: 'Pay the whole statement balance so no interest is charged', go: 'pots' });
  }
  return out;
}

/* ---------- shell ---------- */
const NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'payday', label: 'Payday', icon: 'payday' },
  { id: 'spending', label: 'Spending', icon: 'spending' },
  { id: 'pots', label: 'Pots & debts', icon: 'pots' },
  { id: 'review', label: 'Month review', icon: 'review' },
  { id: 'travel', label: 'Travel', icon: 'travel', more: true },
  { id: 'srilanka', label: 'Sri Lanka', icon: 'srilanka', more: true },
  { id: 'future', label: 'Big plans', icon: 'future', more: true },
  { id: 'plan', label: 'Plan & settings', icon: 'plan', more: true },
];
const PAGE_TITLES = { overview: 'Overview', payday: 'Payday', spending: 'Spending', pots: 'Pots & debts', review: 'Month review', travel: 'Travel', srilanka: 'Sri Lanka', future: 'Big plans', plan: 'Plan & settings' };

function BrandMark() {
  return html`<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="11" fill="var(--accent)" />
    <path d="M11 27 V17 a4 4 0 0 1 8 0 V27" fill="none" stroke="var(--accent-ink)" stroke-width="3" stroke-linecap="round" />
    <path d="M21 27 V13 a4 4 0 0 1 8 0 V27" fill="none" stroke="var(--accent-ink)" stroke-width="3" stroke-linecap="round" opacity="0.75" />
    <path d="M9 30.5 H31" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round" />
  </svg>`;
}
function Rail() {
  const M = model();
  const att = attentionItems(M);
  const badge = id => { if (id === 'spending') return M.uncategorised.length + M.totals.overspent.length; if (id === 'payday') return att.filter(a => a.id.startsWith('xfer') || a.id.startsWith('short')).length; return 0; };
  const rate = E.fx(S.plan, 'LKR');
  return html`<aside class="rail">
    <div class="brand"><${BrandMark} /><div><div class="brand-name">Two Paydays</div><div class="brand-sub">Household money plan</div></div></div>
    <nav class="nav" aria-label="Sections">
      ${NAV.filter(n => !n.more).map(n => html`<button aria-current=${S.page === n.id ? 'page' : null} onClick=${() => go(n.id)}><${Icon} name=${n.icon} />${n.label}${badge(n.id) > 0 && html`<span class="count">${badge(n.id)}</span>`}</button>`)}
      <div class="nav-label">Plans</div>
      ${NAV.filter(n => n.more).map(n => html`<button aria-current=${S.page === n.id ? 'page' : null} onClick=${() => go(n.id)}><${Icon} name=${n.icon} />${n.label}</button>`)}
    </nav>
    <div class="rail-foot">
      <div class="rate-chip" title="Change on the Sri Lanka page"><span>£1 = ${rupees(rate)}</span><span class="tiny">LKR</span></div>
      <${SyncLine} />
      <${WhoLine} />
      <div class="tiny"><span class="kbd">N</span> add spending · <span class="kbd">[</span> <span class="kbd">]</span> change month</div>
    </div>
  </aside>`;
}
function SyncLine() {
  if (S.mode === 'shared') return html`<div class="sync"><span class=${cls('dot', S.readOnly && 'off')}></span>${S.readOnly ? 'View only' : 'Saved and shared'}</div>`;
  if (APP) return html`<div class="sync" title="Your data stays in this app on this Mac"><span class="dot"></span>Saved on this Mac</div>`;
  return html`<div class="sync" title="Open it from claude.ai while signed in to share it"><span class="dot local"></span>Saved on this device only</div>`;
}
function WhoLine() {
  const me = S.me;
  if (!me) return html`<div class="who muted">Not linked to a person yet</div>`;
  return html`<div class="who"><${Avatar} id=${me} size="sm" /><span>You're ${memberName(me)}</span><button class="btn ghost sm" onClick=${() => unlinkMe()}>Not you?</button></div>`;
}
function TabBar() {
  const [open, setOpen] = useState(false);
  const isMore = NAV.find(n => n.id === S.page && n.more);
  // The sheet is a sibling of the bar, not inside it: the bar's backdrop blur would otherwise trap the
  // fixed-position sheet inside the bar's own box and push its lower items off the bottom of the screen.
  return html`<nav class="tabbar" aria-label="Sections">
    ${NAV.filter(n => !n.more && n.id !== 'review').map(n => html`<button aria-current=${S.page === n.id ? 'page' : null} onClick=${() => go(n.id)}><${Icon} name=${n.icon} /><span>${n.label.split(' ')[0]}</span></button>`)}
    <button aria-current=${(isMore || S.page === 'review') ? 'page' : null} aria-haspopup="dialog" aria-expanded=${open} onClick=${() => setOpen(true)}><${Icon} name="more" /><span>More</span></button>
  </nav>
  ${open && html`<${MoreSheet} onClose=${() => setOpen(false)} />`}`;
}
function MoreSheet({ onClose }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, []);
  const pick = id => { onClose(); go(id); };
  return html`<div class="sheet-overlay" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="More">
      <div class="sheet-grab" aria-hidden="true"></div>
      <div class="sheet-head"><h2>More</h2><button class="iconbtn" aria-label="Close" onClick=${onClose}><${Icon} name="x" /></button></div>
      <div class="sheet-list">${NAV.filter(n => n.more || n.id === 'review').map(n => html`<button class="sheet-item" aria-current=${S.page === n.id ? 'page' : null} onClick=${() => pick(n.id)}>
        <${Icon} name=${n.icon} /><span class="grow">${n.label}</span><${Icon} name="right" size=${16} /></button>`)}</div>
      <div class="sheet-foot"><${SyncLine} /><${WhoLine} /></div>
    </div>
  </div>`;
}
function MonthSwitch() {
  const key = S.monthKey;
  const isNow = key === thisMonth();
  return html`<div class="row" style=${{ gap: '8px' }}>
    <div class="monthsw" role="group" aria-label="Month">
      <button aria-label="Previous month" onClick=${() => setMonth(E.addMonths(key, -1))}><${Icon} name="left" /></button>
      <span class="label" aria-live="polite">${monthLabel(key)}</span>
      <button aria-label="Next month" onClick=${() => setMonth(E.addMonths(key, 1))}><${Icon} name="right" /></button>
    </div>
    ${!isNow && html`<button class="btn sm" onClick=${() => setMonth(thisMonth())}>This month</button>`}
  </div>`;
}
function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 4); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  const showMonth = !['plan', 'future', 'srilanka', 'travel'].includes(S.page);
  return html`<header class=${cls('topbar', scrolled && 'scrolled')}>
    <div style=${{ marginRight: 'auto', minWidth: 0 }}>
      <div class="eyebrow">${showMonth ? (S.monthKey === thisMonth() ? 'This month' : S.monthKey < thisMonth() ? 'Past month' : 'Coming up') : 'Two Paydays'}</div>
      <h1>${PAGE_TITLES[S.page] || 'Overview'}</h1>
    </div>
    ${showMonth && html`<${MonthSwitch} />`}
    <button class="btn primary" onClick=${() => openModal('add')} disabled=${S.readOnly}><${Icon} name="plus" />Add spending</button>
    ${S.page !== 'plan' && html`<button class="iconbtn only-narrow" aria-label="Plan & settings" title="Plan & settings" onClick=${() => go('plan')}><${Icon} name="plan" /></button>`}
  </header>`;
}
function Toasts() {
  return html`<div class="toasts" aria-live="polite">${S.toasts.map(t => html`<div class="toast"><span class="grow">${t.msg}</span>
    ${t.action && html`<button onClick=${() => { closeToast(t.id); t.action.fn(); }}>${t.action.label}</button>`}
    <button aria-label="Dismiss" onClick=${() => closeToast(t.id)}><${Icon} name="x" size=${14} /></button></div>`)}</div>`;
}
function Banners() {
  const out = [];
  if (S.mode === 'shared' && S.viewerId && !S.me && S.plan) {
    const ms = E.members(S.plan);
    const free = ms.filter(m => !m.userId);
    if (free.length) out.push(html`<div class="banner accent"><${Icon} name="user" /><div class="grow"><b>Which of you is this?</b> Linking your account means what you add is filed under you, and the planner opens on your payday.</div>
      <div class="row">${free.map(m => html`<button class="btn sm primary" onClick=${() => linkMe(m.id)}>I'm ${memberName(m.id)}</button>`)}</div></div>`);
  }
  if (APP && S.plan && S.mode === 'device') {
    const last = pref.get('lastBackup', null);
    const snoozed = daysSince(pref.get('backupSnooze', null)) < 7;
    if (daysSince(last) > 30 && !snoozed) out.push(html`<div class="banner"><${Icon} name="download" /><div class="grow">Your planner is saved only on this Mac. ${last ? 'Your last backup was ' + dayLabel(last.slice(0, 10)) + '.' : "You haven't made a backup yet."} Keep a copy somewhere safe, such as iCloud Drive.</div><div class="row"><button class="btn sm primary" onClick=${backupNow}>Back up now</button><button class="btn sm ghost" onClick=${() => { pref.set('backupSnooze', new Date().toISOString()); emit(); }}>Later</button></div></div>`);
  }
  if (!APP && S.mode === 'device' && S.plan && !pref.get('seenLocal', false)) out.push(html`<div class="banner warn"><${Icon} name="info" /><div class="grow">This copy saves on this device only. Open the planner from claude.ai while signed in to see and share your household's data.</div><button class="btn sm" onClick=${() => { pref.set('seenLocal', true); emit(); }}>Got it</button></div>`);
  if (S.mode === 'device' && S.plan && !S.me) {
    const ms = E.members(S.plan);
    out.push(html`<div class="banner accent"><${Icon} name="user" /><div class="grow"><b>Who is using this device?</b></div><div class="row">${ms.map(m => html`<button class="btn sm primary" onClick=${() => linkMe(m.id)}>${memberName(m.id)}</button>`)}</div></div>`);
  }
  if (S.readOnly) out.push(html`<div class="banner"><${Icon} name="lock" /><div class="grow">You can view this planner but not change it. To make changes, ask the owner to invite you by email as an Editor.</div></div>`);
  return out.length ? html`<div class="stack">${out}</div>` : null;
}
function UpdateBar() {
  if (!S.update) return null;
  return html`<div class="banner accent update-bar" role="status"><${Icon} name="spark" /><div class="grow"><b>An update is ready${S.update.version ? ' (version ' + S.update.version + ')' : ''}.</b> ${S.update.notes && S.update.notes.length ? S.update.notes.join(' ') : 'Improvements to the planner.'} Your data stays as it is.</div><button class="btn sm primary" onClick=${() => S.update.apply()}>Update now</button></div>`;
}
function backupNow() {
  if (!S.plan) return;
  saveFileLocally(`two-paydays-backup-${todayStr()}.json`, backupData());
  pref.set('lastBackup', new Date().toISOString()); pref.set('backupSnooze', null);
  toast('Backup saved to your Downloads folder. Move it somewhere safe, such as iCloud Drive.', null, 7000); emit();
}
function linkMe(id) {
  if (S.mode === 'shared' && S.viewerId && !S.readOnly) { API.plan({ members: { [id]: { userId: S.viewerId } } }); }
  S.me = id; pref.set('me', id); emit();
  toast(`Got it: you're ${memberName(id)} on this planner.`);
}
function unlinkMe() {
  const id = S.me;
  if (S.mode === 'shared' && !S.readOnly && id && S.plan.members[id] && S.plan.members[id].userId === S.viewerId) API.plan({ members: { [id]: { userId: null } } });
  S.me = null; pref.set('me', null); emit();
}

/* ---------- overview ---------- */
function Overview() {
  const M = model();
  const key = M.key, now = thisMonth(), td = todayStr();
  const dim = E.daysInMonth(key);
  const todayDay = key === now ? +td.slice(8, 10) : (key < now ? dim : 0);
  const daysLeft = key === now ? dim - todayDay + 1 : (key > now ? dim : 0);
  const flex = M.cats.filter(c => c.kind === 'discretionary' || c.kind === 'living');
  const left = E.sum(flex, c => Math.max(0, c.left));
  const flexBudget = E.sum(flex, c => c.budget);
  const flexSet = new Set(flex.map(c => c.id));
  const daily = Array.from({ length: dim }, () => 0);
  M.txns.forEach(t => { if (flexSet.has(t.category) && E.monthOf(t.date) === key) { const d = +String(t.date).slice(8, 10); if (d >= 1 && d <= dim) daily[d - 1] += +t.amount || 0; } });
  let run = 0; const cum = daily.map(v => (run = E.r2(run + v)));
  const T = M.totals;
  const nextPay = M.members.map(m => M.res[m.id]).filter(r => !r.received).sort((a, b) => String(a.payDate).localeCompare(String(b.payDate)))[0];
  const amexDebt = E.debts(S.plan).find(d => d.payInFull);
  const amexBal = amexDebt ? M.ledger.debtEnd[amexDebt.id] : null;
  // sankey data
  const sources = M.members.map(m => ({ id: m.id, label: memberName(m.id, { you: true }), value: Math.max(M.res[m.id].income, M.res[m.id].allocated) }));
  const tg = {};
  const links = [];
  M.members.forEach(m => {
    const per = {};
    M.res[m.id].lines.forEach(l => { if (l.final > 0.004) { const k = l.group === 'joint' ? 'pool:' + (l.pool || 'joint') : l.group; per[k] = (per[k] || 0) + l.final; } });
    Object.entries(per).forEach(([g, v]) => { links.push({ from: m.id, to: g, value: E.r2(v) }); tg[g] = (tg[g] || 0) + v; });
  });
  const pl = poolList();
  const targetKeys = ['pool:joint', 'own', 'savings', 'srilanka', 'debt'].concat(pl.filter(p => p.id !== 'joint').map(p => 'pool:' + p.id), ['buffer']);
  const targets = targetKeys.filter(k => tg[k] > 0.004).map(k => {
    if (k.startsWith('pool:')) { const i = pl.findIndex(p => 'pool:' + p.id === k); return { id: k, label: pl[i].name, short: poolShort(pl[i]), color: poolColor(i), value: E.r2(tg[k]) }; }
    return { id: k, label: GROUP_META[k].label, short: GROUP_META[k].label.replace(' & personal money', '').replace('Savings & investing', 'Savings'), color: GROUP_META[k].color, value: E.r2(tg[k]) };
  });
  const att = attentionItems(M);
  const potsShown = E.pots(S.plan).filter(p => !p.investing);
  const P = projection();
  return html`<div class="page">
    <${Banners} />
    <section class="panel hero">
      <div>
        <div class="eyebrow">${key === now ? 'Left to spend this month' : key < now ? 'Left unspent' : 'Planned for day-to-day spending'}</div>
        <div class="big">${money(left, { whole: left >= 1000 })}</div>
        <p class="lead">In groceries, eating out, personal money and the other day-to-day budgets for ${monthLabel(key)}${key === now && daysLeft > 0 ? html`. That's about <b>${money(left / daysLeft)}</b> a day for the ${daysLeft} days left` : ''}.</p>
      </div>
      <div class="hero-side">
        ${nextPay ? html`<span class="chip accent"><${Icon} name="calendar" size=${12} /> ${possessive(nextPay.member.id)} pay due ${dayLabel(nextPay.payDate)}</span>` : html`<span class="chip good"><${Icon} name="check" size=${12} /> Both paydays in</span>`}
        <span class="chip">${flex.length} budgets · ${money(flexBudget, { whole: true })}</span>
      </div>
    </section>

    <div class="kpis">
      <div class="kpi"><div class="lbl">Pay in</div><div class="val">${money(T.incomeReceived, { auto: true })}</div><div class="sub">of ${money(T.income, { auto: true })} expected</div><div class="meter"><i style=${{ width: pct(T.income ? T.incomeReceived / T.income : 0) }}></i></div></div>
      <div class="kpi"><div class="lbl">Spent</div><div class="val">${money(T.spent, { auto: true })}</div><div class="sub">of ${money(T.planSpend, { auto: true })} in budgets${T.spentFromPots > 0 ? html` · plus ${money(T.spentFromPots, { auto: true })} from pots` : ''}</div><div class="meter"><i style=${{ width: pct(Math.min(1, T.planSpend ? T.spent / T.planSpend : 0)), background: T.spent > T.planSpend ? 'var(--crit)' : null }}></i></div></div>
      <div class="kpi"><div class="lbl">Saved & invested</div><div class="val">${money(T.saved, { auto: true })}</div><div class="sub">of ${money(T.savePlanned, { auto: true })} planned into pots</div><div class="meter"><i style=${{ width: pct(Math.min(1, T.savePlanned ? T.saved / T.savePlanned : 0)), background: 'var(--s3)' }}></i></div></div>
      <div class="kpi"><div class="lbl">${amexDebt ? amexDebt.name + ' balance' : 'Card balance'}</div><div class="val">${amexBal == null ? '—' : money(amexBal, { auto: true })}</div><div class="sub">${amexBal > 0.005 ? html`<span class="chip warn">Pay in full</span>` : html`<span class="chip good">Clear</span>`}</div></div>
    </div>

    <${Panel} title=${`Where ${monthLabel(key)}'s pay goes`} sub=${`Each payday split into ${pl.map(p => 'the ' + poolShort(p).toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')}, your own bills, savings, Sri Lanka family and debt. Hover a band for the amount.`}>
      ${sources.length && targets.length ? html`<${Sankey} sources=${sources} targets=${targets} links=${links} height=${Math.max(340, targets.length * 58)} />` : html`<div class="empty">Add take-home pay on the Payday page to see the split.</div>`}
      <div class="legend">${targets.map(t => html`<span><i class="k-box" style=${{ background: t.color }}></i>${t.label}</span>`)}</div>
    <//>

    <div class="grid g2">
      <${Panel} title="Spending by area" sub="Spent so far against this month's budget. The dark tick marks the budget." actions=${html`<button class="btn sm ghost" onClick=${() => go('spending')}>Details <${Icon} name="arrow" size=${14} /></button>`}>
        <${BudgetBars} rows=${M.groups.filter(g => g.budget > 0 || g.spent > 0).map(g => ({ name: g.name, budget: g.budget, spent: g.spent }))} onPick=${() => go('spending')} />
      <//>
      <${Panel} title="Day-to-day spending pace" sub="Groceries, eating out, personal money and other flexible budgets, day by day.">
        <${PaceChart} monthKey=${key} cumulative=${cum} budget=${flexBudget} todayDay=${key === now ? todayDay : (key < now ? dim : 0)} />
      <//>
    </div>

    <div class="grid g2">
      <${Panel} title="Needs attention" sub=${att.length ? `${att.length} thing${att.length > 1 ? 's' : ''} to sort out for ${monthLabel(key)}` : 'Nothing waiting.'}>
        ${att.length ? html`<div class="list">${att.map(a => html`<div class="li">
          <span class=${cls('chip', a.tone === 'crit' ? 'crit' : a.tone === 'warn' ? 'warn' : '')}><${Icon} name=${a.tone === 'info' ? 'info' : 'alert'} size=${12} /></span>
          <div class="grow"><div class="title">${a.text}</div>${a.sub && html`<div class="meta">${a.sub}</div>`}</div>
          <button class="btn sm" onClick=${() => go(a.go)}>Open</button></div>`)}</div>` : html`<div class="empty"><h3>All sorted</h3>Transfers done, bills logged and every budget on track.</div>`}
      <//>
      <${Panel} title="Who has paid for what" sub="Spending logged this month, by who paid.">
        <div class="list">
          ${M.members.map(m => html`<div class="li"><${Avatar} id=${m.id} /><div class="grow"><div class="title">${memberName(m.id, { you: true })}</div><div class="meta">From their own accounts and cards</div></div><div class="amt">${money(M.byMember[m.id] || 0)}</div></div>`)}
          <div class="li"><span class="avatar" style=${{ background: 'var(--accent)' }}><${Icon} name="payday" size=${14} /></span><div class="grow"><div class="title">${pl.length > 1 ? 'Shared accounts' : 'Joint account'}</div><div class="meta">Paid straight from ${pl.map(p => poolShort(p).toLowerCase()).join(' or ')}</div></div><div class="amt">${money(M.byMember.joint || 0)}</div></div>
          ${T.spentFromPots > 0 && html`<div class="li"><span class="avatar" style=${{ background: 'var(--s3)' }}><${Icon} name="pots" size=${14} /></span><div class="grow"><div class="title">From savings pots</div><div class="meta">Planned spending such as trips</div></div><div class="amt">${money(T.spentFromPots)}</div></div>`}
        </div>
      <//>
    </div>

    <${Panel} title="Savings pots" sub="Balance against each goal. The ring fills as the pot fills." actions=${html`<button class="btn sm ghost" onClick=${() => go('pots')}>All pots <${Icon} name="arrow" size=${14} /></button>`}>
      <div class="pots">${potsShown.map(p => {
        const bal = M.endBal[p.id] || 0, target = E.potTarget(S.plan, p);
        const done = P.doneAt[p.id];
        return html`<div class="row" style=${{ flexWrap: 'nowrap' }}><${Ring} value=${bal} max=${target} size=${52} />
          <div style=${{ minWidth: 0 }}><div class="strong" style=${{ overflowWrap: 'anywhere' }}>${p.name}</div>
          <div class="small ink2">${money(bal, { auto: true })}${target > 0 ? html` <span class="muted">of ${money(target, { whole: true })}</span>` : html` <span class="muted">${p.sinking ? (bal < 0 ? '· paid ahead for a trip' : '· trip fund') : ''}</span>`}</div>
          <div class="tiny muted">${done === 'done' ? 'Goal reached' : done ? 'Full by ' + monthLabel(done, true) : target > 0 ? 'Beyond 6 years at this rate' : ''}</div></div></div>`;
      })}</div>
    <//>

    <${ChecklistPanel} compact=${true} />
  </div>`;
}

/* ---------- checklist ---------- */
function ChecklistPanel({ compact, group, embedded }) {
  const items = E.live(S.checklist && S.checklist.items).sort(E.byOrder).filter(i => !group || i.group === group);
  const [showAll, setShowAll] = useState(!compact);
  const [newText, setNewText] = useState('');
  if (!S.checklist) return null;
  const done = items.filter(i => i.done).length;
  const groups = [];
  items.forEach(i => { if (!groups.includes(i.group || 'To do')) groups.push(i.group || 'To do'); });
  const visible = showAll ? items : items.filter(i => !i.done).slice(0, 5);
  const toggle = i => API.checklist({ items: { [i.id]: { done: !i.done, doneAt: !i.done ? todayStr() : null } } });
  const add = () => { const t = newText.trim(); if (!t) return; const id = uid('k'); API.checklist({ items: { [id]: { text: t, group: group || 'My list', order: 100 + items.length } } }); setNewText(''); };
  return html`<${Panel} cls=${embedded ? 'embedded' : ''} title=${group || 'Getting set up'} sub=${`${done} of ${items.length} done`} actions=${compact && html`<button class="btn sm ghost" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Show fewer' : 'Show all'}</button>`}>
    <div class="meter" style=${{ marginTop: 0, marginBottom: '10px' }}><i style=${{ width: pct(items.length ? done / items.length : 0) }}></i></div>
    <div class="list tasklist">
      ${(showAll && !group ? groups : [null]).map(g => html`${g && html`<div class="eyebrow" style=${{ padding: '12px 0 2px' }}>${g}</div>`}
        ${visible.filter(i => !g || (i.group || 'To do') === g).map(i => html`<div class="li"><${Check} checked=${!!i.done} onToggle=${() => toggle(i)} label=${i.text} />
          <div class="grow ${i.done ? 'done-txt' : ''}">${i.text}</div>
          <button class="iconbtn" aria-label="Remove" onClick=${() => API.checklist({ items: { [i.id]: { deleted: true } } })}><${Icon} name="x" size=${14} /></button></div>`)}`)}
    </div>
    ${showAll && html`<div class="row" style=${{ marginTop: '10px', flexWrap: 'nowrap' }}><input class="field" id=${'newtask-' + (group || 'all')} placeholder="Add a to-do" value=${newText} onInput=${e => setNewText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} /><button class="btn" onClick=${add}>Add</button></div>`}
  <//>`;
}

/* ---------- payday ---------- */
function Payday() {
  const M = model();
  return html`<div class="page">
    <${Banners} />
    <${PaydayTimeline} M=${M} />
    <div class="payday-cols">${M.members.map(m => html`<${PersonPayday} M=${M} mem=${m} />`)}</div>
    ${(M.pools || []).filter(pv => pv.need > 0.004 || pv.lines.some(l => l.final > 0.004 || l.covered > 0.004)).map(pv => html`<${PoolPanel} M=${M} pv=${pv} />`)}
  </div>`;
}
function PaydayTimeline({ M }) {
  const key = M.key, dim = E.daysInMonth(key);
  const marks = [];
  M.members.forEach(m => {
    const pd = M.res[m.id].payDate;
    if (pd && E.monthOf(pd) === key) marks.push({ day: +pd.slice(8, 10), label: `${possessive(m.id)} payday`, color: memberColor(m.id) });
    else if (pd) marks.push({ day: 1, label: `${possessive(m.id)} pay for ${MONTHS[+key.slice(5) - 1]}`, sub: 'arrived ' + dayLabel(pd), color: memberColor(m.id), early: true });
    const td = E.transferDate(m, key);
    marks.push({ day: +td.slice(8, 10), label: `${possessive(m.id)} transfers`, color: 'var(--surface)', ring: memberColor(m.id) });
    const nextPd = E.paydayFor(m, E.addMonths(key, 1));
    if (nextPd && E.monthOf(nextPd) === key) marks.push({ day: +nextPd.slice(8, 10), label: `${possessive(m.id)} pay for ${MONTHS[+E.addMonths(key, 1).slice(5) - 1]}`, color: memberColor(m.id), dim: true });
  });
  marks.sort((a, b) => a.day - b.day || (a.early ? -1 : 0));
  marks.forEach((mk, i) => { mk.up = i % 2 === 1; });
  const td = todayStr();
  const nowKey = E.monthOf(td);
  const todayDay = nowKey === key ? +td.slice(8, 10) : null;
  const isPast = mk => key < nowKey || mk.early || (todayDay != null && mk.day < todayDay);
  const pos = d => ((d - 1) / Math.max(1, dim - 1) * 100);
  const ref = useRef(null);
  const W = useWidth(ref, 720);
  const narrow = W < 600;
  // On a phone the marks become a short agenda, with today slotted in where it falls.
  const agenda = () => {
    const rows = marks.map(mk => ({ mk, day: mk.day }));
    if (todayDay != null) rows.push({ today: true, day: todayDay + 0.5 });
    rows.sort((a, b) => a.day - b.day);
    return html`<div class="agenda">${rows.map(r => r.today
      ? html`<div class="ag-row today"><i class="ag-dot"></i><div>Today</div><span class="small">${dayLabel(td)}</span></div>`
      : html`<div class=${cls('ag-row', isPast(r.mk) && 'past')}>
          <i class="ag-dot" style=${{ background: r.mk.color, boxShadow: r.mk.ring ? `0 0 0 2px ${r.mk.ring}` : null }}></i>
          <div class="lname">${r.mk.label}</div><span class="small muted">${r.mk.sub || dayLabel(key + '-' + E.pad(r.mk.day))}</span></div>`)}</div>`;
  };
  return html`<${Panel} title=${`${monthLabel(key)} at a glance`} sub="Paydays, transfer days and today. Each person's pay funds the month shown.">
    <div ref=${ref}>
    ${narrow ? agenda() : html`<div class="timeline" style=${{ height: '84px', marginTop: '18px' }}>
      <div class="tl-axis" style=${{ top: '40px' }}></div>
      ${todayDay && html`<div class="tl-today" style=${{ left: `calc(${pos(todayDay)}% - 1px)`, top: '31px', height: '20px' }} title="Today"></div>`}
      ${marks.map(mk => html`<div class=${cls('tl-mark', mk.up && 'up')} style=${{ left: `clamp(60px, ${pos(mk.day)}%, calc(100% - 60px))`, top: mk.up ? '-4px' : '32px', opacity: mk.dim ? 0.7 : 1 }}>
        <i style=${{ background: mk.color, boxShadow: mk.ring ? `0 0 0 2px ${mk.ring}` : null }}></i><span>${mk.label}<br/><span class="muted">${mk.sub || dayLabel(key + '-' + E.pad(mk.day))}</span></span></div>`)}
    </div>`}
    </div>
  <//>`;
}
function PersonPayday({ M, mem }) {
  const key = M.key;
  const r = M.res[mem.id];
  const pay = (M.month.pay || {})[mem.id] || {};
  const [adding, setAdding] = useState(false);
  const setPay = patch => API.month(key, { pay: { [mem.id]: patch } });
  const groups = E.GROUPS.map(g => ({ g, lines: r.lines.filter(l => l.group === g && (l.final > 0.004 || l.amount > 0.004 || l.covered > 0.004 || l.overridden || l.extra)) })).filter(x => x.lines.length);
  const transferDay = E.transferDate(mem, key);
  const cuts = r.lines.filter(l => l.cut > 0.004);
  const copyText = () => {
    const lines = r.lines.filter(l => l.transfer && l.final > 0.004 && (l.kind !== 'buffer' || l.pot)).map(l => `${money(l.final)}  ${l.label}`);
    const text = `${memberName(mem.id)} – transfers on ${dayLabel(transferDay)}\n` + lines.join('\n');
    try { navigator.clipboard.writeText(text).then(() => toast('Copied the transfer list'), () => openModal('text', { title: 'Transfer list', text })); } catch (e) { openModal('text', { title: 'Transfer list', text }); }
  };
  return html`<section class="panel">
    <div class="person-head"><${Avatar} id=${mem.id} />
      <div style=${{ flex: 1, minWidth: 0 }}><h2>${memberName(mem.id)}${S.me === mem.id ? html` <span class="chip accent">You</span>` : ''}</h2>
      <div class="small muted">Pay for ${monthLabel(key)} · transfers on ${dayLabel(transferDay)}</div></div>
      <button class="iconbtn" title="Copy the transfer list" aria-label="Copy the transfer list" onClick=${copyText}><${Icon} name="copy" /></button>
    </div>
    <div class="pay-input">
      <label class="lab" for=${'pay-' + mem.id}>Take-home pay${r.received ? '' : html` <span class="hint">expected ${dayLabel(r.payDate)}, planned ${money(mem.plannedPay)}</span>`}
        <div class="money-in"><span>£</span><input class="field" id=${'pay-' + mem.id} inputmode="decimal" placeholder=${String(mem.plannedPay || '')}
          value=${pay.amount != null ? pay.amount : ''} onChange=${e => { const v = e.target.value.trim(); setPay({ amount: v === '' ? null : parseMoney(v), date: pay.date || (v ? todayStr() : null) }); }} /></div>
      </label>
      <div class="stack pay-side">
        ${r.received ? html`<span class="chip good"><${Icon} name="check" size=${12} /> Received ${dayLabel(r.payDate)}</span>` : html`<button class="btn sm" onClick=${() => setPay({ amount: mem.plannedPay, date: r.payDate })}>It arrived as planned</button>`}
        ${pay.note && html`<span class="tiny muted pay-note">${pay.note}</span>`}
      </div>
    </div>
    ${r.short > 0.005 && html`<div class="banner crit"><${Icon} name="alert" /><div class="grow">This pay is <b>${money(r.short)}</b> short of the bills and transfers below. Lower a line or add money from a pot.</div></div>`}
    ${cuts.length > 0 && html`<div class="banner warn"><${Icon} name="alert" /><div class="grow">Pay is lower than planned, so these transfers were reduced, lowest priority first: ${cuts.map((l, i) => html`${i ? ', ' : ''}<b>${l.label}</b> −${money(l.cut)}`)}.</div></div>`}
    ${groups.map(({ g, lines }) => html`<div class="line-group"><h4><span class="swatch" style=${{ background: GROUP_META[g].color }}></span>${GROUP_META[g].label}</h4>
      ${lines.map(l => html`<${LineRow} key=${l.id} M=${M} mem=${mem} l=${l} />`)}</div>`)}
    <div class="hr" style=${{ margin: '14px 0 10px' }}></div>
    <div class="row small"><span class="muted">Planned out</span><b class="num">${money(r.allocated)}</b><span class="muted">· Pay</span><b class="num">${money(r.income)}</b><span class="spacer"></span>
      ${r.toMove > 0.005 ? html`<span class="chip warn">${money(r.toMove)} still to move</span>` : html`<span class="chip good"><${Icon} name="check" size=${12} /> Transfers done</span>`}</div>
    <div class="row" style=${{ marginTop: '12px' }}>
      ${adding ? html`<${AddLineForm} mem=${mem} monthKey=${key} onDone=${() => setAdding(false)} />` : html`<button class="btn sm ghost" onClick=${() => setAdding(true)} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Add a one-off for this month</button>`}
    </div>
  </section>`;
}
function LineRow({ M, mem, l }) {
  const key = M.key;
  const pm = S.plan.pots || {};
  const ticked = !!(l.tick && l.tick.done);
  const canTick = l.transfer && (l.kind !== 'buffer' || l.pot) && l.final > 0.004;
  const autoDone = l.done && !ticked;
  const tkKey = mem.id + ':' + l.id;
  const toggle = () => {
    if (ticked) API.month(key, { ticks: { [tkKey]: { done: false } } });
    else API.month(key, { ticks: { [tkKey]: { done: true, amount: E.r2(Math.max(0, l.left)), coveredAt: E.r2(l.covered || 0), pot: l.pot || null, debt: l.debt || null, at: todayStr(), by: S.viewerId || S.me || null } } }).then(ok => {
      if (ok && l.pot) toast(`Marked ${money(Math.max(0, l.left))} into ${(pm[l.pot] || {}).name || 'the pot'} as done`, { label: 'Undo', fn: () => API.month(key, { ticks: { [tkKey]: { done: false } } }) });
    });
  };
  const setAmount = v => {
    if (l.kind === 'own' || l.kind === 'support') return API.month(key, { catBudgets: { [l.category]: v } });
    if (l.extra) return API.month(key, { extra: { [l.id]: { amount: v } } });
    return API.month(key, { lines: { [l.id]: { amount: v } } });
  };
  const reset = () => {
    if (l.kind === 'own' || l.kind === 'support') return API.month(key, { catBudgets: { [l.category]: null } });
    return API.month(key, { lines: { [l.id]: { amount: null, pot: null, note: null } } });
  };
  const keepForGood = () => {
    if (l.kind === 'own' || l.kind === 'support') { API.plan({ categories: { [l.category]: { budget: l.amount } } }).then(ok => ok && reset()); return; }
    if (l.planId) { const o = ((M.month.lines || {})[l.id]) || {}; const patch = { amount: l.amount + (l.kind === 'pot' ? 0 : 0) }; if (o.pot) patch.pot = o.pot; API.plan({ lines: { [l.planId]: patch } }).then(ok => ok && reset()); }
  };
  const status = () => {
    if (l.kind === 'buffer' && !l.pot) return html`<span class="tiny muted">stays put</span>`;
    if (l.transfer) {
      if (l.final <= 0.004) return html`<span class="tiny muted">nothing this month</span>`;
      if (l.done && l.kind === 'joint' && l.covered + l.ticked > l.final + 0.004) return html`<span class="chip good"><${Icon} name="check" size=${11} /> Done</span><span class="tiny muted">${money(l.covered + l.ticked - l.final)} more than this share</span>`;
      if (l.done) return html`<span class="chip good"><${Icon} name="check" size=${11} /> Done</span>`;
      return html`<span class="tiny" style=${{ color: 'var(--warn-ink)', fontWeight: 700 }}>${money(l.left)} to move</span>`;
    }
    if (l.left < -0.005) return html`<span class="chip crit">${money(-l.left)} over</span>`;
    return html`<span class="tiny muted">${money(l.left)} left</span>`;
  };
  const notes = [];
  if (l.note) notes.push(html`<span>${l.note}</span>`);
  if (l.redirected) notes.push(html`<span class="chip warn">Instead of ${(pm[l.redirected] || {}).name || 'another pot'}</span>`);
  if (l.cascaded) notes.push(html`<span class="chip good">${(pm[l.cascaded] || {}).name || 'A goal'} is full, so this moves here</span>`);
  const [showCovered, setShowCovered] = useState(false);
  if (l.covered > 0.004 && l.transfer && l.kind === 'joint') notes.push(html`<button class="linkish" aria-expanded=${showCovered} onClick=${() => setShowCovered(!showCovered)}>${money(l.covered)} already put in from ${S.me === mem.id ? 'your' : possessive(mem.id)} own account</button>`);
  else if (l.covered > 0.004 && l.transfer) notes.push(html`<span>${money(l.covered)} already moved</span>`);
  if (l.covered > 0.004 && !l.transfer) notes.push(html`<span>${money(l.covered)} spent so far</span>`);
  if (ticked && l.ticked > 0.004) notes.push(html`<span>Moved ${money(l.ticked)} ${l.tick.at ? 'on ' + dayLabel(l.tick.at) : ''}</span>`);
  if (l.cut > 0.004) notes.push(html`<span class="chip warn">Reduced by ${money(l.cut)}</span>`);
  if (l.overridden) notes.push(html`<span class="chip warn">Changed for this month</span><span class="ov-acts"><button class="btn ghost sm ov-btn" onClick=${keepForGood} disabled=${S.readOnly}>Keep every month</button><button class="btn ghost sm ov-btn" onClick=${reset} disabled=${S.readOnly}>Undo</button></span>`);
  if (l.kind === 'buffer') notes.push(html`<select class="field buffer-sel" aria-label="Where the extra goes" value=${l.pot || ''}
    onChange=${e => API.month(key, { lines: { ['buffer:' + mem.id]: { pot: e.target.value || 'buffer' } } })}><option value="">Keep in account</option>${E.pots(S.plan).map(p => html`<option value=${p.id}>Send to ${p.name}</option>`)}</select>`);
  return html`<div class=${cls('line', l.done && l.transfer && 'done')}>
    <div>${canTick ? html`<${Check} checked=${ticked || autoDone} disabled=${autoDone || S.readOnly} onToggle=${toggle} label=${'Mark ' + l.label + ' as moved'} />` : html`<span class="swatch" style=${{ background: GROUP_META[l.group].color, width: '8px', height: '8px', borderRadius: '50%', margin: '7px' }}></span>`}</div>
    <div style=${{ minWidth: 0 }}><div class="lname">${l.label}${l.extra && html` <span class="chip ghost">one-off</span>`}</div>${notes.length > 0 && html`<div class="lnote">${notes}</div>`}</div>
    <div class="lamt">
      ${l.kind === 'buffer' ? html`<span class="amt">${money(l.final)}</span>` : html`<${EditMoney} value=${l.amount} overridden=${l.overridden} title=${'Change ' + l.label + ' for this month'} onCommit=${setAmount} />`}
      ${l.cut > 0.004 && html`<span class="tiny muted">pays ${money(l.final)}</span>`}
      ${status()}
      ${l.extra && html`<button class="btn ghost sm" style=${{ minHeight: '22px', padding: '0 6px' }} onClick=${() => API.month(key, { extra: { [l.id]: { deleted: true } } })}>Remove</button>`}
    </div>
    ${showCovered && l.kind === 'joint' && html`<${PoolFromOwn} M=${M} mem=${mem} l=${l} />`}
  </div>`;
}
// What counts towards a person's share of a shared pool (same rule as the engine): money moved into it, and that
// pool's budgets paid from their own account or card.
function poolFromOwnTxns(M, memId, poolId) {
  const pc = new Set(E.categories(S.plan).filter(c => c.payer === poolId).map(c => c.id));
  const am = E.accountMap(S.plan);
  return (M.txns || []).filter(t => t.member === memId && ((pc.has(t.category) && !(am[t.account] && am[t.account].owner === 'joint')) || t.category === 'xfer:' + poolId))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function PoolFromOwn({ M, mem, l }) {
  const pool = poolOf(l.pool || 'joint');
  const name = pool ? poolShort(pool).toLowerCase() : 'joint account';
  const list = poolFromOwnTxns(M, mem.id, l.pool || 'joint');
  const over = l.covered + l.ticked - l.final;
  const you = S.me === mem.id;
  return html`<div class="covered-list">
    ${list.map(t => html`<div class="cl-row"><span class="muted">${dayLabel(t.date)}</span><span class="cl-what">${t.desc || 'Spending'} <span class="cl-cat">${String(t.category).startsWith('xfer:') ? 'Moved in' : categoryName(S.plan, t.category)}</span></span><b class="num">${money(t.amount)}</b></div>`)}
    <p class="tiny muted" style=${{ margin: '8px 0 0' }}>These count towards ${you ? 'your' : 'this'} share of the ${name}: money moved into it, and its budgets paid from ${you ? 'your' : possessive(mem.id)} own account.${over > 0.004 ? ` That's ${money(over)} more than the share this month.` : ''} Anything that was really personal belongs under personal money: change its category on <button class="linkish" onClick=${() => go('spending')}>Spending</button>.</p>
  </div>`;
}
function AddLineForm({ mem, monthKey, onDone }) {
  const [kind, setKind] = useState('pot');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [pot, setPot] = useState(E.pots(S.plan)[0] ? E.pots(S.plan)[0].id : '');
  const [debt, setDebt] = useState(E.debts(S.plan)[0] ? E.debts(S.plan)[0].id : '');
  const save = () => {
    const a = parseMoney(amount);
    if (a == null) { toast('Add an amount'); return; }
    const id = uid('x');
    const x = { member: mem.id, kind, amount: a, label: label.trim() || (kind === 'pot' ? 'Extra into ' + ((S.plan.pots[pot] || {}).name || 'pot') : kind === 'debt' ? 'Pay ' + ((S.plan.debts[debt] || {}).name || 'debt') : 'One-off'), order: 50 };
    if (kind === 'pot') x.pot = pot;
    if (kind === 'debt') x.debt = debt;
    API.month(monthKey, { extra: { [id]: x } });
    onDone();
  };
  return html`<div class="stack" style=${{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '12px' }}>
    <${Seg} label="Kind of one-off" value=${kind} onChange=${setKind} options=${[{ value: 'pot', label: 'Into a pot' }, { value: 'debt', label: 'Pay a debt' }, { value: 'other', label: 'Other' }]} />
    <div class="form-grid">
      ${kind === 'pot' && html`<label class="lab">Pot<${PotSelect} id=${'xl-pot-' + mem.id} value=${pot} onChange=${setPot} /></label>`}
      ${kind === 'debt' && html`<label class="lab">Debt<select class="field" id=${'xl-debt-' + mem.id} value=${debt} onChange=${e => setDebt(e.target.value)}>${E.debts(S.plan).map(d => html`<option value=${d.id}>${d.name}</option>`)}</select></label>`}
      <label class="lab">Amount<div class="money-in"><span>£</span><input class="field" id=${'xl-amt-' + mem.id} inputmode="decimal" value=${amount} onInput=${e => setAmount(e.target.value)} /></div></label>
      <label class="lab">Label <span class="hint">optional</span><input class="field" id=${'xl-label-' + mem.id} value=${label} onInput=${e => setLabel(e.target.value)} /></label>
    </div>
    <div class="row"><button class="btn primary sm" onClick=${save}>Add for ${monthLabel(monthKey)}</button><button class="btn ghost sm" onClick=${onDone}>Cancel</button></div>
  </div>`;
}
function PoolPanel({ M, pv }) {
  const spent = E.sum(pv.cats, c => c.spent);
  const isJoint = pv.id === 'joint';
  return html`<${Panel} title=${`${pv.name} for ${monthLabel(M.key)}`} sub=${`${isJoint ? 'Bills paid from it' : 'Budgets paid from it'} need ${money(pv.need)} this month. Split: ${methodText(pv.method)}.`}
    actions=${html`<button class="btn sm ghost" onClick=${() => go('plan')}>Change the split</button>`}>
    <div class="grid g2" style=${{ gap: '18px' }}>
      <div class="list">
        ${pv.lines.map(l => html`<div class="li"><${Avatar} id=${l.member} size="sm" /><div class="grow"><div class="title">${memberName(l.member, { you: true })} · ${l.kind === 'cover' ? 'covering the rest' : 'share'}</div>
          <div class="meta">${l.covered > 0.004 ? money(l.covered) + ' put in from ' + (l.member === S.me ? 'your' : 'their') + ' own account · ' : ''}${l.ticked > 0.004 ? money(l.ticked) + ' moved · ' : ''}${l.left > 0.004 ? money(l.left) + ' to move' : 'done'}</div></div><div class="amt">${money(l.final)}</div></div>`)}
        <div class="li"><div class="grow"><div class="title">${pv.deficit > 0.005 ? 'Still uncovered' : 'Covered'}</div></div><div class="amt">${pv.deficit > 0.005 ? html`<span class="chip crit">${money(pv.deficit)} short</span>` : html`<span class="chip good"><${Icon} name="check" size=${11} /> ${money(pv.provided)}</span>`}</div></div>
      </div>
      <div>
        <div class="small muted" style=${{ marginBottom: '8px' }}>Spent so far: <b class="num" style=${{ color: 'var(--ink)' }}>${money(spent)}</b> of ${money(E.sum(pv.cats, c => c.budget))}</div>
        <${BudgetBars} rows=${pv.cats.filter(c => c.budget > 0 || c.spent > 0).map(c => ({ name: c.name, budget: c.budget, spent: c.spent }))} />
      </div>
    </div>
  <//>`;
}
