'use strict';

// Generic loader for INE multi-dimensional CSV tables.
// Handles: EOH (Hoteles 2074), EOTR (Rural 2070), EGATUR (Gasto 10839)
//
// Typical INE long-format CSV:
//   dimension_1 ; ... ; Tipo de dato ; Período ; Total
// where:
//   - "Tipo de dato" has "Dato base" (monthly) and "Acumulado…" rows → keep only base
//   - "Período" is YYYYMNN (monthly) or YYYYTNN (quarterly)
//   - "Total" is the last column (numeric, dot = thousands, comma = decimal)

const _INE_CACHE = {};

async function _fetchINETable(tableId) {
  if (_INE_CACHE[tableId]) return _INE_CACHE[tableId];

  const url = `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/${tableId}.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`INE tabla ${tableId}: HTTP ${res.status}`);

  const rows = _parseINETable(await res.text(), tableId);
  _INE_CACHE[tableId] = rows;
  console.log(`[INE t${tableId}] ${rows.length} filas cargadas`);
  return rows;
}

function _parseINETable(text, tableId) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].trim().split(';').map(h => h.trim());
  console.log(`[INE t${tableId}] headers:`, headers);

  const find = pat => headers.findIndex(h => pat.test(h));

  const iPeriodo   = find(/per[íi]odo/i);
  const iTipo      = find(/tipo.*dato|dato.*tipo/i);
  const iCCAA      = find(/comunidad|ccaa|autonom|provincia|territorio/i);
  const iIndicador = find(/indicador|estad[íi]stica/i);
  const iResid     = find(/resid/i);
  const iTotal     = headers.length - 1;   // last column is the value

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(';');
    if (cols.length <= iTotal) continue;

    // Skip "Acumulado en lo que va de año" rows
    const tipo = iTipo >= 0 ? (cols[iTipo]?.trim() ?? '') : '';
    if (/acumulado/i.test(tipo)) continue;

    // Parse period — monthly (YYYYMNN) or quarterly (YYYYTNN)
    const raw = iPeriodo >= 0 ? (cols[iPeriodo]?.trim() ?? '') : '';
    const mM = raw.match(/^(\d{4})M(\d{2})$/);
    const mQ = raw.match(/^(\d{4})T(\d{2})$/);
    if (!mM && !mQ) continue;

    const year  = parseInt(mM ? mM[1] : mQ[1], 10);
    const month = mM ? parseInt(mM[2], 10) : parseInt(mQ[2], 10) * 3; // Q→last month
    const quarter = mQ ? parseInt(mQ[2], 10) : null;

    const valRaw = cols[iTotal]?.trim() ?? '';
    const value  = parseFloat(valRaw.replace(/\./g, '').replace(',', '.'));
    if (isNaN(value)) continue;

    const row = { year, month, value };
    if (quarter)     row.quarter   = quarter;
    if (iCCAA >= 0)      row.ccaa       = cols[iCCAA]?.trim()  ?? '';
    if (iIndicador >= 0) row.indicador  = cols[iIndicador]?.trim() ?? '';
    if (iResid >= 0)     row.residencia = cols[iResid]?.trim() ?? '';

    rows.push(row);
  }
  return rows;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const _isNacional = ccaa => !ccaa || /total|nacional|espa[ñn]/i.test(ccaa);
const _isTotal    = res  => !res  || /total/i.test(res);

function _latestMonth(rows) {
  return rows.reduce((b, r) =>
    r.year > b.year || (r.year === b.year && r.month > b.month) ? r : b, rows[0]);
}

function _sumMonth(rows, yr, mo) {
  return rows
    .filter(r => r.year === yr && r.month === mo)
    .reduce((s, r) => s + r.value, 0);
}

function _trendData(rows, years) {
  return rows
    .filter(r => years.includes(String(r.year)))
    .map(r => ({ year: r.year, month: r.month, value: r.value }))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

function _byCCAA(rows) {
  const { year, month } = _latestMonth(rows);
  const map = {};
  for (const r of rows.filter(r => r.year === year && r.month === month)) {
    map[r.ccaa] = (map[r.ccaa] ?? 0) + r.value;
  }
  return Object.entries(map)
    .map(([ccaa, value]) => ({ ccaa, value, year, month }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 17);
}

// ── EOH — Hoteles (tabla 2074) ────────────────────────────────────────────────

async function getHotelesNacionalStats() {
  const rows = await _fetchINETable(2074);
  // Keep national rows with total residencia; filter by indicador
  const perRows = rows.filter(r =>
    /pernoct/i.test(r.indicador) && _isNacional(r.ccaa) && _isTotal(r.residencia));
  const viaRows = rows.filter(r =>
    /viajero/i.test(r.indicador) && _isNacional(r.ccaa) && _isTotal(r.residencia));

  // Fallback: if no indicador column, treat all national rows as pernoctaciones
  const baseRows = perRows.length ? perRows
    : rows.filter(r => _isNacional(r.ccaa) && _isTotal(r.residencia));
  if (!baseRows.length) return null;

  const { year, month } = _latestMonth(baseRows);
  return {
    year, month,
    totalPernoct:  _sumMonth(perRows.length ? perRows : baseRows, year, month),
    totalViajeros: _sumMonth(viaRows, year, month),
    prevPernoct:   _sumMonth(perRows.length ? perRows : baseRows, year - 1, month),
    prevViajeros:  _sumMonth(viaRows, year - 1, month),
  };
}

async function getHotelesByCCAA() {
  const rows = await _fetchINETable(2074);
  const perRows = rows.filter(r =>
    /pernoct/i.test(r.indicador) && !_isNacional(r.ccaa) && _isTotal(r.residencia));
  const base = perRows.length
    ? perRows
    : rows.filter(r => !_isNacional(r.ccaa) && _isTotal(r.residencia));
  if (!base.length) return [];
  return _byCCAA(base);
}

async function getHotelesTrend(years = ['2022','2023','2024','2025']) {
  const rows = await _fetchINETable(2074);
  const base = rows.filter(r =>
    /pernoct/i.test(r.indicador) && _isNacional(r.ccaa) && _isTotal(r.residencia));
  const src  = base.length ? base : rows.filter(r => _isNacional(r.ccaa) && _isTotal(r.residencia));
  return _trendData(src, years);
}

// ── EOTR — Rural (tabla 2070) ─────────────────────────────────────────────────

async function getRuralNacionalStats() {
  const rows = await _fetchINETable(2070);
  const perRows = rows.filter(r =>
    /pernoct/i.test(r.indicador) && _isNacional(r.ccaa) && _isTotal(r.residencia));
  const viaRows = rows.filter(r =>
    /viajero/i.test(r.indicador) && _isNacional(r.ccaa) && _isTotal(r.residencia));
  const base = perRows.length ? perRows
    : rows.filter(r => _isNacional(r.ccaa) && _isTotal(r.residencia));
  if (!base.length) return null;

  const { year, month } = _latestMonth(base);
  return {
    year, month,
    totalPernoct:  _sumMonth(perRows.length ? perRows : base, year, month),
    totalViajeros: _sumMonth(viaRows, year, month),
    prevPernoct:   _sumMonth(perRows.length ? perRows : base, year - 1, month),
    prevViajeros:  _sumMonth(viaRows, year - 1, month),
  };
}

async function getRuralByCCAA() {
  const rows = await _fetchINETable(2070);
  const perRows = rows.filter(r =>
    /pernoct/i.test(r.indicador) && !_isNacional(r.ccaa) && _isTotal(r.residencia));
  const base = perRows.length
    ? perRows
    : rows.filter(r => !_isNacional(r.ccaa) && _isTotal(r.residencia));
  if (!base.length) return [];
  return _byCCAA(base);
}

async function getRuralTrend(years = ['2022','2023','2024','2025']) {
  const rows = await _fetchINETable(2070);
  const base = rows.filter(r =>
    /pernoct/i.test(r.indicador) && _isNacional(r.ccaa) && _isTotal(r.residencia));
  const src = base.length ? base : rows.filter(r => _isNacional(r.ccaa) && _isTotal(r.residencia));
  return _trendData(src, years);
}

// ── EGATUR — Gasto turístico internacional (tabla 10839) ──────────────────────

async function getGastoNacionalStats() {
  const rows = await _fetchINETable(10839);
  const natRows = rows.filter(r => _isNacional(r.ccaa));
  if (!natRows.length) return null;

  const { year, month } = _latestMonth(natRows);
  return {
    year, month,
    total: _sumMonth(natRows, year, month),
    prev:  _sumMonth(natRows, year - 1, month),
  };
}

async function getGastoByCCAA() {
  const rows = await _fetchINETable(10839);
  const base = rows.filter(r => !_isNacional(r.ccaa));
  if (!base.length) return [];
  return _byCCAA(base);
}

async function getGastoTrend(years = ['2022','2023','2024','2025']) {
  const rows = await _fetchINETable(10839);
  const nat  = rows.filter(r => _isNacional(r.ccaa));
  return _trendData(nat, years);
}

// Prefetch all three tables in parallel (called from init)
async function prefetchStats() {
  await Promise.allSettled([
    _fetchINETable(2074),
    _fetchINETable(2070),
    _fetchINETable(10839),
  ]).catch(() => {});
}
