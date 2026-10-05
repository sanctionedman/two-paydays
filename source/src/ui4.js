/* ===== UI part 4: plan & settings, onboarding, modals, boot ===== */

function SettingsSection({ title, sub, children, open }) {
  return html`<details class="panel fold" open=${open}><summary><span class="caret"><${Icon} name="right" size=${16} /></span><span style=${{ flex: 1 }}><span style=${{ fontFamily: 'var(--f-display)', fontSize: '17px' }}>${title}</span>${sub && html`<span class="small muted" style=${{ display: 'block', fontWeight: 500 }}>${sub}</span>`}</span></summary><div style=${{ marginTop: '14px' }}>${children}</div></details>`;
}
function PoolSettings({ p, i, shares, ms }) {
  const isJoint = p.id === 'joint';
  const set = patch => isJoint ? API.plan({ joint: patch }) : API.plan({ pools: { [p.id]: patch } });
  const bp = (shares.byPool && shares.byPool[p.id]) || { J: 0, shares: {} };
  const names = E.categories(S.plan).filter(c => c.payer === p.id).map(c => c.name);
  const methods = [{ value: 'proportional', label: 'In proportion to pay' }, { value: 'equal', label: 'Half each' }, { value: 'fixed', label: 'Fixed amounts' }, { value: 'remainder', label: 'Each pay covers its own commitments' }];
  return html`<div class="panel flat stack">
    <div class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span class="swatch" style=${{ background: poolColor(i), marginTop: '6px' }}></span>
      <div style=${{ flex: 1, minWidth: 0 }}>${isJoint ? html`<b>${p.name}</b>` : html`<${EditText} value=${p.name} strong=${true} title="Name shown in the planner" onCommit=${v => v && set({ name: v })} />`}
        <div class="small muted">${money(bp.J)} a month · ${names.length ? names.join(', ') : 'no budgets yet: choose it under Paid by'}</div></div></div>
    <${Seg} label=${'How the ' + poolShort(p).toLowerCase() + ' is split'} value=${p.method || 'proportional'} onChange=${v => set({ method: v })} options=${methods} />
    ${p.method === 'remainder' && html`<label class="lab" style=${{ maxWidth: '360px' }}>Who pays what's left after their own bills, savings and Sri Lanka commitments<select class="field" id=${'rem-' + p.id} value=${p.remainderMember || ''} onChange=${e => set({ remainderMember: e.target.value })}>${ms.map(m => html`<option value=${m.id}>${memberName(m.id)}</option>`)}</select></label>`}
    ${p.method === 'fixed' && html`<div class="form-grid">${ms.map(m => html`<label class="lab">${memberName(m.id)}<${EditMoney} value=${(p.fixed && p.fixed[m.id]) || 0} onCommit=${v => set({ fixed: { [m.id]: v } })} /></label>`)}</div>`}
    <label class="lab" style=${{ maxWidth: '360px' }}>If someone can't pay their share, who covers the rest<select class="field" id=${'back-' + p.id} value=${p.backstop || (S.plan.joint || {}).backstop || ''} onChange=${e => set({ backstop: e.target.value })}>${ms.map(m => html`<option value=${m.id}>${memberName(m.id)}</option>`)}</select></label>
    <div class="row">${ms.map(m => html`<span class="chip"><${Avatar} id=${m.id} size="sm" /> ${memberName(m.id)}: ${money(bp.shares[m.id] || 0)} a month (${pct(bp.J ? (bp.shares[m.id] || 0) / bp.J : 0)})</span>`)}</div>
  </div>`;
}
function PlanPage() {
  const plan = S.plan;
  const ms = E.members(plan);
  const shares = E.plannedShares(plan);
  const cats = E.categories(plan);
  const groupNames = (plan.groups || []).slice();
  cats.forEach(c => { if (c.group && !groupNames.includes(c.group)) groupNames.push(c.group); });
  const [newGroup, setNewGroup] = useState('');
  return html`<div class="page">
    <p class="ink2" style=${{ maxWidth: '70ch' }}>Everything here is the standing plan: it applies to every month unless you change a month on its own from the Payday or Spending pages. Changes save as you make them and both of you see them straight away.</p>

    <${SettingsSection} title="People and pay" sub="Take-home pay, paydays and where extra money goes" open=${true}>
      <div class="grid g2">${ms.map(m => html`<div class="panel flat stack">
        <div class="row"><${Avatar} id=${m.id} /><div style=${{ flex: 1, minWidth: 0 }}><${EditText} value=${m.label} strong=${true} title="Name shown in the planner" onCommit=${v => API.plan({ members: { [m.id]: { label: v || m.label } } })} /></div>
          ${m.userId ? html`<span class="chip ${m.userId === S.viewerId ? 'accent' : ''}">${m.userId === S.viewerId ? 'Linked to you' : 'Linked'}</span>` : html`<span class="chip ghost">Not linked</span>`}</div>
        <div class="form-grid">
          <label class="lab">Take-home a month<${EditMoney} value=${m.plannedPay} onCommit=${v => API.plan({ members: { [m.id]: { plannedPay: v } } })} /></label>
          <label class="lab">Gross pay a year<${EditMoney} value=${m.grossPay || 0} onCommit=${v => API.plan({ members: { [m.id]: { grossPay: v } } })} /></label>
          <label class="lab">Payday<select class="field" id=${'payrule-' + m.id} value=${(m.payRule || {}).type === 'lastWorkingDay' ? 'lwd' : 'day'} onChange=${e => API.plan({ members: { [m.id]: { payRule: e.target.value === 'lwd' ? { type: 'lastWorkingDay', fundsNextMonth: true, day: null } : { type: 'dayOfMonth', day: (m.payRule && m.payRule.day) || 15, fundsNextMonth: false } } } })}>
            <option value="lwd">Last working day (pays for next month)</option><option value="day">A set day of the month</option></select></label>
          ${(m.payRule || {}).type === 'dayOfMonth' && html`<label class="lab">Day of the month<input class="field" type="number" min="1" max="31" id=${'payday-' + m.id} value=${m.payRule.day || 15} onChange=${e => API.plan({ members: { [m.id]: { payRule: { day: Math.max(1, Math.min(31, +e.target.value || 1)) } } } })} /></label>`}
          <label class="lab">Transfers on day<input class="field" type="number" min="1" max="31" id=${'xday-' + m.id} value=${m.transferDay || 1} onChange=${e => API.plan({ members: { [m.id]: { transferDay: Math.max(1, Math.min(31, +e.target.value || 1)) } } })} /></label>
          <label class="lab">Usual account<${AccountSelect} id=${'defacc-' + m.id} value=${m.defaultAccount} onChange=${v => API.plan({ members: { [m.id]: { defaultAccount: v || null } } })} /></label>
          <label class="lab">Extra pay goes to<select class="field" id=${'ovf-' + m.id} value=${m.overflow || 'buffer'} onChange=${e => API.plan({ members: { [m.id]: { overflow: e.target.value } } })}>
            <option value="buffer">Stays in the account</option><option value="auto">The next unfinished goal</option>${E.pots(plan).map(p => html`<option value=${p.id}>${p.name}</option>`)}</select></label>
        </div>
      </div>`)}</div>
    <//>

    <${SettingsSection} title="Shared accounts" sub=${`${poolList().map(p => poolShort(p)).join(' and ')}: ${money(shares.J)} a month between you`}>
      <div class="stack" style=${{ gap: '14px' }}>${poolList().map((p, i) => html`<${PoolSettings} p=${p} i=${i} shares=${shares} ms=${ms} />`)}</div>
    <//>

    <${SettingsSection} title="Spending budgets" sub=${`${cats.length} budgets · ${money(E.sum(cats, c => c.budget))} a month`}>
      <div class="table-wrap"><table class="ledger"><thead><tr><th>Budget</th><th>Area</th><th>Type</th><th>Paid by</th><th class="n">A month</th><th></th></tr></thead><tbody>
        ${cats.map(c => html`<tr>
          <td style=${{ minWidth: '170px' }}><${EditText} value=${c.name} onCommit=${v => v && API.plan({ categories: { [c.id]: { name: v } } })} /></td>
          <td><select class="field" id=${'grp-' + c.id} value=${c.group || 'Other'} onChange=${e => API.plan({ categories: { [c.id]: { group: e.target.value } } })}>${groupNames.map(g => html`<option value=${g}>${g}</option>`)}</select></td>
          <td><select class="field" id=${'kind-' + c.id} value=${c.kind} onChange=${e => API.plan({ categories: { [c.id]: { kind: e.target.value } } })}><option value="bill">Fixed bill</option><option value="living">Day-to-day essential</option><option value="discretionary">Discretionary</option><option value="support">Family support</option></select></td>
          <td><select class="field" id=${'payer-' + c.id} value=${c.payer} onChange=${e => API.plan({ categories: { [c.id]: { payer: e.target.value } } })}>${poolList().map(p => html`<option value=${p.id}>${poolShort(p)}</option>`)}${ms.map(m => html`<option value=${m.id}>${memberName(m.id)}</option>`)}</select></td>
          <td class="n"><${EditMoney} value=${c.budget} onCommit=${v => API.plan({ categories: { [c.id]: { budget: v } } })} /></td>
          <td class="n"><button class="iconbtn" aria-label=${'Remove ' + c.name} onClick=${() => API.plan({ categories: { [c.id]: { deleted: true } } }).then(ok => ok && toast(`Removed ${c.name}`, { label: 'Undo', fn: () => API.plan({ categories: { [c.id]: { deleted: false } } }) }))}><${Icon} name="trash" /></button></td>
        </tr>`)}
      </tbody></table></div>
      <div class="row" style=${{ marginTop: '12px' }}>
        <button class="btn sm" onClick=${() => API.plan({ categories: { [uid('c')]: { name: 'New budget', group: 'Other', kind: 'discretionary', payer: 'joint', budget: 0, order: cats.length + 1 } } })} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Add a budget</button>
        <input class="field" id="new-group" style=${{ maxWidth: '200px' }} placeholder="New area name" value=${newGroup} onInput=${e => setNewGroup(e.target.value)} />
        <button class="btn sm ghost" onClick=${() => { const g = newGroup.trim(); if (!g || groupNames.includes(g)) return; API.plan({ groups: groupNames.concat([g]) }); setNewGroup(''); }}>Add area</button>
      </div>
    <//>

    <${SettingsSection} title="Savings lines" sub="What each payday moves into the pots every month">
      <div class="grid g2">${ms.map(m => {
        const ls = E.planLines(plan).filter(l => l.member === m.id);
        return html`<div class="panel flat"><h3 style=${{ marginBottom: '8px' }}>${memberName(m.id)} · ${money(E.sum(ls, l => l.amount))} a month</h3>
          <div class="list">${ls.map(l => html`<div class="li"><div class="grow"><${PotSelect} id=${'line-pot-' + l.id} value=${l.pot} onChange=${v => API.plan({ lines: { [l.id]: { pot: v } } })} /></div>
            <${EditMoney} value=${l.amount} onCommit=${v => API.plan({ lines: { [l.id]: { amount: v } } })} />
            <button class="iconbtn" aria-label="Remove line" onClick=${() => API.plan({ lines: { [l.id]: { deleted: true } } })}><${Icon} name="trash" /></button></div>`)}</div>
          <button class="btn sm" style=${{ marginTop: '8px' }} onClick=${() => { const p = E.pots(plan)[0]; API.plan({ lines: { [uid('l')]: { member: m.id, kind: 'pot', pot: p ? p.id : null, amount: 0, order: ls.length + 1 } } }); }} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Add a line</button>
        </div>`;
      })}</div>
    <//>

    <${SettingsSection} title="Pots" sub="Targets, order and where each is kept">
      <div class="table-wrap"><table class="ledger"><thead><tr><th>#</th><th>Pot</th><th class="n">Target</th><th>Kept in</th><th>Currency</th><th></th></tr></thead><tbody>
        ${E.pots(plan).map(p => html`<tr><td>${p.priority}</td><td class="strong">${p.name}${p.status === 'done' ? html` <span class="chip good">done</span>` : ''}</td>
          <td class="n">${p.targetFrom ? html`<span title="Set by a calculator">${money(E.potTarget(plan, p), { whole: true })} <span class="tiny muted">calc</span></span>` : html`<${EditMoney} value=${p.target || 0} onCommit=${v => API.plan({ pots: { [p.id]: { target: v } } })} />`}</td>
          <td>${(plan.accounts[p.account] || {}).name || '—'}</td><td>${p.currency || 'GBP'}</td>
          <td class="n"><button class="btn sm ghost" onClick=${() => openModal('pot', { pot: p.id })}>Edit</button></td></tr>`)}
      </tbody></table></div>
      <button class="btn sm" style=${{ marginTop: '10px' }} onClick=${() => openModal('pot', { pot: null })} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />New pot</button>
    <//>

    <${SettingsSection} title="Accounts and cards" sub="Used to tell personal, joint and card spending apart">
      <div class="table-wrap"><table class="ledger"><thead><tr><th>Name</th><th>Owner</th><th>Type</th><th>Currency</th><th class="n">Rate %</th><th></th></tr></thead><tbody>
        ${E.accounts(plan).map(a => html`<tr>
          <td style=${{ minWidth: '170px' }}><${EditText} value=${a.name} onCommit=${v => v && API.plan({ accounts: { [a.id]: { name: v } } })} /></td>
          <td><select class="field" id=${'aown-' + a.id} value=${a.owner} onChange=${e => API.plan({ accounts: { [a.id]: { owner: e.target.value } } })}><option value="joint">Joint</option>${ms.map(m => html`<option value=${m.id}>${memberName(m.id)}</option>`)}</select></td>
          <td><select class="field" id=${'atype-' + a.id} value=${a.type} onChange=${e => API.plan({ accounts: { [a.id]: { type: e.target.value } } })}><option value="current">Current</option><option value="credit">Credit card</option><option value="savings">Savings</option><option value="isa">ISA</option><option value="investment">Investment</option></select></td>
          <td><select class="field" id=${'acur-' + a.id} value=${a.currency || 'GBP'} onChange=${e => API.plan({ accounts: { [a.id]: { currency: e.target.value } } })}><option value="GBP">GBP</option><option value="LKR">LKR</option></select></td>
          <td class="n"><input class="field" style=${{ width: '80px', textAlign: 'right' }} id=${'arate-' + a.id} inputmode="decimal" value=${a.rate ? E.r2(a.rate * 100) : ''} onChange=${e => { const n = parseMoney(e.target.value); API.plan({ accounts: { [a.id]: { rate: n == null ? null : n / 100 } } }); }} /></td>
          <td class="n"><button class="iconbtn" aria-label=${'Remove ' + a.name} onClick=${() => API.plan({ accounts: { [a.id]: { deleted: true } } })}><${Icon} name="trash" /></button></td></tr>`)}
      </tbody></table></div>
      <button class="btn sm" style=${{ marginTop: '10px' }} onClick=${() => API.plan({ accounts: { [uid('a')]: { name: 'New account', owner: S.me || ms[0].id, type: 'current', currency: 'GBP', order: E.accounts(plan).length + 1 } } })} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Add an account</button>
    <//>

    <${SettingsSection} title="Auto-sort rules" sub="When a description contains this text, it goes to this category. Rules are also offered when you change a category.">
      <div class="list">${E.rules(plan).map(r => html`<div class="li"><div style=${{ flex: '1 1 160px', minWidth: 0 }}><${EditText} value=${r.match} onCommit=${v => v && API.plan({ rules: { [r.id]: { match: v.toLowerCase() } } })} /></div>
        <${Icon} name="arrow" size=${14} />
        <div style=${{ flex: '2 1 220px', minWidth: 0 }}><${RuleTarget} r=${r} /></div>
        <button class="iconbtn" aria-label="Remove rule" onClick=${() => API.plan({ rules: { [r.id]: { deleted: true } } })}><${Icon} name="trash" /></button></div>`)}</div>
      <button class="btn sm" style=${{ marginTop: '10px' }} onClick=${() => API.plan({ rules: { [uid('r')]: { match: 'shop name', category: '' } } })} disabled=${S.readOnly}><${Icon} name="plus" size=${14} />Add a rule</button>
    <//>

    <${SettingsSection} title=${APP ? 'Backup, export and updates' : 'Sharing, export and backup'} sub=${APP ? 'Saved on this Mac · version ' + APP.version : S.mode === 'shared' ? 'Saved online and shared with everyone you give edit access' : 'Saved on this device only'}>
      <${DataTools} />
    <//>
  </div>`;
}
// budgets that exist once per person (takeaways, eating out, ...): a rule for them should follow whoever paid
function splitRoles() {
  const ms = new Set(E.members(S.plan).map(m => m.id));
  const cats = E.categories(S.plan).filter(c => c.role && ms.has(c.payer) && c.role !== 'personal' && c.role !== 'phone');
  return [...new Set(cats.filter(c => cats.some(x => x.id !== c.id && x.role === c.role && x.payer !== c.payer)).map(c => c.role))];
}
function RuleTarget({ r }) {
  const groups = categoryOptions(S.plan);
  return html`<select class="field" id=${'rule-' + r.id} aria-label="Category" value=${r.category || ''} onChange=${e => API.plan({ rules: { [r.id]: { category: e.target.value } } })}>
    <option value="">Choose…</option>
    <optgroup label="Depends on who paid"><option value="@personal">Personal money of whoever paid</option><option value="@phone">Phone of whoever paid</option>${splitRoles().map(r => html`<option value=${'@role:' + r}>${capFirst(roleLabel(r))} of whoever paid</option>`)}</optgroup>
    ${groups.map(g => html`<optgroup label=${g.label}>${g.items.map(i => html`<option value=${i.value}>${i.label}</option>`)}</optgroup>`)}
  </select>`;
}
async function offerFile(filename, data) {
  if (APP) { saveFileLocally(filename, data); toast('Saved ' + filename + ' to your Downloads folder'); return; }
  if (S.downloads) {
    try { await S.downloads.save({ filename, data }); toast('Saved ' + filename); return; }
    catch (e) { if (e && (e.code === 'declined' || e.code === 'rate_limited')) return; }
  }
  openModal('text', { title: filename, text: data });
}
function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function DataTools() {
  const [restore, setRestore] = useState(null);
  const key = S.monthKey;
  const exportMonth = () => {
    const M = model(key);
    const rows = [['Date', 'Description', 'Category', 'Who', 'Account', 'Amount (GBP)', 'Note']].concat(M.txns.map(t => [t.date, t.desc, categoryName(S.plan, t.category), memberName(t.member), ((S.plan.accounts || {})[t.account] || {}).name || '', E.r2(t.amount).toFixed(2), t.note || '']));
    offerFile(`two-paydays-${key}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\n'));
  };
  const backup = () => { if (APP) { backupNow(); return; } offerFile(`two-paydays-backup-${todayStr()}.json`, backupData()); };
  const snaps = APP ? pref.get('snapshots', []) : [];
  const restoreSnap = sn => { try { const d = JSON.parse(sn.data); setRestore({ app: 'two-paydays', exportedAt: sn.at, plan: d['config/plan'], checklist: d['config/checklist'], months: Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('months/')).map(([k, v]) => [k.slice(7), v])) }); } catch (e) { toast("That copy couldn't be read."); } };
  const [checking, setChecking] = useState(false);
  const check = async () => { if (!APP || !APP.checkForUpdate) return; setChecking(true); try { const r = await APP.checkForUpdate(); if (!r) toast(`You have the latest version (${APP.version}).`); } catch (e) { toast("Couldn't check for updates. Are you online?"); } setChecking(false); };
  const onFile = f => { if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(String(rd.result)); if (!d.plan || !d.plan.members) throw new Error('bad'); setRestore(d); } catch (e) { toast("That file isn't a Two Paydays backup."); } }; rd.readAsText(f); };
  const doRestore = async () => {
    const d = restore; setRestore(null);
    const ok1 = await API.setDoc('config/plan', d.plan);
    if (d.checklist) await API.setDoc('config/checklist', d.checklist);
    for (const [k, m] of Object.entries(d.months || {})) await API.setDoc('months/' + k, m);
    if (ok1) toast('Backup restored');
  };
  return html`<div class="stack">
    ${APP ? html`<p class="small ink2">Everything is saved in this app on this Mac only. Make a backup now and then and keep it somewhere safe, such as iCloud Drive.${pref.get('lastBackup', null) ? ' Last backup: ' + dayLabel(pref.get('lastBackup').slice(0, 10)) + '.' : ''}</p>`
      : S.mode === 'shared' ? html`<p class="small ink2">To let your partner add their spending, share this page with them from the Share menu as an <b>Editor</b>. People with view-only access can't see the data.</p>`
      : html`<p class="small ink2">This copy can't reach the shared storage, so changes stay in this browser. Open the planner from claude.ai while signed in to use the shared plan.</p>`}
    <div class="row">
      <button class="btn" onClick=${exportMonth}><${Icon} name="download" />${monthLabel(key)} as a spreadsheet (CSV)</button>
      <button class="btn" onClick=${backup}><${Icon} name="download" />Full backup (JSON)</button>
      <label class="btn" style=${{ cursor: 'pointer' }}><${Icon} name="upload" />Restore a backup<input type="file" id="restore-file" accept=".json,application/json" style=${{ display: 'none' }} onChange=${e => onFile(e.target.files[0])} /></label>
    </div>
    ${APP && html`<div class="row small" style=${{ marginTop: '4px' }}><span class="muted">Two Paydays version ${APP.version}</span><button class="btn sm ghost" onClick=${check} disabled=${checking}>${checking ? 'Checking…' : 'Check for updates'}</button></div>`}
    ${snaps.length > 0 && html`<div class="small ink2">Copies saved before updates: ${snaps.map((sn, i) => html`${i ? ' · ' : ''}<button class="linkish" onClick=${() => restoreSnap(sn)}>${dayLabel(sn.at.slice(0, 10))}${sn.version ? ' (v' + sn.version + ')' : ''}</button>`)}</div>`}
    ${restore && html`<div class="banner crit"><${Icon} name="alert" /><div class="grow">Restoring replaces the plan and ${Object.keys(restore.months || {}).length} months with the backup from ${restore.exportedAt ? dayLabel(restore.exportedAt.slice(0, 10)) : 'that file'}. Anything added since is lost.</div><div class="row"><button class="btn sm" onClick=${doRestore}>Replace with backup</button><button class="btn sm ghost" onClick=${() => setRestore(null)}>Cancel</button></div></div>`}
  </div>`;
}

/* ---------- onboarding (empty store) ---------- */
function templatePlan() {
  const now = new Date().toISOString();
  const c = (name, group, kind, payer, order, role) => ({ name, group, kind, payer, budget: 0, order, role });
  return {
    schema: 1, household: { name: 'Our household', startMonth: thisMonth(), createdAt: now },
    groups: ['Home & bills', 'Food & household', 'Eating out', 'Getting about', 'Phones & subscriptions', 'Personal', 'Other'],
    members: { p1: { label: 'Person 1', order: 1, plannedPay: 0, payRule: { type: 'dayOfMonth', day: 28 }, transferDay: 28, defaultAccount: 'a1', overflow: 'buffer' }, p2: { label: 'Person 2', order: 2, plannedPay: 0, payRule: { type: 'dayOfMonth', day: 28 }, transferDay: 28, defaultAccount: 'a2', overflow: 'buffer' } },
    joint: { method: 'proportional', backstop: 'p2' },
    accounts: { a1: { name: "Person 1's account", owner: 'p1', type: 'current', currency: 'GBP', order: 1 }, a2: { name: "Person 2's account", owner: 'p2', type: 'current', currency: 'GBP', order: 2 }, aj: { name: 'Joint account', owner: 'joint', type: 'current', currency: 'GBP', order: 3 } },
    categories: { c1: c('Rent or mortgage', 'Home & bills', 'bill', 'joint', 1, 'mortgage'), c2: c('Council tax', 'Home & bills', 'bill', 'joint', 2, 'council'), c3: c('Energy', 'Home & bills', 'bill', 'joint', 3, 'energy'), c4: c('Groceries', 'Food & household', 'living', 'joint', 4, 'groceries'), c5: c('Takeaways', 'Eating out', 'discretionary', 'joint', 5, 'takeaways'), c6: c('Eating out', 'Eating out', 'discretionary', 'joint', 6, 'eatingout'), c7: c("Person 1's personal money", 'Personal', 'discretionary', 'p1', 7, 'personal'), c8: c("Person 2's personal money", 'Personal', 'discretionary', 'p2', 8, 'personal'), c9: c('Unplanned', 'Other', 'discretionary', 'joint', 9, 'other') },
    pots: { e1: { name: 'Emergency fund', target: 0, priority: 1, account: 'aj', group: 'safety', opening: 0 }, e2: { name: 'Holiday fund', target: 0, priority: 2, account: 'aj', group: 'goals', opening: 0, sinking: true } },
    lines: {}, debts: {}, rules: {}, calc: { fx: { LKR: 450, SGD: 1.695 }, slVehicle: { priceLKR: 0, ltv: 0.5, rate: 0.13, term: 60 }, wedding: {}, house: { price: 0, multiple: 4.5, fees: 0, equity: 0 }, baby: {} },
    travel: { option: 'C' }, trips: {}, settings: { cascadeFallback: 'e2' },
  };
}
function Onboarding() {
  const [busy, setBusy] = useState(false);
  const start = async () => { setBusy(true); await API.setDoc('config/plan', templatePlan()); await API.setDoc('config/checklist', { items: {} }); setBusy(false); go('plan'); };
  const onFile = f => { if (!f) return; const rd = new FileReader(); rd.onload = async () => { try { const d = JSON.parse(String(rd.result)); if (!d.plan) throw 0; await API.setDoc('config/plan', d.plan); if (d.checklist) await API.setDoc('config/checklist', d.checklist); for (const [k, m] of Object.entries(d.months || {})) await API.setDoc('months/' + k, m); } catch (e) { toast("That file isn't a Two Paydays backup."); } }; rd.readAsText(f); };
  return html`<div style=${{ maxWidth: '760px', margin: '0 auto', padding: '48px 16px' }}>
    <div class="brand" style=${{ padding: 0, marginBottom: '22px' }}><${BrandMark} /><div><div class="brand-name">Two Paydays</div><div class="brand-sub">Household money plan</div></div></div>
    <section class="panel hero" style=${{ display: 'block' }}>
      <h1 style=${{ fontSize: '30px' }}>Your household plan will appear here</h1>
      <p class="lead">Two people, two paydays, one joint account. Enter each pay and the planner shows exactly what moves to the joint account, the savings pots and the bills. Log spending as you go, and it tracks every budget, pot and card for both of you.</p>
      ${S.readOnly ? html`<div class="banner" style=${{ marginTop: '18px' }}><${Icon} name="info" /><div class="grow">Nothing has been set up here yet, and you can view this page but not change it. Ask whoever shared it with you to set up the plan or give you edit access.</div></div>`
        : html`<div class="row" style=${{ marginTop: '18px' }}>
        <button class="btn primary" onClick=${start} disabled=${busy}>${busy ? 'Setting up…' : 'Start a blank plan'}</button>
        <label class="btn" style=${{ cursor: 'pointer' }}><${Icon} name="upload" />Restore a backup<input type="file" accept=".json,application/json" id="onb-file" style=${{ display: 'none' }} onChange=${e => onFile(e.target.files[0])} /></label>
      </div>`}
      ${APP && html`<p class="small muted" style=${{ marginTop: '14px' }}>Everything you enter stays in this app on this Mac. To bring in your existing plan, choose <b>Restore a backup</b> and pick the backup file.</p>`}
      ${!APP && S.mode === 'device' && html`<p class="small muted" style=${{ marginTop: '14px' }}>This copy saves on this device only. Open it from claude.ai while signed in to use your shared household plan.</p>`}
    </section>
  </div>`;
}

/* ---------- modals ---------- */
function AddModal({ initial }) {
  return html`<${Modal} title="Add spending" onClose=${closeModal}><${TxnForm} initial=${initial} idPrefix="modal" onSaved=${closeModal} /><//>`;
}
function TextModal({ title, text }) {
  const ref = useRef(null);
  const copy = () => { try { navigator.clipboard.writeText(text).then(() => toast('Copied'), () => { ref.current && ref.current.select(); }); } catch (e) { ref.current && ref.current.select(); } };
  return html`<${Modal} title=${title} onClose=${closeModal} foot=${html`<button class="btn primary" onClick=${copy}><${Icon} name="copy" />Copy</button>`}>
    <p class="small muted">Copy this and paste it into a file or a note.</p>
    <textarea ref=${ref} class="field" readonly style=${{ minHeight: '240px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', marginTop: '8px' }} value=${text}></textarea>
  <//>`;
}
function ModalHost() {
  const m = S.modal;
  if (!m) return null;
  const P = m.props || {};
  switch (m.type) {
    case 'add': return html`<${AddModal} initial=${P.initial} />`;
    case 'import': return html`<${ImportModal} />`;
    case 'cover': return html`<${CoverModal} cat=${P.cat} monthKey=${P.monthKey} />`;
    case 'suggest': return html`<${SuggestModal} monthKey=${P.key} sugg=${P.sugg} />`;
    case 'potmove': return html`<${PotMoveModal} pot=${P.pot} mode=${P.mode} />`;
    case 'pot': return html`<${PotModal} pot=${P.pot} />`;
    case 'debt': return html`<${DebtModal} debt=${P.debt} />`;
    case 'text': return html`<${TextModal} title=${P.title} text=${P.text} />`;
    default: return null;
  }
}

