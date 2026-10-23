// Radar map built from map tiles so it can be styled to match the rest of the emulator.
// Satellite imagery (Esri) with borders and places on top, NEXRAD radar mosaic frames
// from the Iowa Environmental Mesonet animated over the last 2 hours, and active NWS
// watches, warnings and advisories. None of these need a key.

const RADAR_WIDTH = 1235;
const RADAR_HEIGHT = 525;
const RADAR_ZOOM = 8;
const ZOOMED_RADAR_ZOOM = 9;
const RADAR_FRAME_COUNT = 13; // 2 hours of frames
const RADAR_FRAME_MINUTES = 10;
const RADAR_FRAME_DURATION = 400;
const RADAR_LAST_FRAME_DURATION = 1600;

const IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const PLACES_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const RADAR_TILES = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-{time}/{z}/{x}/{y}.png';
const RADAR_LATEST = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json';

function fetchRadarImages(){
  fetch(RADAR_LATEST)
    .then((response) => response.json())
    .then((data) => new Date(data.meta.valid))
    .catch(function(err) {
      console.warn("Radar time error, radar will not be shown", err);
      return null;
    })
    .then(function(latest) {
      let times = [];
      if (latest) {
        for (let i = RADAR_FRAME_COUNT - 1; i >= 0; i--) {
          times.push(new Date(latest.getTime() - i * RADAR_FRAME_MINUTES * 60 * 1000));
        }
      }
      radarImage = buildRadarMap(RADAR_ZOOM, times);
      if(alertsActive){
        zoomedRadarImage = buildRadarMap(ZOOMED_RADAR_ZOOM, times);
      }
      // Alert shapes can take a few seconds to load, so draw them when they arrive
      // instead of holding up the timeline. The radar page isn't shown right away.
      fetchAlertShapes(radarBounds(RADAR_ZOOM)).then(function(shapes) {
        [radarImage, zoomedRadarImage].forEach((map) => map && drawAlerts(map, shapes));
      });
      scheduleTimeline();
    });
}

// Pixel position of a point in the world at this zoom (web mercator)
function worldPixel(lon, lat, zoom){
  let worldSize = 256 * Math.pow(2, zoom);
  let latRad = lat * Math.PI / 180;
  return [
    (lon + 180) / 360 * worldSize,
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * worldSize
  ];
}

// Top left world pixel of the map centered on the location
function radarOrigin(zoom){
  let [centerX, centerY] = worldPixel(longitude, latitude, zoom);
  return [Math.round(centerX - RADAR_WIDTH / 2), Math.round(centerY - RADAR_HEIGHT / 2)];
}

// [west, south, east, north] of the map in degrees
function radarBounds(zoom){
  let [left, top] = radarOrigin(zoom);
  let worldSize = 256 * Math.pow(2, zoom);
  let lon = (x) => x / worldSize * 360 - 180;
  let lat = (y) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / worldSize))) * 180 / Math.PI;
  return [lon(left), lat(top + RADAR_HEIGHT), lon(left + RADAR_WIDTH), lat(top)];
}

