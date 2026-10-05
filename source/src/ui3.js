/* ===== UI part 3: pots & debts, review, travel, Sri Lanka, big plans ===== */
function parseWhen(when) {
  const m = String(when || '').toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/);
  if (!m) return null;
  const i = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1]) + 1;
  return m[2] + '-' + E.pad(i);
}

function potMonthly(potId) { return E.sum(E.planLines(S.plan).filter(l => l.pot === potId), l => l.amount); }
function Pots() {
  const M = model();
  const P = projection();
  const ps = E.pots(S.plan);
  const lkr = E.fx(S.plan, 'LKR');
  const accs = E.accounts(S.plan);
  const L = M.ledger;
  const accBal = {};
  ps.forEach(p => { if (p.account) accBal[p.account] = (accBal[p.account] || 0) + (M.endBal[p.id] || 0); });
  return html`<div class="page">
    <${Banners} />
    <div class="banner accent"><${Icon} name="info" /><div class="grow"><b>Save each goal in the currency you'll spend it in.</b> Pots you'll spend in Sri Lanka can sit in rupees${rupeeFund() ? ' in the ' + rupeeFund().name : ''}; pots you'll spend in the UK stay in pounds at about 4.5 to 5%.</div></div>
    <div class="pots">${ps.map(p => {
      const bal = M.endBal[p.id] || 0, target = E.potTarget(S.plan, p);
      const acc = p.account && S.plan.accounts[p.account];
      const done = P.doneAt[p.id];
      const monthly = potMonthly(p.id);
      const complete = E.isComplete(S.plan, p, M.endBal);
      return html`<section class="panel pot">
        <div class="pot-top"><${Ring} value=${bal} max=${target} size=${60} color=${p.group === 'srilanka' ? 'var(--rupee)' : null} />
          <div class="grow"><div class="pot-name">${p.name}</div><div class="pot-bal">${money(bal, { auto: true })}</div>
          ${p.currency === 'LKR' && html`<div class="small" style=${{ color: 'var(--rupee)', fontWeight: 700 }}>≈ ${rupees(bal * lkr)}</div>`}</div></div>
        <div class="pot-facts">
          <div><span>Target</span><b>${target > 0 ? money(target, { whole: true }) : p.sinking ? 'Refilled monthly' : 'No limit'}</b></div>
          <div><span>Each month</span><b>${monthly > 0 ? money(monthly, { whole: monthly >= 1000 }) : html`<span class="muted" style=${{ fontWeight: 600 }}>From finished goals</span>`}</b></div>
          <div><span>Full by</span><b>${complete ? 'Reached' : done === 'done' ? 'Reached' : done ? monthLabel(done, true) : target > 0 ? 'After 6 years' : '—'}</b></div>
          <div><span>Kept in</span><b style=${{ overflowWrap: 'anywhere' }}>${acc ? acc.name : 'Not set'}</b></div>
        </div>
        ${p.why && html`<div class="tiny muted">${p.why}</div>`}
        <div class="row">
          ${complete && p.status !== 'done' ? html`<span class="chip good"><${Icon} name="check" size=${11} /> Goal reached</span>` : p.status === 'done' ? html`<span class="chip good">Done · money moves on</span>` : null}
          <span class="spacer"></span>
          <button class="btn sm" onClick=${() => openModal('potmove', { pot: p.id, mode: 'in' })} disabled=${S.readOnly}>Add</button>
          <button class="btn sm" onClick=${() => openModal('potmove', { pot: p.id, mode: 'out' })} disabled=${S.readOnly}>Take out</button>
          <button class="iconbtn" aria-label=${'Edit ' + p.name} onClick=${() => openModal('pot', { pot: p.id })}><${Icon} name="edit" /></button>
        </div>
      </section>`;
    })}</div>
    <div class="row"><button class="btn" onClick=${() => openModal('pot', { pot: null })} disabled=${S.readOnly}><${Icon} name="plus" />New pot</button></div>

    <${Panel} title="Debts and cards" sub="Pay cards in full every month so no interest is charged. Purchases on a card add to its balance; repayments bring it down.">
      <div class="list">${E.debts(S.plan).map(d => {
        const bal = L.debtEnd[d.id];
        const charges = E.r2(E.sum(Object.values(L.flows).map(f => f.debtCharge[d.id] || 0)));
        const paid = E.r2(E.sum(Object.values(L.flows).map(f => f.debtPay[d.id] || 0)));
        return html`<div class="li" style=${{ alignItems: 'flex-start' }}><span class="avatar" style=${{ background: 'var(--s5)' }}><${Icon} name="payday" size=${14} /></span>
          <div class="grow"><div class="title">${d.name} ${d.payInFull && html`<span class="chip warn">Pay in full</span>`}</div>
            <div class="meta">${d.note || ''}</div>
            <div class="meta">${d.startBalance != null ? `Started at ${money(d.startBalance)}${d.asOf ? ' on ' + dayLabel(d.asOf) : ''}` : 'Balance not added yet'}${charges ? ` · ${money(charges)} spent on it since` : ''}${paid ? ` · ${money(paid)} repaid` : ''}</div></div>
          <div class="stack" style=${{ alignItems: 'flex-end', gap: '4px' }}>
            ${bal == null ? html`<${EditMoney} value=${null} placeholder="Add balance" title=${'Balance left on ' + d.name} onCommit=${v => API.plan({ debts: { [d.id]: { startBalance: v, asOf: todayStr() } } })} />`
              : html`<span class="amt" style=${{ fontSize: '18px' }}>${money(bal)}</span>${bal <= 0.005 ? html`<span class="chip good">Clear</span>` : null}`}
            <button class="btn ghost sm" style=${{ minHeight: '24px' }} onClick=${() => openModal('debt', { debt: d.id })}>Edit</button>
          </div></div>`;
      })}</div>
      <div class="row" style=${{ marginTop: '10px' }}><button class="btn sm" onClick=${() => openModal('debt', { debt: null })} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Add a debt or card</button></div>
    <//>

    <${Panel} title="Where the money is kept" sub="Accounts, what they pay, and what lives in each. Estimates use the balances above.">
      <div class="table-wrap"><table class="ledger"><thead><tr><th>Account</th><th class="hide-sm">Owner</th><th class="n">Rate</th><th class="n">In pots</th><th class="n">Interest<span class="hide-sm"> a year</span></th><th class="hide-sm">Note</th></tr></thead><tbody>
        ${accs.map(a => { const b = accBal[a.id] || 0; return html`<tr class=${a.note ? 'has-note' : ''}><td class="strong">${a.name}${a.currency === 'LKR' ? html` <span class="chip rupee">LKR</span>` : ''}<div class="tiny muted show-sm" style=${{ fontWeight: 500 }}>${a.owner === 'joint' ? 'Joint' : memberName(a.owner)}</div></td><td class="hide-sm">${a.owner === 'joint' ? 'Joint' : memberName(a.owner)}</td>
          <td class="n">${a.rate ? pct(a.rate, 2) : '—'}</td><td class="n">${b ? money(b) : '—'}</td><td class="n">${a.rate && b > 0 ? money(b * a.rate) + (a.currency === 'LKR' ? ' (' + rupees(b * a.rate * lkr) + ')' : '') : '—'}</td><td class="small muted hide-sm" style=${{ minWidth: '220px' }}>${a.note || ''}</td></tr>
          ${a.note && html`<tr class="note-row"><td colspan="6" class="tiny muted">${a.note}</td></tr>`}`; })}
      </tbody></table></div>
    <//>
  </div>`;
}
// the household's rupee accounts, from the plan: an interest-paying fund and an everyday account
function rupeeFund() { return E.accounts(S.plan).find(a => a.currency === 'LKR' && +a.rate > 0) || null; }
function rupeeAccount() { return E.accounts(S.plan).find(a => a.currency === 'LKR' && !(+a.rate > 0)) || null; }
function PotMoveModal({ pot, mode }) {
  const M = model();
  const p = S.plan.pots[pot];
  const bal = M.endBal[pot] || 0;
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [m, setM] = useState(mode || 'in');
  if (!p) return null;
  const save = () => {
    const a = parseMoney(amt);
    if (a == null) { toast('Add an amount'); return; }
    let delta = m === 'in' ? a : m === 'out' ? -a : E.r2(a - bal);
    API.month(S.monthKey, { potMoves: { [uid('p')]: { pot, amount: E.r2(delta), date: defaultDateFor(S.monthKey), note: note.trim() || (m === 'set' ? 'Balance check' : m === 'in' ? 'Added' : 'Taken out'), by: S.viewerId || null } } })
      .then(ok => { if (ok) { closeModal(); toast(m === 'set' ? `${p.name} now shows ${money(a)}` : `${m === 'in' ? 'Added' : 'Took'} ${money(a)} ${m === 'in' ? 'to' : 'from'} ${p.name}`); } });
  };
  return html`<${Modal} title=${p.name} onClose=${closeModal} foot=${html`<button class="btn ghost" onClick=${closeModal}>Cancel</button><button class="btn primary" onClick=${save}>Save</button>`}>
    <p class="ink2">Balance now <b>${money(bal)}</b>. Use this for money moved outside the payday transfers, spending from the pot, or to match a bank statement.</p>
    <div class="stack" style=${{ marginTop: '12px' }}>
      <${Seg} label="What happened" value=${m} onChange=${setM} options=${[{ value: 'in', label: 'Added money' }, { value: 'out', label: 'Took money out' }, { value: 'set', label: 'Set the actual balance' }]} />
      <div class="form-grid">
        <label class="lab">${m === 'set' ? 'Actual balance' : 'Amount'}<div class="money-in"><span>£</span><input class="field" id="pm-amt" inputmode="decimal" value=${amt} onInput=${e => setAmt(e.target.value)} /></div></label>
        <label class="lab">Note <span class="hint">optional</span><input class="field" id="pm-note" value=${note} onInput=${e => setNote(e.target.value)} /></label>
      </div>
      ${p.currency === 'LKR' && html`<p class="small" style=${{ color: 'var(--rupee)' }}>This pot is kept in rupees. Enter the pound value (rupees ÷ ${E.fx(S.plan, 'LKR')}).</p>`}
    </div>
  <//>`;
}
function PotModal({ pot }) {
  const isNew = !pot;
  const p0 = pot ? S.plan.pots[pot] : { name: '', target: 0, priority: E.pots(S.plan).length + 1, account: '', opening: 0 };
  const [f, setF] = useState(Object.assign({}, p0));
  const set = (k, v) => setF(Object.assign({}, f, { [k]: v }));
  const save = () => {
    if (!String(f.name || '').trim()) { toast('Give the pot a name'); return; }
    const id = pot || uid('p');
    const data = { name: f.name.trim(), priority: +f.priority || 99, account: f.account || null, currency: f.currency || 'GBP', opening: +f.opening || 0, why: f.why || '', group: f.group || 'goals' };
    if (!f.targetFrom) data.target = +f.target || 0;
    if (f.runningCost != null) data.runningCost = +f.runningCost || 0;
    API.plan({ pots: { [id]: data } }).then(ok => ok && (closeModal(), toast(isNew ? 'Pot added' : 'Pot saved')));
  };
  const markDone = () => API.plan({ pots: { [pot]: { status: f.status === 'done' ? 'saving' : 'done' } } }).then(ok => ok && closeModal());
  const del = () => API.plan({ pots: { [pot]: { deleted: true } } }).then(ok => ok && (closeModal(), toast('Pot removed', { label: 'Undo', fn: () => API.plan({ pots: { [pot]: { deleted: false } } }) })));
  return html`<${Modal} title=${isNew ? 'New pot' : 'Edit ' + p0.name} onClose=${closeModal}
    foot=${html`${!isNew && html`<button class="btn danger ghost" style=${{ marginRight: 'auto' }} onClick=${del}>Remove</button>`}${!isNew && html`<button class="btn" onClick=${markDone}>${f.status === 'done' ? 'Start saving again' : 'Mark as done'}</button>`}<button class="btn primary" onClick=${save}>Save</button>`}>
    <div class="form-grid">
      <label class="lab" style=${{ gridColumn: '1 / -1' }}>Name<input class="field" id="pot-name" value=${f.name} onInput=${e => set('name', e.target.value)} /></label>
      ${f.targetFrom ? html`<label class="lab">Target<span class="hint">set by the ${f.targetFrom === 'house' ? 'house' : f.targetFrom === 'wedding' ? 'wedding' : 'vehicle'} calculator: ${money(E.potTarget(S.plan, f), { whole: true })}</span></label>`
        : html`<label class="lab">Target <span class="hint">0 = no limit</span><div class="money-in"><span>£</span><input class="field" id="pot-target" inputmode="decimal" value=${f.target || ''} onInput=${e => set('target', parseMoney(e.target.value) || 0)} /></div></label>`}
      <label class="lab">Priority <span class="hint">1 = fill first</span><input class="field" id="pot-pri" type="number" min="1" value=${f.priority} onInput=${e => set('priority', e.target.value)} /></label>
      <label class="lab">Kept in<${AccountSelect} id="pot-acc" value=${f.account} onChange=${v => set('account', v)} /></label>
      <label class="lab">Currency<select class="field" id="pot-cur" value=${f.currency || 'GBP'} onChange=${e => set('currency', e.target.value)}><option value="GBP">Pounds</option><option value="LKR">Rupees</option></select></label>
      <label class="lab">Balance at the start <span class="hint">before this planner</span><div class="money-in"><span>£</span><input class="field" id="pot-open" inputmode="decimal" value=${f.opening || ''} onInput=${e => set('opening', parseMoney(e.target.value) || 0)} /></div></label>
      <label class="lab">Group<select class="field" id="pot-grp" value=${f.group || 'goals'} onChange=${e => set('group', e.target.value)}><option value="safety">Safety net</option><option value="family">Family</option><option value="goals">Goals</option><option value="srilanka">Sri Lanka family</option></select></label>
      <label class="lab" style=${{ gridColumn: '1 / -1' }}>What it's for<input class="field" id="pot-why" value=${f.why || ''} onInput=${e => set('why', e.target.value)} /></label>
    </div>
    <p class="small muted" style=${{ marginTop: '12px' }}>When a pot reaches its target, its monthly money moves to the next unfinished pot by priority. Set the monthly amount on Plan & settings, under Savings lines.</p>
  <//>`;
}
function DebtModal({ debt }) {
  const d0 = debt ? S.plan.debts[debt] : { name: '', startBalance: null, payInFull: false };
  const [f, setF] = useState(Object.assign({}, d0));
  const set = (k, v) => setF(Object.assign({}, f, { [k]: v }));
  const save = () => {
    if (!String(f.name || '').trim()) { toast('Give it a name'); return; }
    const id = debt || uid('d');
    API.plan({ debts: { [id]: { name: f.name.trim(), startBalance: f.startBalance == null || f.startBalance === '' ? null : +f.startBalance, asOf: f.asOf || todayStr(), payInFull: !!f.payInFull, note: f.note || '', account: f.account || null } } })
      .then(ok => { if (ok && f.account) API.plan({ accounts: { [f.account]: { debt: id } } }); if (ok) closeModal(); });
  };
  return html`<${Modal} title=${debt ? 'Edit ' + d0.name : 'Add a debt or card'} onClose=${closeModal} foot=${html`${debt && html`<button class="btn danger ghost" style=${{ marginRight: 'auto' }} onClick=${() => API.plan({ debts: { [debt]: { deleted: true } } }).then(ok => ok && closeModal())}>Remove</button>`}<button class="btn primary" onClick=${save}>Save</button>`}>
    <div class="form-grid">
      <label class="lab" style=${{ gridColumn: '1 / -1' }}>Name<input class="field" id="debt-name" value=${f.name} onInput=${e => set('name', e.target.value)} /></label>
      <label class="lab">Balance<div class="money-in"><span>£</span><input class="field" id="debt-bal" inputmode="decimal" value=${f.startBalance == null ? '' : f.startBalance} onInput=${e => set('startBalance', parseMoney(e.target.value))} /></div></label>
      <label class="lab">As of<input class="field" type="date" id="debt-asof" value=${f.asOf || todayStr()} onInput=${e => set('asOf', e.target.value)} /></label>
      <label class="lab">Card account <span class="hint">purchases on it add to the balance</span><${AccountSelect} id="debt-acc" value=${f.account} onChange=${v => set('account', v)} /></label>
      <label class="lab">Pay in full each month<select class="field" id="debt-full" value=${f.payInFull ? 'yes' : 'no'} onChange=${e => set('payInFull', e.target.value === 'yes')}><option value="yes">Yes</option><option value="no">No, paying it down</option></select></label>
      <label class="lab" style=${{ gridColumn: '1 / -1' }}>Note<input class="field" id="debt-note" value=${f.note || ''} onInput=${e => set('note', e.target.value)} /></label>
    </div>
  <//>`;
}

