'use strict';

// INE CSV for table 23988 — FRONTUR: turistas internacionales por CCAA de destino y país
//
// Long format (semicolon-separated):
//   col 0: Países de residencia           e.g. "Reino Unido"
//   col 1: Comunidades autónomas destino  e.g. "Cataluña", "Total Nacional"
//   col 2: Tipo de dato                   e.g. "Dato base", "Acumulado en lo que va de año"
//   col 3: Período                         e.g. "2024M10"
//   col 4: Total (value)
//
// We keep only "Dato base" monthly rows and expose the CCAA dimension.

const FRONTUR_CSV_URL = 'https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/23988.csv';

const COUNTRY_FLAGS = {
  'Reino Unido':    '🇬🇧',
  'Alemania':       '🇩🇪',
  'Francia':        '🇫🇷',
  'Italia':         '🇮🇹',
  'Portugal':       '🇵🇹',
  'Países Bajos':   '🇳🇱',
  'Bélgica':        '🇧🇪',
  'Estados Unidos': '🇺🇸',
  'China':          '🇨🇳',
  'Suiza':          '🇨🇭',
  'Suecia':         '🇸🇪',
  'Noruega':        '🇳🇴',
  'Irlanda':        '🇮🇪',
  'Austria':        '🇦🇹',
  'Dinamarca':      '🇩🇰',
  'Finlandia':      '🇫🇮',
  'Polonia':        '🇵🇱',
  'Rusia':          '🇷🇺',
  'Japón':          '🇯🇵',
  'México':         '🇲🇽',
  'Brasil':         '🇧🇷',
};

let _fronturRows  = null;
let _fronturCCAAs = null;   // sorted list of CCAA names found in header

async function _loadFronturCSV() {
  if (_fronturRows) return _fronturRows;

  const res = await fetch(FRONTUR_CSV_URL);
  if (!res.ok) throw new Error(`Error ${res.status} cargando datos FRONTUR (tabla 23988)`);
  const text = await res.text();

  const lines = text.split('\n');
  const rows  = [];
  if (lines.length < 2) { _fronturRows = rows; return rows; }

  // ── Parse header ──────────────────────────────────────────────────────────
  const headerCols = lines[0].trim().split(';').map(c => c.trim());
  console.log('[FRONTUR] CSV header columns:', headerCols);

  const idx = pat => headerCols.findIndex(c => pat.test(c));

  // Locate known structural columns
  const iPais    = (() => {
    let i = idx(/pa[íi]s.*resid|resid.*pa[íi]s/i);
    return i >= 0 ? i : idx(/pa[íi]s/i);
  })();
  const iTipo    = idx(/tipo/i);
  const iPeriodo = idx(/per[íi]odo|period/i);
  const iCCAA    = idx(/comunidad|ccaa|autonom/i);  // present in long format only

  const isLongFormat = iCCAA >= 0;

  // In wide format every column after the last dimension column is a CCAA
  const lastDimCol = Math.max(
    iPais    >= 0 ? iPais    : -1,
    iTipo    >= 0 ? iTipo    : -1,
    iPeriodo >= 0 ? iPeriodo : -1
  );
  const wideDataStart = lastDimCol + 1;
  const wideLabels    = isLongFormat ? [] : headerCols.slice(wideDataStart);

  // Column positions (with sensible fallbacks)
  const cPais    = iPais    >= 0 ? iPais    : 0;
  const cTipo    = iTipo    >= 0 ? iTipo    : (isLongFormat ? -1 : 1);
  const cPeriodo = iPeriodo >= 0 ? iPeriodo : (isLongFormat ? (iCCAA > 0 ? iCCAA - 1 : 2) : 2);
  const cCCAA    = isLongFormat ? iCCAA : -1;
  const cValor   = isLongFormat ? (headerCols.length - 1) : -1;

  console.log('[FRONTUR] format:', isLongFormat ? 'long' : 'wide',
    '| pais:', cPais, 'tipo:', cTipo, 'period:', cPeriodo,
    '| data:', isLongFormat
      ? `ccaa=${cCCAA} val=${cValor}`
      : `${wideLabels.length} CCAA cols from col ${wideDataStart}`);

  // Store CCAA list for getFronturCCAAs()
  _fronturCCAAs = isLongFormat ? null : wideLabels.slice();

  // ── Parse data rows ───────────────────────────────────────────────────────
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(';');
    if (cols.length <= cPeriodo) continue;

    const pais    = cols[cPais]?.trim()    ?? '';
    const tipo    = cTipo >= 0 ? (cols[cTipo]?.trim() ?? '') : '';
    const periodo = cols[cPeriodo]?.trim() ?? '';

    if (!pais || !periodo) continue;
    if (/^total/i.test(pais)) continue;
    // Skip "Acumulado en lo que va de año" — keep only "Dato base" monthly rows
    if (tipo && /acumulado/i.test(tipo)) continue;

    const dateM = periodo.match(/^(\d{4})M(\d{2})$/);
    if (!dateM) continue;
    const year  = parseInt(dateM[1], 10);
    const month = parseInt(dateM[2], 10);

    if (!isLongFormat) {
      // Wide format: emit one record per CCAA column
      for (let j = 0; j < wideLabels.length; j++) {
        const valorRaw = cols[wideDataStart + j]?.trim() ?? '';
        const value    = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
        if (isNaN(value) || value <= 0) continue;
        rows.push({ pais, ccaa: wideLabels[j], year, month, value });
      }
    } else {
      // Long format: one record per line
      const ccaa     = cols[cCCAA]?.trim()  ?? '';
      const valorRaw = cols[cValor]?.trim() ?? '';
      const value    = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
      if (isNaN(value) || value <= 0) continue;
      rows.push({ pais, ccaa, year, month, value });
    }
  }

  _fronturRows = rows;
  console.log(`[FRONTUR] CSV cargado: ${rows.length} filas válidas`);
  return rows;
}

