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

// INE Nombre format: "Indicator. Location. Qualifier."
// e.g. "Viajeros. Salou. Total."  →  "Salou"
//      "Pernoctaciones. Salou. Total." →  "Salou"
// The location is the segment between the FIRST and LAST dot-separated parts.
// Falls back to the last non-empty segment if there are only two parts.
function _extractLocation(nombre) {
  if (!nombre) return '';
  const parts = nombre.split('.').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1];   // middle segment
  if (parts.length === 2) return parts[1];  // "Indicator. Location"
  return parts[0];
}

// Parse and sort a series Data array into {year, month, value} objects
function parseSeriesData(series) {
  if (!series?.Data) return [];
  return series.Data
    .filter(d => d.Valor !== null && d.Valor !== undefined)
    .map(d => ({
      year:  parseInt(d.Anyo, 10),
      month: parseInt(String(d.Periodo).replace(/\D/g, ''), 10),
      value: parseFloat(d.Valor),
    }))
    .filter(d => !isNaN(d.year) && !isNaN(d.month) && !isNaN(d.value))
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
}

// Return sorted list of all "puntos turísticos" found in table 2082
async function getAvailableLocations() {
  const data = await _fetchTable('2082');
  const seen = new Set();
  data.forEach(s => {
    const loc = _extractLocation(s.Nombre);
    if (loc) seen.add(loc);
  });
  return [...seen].sort((a, b) => a.localeCompare(b, 'es'));
}

// Return viajeros + pernoctaciones data arrays for a given municipio name
async function getMunicipioData(municipioName) {
  const data = await _fetchTable('2082');
  const name = municipioName.toLowerCase();

  const matching = data.filter(s =>
    _extractLocation(s.Nombre).toLowerCase() === name
  );

  console.log(`[INE] Series encontradas para "${municipioName}":`, matching.map(s => s.Nombre));

  const viajerosSeries   = matching.find(s => /viajero/i.test(s.Nombre));
  const pernoctSeries    = matching.find(s => /pernoct/i.test(s.Nombre));

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
