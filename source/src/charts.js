/* ===== Charts: hand-drawn SVG, sized to their container ===== */
function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => { const v = Math.round(el.getBoundingClientRect().width); if (v > 0) setW(v); };
    set();
    if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect(); }
    window.addEventListener('resize', set); return () => window.removeEventListener('resize', set);
  }, []);
  return w;
}
const GROUP_META = {
  joint: { label: 'Shared accounts', color: 'var(--s1)' },
  own: { label: 'Own bills & personal money', color: 'var(--s2)' },
  savings: { label: 'Savings & investing', color: 'var(--s3)' },
  srilanka: { label: 'Sri Lanka family', color: 'var(--s4)' },
  debt: { label: 'Paying off debt', color: 'var(--s5)' },
  buffer: { label: 'Left in account', color: 'var(--quiet-mark)' },
};
// one colour per shared pool: the joint account keeps slot 1; the next shared pot takes slot 6, and its node sits
// after debt so every neighbouring pair in the flow chart stays a validated pair
const POOL_COLORS = ['var(--s1)', 'var(--s6)', 'var(--s7)'];
const poolColor = i => POOL_COLORS[i] || POOL_COLORS[0];
function niceStep(raw) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function ticks(max, n = 4) {
  const step = niceStep(Math.max(1, max) / n);
  const count = Math.max(1, Math.ceil(Math.max(1, max) / step));
  return Array.from({ length: count + 1 }, (_, i) => E.r2(step * i));
}
const shortMoney = v => { const a = Math.abs(v); if (a >= 1e6) return '£' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'm'; if (a >= 1e3) return '£' + (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'; return '£' + Math.round(v); };

/* ---------- Sankey: incomes → where the money goes ---------- */
function Sankey({ sources, targets, links, height }) {
  const ref = useRef(null);
  const W = useWidth(ref, 720);
  const [hover, setHover] = useState(null);
  const narrow = W < 560;
  const H = height || (narrow ? 300 : 340);
  const nodeW = 12;
  const leftLabelW = narrow ? 78 : 118;
  const rightLabelW = narrow ? 128 : 196;
  const x0 = leftLabelW, x1 = W - rightLabelW - nodeW;
  const total = Math.max(1, E.sum(sources, s => s.value));
  const tTotal = Math.max(1, E.sum(targets, t => t.value));
  const gap = 10;
  const usableL = H - gap * Math.max(0, sources.length - 1);
  const usableR = H - gap * Math.max(0, targets.length - 1);
  const scale = Math.min(usableL / total, usableR / tTotal);
  let y = (H - (total * scale + gap * (sources.length - 1))) / 2;
  const sPos = {}; sources.forEach(s => { const h = Math.max(2, s.value * scale); sPos[s.id] = { y, h, off: 0 }; y += h + gap; });
  y = (H - (tTotal * scale + gap * (targets.length - 1))) / 2;
  const tPos = {}; targets.forEach(t => { const h = Math.max(2, t.value * scale); tPos[t.id] = { y, h, off: 0 }; y += h + gap; });
  const bands = links.filter(l => l.value > 0.004 && sPos[l.from] && tPos[l.to]).map(l => {
    const s = sPos[l.from], t = tPos[l.to];
    const h = l.value * scale;
    const ys0 = s.y + s.off, ys1 = ys0 + h; s.off += h;
    const yt0 = t.y + t.off, yt1 = yt0 + h; t.off += h;
    const xa = x0 + nodeW, xb = x1, xm = (xa + xb) / 2;
    const d = `M${xa},${ys0} C${xm},${ys0} ${xm},${yt0} ${xb},${yt0} L${xb},${yt1} C${xm},${yt1} ${xm},${ys1} ${xa},${ys1} Z`;
    return Object.assign({ d }, l);
  });
  const tColor = id => (targets.find(t => t.id === id) || {}).color || 'var(--quiet-mark)';
  const spread = (items, pos, minGap) => {
    const ys = items.map(it => pos[it.id].y + pos[it.id].h / 2);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
    const over = ys.length ? ys[ys.length - 1] - (H - 12) : 0;
    if (over > 0) { ys[ys.length - 1] -= over; for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - minGap); }
    if (ys.length && ys[0] < 14) { const d = 14 - ys[0]; for (let i = 0; i < ys.length; i++) ys[i] += d; }
    const out = {}; items.forEach((it, i) => out[it.id] = ys[i]); return out;
  };
  const tLab = spread(targets, tPos, 32);
  const sLab = spread(sources, sPos, 34);
  return html`<div class="chart" ref=${ref}>
    <svg width=${W} height=${H} role="img" aria-label="Where this month's pay goes">
      ${bands.map((b, i) => html`<path class="sankey-band" d=${b.d} fill=${tColor(b.to)}
        opacity=${hover == null ? 0.34 : (hover === i ? 0.62 : 0.12)}
        onPointerMove=${e => { setHover(i); Tip.show(e, (sources.find(s => s.id === b.from) || {}).label + ' → ' + (targets.find(t => t.id === b.to) || {}).label, [{ value: money(b.value), color: tColor(b.to) }]); }}
        onPointerLeave=${() => { setHover(null); Tip.hide(); }} />`)}
      ${sources.map(s => html`<g>
        <rect x=${x0} y=${sPos[s.id].y} width=${nodeW} height=${sPos[s.id].h} rx="3" fill="var(--ink-2)" />
        <text x=${x0 - 8} y=${sLab[s.id] - 3} text-anchor="end" class="lbl-strong">${s.label}</text>
        <text x=${x0 - 8} y=${sLab[s.id] + 12} text-anchor="end" class="lbl-2">${money(s.value, { whole: true })}</text>
      </g>`)}
      ${targets.map(t => html`<g>
        <rect x=${x1} y=${tPos[t.id].y} width=${nodeW} height=${tPos[t.id].h} rx="3" fill=${t.color} />
        ${Math.abs(tLab[t.id] - (tPos[t.id].y + tPos[t.id].h / 2)) > 3 && html`<path d=${`M${x1 + nodeW + 1},${tPos[t.id].y + tPos[t.id].h / 2} L${x1 + nodeW + 5},${tLab[t.id] - 4}`} stroke="var(--axis)" fill="none" />`}
        <text x=${x1 + nodeW + 8} y=${tLab[t.id] - 2} class="lbl-strong">${narrow ? t.short || t.label : t.label}</text>
        <text x=${x1 + nodeW + 8} y=${tLab[t.id] + 13} class="lbl-2">${money(t.value, { whole: true })}</text>
      </g>`)}
    </svg>
  </div>`;
}

/* ---------- day-to-day pace: cumulative spend vs an even budget pace ---------- */
function PaceChart({ monthKey, cumulative, budget, todayDay }) {
  const ref = useRef(null);
  const W = useWidth(ref, 520);
  const H = 210, padL = 46, padR = 14, padT = 12, padB = 26;
  const dim = cumulative.length;
  const showTo = todayDay ? Math.min(todayDay, dim) : dim;
  const actual = cumulative.slice(0, showTo);
  const last = actual.length ? actual[actual.length - 1] : 0;
  const projected = todayDay && todayDay < dim && todayDay > 0 ? last / todayDay * dim : null;
  const maxV = Math.max(budget, last, projected || 0, 10);
  const tk = ticks(maxV);
  const top = tk[tk.length - 1];
  const x = d => padL + (d - 1) / Math.max(1, dim - 1) * (W - padL - padR);
  const y = v => padT + (1 - v / top) * (H - padT - padB);
  const path = actual.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1)},${y(v)}`).join(' ');
  const area = actual.length ? `${path} L${x(actual.length)},${y(0)} L${x(1)},${y(0)} Z` : '';
  const [hd, setHd] = useState(null);
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const d = Math.max(1, Math.min(dim, Math.round((px - padL) / (W - padL - padR) * (dim - 1)) + 1));
    setHd(d);
    const rows = [{ value: money(budget * d / dim), label: 'even pace', color: 'var(--quiet-mark)' }];
    if (d <= actual.length) rows.unshift({ value: money(actual[d - 1]), label: 'spent so far', color: 'var(--s1)' });
    Tip.show(e, dayLabel(monthKey + '-' + E.pad(d)), rows);
  };
  return html`<div class="chart" ref=${ref}>
    <svg width=${W} height=${H} role="img" aria-label="Day-to-day spending against an even pace">
      ${tk.map(v => html`<line class="gridline" x1=${padL} x2=${W - padR} y1=${y(v)} y2=${y(v)} />`)}
      ${tk.map(v => html`<text x=${padL - 8} y=${y(v) + 4} text-anchor="end" class="num">${shortMoney(v)}</text>`)}
      ${[1, 8, 15, 22, dim].map(d => html`<text x=${x(d)} y=${H - 6} text-anchor="middle">${d}</text>`)}
      <line x1=${x(1)} y1=${y(0)} x2=${x(dim)} y2=${y(budget)} stroke="var(--quiet-mark)" stroke-width="1.5" />
      ${area && html`<path d=${area} fill="var(--s1)" opacity="0.1" />`}
      ${path && html`<path d=${path} fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`}
      ${projected != null && html`<line x1=${x(actual.length)} y1=${y(last)} x2=${x(dim)} y2=${y(projected)} stroke="var(--s1)" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7" />`}
      ${actual.length > 0 && html`<circle cx=${x(actual.length)} cy=${y(last)} r="4.5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" />`}
      ${hd && html`<line x1=${x(hd)} x2=${x(hd)} y1=${padT} y2=${H - padB} stroke="var(--ink-2)" stroke-width="1" opacity="0.5" />`}
      <rect x=${padL} y=${padT} width=${Math.max(0, W - padL - padR)} height=${H - padT - padB} fill="transparent" onPointerMove=${onMove} onPointerLeave=${() => { setHd(null); Tip.hide(); }} />
    </svg>
    <div class="legend"><span><i class="k-line" style=${{ background: 'var(--s1)' }}></i>Spent so far</span><span><i class="k-line" style=${{ background: 'var(--quiet-mark)' }}></i>Even pace to budget (${money(budget, { whole: true })})</span>${projected != null && html`<span class="muted">Dashed: where this pace ends the month (${money(projected, { whole: true })})</span>`}</div>
  </div>`;
}

/* ---------- progress ring ---------- */
function Ring({ value, max, size = 58, label, color }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return html`<svg class="ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${label || pct(f)}>
    <circle class="track-c" cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke-width="7" />
    <circle class="val-c" cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke-width="7" stroke-linecap="round" style=${color ? { stroke: color } : null}
      stroke-dasharray=${c} stroke-dashoffset=${c * (1 - f)} transform=${`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x=${size / 2} y=${size / 2 + 4.5} text-anchor="middle">${max > 0 ? Math.round(f * 100) + '%' : '·'}</text>
  </svg>`;
}

