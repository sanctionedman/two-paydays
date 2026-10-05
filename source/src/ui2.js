/* ===== UI part 2: spending, transactions, import ===== */

function defaultAccountFor(memberId) {
  const m = S.plan.members && S.plan.members[memberId];
  if (memberId === 'joint') { const a = E.accounts(S.plan).find(a => a.owner === 'joint' && a.type === 'current'); return a ? a.id : ''; }
  return (m && m.defaultAccount) || '';
}
function defaultDateFor(key) { const td = todayStr(); if (E.monthOf(td) === key) return td; return key < E.monthOf(td) ? key + '-' + E.pad(E.daysInMonth(key)) : key + '-01'; }
function parseQuick(text) {
  let s = ' ' + String(text || '') + ' ';
  let date = null, amount = null;
  const td = todayStr();
  if (/\byesterday\b/i.test(s)) { const d = new Date(); d.setDate(d.getDate() - 1); date = `${d.getFullYear()}-${E.pad(d.getMonth() + 1)}-${E.pad(d.getDate())}`; s = s.replace(/\byesterday\b/i, ' '); }
  else if (/\btoday\b/i.test(s)) { date = td; s = s.replace(/\btoday\b/i, ' '); }
  const dm = s.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/);
  if (dm) { let y = dm[3] ? +dm[3] : +td.slice(0, 4); if (y < 100) y += 2000; date = `${y}-${E.pad(+dm[2])}-${E.pad(+dm[1])}`; s = s.replace(dm[0], ' '); }
  const am = [...s.matchAll(/(?:£\s?)?(\d+(?:[.,]\d{1,2})?)(?=\s)/g)];
  if (am.length) { const m = am[am.length - 1]; amount = +m[1].replace(',', '.'); s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); }
  return { desc: s.replace(/\s+/g, ' ').trim(), amount, date };
}
function addTxn(key, t) {
  const id = uid('t');
  const txn = Object.assign({ createdAt: new Date().toISOString(), by: S.viewerId || null, source: 'manual' }, t);
  const mk = E.monthOf(txn.date) || key;
  return API.month(mk, { txns: { [id]: txn } }).then(ok => {
    if (ok) toast(`Added ${txn.desc || 'spending'} · ${money(txn.amount)} in ${categoryName(S.plan, txn.category)}${mk !== S.monthKey ? ' (' + monthLabel(mk) + ')' : ''}`, { label: 'Undo', fn: () => API.month(mk, { txns: { [id]: { deleted: true } } }) });
    return ok;
  });
}
function learnRule(desc, category) {
  const key = E.merchantKey(desc);
  if (!key || key.length < 3 || !category) return;
  const target = E.ruleTargetFor(S.plan, category);
  const exists = E.rules(S.plan).find(r => E.normalise(r.match) === key);
  if (exists && exists.category === target) return;
  const label = target.startsWith('@role:') ? roleLabel(target.slice(6)) + ' of whoever paid' : categoryName(S.plan, category);
  toast(`Always file “${key}” under ${label}?`, { label: 'Always', fn: () => API.plan({ rules: { [exists ? exists.id : uid('r')]: { match: key, category: target } } }).then(ok => ok && toast('Rule saved. New spending like this sorts itself.')) }, 8000);
}

