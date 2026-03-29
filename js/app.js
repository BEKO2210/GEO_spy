/* ============================================================
   GEO Spy – Main Application Controller
   ============================================================ */

(function () {
  'use strict';

  // --- DOM References ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // State
  let currentLocation = null;
  let currentPanel = 'map';
  let timezoneInterval = null;

  // --- Panel Navigation ---
  function initNavigation() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        if (panel === currentPanel) return;

        $$('.nav-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        $$('.panel').forEach(p => p.classList.remove('active'));
        $(`#panel-${panel}`).classList.add('active');

        currentPanel = panel;
        document.dispatchEvent(new Event('panel-switch'));
      });
    });
  }

  // --- Toast notifications ---
  function toast(msg, type = 'info') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // --- Set card status ---
  function setCardStatus(cardId, status, text) {
    const card = $(`#${cardId}`);
    if (!card) return;
    const badge = card.querySelector('.card__status');
    if (badge) {
      badge.dataset.status = status;
      badge.textContent = text || status;
    }
  }

  // --- Update DOM value ---
  function setValue(id, value) {
    const el = $(`#${id}`);
    if (el) el.textContent = value ?? '–';
  }

  // --- Format number ---
  function formatNum(n) {
    if (n == null) return '–';
    return new Intl.NumberFormat('de-DE').format(n);
  }

  // --- Load IP Location ---
  async function loadIPLocation() {
    try {
      const data = await GeoAPI.getIPLocation();
      currentLocation = { lat: data.lat, lon: data.lon, countryCode: data.countryCode, timezone: data.timezone };

      setValue('val-ip', data.ip);
      setValue('val-country', `${data.country} (${data.countryCode})`);
      setValue('val-city', data.city);
      setValue('val-region', data.region);
      setValue('val-isp', data.isp);
      setValue('val-coords', `${data.lat?.toFixed(4)}, ${data.lon?.toFixed(4)}`);
      setValue('val-asn', data.asn);
      setValue('val-org', data.isp);
      setValue('val-connection-type', data.isVPN ? 'VPN/Proxy erkannt' : 'Direkt');

      setCardStatus('card-ip', 'ok', data.source);
      setCardStatus('card-network', 'ok', 'OK');

      // Set map position
      if (data.lat && data.lon) {
        GeoMap.setUserLocation(data.lat, data.lon, `${data.city || ''}, ${data.country || ''}`);
      }

      return data;
    } catch (err) {
      setCardStatus('card-ip', 'error', 'Fehler');
      setCardStatus('card-network', 'error', 'Fehler');
      toast('IP-Standort konnte nicht ermittelt werden', 'error');
      return null;
    }
  }

  // --- Load Reverse Geocoding ---
  async function loadGeocode(lat, lon) {
    try {
      const data = await GeoAPI.reverseGeocode(lat, lon);
      setValue('val-street', data.street || '–');
      setValue('val-zip', data.zip);
      setValue('val-place', data.place);
      setValue('val-state', data.state);
      setValue('val-geo-country', data.country);
      setCardStatus('card-geo', 'ok', 'OK');
    } catch {
      setCardStatus('card-geo', 'error', 'Fehler');
    }
  }

  // --- Load Elevation ---
  async function loadElevation(lat, lon) {
    try {
      const [elev, water] = await Promise.all([
        GeoAPI.getElevation(lat, lon),
        GeoAPI.isOnWater(lat, lon)
      ]);
      setValue('val-elevation', elev.elevation != null ? `${Math.round(elev.elevation)} m` : '–');
      setValue('val-water', water.water === true ? 'Ja (Wasser)' : water.water === false ? 'Nein (Land)' : '–');
      setCardStatus('card-elevation', 'ok', 'OK');
    } catch {
      setCardStatus('card-elevation', 'error', 'Fehler');
    }
  }

  // --- Load Weather (erweitert) ---
  async function loadWeather(lat, lon) {
    try {
      const data = await GeoAPI.getWeather(lat, lon);
      setValue('val-temp', `${data.temp}${data.tempUnit}`);
      setValue('val-feels-like', data.feelsLike != null ? `${data.feelsLike}${data.tempUnit}` : '–');
      setValue('val-wind', `${data.windSpeed} ${data.windUnit}`);
      setValue('val-wind-dir', data.windDir != null ? `${data.windDir}° (${windDirText(data.windDir)})` : '–');
      setValue('val-weather-desc', data.description);
      setValue('val-humidity', `${data.humidity}%`);
      setValue('val-precip', data.precipitation != null ? `${data.precipitation} mm` : '0 mm');
      setValue('val-pressure', data.pressure != null ? `${data.pressure} hPa` : '–');
      setValue('val-clouds', data.cloudCover != null ? `${data.cloudCover}%` : '–');
      setValue('val-uv', data.uvIndex != null ? `${data.uvIndex} (${uvLabel(data.uvIndex)})` : '–');
      setCardStatus('card-weather', 'ok', 'OK');
    } catch {
      setCardStatus('card-weather', 'error', 'Fehler');
    }
  }

  function windDirText(deg) {
    const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function uvLabel(uv) {
    if (uv <= 2) return 'Niedrig';
    if (uv <= 5) return 'Mäßig';
    if (uv <= 7) return 'Hoch';
    if (uv <= 10) return 'Sehr hoch';
    return 'Extrem';
  }

  // --- Load Sun Times ---
  async function loadSunTimes(lat, lon) {
    try {
      const data = await GeoAPI.getSunTimes(lat, lon);
      setValue('val-sunrise', data.sunrise);
      setValue('val-sunset', data.sunset);
      setValue('val-daylength', data.dayLength);
      setCardStatus('card-sun', 'ok', 'OK');
    } catch {
      setCardStatus('card-sun', 'error', 'Fehler');
    }
  }

  // --- Load Timezone ---
  async function loadTimezone(lat, lon, tzName) {
    try {
      const data = await GeoAPI.getTimezone(lat, lon, tzName);
      setValue('val-timezone', data.timezone);
      setValue('val-localtime', data.localTime);
      setValue('val-utc', data.utcOffset);
      setCardStatus('card-timezone', 'ok', 'OK');

      // Update local time every second (clear previous interval)
      if (timezoneInterval) clearInterval(timezoneInterval);
      timezoneInterval = setInterval(() => {
        try {
          const now = new Date();
          const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: data.timezone };
          setValue('val-localtime', now.toLocaleTimeString('de-DE', opts));
        } catch { /* ignore */ }
      }, 1000);
    } catch {
      setCardStatus('card-timezone', 'error', 'Fehler');
    }
  }

  // --- Load Country Info ---
  async function loadCountryInfo(countryCode) {
    try {
      const data = await GeoAPI.getCountryInfo(countryCode);
      if (!data) throw new Error('No data');
      setValue('val-population', formatNum(data.population));
      setValue('val-area', `${formatNum(data.area)} km²`);
      setValue('val-capital', data.capital);
      setValue('val-currency', data.currency);
      setValue('val-languages', data.languages);
      setValue('val-flag', data.flag);
      setCardStatus('card-country', 'ok', 'OK');
    } catch {
      setCardStatus('card-country', 'error', 'Fehler');
    }
  }

  // --- Load Air Quality ---
  async function loadAirQuality(lat, lon) {
    try {
      const data = await GeoAPI.getAirQuality(lat, lon);
      setValue('val-aqi', data.aqi != null ? data.aqi : '–');
      setValue('val-aqi-level', data.level);
      setValue('val-pm25', data.pm25 != null ? `${data.pm25} µg/m³` : '–');
      setValue('val-pm10', data.pm10 != null ? `${data.pm10} µg/m³` : '–');
      setValue('val-o3', data.o3 != null ? `${data.o3} µg/m³` : '–');
      setValue('val-no2', data.no2 != null ? `${data.no2} µg/m³` : '–');
      setCardStatus('card-air', 'ok', 'OK');
    } catch {
      setCardStatus('card-air', 'error', 'Fehler');
    }
  }

  // --- Load Natural Events (NASA EONET) ---
  async function loadNaturalEvents() {
    try {
      const data = await GeoAPI.getNaturalEvents();
      setValue('val-events-count', data.count);
      const list = $('#events-list');
      list.innerHTML = '';
      data.events.slice(0, 8).forEach(ev => {
        const li = document.createElement('li');
        li.className = 'quake-item';
        const dateStr = ev.date ? new Date(ev.date).toLocaleDateString('de-DE') : '';
        li.innerHTML = `
          <span class="quake-mag quake-mag--mid" style="font-size:.6rem;width:2.5rem;height:2.5rem">${ev.category.slice(0, 4)}</span>
          <div class="quake-details">
            <div class="quake-place">${ev.title}</div>
            <div class="quake-time">${ev.category} · ${dateStr}</div>
          </div>`;
        list.appendChild(li);
      });
      setCardStatus('card-events', 'live', `${data.count} aktiv`);
    } catch {
      setCardStatus('card-events', 'error', 'Fehler');
    }
  }

  // --- Load Marine Data ---
  async function loadMarineData(lat, lon) {
    try {
      const data = await GeoAPI.getMarineData(lat, lon);
      setValue('val-wave-height', data.waveHeight != null ? `${data.waveHeight} m` : 'N/A (Binnenland)');
      setValue('val-wave-dir', data.waveDirection != null ? `${data.waveDirection}°` : '–');
      setValue('val-wave-period', data.wavePeriod != null ? `${data.wavePeriod} s` : '–');
      setValue('val-swell', data.swellHeight != null ? `${data.swellHeight} m` : '–');
      setCardStatus('card-marine', 'ok', 'OK');
    } catch {
      setCardStatus('card-marine', 'ok', 'Binnenland');
      setValue('val-wave-height', 'N/A');
    }
  }

  // --- Load Flood Data ---
  async function loadFloodData(lat, lon) {
    try {
      const data = await GeoAPI.getFloodData(lat, lon);
      setValue('val-flood-current', data.current != null ? `${data.current.toFixed(1)} m³/s` : 'Kein Fluss');
      setValue('val-flood-max', data.max7d != null ? `${data.max7d.toFixed(1)} m³/s` : '–');
      setCardStatus('card-flood', 'ok', 'OK');
    } catch {
      setCardStatus('card-flood', 'ok', 'Keine Daten');
    }
  }

  // --- Load People in Space ---
  async function loadPeopleInSpace() {
    try {
      const data = await GeoAPI.getPeopleInSpace();
      if (data.count != null) {
        setValue('val-astro-count', data.count);
        const list = $('#astro-list');
        list.innerHTML = '';
        data.people.forEach(p => {
          const li = document.createElement('li');
          li.className = 'quake-item';
          li.innerHTML = `
            <span class="quake-mag quake-mag--low" style="font-size:.7rem">ISS</span>
            <div class="quake-details">
              <div class="quake-place">${p.name}</div>
              <div class="quake-time">${p.craft}</div>
            </div>`;
          list.appendChild(li);
        });
        setCardStatus('card-astros', 'ok', `${data.count} Personen`);
      } else {
        setCardStatus('card-astros', 'error', 'N/A');
      }
    } catch {
      setCardStatus('card-astros', 'error', 'Fehler');
    }
  }

  // --- Load Nearby POIs (Overpass/OSM) ---
  async function loadNearbyPOIs(lat, lon) {
    try {
      const pois = await GeoAPI.getNearbyPOIs(lat, lon, 500);
      const list = $('#poi-list');
      list.innerHTML = '';
      if (pois.length === 0) {
        list.innerHTML = '<li class="quake-item"><div class="quake-details"><div class="quake-place">Keine POIs in 500m gefunden</div></div></li>';
      }
      const poiIcons = { restaurant: 'Rest', cafe: 'Cafe', hospital: 'Hosp', pharmacy: 'Apot', bank: 'Bank', fuel: 'Tank', police: 'Poli', fire_station: 'Feuw' };
      pois.slice(0, 10).forEach(p => {
        const li = document.createElement('li');
        li.className = 'quake-item';
        li.innerHTML = `
          <span class="quake-mag quake-mag--low" style="font-size:.55rem">${poiIcons[p.type] || p.type.slice(0, 4)}</span>
          <div class="quake-details">
            <div class="quake-place">${p.name}</div>
            <div class="quake-time">${p.type} · ${p.distance} m</div>
          </div>`;
        list.appendChild(li);
      });
      setCardStatus('card-pois', 'ok', `${pois.length} gefunden`);
    } catch {
      setCardStatus('card-pois', 'error', 'Fehler');
    }
  }

  // --- Load Weather Alerts (NWS) ---
  async function loadWeatherAlerts(lat, lon) {
    try {
      const data = await GeoAPI.getWeatherAlerts(lat, lon);
      if (data.notUS) {
        setValue('val-alert-count', 'Nur US-Daten');
        setCardStatus('card-alerts', 'ok', 'N/A (kein US)');
        return;
      }
      setValue('val-alert-count', data.count || 'Keine');
      const list = $('#alert-list');
      list.innerHTML = '';
      data.alerts.forEach(a => {
        const li = document.createElement('li');
        li.className = 'quake-item';
        const sevClass = a.severity === 'Extreme' || a.severity === 'Severe' ? 'high' : a.severity === 'Moderate' ? 'mid' : 'low';
        li.innerHTML = `
          <span class="quake-mag quake-mag--${sevClass}" style="font-size:.5rem">${(a.severity || '').slice(0, 4)}</span>
          <div class="quake-details">
            <div class="quake-place">${a.event}</div>
            <div class="quake-time">${a.headline?.slice(0, 80) || ''}</div>
          </div>`;
        list.appendChild(li);
      });
      setCardStatus('card-alerts', data.count > 0 ? 'live' : 'ok', data.count > 0 ? `${data.count} aktiv` : 'Keine');
    } catch {
      setCardStatus('card-alerts', 'error', 'Fehler');
    }
  }

  // --- Load Tides (NOAA) ---
  async function loadTideData(lat, lon) {
    try {
      const data = await GeoAPI.getTideData(lat, lon);
      if (data.available) {
        setValue('val-high-tide', `${data.highTide.height.toFixed(2)} m (${data.highTide.time})`);
        setValue('val-low-tide', `${data.lowTide.height.toFixed(2)} m (${data.lowTide.time})`);
        setCardStatus('card-tides', 'ok', 'OK');
      } else {
        setValue('val-high-tide', 'Keine Station');
        setValue('val-low-tide', '–');
        setCardStatus('card-tides', 'ok', 'N/A');
      }
    } catch {
      setCardStatus('card-tides', 'error', 'Fehler');
    }
  }

  // --- Load Weather History ---
  async function loadWeatherHistory(lat, lon) {
    try {
      const data = await GeoAPI.getWeatherHistory(lat, lon);
      const list = $('#history-list');
      list.innerHTML = '';
      data.dates.forEach((date, i) => {
        const li = document.createElement('li');
        li.className = 'quake-item';
        const d = new Date(date);
        const dayName = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
        const tMax = data.tempMax[i];
        const tMin = data.tempMin[i];
        const rain = data.precipitation[i];
        li.innerHTML = `
          <span class="quake-mag quake-mag--low" style="font-size:.55rem;width:2.5rem;height:2.5rem">${tMax != null ? Math.round(tMax) + '°' : '–'}</span>
          <div class="quake-details">
            <div class="quake-place">${dayName}: ${tMin != null ? Math.round(tMin) : '–'}° – ${tMax != null ? Math.round(tMax) : '–'}°</div>
            <div class="quake-time">Regen: ${rain != null ? rain.toFixed(1) : '0'} mm · Wind: ${data.windMax[i] != null ? Math.round(data.windMax[i]) : '–'} km/h</div>
          </div>`;
        list.appendChild(li);
      });
      setCardStatus('card-history', 'ok', '7 Tage');
    } catch {
      setCardStatus('card-history', 'error', 'Fehler');
    }
  }

  // --- Load Earthquakes ---
  async function loadEarthquakes() {
    try {
      const data = await GeoAPI.getEarthquakes();
      setValue('val-quake-count', `${data.count} Erdbeben`);
      const strongest = data.quakes[0];
      setValue('val-quake-max', strongest && strongest.mag != null ? `M${strongest.mag.toFixed(1)} – ${strongest.place}` : '–');

      const list = $('#quake-list');
      list.innerHTML = '';
      data.quakes.slice(0, 10).forEach(q => {
        const li = document.createElement('li');
        li.className = 'quake-item';
        const magClass = q.mag >= 6 ? 'high' : q.mag >= 4.5 ? 'mid' : 'low';
        const timeAgo = getTimeAgo(q.time);
        li.innerHTML = `
          <span class="quake-mag quake-mag--${magClass}">${q.mag.toFixed(1)}</span>
          <div class="quake-details">
            <div class="quake-place">${q.place}</div>
            <div class="quake-time">${timeAgo} · Tiefe: ${q.depth?.toFixed(0)} km</div>
          </div>`;
        li.addEventListener('click', () => {
          // Switch to map and fly to earthquake
          $$('.nav-btn').forEach(b => b.classList.remove('active'));
          $$('.nav-btn')[0].classList.add('active');
          $$('.panel').forEach(p => p.classList.remove('active'));
          $('#panel-map').classList.add('active');
          currentPanel = 'map';
          document.dispatchEvent(new Event('panel-switch'));
          setTimeout(() => GeoMap.flyTo(q.lat, q.lon, 6), 200);
        });
        list.appendChild(li);
      });

      setCardStatus('card-quakes', 'live', 'LIVE');

      // Show on map if active
      if (GeoMap.isQuakesActive()) {
        GeoMap.showEarthquakes(data.quakes);
      }

      return data;
    } catch {
      setCardStatus('card-quakes', 'error', 'Fehler');
      return null;
    }
  }

  // --- API Status Panel ---
  function updateAPIStatus() {
    document.addEventListener('api-status', (e) => {
      const statuses = e.detail;
      const container = $('#api-status-list');
      if (!container) return;
      container.innerHTML = '';

      Object.entries(statuses).forEach(([name, info]) => {
        const row = document.createElement('div');
        row.className = 'api-row';
        row.innerHTML = `
          <span class="api-dot api-dot--${info.status === 'ok' ? 'ok' : 'error'}"></span>
          <span class="api-name">${name}</span>
          <span class="api-time">${info.latency}ms</span>`;
        container.appendChild(row);
      });

      const allOk = Object.values(statuses).every(s => s.status === 'ok');
      const anyError = Object.values(statuses).some(s => s.status === 'error');
      setCardStatus('card-api-status', anyError ? (allOk ? 'ok' : 'error') : 'ok',
        `${Object.values(statuses).filter(s => s.status === 'ok').length}/${Object.keys(statuses).length} OK`);
    });
  }

  // --- Map Click Handler ---
  function setupMapClick() {
    GeoMap.onMapClick(async (lat, lon) => {
      const card = $('#map-info-card');
      const content = $('#map-info-content');
      card.hidden = false;
      content.innerHTML = '<div class="skeleton" style="height:4rem"></div>';

      try {
        const [geo, elev, water, weather] = await Promise.allSettled([
          GeoAPI.reverseGeocode(lat, lon),
          GeoAPI.getElevation(lat, lon),
          GeoAPI.isOnWater(lat, lon),
          GeoAPI.getWeather(lat, lon)
        ]);

        let html = `<div style="margin-bottom:.5rem"><strong>${lat.toFixed(4)}, ${lon.toFixed(4)}</strong></div>`;

        if (geo.status === 'fulfilled') {
          html += `<div class="data-row"><span class="data-label">Adresse</span><span class="data-value">${geo.value.display || '–'}</span></div>`;
        }
        if (elev.status === 'fulfilled' && elev.value.elevation != null) {
          html += `<div class="data-row"><span class="data-label">Höhe</span><span class="data-value">${Math.round(elev.value.elevation)} m</span></div>`;
        }
        if (water.status === 'fulfilled' && water.value.water !== null) {
          html += `<div class="data-row"><span class="data-label">Wasser</span><span class="data-value">${water.value.water ? 'Ja' : 'Nein'}</span></div>`;
        }
        if (weather.status === 'fulfilled') {
          const w = weather.value;
          html += `<div class="data-row"><span class="data-label">Wetter</span><span class="data-value">${w.temp}${w.tempUnit} – ${w.description}</span></div>`;
        }

        content.innerHTML = html;
      } catch {
        content.innerHTML = '<span style="color:var(--danger)">Fehler beim Laden</span>';
      }
    });

    // Close button
    const closeBtn = $('.map-info-card__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        $('#map-info-card').hidden = true;
      });
    }
  }

  // --- Map Control Buttons ---
  function setupMapControls() {
    // Locate button
    $('#btn-locate')?.addEventListener('click', () => {
      if (currentLocation) {
        // Switch to map if not there
        if (currentPanel !== 'map') {
          $$('.nav-btn').forEach(b => b.classList.remove('active'));
          $$('.nav-btn')[0].classList.add('active');
          $$('.panel').forEach(p => p.classList.remove('active'));
          $('#panel-map').classList.add('active');
          currentPanel = 'map';
          document.dispatchEvent(new Event('panel-switch'));
        }
        GeoMap.flyToUser();
      } else {
        toast('Standort wird noch ermittelt...', 'info');
      }
    });

    // ISS button
    $('#btn-iss')?.addEventListener('click', async () => {
      const btn = $('#btn-iss');
      const active = await GeoMap.toggleISS((pos) => {
        setValue('val-iss-lat', pos.lat?.toFixed(4));
        setValue('val-iss-lon', pos.lon?.toFixed(4));
        setValue('val-iss-time', new Date().toLocaleTimeString('de-DE'));
      });
      btn.classList.toggle('active', active);
      toast(active ? 'ISS-Tracking aktiviert' : 'ISS-Tracking deaktiviert', 'success');
    });

    // Earthquakes button
    $('#btn-quakes')?.addEventListener('click', async () => {
      const btn = $('#btn-quakes');
      const shouldShow = GeoMap.toggleEarthquakes();

      if (shouldShow) {
        try {
          const data = await GeoAPI.getEarthquakes();
          if (data) GeoMap.showEarthquakes(data.quakes);
        } catch {
          GeoMap.clearEarthquakes();
          btn.classList.remove('active');
          toast('Erdbeben konnten nicht geladen werden', 'error');
          return;
        }
      } else {
        GeoMap.clearEarthquakes();
      }

      btn.classList.toggle('active', shouldShow);
      toast(shouldShow ? 'Erdbeben-Overlay aktiviert' : 'Erdbeben-Overlay deaktiviert', 'success');
    });

    // Layers button
    $('#btn-layers')?.addEventListener('click', () => {
      const name = GeoMap.switchLayer();
      toast(`Karte: ${name}`, 'success');
    });
  }

  // --- City Search (Open-Meteo Geocoding) ---
  function setupCitySearch() {
    const input = $('#search-input');
    const results = $('#search-results');
    if (!input || !results) return;

    let debounceTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) { results.hidden = true; return; }

      debounceTimer = setTimeout(async () => {
        try {
          const cities = await GeoAPI.searchCity(q);
          results.innerHTML = '';
          if (cities.length === 0) {
            results.innerHTML = '<li class="search-item">Keine Ergebnisse</li>';
          } else {
            cities.forEach(c => {
              const li = document.createElement('li');
              li.className = 'search-item';
              li.textContent = `${c.name}, ${c.admin1 ? c.admin1 + ', ' : ''}${c.country}`;
              li.addEventListener('click', () => {
                input.value = li.textContent;
                results.hidden = true;
                GeoMap.setUserLocation(c.lat, c.lon, li.textContent);
                currentLocation = { lat: c.lat, lon: c.lon, countryCode: c.countryCode, timezone: c.timezone };
                // Reload all data for new location
                reloadAllData(c.lat, c.lon, c.countryCode, c.timezone);
                toast(`Standort: ${c.name}`, 'success');
              });
              results.appendChild(li);
            });
          }
          results.hidden = false;
        } catch { results.hidden = true; }
      }, 350);
    });

    // Close results on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-bar')) results.hidden = true;
    });
  }

  // --- Reload all data for a given location ---
  async function reloadAllData(lat, lon, countryCode, timezone) {
    await Promise.allSettled([
      loadGeocode(lat, lon),
      loadElevation(lat, lon),
      loadWeather(lat, lon),
      loadSunTimes(lat, lon),
      loadTimezone(lat, lon, timezone),
      loadCountryInfo(countryCode),
      loadAirQuality(lat, lon),
      loadMarineData(lat, lon),
      loadFloodData(lat, lon),
      loadNearbyPOIs(lat, lon),
      loadWeatherAlerts(lat, lon),
      loadTideData(lat, lon),
      loadWeatherHistory(lat, lon)
    ]);
  }

  // --- Utility ---
  function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    return `vor ${Math.floor(hours / 24)} Tagen`;
  }

  // --- Initialize ---
  async function init() {
    // Wait for Leaflet to load
    await new Promise(resolve => {
      if (typeof L !== 'undefined') return resolve();
      const check = setInterval(() => {
        if (typeof L !== 'undefined') { clearInterval(check); resolve(); }
      }, 50);
      // Timeout after 10s
      setTimeout(() => { clearInterval(check); resolve(); }, 10000);
    });

    initNavigation();
    updateAPIStatus();
    GeoMap.init();
    setupMapClick();
    setupMapControls();
    setupCitySearch();

    // Load IP location first (needed for other API calls)
    const ipData = await loadIPLocation();

    if (ipData && ipData.lat && ipData.lon) {
      const { lat, lon } = ipData;

      // Load all dependent data in parallel
      await Promise.allSettled([
        loadGeocode(lat, lon),
        loadElevation(lat, lon),
        loadWeather(lat, lon),
        loadSunTimes(lat, lon),
        loadTimezone(lat, lon, ipData.timezone),
        loadCountryInfo(ipData.countryCode),
        loadEarthquakes(),
        loadAirQuality(lat, lon),
        loadNaturalEvents(),
        loadMarineData(lat, lon),
        loadFloodData(lat, lon),
        loadPeopleInSpace(),
        loadNearbyPOIs(lat, lon),
        loadWeatherAlerts(lat, lon),
        loadTideData(lat, lon),
        loadWeatherHistory(lat, lon)
      ]);
    } else {
      // Still try to load non-location-dependent data
      await Promise.allSettled([
        loadEarthquakes(),
        loadNaturalEvents(),
        loadPeopleInSpace()
      ]);
    }

    // Auto-refresh earthquakes every 2 minutes
    setInterval(loadEarthquakes, 120_000);

    // Try browser geolocation for better accuracy
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          currentLocation = { ...currentLocation, lat, lon };
          GeoMap.setUserLocation(lat, lon, 'Genauer Standort (GPS)');
          toast('GPS-Standort aktualisiert', 'success');

          // Reload with better coordinates
          await reloadAllData(lat, lon, currentLocation?.countryCode, currentLocation?.timezone);
        },
        () => { /* User denied geolocation, IP location is fine */ },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch { /* optional */ }
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
