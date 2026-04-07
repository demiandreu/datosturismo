'use strict';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Named colours for years 2016-2025; older years fall back to EXTRA_COLORS
const YEAR_COLORS = {
  2016: { line: '#E53935', bar: 'rgba(229,57,53,0.65)',   border: '#C62828' },
  2017: { line: '#FB8C00', bar: 'rgba(251,140,0,0.65)',   border: '#E65100' },
  2018: { line: '#FDD835', bar: 'rgba(253,216,53,0.70)',  border: '#F9A825' },
  2019: { line: '#43A047', bar: 'rgba(67,160,71,0.65)',   border: '#2E7D32' },
  2020: { line: '#00ACC1', bar: 'rgba(0,172,193,0.65)',   border: '#00838F' },
  2021: { line: '#1E88E5', bar: 'rgba(30,136,229,0.65)',  border: '#1565C0' },
  2022: { line: '#5E35B1', bar: 'rgba(94,53,177,0.65)',   border: '#4527A0' },
  2023: { line: '#8E24AA', bar: 'rgba(142,36,170,0.65)',  border: '#6A1B9A' },
  2024: { line: '#00897B', bar: 'rgba(0,137,123,0.65)',   border: '#00695C' },
  2025: { line: '#F4511E', bar: 'rgba(244,81,30,0.75)',   border: '#BF360C' },
};
const EXTRA_COLORS = [
  { line: '#546E7A', bar: 'rgba(84,110,122,0.60)', border: '#37474F' },
];
const _color = yr => YEAR_COLORS[yr] ?? EXTRA_COLORS[0];

const DEFAULT_LINE_YEARS = ['2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'];
const DEFAULT_BAR_YEARS  = ['2024', '2025'];

const _chartStore   = {};   // stores data per canvasId for toggle re-render
const _activeCharts = {};

function _destroy(id) {
  if (_activeCharts[id]) { _activeCharts[id].destroy(); delete _activeCharts[id]; }
}

// Charts that belong to other tabs — preserved when municipio tab re-renders
const _PERSISTENT_CHARTS = new Set([
  'chart-top10', 'chart-ccaa', 'chart-nac-trend',
  'chart-paises-donut', 'chart-paises-trend',
]);

function _destroyAll(excludePersistent = true) {
  Object.keys(_activeCharts).forEach(id => {
    if (excludePersistent && _PERSISTENT_CHARTS.has(id)) return;
    _destroy(id);
  });
  // Remove injected toggle buttons so they don't stack on re-render
  document.querySelectorAll('[id^="toggle-chart-"]').forEach(el => el.remove());
}

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

// ── Line chart (year-over-year, last 3 years by default) ──────────────────

function renderLineChart(canvasId, data, title) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas?.getContext('2d');
  if (!ctx || !data?.length) return;

  const byYear  = _byYear(data);
  const allYears = Object.keys(byYear).sort();

  _chartStore[canvasId] = { byYear, allYears, title, showAll: false };
  _drawLineChart(canvasId, ctx);
  _ensureLineToggle(canvasId, ctx);
}

function _defaultYears(allYears, wanted) {
  const filtered = allYears.filter(y => wanted.includes(y));
  return filtered.length ? filtered : allYears.slice(-wanted.length);
}

