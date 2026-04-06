'use strict';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Colour palette per year index
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

// Group sorted data into { year: [null×12] } buckets
function _byYear(data) {
  const map = {};
  data.forEach(d => {
    if (!map[d.year]) map[d.year] = Array(12).fill(null);
    map[d.year][d.month - 1] = d.value;
  });
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

// ── Line chart ─────────────────────────────────────────────────────────────

function renderLineChart(canvasId, data, title) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data.length) return;

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
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        title:  { display: true, text: title, font: { size: 13 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtNum(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: _axisFormatter } },
      },
    },
  });
}

// ── Bar chart ───────────────────────────────────────────────────────────────

function renderBarChart(canvasId, data, title) {
  _destroy(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx || !data.length) return;

  const byYear = _byYear(data);
  const years  = Object.keys(byYear).sort();

  _activeCharts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MESES,
      datasets: years.map((yr, i) => {
        const c = PALETTE[i] ?? PALETTE[0];
        return {
          label: yr,
          data: byYear[yr],
          backgroundColor: c.bar,
          borderColor: c.border,
          borderWidth: 1,
        };
      }),
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12 } },
        title:  { display: true, text: title, font: { size: 13 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtNum(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: _axisFormatter } },
      },
    },
  });
}

// ── Stat cards ──────────────────────────────────────────────────────────────

function updateStatCards(viajeros, pernoctaciones, ocupacion) {
  // parseSeriesData already filters nulls and zeros, so last entry is the
  // latest published data point.
  const last = arr => arr.length ? arr[arr.length - 1] : null;

  const lv = last(viajeros);
  const lp = last(pernoctaciones);
  const lo = last(ocupacion);

  document.getElementById('card-viajeros-val').textContent =
    lv ? fmtNum(lv.value) : '—';
  document.getElementById('card-viajeros-sub').textContent =
    lv ? `${MESES[lv.month - 1]} ${lv.year}` : 'Sin datos';

  document.getElementById('card-pernoct-val').textContent =
    lp ? fmtNum(lp.value) : '—';
  document.getElementById('card-pernoct-sub').textContent =
    lp ? `${MESES[lp.month - 1]} ${lp.year}` : 'Sin datos';

  document.getElementById('card-ocup-val').textContent =
    lo ? lo.value.toFixed(1) + '%' : '—';
  document.getElementById('card-ocup-sub').textContent =
    lo ? `${MESES[lo.month - 1]} ${lo.year}` : 'Sin datos';
}

// ── Termómetro ──────────────────────────────────────────────────────────────

function updateTermometro(pernoctaciones) {
  const el = document.getElementById('termometro-content');
  if (!el) return;

  if (!pernoctaciones.length) {
    el.innerHTML = '<span class="text-muted">Sin datos de pernoctaciones.</span>';
    return;
  }

  const last = pernoctaciones[pernoctaciones.length - 1];
  const prev = pernoctaciones.find(d => d.year === last.year - 1 && d.month === last.month);

  if (!prev || prev.value === 0) {
    el.innerHTML = `
      <span class="text-muted">
        Último dato: ${fmtNum(last.value)} pernoctaciones
        (${MESES[last.month - 1]} ${last.year}).
        Sin dato del año anterior para comparar.
      </span>`;
    return;
  }

  const pct   = (last.value - prev.value) / prev.value * 100;
  const isUp  = pct >= 0;
  const arrow = isUp ? '▲' : '▼';
  const cls   = isUp ? 'text-success' : 'text-danger';
  const mes   = MESES[last.month - 1];

  el.innerHTML = `
    <div class="d-flex align-items-center flex-wrap gap-3">
      <div class="termometro-badge ${isUp ? 'bg-success-subtle' : 'bg-danger-subtle'} rounded-3 px-3 py-2 text-center">
        <span class="${cls} fs-3 fw-bold d-block">${arrow} ${Math.abs(pct).toFixed(1)}%</span>
        <small class="${cls}">vs ${mes} ${last.year - 1}</small>
      </div>
      <div>
        <div class="fw-semibold">Pernoctaciones — ${mes} ${last.year}</div>
        <div class="text-muted small">
          ${fmtNum(last.value)} este año
          &nbsp;·&nbsp;
          ${fmtNum(prev.value)} el año anterior
          &nbsp;·&nbsp;
          diferencia: ${fmtNum(last.value - prev.value)}
        </div>
      </div>
    </div>`;
}

// ── Main entry point ────────────────────────────────────────────────────────

function renderDashboard(viajeros, pernoctaciones, ocupacion) {
  _destroyAll();
  updateStatCards(viajeros, pernoctaciones, ocupacion);
  updateTermometro(pernoctaciones);
  renderLineChart('chart-line', pernoctaciones, 'Pernoctaciones — evolución mensual');
  renderBarChart('chart-bar',  viajeros,       'Viajeros — comparativa mensual');
}
