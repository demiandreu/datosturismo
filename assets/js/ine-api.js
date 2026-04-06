const INE_BASE_URL = 'https://servicios.ine.es/wstempus/js/es';

async function fetchTouristApartmentData() {
  const url = `${INE_BASE_URL}/DATOS_TABLA/2082?tip=AM&nult=24`;

  console.log('[INE API] Fetching:', url);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();

    console.log('[INE API] Raw response (full):', data);
    console.log('[INE API] Total series returned:', data.length);

    if (data.length > 0) {
      console.log('[INE API] Example entry (first item):', data[0]);
      console.log('[INE API] Example entry keys:', Object.keys(data[0]));

      if (data[0].Data) {
        console.log('[INE API] Example Data array (first 3):', data[0].Data.slice(0, 3));
        console.log('[INE API] Data entry keys:', Object.keys(data[0].Data[0]));
      }
    }

    const salouSeries = data.filter(series => {
      const name = series.Nombre || series.nombre || '';
      return name.toLowerCase().includes('salou');
    });

    console.log('[INE API] Salou series found:', salouSeries.length);
    console.log('[INE API] Salou series detail:', salouSeries);

    return { all: data, salou: salouSeries };

  } catch (err) {
    console.error('[INE API] Fetch failed:', err);
    return null;
  }
}

fetchTouristApartmentData();