/* ---------- budget bars (HTML, nominal groups → one hue) ---------- */
function BudgetBars({ rows, onPick }) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.budget, r.spent)));
  return html`<div class="bars">${rows.map(r => {
    const over = r.spent > r.budget + 0.005;
    const wSpent = Math.min(r.spent, r.budget) / max * 100;
    const wOver = over ? (r.spent - r.budget) / max * 100 : 0;
    return html`<div class="bar-row" style=${onPick ? { cursor: 'pointer' } : null} onClick=${onPick ? () => onPick(r) : null}
      onPointerMove=${e => Tip.show(e, r.name, [{ value: money(r.spent), label: 'spent', color: 'var(--s1)' }, { value: money(r.budget), label: 'budget', color: 'var(--ink-2)' }])} onPointerLeave=${() => Tip.hide()}>
      <div class="name">${r.name}${r.sub && html`<small>${r.sub}</small>`}</div>
      <div class="track" aria-hidden="true">
        <div class="fill" style=${{ width: wSpent + '%', borderRadius: over ? '0' : '0 4px 4px 0' }}></div>
        ${over && html`<div class="fill over" style=${{ left: wSpent + '%', width: wOver + '%' }}></div>`}
        ${r.budget > 0 && html`<div class="tick" style=${{ left: `calc(${r.budget / max * 100}% - 1px)` }}></div>`}
      </div>
      <div class="figs">${over ? html`<span class="chip crit"><${Icon} name="alert" size=${12} /> ${money(r.spent - r.budget)} over</span>` : html`<b>${money(r.spent, { auto: true })}</b> <span class="muted">of ${money(r.budget, { auto: true })}</span>`}</div>
    </div>`;
  })}</div>`;
}