function buildRadarMap(zoom, times){
  let map = document.createElement('div');
  map.className = 'radar-map';

  let [left, top] = radarOrigin(zoom);
  map.project = function(lon, lat) {
    let [x, y] = worldPixel(lon, lat, zoom);
    return [x - left, y - top];
  };

  let tileLayer = function(className, url) {
    let layer = document.createElement('div');
    layer.className = 'radar-layer ' + className;
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + RADAR_WIDTH - 1) / 256); tx++) {
      for (let ty = Math.floor(top / 256); ty <= Math.floor((top + RADAR_HEIGHT - 1) / 256); ty++) {
        let tile = new Image();
        tile.className = 'radar-tile';
        tile.style.left = (tx * 256 - left) + 'px';
        tile.style.top = (ty * 256 - top) + 'px';
        // Hide tiles that fail to load instead of showing a broken image
        tile.onerror = () => tile.style.visibility = 'hidden';
        tile.src = url.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
        layer.appendChild(tile);
      }
    }
    map.appendChild(layer);
    return layer;
  };

  tileLayer('radar-imagery', IMAGERY_TILES);
  let frames = times.map((time) => tileLayer('radar-frame', RADAR_TILES.replace('{time}', radarTimeString(time))));

  // Filled in by drawAlerts. Above the radar but below the place names.
  map.alertLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  map.alertLayer.setAttribute('class', 'radar-layer radar-alerts');
  map.alertLayer.setAttribute('width', RADAR_WIDTH);
  map.alertLayer.setAttribute('height', RADAR_HEIGHT);
  map.appendChild(map.alertLayer);

  tileLayer('radar-places', PLACES_TILES);

  map.alertLegend = document.createElement('div');
  map.alertLegend.className = 'radar-legend regular-text';
  map.alertLegend.style.display = 'none';
  map.appendChild(map.alertLegend);

  let timeLabel = document.createElement('div');
  timeLabel.className = 'radar-time regular-text';
  map.appendChild(timeLabel);

  let attribution = document.createElement('div');
  attribution.className = 'radar-attribution';
  attribution.innerHTML = 'Radar: Iowa Environmental Mesonet &middot; Imagery: Esri';
  map.appendChild(attribution);

  let showFrame = function(index) {
    frames.forEach((frame, i) => frame.style.visibility = i == index ? 'visible' : 'hidden');
    timeLabel.innerHTML = formatRadarTime(times[index]);
  };

  // Called when the radar page is shown
  map.start = function() {
    if (frames.length == 0) {
      timeLabel.style.display = 'none';
      return;
    }
    let index = 0;
    let next = function() {
      showFrame(index);
      let last = index == frames.length - 1;
      index = last ? 0 : index + 1;
      map.timer = setTimeout(next, last ? RADAR_LAST_FRAME_DURATION : RADAR_FRAME_DURATION);
    };
    clearTimeout(map.timer);
    next();
  };

  return map;
}

// Mosaic frames are named by UTC time, e.g. 202610232210
function radarTimeString(time){
  let pad = (n) => String(n).padStart(2, '0');
  return `${time.getUTCFullYear()}${pad(time.getUTCMonth() + 1)}${pad(time.getUTCDate())}${pad(time.getUTCHours())}${pad(time.getUTCMinutes())}`;
}