/* ---------- add spending form (modal and inline) ---------- */
function TxnForm({ initial, onSaved, compact, idPrefix }) {
  const me = S.me || (E.members(S.plan)[0] || {}).id;
  const key = S.monthKey;
  const [text, setText] = useState(initial && initial.desc || '');
  const [amount, setAmount] = useState(initial && initial.amount != null ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial && initial.category || '');
  const [catTouched, setCatTouched] = useState(!!(initial && initial.category));
  const [member, setMember] = useState(initial && initial.member || me);
  const [account, setAccount] = useState(initial && initial.account !== undefined ? initial.account : defaultAccountFor(me));
  const [date, setDate] = useState(initial && initial.date || defaultDateFor(key));
  const [note, setNote] = useState(initial && initial.note || '');
  const [cur, setCur] = useState(initial && initial.foreign ? initial.foreign.currency : 'GBP');
  const [foreignAmt, setForeignAmt] = useState(initial && initial.foreign ? String(initial.foreign.amount) : '');
  const [trip, setTrip] = useState(initial && initial.trip || '');
  const [guess, setGuess] = useState(null);
  const P = idPrefix || 'tx';
  const onText = v => {
    setText(v);
    const q = parseQuick(v);
    if (q.amount != null && cur === 'GBP') setAmount(String(q.amount));
    if (q.date) setDate(q.date);
    const g = E.categorise(S.plan, q.desc || v, member, q.amount || 1);
    setGuess(g);
    if (g && !catTouched) setCategory(g.category);
  };
  const gbp = cur === 'GBP' ? parseMoney(amount) : (parseMoney(foreignAmt) != null ? E.r2(parseMoney(foreignAmt) / E.fx(S.plan, cur)) : null);
  const submit = e => {
    if (e) e.preventDefault();
    const q = parseQuick(text);
    const a = gbp;
    if (a == null) { toast('Add an amount'); return; }
    const t = { date, desc: (q.desc || text).trim() || categoryName(S.plan, category), amount: a, category: category || null, member, account: account || null, note: note.trim() || null };
    if (cur !== 'GBP') t.foreign = { currency: cur, amount: parseMoney(foreignAmt) };
    if (trip) t.trip = trip;
    addTxn(key, t).then(ok => { if (ok) { setText(''); setAmount(''); setForeignAmt(''); setNote(''); setCatTouched(false); setGuess(null); if (!(initial && initial.category)) setCategory(''); if (onSaved) onSaved(); } });
  };
  const trips = E.trips(S.plan);
  if (compact) {
    return html`<form class="quick" onSubmit=${submit}>
      <input class="field" id=${P + '-text'} placeholder="What was it? e.g. Deliveroo 41.52" value=${text} onInput=${e => onText(e.target.value)} aria-label="Description and amount" autocomplete="off" />
      <div class="money-in"><span>£</span><input class="field" id=${P + '-amt'} inputmode="decimal" placeholder="0.00" value=${amount} onInput=${e => setAmount(e.target.value)} aria-label="Amount" /></div>
      <${CatSelect} id=${P + '-cat'} value=${category} onChange=${v => { setCategory(v); setCatTouched(true); }} emptyLabel=${guess ? 'Category' : 'Category (auto)'} />
      <button class="btn primary" type="submit" disabled=${S.readOnly}><${Icon} name="plus" />Add</button>
    </form>`;
  }
  return html`<form class="stack" onSubmit=${submit}>
    <label class="lab" for=${P + '-text'}>What was it?<input class="field" id=${P + '-text'} placeholder="e.g. Deliveroo 41.52 yesterday" value=${text} onInput=${e => onText(e.target.value)} autocomplete="off" /></label>
    <div class="form-grid">
      <label class="lab">Currency<select class="field" id=${P + '-cur'} value=${cur} onChange=${e => setCur(e.target.value)}><option value="GBP">£ pounds</option><option value="LKR">Rs rupees</option><option value="SGD">S$ Singapore dollars</option></select></label>
      ${cur === 'GBP' ? html`<label class="lab">Amount<div class="money-in"><span>£</span><input class="field" id=${P + '-amt'} inputmode="decimal" value=${amount} onInput=${e => setAmount(e.target.value)} /></div></label>`
        : html`<label class="lab">Amount in ${cur}<span class="hint">${gbp != null ? '≈ ' + money(gbp) + ' at ' + E.fx(S.plan, cur) + ' per £' : ''}</span><input class="field" id=${P + '-famt'} inputmode="decimal" value=${foreignAmt} onInput=${e => setForeignAmt(e.target.value)} /></label>`}
      <label class="lab">Date<input class="field" id=${P + '-date'} type="date" value=${date} onInput=${e => setDate(e.target.value)} /></label>
    </div>
    <label class="lab">Category${guess && !catTouched ? html` <span class="hint">sorted automatically${guess.source === 'rule' ? ' by your rule' : ''}</span>` : ''}<${CatSelect} id=${P + '-cat'} value=${category} onChange=${v => { setCategory(v); setCatTouched(true); }} /></label>
    <div class="form-grid">
      <label class="lab">Who paid<${MemberSelect} id=${P + '-who'} value=${member} onChange=${v => { setMember(v); setAccount(defaultAccountFor(v)); }} /></label>
      <label class="lab">Account or card<${AccountSelect} id=${P + '-acc'} value=${account} onChange=${setAccount} /></label>
      ${trips.length > 0 && html`<label class="lab">Trip<select class="field" id=${P + '-trip'} value=${trip} onChange=${e => setTrip(e.target.value)}><option value="">Not a trip</option>${trips.map(t => html`<option value=${t.id}>${t.name}</option>`)}</select></label>`}
    </div>
    <label class="lab">Note <span class="hint">optional</span><input class="field" id=${P + '-note'} value=${note} onInput=${e => setNote(e.target.value)} /></label>
    <div class="row"><button class="btn primary" type="submit" disabled=${S.readOnly}><${Icon} name="plus" />Add ${gbp != null ? money(gbp) : ''}</button><span class="small muted">Goes into ${monthLabel(E.monthOf(date) || key)}</span></div>
  </form>`;
}