/* ---------- goal timeline: when each pot is full ---------- */
function GoalTimeline({ proj, potsList, fromKey }) {
  const ref = useRef(null);
  const W = useWidth(ref, 720);
  // On a phone each goal gets two lines: its name, then its bar across the full width.
  const narrow = W < 560;
  const n = proj.keys.length;
  const rowH = narrow ? 46 : 30, padT = 26, padB = narrow ? 24 : 8;
  const H = padT + potsList.length * rowH + padB;
  const plotL = narrow ? 8 : 210, plotR = narrow ? 18 : 50;
  const x = i => plotL + i / Math.max(1, n - 1) * (W - plotL - plotR);
  const allYears = proj.keys.map((k, i) => ({ k, i })).filter(o => o.k.endsWith('-01'));
  const gapPx = allYears.length > 1 ? x(allYears[1].i) - x(allYears[0].i) : 999;
  const every = gapPx < 22 ? 3 : gapPx < 38 ? 2 : 1;
  const years = allYears.filter((o, j) => j % every === 0);
  const pStart = proj.pauseStart ? proj.keys.indexOf(proj.pauseStart) : -1;
  return html`<div class="chart" ref=${ref}>
    <svg width=${W} height=${H} role="img" aria-label="When each savings goal is reached">
      ${pStart >= 0 && html`<g><rect x=${x(pStart)} y=${padT - 6} width=${x(Math.min(n - 1, pStart + proj.pauseLen)) - x(pStart)} height=${H - padT - (narrow ? padB - 6 : 0)} fill="var(--warn-soft)" />
        <text x=${x(pStart) + 4} y=${narrow ? H - 6 : padT + 6} class="tiny" style=${{ fill: 'var(--warn-ink)', fontWeight: 700 }}>Maternity leave</text></g>`}
      ${years.map(o => html`<g><line class="gridline" x1=${x(o.i)} x2=${x(o.i)} y1=${padT - 6} y2=${H - (narrow ? padB : 0)} /><text x=${x(o.i)} y=${12} text-anchor="middle">${o.k.slice(0, 4)}</text></g>`)}
      ${potsList.map((p, r) => {
        const top = padT + r * rowH;
        const yy = narrow ? top + 31 : top + rowH / 2;
        const done = proj.doneAt[p.id];
        const di = done === 'done' ? 0 : done ? proj.keys.indexOf(done) : -1;
        const flip = di >= 0 && x(di) > W - 80;
        return html`<g onPointerMove=${e => Tip.show(e, p.name, [{ value: done === 'done' ? 'Reached' : done ? monthLabel(done) : 'After ' + monthLabel(proj.keys[n - 1]), label: done ? '' : 'at the current plan' }])} onPointerLeave=${() => Tip.hide()}>
          ${narrow ? html`<text x=${plotL - 4} y=${top + 14} class="lbl-strong" style=${{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: '4px' }}>${p.name}</text>`
            : html`<text x=${plotL - 10} y=${yy + 4} text-anchor="end" class="lbl-2">${p.name}</text>`}
          <line x1=${x(0)} x2=${di >= 0 ? x(di) : x(n - 1)} y1=${yy} y2=${yy} stroke=${di >= 0 ? 'var(--s1)' : 'var(--quiet-mark)'} stroke-width="6" stroke-linecap="round" opacity=${di >= 0 ? 0.85 : 0.6} />
          ${di >= 0 && html`<path d=${`M${x(di)},${yy - 7} l7,7 l-7,7 l-7,-7z`} fill="var(--s1)" stroke="var(--surface)" stroke-width="2" />`}
          ${di >= 0 && html`<text x=${flip ? x(di) - 12 : x(di) + 12} y=${yy + 4} text-anchor=${flip ? 'end' : 'start'} class="lbl-2">${done === 'done' ? 'reached' : monthLabel(done, true)}</text>`}
          ${di < 0 && narrow && html`<text x=${x(n - 1)} y=${top + 14} text-anchor="end" class="lbl-2">beyond ${proj.keys[n - 1].slice(0, 4)}</text>`}
          <rect x=0 y=${top} width=${W} height=${rowH} fill="transparent" />
        </g>`;
      })}
    </svg>
  </div>`;
}

