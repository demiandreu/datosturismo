'use strict';

const INE_BASE_URL = 'https://servicios.ine.es/wstempus/js/es';
const _cache = {};

async function _fetchTable(tableId) {
  if (_cache[tableId]) return _cache[tableId];
  const url = `${INE_BASE_URL}/DATOS_TABLA/${tableId}?tip=AM&nult=24`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} al consultar tabla ${tableId} del INE`);
  const data = await res.json();
  _cache[tableId] = data;
  return data;
}

// INE Nombre format: "Location. Indicator. Qualifier."
// e.g. "Salou. Viajeros. Total."        →  "Salou"
//      "Cambrils. Pernoctaciones. Total." →  "Cambrils"
// The location is always the FIRST dot-separated segment.
function _extractLocation(nombre) {
  if (!nombre) return '';
  const parts = nombre.split('.').map(p => p.trim()).filter(Boolean);
  return parts[0] || '';
}

// Real INE Data entry format:
// { Fecha: '2026-02-01T00:00:00.000+01:00', T3_TipoDato: 'Provisional',
//   T3_Periodo: 'M02', Anyo: 2026, Valor: null }
// Month comes from T3_Periodo ('M01'–'M12'). Valor can be null for unpublished months.

// Parse and sort a series Data array into {year, month, value} objects.
// Skips entries where Valor is null or 0.
function parseSeriesData(series) {
  if (!series?.Data) return [];
  const parsed = series.Data
    .filter(d => d.Valor !== null && d.Valor !== undefined && d.Valor > 0)
    .map(d => ({
      year:  parseInt(d.Anyo, 10),
      month: parseInt(String(d.T3_Periodo).replace('M', ''), 10),
      value: parseFloat(d.Valor),
    }))
    .filter(d => !isNaN(d.year) && d.month > 0 && !isNaN(d.value))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  return parsed;
}

// Return sorted list of all "puntos turísticos" found in table 2082
async function getAvailableLocations() {
  const data = await _fetchTable('2082');

  // Diagnostic: log first 10 raw Nombre values so the format is visible in console
  console.log('[INE] Primeros 10 Nombre de tabla 2082:',
    data.slice(0, 10).map(s => s.Nombre));
  console.log('[INE] Ejemplo de extracción (primeros 5):',
    data.slice(0, 5).map(s => ({ Nombre: s.Nombre, extraído: _extractLocation(s.Nombre) })));

  const seen = new Set();
  data.forEach(s => {
    const loc = _extractLocation(s.Nombre);
    if (loc) seen.add(loc);
  });
  const locations = [...seen].sort((a, b) => a.localeCompare(b, 'es'));
  console.log(`[INE] LISTA COMPLETA DE PUNTOS TURÍSTICOS (${locations.length} total):\n` + locations.join('\n'));
  return locations;
}

// Return viajeros + pernoctaciones data arrays for a given municipio name
async function getMunicipioData(municipioName) {
  const data = await _fetchTable('2082');
  const name = municipioName.toLowerCase();

  const matching = data.filter(s =>
    _extractLocation(s.Nombre).toLowerCase() === name
  );

  const viajerosSeries = matching.find(s => /viajero/i.test(s.Nombre));
  const pernoctSeries  = matching.find(s => /pernoct/i.test(s.Nombre));

  console.log(`[INE] getMunicipioData("${municipioName}") — ${matching.length} series encontradas:`);
  console.log('  Nombres:', matching.map(s => s.Nombre));
  console.log('  viajeros →', viajerosSeries?.Nombre ?? 'NO ENCONTRADA');
  console.log('  pernoct  →', pernoctSeries?.Nombre  ?? 'NO ENCONTRADA');

  const viajeros       = parseSeriesData(viajerosSeries);
  const pernoctaciones = parseSeriesData(pernoctSeries);

  console.log('[INE] viajeros parseado:', viajeros);
  console.log('[INE] pernoctaciones parseado:', pernoctaciones);

  return { raw: matching, viajeros, pernoctaciones };
}

// Return grado de ocupación data for a province from table 2072
async function getOcupacionData(provinciaName) {
  try {
    const data = await _fetchTable('2072');
    const prov = provinciaName.toLowerCase();
    const matching = data.filter(s =>
      s.Nombre && s.Nombre.toLowerCase().includes(prov)
    );
    // Prefer a series explicitly about "ocupación por plazas" or similar
    const series = matching.find(s => /ocupaci/i.test(s.Nombre)) || matching[0];
    console.log(`[INE] Ocupación para "${provinciaName}":`, series?.Nombre ?? 'no encontrado');
    return parseSeriesData(series);
  } catch (e) {
    console.warn('[INE] Ocupación no disponible:', e.message);
    return [];
  }
}

// Warm both caches on page load so later calls are instant
async function prefetchAll() {
  await Promise.allSettled([_fetchTable('2082'), _fetchTable('2072')]);
}