/* ---------- spending page ---------- */
function Spending() {
  const M = model();
  const key = M.key;
  const [who, setWho] = useState('all');
  const [catF, setCatF] = useState(null);
  const [q, setQ] = useState('');
  const [onlyUncat, setOnlyUncat] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);
  useEffect(() => { const f = e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); searchRef.current && searchRef.current.focus(); } }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
  const am = E.accountMap(S.plan);
  let tx = M.txns;
  if (who === 'joint') tx = tx.filter(t => am[t.account] && am[t.account].owner === 'joint');
  else if (who !== 'all') tx = tx.filter(t => t.member === who && !(am[t.account] && am[t.account].owner === 'joint'));
  if (catF) tx = tx.filter(t => t.category === catF);
  if (onlyUncat) tx = tx.filter(t => M.uncategorised.includes(t));
  if (q.trim()) { const n = E.normalise(q); tx = tx.filter(t => E.normalise(t.desc + ' ' + (t.note || '') + ' ' + categoryName(S.plan, t.category)).includes(n)); }
  const unlogged = M.cats.filter(c => c.kind === 'bill' && c.budget > 0 && c.count === 0);
  const logBills = () => {
    const patch = {};
    unlogged.forEach(c => { const id = uid('b'); const pool = poolOf(c.payer); const member = pool ? 'joint' : c.payer; patch[id] = { date: defaultDateFor(key), desc: c.name, amount: c.budget, category: c.id, member, account: (pool && pool.account) || defaultAccountFor(member) || null, createdAt: new Date().toISOString(), source: 'planned', note: 'Logged at the planned amount' }; });
    API.month(key, { txns: patch }).then(ok => ok && toast(`Logged ${unlogged.length} bills at their planned amounts. Change any that differ.`, { label: 'Undo', fn: () => API.month(key, { txns: Object.fromEntries(Object.keys(patch).map(id => [id, { deleted: true }])) }) }));
  };
  const askClaude = async () => {
    const items = M.uncategorised.slice(0, 60);
    if (!S.sample || !items.length) return;
    setBusy(true);
    const groups = categoryOptions(S.plan);
    const catList = groups.flatMap(g => g.items.map(i => `${i.value} = ${i.label} (${g.label})`)).join('\n');
    const rows = items.map(t => `${t.id} | ${t.desc} | £${t.amount} | paid by ${memberName(t.member)}`).join('\n');
    const prompt = `You sort household bank transactions into budget categories for a UK couple.\nCategories (id = name):\n${catList}\n\nTransactions (id | description | amount | who paid):\n${rows}\n\nReply with only a JSON array, one object per transaction: {"id": "<transaction id>", "category": "<category id from the list>", "confidence": "high" | "low"}. Use only ids from the category list. Example: [{"id":"t1","category":"c_groceries","confidence":"high"}]`;
    try {
      const out = await S.sample.json(prompt, { modelTier: 'quick' });
      const valid = new Set(groups.flatMap(g => g.items.map(i => i.value)));
      const sugg = (Array.isArray(out) ? out : []).filter(o => o && valid.has(String(o.category)) && items.find(t => t.id === String(o.id)));
      openModal('suggest', { key, sugg: sugg.map(o => ({ id: String(o.id), category: String(o.category), confidence: o.confidence })) });
    } catch (e) {
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) { toast('Claude is not available for this planner.'); S.sample = null; emit(); }
      else if (e && e.code !== 'cancelled') toast("Claude couldn't sort these just now. Try again in a minute.");
    } finally { setBusy(false); }
  };
  const groups = M.groups.filter(g => g.cats.some(c => c.budget > 0 || c.spent > 0 || c.count));
  return html`<div class="page">
    <${Banners} />
    <${Panel} title="Add spending" sub=${html`Type it the way you'd say it, like “Deliveroo 41.52” or “Tesco 23.80 yesterday”. The category is picked for you. <span class="kbd">N</span> opens the full form.`}>
      <${TxnForm} compact=${true} idPrefix="quick" />
      <div class="row" style=${{ marginTop: '12px' }}>
        <button class="btn sm" onClick=${() => openModal('import')} disabled=${S.readOnly}><${Icon} name="upload" size=${14} />Import a bank statement</button>
        ${unlogged.length > 0 && html`<button class="btn sm" onClick=${logBills} disabled=${S.readOnly}><${Icon} name="bill" size=${14} />Log ${unlogged.length} regular bills</button>`}
        ${S.sample && M.uncategorised.length > 0 && html`<button class="btn sm" onClick=${askClaude} disabled=${busy || S.readOnly}><${Icon} name="spark" size=${14} />${busy ? 'Claude is sorting…' : `Ask Claude to sort ${M.uncategorised.length}`}</button>`}
      </div>
    <//>
    <div class="grid g-main" style=${{ alignItems: 'start' }}>
      <${Panel} title="Transactions" sub=${`${M.txns.length} in ${monthLabel(key)} · ${money(M.totals.spent)} spent from budgets`}>
        <div class="row" style=${{ marginBottom: '12px' }}>
          <${Seg} label="Whose spending" value=${who} onChange=${setWho} options=${[{ value: 'all', label: 'All' }, ...M.members.map(m => ({ value: m.id, label: memberName(m.id, { you: true }) })), { value: 'joint', label: poolList().length > 1 ? 'Shared' : 'Joint' }]} />
          ${M.uncategorised.length > 0 && html`<button class=${cls('chip link', onlyUncat ? 'warn' : 'ghost')} onClick=${() => setOnlyUncat(!onlyUncat)}>${M.uncategorised.length} need a category</button>`}
          ${catF && html`<button class="chip link accent" onClick=${() => setCatF(null)}>${categoryName(S.plan, catF)} <${Icon} name="x" size=${11} /></button>`}
          <span class="spacer"></span>
          <div class="money-in" style=${{ minWidth: '180px', flex: '1 1 180px', maxWidth: '260px' }}><span><${Icon} name="search" size=${14} /></span><input ref=${searchRef} class="field" id="txn-search" placeholder="Search" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Search transactions" /></div>
        </div>
        ${tx.length ? html`<div class="list">${tx.map(t => html`<${TxnRow} key=${t.id} t=${t} monthKey=${key} uncat=${M.uncategorised.includes(t)} />`)}</div>`
          : html`<div class="empty"><h3>${M.txns.length ? 'Nothing matches' : 'No spending logged yet'}</h3>${M.txns.length ? 'Clear the filters to see everything.' : 'Add spending above, log your regular bills, or import a bank statement.'}</div>`}
      <//>
      <${Panel} title="Budgets this month" sub="Tap a budget to see its spending. Over budget? Cover it from another budget.">
        <div class="stack" style=${{ gap: '18px' }}>
          ${groups.map(g => html`<div><div class="eyebrow" style=${{ marginBottom: '8px' }}>${g.name}</div>
            ${g.cats.filter(c => c.budget > 0 || c.spent > 0 || c.count).map(c => html`<${Envelope} c=${c} active=${catF === c.id} onPick=${() => setCatF(catF === c.id ? null : c.id)} monthKey=${key} />`)}</div>`)}
        </div>
      <//>
    </div>
  </div>`;
}
function Envelope({ c, active, onPick, monthKey }) {
  const over = c.spent > c.budget + 0.005;
  const w = c.budget > 0 ? Math.min(100, c.spent / c.budget * 100) : (c.spent > 0 ? 100 : 0);
  return html`<div style=${{ padding: '7px 8px', margin: '0 -8px', borderRadius: '8px', background: active ? 'var(--accent-soft)' : null, cursor: 'pointer' }} onClick=${onPick}>
    <div class="row" style=${{ flexWrap: 'nowrap', gap: '8px' }}>
      <div style=${{ flex: 1, minWidth: 0 }}><span class="strong small">${c.name}</span> <span class="tiny muted">${payerLabel(c.payer, { you: true })}</span></div>
      <span class="small num">${money(c.spent)} <span class="muted">/ ${money(c.budget)}</span></span>
    </div>
    <div class="track" style=${{ height: '8px', marginTop: '5px' }}><div class=${cls('fill', over && 'over')} style=${{ width: w + '%', borderRadius: '4px' }}></div></div>
    <div class="row tiny" style=${{ marginTop: '3px' }}>
      ${over ? html`<span class="chip crit"><${Icon} name="alert" size=${11} /> ${money(c.spent - c.budget)} over</span>
        <button class="btn sm" style=${{ minHeight: '24px', padding: '0 8px' }} onClick=${e => { e.stopPropagation(); openModal('cover', { cat: c.id, monthKey }); }}>Cover it</button>`
        : html`<span class="muted">${money(c.left)} left</span>`}
      ${(c.movedIn > 0 || c.movedOut > 0 || c.swept > 0 || c.extra > 0) && html`<span class="muted">· adjusted ${c.movedIn ? '+' + money(c.movedIn) : ''}${c.movedOut ? ' −' + money(c.movedOut) : ''}${c.swept ? ' −' + money(c.swept) + ' saved' : ''}${c.extra ? ' +' + money(c.extra) + ' running costs' : ''}</span>`}
    </div>
  </div>`;
}
function TxnRow({ t, monthKey, uncat }) {
  const [open, setOpen] = useState(false);
  const upd = patch => API.month(monthKey, { txns: { [t.id]: patch } });
  const setCat = v => { upd({ category: v || null }); if (v) learnRule(t.desc, v); };
  const del = () => API.month(monthKey, { txns: { [t.id]: { deleted: true } } }).then(ok => ok && toast(`Deleted ${t.desc}`, { label: 'Undo', fn: () => upd({ deleted: false }) }));
  const trip = t.trip && S.plan.trips && S.plan.trips[t.trip];
  const acc = t.account && S.plan.accounts && S.plan.accounts[t.account];
  const kind = E.parseCat(t.category).type;
  return html`<div class="li" style=${{ alignItems: 'flex-start' }}>
    <div style=${{ width: '54px', flex: 'none' }} class="small"><b>${dayLabel(t.date, { weekday: undefined, month: 'short' })}</b><div class="tiny muted">${dayLabel(t.date, { day: undefined, month: undefined })}</div></div>
    <div class="grow">
      <div class="title"><${EditText} value=${t.desc} onCommit=${v => upd({ desc: v })} title="Edit description" /></div>
      <div class="row tiny" style=${{ gap: '6px', marginTop: '4px' }}>
        <div style=${{ minWidth: '170px', flex: '1 1 190px', maxWidth: '280px' }}><${CatSelect} id=${'cat-' + t.id} value=${t.category} onChange=${setCat} label=${'Category for ' + t.desc} emptyLabel="Needs a category" /></div>
        <span class="row" style=${{ gap: '4px' }}><${Avatar} id=${t.member === 'joint' ? 'joint' : t.member} size="sm" /> ${acc ? acc.name : html`<span class="chip warn">No account</span>`}</span>
        ${trip && html`<span class="chip accent"><${Icon} name="travel" size=${11} /> ${trip.name}</span>`}
        ${t.foreign && html`<span class="chip rupee">${t.foreign.currency} ${Number(t.foreign.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>`}
        ${kind === 'potIn' && html`<span class="chip good">Saving</span>`}
        ${t.source === 'import' && html`<span class="chip ghost">imported</span>`}
        ${uncat && html`<span class="chip warn">Needs a category</span>`}
      </div>
      ${t.note && html`<div class="meta" style=${{ marginTop: '3px' }}>${t.note}</div>`}
      ${open && html`<div class="form-grid" style=${{ marginTop: '10px' }}>
        <label class="lab">Who paid<${MemberSelect} id=${'who-' + t.id} value=${t.member} includeJoint=${true} onChange=${v => upd({ member: v })} /></label>
        <label class="lab">Account or card<${AccountSelect} id=${'acc-' + t.id} value=${t.account} onChange=${v => upd({ account: v || null })} /></label>
        <label class="lab">Date<input class="field" type="date" id=${'date-' + t.id} value=${t.date} onChange=${e => {
          const nd = e.target.value; if (!nd) return;
          if (E.monthOf(nd) !== monthKey) { const copy = Object.assign({}, t); delete copy.id; copy.date = nd; API.month(E.monthOf(nd), { txns: { [t.id]: copy } }).then(ok => ok && upd({ deleted: true })); }
          else upd({ date: nd });
        }} /></label>
        <label class="lab">Trip<select class="field" id=${'trip-' + t.id} value=${t.trip || ''} onChange=${e => upd({ trip: e.target.value || null })}><option value="">Not a trip</option>${E.trips(S.plan).map(x => html`<option value=${x.id}>${x.name}</option>`)}</select></label>
        <label class="lab" style=${{ gridColumn: '1 / -1' }}>Note<input class="field" id=${'note-' + t.id} value=${t.note || ''} onChange=${e => upd({ note: e.target.value || null })} /></label>
      </div>`}
    </div>
    <div class="stack" style=${{ gap: '2px', alignItems: 'flex-end' }}>
      <${EditMoney} value=${t.amount} title="Edit amount" onCommit=${v => upd({ amount: v })} cls=${t.amount < 0 ? 'neg' : ''} />
      <div class="row" style=${{ gap: '0' }}>
        <button class="iconbtn" aria-label=${open ? 'Fewer details' : 'More details'} title="Details" onClick=${() => setOpen(!open)}><${Icon} name="edit" /></button>
        <button class="iconbtn" aria-label=${'Delete ' + t.desc} title="Delete" onClick=${del}><${Icon} name="trash" /></button>
      </div>
    </div>
  </div>`;
}

/* ---------- cover an overspend ---------- */
function CoverModal({ cat, monthKey }) {
  const M = model(monthKey);
  const c = M.catById[cat];
  const need = c ? E.r2(c.spent - c.budget) : 0;
  const payerLines = c ? M.members.filter(m => poolOf(c.payer) || m.id === c.payer) : [];
  const sources = M.cats.filter(x => x.id !== cat && x.left > 0.005 && (x.kind === 'discretionary' || x.kind === 'living')).sort((a, b) => (a.payer === c.payer ? -1 : 0) - (b.payer === c.payer ? -1 : 0) || b.left - a.left);
  const potLines = payerLines.flatMap(m => M.res[m.id].lines.filter(l => l.kind === 'pot' && l.final > 0.005 && l.left > 0.005).map(l => Object.assign({ member: m.id }, l)));
  const [amt, setAmt] = useState(String(need));
  if (!c) return null;
  const a = () => Math.max(0, parseMoney(amt) || 0);
  const fromCat = s => { API.month(monthKey, { budgetMoves: { [uid('m')]: { from: s.id, to: cat, amount: E.r2(Math.min(a(), s.left)), at: todayStr() } } }).then(ok => ok && (closeModal(), toast(`Moved ${money(Math.min(a(), s.left))} from ${s.name} to ${c.name}`))); };
  const fromPotLine = l => { const take = E.r2(Math.min(a(), l.left)); API.month(monthKey, { lines: { [l.id]: { amount: E.r2(l.amount - take), note: `${money(take)} covered ${c.name}` } }, catBudgets: { [cat]: E.r2((M.month.catBudgets && M.month.catBudgets[cat] != null ? +M.month.catBudgets[cat] : c.base) + take) } }).then(ok => ok && (closeModal(), toast(`Saving ${money(take)} less into ${l.label} this month to cover ${c.name}`))); };
  return html`<${Modal} title=${`Cover ${c.name}`} onClose=${closeModal}>
    <p class="ink2">${c.name} is <b>${money(need)}</b> over its ${money(c.budget)} budget. Choose where the money comes from. This only changes ${monthLabel(monthKey)}.</p>
    <label class="lab" style=${{ marginTop: '12px', maxWidth: '200px' }}>Amount to cover<div class="money-in"><span>£</span><input class="field" id="cover-amt" inputmode="decimal" value=${amt} onInput=${e => setAmt(e.target.value)} /></div></label>
    <h3 style=${{ marginTop: '16px' }}>From another budget with money left</h3>
    <div class="list">${sources.length ? sources.slice(0, 8).map(s => html`<div class="li"><div class="grow"><div class="title">${s.name}</div><div class="meta">${money(s.left)} left · ${payerLabel(s.payer)}</div></div><button class="btn sm" onClick=${() => fromCat(s)}>Take ${money(Math.min(a(), s.left))}</button></div>`) : html`<div class="muted small">No other budget has money left this month.</div>`}</div>
    <h3 style=${{ marginTop: '16px' }}>Or save a little less this month</h3>
    <div class="list">${potLines.length ? potLines.map(l => html`<div class="li"><div class="grow"><div class="title">${l.label}</div><div class="meta">${memberName(l.member)} · ${money(l.left)} still to move</div></div><button class="btn sm" onClick=${() => fromPotLine(l)}>Use ${money(Math.min(a(), l.left))}</button></div>`) : html`<div class="muted small">No pot transfers left to reduce this month.</div>`}</div>
  <//>`;
}