/* ---------- month review ---------- */
function Review() {
  const M = model();
  const key = M.key;
  const T = M.totals;
  const rev = (M.month.review) || {};
  const [note, setNote] = useState(rev.note || '');
  const [claudeText, setClaudeText] = useState('');
  const [busy, setBusy] = useState(false);
  const ctl = useRef(null);
  useEffect(() => { setNote(rev.note || ''); }, [key, rev.note]);
  const divRows = M.groups.filter(g => g.budget > 0 || g.spent > 0).map(g => ({ name: g.name, value: E.r2(g.budget - g.spent) }));
  const disc = M.cats.filter(c => c.kind === 'discretionary');
  const leftovers = disc.filter(c => c.left > 0.5);
  const leftTotal = E.r2(E.sum(leftovers, c => c.left));
  const [sweepPot, setSweepPot] = useState((E.pots(S.plan).find(p => E.potTarget(S.plan, p) > 0 && !E.isComplete(S.plan, p, M.endBal)) || {}).id || '');
  const merchants = {};
  M.txns.filter(t => M.catById[t.category]).forEach(t => { const k = E.merchantKey(t.desc) || t.desc; merchants[k] = (merchants[k] || 0) + (+t.amount || 0); });
  const top = Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const history = Object.keys(S.months).filter(k => k <= thisMonth()).sort().slice(-12).map(k => { const mm = model(k); return { key: k, spent: mm.totals.spent, saved: mm.totals.saved }; }).filter(r => r.spent > 0 || r.saved > 0);
  const sweep = () => {
    if (!sweepPot || !leftovers.length) return;
    const moves = {};
    leftovers.forEach(c => { moves[uid('s')] = { pot: sweepPot, amount: E.r2(c.left), fromCategory: c.id, date: key + '-' + E.pad(E.daysInMonth(key)), note: 'Left over in ' + c.name }; });
    API.month(key, { potMoves: moves }).then(ok => ok && toast(`Moved ${money(leftTotal)} of leftovers into ${S.plan.pots[sweepPot].name}`));
  };
  const close = () => API.month(key, { review: { closed: !rev.closed, closedAt: todayStr(), summary: { income: T.income, spent: T.spent, saved: T.saved, planSpend: T.planSpend } } });
  const askClaude = async () => {
    if (!S.sample) return;
    ctl.current = new AbortController();
    setBusy(true); setClaudeText('Thinking…');
    const people = M.members.map(m => { const r = M.res[m.id]; return `${memberName(m.id)}: take-home ${money(r.income)}${r.received ? '' : ' (expected)'}, planned out ${money(r.allocated)}, still to move ${money(r.toMove)}`; }).join('\n');
    const cats = M.cats.filter(c => c.budget > 0 || c.spent > 0).map(c => `${c.name} (${payerLabel(c.payer)}, ${c.kind}): budget ${money(c.budget)}, spent ${money(c.spent)}`).join('\n');
    const pots = E.pots(S.plan).map(p => `${p.name}: ${money(M.endBal[p.id] || 0)}${E.potTarget(S.plan, p) > 0 ? ' of ' + money(E.potTarget(S.plan, p)) : ''}`).join('\n');
    const about = (S.plan.household && S.plan.household.about) || '';
    const prompt = `You are reviewing one month of a UK couple's household budget.${about ? ' ' + about : ''}\n\nMonth: ${monthLabel(key)}\n\nPay:\n${people}\n\nBudgets:\n${cats}\n\nSaved into pots this month: ${money(T.saved)} of ${money(T.savePlanned)} planned.\nPot balances:\n${pots}\n\nWrite a short, warm and plain-English review for both of them. Use these headings on their own lines: "What went well", "Watch", "Next month". Two or three short bullet points under each (start bullets with "- "). Use real numbers from above. No more than 170 words. No preamble.`;
    try {
      const { text } = await S.sample(prompt, { signal: ctl.current.signal, onText: ({ text }) => setClaudeText(text), cache: false });
      setClaudeText(text);
      API.month(key, { review: { claude: text, claudeAt: todayStr() } });
    } catch (e) {
      if (e && e.code === 'cancelled') setClaudeText(e.text || '');
      else { setClaudeText(e && e.text ? e.text : ''); toast(e && (e.code === 'not_granted' || e.code === 'sampling_disabled') ? 'Claude is not available for this planner.' : "Claude couldn't write the review just now. Try again later."); }
    } finally { setBusy(false); }
  };
  const shownClaude = claudeText || rev.claude || '';
  return html`<div class="page">
    <${Banners} />
    <div class="kpis">
      <div class="kpi"><div class="lbl">Pay in</div><div class="val">${money(T.income, { auto: true })}</div><div class="sub">${money(T.incomeReceived, { auto: true })} received so far</div></div>
      <div class="kpi"><div class="lbl">Spent from budgets</div><div class="val">${money(T.spent, { auto: true })}</div><div class="sub">${T.spent <= T.planSpend ? money(T.planSpend - T.spent, { auto: true }) + ' under plan' : money(T.spent - T.planSpend, { auto: true }) + ' over plan'}</div></div>
      <div class="kpi"><div class="lbl">Saved into pots</div><div class="val">${money(T.saved, { auto: true })}</div><div class="sub">of ${money(T.savePlanned, { auto: true })} planned</div></div>
      <div class="kpi"><div class="lbl">Savings rate</div><div class="val">${T.income ? pct(T.saved / T.income) : '—'}</div><div class="sub">${T.income ? pct(T.savePlanned / T.income) + ' planned' : ''}</div></div>
    </div>
    <div class="grid g2">
      <${Panel} title="Under or over budget, by area" sub="Right of the line is money left; left of it is overspending.">
        ${divRows.length ? html`<${DivergingBars} rows=${divRows} />` : html`<div class="empty">No budgets yet.</div>`}
        <div class="legend"><span><i class="k-box" style=${{ background: 'var(--s1)' }}></i>Under budget</span><span><i class="k-box" style=${{ background: 'var(--s8)' }}></i>Over budget</span></div>
      <//>
      <${Panel} title="Who paid for what" sub="How each of you carried the month.">
        <div class="table-wrap"><table class="ledger"><thead><tr><th></th>${M.members.map(m => html`<th class="n">${memberName(m.id, { you: true })}</th>`)}</tr></thead><tbody>
          <tr><td>Pay</td>${M.members.map(m => html`<td class="n">${money(M.res[m.id].income)}</td>`)}</tr>
          ${(M.pools || []).map(pv => html`<tr><td>Into the ${pv.id === 'joint' ? 'joint account' : poolShort(pv).toLowerCase()}</td>${M.members.map(m => html`<td class="n">${money(E.sum(M.res[m.id].lines.filter(l => (l.kind === 'joint' || l.kind === 'cover') && (l.pool || 'joint') === pv.id), l => l.covered + l.ticked))}</td>`)}</tr>`)}
          <tr><td>Own bills & personal spending</td>${M.members.map(m => html`<td class="n">${money(E.sum(M.res[m.id].lines.filter(l => l.kind === 'own'), l => l.covered))}</td>`)}</tr>
          <tr><td>Saved into pots</td>${M.members.map(m => html`<td class="n">${money(E.sum(M.res[m.id].lines.filter(l => l.kind === 'pot' || (l.kind === 'buffer' && l.pot)), l => l.covered + l.ticked))}</td>`)}</tr>
          <tr><td>Sri Lanka family support</td>${M.members.map(m => html`<td class="n">${money(E.sum(M.res[m.id].lines.filter(l => l.kind === 'support'), l => l.covered))}</td>`)}</tr>
          <tr><td>Debt repaid</td>${M.members.map(m => html`<td class="n">${money(E.sum(M.res[m.id].lines.filter(l => l.kind === 'debt'), l => l.covered + l.ticked))}</td>`)}</tr>
        </tbody></table></div>
        <p class="small muted" style=${{ marginTop: '8px' }}>Spent straight from the ${(M.pools || []).length > 1 ? 'shared accounts' : 'joint account'}: ${money(M.byMember.joint || 0)}.</p>
      <//>
    </div>
    <div class="grid g2">
      <${Panel} title="Discretionary spending" sub=${`${money(T.discretionarySpent)} on takeaways, eating out, personal money and other choices this month.`}>
        <${BudgetBars} rows=${disc.filter(c => c.budget > 0 || c.spent > 0).map(c => ({ name: c.name, sub: payerLabel(c.payer, { you: true }), budget: c.budget, spent: c.spent }))} />
        ${top.length > 0 && html`<h3 style=${{ marginTop: '16px' }}>Where it went</h3><div class="list">${top.map(([k, v]) => html`<div class="li"><div class="grow title" style=${{ textTransform: 'capitalize' }}>${k}</div><div class="amt">${money(v)}</div></div>`)}</div>`}
      <//>
      <${Panel} title="Leftovers" sub="Money not spent from discretionary budgets can go into a pot instead of drifting.">
        ${leftovers.length ? html`<div class="stack">
          <div class="big" style=${{ fontSize: '30px', fontWeight: 800 }}>${money(leftTotal)}</div>
          <div class="small muted">${leftovers.map(c => c.name + ' ' + money(c.left)).join(' · ')}</div>
          <div class="row" style=${{ flexWrap: 'nowrap' }}><${PotSelect} id="sweep-pot" value=${sweepPot} onChange=${setSweepPot} /><button class="btn primary" onClick=${sweep} disabled=${S.readOnly}>Move it</button></div>
          <p class="tiny muted">Best done on the last day of the month, once the spending is in.</p></div>`
          : html`<div class="empty">Nothing left over in discretionary budgets.</div>`}
      <//>
    </div>
    <${Panel} title="Notes for this month" sub="Shared between you both. Saved when you click away." actions=${html`<button class=${cls('btn sm', rev.closed ? '' : 'primary')} onClick=${close} disabled=${S.readOnly}>${rev.closed ? 'Reopen month' : 'Close the month'}</button>`}>
      ${rev.closed && html`<div class="banner good" style=${{ marginBottom: '10px' }}><${Icon} name="check" /><div class="grow">Closed on ${dayLabel(rev.closedAt)}.</div></div>`}
      <textarea class="field" id="review-note" placeholder="What happened this month, decisions you made, things to change next month" value=${note} onInput=${e => setNote(e.target.value)} onBlur=${() => { if (note !== (rev.note || '')) API.month(key, { review: { note } }); }}></textarea>
      ${S.sample && html`<div class="row" style=${{ marginTop: '14px' }}><button class="btn" onClick=${askClaude} disabled=${busy}><${Icon} name="spark" size=${15} />${busy ? 'Claude is writing…' : shownClaude ? 'Ask Claude again' : 'Ask Claude to review the month'}</button>${busy && html`<button class="btn ghost sm" onClick=${() => ctl.current && ctl.current.abort()}>Stop</button>`}</div>`}
      ${shownClaude && html`<div class="claude-out" style=${{ marginTop: '12px' }}>${shownClaude}</div>`}
    <//>
    ${history.length >= 2 && html`<${Panel} title="Month by month" sub="Spent from budgets and saved into pots."><${TrendBars} rows=${history} /><//>`}
  </div>`;
}

/* ---------- travel ---------- */
const TRAVEL_OPTIONS = [
  { id: 'A', name: 'Full budget', monthly: 625, trips: 'Both trips, mid-range', from: '£350 from the house fund, £75 from eating out', cost: 'House fund about £24,000 smaller by 2031', set: { travel: 625, house: 0, eatingout: 75, takeaways: null } },
  { id: 'B', name: 'Middle (recommended)', monthly: 450, trips: 'Both trips; long-haul to Sri Lanka with family every other year', from: '£150 house fund, £50 takeaways, £50 eating out', cost: 'House fund about £8,500 smaller by 2031', set: { travel: 450, house: 200, eatingout: 100, takeaways: 100 } },
  { id: 'C', name: 'Keep £200', monthly: 200, trips: 'One trip a year, or two budget trips', from: 'Nothing changes', cost: 'No change', set: { travel: 200, house: 350, eatingout: 150, takeaways: 150 } },
];
function Travel() {
  const ts = E.trips(S.plan);
  const travelPot = E.pots(S.plan).find(p => p.sinking) || null;
  const [confirm, setConfirm] = useState(null);
  const cur = (S.plan.travel && S.plan.travel.option) || 'C';
  const lines = E.planLines(S.plan);
  const travelLine = travelPot && lines.find(l => l.pot === travelPot.id);
  const housePot = E.pots(S.plan).find(p => p.targetFrom === 'house');
  const houseLine = housePot && lines.find(l => l.pot === housePot.id);
  const catByRole = r => E.categories(S.plan).find(c => c.role === r);
  const apply = opt => {
    const patch = { travel: { option: opt.id }, lines: {}, categories: {} };
    if (travelLine) patch.lines[travelLine.id] = { amount: opt.set.travel };
    if (houseLine && opt.set.house != null) patch.lines[houseLine.id] = { amount: opt.set.house };
    if (opt.set.eatingout != null && catByRole('eatingout')) patch.categories[catByRole('eatingout').id] = { budget: opt.set.eatingout };
    if (opt.set.takeaways != null && catByRole('takeaways')) patch.categories[catByRole('takeaways').id] = { budget: opt.set.takeaways };
    API.plan(patch).then(ok => { if (ok) { setConfirm(null); toast(`Switched to option ${opt.id}: £${opt.monthly} a month for trips`); } });
  };
  const M = model();
  const P = projection();
  return html`<div class="page">
    ${ts.map(t => html`<${TripCard} key=${t.id} t=${t} pot=${travelPot} P=${P} M=${M} />`)}
    <div class="row"><button class="btn" onClick=${() => { const id = uid('trip'); API.plan({ trips: { [id]: { name: 'New trip', when: '', order: ts.length + 1, pot: travelPot ? travelPot.id : null, status: 'idea', budget: { b1: { label: 'Flights', amount: 0, order: 1 }, b2: { label: 'Places to stay', amount: 0, order: 2 }, b3: { label: 'Spending', amount: 0, order: 3 } } } } }); }} disabled=${S.readOnly}><${Icon} name="plus" />Plan another trip</button></div>
    <${Panel} title="Two trips a year" sub="A short-haul and a long-haul trip for two costs about £7,500 a year at a comfortable level (estimates for 2026). Pick how much to set aside.">
      <div class="grid g3">${TRAVEL_OPTIONS.map(o => html`<div class="panel flat" style=${{ borderColor: cur === o.id ? 'var(--accent)' : null, borderWidth: cur === o.id ? '2px' : null }}>
        <div class="row"><b>Option ${o.id}</b>${cur === o.id && html`<span class="chip accent">Current</span>`}</div>
        <div style=${{ fontSize: '24px', fontWeight: 800, margin: '4px 0' }}>£${o.monthly}<span class="small muted"> a month</span></div>
        <div class="small strong">${o.name}</div><div class="small ink2" style=${{ marginTop: '6px' }}>${o.trips}</div>
        <div class="tiny muted" style=${{ marginTop: '6px' }}>Comes from: ${o.from}</div><div class="tiny muted">Cost: ${o.cost}</div>
        ${cur !== o.id && html`<button class="btn sm" style=${{ marginTop: '10px' }} onClick=${() => setConfirm(o)} disabled=${S.readOnly}>Switch to ${o.id}</button>`}
      </div>`)}</div>
      ${confirm && html`<div class="banner warn" style=${{ marginTop: '12px' }}><${Icon} name="alert" /><div class="grow">Switching to option ${confirm.id} sets the holiday fund to <b>£${confirm.set.travel}</b> a month${confirm.set.house != null ? html`, the house fund to <b>£${confirm.set.house}</b>` : ''}${confirm.set.takeaways != null ? html`, takeaways to <b>£${confirm.set.takeaways}</b>` : ''}${confirm.set.eatingout != null ? html` and eating out to <b>£${confirm.set.eatingout}</b>` : ''}, from next payday.</div><div class="row"><button class="btn sm primary" onClick=${() => apply(confirm)}>Switch</button><button class="btn sm ghost" onClick=${() => setConfirm(null)}>Cancel</button></div></div>`}
      <div class="table-wrap" style=${{ marginTop: '14px' }}><table class="ledger"><thead><tr><th>For two</th><th class="n">Short-haul<span class="th-sub">6–7 nights</span></th><th class="n">Long-haul<span class="th-sub">12–14 nights</span></th></tr></thead><tbody>
        ${[['Return flights with bags', '£300–500', '£1,400–2,000'], ['Hotels', '£750–900', '£1,300–1,900'], ['Food and drink', '£550–700', '£1,000–1,400'], ['Local travel and transfers', '£100–150', '£250–400'], ['Activities and tours', '£150–250', '£300–500'], ['Visas, insurance, SIM, shopping', '£100–200', '£200–300'], ['Total', '£2,000–2,600', '£4,500–6,500']].map(r => html`<tr><td class=${r[0] === 'Total' ? 'strong' : ''}>${r[0]}</td><td class="n">${r[1]}</td><td class="n">${r[2]}</td></tr>`)}
      </tbody></table></div>
    <//>
    <${Panel} title="Booking flights for less" sub="What works, and what doesn't.">
      <div class="grid g2">
        <div><h3>Does save money</h3><ul class="small ink2" style=${{ paddingLeft: '18px', margin: '8px 0 0', display: 'grid', gap: '6px' }}>
          <li>Use Amex Membership Rewards points: they move to Singapore Airlines KrisFlyer or British Airways Avios.</li>
          <li>Search a whole month in Google Flights or Skyscanner; moving a day or two often saves more than any trick.</li>
          <li>Set price alerts, and book long-haul 3 to 5 months ahead, short-haul 2 to 3.</li>
          <li>Compare two one-way tickets with a return on routes in Asia.</li>
          <li>Check Gatwick and Stansted as well as Heathrow for the big trips.</li>
          <li>Book the final ticket on the airline's own website: changes and refunds are easier.</li></ul></div>
        <div><h3>Doesn't, or isn't worth it</h3><ul class="small ink2" style=${{ paddingLeft: '18px', margin: '8px 0 0', display: 'grid', gap: '6px' }}>
          <li>Searching at a certain time of day: prices change when seats sell, not by the clock.</li>
          <li>Clearing cookies or browsing incognito: no real evidence it changes the fare.</li>
          <li>A VPN to another country: small savings that the 3% foreign-currency fee often cancels, and fare rules can cause trouble.</li>
          <li>“Hidden city” tickets: airlines can cancel your return or your frequent-flyer account.</li></ul></div>
      </div>
    <//>
  </div>`;
}
function TripCard({ t, pot, P, M }) {
  const budget = E.live(t.budget).sort(E.byOrder);
  const total = E.sum(budget, b => b.amount);
  const spentTx = [];
  Object.values(S.months).forEach(m => E.txnsOf(m).forEach(x => { if (x.trip === t.id) spentTx.push(x); }));
  const spent = E.sum(spentTx, x => x.amount);
  const potBal = pot ? (M.endBal[pot.id] || 0) : 0;
  const tripKey = t.month || parseWhen(t.when);
  let byTrip = null;
  if (pot && tripKey && tripKey >= M.key) {
    byTrip = potBal + E.sum(M.members.flatMap(m => M.res[m.id].lines), l => (l.kind === 'pot' || (l.kind === 'buffer' && l.pot)) && l.pot === pot.id ? Math.max(0, l.left) : 0);
    for (let k = E.addMonths(M.key, 1); k <= tripKey; k = E.addMonths(k, 1)) {
      const mm = model(k);
      byTrip += E.sum(mm.members.flatMap(m => mm.res[m.id].lines), l => l.kind === 'pot' && l.pot === pot.id ? l.final : 0);
    }
    byTrip = E.r2(byTrip);
  }
  const upd = patch => API.plan({ trips: { [t.id]: patch } });
  return html`<${Panel} title=${html`<${EditText} value=${t.name} onCommit=${v => upd({ name: v })} title="Trip name" strong=${true} />`}
    sub=${html`<${EditText} value=${t.when} placeholder="When?" onCommit=${v => upd({ when: v })} title="When" />`}
    actions=${html`<select class="field" style=${{ width: 'auto' }} id=${'trip-status-' + t.id} aria-label="Trip status" value=${t.status || 'idea'} onChange=${e => upd({ status: e.target.value })}><option value="idea">Idea</option><option value="saving">Saving</option><option value="booked">Booked</option><option value="done">Done</option></select>
      <button class="btn sm primary" onClick=${() => openModal('add', { initial: { category: pot ? 'pot:' + pot.id + ':out' : '', trip: t.id } })} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Trip spending</button>`}>
    ${t.note && html`<p class="ink2" style=${{ marginBottom: '12px' }}>${t.note}</p>`}
    <div class="grid g2">
      <div>
        <div class="table-wrap"><table class="ledger"><thead><tr><th>Budget</th><th class="n">Amount</th><th></th></tr></thead><tbody>
          ${budget.map(b => html`<tr><td><${EditText} value=${b.label} onCommit=${v => upd({ budget: { [b.id]: { label: v } } })} /></td><td class="n"><${EditMoney} value=${b.amount} onCommit=${v => upd({ budget: { [b.id]: { amount: v } } })} /></td>
            <td class="n"><button class="iconbtn" aria-label="Remove line" onClick=${() => upd({ budget: { [b.id]: { deleted: true } } })}><${Icon} name="x" size=${14} /></button></td></tr>`)}
          <tr><td class="strong">Total</td><td class="n strong">${money(total)}</td><td><button class="iconbtn" aria-label="Add a line" onClick=${() => upd({ budget: { [uid('b')]: { label: 'New line', amount: 0, order: budget.length + 1 } } })}><${Icon} name="plus" size=${14} /></button></td></tr>
        </tbody></table></div>
      </div>
      <div class="stack">
        <div class="kpi"><div class="lbl">Spent on this trip so far</div><div class="val">${money(spent)}</div><div class="sub">of ${money(total)} budgeted</div><div class="meter"><i style=${{ width: pct(total ? Math.min(1, spent / total) : 0), background: spent > total ? 'var(--crit)' : null }}></i></div></div>
        ${pot && html`<div class="kpi"><div class="lbl">${pot.name} now</div><div class="val">${money(potBal)}</div><div class="sub">${byTrip != null ? html`About <b>${money(byTrip)}</b> by the end of ${monthLabel(tripKey)} with the planned transfers, against ${money(total - spent)} still to spend.${byTrip + 0.5 < total - spent ? html` <span class="chip warn">${money(total - spent - byTrip)} short</span>` : html` <span class="chip good">covered</span>`}` : 'Trip spending comes out of this pot.'}</div></div>`}
        ${spentTx.length > 0 && html`<div class="list">${spentTx.map(x => html`<div class="li small"><div class="grow">${x.desc}${x.foreign ? html` <span class="chip rupee">${x.foreign.currency} ${Number(x.foreign.amount).toFixed(2)}</span>` : ''}</div><div class="amt">${money(x.amount)}</div></div>`)}</div>`}
      </div>
    </div>
    ${S.checklist && E.live(S.checklist.items).some(i => i.group === (t.checklist || (t.id === 't_dec26' ? 'December trip' : t.name))) && html`<div style=${{ marginTop: '18px', borderTop: '1px solid var(--line)', paddingTop: '14px' }}><${ChecklistPanel} group=${t.checklist || (t.id === 't_dec26' ? 'December trip' : t.name)} embedded=${true} /></div>`}
  <//>`;
}