// Returns [{pais, label (with flag), value, year, month}] sorted desc for the given month
async function getFronturTopPaises(ccaaFilter = 'Total Nacional', n = 10, targetYear = null, targetMonth = null) {
  const rows = await _loadFronturCSV();

  const isTotal = /total|nacional/i.test(ccaaFilter);
  const subset  = rows.filter(r =>
    isTotal ? /total|nacional/i.test(r.ccaa) : r.ccaa.toLowerCase() === ccaaFilter.toLowerCase()
  );
  if (!subset.length) return [];

  let year, month;
  if (targetYear && targetMonth) {
    year = targetYear; month = targetMonth;
  } else {
    const latest = subset.reduce((b, r) =>
      r.year > b.year || (r.year === b.year && r.month > b.month) ? r : b, subset[0]);
    year = latest.year; month = latest.month;
  }

  const map = {};
  for (const r of subset.filter(r => r.year === year && r.month === month)) {
    map[r.pais] = (map[r.pais] ?? 0) + r.value;
  }

  const flag = p => COUNTRY_FLAGS[p] ? COUNTRY_FLAGS[p] + ' ' : '';
  return Object.entries(map)
    .map(([pais, value]) => ({ pais, label: `${flag(pais)}${pais}`, value, year, month }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

// Returns { pais: [{year,month,value}] } for the last 24 months for each given country
async function getFronturTrend(paises, ccaaFilter = 'Total Nacional') {
  const rows = await _loadFronturCSV();
  const isTotal = /total|nacional/i.test(ccaaFilter);

  const subset = rows.filter(r => {
    const ccaaOk = isTotal
      ? /total|nacional/i.test(r.ccaa)
      : r.ccaa.toLowerCase() === ccaaFilter.toLowerCase();
    return ccaaOk && paises.includes(r.pais);
  });

  const byPais = {};
  for (const r of subset) {
    if (!byPais[r.pais]) byPais[r.pais] = [];
    byPais[r.pais].push({ year: r.year, month: r.month, value: r.value });
  }
  for (const p of Object.keys(byPais)) {
    byPais[p] = byPais[p]
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .slice(-24);
  }
  return byPais;
}

// Returns sorted list of unique CCAA values found in the data
async function getFronturCCAAs() {
  const rows = await _loadFronturCSV();

  // If we detected CCAA names from the wide-format header, use them directly
  if (_fronturCCAAs && _fronturCCAAs.length) {
    const ccaas = _fronturCCAAs
      .filter(c => !/total|nacional/i.test(c))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return ['Total Nacional', ...ccaas];
  }

  // Fallback: derive from row data, filtering out non-CCAA strings
  const KNOWN_NON_CCAA = /tipo|dato|acumulado|anual|base|trimest/i;
  const seen = new Set(
    rows.map(r => r.ccaa)
        .filter(c => c && !KNOWN_NON_CCAA.test(c) && !/total|nacional/i.test(c))
  );
  return ['Total Nacional', ...[...seen].sort((a, b) => a.localeCompare(b, 'es'))];
}