/* ---------- Claude's category suggestions ---------- */
function SuggestModal({ monthKey: key, sugg }) {
  const M = model(key);
  const [pick, setPick] = useState(Object.fromEntries(sugg.map(s => [s.id, s.confidence !== 'low'])));
  const apply = () => {
    const patch = {};
    sugg.forEach(s => { if (pick[s.id]) patch[s.id] = { category: s.category }; });
    const n = Object.keys(patch).length;
    if (!n) { closeModal(); return; }
    API.month(key, { txns: patch }).then(ok => { if (ok) { closeModal(); toast(`Sorted ${n} transaction${n > 1 ? 's' : ''}`); } });
  };
  return html`<${Modal} title="Claude's suggestions" onClose=${closeModal} foot=${html`<button class="btn ghost" onClick=${closeModal}>Cancel</button><button class="btn primary" onClick=${apply}>Apply ticked</button>`}>
    ${sugg.length ? html`<div class="list">${sugg.map(s => { const t = M.txns.find(x => x.id === s.id); if (!t) return null; return html`<div class="li"><${Check} checked=${!!pick[s.id]} label=${'Use suggestion for ' + t.desc} onToggle=${() => setPick(Object.assign({}, pick, { [s.id]: !pick[s.id] }))} />
      <div class="grow"><div class="title">${t.desc} <span class="muted">· ${money(t.amount)}</span></div><div class="meta">${categoryName(S.plan, s.category)}${s.confidence === 'low' ? ' · not sure' : ''}</div></div></div>`; })}</div>`
      : html`<div class="empty">Claude couldn't match these to your categories. Pick them by hand.</div>`}
  <//>`;
}