function formatRadarTime(time){
  let hours = time.getHours();
  let minutes = String(time.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

// Active NWS watches, warnings and advisories drawn on the radar map.
// Alerts are requested only for the states the map covers. Storm based alerts include their
// polygon, others list the zones they affect, whose shapes the browser caches for weeks.

const ALERT_MAX_ZONES = 150;
const ALERT_MAX_LEGEND = 4;

// Approximate [west, south, east, north] of each state, used to pick which states' alerts to request
const STATE_BOUNDS = {
  AK: [-180.0, 51.2, -129.9, 71.5], AL: [-88.5, 30.2, -84.9, 35.0], AR: [-94.6, 33.0, -89.7, 36.5],
  AZ: [-114.8, 31.3, -109.0, 37.0], CA: [-124.4, 32.5, -114.1, 42.0], CO: [-109.1, 37.0, -102.0, 41.0],
  CT: [-73.7, 41.0, -71.8, 42.1], DC: [-77.1, 38.8, -76.9, 39.0], DE: [-75.8, 38.5, -75.0, 39.8],
  FL: [-87.6, 25.1, -80.0, 31.0], GA: [-85.6, 30.4, -80.9, 35.0], HI: [-159.8, 18.9, -154.8, 22.2],
  IA: [-96.6, 40.4, -90.1, 43.5], ID: [-117.2, 42.0, -111.0, 49.0], IL: [-91.5, 37.0, -87.5, 42.5],
  IN: [-88.1, 37.8, -84.8, 41.8], KS: [-102.1, 37.0, -94.6, 40.0], KY: [-89.4, 36.5, -82.0, 39.1],
  LA: [-94.0, 29.0, -89.0, 33.0], MA: [-73.5, 41.5, -69.9, 42.9], MD: [-79.5, 37.9, -75.0, 39.7],
  ME: [-71.1, 43.1, -67.0, 47.5], MI: [-90.4, 41.7, -82.4, 48.2], MN: [-97.2, 43.5, -89.6, 49.4],
  MO: [-95.8, 36.0, -89.1, 40.6], MS: [-91.6, 30.2, -88.1, 35.0], MT: [-116.0, 44.4, -104.0, 49.0],
  NC: [-84.3, 33.8, -75.7, 36.6], ND: [-104.0, 45.9, -96.6, 49.0], NE: [-104.1, 40.0, -95.3, 43.0],
  NH: [-72.5, 42.7, -70.7, 45.3], NJ: [-75.6, 39.0, -73.9, 41.4], NM: [-109.0, 31.3, -103.0, 37.0],
  NV: [-120.0, 35.0, -114.0, 42.0], NY: [-79.8, 40.5, -72.1, 45.0], OH: [-84.8, 38.4, -80.5, 42.0],
  OK: [-103.0, 33.6, -94.4, 37.0], OR: [-124.6, 42.0, -116.5, 46.3], PA: [-80.5, 39.7, -74.7, 42.3],
  PR: [-67.3, 17.9, -65.6, 18.5], RI: [-71.9, 41.3, -71.1, 42.0], SC: [-83.3, 32.0, -78.5, 35.2],
  SD: [-104.1, 42.5, -96.4, 45.9], TN: [-90.3, 35.0, -81.7, 36.7], TX: [-106.6, 25.9, -93.5, 36.5],
  UT: [-114.0, 37.0, -109.0, 42.0], VA: [-83.7, 36.5, -75.2, 39.5], VT: [-73.4, 42.7, -71.5, 45.0],
  WA: [-124.7, 45.5, -116.9, 49.0], WI: [-92.9, 42.5, -87.0, 47.0], WV: [-82.6, 37.2, -77.7, 40.6],
  WY: [-111.1, 41.0, -104.1, 45.0],
};

// Official NWS hazard map colors (https://www.weather.gov/help-map)
const ALERT_COLORS = {
  'Tornado Warning': '#FF0000',
  'Tornado Watch': '#FFFF00',
  'Severe Thunderstorm Warning': '#FFA500',
  'Severe Thunderstorm Watch': '#DB7093',
  'Flash Flood Warning': '#8B0000',
  'Flash Flood Watch': '#2E8B57',
  'Flood Warning': '#00FF00',
  'Flood Watch': '#2E8B57',
  'Flood Advisory': '#00FF7F',
  'Coastal Flood Warning': '#228B22',
  'Coastal Flood Watch': '#66CDAA',
  'Coastal Flood Advisory': '#7CFC00',
  'Blizzard Warning': '#FF4500',
  'Winter Storm Warning': '#FF69B4',
  'Winter Storm Watch': '#4682B4',
  'Winter Weather Advisory': '#7B68EE',
  'Ice Storm Warning': '#8B008B',
  'Lake Effect Snow Warning': '#008B8B',
  'High Wind Warning': '#DAA520',
  'High Wind Watch': '#B8860B',
  'Wind Advisory': '#D2B48C',
  'Extreme Cold Warning': '#0000FF',
  'Extreme Cold Watch': '#5F9EA0',
  'Cold Weather Advisory': '#AFEEEE',
  'Freeze Warning': '#483D8B',
  'Freeze Watch': '#00FFFF',
  'Frost Advisory': '#6495ED',
  'Extreme Heat Warning': '#C71585',
  'Extreme Heat Watch': '#800000',
  'Heat Advisory': '#FF7F50',
  'Red Flag Warning': '#FF1493',
  'Fire Weather Watch': '#FFDEAD',
  'Dense Fog Advisory': '#708090',
  'Dense Smoke Advisory': '#F0E68C',
  'Dust Storm Warning': '#FFE4C4',
  'Blowing Dust Advisory': '#BDB76B',
  'Air Quality Alert': '#808080',
  'Hurricane Warning': '#DC143C',
  'Hurricane Watch': '#FF00FF',
  'Tropical Storm Warning': '#B22222',
  'Tropical Storm Watch': '#F08080',
  'Storm Surge Warning': '#B524F7',
  'Storm Surge Watch': '#DB7FF7',
};
const ALERT_DEFAULT_COLOR = '#C0C0C0';

function alertRank(event){
  return event.endsWith('Warning') ? 3 : event.endsWith('Watch') ? 2 : 1;
}

// Resolves to [{event, color, geometry}] for alerts in the states the bounds cover, least severe first
function fetchAlertShapes(bounds){
  let [west, south, east, north] = bounds;
  let states = Object.keys(STATE_BOUNDS).filter(function(state) {
    let [w, s, e, n] = STATE_BOUNDS[state];
    return w <= east && e >= west && s <= north && n >= south;
  });
  if (states.length == 0) {
    return Promise.resolve([]);
  }
  return fetch(`https://api.weather.gov/alerts/active?area=${states.join(',')}&status=actual&message_type=alert,update`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`alerts request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      let alerts = data.features.filter((f) => /(Warning|Watch|Advisory)$/.test(f.properties.event));
      // Zone based alerts need their zone shapes, shared between alerts that cover the same zones
      let zoneShapes = {};
      let zoneUrls = [...new Set(alerts.filter((f) => !f.geometry).flatMap((f) => f.properties.affectedZones))].slice(0, ALERT_MAX_ZONES);
      return Promise.all(zoneUrls.map((url) => fetch(url)
        .then((response) => response.json())
        .then((zone) => zoneShapes[url] = zone.geometry)
        .catch(() => null)))
        .then(function() {
          let shapes = [];
          alerts.forEach(function(f) {
            let event = f.properties.event;
            let geometries = f.geometry ? [f.geometry] : f.properties.affectedZones.map((url) => zoneShapes[url]).filter((g) => g);
            geometries.forEach((geometry) => shapes.push({event, color: ALERT_COLORS[event] || ALERT_DEFAULT_COLOR, geometry}));
          });
          return shapes.sort((a, b) => alertRank(a.event) - alertRank(b.event));
        });
    })
    .catch(function(err) {
      console.warn("Alert map error, alerts will not be shown on the radar", err);
      return [];
    });
}

function drawAlerts(map, shapes){
  let polygons = function(geometry) {
    if (geometry.type == 'Polygon') return [geometry.coordinates];
    if (geometry.type == 'MultiPolygon') return geometry.coordinates;
    if (geometry.type == 'GeometryCollection') return geometry.geometries.flatMap(polygons);
    return [];
  };
  let shown = [];
  shapes.forEach(function(shape) {
    let d = '';
    let visible = false;
    polygons(shape.geometry).forEach((polygon) => polygon.forEach(function(ring) {
      let points = ring.map(([lon, lat]) => map.project(lon, lat));
      // Shown in the legend if its bounding box overlaps the map
      let xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
      if (Math.min(...xs) <= RADAR_WIDTH && Math.max(...xs) >= 0 && Math.min(...ys) <= RADAR_HEIGHT && Math.max(...ys) >= 0) visible = true;
      d += 'M' + points.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join('L') + 'Z';
    }));
    if (!d) return;
    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', shape.color);
    path.setAttribute('stroke', shape.color);
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('class', alertRank(shape.event) == 3 ? 'radar-alert-warning' : 'radar-alert-other');
    map.alertLayer.appendChild(path);
    if (visible && !shown.some((s) => s.event == shape.event)) shown.push(shape);
  });

  // Legend of the alerts on screen, most severe first
  shown.sort((a, b) => alertRank(b.event) - alertRank(a.event));
  map.alertLegend.innerHTML = '';
  shown.slice(0, ALERT_MAX_LEGEND).forEach(function(shape) {
    let item = document.createElement('div');
    item.className = 'radar-legend-item';
    let swatch = document.createElement('span');
    swatch.className = 'radar-legend-swatch';
    swatch.style.backgroundColor = shape.color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(shape.event));
    map.alertLegend.appendChild(item);
  });
  map.alertLegend.style.display = shown.length ? '' : 'none';
}