function _drawLineChart(canvasId, ctx) {
  _destroy(canvasId);
  const { byYear, allYears, title, showAll } = _chartStore[canvasId];
  const years = showAll ? allYears : _defaultYears(allYears, DEFAULT_LINE_YEARS);

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MESES,
      datasets: years.map(yr => {
        const c = _color(yr);
        return {
          label: yr,
          data: byYear[yr],
          borderColor: c.line,
          backgroundColor: c.line + '18',
          borderWidth: yr === allYears[allYears.length - 1] ? 2.5 : 1.5,
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

function _ensureLineToggle(canvasId, ctx) {
  const canvas = document.getElementById(canvasId);
  const cardBody = canvas?.closest('.card-body');
  if (!cardBody) return;

  const btnId = `toggle-${canvasId}`;
  if (document.getElementById(btnId)) return;   // already injected

  const btn = document.createElement('button');
  btn.id = btnId;
  btn.className = 'btn btn-sm btn-outline-secondary mb-2';
  btn.textContent = 'Mostrar todos los años';
  btn.addEventListener('click', () => {
    const store = _chartStore[canvasId];
    store.showAll = !store.showAll;
    btn.textContent = store.showAll ? 'Mostrar últimos 3 años' : 'Mostrar todos los años';
    _drawLineChart(canvasId, ctx);
  });
  cardBody.insertBefore(btn, canvas);
}

// ── Bar chart (last 2 years side by side) ────────────────────────────────

function renderBarChart(canvasId, data, title) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data?.length) return;

  const byYear  = _byYear(data);
  const allYears = Object.keys(byYear).sort();
  const years   = _defaultYears(allYears, DEFAULT_BAR_YEARS);

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: years.map(yr => {
        const c = _color(yr);
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
    options: _lineOpts('Comparativa noches de estancia'),
  });
}

// ── Top 10 horizontal bar ──────────────────────────────────────────────────

function renderTop10Chart(canvasId, top10) {
  _destroy(canvasId);
  const canvas = document.getElementById(canvasId);
  console.log(`[renderTop10Chart] canvas #${canvasId}:`, canvas, '| datos:', top10?.length);
  const ctx = canvas?.getContext('2d');
  if (!ctx || !top10?.length) return;

  const { year, month } = top10[0];

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(d => d.municipio),
      datasets: [{
        label: 'Noches de estancia',
        data: top10.map(d => d.value),
        backgroundColor: top10.map((_, i) => i === 0 ? 'rgba(13,110,253,0.85)' : 'rgba(13,110,253,0.55)'),
        borderColor: '#0d6efd',
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: `Top 10 por noches de estancia — ${MESES[month - 1]} ${year}`, font: { size: 13 } },
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
  const ln = last(nacionales);
  const le = last(extranjeros);

  setText('card-viajeros-val', lv ? fmtNum(lv.value) : '—');
  setText('card-viajeros-sub', lv ? `${MESES[lv.month - 1]} ${lv.year}` : 'Sin datos');
  setText('card-pernoct-val',  lp ? fmtNum(lp.value) : '—');
  setText('card-pernoct-sub',  lp ? `${MESES[lp.month - 1]} ${lp.year}` : 'Sin datos');

  // Nacional / extranjero sub-cards (in the donut section)
  setText('card-nac-val', ln ? fmtNum(ln.value) : '—');
  setText('card-nac-sub', ln ? `${MESES[ln.month - 1]} ${ln.year}` : 'Sin datos');
  setText('card-ext-val', le ? fmtNum(le.value) : '—');
  setText('card-ext-sub', le ? `${MESES[le.month - 1]} ${le.year}` : 'Sin datos');

  // Estancia media = pernoctaciones / viajeros (latest shared month)
  _updateEstanciaMedia(viajeros, pernoctaciones, setText);

  // Índice de internacionalización
  _updateIndiceIntern(nacionales, extranjeros, setText);
}

function _updateEstanciaMedia(viajeros, pernoctaciones, setText) {
  const last = arr => arr?.length ? arr[arr.length - 1] : null;
  const lv = last(viajeros);
  const lp = last(pernoctaciones);

  if (!lv || !lp || lv.value === 0) {
    setText('card-estancia-val', '—');
    setText('card-estancia-sub', 'Sin datos');
    return;
  }

  const estancia = lp.value / lv.value;
  setText('card-estancia-val', estancia.toFixed(1) + ' días');
  setText('card-estancia-sub', `${MESES[lp.month - 1]} ${lp.year}`);

  // Year-over-year comparison
  const prevV = viajeros.find(d => d.year === lv.year - 1 && d.month === lv.month);
  const prevP = pernoctaciones.find(d => d.year === lp.year - 1 && d.month === lp.month);
  if (prevV?.value && prevP?.value) {
    const prevEst = prevP.value / prevV.value;
    const diff = estancia - prevEst;
    const sign = diff >= 0 ? '+' : '';
    setText('card-estancia-sub', `${MESES[lp.month - 1]} ${lp.year} · ${sign}${diff.toFixed(1)} vs año ant.`);
  }
}

function _updateIndiceIntern(nacionales, extranjeros, setText) {
  const last = arr => arr?.length ? arr[arr.length - 1] : null;
  const ln = last(nacionales);
  const le = last(extranjeros);

  if (!ln || !le) {
    setText('card-intern-val', '—');
    setText('card-intern-sub', 'Sin datos');
    const badge = document.getElementById('card-intern-badge');
    if (badge) badge.innerHTML = '';
    return;
  }

  const total = ln.value + le.value;
  const pct   = total ? (le.value / total * 100) : 0;

  setText('card-intern-val', pct.toFixed(1) + '%');
  setText('card-intern-sub', `${fmtNum(le.value)} extranjeros de ${fmtNum(total)} viajeros · ${MESES[le.month - 1]} ${le.year}`);

  const badge = document.getElementById('card-intern-badge');
  if (badge) {
    const tr = window._t ?? (k => k);
  const [cls, label] =
      pct >= 50 ? ['bg-success text-white', tr('intern_alta')] :
      pct >= 30 ? ['bg-warning text-dark',  tr('intern_media')] :
                  ['bg-danger text-white',   tr('intern_baja')];
    badge.innerHTML = `<span class="badge rounded-pill fs-6 px-3 py-2 ${cls}">${label}</span>`;
  }
}

// ── Termómetro ─────────────────────────────────────────────────────────────

function updateTermometro(pernoctaciones) {
  const el = document.getElementById('termometro-content');
  if (!el) return;

  if (!pernoctaciones?.length) {
    el.innerHTML = '<span class="text-muted">Sin datos de noches de estancia.</span>';
    return;
  }

  const last = pernoctaciones[pernoctaciones.length - 1];
  const prev = pernoctaciones.find(d => d.year === last.year - 1 && d.month === last.month);

  if (!prev || prev.value === 0) {
    el.innerHTML = `<span class="text-muted">Último dato: ${fmtNum(last.value)} noches de estancia (${MESES[last.month - 1]} ${last.year}). Sin dato del año anterior para comparar.</span>`;
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
        <div class="fw-semibold">Noches de estancia — ${mes} ${last.year}</div>
        <div class="text-muted small">
          ${fmtNum(last.value)} este año &nbsp;·&nbsp; ${fmtNum(prev.value)} el año anterior &nbsp;·&nbsp; diferencia: ${fmtNum(last.value - prev.value)}
        </div>
      </div>
    </div>`;
}

// ── CCAA horizontal bar (Vista Nacional) ──────────────────────────────────

function renderCCAAChart(canvasId, data) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data?.length) return;
  const { year, month } = data[0];

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.ccaa),
      datasets: [{
        label: 'Noches de estancia',
        data:  data.map(d => d.value),
        backgroundColor: data.map((_, i) => i === 0 ? 'rgba(13,110,253,0.85)' : 'rgba(13,110,253,0.50)'),
        borderColor: '#0d6efd',
        borderWidth: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        title:  { display: true, text: `Noches de estancia por CCAA — ${MESES[month - 1]} ${year}`, font: { size: 13 } },
        tooltip: { callbacks: { label: c => ` ${fmtNum(c.parsed.x)}` } },
      },
      scales: { x: { beginAtZero: true, ticks: { callback: _axisFormatter } } },
    },
  });
}

// ── National trend line (Vista Nacional) ──────────────────────────────────

function renderNacionalTrendChart(canvasId, data) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data?.length) return;

  const byYear   = _byYear(data);
  const allYears = Object.keys(byYear).sort();

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MESES,
      datasets: allYears.map(yr => {
        const c = _color(yr);
        return {
          label: yr, data: byYear[yr],
          borderColor: c.line, backgroundColor: c.line + '18',
          borderWidth: yr === allYears[allYears.length - 1] ? 2.5 : 1.5,
          pointRadius: 3, tension: 0.35, fill: false, spanGaps: false,
        };
      }),
    },
    options: _lineOpts('Noches de estancia totales España — evolución anual'),
  });
}

// ── País donut (Internacional) ────────────────────────────────────────────

const _PAIS_PAL = ['#E53935','#FB8C00','#FDD835','#43A047','#00ACC1',
                   '#1E88E5','#5E35B1','#8E24AA','#00897B','#546E7A'];

function renderPaisesDonutChart(canvasId, data) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data?.length) return;
  const { year, month } = data[0];

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.value),
        backgroundColor: _PAIS_PAL.slice(0, data.length).map(c => c + 'CC'),
        borderColor:     _PAIS_PAL.slice(0, data.length),
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 14, padding: 10, font: { size: 11 } } },
        title:  { display: true, text: `Top países de origen — ${MESES[month - 1]} ${year}`, font: { size: 13 } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtNum(c.parsed)}` } },
      },
    },
  });
}

