'use strict';

// INE CSV for table 2082 — Viajeros y pernoctaciones en apartamentos turísticos
// Column format (semicolon-separated, no quotes):
//   "38001 Adeje;Viajero;Residentes en España;2026M02;1.548"
//   col 0: municipio code + name   e.g. "38001 Adeje"  (first 2 digits = province code)
//   col 1: indicator               e.g. "Viajero", "Pernoctaciones"
//   col 2: residency type          e.g. "Residentes en España", "Residentes en el Extranjero"
//   col 3: period                  e.g. "2026M02"
//   col 4: value (ES number fmt)   e.g. "1.548"  → 1548  (dot = thousands sep)

const INE_CSV_URL = 'https://www.ine.es/jaxiT3/files/t/csv_bdsc/2082.csv';

// Province code (first 2 digits of INE municipio code) → CCAA name
const PROV_TO_CCAA = {
  '01':'País Vasco',         '20':'País Vasco',         '48':'País Vasco',
  '02':'Castilla-La Mancha', '13':'Castilla-La Mancha', '16':'Castilla-La Mancha',
  '19':'Castilla-La Mancha', '45':'Castilla-La Mancha',
  '03':'Com. Valenciana',    '12':'Com. Valenciana',    '46':'Com. Valenciana',
  '04':'Andalucía',          '11':'Andalucía',          '14':'Andalucía',
  '18':'Andalucía',          '21':'Andalucía',          '23':'Andalucía',
  '29':'Andalucía',          '41':'Andalucía',
  '05':'Castilla y León',    '09':'Castilla y León',    '24':'Castilla y León',
  '34':'Castilla y León',    '37':'Castilla y León',    '40':'Castilla y León',
  '42':'Castilla y León',    '47':'Castilla y León',    '49':'Castilla y León',
  '06':'Extremadura',        '10':'Extremadura',
  '07':'Illes Balears',
  '08':'Catalunya',          '17':'Catalunya',          '25':'Catalunya', '43':'Catalunya',
  '15':'Galicia',            '27':'Galicia',            '32':'Galicia',   '36':'Galicia',
  '22':'Aragón',             '44':'Aragón',             '50':'Aragón',
  '26':'La Rioja',
  '28':'Madrid',
  '30':'R. de Murcia',
  '31':'C.F. de Navarra',
  '33':'Asturias',
  '35':'Canarias',           '38':'Canarias',
  '39':'Cantabria',
  '51':'Ceuta',
  '52':'Melilla',
};

let _csvRows = null;   // parsed rows, cached after first load

// ── CSV loader ─────────────────────────────────────────────────────────────

