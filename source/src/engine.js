/* ===== Engine: pure money logic (no DOM) ===== */
const ENGINE = (() => {
  const EPS = 0.005;
  const r2 = x => Math.round(((+x || 0) + Number.EPSILON) * 100) / 100;
  const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const live = obj => Object.entries(obj || {})
    .filter(([, v]) => isObj(v) && !v.deleted)
    .map(([id, v]) => Object.assign({}, v, { id }));
  const byOrder = (a, b) => ((a.order ?? 999) - (b.order ?? 999)) || String(a.name || a.label || a.id).localeCompare(String(b.name || b.label || b.id));

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  const monthOf = ds => String(ds || '').slice(0, 7);
  function addMonths(key, n) {
    let [y, m] = key.split('-').map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${pad(m)}`;
  }
  function monthDiff(a, b) {
    const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  }
  function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  const ds = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const dow = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
  function lastWorkingDay(key) {
    const [y, m] = key.split('-').map(Number);
    let d = daysInMonth(key);
    while ([0, 6].includes(new Date(y, m - 1, d).getDay())) d--;
    return ds(y, m, d);
  }
  function workingDayOnOrBefore(key, day) {
    const [y, m] = key.split('-').map(Number);
    let d = Math.min(Math.max(1, day | 0), daysInMonth(key));
    while (d > 1 && [0, 6].includes(new Date(y, m - 1, d).getDay())) d--;
    return ds(y, m, d);
  }
  function paydayFor(member, key) {
    const r = (member && member.payRule) || {};
    const k = r.fundsNextMonth ? addMonths(key, -1) : key;
    if (r.type === 'lastWorkingDay') return lastWorkingDay(k);
    if (r.type === 'dayOfMonth') return workingDayOnOrBefore(k, r.day || 1);
    return null;
  }
  function transferDate(member, key) {
    const d = Math.min(Math.max(1, (member && member.transferDay) || 1), daysInMonth(key));
    const [y, m] = key.split('-').map(Number);
    return ds(y, m, d);
  }

  /* ---------- plan accessors ---------- */
  const members = plan => live(plan && plan.members).sort(byOrder);
  const categories = plan => live(plan && plan.categories).sort(byOrder);
  const pots = plan => live(plan && plan.pots).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || byOrder(a, b));
  const accounts = plan => live(plan && plan.accounts).sort(byOrder);
  const debts = plan => live(plan && plan.debts).sort(byOrder);
  const planLines = plan => live(plan && plan.lines).sort(byOrder);
  const rules = plan => live(plan && plan.rules);
  const trips = plan => live(plan && plan.trips).sort(byOrder);
  const txnsOf = month => live(month && month.txns).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  /* ---------- calculators ---------- */
  function sdlt(price) { // home-mover residential bands (from 1 Apr 2025)
    const p = Math.max(0, +price || 0);
    const band = (lo, hi, rate) => Math.max(0, Math.min(p, hi) - lo) * rate;
    return r2(band(125000, 250000, 0.02) + band(250000, 925000, 0.05) + band(925000, 1500000, 0.10) + band(1500000, Infinity, 0.12));
  }
  function pmt(rateMonthly, n, pv) {
    if (!n) return 0;
    if (!rateMonthly) return pv / n;
    return pv * rateMonthly / (1 - Math.pow(1 + rateMonthly, -n));
  }
  function fx(plan, cur) { const v = plan && plan.calc && plan.calc.fx && plan.calc.fx[cur]; return +v || (cur === 'LKR' ? 450 : 1); }
  function vehicleCalc(plan) {
    const c = (plan.calc && plan.calc.slVehicle) || {};
    const price = +c.priceLKR || 0, ltv = Math.min(1, Math.max(0, +c.ltv || 0));
    const upfrontLKR = price * (1 - ltv);
    const loanLKR = price * ltv;
    const monthlyLKR = pmt((+c.rate || 0) / 12, +c.term || 60, loanLKR);
    const rate = fx(plan, 'LKR');
    return { price, ltv, upfrontLKR, loanLKR, monthlyLKR, upfrontGBP: r2(upfrontLKR / rate), monthlyGBP: r2(monthlyLKR / rate), term: +c.term || 60, rate: +c.rate || 0 };
  }
  function houseCalc(plan) {
    const h = (plan.calc && plan.calc.house) || {};
    const gross = sum(members(plan), m => m.grossPay);
    const price = +h.price || 0;
    const mortgage = gross * (+h.multiple || 4.5);
    const deposit = Math.max(0, price - mortgage);
    const duty = sdlt(price);
    const fees = +h.fees || 0;
    const cash = deposit + duty + fees;
    const equity = +h.equity || 0;
    return { price, gross, mortgage: r2(mortgage), deposit: r2(deposit), duty, fees, cash: r2(cash), equity, toSave: r2(Math.max(0, cash - equity)), multiple: +h.multiple || 4.5 };
  }
  function weddingCalc(plan, fromKey) {
    const w = (plan.calc && plan.calc.wedding) || {};
    const target = +w.target || 0;
    const months = w.date ? Math.max(1, monthDiff(fromKey, String(w.date).slice(0, 7))) : null;
    return { target, date: w.date || null, months };
  }
  function potTarget(plan, pot) {
    if (!pot) return 0;
    if (pot.targetFrom === 'slVehicle') return vehicleCalc(plan).upfrontGBP;
    if (pot.targetFrom === 'house') return houseCalc(plan).toSave;
    if (pot.targetFrom === 'wedding') return +((plan.calc && plan.calc.wedding && plan.calc.wedding.target) || 0);
    return +pot.target || 0;
  }

  /* ---------- category helpers ---------- */
  function catMap(plan) { const m = {}; categories(plan).forEach(c => m[c.id] = c); return m; }
  function accountMap(plan) { const m = {}; accounts(plan).forEach(a => m[a.id] = a); return m; }
  function potMap(plan) { const m = {}; pots(plan).forEach(p => m[p.id] = p); return m; }
  function debtMap(plan) { const m = {}; debts(plan).forEach(d => m[d.id] = d); return m; }
  // virtual categories: pot:<id>:in, pot:<id>:out, debt:<id>, xfer:joint, xfer:own, income
  function parseCat(id) {
    if (!id) return { type: 'none' };
    if (id.startsWith('pot:')) { const [, pot, dir] = id.split(':'); return { type: dir === 'out' ? 'potOut' : 'potIn', pot }; }
    if (id.startsWith('debt:')) return { type: 'debt', debt: id.slice(5) };
    if (id === 'xfer:own') return { type: 'xferOwn' };
    if (id.startsWith('xfer:')) return { type: 'xferJoint', pool: id.slice(5) };
    if (id === 'income') return { type: 'income' };
    return { type: 'cat', cat: id };
  }

  /* ---------- shared pools ---------- */
  // The joint account (settings in plan.joint) plus any other shared pot in plan.pools, such as a grocery pot.
  // A budget belongs to a pool when its payer is the pool's id. Each pool is split between the pays its own way,
  // and each person gets one transfer line per pool on their payday.
  function pools(plan) {
    const j = plan.joint || {};
    const jointAcc = j.account || ((accounts(plan).find(a => a.owner === 'joint' && a.type === 'current') || {}).id) || null;
    const base = Object.assign({ name: 'Joint account', method: 'proportional', order: 0 }, j, { id: 'joint', account: jointAcc });
    const rest = live(plan.pools).filter(p => p.id !== 'joint')
      .map(p => Object.assign({ method: base.method === 'remainder' ? 'proportional' : base.method, order: 50 }, p)).sort(byOrder);
    return [base].concat(rest);
  }
  function poolMap(plan) { const m = {}; pools(plan).forEach(p => m[p.id] = p); return m; }
  function poolTotal(plan, poolId, extraByCat = {}) {
    return r2(sum(categories(plan).filter(c => c.payer === poolId), c => (+c.budget || 0) + (extraByCat[c.id] || 0)));
  }
  function jointTotal(plan, extraByCat = {}) { return r2(sum(pools(plan), p => poolTotal(plan, p.id, extraByCat))); }
  function ownPlanned(plan, memberId) {
    return r2(sum(categories(plan).filter(c => c.payer === memberId), c => +c.budget || 0));
  }
  function linesPlanned(plan, memberId) {
    return r2(sum(planLines(plan).filter(l => l.member === memberId), l => +l.amount || 0));
  }
  function splitPool(plan, pool, J, ms, taken) {
    const shares = {};
    const pay = m => +m.plannedPay || 0;
    // the last person takes the rounding penny, so shares always add up to the pool exactly
    const fillLast = (list, total) => { if (!list.length) return; const last = list[list.length - 1]; shares[last.id] = r2(total - sum(list.slice(0, -1), m => shares[m.id])); };
    const method = pool.method || 'proportional';
    if (method === 'remainder' && ms.find(m => m.id === pool.remainderMember)) {
      const r = ms.find(m => m.id === pool.remainderMember);
      const rs = Math.max(0, pay(r) - ownPlanned(plan, r.id) - linesPlanned(plan, r.id) - (taken[r.id] || 0));
      shares[r.id] = r2(Math.min(rs, J));
      const others = ms.filter(m => m.id !== r.id);
      const rest = r2(Math.max(0, J - shares[r.id]));
      const tot = sum(others, pay) || others.length;
      others.forEach(m => shares[m.id] = r2(rest * ((sum([m], pay) || 1) / tot)));
      fillLast(others, rest);
    } else if (method === 'equal') {
      ms.forEach(m => shares[m.id] = r2(J / (ms.length || 1)));
      fillLast(ms, J);
    } else if (method === 'fixed') {
      ms.forEach(m => shares[m.id] = r2(+(pool.fixed && pool.fixed[m.id]) || 0));
    } else {
      const tot = sum(ms, pay);
      ms.forEach(m => shares[m.id] = r2(tot > 0 ? J * pay(m) / tot : J / (ms.length || 1)));
      fillLast(ms, J);
    }
    return shares;
  }
  function plannedShares(plan, extraByCat) {
    const ms = members(plan);
    const ps = pools(plan);
    const byPool = {}, shares = {}, taken = {};
    ms.forEach(m => { shares[m.id] = 0; taken[m.id] = 0; });
    // pools with a fixed rule first, so a "pays what's left" share knows what the other pools already take
    const order = ps.filter(p => p.method !== 'remainder').concat(ps.filter(p => p.method === 'remainder'));
    for (const p of order) {
      const J = poolTotal(plan, p.id, extraByCat);
      const sh = splitPool(plan, p, J, ms, taken);
      byPool[p.id] = { J, shares: sh };
      ms.forEach(m => { taken[m.id] = r2(taken[m.id] + (sh[m.id] || 0)); shares[m.id] = r2(shares[m.id] + (sh[m.id] || 0)); });
    }
    return { J: r2(sum(ps, p => byPool[p.id].J)), shares, byPool };
  }

  /* ---------- ledger: pot & debt balances through time ---------- */
  function ledger(plan, months) {
    const keys = Object.keys(months || {}).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
    const ps = pots(plan), dsList = debts(plan), acc = accountMap(plan);
    const bal = {}; ps.forEach(p => bal[p.id] = +p.opening || 0);
    const debtBal = {}; dsList.forEach(d => debtBal[d.id] = d.startBalance == null ? null : +d.startBalance);
    const startOf = {}, debtStartOf = {}, flows = {};
    for (const k of keys) {
      startOf[k] = Object.assign({}, bal);
      debtStartOf[k] = Object.assign({}, debtBal);
      const m = months[k];
      const f = { potIn: {}, debtPay: {}, debtCharge: {} };
      const add = (o, id, v) => { o[id] = r2((o[id] || 0) + v); };
      for (const t of txnsOf(m)) {
        const p = parseCat(t.category), amt = +t.amount || 0;
        if (p.type === 'potIn') add(f.potIn, p.pot, amt);
        else if (p.type === 'potOut') add(f.potIn, p.pot, -amt);
        else if (p.type === 'debt') add(f.debtPay, p.debt, amt);
        const a = acc[t.account];
        if (a && a.debt && !['debt', 'income', 'xferOwn'].includes(p.type)) {
          const d = (plan.debts || {})[a.debt];
          if (d && (!d.asOf || String(t.date) > String(d.asOf))) add(f.debtCharge, a.debt, amt);
        }
      }
      // A tick records a transfer nobody logged yet. If the same transfer is logged later as a transaction, the tick
      // must not count it a second time: anything logged since the tick comes off the tick.
      const logged = {};
      for (const t of txnsOf(m)) {
        const p = parseCat(t.category);
        if (p.type === 'potIn') add(logged, t.member + '|pot:' + p.pot, +t.amount || 0);
        else if (p.type === 'debt') add(logged, t.member + '|debt:' + p.debt, +t.amount || 0);
      }
      for (const [tkKey, tk] of Object.entries(m.ticks || {})) {
        if (!isObj(tk) || tk.deleted || !tk.done) continue;
        const mem = tkKey.split(':')[0];
        let amt = +tk.amount || 0;
        if (tk.coveredAt != null) {
          const lg = tk.pot ? (logged[mem + '|pot:' + tk.pot] || 0) : tk.debt ? (logged[mem + '|debt:' + tk.debt] || 0) : 0;
          amt = Math.max(0, amt - Math.max(0, lg - (+tk.coveredAt || 0)));
        }
        if (tk.pot) add(f.potIn, tk.pot, amt);
        if (tk.debt) add(f.debtPay, tk.debt, amt);
      }
      for (const mv of live(m.potMoves)) add(f.potIn, mv.pot, +mv.amount || 0);
      for (const [pid, v] of Object.entries(f.potIn)) bal[pid] = r2((bal[pid] || 0) + v);
      for (const d of dsList) {
        if (debtBal[d.id] == null) { if (f.debtPay[d.id] || f.debtCharge[d.id]) debtBal[d.id] = null; continue; }
        debtBal[d.id] = r2(debtBal[d.id] + (f.debtCharge[d.id] || 0) - (f.debtPay[d.id] || 0));
      }
      flows[k] = f;
    }
    return { keys, startOf, debtStartOf, flows, end: bal, debtEnd: debtBal };
  }
  function balancesAtStart(plan, months, L, key) {
    if (L.startOf[key]) return L.startOf[key];
    const prior = L.keys.filter(k => k < key);
    if (!prior.length) { const b = {}; pots(plan).forEach(p => b[p.id] = +p.opening || 0); return b; }
    // balance after last prior month
    const last = prior[prior.length - 1];
    const b = Object.assign({}, L.startOf[last]);
    for (const [pid, v] of Object.entries(L.flows[last].potIn)) b[pid] = r2((b[pid] || 0) + v);
    return b;
  }
  function balancesAtEnd(plan, months, L, key) {
    const b = Object.assign({}, balancesAtStart(plan, months, L, key));
    if (L.flows[key]) for (const [pid, v] of Object.entries(L.flows[key].potIn)) b[pid] = r2((b[pid] || 0) + v);
    return b;
  }

  /* ---------- pot completion & cascade ---------- */
  function isComplete(plan, pot, bal) {
    if (!pot) return false;
    if (pot.status === 'done') return true;
    const t = potTarget(plan, pot);
    return t > 0 && (bal[pot.id] || 0) >= t - EPS;
  }
  function cascadeTarget(plan, potId, bal) {
    const pm = potMap(plan);
    let p = pm[potId];
    const seen = new Set();
    while (p && isComplete(plan, p, bal) && !seen.has(p.id)) {
      seen.add(p.id);
      const next = pots(plan).find(q => q.id !== p.id && !seen.has(q.id) && (q.priority ?? 99) > (p.priority ?? 99) && potTarget(plan, q) > 0 && !isComplete(plan, q, bal));
      if (!next) { const fb = (plan.settings && plan.settings.cascadeFallback) || null; return fb && pm[fb] ? fb : p.id; }
      p = next;
    }
    return p ? p.id : potId;
  }
  function firstUnfinished(plan, bal) {
    const p = pots(plan).find(q => potTarget(plan, q) > 0 && !isComplete(plan, q, bal));
    return p ? p.id : ((plan.settings && plan.settings.cascadeFallback) || null);
  }

  /* ---------- month computation ---------- */
  const GROUPS = ['joint', 'own', 'savings', 'srilanka', 'debt', 'buffer'];
  function lineGroup(plan, line) {
    if (line.kind === 'joint' || line.kind === 'cover') return 'joint';
    if (line.kind === 'debt') return 'debt';
    if (line.kind === 'buffer') return line.pot ? (((plan.pots || {})[line.pot] || {}).group === 'srilanka' ? 'srilanka' : 'savings') : 'buffer';
    if (line.kind === 'support') return 'srilanka';
    if (line.kind === 'pot') return ((plan.pots || {})[line.pot] || {}).group === 'srilanka' ? 'srilanka' : 'savings';
    return 'own';
  }

  function computeMonth(plan, months, key, Lopt) {
    const L = Lopt || ledger(plan, months);
    const m = (months && months[key]) || {};
    const ms = members(plan);
    const pm = potMap(plan), cm = catMap(plan), am = accountMap(plan), dm = debtMap(plan);
    const startBal = balancesAtStart(plan, months, L, key);
    const txns = txnsOf(m);

    // running costs from completed pots (e.g. car)
    const runAdd = {};
    for (const p of pots(plan)) {
      if (p.runningCost > 0 && p.runningCategory && isComplete(plan, p, startBal)) runAdd[p.runningCategory] = (runAdd[p.runningCategory] || 0) + (+p.runningCost);
    }
    const moves = live(m.budgetMoves);
    const sweeps = live(m.potMoves).filter(x => x.fromCategory);
    // category budgets & spend
    const cats = categories(plan).map(c => {
      const base = (m.catBudgets && m.catBudgets[c.id] != null && m.catBudgets[c.id] !== '') ? +m.catBudgets[c.id] : (+c.budget || 0);
      const extra = runAdd[c.id] || 0;
      const movedIn = sum(moves.filter(x => x.to === c.id), x => x.amount);
      const movedOut = sum(moves.filter(x => x.from === c.id), x => x.amount);
      const swept = sum(sweeps.filter(x => x.fromCategory === c.id), x => x.amount);
      const budget = r2(base + extra + movedIn - movedOut - swept);
      const tx = txns.filter(t => t.category === c.id);
      const spent = r2(sum(tx, t => t.amount));
      return Object.assign({}, c, { base, extra, movedIn: r2(movedIn), movedOut: r2(movedOut), swept: r2(swept), budget, spent, left: r2(budget - spent), count: tx.length });
    });
    const catById = {}; cats.forEach(c => catById[c.id] = c);

    // shared pools: the joint account and any other shared pot, each with its own split
    const PS = pools(plan);
    const { byPool } = plannedShares(plan, runAdd);
    const Jp = {}, poolCats = {};
    PS.forEach(p => {
      const pc = cats.filter(c => c.payer === p.id);
      Jp[p.id] = r2(sum(pc, c => c.base + c.extra));
      poolCats[p.id] = new Set(pc.map(c => c.id));
    });
    const J = r2(sum(PS, p => Jp[p.id]));
    const isSharedAcc = acc => !!(am[acc] && am[acc].owner === 'joint');
    const poolLineId = (pid, mid) => (pid === 'joint' ? 'joint:' : pid + ':') + mid;
    const coverLineId = (pid, mid) => (pid === 'joint' ? 'cover:' : 'cover:' + pid + ':') + mid;

    const ov = m.lines || {};
    const ticks = m.ticks || {};
    const res = {};
    const potLinesFor = memberId => {
      const out = [];
      const base = planLines(plan).filter(l => l.member === memberId && !(ov[l.id] && ov[l.id].deleted));
      for (const l of base) {
        const o = ov[l.id] || {};
        const amount = o.amount != null ? +o.amount : (+l.amount || 0);
        const kind = l.kind || 'pot';
        if (kind === 'pot') {
          const chosen = o.pot || l.pot;
          const p = pm[chosen];
          let target = cascadeTarget(plan, chosen, startBal);
          let runningSplit = 0;
          if (p && p.runningCost > 0 && isComplete(plan, p, startBal)) runningSplit = Math.min(amount, +p.runningCost);
          out.push({ id: l.id, planId: l.id, kind: 'pot', pot: target, origPot: chosen, cascaded: target !== chosen ? chosen : null, redirected: o.pot && o.pot !== l.pot ? l.pot : null, amount: r2(amount - runningSplit), planned: +l.amount || 0, overridden: o.amount != null || !!o.pot, note: o.note || l.note || '' });
        } else if (kind === 'debt') {
          out.push({ id: l.id, planId: l.id, kind: 'debt', debt: l.debt, amount: r2(amount), planned: +l.amount || 0, overridden: o.amount != null, note: o.note || l.note || '' });
        }
      }
      return out;
    };

    for (const mem of ms) {
      const pay = m.pay && m.pay[mem.id];
      const received = pay && pay.amount != null && pay.amount !== '';
      const income = received ? +pay.amount : (+mem.plannedPay || 0);
      const lines = [];
      // one transfer line per shared pool
      for (const p of PS) {
        const lid = poolLineId(p.id, mem.id);
        const lo = ov[lid] || {};
        const base = r2((byPool[p.id] && byPool[p.id].shares[mem.id]) || 0);
        lines.push({ id: lid, kind: 'joint', pool: p.id, amount: r2(lo.amount != null ? +lo.amount : base), planned: base, overridden: lo.amount != null, note: lo.note || '' });
      }
      // own categories
      for (const c of cats.filter(c => c.payer === mem.id)) {
        const budget = r2(c.base + c.extra);
        if (budget <= 0 && !c.count) continue;
        const catOv = m.catBudgets && m.catBudgets[c.id] != null && m.catBudgets[c.id] !== '';
        lines.push({ id: 'cat:' + c.id, kind: c.kind === 'support' ? 'support' : 'own', category: c.id, amount: budget, planned: +c.budget || 0, overridden: !!catOv, note: c.extra ? 'Includes £' + c.extra + ' running costs' : '' });
      }
      // pot lines
      lines.push(...potLinesFor(mem.id));
      // extras
      for (const x of live(m.extra).filter(x => x.member === mem.id)) {
        const xo = { id: x.id, kind: x.kind || 'other', amount: r2(+x.amount || 0), planned: 0, overridden: false, extra: true, label: x.label, note: x.note || '' };
        if (x.kind === 'pot') { xo.pot = cascadeTarget(plan, x.pot, startBal); xo.origPot = x.pot; }
        if (x.kind === 'debt') xo.debt = x.debt;
        if (x.kind === 'own' || x.kind === 'support') xo.category = x.category;
        lines.push(xo);
      }
      // "Pays what's left" split: the share is what this pay leaves after everything else this person pays this month,
      // never more than the planned share. A short or part-month pay shrinks the shared transfer (the backstop covers
      // the gap) instead of cutting their savings, and an Undo lands on a figure the pay can actually fund.
      for (const p of PS) {
        if (p.method !== 'remainder' || p.remainderMember !== mem.id) continue;
        const jl = lines.find(l => l.kind === 'joint' && l.pool === p.id);
        if (!jl || jl.overridden) continue;
        const others = r2(sum(lines.filter(l => l !== jl), l => l.amount));
        const fit = r2(Math.min(jl.planned, Math.max(0, income - others)));
        if (fit < jl.planned - EPS) { jl.amount = fit; if (!jl.note) jl.note = 'Less this month: what this pay leaves after the lines below'; }
      }
      res[mem.id] = { member: mem, income, received: !!received, payDate: received ? pay.date : paydayFor(mem, key), payNote: pay && pay.note, lines };
    }

    // what has already been moved or spent against each line. Measured before any cuts, because a cut must never
    // undo money that has already gone across.
    const mineOf = {};
    ms.forEach(mem => { mineOf[mem.id] = txns.filter(t => t.member === mem.id); });
    function measure(memId, l) {
      const mine = mineOf[memId] || [];
      const tk = ticks[memId + ':' + l.id];
      const rawTick = tk && tk.done && !tk.deleted ? (+tk.amount || 0) : 0;
      let covered = 0;
      if (l.kind === 'joint') {
        // money put into this pool from the person's own accounts: transfers in, and pool budgets paid from their own card
        const pc = poolCats[l.pool] || new Set();
        covered = sum(mine.filter(t => (pc.has(t.category) && !isSharedAcc(t.account)) || t.category === 'xfer:' + l.pool), t => t.amount);
      } else if (l.kind === 'pot') {
        covered = sum(mine.filter(t => t.category === 'pot:' + l.pot + ':in'), t => t.amount);
      } else if (l.kind === 'debt') {
        covered = sum(mine.filter(t => t.category === 'debt:' + l.debt), t => t.amount);
      } else if ((l.kind === 'own' || l.kind === 'support') && l.category) {
        covered = catById[l.category] ? catById[l.category].spent : 0;
      }
      l.covered = r2(covered);
      l.tick = tk && !tk.deleted ? tk : null;
      // transactions logged after the tick replace it rather than add to it
      const since = tk && tk.coveredAt != null ? Math.max(0, covered - (+tk.coveredAt || 0)) : 0;
      l.ticked = r2(Math.max(0, rawTick - since));
    }
    ms.forEach(mem => res[mem.id].lines.forEach(l => measure(mem.id, l)));

    // income shortfall cuts: lowest-priority pots first, shared transfers last, and never below what has already moved
    const cutOrder = l => {
      if (l.kind === 'pot') { const p = pm[l.pot]; return 100 - ((p && p.priority) ?? 99); }
      if (l.kind === 'joint') return 500;
      return null; // never cut
    };
    function applyCuts(r) {
      r.lines.forEach(l => { l.cut = 0; l.final = l.amount; });
      let need = r2(sum(r.lines, l => l.final) - r.income);
      if (need > EPS) {
        const cuttable = r.lines.filter(l => cutOrder(l) != null && l.final > 0).sort((a, b) => cutOrder(a) - cutOrder(b));
        for (const l of cuttable) {
          if (need <= EPS) break;
          const room = r2(Math.max(0, l.final - (l.covered || 0) - (l.ticked || 0)));
          const c = r2(Math.min(room, need));
          if (c <= EPS) continue;
          l.cut = r2(l.cut + c); l.final = r2(l.final - c); need = r2(need - c);
        }
      }
      r.unfunded = need > EPS ? need : 0;
    }
    ms.forEach(mem => applyCuts(res[mem.id]));

    const defaultBackstop = (plan.joint && plan.joint.backstop) || (ms[ms.length - 1] && ms[ms.length - 1].id);
    const backstopOf = p => (p.backstop && res[p.backstop] ? p.backstop : defaultBackstop);
    const unpaid = l => r2(Math.max(0, l.final - l.covered - l.ticked));
    const shift = (l, x, note) => { l.amount = r2(l.amount + x); l.final = r2(l.final + x); l.swapped = r2((l.swapped || 0) + x); if (!l.note) l.note = note; };
    // Extra put into one pool is swapped between pools with the backstop: if one person puts more than their share
    // into, say, the grocery pot, the backstop puts that much less into it and the person moves that much less to the
    // joint account. Both pools stay exactly funded and nobody pays twice.
    for (const p of PS) {
      const bid = backstopOf(p);
      const bl = res[bid] && res[bid].lines.find(l => l.kind === 'joint' && l.pool === p.id);
      if (!bl) continue;
      for (const mem of ms) {
        if (mem.id === bid) continue;
        const r = res[mem.id];
        const jl = r.lines.find(l => l.kind === 'joint' && l.pool === p.id);
        if (!jl) continue;
        const extra = r2(jl.covered + jl.ticked - jl.final);
        const others = r.lines.filter(l => l.kind === 'joint' && l.pool !== p.id);
        const x = r2(Math.min(extra, unpaid(bl), sum(others, unpaid)));
        if (x <= EPS) continue;
        const pName = String(p.name || 'pool'), who = mem.label || 'They';
        shift(jl, x, `Includes ${'£' + x.toFixed(2)} extra put in, so that much less goes elsewhere`);
        shift(bl, -x, `${'£' + x.toFixed(2)} less: ${who} put more than their share into the ${pName.toLowerCase()}`);
        let rem = x;
        for (const ol of others) {
          const t = r2(Math.min(unpaid(ol), rem));
          if (t > EPS) { shift(ol, -t, `${'£' + t.toFixed(2)} less: that much extra went into the ${pName.toLowerCase()}`); rem = r2(rem - t); }
          if (rem <= EPS) break;
        }
      }
    }
    // Extra that can't be swapped (their other shared transfers are already made) comes off the backstop's share of
    // the same pool. The person who put it in then has that much less for everything else, so their pay is re-checked
    // and any shortfall shows on their payday instead of hiding.
    const touched = new Set();
    for (const p of PS) {
      const bid = backstopOf(p);
      const bl = res[bid] && res[bid].lines.find(l => l.kind === 'joint' && l.pool === p.id);
      if (!bl) continue;
      for (const mem of ms) {
        if (mem.id === bid) continue;
        const jl = res[mem.id].lines.find(l => l.kind === 'joint' && l.pool === p.id);
        if (!jl) continue;
        const x = r2(Math.min(r2(jl.covered + jl.ticked - jl.final), unpaid(bl)));
        if (x <= EPS) continue;
        const pName = String(p.name || 'pool'), who = mem.label || 'They';
        shift(jl, x, `Includes ${'£' + x.toFixed(2)} extra put in`);
        shift(bl, -x, `${'£' + x.toFixed(2)} less: ${who} put more than their share into the ${pName.toLowerCase()}`);
        touched.add(mem.id); touched.add(bid);
      }
    }
    touched.forEach(id => applyCuts(res[id]));

    // cover: whatever a pool is still missing falls to that pool's backstop
    const poolProvided = pid => r2(sum(ms, mem => sum(res[mem.id].lines.filter(l => (l.kind === 'joint' || l.kind === 'cover') && l.pool === pid), l => l.final)));
    for (const p of PS) {
      const deficit = r2(Jp[p.id] - poolProvided(p.id));
      const bid = backstopOf(p);
      if (deficit > EPS && res[bid]) {
        const r = res[bid];
        const cid = coverLineId(p.id, bid);
        const co = ov[cid] || {};
        const cl = { id: cid, kind: 'cover', pool: p.id, amount: r2(co.amount != null ? +co.amount : deficit), planned: 0, overridden: co.amount != null, note: co.note || (p.id === 'joint' ? 'Covers the rest of the joint bills this month' : 'Covers the rest of the ' + String(p.name || 'shared pot').toLowerCase() + ' this month') };
        measure(bid, cl);
        r.lines.push(cl);
        applyCuts(r);
      }
    }

    // left / done / labels, then surplus
    for (const mem of ms) {
      const r = res[mem.id];
      for (const l of r.lines) {
        l.left = r2(l.final - l.covered - l.ticked);
        l.transfer = ['joint', 'cover', 'pot', 'debt', 'buffer'].includes(l.kind);
        l.done = l.transfer ? (l.final > 0 ? l.left <= EPS : true) : false;
        l.group = lineGroup(plan, l);
        l.label = l.label || lineLabel(plan, l, mem);
      }
      // money put into a pool beyond the share spills into the same person's cover line for that pool
      for (const p of PS) {
        const jl = r.lines.find(l => l.kind === 'joint' && l.pool === p.id), cl = r.lines.find(l => l.kind === 'cover' && l.pool === p.id);
        if (jl && cl && jl.left < 0) { const spill = -jl.left; jl.left = 0; jl.done = true; cl.covered = r2(cl.covered + spill); cl.left = r2(cl.final - cl.covered - cl.ticked); cl.done = cl.left <= EPS; }
      }
      const allocated = r2(sum(r.lines, l => l.final));
      r.allocated = allocated;
      const surplus = r2(r.income - allocated);
      r.surplus = surplus > EPS ? surplus : 0;
      if (r.surplus > 0) {
        const ovf = mem.overflow || 'buffer';
        const bo = ov['buffer:' + mem.id] || {};
        let potId = null;
        if (ovf === 'auto') potId = firstUnfinished(plan, startBal);
        else if (ovf !== 'buffer' && pm[ovf]) potId = cascadeTarget(plan, ovf, startBal);
        if (bo.pot) potId = bo.pot === 'buffer' ? null : bo.pot;
        const tk = ticks[mem.id + ':buffer:' + mem.id];
        const tickAmt = tk && tk.done && !tk.deleted ? (+tk.amount || 0) : 0;
        const bl = { id: 'buffer:' + mem.id, kind: 'buffer', pot: potId, amount: r.surplus, final: r.surplus, cut: 0, covered: 0, ticked: r2(tickAmt), planned: 0, tick: tk || null, transfer: !!potId };
        bl.left = r2(bl.final - bl.ticked);
        bl.done = potId ? bl.left <= EPS : false;
        bl.group = lineGroup(plan, bl);
        bl.label = potId ? 'Extra to ' + ((pm[potId] && pm[potId].name) || 'a pot') : 'Extra stays in your account';
        r.lines.push(bl);
      }
      r.toMove = r2(sum(r.lines.filter(l => l.transfer && l.kind !== 'buffer'), l => Math.max(0, l.left)) + sum(r.lines.filter(l => l.kind === 'buffer' && l.pot), l => Math.max(0, l.left)));
      r.short = r.unfunded || 0;
    }

    // shared accounts view, one per pool, plus everything together
    const poolViews = PS.map(p => {
      const lines = ms.flatMap(mem => res[mem.id].lines.filter(l => (l.kind === 'joint' || l.kind === 'cover') && l.pool === p.id).map(l => Object.assign({ member: mem.id }, l)));
      const provided = poolProvided(p.id);
      return { id: p.id, name: p.name, account: p.account || null, method: p.method || 'proportional', remainderMember: p.remainderMember || null, backstop: p.backstop || defaultBackstop, need: Jp[p.id], provided, deficit: r2(Jp[p.id] - provided), lines, cats: cats.filter(c => c.payer === p.id) };
    });
    const joint = { need: J, provided: r2(sum(poolViews, v => v.provided)), deficit: r2(sum(poolViews, v => Math.max(0, v.deficit))), lines: poolViews.flatMap(v => v.lines) };

    // spending summaries
    const spendTx = txns.filter(t => catById[t.category]);
    const potOutTx = txns.filter(t => parseCat(t.category).type === 'potOut');
    const uncategorised = txns.filter(t => !t.category || (parseCat(t.category).type === 'cat' && !catById[t.category]));
    const totals = {
      income: r2(sum(ms, mem => res[mem.id].income)),
      incomeReceived: r2(sum(ms.filter(mem => res[mem.id].received), mem => res[mem.id].income)),
      planSpend: r2(sum(cats, c => c.budget)),
      spent: r2(sum(spendTx, t => t.amount)),
      spentFromPots: r2(sum(potOutTx, t => t.amount)),
      saved: r2(sum(ms, mem => sum(res[mem.id].lines.filter(l => l.kind === 'pot' || (l.kind === 'buffer' && l.pot)), l => l.covered + l.ticked)) + sum(live(m.potMoves).filter(x => (+x.amount || 0) > 0), x => x.amount)),
      savePlanned: r2(sum(ms, mem => sum(res[mem.id].lines.filter(l => l.kind === 'pot'), l => l.final))),
      discretionarySpent: r2(sum(cats.filter(c => c.kind === 'discretionary'), c => c.spent)),
      discretionaryLeft: r2(sum(cats.filter(c => c.kind === 'discretionary' || c.kind === 'living'), c => Math.max(0, c.left))),
      overspent: cats.filter(c => c.spent > c.budget + EPS),
    };
    // by member spend (who paid)
    const byMember = {};
    ms.forEach(mem => byMember[mem.id] = r2(sum(spendTx.filter(t => t.member === mem.id && (!am[t.account] || am[t.account].owner !== 'joint')), t => t.amount)));
    byMember.joint = r2(sum(spendTx.filter(t => am[t.account] && am[t.account].owner === 'joint'), t => t.amount));
    // groups
    const groupOrder = (plan.groups || []);
    const groupNames = [];
    cats.forEach(c => { if (!groupNames.includes(c.group || 'Other')) groupNames.push(c.group || 'Other'); });
    groupNames.sort((a, b) => (groupOrder.indexOf(a) === -1 ? 99 : groupOrder.indexOf(a)) - (groupOrder.indexOf(b) === -1 ? 99 : groupOrder.indexOf(b)));
    const groups = groupNames.map(g => {
      const cs = cats.filter(c => (c.group || 'Other') === g);
      return { name: g, budget: r2(sum(cs, c => c.budget)), spent: r2(sum(cs, c => c.spent)), cats: cs };
    });
    // daily cumulative
    const dim = daysInMonth(key);
    const daily = Array.from({ length: dim }, () => 0);
    spendTx.forEach(t => { if (monthOf(t.date) === key) { const d = +String(t.date).slice(8, 10); if (d >= 1 && d <= dim) daily[d - 1] += +t.amount || 0; } });
    let run = 0; const cumulative = daily.map(v => (run = r2(run + v)));

    return { key, month: m, members: ms, res, joint, pools: poolViews, cats, catById, groups, totals, byMember, uncategorised, txns, startBal, endBal: balancesAtEnd(plan, months, L, key), ledger: L, cumulative, runAdd };
  }

  function lineLabel(plan, l, mem) {
    const pm = plan.pots || {}, cm = plan.categories || {}, dm = plan.debts || {};
    if (l.kind === 'joint') { const p = poolMap(plan)[l.pool || 'joint']; return (p && p.name) || 'Joint account'; }
    if (l.kind === 'cover') { const p = poolMap(plan)[l.pool || 'joint']; return !p || p.id === 'joint' ? 'Cover the joint shortfall' : 'Cover the ' + String(p.name).toLowerCase() + ' shortfall'; }
    if (l.kind === 'pot') return (pm[l.pot] && pm[l.pot].name) || 'Savings pot';
    if (l.kind === 'debt') return 'Pay ' + ((dm[l.debt] && dm[l.debt].name) || 'debt');
    if (l.category) return (cm[l.category] && cm[l.category].name) || 'Spending';
    return l.label || 'Other';
  }

  /* ---------- projection (cascade simulation) ---------- */
  function project(plan, months, fromKey, nMonths = 60) {
    const L = ledger(plan, months);
    const bal = Object.assign({}, balancesAtStart(plan, months, L, fromKey));
    const ps = pots(plan);
    const baby = (plan.calc && plan.calc.baby) || {};
    const pauseStart = baby.leaveStart ? String(baby.leaveStart).slice(0, 7) : null;
    const pauseLen = +baby.months || 0;
    const series = {}; ps.forEach(p => series[p.id] = []);
    const doneAt = {};
    ps.forEach(p => { if (isComplete(plan, p, bal)) doneAt[p.id] = 'done'; });
    const keys = [];
    for (let i = 0; i < nMonths; i++) {
      const key = addMonths(fromKey, i);
      keys.push(key);
      const paused = pauseStart && pauseLen > 0 && monthDiff(pauseStart, key) >= 0 && monthDiff(pauseStart, key) < pauseLen;
      const md = months && months[key];
      const ov = (md && md.lines) || {};
      // monthly amounts per pot (plan lines with overrides; no cascade yet)
      const inflow = {};
      if (!paused) {
        for (const l of planLines(plan)) {
          if ((l.kind || 'pot') !== 'pot') continue;
          const o = ov[l.id] || {};
          if (o.deleted) continue;
          const amt = o.amount != null ? +o.amount : (+l.amount || 0);
          const pot = o.pot || l.pot;
          inflow[pot] = (inflow[pot] || 0) + amt;
        }
        for (const x of live(md && md.extra)) if (x.kind === 'pot' && x.pot) inflow[x.pot] = (inflow[x.pot] || 0) + (+x.amount || 0);
      }
      // this month's actual flows already recorded (for months with data, use real numbers if larger)
      // cascade in priority order
      let spare = 0;
      const chain = ps.filter(p => potTarget(plan, p) > 0);
      const loose = ps.filter(p => !(potTarget(plan, p) > 0));
      for (const p of chain) {
        let avail = (inflow[p.id] || 0) + spare;
        const t = potTarget(plan, p);
        if (isComplete(plan, p, bal)) {
          if (p.runningCost > 0 && inflow[p.id] > 0) avail -= Math.min(+p.runningCost, inflow[p.id] || 0);
          spare = Math.max(0, avail);
          continue;
        }
        const add = Math.max(0, Math.min(avail, t - (bal[p.id] || 0)));
        bal[p.id] = r2((bal[p.id] || 0) + add);
        spare = r2(avail - add);
        if (!doneAt[p.id] && bal[p.id] >= t - EPS) doneAt[p.id] = key;
      }
      const fb = (plan.settings && plan.settings.cascadeFallback);
      for (const p of loose) {
        let add = inflow[p.id] || 0;
        if (p.id === fb) { add += spare; spare = 0; }
        if (p.sinking) { bal[p.id] = r2((bal[p.id] || 0) + add); }
        else bal[p.id] = r2((bal[p.id] || 0) + add);
      }
      if (spare > 0) { const last = chain[chain.length - 1]; if (last) bal[last.id] = r2((bal[last.id] || 0) + spare); }
      ps.forEach(p => series[p.id].push(r2(bal[p.id] || 0)));
    }
    return { keys, series, doneAt, pauseStart, pauseLen };
  }

  /* ---------- baby / maternity estimate ---------- */
  function babyCalc(plan) {
    const b = (plan.calc && plan.calc.baby) || {};
    const ms = members(plan);
    const wife = ms.find(m => m.id === b.member) || ms[1] || ms[0];
    const partner = ms.find(m => m !== wife);
    const cats = categories(plan);
    const spend = sum(cats, c => +c.budget || 0);
    const commute = sum(cats.filter(c => c.role === 'commute'), c => +c.budget || 0);
    const babyCosts = +b.babyCosts || 250;
    const spendDuring = spend - commute + babyCosts;
    const smpMonthly = (+b.smpWeekly || 194.32) * 52 / 12;
    const partnerPay = partner ? (+partner.plannedPay || 0) : 0;
    const shortSMP = Math.max(0, spendDuring - partnerPay - (b.enhancedMonthly ? +b.enhancedMonthly : smpMonthly));
    const months = +b.months || 9;
    const paidMonths = Math.min(months, 9);
    const unpaidMonths = Math.max(0, months - 9);
    const shortUnpaid = Math.max(0, spendDuring - partnerPay);
    const smpPhase = Math.max(0, paidMonths - 1.4); // first ~6 weeks at 90% of pay
    const total = shortSMP * smpPhase + shortUnpaid * unpaidMonths + (+b.kit || 3000);
    return { spendDuring: r2(spendDuring), smpMonthly: r2(smpMonthly), partnerPay, shortSMP: r2(shortSMP), shortUnpaid: r2(shortUnpaid), smpPhase: r2(smpPhase), unpaidMonths, total: r2(total), kit: +b.kit || 3000, months };
  }

  /* ---------- auto-categorise ---------- */
  const BUILTIN = [
    [/deliveroo|uber ?eats|just ?eat|dominos|domino's|pizza hut|kfc|mcdonald|nando|burger king/i, 'takeaways'],
    [/tesco|sainsbury|asda|aldi|lidl|waitrose|morrisons|ocado|co-?op|iceland|m&s food|marks.*spencer.*food|grocery|groceries/i, 'groceries'],
    [/caff[eè] nero|costa|starbucks|pret|greggs|coffee/i, '@personal'],
    [/claude|anthropic|chatgpt|openai/i, '@personal'],
    [/apple music/i, 'music'],
    [/netflix|spotify|disney\+|prime video|youtube premium/i, '@personal'],
    [/\btfl\b|transport for london|southern rail|thameslink|trainline|national rail|oyster/i, 'commute'],
    [/virgin media/i, 'internet'],
    [/octopus|british gas|edf|e\.on|eon next|ovo|scottish power|electric/i, 'energy'],
    [/water/i, 'water'],
    [/council tax|borough council|city council|district council/i, 'council'],
    [/mortgage|halifax mtg|nationwide mtg|santander mtg/i, 'mortgage'],
    [/tv licen[cs]e/i, 'tvlicence'],
    [/home insurance|contents insurance|aviva home|direct line home/i, 'homeins'],
    [/life insurance|legal & general|vitality life|aviva life/i, 'lifeins'],
    [/boots|superdrug|savers|wilko|home bargains|b&m/i, 'household'],
    [/restaurant|dishoom|wagamama|bistro|grill|dining|brasserie/i, 'eatingout'],
    [/zara|h&m|primark|uniqlo|next retail|asos|john lewis|gift/i, 'clothes'],
    [/karate|dojo/i, 'karate'],
    [/vodafone|\bee\b|o2|three|giffgaff|lebara|lyca|smarty|voxi|id mobile/i, '@phone'],
    [/save the change/i, '@pot:slef'],
    [/investengine/i, '@pot:invest'],
    [/american express|amex/i, '@debt:amex'],
    [/salary|payroll|wages/i, 'income'],
  ];
  function resolveRoleTarget(plan, role, memberId) {
    const cats = categories(plan);
    if (role === 'income') return 'income';
    if (role.startsWith('@pot:')) { const tag = role.slice(5); const p = pots(plan).find(p => p.tag === tag); return p ? 'pot:' + p.id + ':in' : null; }
    if (role.startsWith('@debt:')) { const tag = role.slice(6); const d = debts(plan).find(d => d.tag === tag); return d ? 'debt:' + d.id : null; }
    const r = role === '@personal' ? 'personal' : role === '@phone' ? 'phone' : role.startsWith('@role:') ? role.slice(6) : role;
    const memberIds = new Set(members(plan).map(m => m.id));
    const mine = cats.find(c => c.role === r && c.payer === memberId);
    if (mine) return mine.id;
    const shared = cats.find(c => c.role === r && !memberIds.has(c.payer));
    if (shared) return shared.id;
    if (memberIds.has(memberId) && cats.some(c => c.role === r)) {
      // that budget belongs to the other person: file it under this person's personal money instead
      const pers = cats.find(c => c.role === 'personal' && c.payer === memberId);
      if (pers) return pers.id;
    }
    const any = cats.find(c => c.role === r);
    return any ? any.id : null;
  }
  // a rule that should follow whoever paid (e.g. takeaways) points at the role, not one person's budget
  function ruleTargetFor(plan, categoryId) {
    const cats = categories(plan);
    const c = cats.find(x => x.id === categoryId);
    if (!c || !c.role) return categoryId;
    const memberIds = new Set(members(plan).map(m => m.id));
    if (!memberIds.has(c.payer)) return categoryId;
    return cats.some(x => x.id !== c.id && x.role === c.role && memberIds.has(x.payer)) ? '@role:' + c.role : categoryId;
  }
  function normalise(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function merchantKey(desc) {
    return normalise(desc).replace(/\d{2,}/g, ' ').replace(/[^a-z& ]/g, ' ').replace(/\b(card|payment|pos|contactless|purchase|ltd|limited|uk|gb|london|www|com|co)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  }
  function categorise(plan, desc, memberId, amount) {
    const d = normalise(desc);
    if (!d) return null;
    // user rules first (longest match wins)
    const rs = rules(plan).filter(r => r.match && d.includes(normalise(r.match))).sort((a, b) => normalise(b.match).length - normalise(a.match).length);
    for (const r of rs) {
      let target = r.category;
      if (target && target.startsWith('@')) target = resolveRoleTarget(plan, target, memberId);
      if (target) return { category: target, source: 'rule', rule: r.id };
    }
    for (const [re, role] of BUILTIN) {
      if (re.test(desc)) {
        if (role === 'income' && amount > 0) continue;
        const target = resolveRoleTarget(plan, role, memberId);
        if (target) return { category: target, source: 'builtin' };
      }
    }
    return null;
  }

  /* ---------- CSV parsing ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' ) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  function parseDate(v) {
    const t = String(v || '').trim();
    let m;
    if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ds(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return ds(y, +m[2], +m[1]); }
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    if ((m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; const mo = months[m[2].toLowerCase()]; if (mo) return ds(y, mo, +m[1]); }
    return null;
  }
  const num = v => { const t = String(v == null ? '' : v).replace(/[£,\s]/g, '').replace(/^\((.*)\)$/, '-$1'); if (t === '' || t === '-') return null; const n = Number(t); return isFinite(n) ? n : null; };
  function detectColumns(header) {
    const h = header.map(x => normalise(x));
    const find = (...keys) => h.findIndex(x => keys.some(k => x === k || x.includes(k)));
    return {
      date: find('transaction date', 'date', 'posted'),
      desc: find('transaction description', 'description', 'details', 'merchant', 'narrative', 'payee', 'reference', 'name'),
      amount: h.findIndex(x => x === 'amount' || x === 'value' || x.includes('amount (gbp)') || x === 'amount gbp'),
      debit: find('debit amount', 'paid out', 'money out', 'debit', 'out'),
      credit: find('credit amount', 'paid in', 'money in', 'credit', 'in'),
    };
  }
  function bankRows(text, opts = {}) {
    const rows = parseCSV(text);
    if (!rows.length) return { rows: [], cols: null, header: [] };
    let hi = rows.findIndex(r => { const c = detectColumns(r); return c.date >= 0 && (c.amount >= 0 || c.debit >= 0); });
    if (hi < 0) hi = 0;
    const header = rows[hi];
    const cols = detectColumns(header);
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const date = parseDate(r[cols.date]);
      if (!date) continue;
      let amt = null;
      if (cols.debit >= 0 || cols.credit >= 0) {
        const d = num(r[cols.debit]), c = num(r[cols.credit]);
        if (d) amt = Math.abs(d); else if (c) amt = -Math.abs(c);
      }
      if (amt == null && cols.amount >= 0) {
        const a = num(r[cols.amount]);
        if (a == null) continue;
        amt = opts.outIsNegative ? -a : a; // spending positive
      }
      if (amt == null) continue;
      const desc = (cols.desc >= 0 ? r[cols.desc] : r.filter((_, i) => i !== cols.date).join(' ')).trim();
      out.push({ date, desc, amount: r2(amt) });
    }
    // guess sign convention: if single amount column and most values negative, spending is negative
    return { rows: out, cols, header };
  }

  return {
    r2, sum, live, byOrder, pad, monthOf, addMonths, monthDiff, daysInMonth, lastWorkingDay, paydayFor, transferDate, dow,
    members, categories, pots, accounts, debts, planLines, rules, trips, txnsOf,
    sdlt, pmt, fx, vehicleCalc, houseCalc, weddingCalc, potTarget, babyCalc,
    catMap, accountMap, potMap, debtMap, parseCat, jointTotal, plannedShares, pools, poolMap, poolTotal, ruleTargetFor, resolveRoleTarget,
    ledger, balancesAtStart, balancesAtEnd, isComplete, cascadeTarget, firstUnfinished,
    computeMonth, lineLabel, project, GROUPS,
    categorise, merchantKey, normalise, parseCSV, bankRows, parseDate, num,
  };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
