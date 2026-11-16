// Lightweight, responsive chart helpers built on D3 v7 (vendored in js/lib so
// charts work offline and on GitHub Pages without a CDN).
const d3 = globalThis.d3;

export const PALETTE = ['#3d8bff', '#e8324d', '#f1b434', '#2fc17a', '#b07cff', '#29c7d8', '#ff8a3d', '#d9e2f2'];
export const PITCH_COLORS = {
  Fastball: '#e8324d', Sinker: '#ff8a3d', Cutter: '#b07cff', Slider: '#f1b434', Sweeper: '#29c7d8',
  Curveball: '#3d8bff', ChangeUp: '#2fc17a', Splitter: '#7ee0c3', Knuckleball: '#d9e2f2', Undefined: '#6b7894', Other: '#6b7894',
};
export const pitchColor = (t, i = 0) => PITCH_COLORS[t] || PALETTE[i % PALETTE.length];

let tip;
function tooltip() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; document.body.append(tip); }
  return {
    show(html, ev) { tip.innerHTML = html; tip.style.opacity = '1'; this.move(ev); },
    move(ev) {
      const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    },
    hide() { tip.style.opacity = '0'; },
  };
}
const tt = () => tooltip();
const row = (k, v) => `<div class="t-row"><span>${k}</span><b>${v}</b></div>`;

function frame(el, draw) {
  // re-draw on resize; returns nothing
  if (el._ro) el._ro.disconnect();
  let lastW = 0;
  const run = () => {
    const w = el.clientWidth;
    if (!w || Math.abs(w - lastW) < 2) return;
    lastW = w;
    el.innerHTML = '';
    draw(w, el.clientHeight || 300);
  };
  if (typeof ResizeObserver !== 'undefined') { el._ro = new ResizeObserver(run); el._ro.observe(el); }
  run();
  if (!lastW) requestAnimationFrame(run);
}

export function empty(el, msg) {
  if (el._ro) el._ro.disconnect();
  el.innerHTML = `<div class="empty">${msg}</div>`;
}

function svgIn(el, w, h) {
  return d3.select(el).append('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
}

function clearLegend(el) { if (el._legend) { el._legend.remove(); el._legend = null; } }

function legend(el, items) {
  // keep chart + legend together in one wrapper so grid layouts are not disturbed
  let box = el.parentElement;
  if (!box || !box.classList.contains('chart-box')) {
    box = document.createElement('div');
    box.className = 'chart-box';
    el.parentNode.insertBefore(box, el);
    box.append(el);
  }
  const lg = document.createElement('div');
  lg.className = 'legend';
  lg.innerHTML = items.map(i => `<span><i style="background:${i.color}"></i>${i.name}</span>`).join('');
  box.append(lg);
  el._legend = lg;
}

// ------------------------------------------------------------------ line
// series: [{name, color, values: [y|null per x index]}], labels: x labels
export function lineChart(el, { labels, series, yFormat = d => d, yLabel, yDomain, refLine, emptyMsg = 'No data for this selection.' }) {
  clearLegend(el);
  const all = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  if (!labels.length || !all.length) return empty(el, emptyMsg);
  if (series.length > 1) legend(el, series.map((s, i) => ({ name: s.name, color: s.color || PALETTE[i] })));
  frame(el, (W, H) => {
    const m = { t: 14, r: 16, b: 38, l: 50 };
    const svg = svgIn(el, W, H);
    const x = d3.scalePoint().domain(d3.range(labels.length)).range([m.l, W - m.r]).padding(0.4);
    let [lo, hi] = yDomain || d3.extent(all);
    if (!yDomain) { const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad; if (d3.min(all) >= 0 && lo < 0) lo = 0; }
    const y = d3.scaleLinear().domain([lo, hi]).nice().range([H - m.b, m.t]);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    const maxLen = Math.max(...labels.map(l => String(l).length));
    const step = Math.ceil(labels.length / Math.max(2, Math.floor((W - m.l - m.r) / (maxLen * 6.6 + 14))));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat(i => (i % step === 0 ? labels[i] : '')).tickSizeOuter(0));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(yFormat));
    if (yLabel) svg.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${m.t + (H - m.b - m.t) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(yLabel);
    if (refLine !== undefined && refLine !== null) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(refLine.value)).attr('y2', y(refLine.value)).attr('stroke', '#8293b0').attr('stroke-dasharray', '4 4');
    series.forEach((s, si) => {
      const c = s.color || PALETTE[si % PALETTE.length];
      const pts = s.values.map((v, i) => ({ i, v })).filter(p => p.v !== null && p.v !== undefined);
      const line = d3.line().x(p => x(p.i)).y(p => y(p.v)).curve(d3.curveMonotoneX);
      const area = d3.area().x(p => x(p.i)).y0(H - m.b).y1(p => y(p.v)).curve(d3.curveMonotoneX);
      if (series.length === 1) {
        const gid = 'g' + Math.random().toString(36).slice(2);
        const grad = svg.append('defs').append('linearGradient').attr('id', gid).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
        grad.append('stop').attr('offset', 0).attr('stop-color', c).attr('stop-opacity', 0.32);
        grad.append('stop').attr('offset', 1).attr('stop-color', c).attr('stop-opacity', 0);
        svg.append('path').datum(pts).attr('d', area).attr('fill', `url(#${gid})`);
      }
      const path = svg.append('path').datum(pts).attr('d', line).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2.4);
      const len = path.node().getTotalLength?.() || 0;
      if (len) path.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len).transition().duration(700).attr('stroke-dashoffset', 0);
      svg.append('g').selectAll('circle').data(pts).join('circle')
        .attr('cx', p => x(p.i)).attr('cy', p => y(p.v)).attr('r', 4).attr('fill', '#0a1428').attr('stroke', c).attr('stroke-width', 2)
        .on('mouseenter', (ev, p) => tt().show(`<b>${labels[p.i]}</b>${row(s.name || '', yFormat(p.v))}`, ev))
        .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide());
    });
  });
}

