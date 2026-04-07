'use strict';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const PALETTE = [
  { line: '#adb5bd', bar: 'rgba(173,181,189,0.65)', border: '#6c757d' },
  { line: '#0d6efd', bar: 'rgba(13,110,253,0.70)',  border: '#0a58ca' },
  { line: '#198754', bar: 'rgba(25,135,84,0.70)',   border: '#146c43' },
];

const _activeCharts = {};

function _destroy(id) {
  if (_activeCharts[id]) { _activeCharts[id].destroy(); delete _activeCharts[id]; }
}

function _destroyAll() { Object.keys(_activeCharts).forEach(_destroy); }

// Group sorted {year,month,value} array into { year: [null×12] } buckets
function _byYear(data) {
  const map = {};
  for (const d of data) {
    if (!map[d.year]) map[d.year] = Array(12).fill(null);
    map[d.year][d.month - 1] = d.value;
  }
  return map;
}

function _axisFormatter(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'k';
  return v;
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString('es-ES');
}

// ── Line chart (year-over-year) ────────────────────────────────────────────

function renderLineChart(canvasId, data, title) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data?.length) return;

  const byYear = _byYear(data);
  const years  = Object.keys(byYear).sort();

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MESES,
      datasets: years.map((yr, i) => {
        const c = PALETTE[i] ?? PALETTE[0];
        return {
          label: yr,
          data: byYear[yr],
          borderColor: c.line,
          backgroundColor: c.line + '18',
          borderWidth: i === years.length - 1 ? 2.5 : 1.5,
          pointRadius: 3,
          tension: 0.35,
          fill: false,
          spanGaps: false,
        };
      }),
    },
    options: _lineOpts(title),
  });
}

// ── Bar chart (year-over-year grouped) ────────────────────────────────────

function renderBarChart(canvasId, data, title) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data?.length) return;

  const byYear = _byYear(data);
  const years  = Object.keys(byYear).sort();

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: years.map((yr, i) => {
        const c = PALETTE[i] ?? PALETTE[0];
        return { label: yr, data: byYear[yr], backgroundColor: c.bar, borderColor: c.border, borderWidth: 1 };
      }),
    },
    options: _barOpts(title),
  });
}

// ── Nacional vs Extranjero donut ───────────────────────────────────────────

function renderDonutChart(canvasId, nacionales, extranjeros) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const lastEntry = arr => arr?.length ? arr[arr.length - 1] : null;
  const ln = lastEntry(nacionales);
  const le = lastEntry(extranjeros);
  const nac = ln?.value ?? 0;
  const ext = le?.value ?? 0;
  if (!nac && !ext) return;

  const total = nac + ext;
  const pctNac = total ? (nac / total * 100).toFixed(1) : 0;
  const pctExt = total ? (ext / total * 100).toFixed(1) : 0;

  // Update the two residency stat cards
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const mes = ln ? `${MESES[ln.month - 1]} ${ln.year}` : (le ? `${MESES[le.month - 1]} ${le.year}` : '');
  setText('card-nac-val', nac ? fmtNum(nac) : '—');
  setText('card-nac-sub', nac ? mes : 'Sin datos');
  setText('card-ext-val', ext ? fmtNum(ext) : '—');
  setText('card-ext-sub', ext ? mes : 'Sin datos');

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [
        `Nacionales: ${fmtNum(nac)} (${pctNac}%)`,
        `Extranjeros: ${fmtNum(ext)} (${pctExt}%)`,
      ],
      datasets: [{
        data: [nac, ext],
        backgroundColor: ['rgba(13,110,253,0.8)', 'rgba(255,193,7,0.85)'],
        borderColor: ['#0d6efd', '#ffc107'],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, padding: 16 } },
        title:  { display: true, text: 'Viajeros — nacional vs extranjero (último mes)', font: { size: 13 } },
        tooltip: { callbacks: { label: c => ` ${c.label}` } },
      },
    },
  });
}

// ── Comparison line chart (two municipios, chronological) ─────────────────

function renderComparisonChart(canvasId, name1, data1, name2, data2) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || (!data1.length && !data2.length)) return;

  // Build sorted chronological labels from the union of both series
  const keySet = new Set();
  [...data1, ...data2].forEach(d => keySet.add(`${d.year}-${String(d.month).padStart(2, '0')}`));
  const keys = [...keySet].sort();

  const toArr = data => {
    const map = {};
    data.forEach(d => { map[`${d.year}-${String(d.month).padStart(2, '0')}`] = d.value; });
    return keys.map(k => map[k] ?? null);
  };

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: keys.map(k => { const [y, m] = k.split('-'); return `${MESES[+m - 1]} ${y}`; }),
      datasets: [
        { label: name1, data: toArr(data1), borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.08)', borderWidth: 2.5, tension: 0.35, pointRadius: 3, fill: false },
        { label: name2, data: toArr(data2), borderColor: '#dc3545', backgroundColor: 'rgba(220,53,69,0.08)',  borderWidth: 2.5, tension: 0.35, pointRadius: 3, fill: false },
      ],
    },
    options: _lineOpts('Comparativa pernoctaciones'),
  });
}

// ── Top 10 horizontal bar ──────────────────────────────────────────────────