/* ---------- app ---------- */
class Boundary extends htmPreact.Component {
  constructor() { super(); this.state = { err: null }; }
  componentDidCatch(err) { this.setState({ err }); try { console.error(err); } catch (e) { } }
  render() {
    if (this.state.err) return html`<div class="panel" style=${{ margin: '20px 0' }}><h2>Something went wrong on this page</h2><p class="ink2" style=${{ marginTop: '6px' }}>Your data is safe. Try another page, or reload.</p><p class="small muted" style=${{ marginTop: '6px' }}>${String(this.state.err && this.state.err.message || this.state.err)}</p><div class="row" style=${{ marginTop: '10px' }}><button class="btn" onClick=${() => { this.setState({ err: null }); go('overview'); }}>Go to Overview</button></div></div>`;
    return this.props.children;
  }
}
const PAGES = { overview: Overview, payday: Payday, spending: Spending, pots: Pots, review: Review, travel: Travel, srilanka: SriLanka, future: Future, plan: PlanPage };
function NoAccess() {
  return html`<div style=${{ maxWidth: '760px', margin: '0 auto', padding: '48px 16px' }}>
    <div class="brand" style=${{ padding: 0, marginBottom: '22px' }}><${BrandMark} /><div><div class="brand-name">Two Paydays</div><div class="brand-sub">Household money plan</div></div></div>
    <section class="panel hero" style=${{ display: 'block' }}>
      <h1 style=${{ fontSize: '28px' }}>Sign in to open the household plan</h1>
      <p class="lead">The plan's figures are saved with this page on Claude and only show to people who are signed in and have been given access. Sign in to your Claude account, then reload this page.</p>
      <p class="small muted" style=${{ marginTop: '12px' }}>Already signed in? Reload the page. If it still shows this, ask the person who shared it to give you access.</p>
    </section>
  </div>`;
}
function Loading() {
  return html`<div style=${{ maxWidth: '760px', margin: '0 auto', padding: '64px 16px' }}>
    <div class="brand" style=${{ padding: 0 }}><${BrandMark} /><div><div class="brand-name">Two Paydays</div><div class="brand-sub">Opening your household plan…</div></div></div>
  </div>`;
}
function App() {
  useStore();
  useEffect(() => {
    const f = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || S.modal) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openModal('add'); }
      else if (e.key === '[') setMonth(E.addMonths(S.monthKey, -1));
      else if (e.key === ']') setMonth(E.addMonths(S.monthKey, 1));
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, []);
  if (S.mode === 'nodata') return html`<${NoAccess} />`;
  if (S.plan === undefined) return html`<${Loading} />`;
  if (S.plan === null) return html`<div><${Onboarding} /><${Toasts} /></div>`;
  const Page = PAGES[S.page] || Overview;
  return html`<div class="shell">
    <${Rail} />
    <main class="main"><${TopBar} /><${UpdateBar} /><${Boundary} key=${S.page}><${Page} /><//></main>
    <${TabBar} />
    <${Toasts} />
    <${ModalHost} />
  </div>`;
}

