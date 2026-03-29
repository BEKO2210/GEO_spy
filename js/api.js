/* ============================================================
   GEO Spy – API Layer
   All external API calls, with caching, retry & fallbacks
   ============================================================ */

const GeoAPI = (() => {
  'use strict';

  const cache = new Map();
  const CACHE_TTL = 60_000; // 1 minute
  const apiStatus = {};

  function updateStatus(name, status, latency) {
    apiStatus[name] = { status, latency, time: Date.now() };
    document.dispatchEvent(new CustomEvent('api-status', { detail: apiStatus }));
  }

  async function fetchJSON(url, name, options = {}) {
    const cacheKey = url;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < (options.ttl || CACHE_TTL)) {
      updateStatus(name, 'ok', 0);
      return cached.data;
    }

    const start = performance.now();
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), options.timeout || 8000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const latency = Math.round(performance.now() - start);

      cache.set(cacheKey, { data, time: Date.now() });
      updateStatus(name, 'ok', latency);
      return data;
    } catch (err) {
      updateStatus(name, 'error', Math.round(performance.now() - start));
      throw err;
    }
  }

  // --- IP Geolocation (multiple fallbacks) ---

  async function getIPLocation() {
    // Try ipapi.co first
    try {
      const data = await fetchJSON('https://ipapi.co/json/', 'ipapi.co');
      return {
        ip: data.ip,
        lat: data.latitude,
        lon: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
        countryCode: data.country_code,
        isp: data.org,
        asn: data.asn,
        timezone: data.timezone,
        source: 'ipapi.co'
      };
    } catch { /* fallback */ }

    // Fallback: ipwho.is
    try {
      const data = await fetchJSON('https://ipwho.is/', 'ipwho.is');
      if (data.success !== false) {
        return {
          ip: data.ip,
          lat: data.latitude,
          lon: data.longitude,
          city: data.city,
          region: data.region,
          country: data.country,
          countryCode: data.country_code,
          isp: data.connection?.org || data.connection?.isp || '',
          asn: data.connection?.asn ? `AS${data.connection.asn}` : '',
          timezone: data.timezone?.id || '',
          source: 'ipwho.is'
        };
      }
    } catch { /* fallback */ }

    // Fallback: geojs.io
    try {
      const data = await fetchJSON('https://get.geojs.io/v1/ip/geo.json', 'geojs.io');
      return {
        ip: data.ip,
        lat: parseFloat(data.latitude),
        lon: parseFloat(data.longitude),
        city: data.city,
        region: data.region,
        country: data.country,
        countryCode: data.country_code,
        isp: data.organization_name || '',
        asn: data.asn ? `AS${data.asn}` : '',
        timezone: data.timezone || '',
        source: 'geojs.io'
      };
    } catch { /* fallback */ }

    // Fallback: geoplugin.net
    const data = await fetchJSON('http://www.geoplugin.net/json.gp', 'geoplugin.net');
    return {
      ip: data.geoplugin_request,
      lat: parseFloat(data.geoplugin_latitude),
      lon: parseFloat(data.geoplugin_longitude),
      city: data.geoplugin_city,
      region: data.geoplugin_region,
      country: data.geoplugin_countryName,
      countryCode: data.geoplugin_countryCode,
      isp: '',
      asn: '',
      timezone: data.geoplugin_timezone || '',
      source: 'geoplugin.net'
    };
  }

  // --- Reverse Geocoding (Nominatim) ---

  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=de`;
    const data = await fetchJSON(url, 'Nominatim', { ttl: 300_000 });
    const a = data.address || {};
    return {
      street: [a.road, a.house_number].filter(Boolean).join(' ') || a.pedestrian || '',
      zip: a.postcode || '',
      place: a.city || a.town || a.village || a.municipality || '',
      state: a.state || '',
      country: a.country || '',
      display: data.display_name || ''
    };
  }

  // --- Elevation (Open Topo Data) ---

  async function getElevation(lat, lon) {
    try {
      const url = `https://api.opentopodata.org/v1/srtm90m?locations=${lat},${lon}`;
      const data = await fetchJSON(url, 'OpenTopoData', { ttl: 600_000 });
      if (data.results && data.results[0]) {
        return { elevation: data.results[0].elevation };
      }
    } catch { /* fallback */ }

    // Fallback: Open-Elevation
    try {
      const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
      const data = await fetchJSON(url, 'Open-Elevation', { ttl: 600_000 });
      if (data.results && data.results[0]) {
        return { elevation: data.results[0].elevation };
      }
    } catch { /* ignore */ }

    return { elevation: null };
  }

  // --- Water detection (onwater.io) ---

  async function isOnWater(lat, lon) {
    try {
      const url = `https://api.onwater.io/api/v1/results/${lat},${lon}`;
      const data = await fetchJSON(url, 'OnWater', { ttl: 600_000 });
      return { water: data.water };
    } catch {
      return { water: null };
    }
  }

  // --- Weather (Open-Meteo – free, no key) ---

  async function getWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
    const data = await fetchJSON(url, 'Open-Meteo');
    const c = data.current;
    return {
      temp: c.temperature_2m,
      tempUnit: data.current_units?.temperature_2m || '°C',
      humidity: c.relative_humidity_2m,
      windSpeed: c.wind_speed_10m,
      windUnit: data.current_units?.wind_speed_10m || 'km/h',
      weatherCode: c.weather_code,
      description: weatherCodeToText(c.weather_code)
    };
  }

  function weatherCodeToText(code) {
    const map = {
      0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bewölkt',
      45: 'Nebel', 48: 'Raureif-Nebel',
      51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen',
      61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen',
      71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall',
      77: 'Schneekörner',
      80: 'Leichte Regenschauer', 81: 'Regenschauer', 82: 'Starke Regenschauer',
      85: 'Leichte Schneeschauer', 86: 'Starke Schneeschauer',
      95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit starkem Hagel'
    };
    return map[code] || `Code ${code}`;
  }

  // --- Sunrise/Sunset (sunrise-sunset.org) ---

  async function getSunTimes(lat, lon) {
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`;
    const data = await fetchJSON(url, 'Sunrise-Sunset');
    if (data.status === 'OK') {
      const r = data.results;
      const rise = new Date(r.sunrise);
      const set = new Date(r.sunset);
      const diff = set - rise;
      const hours = Math.floor(diff / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      return {
        sunrise: rise.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        sunset: set.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        dayLength: `${hours}h ${mins}m`
      };
    }
    throw new Error('Sunrise API error');
  }

  // --- Timezone (WorldTimeAPI) ---

  async function getTimezone(lat, lon, tzName) {
    if (tzName) {
      try {
        const url = `https://worldtimeapi.org/api/timezone/${tzName}`;
        const data = await fetchJSON(url, 'WorldTimeAPI');
        return {
          timezone: data.timezone,
          datetime: data.datetime,
          utcOffset: data.utc_offset,
          localTime: new Date(data.datetime).toLocaleTimeString('de-DE')
        };
      } catch { /* fallback */ }
    }
    // Fallback: use browser timezone
    const now = new Date();
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      datetime: now.toISOString(),
      utcOffset: `${now.getTimezoneOffset() > 0 ? '-' : '+'}${String(Math.abs(Math.floor(now.getTimezoneOffset() / 60))).padStart(2, '0')}:${String(Math.abs(now.getTimezoneOffset() % 60)).padStart(2, '0')}`,
      localTime: now.toLocaleTimeString('de-DE')
    };
  }

  // --- Country Info (restcountries.com) ---

  async function getCountryInfo(countryCode) {
    if (!countryCode) return null;
    const url = `https://restcountries.com/v3.1/alpha/${countryCode}?fields=name,population,area,capital,currencies,languages,flag`;
    const data = await fetchJSON(url, 'RestCountries', { ttl: 3_600_000 });
    const currencies = data.currencies ? Object.values(data.currencies).map(c => `${c.name} (${c.symbol})`).join(', ') : '';
    const languages = data.languages ? Object.values(data.languages).join(', ') : '';
    return {
      name: data.name?.common || '',
      population: data.population || 0,
      area: data.area || 0,
      capital: data.capital?.[0] || '',
      currency: currencies,
      languages,
      flag: data.flag || ''
    };
  }

  // --- ISS Tracking (open-notify replaced with wheretheiss.at) ---

  async function getISSPosition() {
    const url = 'https://api.wheretheiss.at/v1/satellites/25544';
    const data = await fetchJSON(url, 'WhereTheISS', { ttl: 5000 });
    return {
      lat: data.latitude,
      lon: data.longitude,
      altitude: data.altitude,
      velocity: data.velocity,
      visibility: data.visibility
    };
  }

  // --- Earthquakes (USGS) ---

  async function getEarthquakes() {
    const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
    const data = await fetchJSON(url, 'USGS', { ttl: 120_000 });
    return {
      count: data.metadata?.count || 0,
      quakes: (data.features || []).map(f => ({
        mag: f.properties.mag,
        place: f.properties.place,
        time: f.properties.time,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        depth: f.geometry.coordinates[2],
        url: f.properties.url
      })).sort((a, b) => b.mag - a.mag)
    };
  }

  // --- Air Quality (Open-Meteo – free, no key) ---

  async function getAirQuality(lat, lon) {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone`;
    const data = await fetchJSON(url, 'Open-Meteo AQ');
    const c = data.current;
    return {
      aqi: c.us_aqi,
      pm25: c.pm2_5,
      pm10: c.pm10,
      co: c.carbon_monoxide,
      no2: c.nitrogen_dioxide,
      o3: c.ozone,
      level: aqiLevel(c.us_aqi)
    };
  }

  function aqiLevel(aqi) {
    if (aqi <= 50) return 'Gut';
    if (aqi <= 100) return 'Mäßig';
    if (aqi <= 150) return 'Ungesund für Empfindliche';
    if (aqi <= 200) return 'Ungesund';
    if (aqi <= 300) return 'Sehr ungesund';
    return 'Gefährlich';
  }

  // --- NASA EONET Natural Events (free, no key) ---

  async function getNaturalEvents() {
    const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=20&days=7';
    const data = await fetchJSON(url, 'NASA EONET', { ttl: 300_000 });
    return {
      count: data.events?.length || 0,
      events: (data.events || []).map(e => ({
        id: e.id,
        title: e.title,
        category: e.categories?.[0]?.title || '',
        date: e.geometry?.[0]?.date || '',
        lat: e.geometry?.[0]?.coordinates?.[1],
        lon: e.geometry?.[0]?.coordinates?.[0],
        source: e.sources?.[0]?.url || ''
      }))
    };
  }

  // --- Open-Meteo Marine API (waves, free, no key) ---

  async function getMarineData(lat, lon) {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction,wave_period,swell_wave_height&timezone=auto`;
    const data = await fetchJSON(url, 'Open-Meteo Marine');
    const c = data.current;
    return {
      waveHeight: c.wave_height,
      waveDirection: c.wave_direction,
      wavePeriod: c.wave_period,
      swellHeight: c.swell_wave_height,
      units: data.current_units || {}
    };
  }

  // --- Open-Meteo Flood API (river discharge, free, no key) ---

  async function getFloodData(lat, lon) {
    const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&forecast_days=7`;
    const data = await fetchJSON(url, 'Open-Meteo Flood', { ttl: 600_000 });
    const daily = data.daily || {};
    const discharges = daily.river_discharge || [];
    const dates = daily.time || [];
    const maxDischarge = discharges.length ? Math.max(...discharges.filter(d => d != null)) : null;
    return {
      current: discharges[0] ?? null,
      max7d: maxDischarge,
      forecast: dates.map((d, i) => ({ date: d, discharge: discharges[i] }))
    };
  }

  // --- People in Space (Open Notify, free) ---

  async function getPeopleInSpace() {
    try {
      const data = await fetchJSON('http://api.open-notify.org/astros.json', 'Open Notify Astros', { timeout: 5000 });
      if (data.message === 'success') {
        return {
          count: data.number,
          people: data.people || []
        };
      }
    } catch { /* may fail due to HTTP-only */ }
    return { count: null, people: [] };
  }

  // --- Public interface ---
  return {
    getIPLocation,
    reverseGeocode,
    getElevation,
    isOnWater,
    getWeather,
    getSunTimes,
    getTimezone,
    getCountryInfo,
    getISSPosition,
    getEarthquakes,
    getAirQuality,
    getNaturalEvents,
    getMarineData,
    getFloodData,
    getPeopleInSpace,
    getStatus: () => ({ ...apiStatus })
  };
})();