/* ---------- bank statement import ---------- */
function ImportModal() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [account, setAccount] = useState(defaultAccountFor(S.me || 'm1'));
  const [negOut, setNegOut] = useState(null);
  const [rows, setRows] = useState(null);
  const [drag, setDrag] = useState(false);
  const accObj = account && S.plan.accounts[account];
  const member = accObj ? (accObj.owner === 'joint' ? 'joint' : accObj.owner) : (S.me || 'm1');
  const build = (src, neg) => {
    const parsed = E.bankRows(src, { outIsNegative: false });
    if (!parsed.rows.length) { setRows([]); return; }
    const single = parsed.cols && parsed.cols.amount >= 0 && parsed.cols.debit < 0;
    let n = neg;
    if (n == null) n = single ? (accObj && accObj.type === 'credit' ? false : parsed.rows.filter(r => r.amount < 0).length > parsed.rows.length / 2) : false;
    setNegOut(single ? n : null);
    const existing = [];
    Object.values(S.months).forEach(m => E.txnsOf(m).forEach(t => existing.push(t)));
    const out = parsed.rows.map((r, i) => {
      const amount = single && n ? -r.amount : r.amount;
      const g = E.categorise(S.plan, r.desc, member === 'joint' ? (S.me || 'm1') : member, amount);
      const dup = existing.find(t => t.date === r.date && Math.abs((+t.amount || 0) - amount) < 0.005 && (E.merchantKey(t.desc) === E.merchantKey(r.desc) || t.source === 'import'));
      const incoming = amount < 0;
      return { i, date: r.date, desc: r.desc, amount: E.r2(amount), category: g ? g.category : (incoming ? 'income' : ''), auto: !!g, dup: !!dup, use: !dup && !(incoming && (!g || g.category === 'income')) };
    });
    setRows(out);
  };
  const onFile = f => { if (!f) return; setFileName(f.name); const rd = new FileReader(); rd.onload = () => { setText(String(rd.result || '')); build(String(rd.result || ''), null); }; rd.readAsText(f); };
  const doImport = () => {
    const chosen = rows.filter(r => r.use);
    if (!chosen.length) { toast('Tick at least one row'); return; }
    const byMonth = {};
    chosen.forEach(r => { const mk = E.monthOf(r.date); (byMonth[mk] = byMonth[mk] || {})[uid('i')] = { date: r.date, desc: r.desc, amount: r.amount, category: r.category || null, member, account: account || null, createdAt: new Date().toISOString(), source: 'import', by: S.viewerId || null }; });
    Promise.all(Object.entries(byMonth).map(([mk, txns]) => API.month(mk, { txns }))).then(res => { if (res.every(Boolean)) { closeModal(); toast(`Imported ${chosen.length} transaction${chosen.length > 1 ? 's' : ''}${Object.keys(byMonth).length > 1 ? ' across ' + Object.keys(byMonth).length + ' months' : ''}`); } });
  };
  const used = rows ? rows.filter(r => r.use) : [];
  return html`<${Modal} title="Import a bank statement" wide=${true} onClose=${closeModal}
    foot=${rows && rows.length ? html`<span class="small muted" style=${{ marginRight: 'auto' }}>${used.length} of ${rows.length} rows ticked · ${money(E.sum(used, r => r.amount))}</span><button class="btn ghost" onClick=${() => setRows(null)}>Start again</button><button class="btn primary" onClick=${doImport}>Import ${used.length}</button>` : null}>
    ${!rows ? html`<div class="stack">
      <p class="ink2">Download a CSV statement from Lloyds, NatWest, Amex or any bank, then drop it here. Nothing leaves this page until you press Import, and duplicates are skipped.</p>
      <label class="lab" style=${{ maxWidth: '360px' }}>Which account is this statement from?<${AccountSelect} id="imp-acc" value=${account} onChange=${setAccount} /></label>
      <div class=${cls('drop', drag && 'on')} onDragOver=${e => { e.preventDefault(); setDrag(true); }} onDragLeave=${() => setDrag(false)} onDrop=${e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}>
        <${Icon} name="upload" size=${26} /><p style=${{ marginTop: '8px' }}><b>Drop a CSV file here</b> or <label style=${{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>choose one<input type="file" id="imp-file" accept=".csv,text/csv,text/plain" style=${{ display: 'none' }} onChange=${e => onFile(e.target.files[0])} /></label></p>
        ${fileName && html`<p class="small muted">${fileName}</p>`}
      </div>
      <details class="fold"><summary><span class="caret"><${Icon} name="right" size=${14} /></span>Or paste the statement text</summary>
        <textarea class="field" id="imp-text" style=${{ marginTop: '8px', fontFamily: 'ui-monospace, monospace', fontSize: '12px' }} placeholder="Date,Description,Amount" value=${text} onInput=${e => setText(e.target.value)}></textarea>
        <button class="btn sm" style=${{ marginTop: '8px' }} onClick=${() => build(text, null)}>Read it</button>
      </details>
    </div>` : rows.length === 0 ? html`<div class="empty"><h3>No transactions found</h3>The file needs a date column and an amount (or paid in / paid out) column.<div style=${{ marginTop: '10px' }}><button class="btn" onClick=${() => setRows(null)}>Try another file</button></div></div>`
    : html`<div class="stack">
      ${negOut != null && html`<div class="row small"><span class="muted">In this file, money going out shows as</span><${Seg} label="Sign of spending" value=${negOut ? 'neg' : 'pos'} onChange=${v => build(text, v === 'neg')} options=${[{ value: 'neg', label: 'minus (−41.52)' }, { value: 'pos', label: 'plus (41.52)' }]} /></div>`}
      <div class="table-wrap"><table class="ledger"><thead><tr><th></th><th>Date</th><th>Description</th><th>Category</th><th class="n">Amount</th></tr></thead><tbody>
        ${rows.map((r, idx) => html`<tr style=${{ opacity: r.use ? 1 : 0.55 }}>
          <td><${Check} checked=${r.use} label=${'Import ' + r.desc} onToggle=${() => setRows(rows.map((x, j) => j === idx ? Object.assign({}, x, { use: !x.use }) : x))} /></td>
          <td style=${{ whiteSpace: 'nowrap' }}>${dayLabel(r.date, { weekday: undefined })}</td>
          <td>${r.desc}${r.dup ? html` <span class="chip warn">already logged</span>` : ''}${r.amount < 0 ? html` <span class="chip">money in</span>` : ''}</td>
          <td style=${{ minWidth: '200px' }}><${CatSelect} id=${'imp-cat-' + idx} value=${r.category} onChange=${v => setRows(rows.map((x, j) => j === idx ? Object.assign({}, x, { category: v }) : x))} emptyLabel="Needs a category" /></td>
          <td class="n">${money(r.amount)}</td></tr>`)}
      </tbody></table></div>
    </div>`}
  <//>`;
}