// ------------------------------------------------------------------ bars
// data: [{label, value, color, sub}] ; horizontal for player rankings
export function barChart(el, { data, horizontal = false, valueFormat = d => d, color = PALETTE[0], xLabel, yLabel, emptyMsg = 'No data for this selection.', refLine }) {
  clearLegend(el);
  const rows = data.filter(d => d.value !== null && d.value !== undefined && !Number.isNaN(d.value));
  if (!rows.length) return empty(el, emptyMsg);
  frame(el, (W, H) => {
    const svg = svgIn(el, W, H);
    const maxV = d3.max(rows, d => d.value), minV = Math.min(0, d3.min(rows, d => d.value));
    if (horizontal) {
      const longest = d3.max(rows, d => String(d.label).length);
      const m = { t: 6, r: 56, b: 24, l: Math.min(160, 14 + longest * 6.6) };
      const y = d3.scaleBand().domain(rows.map(d => d.label)).range([m.t, H - m.b]).padding(0.28);
      const x = d3.scaleLinear().domain([minV, maxV]).nice().range([m.l, W - m.r]);
      svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.b - m.t)).tickFormat(''));
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickSize(0)).select('.domain').remove();
      svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(valueFormat));
      const g = svg.append('g').selectAll('g').data(rows).join('g');
      g.append('rect').attr('x', x(0)).attr('y', d => y(d.label)).attr('height', y.bandwidth()).attr('rx', 4)
        .attr('fill', d => d.color || color).attr('width', 0)
        .on('mouseenter', (ev, d) => tt().show(`<b>${d.label}</b>${row(xLabel || 'Value', valueFormat(d.value))}${d.sub ? `<div class="t-row"><span>${d.sub}</span></div>` : ''}`, ev))
        .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide())
        .transition().duration(600).attr('width', d => Math.max(0, x(d.value) - x(0)));
      g.append('text').attr('x', d => x(d.value) + 6).attr('y', d => y(d.label) + y.bandwidth() / 2 + 4)
        .attr('fill', 'currentColor').style('font', '600 11px var(--font-mono)').style('fill', 'var(--text-2)').text(d => valueFormat(d.value));
      if (refLine) svg.append('line').attr('x1', x(refLine.value)).attr('x2', x(refLine.value)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#8293b0').attr('stroke-dasharray', '4 4');
    } else {
      const m = { t: 14, r: 12, b: 42, l: 50 };
      const x = d3.scaleBand().domain(rows.map(d => d.label)).range([m.l, W - m.r]).padding(0.3);
      const y = d3.scaleLinear().domain([minV, maxV]).nice().range([H - m.b, m.t]);
      svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
      const ax = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSizeOuter(0));
      if (x.bandwidth() < 44) ax.selectAll('text').attr('transform', 'rotate(-30)').attr('text-anchor', 'end').attr('dx', '-0.4em').attr('dy', '0.5em');
      svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(valueFormat));
      if (yLabel) svg.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${m.t + (H - m.b - m.t) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(yLabel);
      svg.append('g').selectAll('rect').data(rows).join('rect')
        .attr('x', d => x(d.label)).attr('width', x.bandwidth()).attr('rx', 4).attr('fill', d => d.color || color)
        .attr('y', y(0)).attr('height', 0)
        .on('mouseenter', (ev, d) => tt().show(`<b>${d.label}</b>${row(yLabel || 'Value', valueFormat(d.value))}${d.sub ? `<div class="t-row"><span>${d.sub}</span></div>` : ''}`, ev))
        .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide())
        .transition().duration(600).attr('y', d => y(Math.max(0, d.value))).attr('height', d => Math.abs(y(d.value) - y(0)));
      if (refLine) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(refLine.value)).attr('y2', y(refLine.value)).attr('stroke', '#8293b0').attr('stroke-dasharray', '4 4');
    }
  });
}