// ── País trend multi-line (Internacional) ─────────────────────────────────

function renderPaisesTrendChart(canvasId, byPais) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !Object.keys(byPais).length) return;

  const keySet = new Set();
  Object.values(byPais).flat().forEach(d =>
    keySet.add(`${d.year}-${String(d.month).padStart(2, '0')}`)
  );
  const keys   = [...keySet].sort();
  const paises = Object.keys(byPais);

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: keys.map(k => { const [y, m] = k.split('-'); return `${MESES[+m - 1]} ${y}`; }),
      datasets: paises.map((p, i) => {
        const map = {};
        byPais[p].forEach(d => { map[`${d.year}-${String(d.month).padStart(2, '0')}`] = d.value; });
        const col = _PAIS_PAL[i] ?? _PAIS_PAL[0];
        return {
          label: p, data: keys.map(k => map[k] ?? null),
          borderColor: col, backgroundColor: col + '18',
          borderWidth: 2, pointRadius: 2, tension: 0.35, fill: false, spanGaps: false,
        };
      }),
    },
    options: _lineOpts('Evolución turistas internacionales — top 5 países (últimos 24 meses)'),
  });
}

// ── Main entry point ────────────────────────────────────────────────────────

function renderDashboard(munData, compName, compData) {
  _destroyAll();
  updateStatCards(munData.viajeros, munData.pernoctaciones, munData.nacionales, munData.extranjeros);
  updateTermometro(munData.pernoctaciones);
  renderLineChart('chart-line',  munData.pernoctaciones, 'Noches de estancia — evolución mensual');
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
