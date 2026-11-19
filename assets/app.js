/* Bihar on NFMS – dashboard script. Reads data/latest.json, data/history.csv, data/cities.json */
(function () {
  const COL = { 'BR|ALL': 'var(--br)', 'BR|SBPDCL': 'var(--sb)', 'BR|NBPDCL': 'var(--nb)' };
  const NAME = { 'BR|ALL': 'Bihar', 'BR|SBPDCL': 'SBPDCL', 'BR|NBPDCL': 'NBPDCL', 'ALL|ALL': 'India' };
  const METRICS = [
    { id: 'hos_excl_agri', label: 'Hours of supply · excl. agriculture', short: 'Hrs excl. agri', unit: 'hrs', hrs: true },
    { id: 'hos_incl_agri', label: 'Hours of supply · all feeders', short: 'Hrs all feeders', unit: 'hrs', hrs: true },
    { id: 'rural', label: 'Hours of supply · rural feeders', short: 'Rural hrs', unit: 'hrs', hrs: true },
    { id: 'urban', label: 'Hours of supply · urban feeders', short: 'Urban hrs', unit: 'hrs', hrs: true },
    { id: 'agri', label: 'Hours of supply · agriculture feeders', short: 'Agri hrs', unit: 'hrs', hrs: true },
    { id: 'industrial', label: 'Hours of supply · industrial feeders', short: 'Industrial hrs', unit: 'hrs', hrs: true },
    { id: 'mixed', label: 'Hours of supply · mixed feeders', short: 'Mixed hrs', unit: 'hrs', hrs: true },
    { id: 'saidi', label: 'SAIDI · hours per consumer, latest day', short: 'SAIDI', unit: 'hrs', lower: true },
    { id: 'saifi', label: 'SAIFI · interruptions per consumer, latest day', short: 'SAIFI', unit: '', lower: true },
    { id: 'comm_pct', label: 'Feeders communicating (%)', short: 'Comm. %', unit: '%', pct: true },
    { id: 'smart_pct', label: 'Feeders on smart meters (%)', short: 'Smart %', unit: '%', pct: true },
  ];
  const M = Object.fromEntries(METRICS.map((m) => [m.id, m]));
  const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v);
  const f2 = d3.format('.2f'), f1 = d3.format('.1f'), fi = d3.format(',');
  const fmt = (m, v) => (v === null ? '—' : m.pct ? f1(v) + '%' : m.id === 'saidi' || m.id === 'saifi' ? d3.format('.2~f')(v) : f2(v));
  const hhmm = (h) => { if (h === null) return '—'; const H = Math.floor(h), mm = Math.round((h - H) * 60); return `${H}:${String(mm).padStart(2, '0')}`; };
  const day = (s) => (s ? d3.utcFormat('%d %b %Y')(new Date(s + 'T00:00:00Z')) : '—');
  const el = (tag, attrs = {}, text) => { const e = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => (k === 'class' ? (e.className = v) : e.setAttribute(k, v))); if (text !== undefined) e.textContent = text; return e; };

  /* ---------- tooltip ---------- */
  const tip = document.getElementById('tip');
  function showTip(ev, lines) {
    tip.replaceChildren(...lines.map(([cls, t]) => el('div', { class: cls }, t)));
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.chart')) hideTip(); });

  /* ---------- ranking ---------- */
  function rankOf(rows, m, key) {
    const ok = rows.filter((r) => num(r[m.id]) !== null);
    const t = ok.find((r) => r.key === key);
    if (!t) return { rank: null, n: ok.length };
    const tv = num(t[m.id]);
    return { rank: ok.filter((r) => (m.lower ? num(r[m.id]) < tv : num(r[m.id]) > tv)).length + 1, n: ok.length };
  }
  const median = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); if (!s.length) return null; const h = s.length / 2; return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2; };
  const band = (r) => (!r.rank ? '' : r.rank <= Math.ceil(r.n / 3) ? 'top' : r.rank <= Math.ceil((2 * r.n) / 3) ? 'mid' : 'low');

  /* ---------- ranked dot chart ---------- */
  function dots(box, items, o) {
    box.replaceChildren();
    if (!items.length) { box.append(el('div', { class: 'empty' }, 'No values reported for this measure.')); return; }
    const W = Math.max(260, box.clientWidth), narrow = W < 520;
    const rowH = Math.max(o.rowH || 16, narrow ? 20 : 0);
    const maxLab = narrow ? 16 : 30;
    const lab = (d) => (d.label.length > maxLab ? d.label.slice(0, maxLab - 1) + '…' : d.label);
    const real = items.filter((d) => !d.gap);
    const svg = d3.select(box).append('svg').attr('width', W).attr('role', 'img').attr('aria-label', o.aria);
    const probe = svg.append('text');
    const labW = d3.max(real, (d) => { probe.text(lab(d)); return probe.node().getComputedTextLength(); });
    probe.remove();
    const m = { t: 24, r: narrow ? 40 : 46, b: 6, l: Math.min(labW + 30, W * (narrow ? 0.5 : 0.46)) };
    const H = m.t + items.length * rowH + m.b;
    svg.attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    const vals = real.map((d) => d.v).concat(o.ref !== null && o.ref !== undefined ? [o.ref] : []);
    const lo = o.zero ? 0 : Math.floor(d3.min(vals) - 0.25);
    const hi = o.max !== undefined ? Math.max(o.max, d3.max(vals)) : d3.max(vals) || 1;
    const x = d3.scaleLinear().domain([lo, hi]).range([m.l, W - m.r]).nice();
    const idx = new Map(items.map((d, i) => [d, i]));
    const y = (d) => m.t + idx.get(d) * rowH + rowH / 2;
    const ticks = x.ticks(Math.max(2, Math.floor((W - m.l - m.r) / 64)));
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', m.t - 4).attr('y2', H - m.b).attr('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', m.t - 10).attr('text-anchor', 'middle').text((t) => o.fmt(t));
    if (o.ref !== null && o.ref !== undefined) {
      svg.append('line').attr('x1', x(o.ref)).attr('x2', x(o.ref)).attr('y1', m.t - 4).attr('y2', H - m.b).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 3');
      svg.append('text').attr('x', x(o.ref) - 4).attr('y', H - m.b - 2).attr('text-anchor', 'end').attr('fill', 'var(--ref)').text('India ' + o.fmt(o.ref));
    }
    svg.append('g').selectAll('text').data(items.filter((d) => d.gap)).join('text').attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => `⋯ ${d.n} more`);
    const g = svg.append('g').selectAll('g').data(real).join('g');
    g.filter((d) => d.color).append('rect').attr('x', 0).attr('width', W).attr('y', (d) => y(d) - rowH / 2).attr('height', rowH).attr('fill', '#f1f5f9');
    g.append('text').attr('x', 0).attr('y', (d) => y(d) + 4).attr('class', (d) => (d.color ? 'hl' : null)).text((d) => d.rank);
    g.append('text').attr('x', m.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('class', (d) => (d.color ? 'hl' : null)).text(lab);
    g.append('line').attr('x1', x(lo)).attr('x2', (d) => x(d.v)).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', (d) => d.color || 'var(--line)').attr('stroke-width', (d) => (d.color ? 2 : 1));
    g.append('circle').attr('cx', (d) => x(d.v)).attr('cy', (d) => y(d)).attr('r', (d) => (d.color ? 5.5 : 3.5)).attr('fill', (d) => d.color || 'var(--muted-dot)').attr('stroke', '#fff').attr('stroke-width', 1.5);
    g.filter((d) => d.color).append('text').attr('class', 'hl').attr('x', (d) => Math.min(x(d.v) + 9, W - 34)).attr('y', (d) => y(d) - (x(d.v) + 9 > W - 34 ? 7 : -4)).text((d) => o.fmt(d.v));
    g.append('rect').attr('x', 0).attr('width', W).attr('y', (d) => y(d) - rowH / 2).attr('height', rowH).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, d) => showTip(ev, [['t', `#${d.rank} of ${o.total || real.length} · ${d.label}`], ['', `${o.name}: ${o.fmt(d.v)}`], ...(d.sub ? [['m', d.sub]] : [])]))
      .on('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hideTip(); });
  }

  // keep the top, the bottom and the rows around the highlighted ones; fold the rest
  function compact(items, top = 5, bottom = 3, around = 2) {
    const keep = new Set();
    items.forEach((d, i) => { if (i < top || i >= items.length - bottom) keep.add(i); if (d.color) for (let j = i - around; j <= i + around; j++) keep.add(j); });
    const out = []; let skipped = 0;
    items.forEach((d, i) => { if (keep.has(i)) { if (skipped) { out.push({ gap: true, n: skipped }); skipped = 0; } out.push(d); } else skipped++; });
    if (skipped) out.push({ gap: true, n: skipped });
    return out;
  }

  /* ---------- line chart ---------- */
  function lines(box, series, o) {
    box.replaceChildren();
    const all = series.flatMap((s) => s.pts);
    if (!all.length) { box.append(el('div', { class: 'empty' }, 'No history yet for this measure.')); return; }
    const W = Math.max(260, box.clientWidth), H = W < 520 ? 230 : 280, m = { t: 14, r: 64, b: 28, l: 40 };
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', o.aria);
    const dates = [...new Set(all.map((p) => p.d))].sort();
    const parse = (s) => new Date(s + 'T00:00:00Z');
    const x = dates.length > 1 ? d3.scaleUtc().domain(d3.extent(dates, parse)).range([m.l, W - m.r]) : d3.scaleUtc().domain([d3.utcDay.offset(parse(dates[0]), -1), d3.utcDay.offset(parse(dates[0]), 1)]).range([m.l, W - m.r]);
    const ext = d3.extent(all, (p) => p.v);
    const pad = (ext[1] - ext[0]) * 0.15 || (o.hrs ? 0.5 : Math.abs(ext[1]) * 0.2 || 1);
    const y = d3.scaleLinear().domain([o.zero ? 0 : ext[0] - pad, ext[1] + pad]).range([H - m.b, m.t]).nice();
    svg.append('g').attr('class', 'axis').selectAll('line').data(y.ticks(5)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(y.ticks(5)).join('text').attr('x', m.l - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text((t) => o.fmt(t));
    const xt = dates.length > 1 ? x.ticks(Math.min(dates.length, Math.floor((W - m.l - m.r) / 80))) : [parse(dates[0])];
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').text(d3.utcFormat('%d %b'));
    const ln = d3.line().x((p) => x(parse(p.d))).y((p) => y(p.v));
    const ends = [];
    series.forEach((s) => {
      if (!s.pts.length) return;
      svg.append('path').attr('d', ln(s.pts)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2).attr('stroke-dasharray', s.dash ? '5 4' : null);
      svg.append('g').selectAll('circle').data(s.pts).join('circle').attr('cx', (p) => x(parse(p.d))).attr('cy', (p) => y(p.v)).attr('r', s.pts.length > 40 ? 0 : 3.5).attr('fill', s.color);
      const last = s.pts[s.pts.length - 1];
      ends.push({ y: y(last.v), x: x(parse(last.d)), t: s.name, c: s.color });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    ends.forEach((e) => svg.append('text').attr('x', e.x + 8).attr('y', e.y + 4).attr('class', 'hl').attr('fill', e.c).style('fill', e.c).text(e.t));
    const cross = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--ref)').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev) => {
        const [px] = d3.pointer(ev); const t = x.invert(px);
        const dd = dates.reduce((a, b) => (Math.abs(parse(b) - t) < Math.abs(parse(a) - t) ? b : a));
        cross.attr('x1', x(parse(dd))).attr('x2', x(parse(dd))).attr('opacity', 0.6);
        showTip(ev, [['t', day(dd)], ...series.map((s) => { const p = s.pts.find((q) => q.d === dd); return ['', `${s.name}: ${p ? o.fmt(p.v) : '—'}`]; })]);
      })
      .on('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { cross.attr('opacity', 0); hideTip(); } });
  }

  /* ---------- page ---------- */
  Promise.all([
    d3.json('data/latest.json?v=' + Date.now()),
    d3.csv('data/history.csv?v=' + Date.now()).catch(() => []),
    d3.json('data/cities.json?v=' + Date.now()).catch(() => ({ reports: [] })),
  ]).then(([latest, history, cities]) => render(latest, history, cities))
    .catch((e) => { document.getElementById('lede').textContent = 'Could not load the data files: ' + e.message; });

  function render(latest, history, cities) {
    const rows = latest.rows;
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    const BR = byKey['BR|ALL'], IN = byKey['ALL|ALL'], SB = byKey['BR|SBPDCL'], NB = byKey['BR|NBPDCL'];
    const states = rows.filter((r) => r.level === 'State');
    const discoms = rows.filter((r) => r.in_discom_rank === 'yes');

    // freshness
    const fetched = new Date(latest.fetched_at);
    const ageH = (Date.now() - fetched) / 3600e3;
    document.getElementById('fresh').textContent = 'Updated ' + d3.timeFormat('%d %b %Y, %H:%M')(fetched) + ' IST';
    document.getElementById('fresh-dot').className = 'dot ' + (ageH < 36 ? 'ok' : 'old');
    const dts = rows.map((r) => r.data_date).filter(Boolean).sort();
    const newest = dts[dts.length - 1];
    const recent = dts.filter((d) => (new Date(newest) - new Date(d)) / 864e5 <= 10);
    const stale = dts.length - recent.length;
    document.getElementById('data-days').textContent = dts.length ? `Utility data for ${day(recent[0])} – ${day(newest)}${stale ? ` (${stale} older)` : ''} · Bihar ${day(BR && BR.data_date)}` : '';

    // lede
    const r1 = rankOf(states, M.hos_excl_agri, 'BR|ALL');
    const lede = document.getElementById('lede');
    lede.replaceChildren();
    const b = (t) => el('b', {}, t);
    if (BR && IN) {
      lede.append('Bihar\'s feeders gave ', b(f2(num(BR.hos_excl_agri)) + ' hrs'), ' of supply a day outside agriculture, against ', b(f2(num(IN.hos_excl_agri)) + ' hrs'), ' for India — ',
        b(`${r1.rank} of ${r1.n}`), ' states. SBPDCL ', b(f2(num(SB?.hos_excl_agri)) + ' hrs'), ', NBPDCL ', b(f2(num(NB?.hos_excl_agri)) + ' hrs'), '. ',
        b(f1(num(BR.smart_pct)) + '%'), ' of Bihar\'s feeders report through smart meters, against ', b(f1(num(IN.smart_pct)) + '%'), ' nationally.');
    }

    // KPIs
    const kpis = document.getElementById('kpis'); kpis.replaceChildren();
    const pill = (r) => { const p = el('span', { class: 'pill ' + (band(r) === 'top' ? 'good' : band(r) === 'mid' ? 'mid' : 'bad') }, `#${r.rank}/${r.n}`); return r.rank ? p : ''; };
    const kpi = (k, v, unit, cParts) => { const d = el('div', { class: 'kpi' }); d.append(el('div', { class: 'k' }, k)); const vv = el('div', { class: 'v' }, v); if (unit) vv.append(el('small', {}, unit)); d.append(vv); const c = el('div', { class: 'c' }); c.append(...cParts); d.append(c); kpis.append(d); };
    const sMed = (id) => median(states.map((r) => num(r[id])));
    kpi('Hours of supply · excl. agri', f2(num(BR.hos_excl_agri)), 'hrs/day', ['India ', b(f2(num(IN.hos_excl_agri))), ' ', pill(rankOf(states, M.hos_excl_agri, 'BR|ALL'))]);
    kpi('Hours of supply · all feeders', f2(num(BR.hos_incl_agri)), 'hrs/day', ['India ', b(f2(num(IN.hos_incl_agri))), ' ', pill(rankOf(states, M.hos_incl_agri, 'BR|ALL'))]);
    kpi('Rural feeders', f2(num(BR.rural)), 'hrs/day', ['India ', b(f2(num(IN.rural))), ' ', pill(rankOf(states, M.rural, 'BR|ALL'))]);
    kpi('SAIDI · latest day', d3.format('.2~f')(num(BR.saidi)), 'hrs', ['Median state ', b(d3.format('.2~f')(sMed('saidi'))), ' ', pill(rankOf(states, M.saidi, 'BR|ALL'))]);
    kpi('SAIFI · latest day', d3.format('.2~f')(num(BR.saifi)), '', ['Median state ', b(d3.format('.2~f')(sMed('saifi'))), ' ', pill(rankOf(states, M.saifi, 'BR|ALL'))]);
    kpi('Feeders integrated', fi(num(BR.int_feeders)), 'of ' + fi(num(BR.total_feeders)), ['Comm. ', b(f1(num(BR.comm_pct)) + '%'), ' · smart ', b(f1(num(BR.smart_pct)) + '%')]);

    // comparison table (wide: utilities as rows; narrow: utilities as columns)
    const CMP_GROUPS = [
      ['Hours of supply (hrs/day)', [['urban', 'Urban'], ['rural', 'Rural'], ['agri', 'Agriculture'], ['industrial', 'Industrial'], ['mixed', 'Mixed'], ['hos_excl_agri', 'Excl. agri'], ['hos_incl_agri', 'All feeders']]],
      ['Reliability · latest day', [['saidi', 'SAIDI (hrs)'], ['saifi', 'SAIFI']]],
      ['Feeders', [['total_feeders', 'Feeders'], ['comm_pct', 'Comm. %'], ['smart_pct', 'Smart %']]],
    ];
    const UT = [['BR|SBPDCL', SB], ['BR|NBPDCL', NB], ['BR|ALL', BR], ['ALL|ALL', IN]].filter(([, r]) => r);
    const cell = (k, r, c) => {
      const v = num(r[c]); const mm = M[c];
      let txt = c === 'total_feeders' ? (v === null ? '—' : fi(v)) : mm ? fmt(mm, v) : '—';
      if (k === 'ALL|ALL' && (c === 'saidi' || c === 'saifi' || (c === 'comm_pct' && !v))) txt = '—';
      const td = el('td', {}, txt);
      if ((k === 'BR|SBPDCL' || k === 'BR|NBPDCL') && mm && SB && NB) {
        const a1 = num(SB[c]), o2 = num(NB[c]);
        if (a1 !== null && o2 !== null && a1 !== o2) { const best = mm.lower ? Math.min(a1, o2) : Math.max(a1, o2); if (v === best) td.className = 'best'; }
      }
      return td;
    };
    const swatch = (k) => { const sw = el('span', { class: 'sw' + (COL[k] ? '' : ' ref') }); if (COL[k]) sw.style.background = COL[k]; return sw; };
    const drawCmp = (narrow) => {
      const box = document.getElementById('cmp-box'); box.replaceChildren();
      const t = el('table', { class: 'tbl' + (narrow ? ' tbl-narrow' : '') });
      const th = el('thead'), tb = el('tbody');
      if (!narrow) {
        const g1 = el('tr', { class: 'grp' }); g1.append(el('th'));
        CMP_GROUPS.forEach(([gname, cs]) => g1.append(Object.assign(el('th', {}, gname), { colSpan: cs.length })));
        const g2 = el('tr'); g2.append(el('th', {}, 'Utility'), ...CMP_GROUPS.flatMap(([, cs]) => cs.map(([, l]) => el('th', {}, l))));
        th.append(g1, g2);
        UT.forEach(([k, r]) => {
          const tr = el('tr', { class: k === 'ALL|ALL' ? 'ref' : '' });
          const t0 = el('td'); t0.append(swatch(k), NAME[k]); tr.append(t0);
          CMP_GROUPS.forEach(([, cs]) => cs.forEach(([c]) => tr.append(cell(k, r, c))));
          tb.append(tr);
        });
      } else {
        const h = el('tr'); h.append(el('th'));
        UT.forEach(([k]) => { const c = el('th'); c.append(swatch(k), NAME[k]); h.append(c); });
        th.append(h);
        CMP_GROUPS.forEach(([gname, cs]) => {
          const gr = el('tr', { class: 'sec' }); gr.append(Object.assign(el('td', {}, gname), { colSpan: UT.length + 1 })); tb.append(gr);
          cs.forEach(([c, l]) => { const tr = el('tr'); tr.append(el('td', {}, l)); UT.forEach(([k, r]) => { const td = cell(k, r, c); if (k === 'ALL|ALL') td.classList.add('refc'); tr.append(td); }); tb.append(tr); });
        });
      }
      t.append(th, tb); box.append(t);
    };

    // rank table (wide: table; narrow: one compact card per measure)
    const chip = (r) => el('span', { class: 'rk ' + band(r) }, r.rank ? `${r.rank} / ${r.n}` : '—');
    const drawRankTbl = (narrow) => {
      const box = document.getElementById('rank-box'); box.replaceChildren();
      if (!narrow) {
        const t = el('table', { class: 'tbl' });
        const rh = el('thead'); const rr = el('tr'); rr.append(...['Measure', 'Bihar value', 'Bihar among states', 'SBPDCL value', 'SBPDCL among DISCOMs', 'NBPDCL value', 'NBPDCL among DISCOMs'].map((x2) => el('th', {}, x2))); rh.append(rr);
        const rb = el('tbody');
        METRICS.forEach((m) => {
          const tr = el('tr'); const td = (x2) => { const c = el('td'); c.append(x2); return c; };
          tr.append(el('td', {}, m.label), el('td', {}, fmt(m, num(BR[m.id]))), td(chip(rankOf(states, m, 'BR|ALL'))),
            el('td', {}, fmt(m, num(SB?.[m.id]))), td(chip(rankOf(discoms, m, 'BR|SBPDCL'))),
            el('td', {}, fmt(m, num(NB?.[m.id]))), td(chip(rankOf(discoms, m, 'BR|NBPDCL'))));
          rb.append(tr);
        });
        t.append(rh, rb); box.append(t);
      } else {
        const list = el('div', { class: 'rk-list' });
        METRICS.forEach((m) => {
          const card = el('div', { class: 'rk-card' }); card.dataset.m = m.id;
          card.append(el('div', { class: 'rk-t' }, m.label));
          const grid = el('div', { class: 'rk-g' });
          [['BR|ALL', BR, states, 'states'], ['BR|SBPDCL', SB, discoms, 'DISCOMs'], ['BR|NBPDCL', NB, discoms, 'DISCOMs']].forEach(([k, r, pool]) => {
            const c = el('div', { class: 'rk-c' });
            const n1 = el('div', { class: 'rk-n' }); n1.append(swatch(k), NAME[k]);
            c.append(n1, el('div', { class: 'rk-v' }, fmt(m, num(r?.[m.id]))), chip(rankOf(pool, m, k)));
            grid.append(c);
          });
          card.append(grid); list.append(card);
        });
        box.append(list);
        const cards = [...list.children];
        if (innerWidth < 640 && cards.length > 4) {
          let open = false;
          const btn = el('button', { type: 'button', class: 'more' });
          const KEY = ['hos_excl_agri', 'hos_incl_agri', 'saidi', 'saifi'];
          const set = () => { cards.forEach((c) => { c.hidden = !open && !KEY.includes(c.dataset.m); }); btn.textContent = open ? 'Show fewer measures' : `Show all ${cards.length} measures`; };
          btn.addEventListener('click', () => { open = !open; set(); });
          set(); box.append(btn);
        }
      }
    };

    // legend
    const lg = document.getElementById('legend'); lg.replaceChildren();
    [['Bihar', 'var(--br)'], ['SBPDCL', 'var(--sb)'], ['NBPDCL', 'var(--nb)'], ['Other states / DISCOMs', 'var(--muted-dot)']].forEach(([t, c]) => { const s = el('span'); const w = el('span', { class: 'sw' }); w.style.background = c; s.append(w, t); lg.append(s); });
    const ri = el('span'); ri.append(el('span', { class: 'sw ref' }), 'India'); lg.append(ri);

    // metric selectors
    const sel = document.getElementById('metric'), selT = document.getElementById('metric-trend');
    [sel, selT].forEach((s) => METRICS.forEach((m) => s.append(new Option(m.label, m.id))));
    const qs = new URLSearchParams(location.search);
    if (M[qs.get('m')]) sel.value = selT.value = qs.get('m');

    let showAll = false;
    document.getElementById('more-discoms').addEventListener('click', () => { showAll = !showAll; drawRank(); });
    const drawRank = () => {
      const m = M[sel.value];
      const mk = (list, which) => list.filter((r) => num(r[m.id]) !== null).map((r) => ({
        label: which === 'states' ? r.state : r.discom_label, v: num(r[m.id]), color: COL[r.key],
        sub: (which === 'states' ? '' : r.state + ' · ') + 'data for ' + day(r.data_date),
      })).sort((a, z) => (m.lower ? a.v - z.v : z.v - a.v));
      const ref = m.lower ? null : num(IN?.[m.id]);
      const o = { ref, fmt: (v) => fmt(m, v), name: m.short, zero: !m.hrs, max: m.hrs ? 24 : m.pct ? 100 : undefined };
      const rk = (arr) => { arr.forEach((d, i) => { d.rank = i + 1; }); return arr; };
      const st = rk(mk(states, 'states')), di = rk(mk(discoms, 'discoms'));
      dots(document.getElementById('chart-states'), st, { ...o, rowH: 18, total: st.length, aria: `States ranked by ${m.label}` });
      const small = innerWidth < 900;
      const btn = document.getElementById('more-discoms');
      btn.hidden = !small;
      btn.textContent = showAll ? 'Show fewer' : `Show all ${di.length} DISCOMs`;
      dots(document.getElementById('chart-discoms'), small && !showAll ? compact(di) : di, { ...o, rowH: 14, total: di.length, aria: `DISCOMs ranked by ${m.label}` });
    };

    // trend
    const hist = history.length ? history : rows.map((r) => ({ ...r, snapshot_date: latest.snapshot_date }));
    const drawTrend = () => {
      const m = M[selT.value];
      const keys = ['BR|ALL', 'BR|SBPDCL', 'BR|NBPDCL'].concat(m.lower ? [] : ['ALL|ALL']);
      const series = keys.map((k) => ({
        name: NAME[k], color: COL[k] || 'var(--ref)', dash: k === 'ALL|ALL',
        pts: hist.filter((r) => r.key === k && num(r[m.id]) !== null).map((r) => ({ d: r.snapshot_date, v: num(r[m.id]) })).sort((a, z) => (a.d < z.d ? -1 : 1)),
      }));
      const nd = new Set(hist.map((r) => r.snapshot_date)).size;
      document.getElementById('trend-hint').textContent = nd > 1 ? `${nd} daily snapshots. Point at the chart for each day's values.` : 'History starts today; a point is added each night when the data refreshes.';
      lines(document.getElementById('chart-trend'), series, { fmt: (v) => fmt(m, v), hrs: m.hrs, zero: m.pct, aria: `${m.label} over time for Bihar, SBPDCL, NBPDCL` });
    };

    // cities
    const selM = document.getElementById('month');
    const reps = (cities.reports || []).slice().sort((a, z) => (a.month < z.month ? 1 : -1));
    reps.forEach((r) => selM.append(new Option(r.label, r.month)));
    const drawCities = () => {
      const rep = reps.find((r) => r.month === selM.value);
      const box = document.getElementById('chart-cities'), kp = document.getElementById('city-kpi');
      kp.replaceChildren();
      if (!rep) { box.replaceChildren(el('div', { class: 'empty' }, 'No city report available yet.')); return; }
      document.getElementById('city-hint').textContent = `Cumulative SAIDI for ${rep.label}, NFMS major-cities report${rep.status_as_on ? ' (status as on ' + rep.status_as_on + ')' : ''}. Lower is better.`;
      const items = rep.rows.map((r) => ({ label: innerWidth < 640 ? r.city : `${r.city} (${r.discom})`, v: num(r.saidi_hours), color: /^patna/i.test(r.city) ? 'var(--sb)' : null, sub: `${r.discom}, ${r.state} · SAIDI ${r.saidi_hhmm} · SAIFI ${r.saifi}` })).sort((a, z) => a.v - z.v);
      items.forEach((d, i) => { d.rank = i + 1; });
      const p = rep.rows.find((r) => /^patna/i.test(r.city));
      const pi = items.findIndex((d) => /^patna/i.test(d.label));
      const k = (t, v) => { const d = el('div', {}, t); d.prepend(el('b', {}, v)); kp.append(d); };
      if (p) { k('Patna City SAIDI (hh:mm)', p.saidi_hhmm); k('SAIFI', String(p.saifi)); k('Position (lower SAIDI is better)', `${pi + 1} of ${items.length}`); }
      else kp.append(el('div', {}, 'Patna City is not in this month\'s report.'));
      dots(box, items, { ref: null, zero: true, rowH: 17, total: items.length, name: 'SAIDI', fmt: hhmm, aria: `Major cities ranked by SAIDI, ${rep.label}` });
    };

    sel.addEventListener('change', drawRank);
    selT.addEventListener('change', drawTrend);
    selM.addEventListener('change', drawCities);
    const all = () => { const nar = innerWidth < 1000; drawCmp(nar); drawRankTbl(nar); drawRank(); drawTrend(); drawCities(); };
    all();
    let w = innerWidth; addEventListener('resize', () => { if (Math.abs(innerWidth - w) > 30) { w = innerWidth; all(); } });
  }
})();