// grouped bars: categories on x, one bar per series
export function groupedBar(el, { categories, series, valueFormat = d => d, yLabel, emptyMsg = 'No data for this selection.' }) {
  clearLegend(el);
  const any = series.some(s => s.values.some(v => v !== null && v !== undefined));
  if (!categories.length || !any) return empty(el, emptyMsg);
  legend(el, series.map((s, i) => ({ name: s.name, color: s.color || PALETTE[i] })));
  frame(el, (W, H) => {
    const m = { t: 14, r: 12, b: 42, l: 50 };
    const svg = svgIn(el, W, H);
    const x0 = d3.scaleBand().domain(categories).range([m.l, W - m.r]).padding(0.22);
    const x1 = d3.scaleBand().domain(series.map(s => s.name)).range([0, x0.bandwidth()]).padding(0.08);
    const maxV = d3.max(series.flatMap(s => s.values).filter(v => v !== null)) || 1;
    const y = d3.scaleLinear().domain([0, maxV]).nice().range([H - m.b, m.t]);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    const ax = svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x0).tickSizeOuter(0));
    if (x0.bandwidth() < 60) ax.selectAll('text').attr('transform', 'rotate(-30)').attr('text-anchor', 'end').attr('dx', '-0.4em').attr('dy', '0.5em');
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(valueFormat));
    if (yLabel) svg.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${m.t + (H - m.b - m.t) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(yLabel);
    series.forEach((s, si) => {
      const c = s.color || PALETTE[si % PALETTE.length];
      svg.append('g').selectAll('rect').data(categories.map((cat, i) => ({ cat, v: s.values[i] })).filter(d => d.v !== null && d.v !== undefined)).join('rect')
        .attr('x', d => x0(d.cat) + x1(s.name)).attr('width', x1.bandwidth()).attr('rx', 3).attr('fill', c)
        .attr('y', y(0)).attr('height', 0)
        .on('mouseenter', (ev, d) => tt().show(`<b>${d.cat}</b>${row(s.name, valueFormat(d.v))}`, ev))
        .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide())
        .transition().duration(600).attr('y', d => y(d.v)).attr('height', d => y(0) - y(d.v));
    });
  });
}