async function _loadCSV() {
  if (_csvRows) return _csvRows;

  const res = await fetch(INE_CSV_URL);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar el CSV del INE`);
  const text = await res.text();

  const rows = [];
  const lines = text.split('\n');

  // First line is the header — skip it
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(';');
    if (cols.length < 5) continue;

    const municipioRaw = cols[0].trim();
    const indicador    = cols[1].trim();
    const residencia   = cols[2].trim();
    const periodoRaw   = cols[3].trim();
    const valorRaw     = cols[4].trim();

    // Strip leading numeric code: "38001 Adeje" → "Adeje"
    const municipio = municipioRaw.replace(/^\d+\s+/, '').trim();
    if (!municipio) continue;

    // Parse "2026M02" → year 2026, month 2
    const m = periodoRaw.match(/^(\d{4})M(\d{2})$/);
    if (!m) continue;
    const year  = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);

    // Spanish number format: "1.548" = 1548, "1.548,3" = 1548.3
    const value = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
    if (isNaN(value) || value <= 0) continue;

    const prov = municipioRaw.match(/^(\d{2})/)?.[1] ?? '';
    rows.push({ municipio, indicador, residencia, year, month, value, prov });
  }

  _csvRows = rows;
  console.log(`[INE] CSV cargado: ${rows.length} filas válidas`);
  return rows;
}

// ── Public API ─────────────────────────────────────────────────────────────

async function getAvailableLocations() {
  const rows = await _loadCSV();
  const seen = new Set(rows.map(r => r.municipio));
  const locations = [...seen].sort((a, b) => a.localeCompare(b, 'es'));
  console.log(`[INE] LISTA COMPLETA DE PUNTOS TURÍSTICOS (${locations.length} total):\n` + locations.join('\n'));
  return locations;
}

async function getMunicipioData(municipioName) {
  const rows  = await _loadCSV();
  const name  = municipioName.toLowerCase();
  const match = rows.filter(r => r.municipio.toLowerCase() === name);

  // Sum España + Extranjero per month to derive totals (CSV has no "Total" row)
  const sumByMonth = keyword => {
    const subset = match.filter(r => new RegExp(keyword, 'i').test(r.indicador));
    const map = {};
    for (const r of subset) {
      const key = `${r.year}-${r.month}`;
      map[key] = { year: r.year, month: r.month, value: (map[key]?.value ?? 0) + r.value };
    }
    return Object.values(map).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
  };

  const sort = arr => [...arr].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );

  const viajeros       = sumByMonth('viajero');
  const pernoctaciones = sumByMonth('pernoct');

  // Separate residency series for donut chart
  const nacionales  = sort(match.filter(r => /viajero/i.test(r.indicador) && /españa/i.test(r.residencia)));
  const extranjeros = sort(match.filter(r => /viajero/i.test(r.indicador) && /extranjero/i.test(r.residencia)));

  console.log(`[INE] "${municipioName}": viajeros=${viajeros.length} pts, pernoct=${pernoctaciones.length} pts, nac=${nacionales.length}, ext=${extranjeros.length}`);
  console.log('  primeros 5 viajeros sumados:', viajeros.slice(0, 5));
  if (viajeros.length)       console.log('  último viajeros:', viajeros[viajeros.length - 1]);
  if (pernoctaciones.length) console.log('  último pernoct:', pernoctaciones[pernoctaciones.length - 1]);

  return { viajeros, pernoctaciones, nacionales, extranjeros };
}

// Returns [{municipio, year, month, value}] for the top N municipios by
// pernoctaciones totales in the latest month available across all municipios.
async function getTop10(n = 10) {
  const rows = await _loadCSV();

  // Find the latest month present in pernoctaciones data
  const perRows = rows.filter(r => /pernoct/i.test(r.indicador));
  if (!perRows.length) return [];

  const latest = perRows.reduce((best, r) =>
    r.year > best.year || (r.year === best.year && r.month > best.month) ? r : best
  , perRows[0]);
  const { year, month } = latest;
  console.log(`[getTop10] último mes encontrado: ${year}-${String(month).padStart(2,'0')}, filas pernoct total: ${perRows.length}`);

  // Sum both residencias per municipio for that month
  const map = {};
  for (const r of perRows) {
    if (r.year !== year || r.month !== month) continue;
    map[r.municipio] = (map[r.municipio] ?? 0) + r.value;
  }

  const top = Object.entries(map)
    .map(([municipio, value]) => ({ municipio, year, month, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
  console.log('[getTop10] resultado:', top);
  return top;
}

// ── National aggregate helpers ─────────────────────────────────────────────

async function getNacionalStats() {
  const rows = await _loadCSV();
  const perRows = rows.filter(r => /pernoct/i.test(r.indicador));
  const viaRows = rows.filter(r => /viajero/i.test(r.indicador));
  if (!perRows.length) return null;

  const latest = perRows.reduce((b, r) =>
    r.year > b.year || (r.year === b.year && r.month > b.month) ? r : b, perRows[0]);
  const { year, month } = latest;

  const sumMonth = (arr, y, m) =>
    arr.filter(r => r.year === y && r.month === m).reduce((s, r) => s + r.value, 0);

  return {
    year, month,
    totalPernoct:  sumMonth(perRows, year, month),
    totalViajeros: sumMonth(viaRows, year, month),
    prevPernoct:   sumMonth(perRows, year - 1, month),
    prevViajeros:  sumMonth(viaRows, year - 1, month),
  };
}

async function getTop15ByCCAA() {
  const rows = await _loadCSV();
  const perRows = rows.filter(r => /pernoct/i.test(r.indicador));
  if (!perRows.length) return [];

  const latest = perRows.reduce((b, r) =>
    r.year > b.year || (r.year === b.year && r.month > b.month) ? r : b, perRows[0]);
  const { year, month } = latest;

  const ccaaMap = {};
  for (const r of perRows.filter(r => r.year === year && r.month === month)) {
    const ccaa = PROV_TO_CCAA[r.prov] ?? 'Otras';
    ccaaMap[ccaa] = (ccaaMap[ccaa] ?? 0) + r.value;
  }
  return Object.entries(ccaaMap)
    .map(([ccaa, value]) => ({ ccaa, value, year, month }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
}

async function getNacionalTrend(yearsFilter = ['2023', '2024', '2025']) {
  const rows = await _loadCSV();
  const map = {};
  for (const r of rows.filter(r => /pernoct/i.test(r.indicador))) {
    if (!yearsFilter.includes(String(r.year))) continue;
    const key = `${r.year}-${r.month}`;
    map[key] = { year: r.year, month: r.month, value: (map[key]?.value ?? 0) + r.value };
  }
  return Object.values(map).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month);
}

// Warm the cache on page load so the first Ver datos click is instant
async function prefetchAll() {
  await _loadCSV().catch(e => console.warn('[INE] Prefetch fallido:', e.message));
}
