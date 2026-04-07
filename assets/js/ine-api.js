'use strict';

// INE CSV for table 2082 — Viajeros y pernoctaciones en apartamentos turísticos
// Column format (semicolon-separated, no quotes):
//   "38001 Adeje;Viajero;Residentes en España;2026M02;1.548"
//   col 0: municipio code + name   e.g. "38001 Adeje"
//   col 1: indicator               e.g. "Viajero", "Pernoctaciones"
//   col 2: residency type          e.g. "Residentes en España", "Residentes en el Extranjero"
//   col 3: period                  e.g. "2026M02"
//   col 4: value (ES number fmt)   e.g. "1.548"  → 1548  (dot = thousands sep)

const INE_CSV_URL = 'https://www.ine.es/jaxiT3/files/t/csv_bdsc/2082.csv';

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

    rows.push({ municipio, indicador, residencia, year, month, value });
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

// Warm the cache on page load so the first Ver datos click is instant
async function prefetchAll() {
  await _loadCSV().catch(e => console.warn('[INE] Prefetch fallido:', e.message));
}