/* ---------- boot ---------- */
function resolveMe() {
  if (S.mode !== 'shared' || !S.plan || !S.viewerId) return;
  const m = E.members(S.plan).find(x => x.userId && x.userId === S.viewerId);
  if (m) { if (S.me !== m.id) { S.me = m.id; pref.set('me', m.id); } }
  else if (S.me && S.plan.members[S.me] && S.plan.members[S.me].userId && S.plan.members[S.me].userId !== S.viewerId) { S.me = null; }
}
let _profIds = '';
function refreshProfiles() {
  if (!S.user || !S.plan) return;
  const ids = E.members(S.plan).map(m => m.userId).filter(Boolean);
  const sig = ids.join(',');
  if (!ids.length || sig === _profIds) return;
  _profIds = sig;
  S.user.profiles(ids).then(ps => { S.profiles = ps || {}; emit(); }).catch(() => { });
}
function subscribe() {
  const onErr = e => { S.lastError = e && e.code; if (e && e.code === 'revoked') S.readOnly = true; emit(); };
  DB.doc('config/plan').onSnapshot(s => {
    S.plan = s.exists ? s.data() : null;
    resolveMe(); refreshProfiles(); emit();
  }, onErr);
  DB.collection('months').onSnapshot(q => {
    const m = {}; q.docs.forEach(d => { if (d.exists) m[d.id] = d.data(); });
    S.months = m; emit();
  }, onErr);
  DB.doc('config/checklist').onSnapshot(s => { S.checklist = s.exists ? s.data() : null; emit(); }, onErr);
}
async function boot() {
  S.monthKey = thisMonth();
  render(html`<${App} />`, document.getElementById('app'));
  const cl = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
  let db = null;
  if (cl) { try { db = await cl.use('db'); } catch (e) { db = null; } }
  // Inside Claude, no db means a signed-out (or not-yet-admitted) viewer: show the sign-in screen.
  // Only a copy opened outside Claude entirely falls back to saving on this device.
  if (APP) { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { } }
  if (db) { DB = db; S.mode = 'shared'; subscribe(); }
  else if (cl) { S.mode = 'nodata'; }
  else { DB = LocalDB(); S.mode = 'device'; subscribe(); }
  emit();
  if (cl) {
    cl.use('user').then(async u => {
      if (!u) return;
      S.user = u;
      try { S.viewerId = await u.id(); } catch (e) { S.viewerId = null; }
      try { S.canWrite = await u.can('data.write'); } catch (e) { S.canWrite = null; }
      if (S.canWrite === false) S.readOnly = true;
      resolveMe(); refreshProfiles(); emit();
    }).catch(() => { });
    cl.use('sample').then(s => { S.sample = s || null; emit(); }).catch(() => { });
    cl.use('downloads').then(d => { S.downloads = d || null; emit(); }).catch(() => { });
  }
}
if (typeof htmPreact === 'undefined') {
  document.getElementById('app').innerHTML = '<div style="padding:40px 20px;font-family:system-ui,sans-serif">The planner could not load its interface library. Check your connection and reload the page.</div>';
} else {
  boot();
}