function renderTop10Chart(canvasId, top10) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !top10.length) return;

  const { year, month } = top10[0];

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(d => d.municipio),
      datasets: [{
        label: 'Pernoctaciones',
        data: top10.map(d => d.value),
        backgroundColor: top10.map((_, i) => i === 0 ? 'rgba(13,110,253,0.85)' : 'rgba(13,110,253,0.55)'),
        borderColor: '#0d6efd',
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: `Top 10 por pernoctaciones — ${MESES[month - 1]} ${year}`, font: { size: 13 } },
        tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.x)}` } },
      },
      scales: { x: { beginAtZero: true, ticks: { callback: _axisFormatter } } },
    },
  });
}

// ── Shared chart option factories ──────────────────────────────────────────

function _lineOpts(title) {
  return {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12 } },
      title:  { display: true, text: title, font: { size: 13 } },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)}` } },
    },
    scales: { y: { beginAtZero: true, ticks: { callback: _axisFormatter } } },
  };
}

function _barOpts(title) {
  return {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12 } },
      title:  { display: true, text: title, font: { size: 13 } },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)}` } },
    },
    scales: { y: { beginAtZero: true, ticks: { callback: _axisFormatter } } },
  };
}

// ── Stat cards ─────────────────────────────────────────────────────────────

function updateStatCards(viajeros, pernoctaciones, nacionales, extranjeros) {
  console.log('[updateStatCards] viajeros:', viajeros?.length, 'pernoct:', pernoctaciones?.length, 'nac:', nacionales?.length, 'ext:', extranjeros?.length);
  const last = arr => arr?.length ? arr[arr.length - 1] : null;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (!el) { console.log(`updateStatCards: element #${id} not found in DOM`); return; }
    el.textContent = value;
  };

  const lv = last(viajeros);
  const lp = last(pernoctaciones);

  setText('card-viajeros-val', lv ? fmtNum(lv.value) : '—');
  setText('card-viajeros-sub', lv ? `${MESES[lv.month - 1]} ${lv.year}` : 'Sin datos');
  setText('card-pernoct-val',  lp ? fmtNum(lp.value) : '—');
  setText('card-pernoct-sub',  lp ? `${MESES[lp.month - 1]} ${lp.year}` : 'Sin datos');

  // Third card: % extranjero viajeros
  const ln = last(nacionales);
  const le = last(extranjeros);
  if (ln && le && ln.year === le.year && ln.month === le.month) {
    const pct = (le.value / (ln.value + le.value) * 100).toFixed(1);
    setText('card-ocup-val', pct + '%');
    setText('card-ocup-sub', `Extranjeros · ${MESES[le.month - 1]} ${le.year}`);
  } else {
    setText('card-ocup-val', '—');
    setText('card-ocup-sub', 'Sin datos');
  }
}

// ── Termómetro ─────────────────────────────────────────────────────────────

function updateTermometro(pernoctaciones) {
  const el = document.getElementById('termometro-content');
  if (!el) return;

  if (!pernoctaciones?.length) {
    el.innerHTML = '<span class="text-muted">Sin datos de pernoctaciones.</span>';
    return;
  }

  const last = pernoctaciones[pernoctaciones.length - 1];
  const prev = pernoctaciones.find(d => d.year === last.year - 1 && d.month === last.month);

  if (!prev || prev.value === 0) {
    el.innerHTML = `<span class="text-muted">Último dato: ${fmtNum(last.value)} pernoctaciones (${MESES[last.month - 1]} ${last.year}). Sin dato del año anterior para comparar.</span>`;
    return;
  }

  const pct  = (last.value - prev.value) / prev.value * 100;
  const isUp = pct >= 0;
  const cls  = isUp ? 'text-success' : 'text-danger';
  const mes  = MESES[last.month - 1];

  el.innerHTML = `
    <div class="d-flex align-items-center flex-wrap gap-3">
      <div class="termometro-badge ${isUp ? 'bg-success-subtle' : 'bg-danger-subtle'} rounded-3 px-3 py-2 text-center">
        <span class="${cls} fs-3 fw-bold d-block">${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</span>
        <small class="${cls}">vs ${mes} ${last.year - 1}</small>
      </div>
      <div>
        <div class="fw-semibold">Pernoctaciones — ${mes} ${last.year}</div>
        <div class="text-muted small">
          ${fmtNum(last.value)} este año &nbsp;·&nbsp; ${fmtNum(prev.value)} el año anterior &nbsp;·&nbsp; diferencia: ${fmtNum(last.value - prev.value)}
        </div>
      </div>
    </div>`;
}

// ── Main entry point ────────────────────────────────────────────────────────

function renderDashboard(munData, compName, compData) {
  _destroyAll();
  updateStatCards(munData.viajeros, munData.pernoctaciones, munData.nacionales, munData.extranjeros);
  updateTermometro(munData.pernoctaciones);
  renderLineChart('chart-line',  munData.pernoctaciones, 'Pernoctaciones — evolución mensual');
  renderBarChart('chart-bar',    munData.viajeros,       'Viajeros — comparativa mensual');
  renderDonutChart('chart-donut', munData.nacionales, munData.extranjeros);

  const compSection = document.getElementById('section-comparison');
  if (compName && compData?.pernoctaciones?.length) {
    renderComparisonChart('chart-comparison',
      document.getElementById('dash-title').textContent, munData.pernoctaciones,
      compName, compData.pernoctaciones
    );
    compSection?.classList.remove('d-none');
  } else {
    compSection?.classList.add('d-none');
  }
}