// ------------------------------------------------------------------ scatter
// points: [{x, y, color, label, r, html}] ; zone: draw strike zone (plate coords)
export function scatter(el, { points, xLabel, yLabel, xFormat = d => d, yFormat = d => d, zone = false, movement = false, xDomain, yDomain, legendItems, refX, refY, labels = false, emptyMsg = 'No data for this selection.' }) {
  clearLegend(el);
  const pts = points.filter(p => p.x !== null && p.y !== null && p.x !== undefined && p.y !== undefined);
  if (!pts.length) return empty(el, emptyMsg);
  if (legendItems) legend(el, legendItems);
  frame(el, (W, H) => {
    const m = { t: 14, r: 18, b: 40, l: 52 };
    const svg = svgIn(el, W, H);
    let xd = xDomain || d3.extent(pts, p => p.x), yd = yDomain || d3.extent(pts, p => p.y);
    if (zone) {
      // keep plate geometry square-ish: catcher's view, feet
      const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
      const yr = [0, 5]; const xr = Math.min(3, (yr[1] - yr[0]) * plotW / plotH / 2);
      xd = [-Math.max(xr, 1.6), Math.max(xr, 1.6)]; yd = yr;
    } else if (!xDomain || !yDomain) {
      const px = (xd[1] - xd[0]) * 0.1 || 1, py = (yd[1] - yd[0]) * 0.1 || 1;
      if (!xDomain) xd = [xd[0] - px, xd[1] + px];
      if (!yDomain) yd = [yd[0] - py, yd[1] + py];
    }
    const x = d3.scaleLinear().domain(xd).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain(yd).range([H - m.b, m.t]);
    if (!zone) {
      x.nice(); y.nice();
      svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
      svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    }
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(xFormat));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(yFormat));
    if (xLabel) svg.append('text').attr('class', 'axis-label').attr('x', m.l + (W - m.l - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text(xLabel);
    if (yLabel) svg.append('text').attr('class', 'axis-label').attr('transform', `translate(12,${m.t + (H - m.b - m.t) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(yLabel);
    if (movement) {
      svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#8293b0').attr('stroke-opacity', .5);
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', '#8293b0').attr('stroke-opacity', .5);
    }
    if (refX !== undefined) svg.append('line').attr('x1', x(refX)).attr('x2', x(refX)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#8293b0').attr('stroke-dasharray', '4 4');
    if (refY !== undefined) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(refY)).attr('y2', y(refY)).attr('stroke', '#8293b0').attr('stroke-dasharray', '4 4');
    if (zone) {
      const zx = 0.83, zb = 1.5, zt = 3.5;
      svg.append('rect').attr('x', x(-zx)).attr('y', y(zt)).attr('width', x(zx) - x(-zx)).attr('height', y(zb) - y(zt)).attr('fill', 'rgba(130,147,176,0.06)').attr('stroke', '#8293b0').attr('stroke-width', 1.8);
      for (const f of [1 / 3, 2 / 3]) {
        svg.append('line').attr('x1', x(-zx + 2 * zx * f)).attr('x2', x(-zx + 2 * zx * f)).attr('y1', y(zt)).attr('y2', y(zb)).attr('stroke', 'rgba(150,175,220,.25)');
        svg.append('line').attr('x1', x(-zx)).attr('x2', x(zx)).attr('y1', y(zb + (zt - zb) * f)).attr('y2', y(zb + (zt - zb) * f)).attr('stroke', 'rgba(150,175,220,.25)');
      }
      const plate = [[-0.71, 0.35], [0.71, 0.35], [0.71, 0.22], [0, 0.08], [-0.71, 0.22]];
      svg.append('path').attr('d', d3.line()(plate.map(([a, b]) => [x(a), y(b)])) + 'Z').attr('fill', 'rgba(130,147,176,.18)').attr('stroke', '#8293b0');
    }
    const g = svg.append('g');
    g.selectAll('circle').data(pts).join('circle')
      .attr('cx', p => x(p.x)).attr('cy', p => y(p.y)).attr('r', 0)
      .attr('fill', p => p.color || PALETTE[0]).attr('fill-opacity', zone ? 0.72 : 0.85).attr('stroke', 'rgba(0,0,0,.35)')
      .on('mouseenter', (ev, p) => tt().show(p.html || `<b>${p.label || ''}</b>${row(xLabel || 'x', xFormat(p.x))}${row(yLabel || 'y', yFormat(p.y))}`, ev))
      .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide())
      .transition().duration(500).delay((_, i) => Math.min(i * 2, 300)).attr('r', p => p.r || (zone ? 4.2 : 6));
    if (labels) g.selectAll('text').data(pts).join('text').attr('x', p => x(p.x) + 8).attr('y', p => y(p.y) + 4)
      .style('font', '600 10.5px var(--font-body)').style('fill', 'var(--text-2)').text(p => p.label);
  });
}

// ------------------------------------------------------------------ histogram
export function histogram(el, { values, xLabel, color = PALETTE[0], binSize = 5, domain, refLine, emptyMsg = 'No tracked values for this selection.' }) {
  clearLegend(el);
  const vals = values.filter(v => v !== null && v !== undefined && Number.isFinite(v));
  if (!vals.length) return empty(el, emptyMsg);
  frame(el, (W, H) => {
    const m = { t: 14, r: 14, b: 40, l: 44 };
    const svg = svgIn(el, W, H);
    const lo = domain ? domain[0] : Math.floor(d3.min(vals) / binSize) * binSize;
    const hi = domain ? domain[1] : Math.ceil((d3.max(vals) + 0.0001) / binSize) * binSize;
    const x = d3.scaleLinear().domain([lo, hi]).range([m.l, W - m.r]);
    const bins = d3.bin().domain([lo, hi]).thresholds(d3.range(lo, hi + binSize, binSize))(vals);
    const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.length)]).nice().range([H - m.b, m.t]);
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.min(10, (hi - lo) / binSize)));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('d')));
    if (xLabel) svg.append('text').attr('class', 'axis-label').attr('x', m.l + (W - m.l - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').text(xLabel);
    svg.append('g').selectAll('rect').data(bins).join('rect')
      .attr('x', b => x(b.x0) + 1).attr('width', b => Math.max(0, x(b.x1) - x(b.x0) - 2)).attr('rx', 3)
      .attr('fill', b => (refLine && b.x0 >= refLine.value ? 'var(--crimson-hi)' : color)).attr('y', y(0)).attr('height', 0)
      .on('mouseenter', (ev, b) => tt().show(`<b>${b.x0}–${b.x1}</b>${row('Count', b.length)}${row('Share', ((b.length / vals.length) * 100).toFixed(1) + '%')}`, ev))
      .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide())
      .transition().duration(600).attr('y', b => y(b.length)).attr('height', b => y(0) - y(b.length));
    if (refLine) {
      svg.append('line').attr('x1', x(refLine.value)).attr('x2', x(refLine.value)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#fff').attr('stroke-opacity', .6).attr('stroke-dasharray', '4 4');
      svg.append('text').attr('x', x(refLine.value) + 5).attr('y', m.t + 10).style('font', '600 10px var(--font-mono)').style('fill', 'var(--text-2)').text(refLine.label);
    }
  });
}

// ------------------------------------------------------------------ donut
export function donut(el, { data, valueFormat = d => d, center }) {
  clearLegend(el);
  const rows = data.filter(d => d.value > 0);
  if (!rows.length) return empty(el, 'No data for this selection.');
  legend(el, rows.map((d, i) => ({ name: `${d.label} · ${valueFormat(d.value)}`, color: d.color || PALETTE[i] })));
  frame(el, (W, H) => {
    const svg = svgIn(el, W, H);
    const r = Math.min(W, H) / 2 - 8;
    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);
    const arcs = d3.pie().sort(null).value(d => d.value)(rows);
    const arc = d3.arc().innerRadius(r * 0.62).outerRadius(r).padAngle(0.012).cornerRadius(4);
    g.selectAll('path').data(arcs).join('path').attr('fill', (d, i) => d.data.color || PALETTE[i])
      .on('mouseenter', (ev, d) => tt().show(`<b>${d.data.label}</b>${row('Share', valueFormat(d.data.value))}${d.data.sub ? `<div class="t-row"><span>${d.data.sub}</span></div>` : ''}`, ev))
      .on('mousemove', ev => tt().move(ev)).on('mouseleave', () => tt().hide())
      .transition().duration(700).attrTween('d', d => { const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d); return t => arc(i(t)); });
    if (center) {
      g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').style('font', '700 26px var(--font-head)').style('fill', 'currentColor').attr('class', 'donut-c').text(center.value);
      g.append('text').attr('text-anchor', 'middle').attr('dy', '1.5em').style('font', '600 10px var(--font-mono)').style('fill', 'var(--muted)').style('letter-spacing', '.12em').text(center.label);
    }
  });
}