/* ---------- one series over time (area + line) ---------- */
function AreaChart({ keys, values, label, markIndex, height = 200 }) {
  const ref = useRef(null);
  const W = useWidth(ref, 640);
  const H = height, padL = 52, padR = 16, padT = 14, padB = 26;
  const maxV = Math.max(10, ...values);
  const tk = ticks(maxV);
  const top = tk[tk.length - 1];
  const x = i => padL + i / Math.max(1, values.length - 1) * (W - padL - padR);
  const y = v => padT + (1 - Math.max(0, v) / top) * (H - padT - padB);
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const [hi, setHi] = useState(null);
  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(values.length - 1, Math.round((e.clientX - r.left - padL) / (W - padL - padR) * (values.length - 1))));
    setHi(i);
    Tip.show(e, monthLabel(keys[i]), [{ value: money(values[i], { whole: true }), label, color: 'var(--s1)' }]);
  };
  const lastI = values.length - 1;
  return html`<div class="chart" ref=${ref}>
    <svg width=${W} height=${H} role="img" aria-label=${label + ' over time'}>
      ${tk.map(v => html`<line class="gridline" x1=${padL} x2=${W - padR} y1=${y(v)} y2=${y(v)} />`)}
      ${tk.map(v => html`<text x=${padL - 8} y=${y(v) + 4} text-anchor="end">${shortMoney(v)}</text>`)}
      ${keys.map((k, i) => k.endsWith('-01') ? html`<text x=${x(i)} y=${H - 6} text-anchor="middle">${k.slice(0, 4)}</text>` : null)}
      <path d=${`${path} L${x(lastI)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--s1)" opacity="0.1" />
      <path d=${path} fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" />
      <circle cx=${x(lastI)} cy=${y(values[lastI])} r="4.5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" />
      <text x=${x(lastI) - 6} y=${y(values[lastI]) - 10} text-anchor="end" class="lbl-strong">${money(values[lastI], { whole: true })}</text>
      ${markIndex != null && markIndex >= 0 && html`<line x1=${x(markIndex)} x2=${x(markIndex)} y1=${padT} y2=${H - padB} stroke="var(--ink-2)" opacity="0.4" />`}
      ${hi != null && html`<circle cx=${x(hi)} cy=${y(values[hi])} r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" />`}
      <rect x=${padL} y=${padT} width=${Math.max(0, W - padL - padR)} height=${H - padT - padB} fill="transparent" onPointerMove=${onMove} onPointerLeave=${() => { setHi(null); Tip.hide(); }} />
    </svg>
  </div>`;
}

/* ---------- under / over budget by area (diverging) ---------- */
function DivergingBars({ rows }) {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return html`<div class="bars">${rows.map(r => {
    const w = Math.abs(r.value) / max * 50;
    const under = r.value >= 0;
    return html`<div class="bar-row" onPointerMove=${e => Tip.show(e, r.name, [{ value: money(Math.abs(r.value)), label: under ? 'under budget' : 'over budget', color: under ? 'var(--s1)' : 'var(--s8)' }])} onPointerLeave=${() => Tip.hide()}>
      <div class="name">${r.name}</div>
      <div class="track" style=${{ background: 'none' }} aria-hidden="true">
        <div style=${{ position: 'absolute', left: '50%', top: '-3px', bottom: '-3px', width: '1px', background: 'var(--axis)' }}></div>
        <div style=${{ position: 'absolute', top: 0, bottom: 0, left: under ? '50%' : `calc(50% - ${w}%)`, width: w + '%', background: under ? 'var(--s1)' : 'var(--s8)', borderRadius: under ? '0 4px 4px 0' : '4px 0 0 4px' }}></div>
      </div>
      <div class="figs">${under ? html`<span>${money(r.value)} <span class="muted">under</span></span>` : html`<span class="chip crit"><${Icon} name="alert" size=${12} />${money(-r.value)} over</span>`}</div>
    </div>`;
  })}</div>`;
}

/* ---------- months side by side: spent vs saved ---------- */
function TrendBars({ rows }) {
  const ref = useRef(null);
  const W = useWidth(ref, 640);
  const H = 210, padL = 48, padR = 10, padT = 12, padB = 26;
  const maxV = Math.max(10, ...rows.map(r => Math.max(r.spent, r.saved)));
  const tk = ticks(maxV); const top = tk[tk.length - 1];
  const band = (W - padL - padR) / Math.max(1, rows.length);
  const bw = Math.min(22, band / 3);
  const y = v => padT + (1 - v / top) * (H - padT - padB);
  return html`<div class="chart" ref=${ref}>
    <svg width=${W} height=${H} role="img" aria-label="Spent and saved by month">
      ${tk.map(v => html`<line class="gridline" x1=${padL} x2=${W - padR} y1=${y(v)} y2=${y(v)} />`)}
      ${tk.map(v => html`<text x=${padL - 8} y=${y(v) + 4} text-anchor="end">${shortMoney(v)}</text>`)}
      ${rows.map((r, i) => {
        const cx = padL + band * i + band / 2;
        const bar = (v, dx, color, lab) => { const h = Math.max(0, y(0) - y(v)); return html`<path d=${`M${cx + dx},${y(0)} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(0, h - 4)} z`} fill=${color}
          onPointerMove=${e => Tip.show(e, monthLabel(r.key), [{ value: money(v), label: lab, color }])} onPointerLeave=${() => Tip.hide()} />`; };
        return html`<g>${bar(r.spent, -bw - 1, 'var(--s1)', 'spent')}${bar(r.saved, 1, 'var(--s3)', 'saved')}<text x=${cx} y=${H - 6} text-anchor="middle">${monthLabel(r.key, true).slice(0, 3)}</text></g>`;
      })}
    </svg>
    <div class="legend"><span><i class="k-box" style=${{ background: 'var(--s1)' }}></i>Spent</span><span><i class="k-box" style=${{ background: 'var(--s3)' }}></i>Saved into pots</span></div>
  </div>`;
}
