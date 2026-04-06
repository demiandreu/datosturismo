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

// INE Periodo field is a Spanish month name: "enero", "febrero", … "diciembre"
// (not "M01"/"M08" as assumed). Map to 1-12.
const _MESES_ES = {
  'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
  'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
  'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
};

function _parsePeriodo(p) {
  const s = String(p).trim().toLowerCase();
  if (_MESES_ES[s]) return _MESES_ES[s];
  // Numeric fallback for "M01"–"M12" format (other tables)
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// Parse and sort a series Data array into {year, month, value} objects.
// Skips entries with Secreto:true (suppressed by INE) and null Valor.
function parseSeriesData(series) {
  if (!series?.Data) return [];
  return series.Data
    .filter(d => d.Secreto !== true && d.Valor !== null && d.Valor !== undefined)
    .map(d => ({
      year:  parseInt(d.Anyo, 10),
      month: _parsePeriodo(d.Periodo),
      value: parseFloat(d.Valor),
    }))
    .filter(d => !isNaN(d.year) && d.month > 0 && !isNaN(d.value))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
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
  console.log('[INE] Puntos turísticos encontrados:', locations.length, '— primeros 10:', locations.slice(0, 10));
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

  // Log raw Data structure so Anyo/Periodo/Valor/Secreto format is visible
  if (viajerosSeries?.Data) {
    console.log('[INE] viajeros Data completo:', viajerosSeries.Data);
    console.log('[INE] viajeros primer dato (ejemplo):', viajerosSeries.Data[0]);
  }

  return {
    raw:            matching,
    viajeros:       parseSeriesData(viajerosSeries),
    pernoctaciones: parseSeriesData(pernoctSeries),
  };
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
