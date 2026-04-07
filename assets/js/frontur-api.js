'use strict';

// INE CSV for table 10822 — FRONTUR: turistas internacionales por país de residencia y CCAA
// Column format (semicolon-separated):
//   col 0: País de residencia  e.g. "Reino Unido"
//   col 1: CCAA de destino     e.g. "Cataluña", "Total Nacional"
//   col 2: Period              e.g. "2024M10"
//   col 3: Value               e.g. "1.234.567"

const FRONTUR_CSV_URL = 'https://www.ine.es/jaxiT3/files/t/csv_bdsc/10822.csv';

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

let _fronturRows = null;

async function _loadFronturCSV() {
  if (_fronturRows) return _fronturRows;

  const res = await fetch(FRONTUR_CSV_URL);
  if (!res.ok) throw new Error(`Error ${res.status} cargando datos FRONTUR (tabla 10822)`);
  const text = await res.text();

  const rows = [];
  const lines = text.split('\n');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';');
    if (cols.length < 4) continue;

    const pais     = cols[0].trim();
    const ccaa     = cols[1].trim();
    const periodo  = cols[2].trim();
    const valorRaw = cols[3].trim();

    if (!pais || !periodo) continue;
    // Skip aggregate rows for country dimension (keep CCAA totals)
    if (/^total/i.test(pais)) continue;

    const m = periodo.match(/^(\d{4})M(\d{2})$/);
    if (!m) continue;
    const year  = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);

    const value = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
    if (isNaN(value) || value <= 0) continue;

    rows.push({ pais, ccaa, year, month, value });
  }

  _fronturRows = rows;
  console.log(`[FRONTUR] CSV cargado: ${rows.length} filas válidas`);
  return rows;
}

// Returns [{pais, label (with flag), value, year, month}] sorted desc for the latest month
async function getFronturTopPaises(ccaaFilter = 'Total Nacional', n = 10) {
  const rows = await _loadFronturCSV();

  const isTotal = /total|nacional/i.test(ccaaFilter);
  const subset  = rows.filter(r =>
    isTotal ? /total|nacional/i.test(r.ccaa) : r.ccaa.toLowerCase() === ccaaFilter.toLowerCase()
  );
  if (!subset.length) return [];

  const latest = subset.reduce((b, r) =>
    r.year > b.year || (r.year === b.year && r.month > b.month) ? r : b, subset[0]);
  const { year, month } = latest;

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
  const seen = new Set(rows.map(r => r.ccaa).filter(c => !/total|nacional/i.test(c)));
  return ['Total Nacional', ...[...seen].sort((a, b) => a.localeCompare(b, 'es'))];
}