/* ---------- Sri Lanka ---------- */
function SriLanka() {
  const M = model();
  const P = projection();
  const plan = S.plan;
  const c = plan.calc || {};
  const lkr = E.fx(plan, 'LKR');
  const v = E.vehicleCalc(plan);
  const setCalc = (k, patch) => API.plan({ calc: { [k]: patch } });
  const pots = E.pots(plan);
  const slPots = pots.filter(p => p.group === 'srilanka');
  const ndbPots = pots.filter(p => p.currency === 'LKR');
  const ndbBal = E.sum(ndbPots, p => M.endBal[p.id] || 0);
  const ndbRate = (c.rates && c.rates.ndb) || 0.088;
  const monthlyLKR = E.sum(E.planLines(plan).filter(l => ndbPots.find(p => p.id === l.pot)), l => l.amount);
  const parents = M.cats.find(x => x.role === 'parents');
  const parentsHist = Object.keys(S.months).sort().slice(-6).map(k => { const mm = model(k); const pc = mm.cats.find(x => x.role === 'parents'); return { k, v: pc ? pc.spent : 0 }; });
  const vehiclePot = pots.find(p => p.targetFrom === 'slVehicle');
  const weddingPot = pots.find(p => p.targetFrom === 'wedding');
  const w = E.weddingCalc(plan, thisMonth());
  const wBal = weddingPot ? (M.endBal[weddingPot.id] || 0) : 0;
  const wMonthly = weddingPot ? potMonthly(weddingPot.id) : 0;
  const wNeed = w.months ? E.r2(Math.max(0, w.target - wBal) / w.months) : null;
  const wDone = weddingPot ? P.doneAt[weddingPot.id] : null;
  const wOnTrack = wDone === 'done' || (wDone && w.date && wDone <= String(w.date).slice(0, 7));
  const num = (val, onC, opts = {}) => html`<input class="field" inputmode="decimal" id=${opts.id} value=${val} style=${{ maxWidth: opts.w || '160px' }} onChange=${e => { const n = parseMoney(e.target.value); if (n != null) onC(n); }} />`;
  return html`<div class="page">
    <div class="grid g3">
      <div class="kpi"><div class="lbl">Exchange rate</div><div class="val" style=${{ color: 'var(--rupee)' }}>£1 = ${rupees(lkr)}</div><div class="row small" style=${{ marginTop: '6px' }}><span class="muted">Change:</span>${num(lkr, n => API.plan({ calc: { fx: { LKR: n } } }), { id: 'fx-lkr', w: '110px' })}</div></div>
      <div class="kpi"><div class="lbl">Sri Lanka emergency funds</div><div class="val">${money(E.sum(slPots.filter(p => /emergency/i.test(p.name)), p => M.endBal[p.id] || 0))}</div><div class="sub">of ${money(E.sum(slPots.filter(p => /emergency/i.test(p.name)), p => E.potTarget(plan, p)), { whole: true })}: ${slPots.filter(p => /emergency/i.test(p.name)).map(p => money(E.potTarget(plan, p), { whole: true }) + (p.currency === 'LKR' ? ' in rupees' : ' in pounds') + ' for ' + String(p.name).replace(/^.*?:\s*/, '')).join(', ')}.</div></div>
      <div class="kpi"><div class="lbl">${parents ? parents.name : 'Family support'}</div><div class="val">${parents ? money(parents.spent) : '—'}</div><div class="sub">sent in ${monthLabel(M.key)} of ${parents ? money(parents.budget) : '—'} budgeted. ${parentsHist.filter(h => h.v > 0).length ? 'Last months: ' + parentsHist.filter(h => h.v > 0).map(h => monthLabel(h.k, true).slice(0, 3) + ' ' + money(h.v, { whole: true })).join(', ') : ''}</div></div>
    </div>
    <div class="grid g2">
      <${Panel} title=${vehiclePot ? vehiclePot.name : 'Vehicle lease'} sub="Leasing in Sri Lanka needs a large upfront payment. The Central Bank limits what a lease can cover (tightened by 10 points from 25 May 2026); confirm the exact share with the leasing company.">
        <div class="form-grid">
          <label class="lab">Vehicle price (Rs)${num(c.slVehicle && c.slVehicle.priceLKR, n => setCalc('slVehicle', { priceLKR: n }), { id: 'veh-price' })}</label>
          <label class="lab">Lease covers (%)${num(Math.round(((c.slVehicle && c.slVehicle.ltv) || 0) * 100), n => setCalc('slVehicle', { ltv: n / 100 }), { id: 'veh-ltv' })}</label>
          <label class="lab">Lease interest (% a year)${num(E.r2(((c.slVehicle && c.slVehicle.rate) || 0) * 100), n => setCalc('slVehicle', { rate: n / 100 }), { id: 'veh-rate' })}</label>
          <label class="lab">Lease length (months)${num((c.slVehicle && c.slVehicle.term) || 60, n => setCalc('slVehicle', { term: Math.round(n) }), { id: 'veh-term' })}</label>
        </div>
        <div class="grid g2" style=${{ marginTop: '14px', gap: '12px' }}>
          <div class="kpi"><div class="lbl">Upfront payment</div><div class="val" style=${{ color: 'var(--rupee)' }}>${rupees(v.upfrontLKR)}</div><div class="sub">≈ ${money(v.upfrontGBP, { whole: true })} · this is the pot target</div></div>
          <div class="kpi"><div class="lbl">Monthly lease payment</div><div class="val" style=${{ color: 'var(--rupee)' }}>${rupees(v.monthlyLKR)}</div><div class="sub">≈ ${money(v.monthlyGBP)} for ${v.term} months, plus fuel, insurance and licence</div></div>
        </div>
        ${vehiclePot && html`<p class="small ink2" style=${{ marginTop: '12px' }}>Saved so far: <b>${money(M.endBal[vehiclePot.id] || 0)}</b> (${rupees((M.endBal[vehiclePot.id] || 0) * lkr)}). At ${money(potMonthly(vehiclePot.id))} a month, plus money moving across from finished goals, it's ready by <b>${P.doneAt[vehiclePot.id] === 'done' ? 'now' : P.doneAt[vehiclePot.id] ? monthLabel(P.doneAt[vehiclePot.id]) : 'a date beyond six years'}</b>. Check she can pay the lease herself; the plan has no room for a monthly payment from you.</p>`}
      <//>
      <${Panel} title=${weddingPot ? weddingPot.name : 'Wedding'} sub="Set a date when you know it; the planner works out the monthly amount needed.">
        <div class="form-grid">
          <label class="lab">Wedding month<input class="field" type="month" id="wed-date" value=${(c.wedding && c.wedding.date) || ''} onChange=${e => setCalc('wedding', { date: e.target.value || null })} /></label>
          <label class="lab">Your gift (£)${num((c.wedding && c.wedding.target) || 0, n => setCalc('wedding', { target: n }), { id: 'wed-target' })}</label>
        </div>
        <div class="grid g2" style=${{ marginTop: '14px', gap: '12px' }}>
          <div class="kpi"><div class="lbl">Saved so far</div><div class="val">${money(wBal)}</div><div class="sub">≈ ${rupees(wBal * lkr)} · gift ≈ ${rupees(w.target * lkr)}</div></div>
          <div class="kpi"><div class="lbl">Needed each month</div><div class="val">${wNeed == null ? '—' : money(wNeed)}</div><div class="sub">${wNeed == null ? 'Add a date' : `for ${w.months} months; you set aside ${money(wMonthly)}`}${wNeed == null ? '' : wOnTrack ? html` <span class="chip good">on track: full by ${monthLabel(wDone === 'done' ? thisMonth() : wDone, true)}</span>` : wNeed > wMonthly + 0.5 ? html` <span class="chip warn">raise it</span>` : html` <span class="chip good">on track</span>`}</div></div>
        </div>
      <//>
    </div>
    <${Panel} title=${rupeeFund() ? rupeeFund().name : 'Rupee money fund'} sub=${`${pct(ndbRate, 2)} a year. In a money market fund interest is added daily and you can withdraw any time. It is an investment, not a bank deposit: low-risk but not guaranteed.`}>
      <div class="grid g3" style=${{ gap: '12px' }}>
        <div class="kpi"><div class="lbl">In rupee pots</div><div class="val" style=${{ color: 'var(--rupee)' }}>${rupees(ndbBal * lkr)}</div><div class="sub">≈ ${money(ndbBal)} across ${ndbPots.map(p => p.name).join(', ')}</div></div>
        <div class="kpi"><div class="lbl">Interest a year at this rate</div><div class="val" style=${{ color: 'var(--rupee)' }}>${rupees(ndbBal * lkr * ndbRate)}</div><div class="sub">on today's balance</div></div>
        <div class="kpi"><div class="lbl">To convert each month</div><div class="val">${money(monthlyLKR)}</div><div class="sub">≈ ${rupees(monthlyLKR * lkr)} · convert monthly through a low-cost transfer service, not all at once</div></div>
      </div>
      <p class="small muted" style=${{ marginTop: '12px' }}>Keep ${rupeeAccount() ? rupeeAccount().name : 'a rupee bank account'} for receiving and withdrawing money in Sri Lanka. Goals you'll spend in pounds (baby, car, house) stay in the UK: the rupee has moved about 11% against the pound in a year, which can wipe out the higher interest.</p>
      <label class="lab" style=${{ maxWidth: '220px', marginTop: '10px' }}>Fund rate (% a year)${num(E.r2(ndbRate * 100), n => API.plan({ calc: { rates: { ndb: n / 100 } } }), { id: 'ndb-rate' })}</label>
    <//>
  </div>`;
}

/* ---------- big plans ---------- */
function Future() {
  const M = model();
  const P = projection();
  const plan = S.plan;
  const c = plan.calc || {};
  const h = E.houseCalc(plan);
  const b = E.babyCalc(plan);
  const housePot = E.pots(plan).find(p => p.targetFrom === 'house');
  const babyPot = E.pots(plan).find(p => /baby/i.test(p.name));
  const invPot = E.pots(plan).find(p => p.investing);
  const setCalc = (k, patch) => API.plan({ calc: { [k]: patch } });
  const num = (val, onC, id, w) => html`<input class="field" inputmode="decimal" id=${id} value=${val} style=${{ maxWidth: w || '170px' }} onChange=${e => { const n = parseMoney(e.target.value); if (n != null) onC(n); }} />`;
  const timelinePots = E.pots(plan).filter(p => E.potTarget(plan, p) > 0);
  const houseSeries = housePot ? P.series[housePot.id] : [];
  const invSeries = invPot ? P.series[invPot.id] : [];
  const growth = c.growth || 0;
  let invGrow = []; if (invPot) { let bal = invSeries[0] || 0; invGrow = invSeries.map((v, i) => { if (i === 0) return bal; const contrib = v - invSeries[i - 1]; bal = bal * (1 + growth / 12) + contrib; return E.r2(bal); }); }
  return html`<div class="page">
    <${Panel} title="When each goal is reached" sub="Based on the plan's monthly amounts, money moving across when a pot fills, and no saving during maternity leave.">
      <${GoalTimeline} proj=${P} potsList=${timelinePots} fromKey=${thisMonth()} />
    <//>
    <div class="grid g2">
      <${Panel} title="House move" sub="What a move needs in cash: the deposit above what a lender will lend, stamp duty and fees.">
        <div class="row" style=${{ marginBottom: '10px' }}>
          ${((c.house && c.house.presets) || []).map(p => html`<button class="btn sm" onClick=${() => setCalc('house', { price: p.price })}>${p.label} · ${money(p.price, { whole: true })}</button>`)}
        </div>
        <div class="form-grid">
          <label class="lab">Price (£)${num(h.price, n => setCalc('house', { price: n }), 'house-price')}</label>
          <label class="lab">Lender multiple${num(h.multiple, n => setCalc('house', { multiple: n }), 'house-mult', '100px')}</label>
          <label class="lab">Fees and moving (£)${num((c.house && c.house.fees) || 0, n => setCalc('house', { fees: n }), 'house-fees')}</label>
          <label class="lab">Equity in your home (£)<span class="hint">value minus mortgage left</span>${num(h.equity, n => setCalc('house', { equity: n }), 'house-eq')}</label>
        </div>
        <div class="table-wrap" style=${{ marginTop: '12px' }}><table class="ledger"><tbody>
          <tr><td>Joint gross income</td><td class="n">${money(h.gross, { whole: true })}</td></tr>
          <tr><td>Largest likely mortgage (×${h.multiple})</td><td class="n">${money(h.mortgage, { whole: true })}</td></tr>
          <tr><td>Deposit needed</td><td class="n">${money(h.deposit, { whole: true })}</td></tr>
          <tr><td>Stamp duty (home mover)</td><td class="n">${money(h.duty, { whole: true })}</td></tr>
          <tr><td>Fees and moving</td><td class="n">${money(h.fees, { whole: true })}</td></tr>
          <tr><td class="strong">Cash needed</td><td class="n strong">${money(h.cash, { whole: true })}</td></tr>
          <tr><td>Less equity</td><td class="n">${h.equity > 0 ? '−' : ''}${money(h.equity, { whole: true })}</td></tr>
          <tr><td class="strong">Still to save (the house fund target)</td><td class="n strong">${money(h.toSave, { whole: true })}</td></tr>
        </tbody></table></div>
        <p class="small muted" style=${{ marginTop: '10px' }}>Lenders often lend less once childcare costs appear, and they assess income at the time: avoid moving during maternity leave.</p>
      <//>
      <${Panel} title="House fund over time" sub=${housePot ? `${housePot.name} if the plan holds. The flat stretch is maternity leave.` : ''}>
        ${housePot && html`<${AreaChart} keys=${P.keys} values=${houseSeries} label=${housePot.name} />`}
        <p class="small ink2" style=${{ marginTop: '10px' }}>${housePot && P.doneAt[housePot.id] ? `Reaches the ${money(h.toSave, { whole: true })} target in ${monthLabel(P.doneAt[housePot.id])}.` : `At this pace the fund doesn't reach ${money(h.toSave, { whole: true })} within six years; your home's equity closes the gap.`}</p>
      <//>
    </div>
    <div class="grid g2">
      <${Panel} title="Baby and maternity leave" sub="An estimate of the income gap while on leave, if only statutory maternity pay applies. Ask the employer whether they pay more.">
        <div class="form-grid">
          <label class="lab">Leave starts<input class="field" type="month" id="baby-start" value=${(c.baby && c.baby.leaveStart) || ''} onChange=${e => setCalc('baby', { leaveStart: e.target.value || null })} /></label>
          <label class="lab">Months off${num((c.baby && c.baby.months) || 9, n => setCalc('baby', { months: Math.max(1, Math.min(12, Math.round(n))) }), 'baby-months', '100px')}</label>
          <label class="lab">Statutory pay (£ a week)${num((c.baby && c.baby.smpWeekly) || 194.32, n => setCalc('baby', { smpWeekly: n }), 'baby-smp', '120px')}</label>
          <label class="lab">Employer pays instead (£ a month)<span class="hint">blank if not</span><input class="field" inputmode="decimal" id="baby-enh" style=${{ maxWidth: '150px' }} value=${(c.baby && c.baby.enhancedMonthly) || ''} onChange=${e => setCalc('baby', { enhancedMonthly: parseMoney(e.target.value) })} /></label>
        </div>
        <div class="table-wrap" style=${{ marginTop: '12px' }}><table class="ledger"><tbody>
          <tr><td>Monthly spending during leave (no commute, plus baby costs)</td><td class="n">${money(b.spendDuring)}</td></tr>
          <tr><td>Partner's pay</td><td class="n">${money(b.partnerPay)}</td></tr>
          <tr><td>Statutory maternity pay a month (weeks 7 to 39)</td><td class="n">${money(b.smpMonthly)}</td></tr>
          <tr><td>Gap each month on statutory pay</td><td class="n">${money(b.shortSMP)}</td></tr>
          ${b.unpaidMonths > 0 && html`<tr><td>Gap each unpaid month</td><td class="n">${money(b.shortUnpaid)}</td></tr>`}
          <tr><td>Baby kit</td><td class="n">${money(b.kit)}</td></tr>
          <tr><td class="strong">Total to have ready</td><td class="n strong">${money(b.total, { whole: true })}</td></tr>
          ${babyPot && html`<tr><td>${babyPot.name} target</td><td class="n">${money(E.potTarget(plan, babyPot), { whole: true })}</td></tr>`}
        </tbody></table></div>
        <div class="banner warn" style=${{ marginTop: '12px' }}><${Icon} name="alert" /><div class="grow">Free childcare for working parents (30 hours a week from 9 months) stops if either parent's adjusted net income is over £100,000. Pension contributions lower adjusted net income, so raising them can keep a salary near the limit under it.</div></div>
      <//>
      <${Panel} title="Property business seed" sub=${invPot ? `${invPot.name}: monthly contributions from both of you, with the growth rate you choose.` : ''}>
        ${invPot && html`<${AreaChart} keys=${P.keys} values=${invGrow} label=${invPot.name} />`}
        <div class="row" style=${{ marginTop: '10px' }}><label class="lab" style=${{ maxWidth: '200px' }}>Assumed growth (% a year)${num(E.r2(growth * 100), n => API.plan({ calc: { growth: n / 100 } }), 'inv-growth', '100px')}</label>
          <p class="small muted" style=${{ flex: '1 1 240px' }}>Growth is never guaranteed and values can fall. Start the business itself after the baby and the house move, around 2030; use the time to research rental demand, building costs and a trusted contact on the ground.</p></div>
      <//>
    </div>
  </div>`;
}
