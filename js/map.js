/* ============================================================
   GEO Spy – Map Module (Leaflet)
   ============================================================ */

const GeoMap = (() => {
  'use strict';

  let map = null;
  let userMarker = null;
  let issMarker = null;
  let issPath = [];
  let issPolyline = null;
  let quakeLayer = null;
  let issInterval = null;
  let issActive = false;
  let quakesActive = false;
  let currentLayerIndex = 0;
  let currentTileLayer = null;

  const tileLayers = [
    {
      name: 'Dark',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd'
    },
    {
      name: 'Straße',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: 'abc'
    },
    {
      name: 'Satellit',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &copy; Earthstar Geographics',
      subdomains: ''
    },
    {
      name: 'Topographie',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      subdomains: 'abc'
    }
  ];

  // Custom icons
  function createIcon(emoji, size = 32) {
    return L.divIcon({
      html: `<span style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">${emoji}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      className: 'geo-marker'
    });
  }

  function init() {
    map = L.map('map', {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true
    });

    // Default tile layer (Dark)
    const layer = tileLayers[0];
    currentTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      subdomains: layer.subdomains || 'abc',
      maxZoom: 19
    }).addTo(map);

    quakeLayer = L.layerGroup().addTo(map);

    // Fix tile loading after panel switch
    document.addEventListener('panel-switch', () => {
      setTimeout(() => map?.invalidateSize(), 100);
    });

    return map;
  }

  function setUserLocation(lat, lon, label) {
    if (!map) return;
    if (userMarker) {
      userMarker.setLatLng([lat, lon]);
    } else {
      userMarker = L.marker([lat, lon], { icon: createIcon('📍', 36) })
        .addTo(map);
    }
    userMarker.bindPopup(`<strong>${label || 'Dein Standort'}</strong><br>Lat: ${lat.toFixed(4)}<br>Lon: ${lon.toFixed(4)}`);
    map.setView([lat, lon], 12, { animate: true });
  }

  function flyToUser() {
    if (userMarker) {
      const ll = userMarker.getLatLng();
      map.flyTo(ll, 14, { duration: 1.5 });
      userMarker.openPopup();
    }
  }

  // --- ISS Tracking ---

  async function toggleISS(callback) {
    issActive = !issActive;

    if (!issActive) {
      if (issInterval) clearInterval(issInterval);
      if (issMarker) { map.removeLayer(issMarker); issMarker = null; }
      if (issPolyline) { map.removeLayer(issPolyline); issPolyline = null; }
      issPath = [];
      return false;
    }

    async function updateISS() {
      try {
        const pos = await GeoAPI.getISSPosition();
        const ll = [pos.lat, pos.lon];

        if (issMarker) {
          issMarker.setLatLng(ll);
        } else {
          issMarker = L.marker(ll, { icon: createIcon('🛰️', 36) }).addTo(map);
        }

        issMarker.bindPopup(
          `<strong>ISS</strong><br>Lat: ${pos.lat.toFixed(3)}<br>Lon: ${pos.lon.toFixed(3)}<br>Höhe: ${pos.altitude?.toFixed(1)} km<br>Sichtbarkeit: ${pos.visibility}`
        );

        issPath.push(ll);
        if (issPath.length > 200) issPath.shift();

        if (issPolyline) {
          issPolyline.setLatLngs(issPath);
        } else {
          issPolyline = L.polyline(issPath, {
            color: '#3b82f6',
            weight: 2,
            opacity: 0.6,
            dashArray: '8 4'
          }).addTo(map);
        }

        if (callback) callback(pos);
      } catch { /* silent */ }
    }

    await updateISS();
    map.flyTo(issMarker.getLatLng(), 3, { duration: 1.5 });
    issInterval = setInterval(updateISS, 5000);
    return true;
  }

  // --- Earthquake Markers ---

  function showEarthquakes(quakes) {
    quakeLayer.clearLayers();
    quakesActive = true;

    quakes.forEach(q => {
      const mag = q.mag;
      const radius = Math.max(mag * 4, 6);
      const color = mag >= 6 ? '#ef4444' : mag >= 4.5 ? '#f59e0b' : '#22c55e';

      const circle = L.circleMarker([q.lat, q.lon], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.35,
        weight: 1.5
      }).addTo(quakeLayer);

      const timeAgo = getTimeAgo(q.time);
      circle.bindPopup(
        `<strong>M${mag.toFixed(1)}</strong><br>${q.place}<br>Tiefe: ${q.depth?.toFixed(1)} km<br>${timeAgo}`
      );
    });
  }

  function clearEarthquakes() {
    quakeLayer.clearLayers();
    quakesActive = false;
  }

  function toggleEarthquakes() {
    quakesActive = !quakesActive;
    return quakesActive;
  }

  function isISSActive() { return issActive; }
  function isQuakesActive() { return quakesActive; }

  function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    return `vor ${Math.floor(hours / 24)} Tagen`;
  }

  // --- Layer Switching ---
  function switchLayer() {
    currentLayerIndex = (currentLayerIndex + 1) % tileLayers.length;
    const layer = tileLayers[currentLayerIndex];

    if (currentTileLayer) map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      subdomains: layer.subdomains || 'abc',
      maxZoom: 19
    }).addTo(map);

    return layer.name;
  }

  // Click on map to get info
  function onMapClick(callback) {
    if (!map) return;
    map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      callback(lat, lng);
    });
  }

  return {
    init,
    setUserLocation,
    flyToUser,
    toggleISS,
    showEarthquakes,
    clearEarthquakes,
    toggleEarthquakes,
    isISSActive,
    isQuakesActive,
    onMapClick,
    switchLayer
  };
})();
