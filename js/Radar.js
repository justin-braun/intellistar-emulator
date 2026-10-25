// Radar map built from map tiles so it can be styled to match the rest of the emulator.
// Satellite imagery (Esri), NEXRAD radar mosaic frames from the Iowa Environmental Mesonet
// animated over the last 2 hours, county and state lines and city names from the US Census
// Bureau, and active NWS watches, warnings and advisories. None of these need a key.

const RADAR_WIDTH = 1235;
const RADAR_HEIGHT = 525;
const RADAR_ZOOM = 8;
const ZOOMED_RADAR_ZOOM = 9;
const RADAR_FRAME_COUNT = 25; // 2 hours of frames
const RADAR_FRAME_MINUTES = 5; // how often the mosaic is updated
const RADAR_FRAME_DURATION = 200; // each frame fades into the next over this time
const RADAR_LAST_FRAME_DURATION = 1600;
const RADAR_LOAD_TIMEOUT = 10000; // a tile or the latest time that takes longer than this counts as failed

const IMAGERY_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const PLACES_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const RADAR_TILES = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-{time}/{z}/{x}/{y}.png';
const RADAR_LATEST = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json';

function fetchRadarImages(){
  // Always check with the server, so a cached copy can't hold the radar at an old time
  fetch(RADAR_LATEST, {cache: 'no-cache', signal: AbortSignal.timeout(RADAR_LOAD_TIMEOUT)})
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
      // The zoomed map is inside the regular map, so one request covers both.
      // Simplify the outlines to about a pixel at the zoomed map's scale.
      fetchMapFeatures(radarBounds(RADAR_ZOOM), 360 / (256 * Math.pow(2, ZOOMED_RADAR_ZOOM))).then(function(features) {
        [radarImage, zoomedRadarImage].forEach((map) => map && drawMapFeatures(map, features));
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
  map.zoom = zoom;
  map.project = function(lon, lat) {
    let [x, y] = worldPixel(lon, lat, zoom);
    return [x - left, y - top];
  };

  // Adds a layer of map tiles, on top unless another layer to go below is given
  let tileLayer = function(className, url, below) {
    let layer = document.createElement('div');
    layer.className = 'radar-layer ' + className;
    layer.loading = 0;
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + RADAR_WIDTH - 1) / 256); tx++) {
      for (let ty = Math.floor(top / 256); ty <= Math.floor((top + RADAR_HEIGHT - 1) / 256); ty++) {
        let tile = new Image();
        tile.className = 'radar-tile';
        tile.style.left = (tx * 256 - left) + 'px';
        tile.style.top = (ty * 256 - top) + 'px';
        // Hide tiles that fail to load instead of showing a broken image. A tile that hangs
        // counts as done after a while, so it can't keep its frame out of the loop.
        layer.loading++;
        let done = false;
        let finish = () => { if (!done) { done = true; layer.loading--; } };
        tile.onload = finish;
        tile.onerror = () => { finish(); tile.style.visibility = 'hidden'; };
        setTimeout(finish, RADAR_LOAD_TIMEOUT);
        tile.src = url.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
        layer.appendChild(tile);
      }
    }
    map.insertBefore(layer, below || null);
    return layer;
  };
  let svgLayer = function(className) {
    let layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    layer.setAttribute('class', 'radar-layer ' + className);
    layer.setAttribute('width', RADAR_WIDTH);
    layer.setAttribute('height', RADAR_HEIGHT);
    map.appendChild(layer);
    return layer;
  };

  tileLayer('radar-imagery', IMAGERY_TILES);
  // The frames are kept in their own layer so the newest can be put on top while it fades in.
  // They're requested newest first, so on a slow connection the latest radar is ready soonest.
  let frameLayer = document.createElement('div');
  frameLayer.className = 'radar-layer radar-frames';
  map.appendChild(frameLayer);
  let frames = times.slice().reverse().map((time) => frameLayer.appendChild(tileLayer('radar-frame', RADAR_TILES.replace('{time}', radarTimeString(time))))).reverse();
  let topFrame = 0;

  // Filled in by drawMapFeatures and drawAlerts: county and state lines, then alerts,
  // then city names on top
  map.boundaryLayer = svgLayer('radar-boundaries');
  map.alertLayer = svgLayer('radar-alerts');
  map.placeLayer = document.createElement('div');
  map.placeLayer.className = 'radar-layer radar-places';
  map.appendChild(map.placeLayer);
  // Esri's borders and places, used if the Census data can't be loaded
  map.addFallbackPlaces = function() {
    tileLayer('radar-places', PLACES_TILES, map.placeLayer);
    map.attribution.innerHTML = 'Radar: Iowa Environmental Mesonet &middot; Imagery, borders and places: Esri';
  };

  map.alertLegend = document.createElement('div');
  map.alertLegend.className = 'radar-legend regular-text';
  map.alertLegend.style.display = 'none';
  map.appendChild(map.alertLegend);

  let timeLabel = document.createElement('div');
  timeLabel.className = 'radar-time regular-text';
  map.appendChild(timeLabel);

  let attribution = document.createElement('div');
  attribution.className = 'radar-attribution';
  attribution.innerHTML = 'Radar: Iowa Environmental Mesonet &middot; Imagery: Esri &middot; Boundaries and places: US Census Bureau';
  map.appendChild(attribution);
  map.attribution = attribution;

  // Fades the frame in on top, then fades out the one below once it's mostly covered, so
  // storms glide between frames instead of jumping. Hidden frames aren't drawn at all.
  let showFrame = function(index) {
    frames.forEach((frame, i) => {
      if (i == index) {
        frame.style.zIndex = ++topFrame;
        frame.style.transition = `opacity ${RADAR_FRAME_DURATION}ms`;
        frame.style.visibility = 'visible';
        frame.style.opacity = 1;
      }
      else if (frame.style.visibility == 'visible') {
        let delay = RADAR_FRAME_DURATION / 2;
        frame.style.transition = `opacity ${RADAR_FRAME_DURATION}ms ${delay}ms, visibility 0s ${delay + RADAR_FRAME_DURATION}ms`;
        frame.style.visibility = 'hidden';
        frame.style.opacity = 0;
      }
    });
    timeLabel.innerHTML = formatRadarTime(times[index]);
  };

  // Called when the radar page is shown
  map.start = function() {
    if (frames.length == 0) {
      timeLabel.style.display = 'none';
      return;
    }
    // If no frame has finished loading, show the latest as it loads instead of a blank map
    if (frames.every((frame) => frame.loading > 0)) showFrame(frames.length - 1);
    let index = 0;
    let next = function() {
      // Skip frames that are still loading rather than showing them half drawn
      if (frames[index].loading == 0) showFrame(index);
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

// The polygons of a GeoJSON geometry, each a list of rings of [lon, lat]
function geometryPolygons(geometry){
  if (!geometry) return [];
  if (geometry.type == 'Polygon') return [geometry.coordinates];
  if (geometry.type == 'MultiPolygon') return geometry.coordinates;
  if (geometry.type == 'GeometryCollection') return geometry.geometries.flatMap(geometryPolygons);
  return [];
}

// SVG path data for the outlines of GeoJSON geometries on the map
function geometryPath(map, geometries){
  return geometries.flatMap(geometryPolygons).flat().map((ring) =>
    'M' + ring.map(([lon, lat]) => map.project(lon, lat).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join('');
}

function drawAlerts(map, shapes){
  let shown = [];
  shapes.forEach(function(shape) {
    let d = '';
    let visible = false;
    geometryPolygons(shape.geometry).forEach((polygon) => polygon.forEach(function(ring) {
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

  // Where the legend sits, so city labels stay out from under it. The map isn't on the
  // page yet, so measure the text instead of the element.
  map.legendBox = null;
  if (shown.length) {
    let context = document.createElement('canvas').getContext('2d');
    context.font = "200 22px 'Retrocast Sans'";
    let items = shown.slice(0, ALERT_MAX_LEGEND);
    let width = Math.max(...items.map((s) => context.measureText(s.event).width)) + 64; // swatch and padding
    let height = items.length * 30 + 12;
    map.legendBox = {x: 15, y: RADAR_HEIGHT - 22 - height, width, height};
    removeLabelsUnderLegend(map);
  }
}

function boxesOverlap(a, b){
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// For labels placed before the alerts arrived. The forecast location's label is kept.
function removeLabelsUnderLegend(map){
  if (!map.legendBox) return;
  [...map.placeLayer.children].forEach((label) => !label.isHome && boxesOverlap(label.box, map.legendBox) && label.remove());
}

// County and state lines and city names from the US Census Bureau's TIGERweb service
// (public domain). Cities are labeled by 2020 population, biggest first, skipping any
// that would overlap a label already placed.

const TIGERWEB = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const MAP_FEATURES_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const PLACE_MIN_POPULATION = 1000;
const PLACE_MAJOR_POPULATION = 100000;
const PLACE_MAX_LABELS = {8: 28, 9: 36};
const PLACE_MAJOR_FONT = "600 24px 'Retrocast Sans'";
const PLACE_MINOR_FONT = "300 20px 'Retrocast Sans'";

// Resolves to {counties, states, places}, or null if the Census data can't be loaded
function fetchMapFeatures(bounds, tolerance){
  let envelope = bounds.map((v) => v.toFixed(2)).join(',');
  // Only the latest location is kept, since the outlines are fairly large
  try {
    let cached = JSON.parse(localStorage.getItem('map-features'));
    if (cached && cached.envelope == envelope && Date.now() - cached.time < MAP_FEATURES_CACHE_MS) return Promise.resolve(cached.features);
  } catch (err) {}
  let query = (layer, params) => fetch(`${TIGERWEB}/${layer}/query?` + new URLSearchParams(Object.assign({
      geometry: envelope, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outSR: 4326, f: 'geojson',
    }, params)))
    .then(function(response) {
      if (response.status !== 200) throw new Error(`TIGERweb request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      if (data.error) throw new Error(`TIGERweb error ${data.error.message}`);
      return data.features;
    });
  let outlines = {where: '1=1', outFields: 'GEOID', returnGeometry: true, maxAllowableOffset: tolerance, geometryPrecision: 3};
  return Promise.all([
    query('State_County/MapServer/55', outlines), // Census 2020 counties
    query('State_County/MapServer/54', outlines), // Census 2020 states
    query('Places_CouSub_ConCity_SubMCD/MapServer/25', { // Census 2020 incorporated places
      where: `POP100 >= ${PLACE_MIN_POPULATION}`, outFields: 'BASENAME,POP100,INTPTLAT,INTPTLON',
      returnGeometry: false, orderByFields: 'POP100 DESC', resultRecordCount: 400,
    }),
  ])
    .then(function([counties, states, places]) {
      let features = {
        counties: counties.map((f) => f.geometry),
        states: states.map((f) => f.geometry),
        places: places.map((f) => ({name: f.properties.BASENAME, population: f.properties.POP100, lon: Number(f.properties.INTPTLON), lat: Number(f.properties.INTPTLAT)})),
      };
      try {
        localStorage.setItem('map-features', JSON.stringify({envelope, time: Date.now(), features}));
      } catch (err) {}
      return features;
    })
    .catch(function(err) {
      console.warn("Census map data error, using Esri borders and places instead", err);
      return null;
    });
}

function drawMapFeatures(map, features){
  if (!features) {
    map.addFallbackPlaces();
    return;
  }
  [['radar-county', features.counties], ['radar-state', features.states]].forEach(function([className, geometries]) {
    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', geometryPath(map, geometries));
    map.boundaryLayer.appendChild(path);
  });
  // The fonts must be loaded to measure the labels
  Promise.all([document.fonts.load(PLACE_MAJOR_FONT), document.fonts.load(PLACE_MINOR_FONT)])
    .then(() => drawPlaceLabels(map, features.places));
}

function drawPlaceLabels(map, places){
  let context = document.createElement('canvas').getContext('2d');
  // Keep clear of the frame time in the top right corner and the credits in the bottom right
  let taken = [{x: RADAR_WIDTH - 250, y: 0, width: 250, height: 80}, {x: RADAR_WIDTH - 500, y: RADAR_HEIGHT - 24, width: 500, height: 24}];
  if (map.legendBox) taken.push(map.legendBox);
  // A place's own reserved dot doesn't count as an overlap for its label
  let overlaps = (a, place) => taken.some((b) => b.owner !== place && boxesOverlap(a, b));
  // Label big cities first, then the town nearest the forecast location, then the rest by
  // population. The forecast location is always labeled, even if it has to overlap.
  let distance = (p) => Math.hypot(p.lon - longitude, p.lat - latitude);
  let home = places.reduce((nearest, p) => (!nearest || distance(p) < distance(nearest)) ? p : nearest, null);
  if (home && distance(home) > 0.15) home = null;
  let others = places.filter((p) => p !== home);
  let majors = others.filter((p) => p.population >= PLACE_MAJOR_POPULATION);
  let ordered = [...majors, ...(home ? [home] : []), ...others.filter((p) => p.population < PLACE_MAJOR_POPULATION)];
  // Keep other labels off the dots of big cities and the forecast location, so two cities
  // close together (like Minneapolis and St. Paul) can both be labeled
  [...majors, ...(home ? [home] : [])].forEach(function(place) {
    let [x, y] = map.project(place.lon, place.lat);
    taken.push({x: x - 6, y: y - 6, width: 12, height: 12, owner: place});
  });
  let count = 0;
  for (let place of ordered) {
    if (count >= (PLACE_MAX_LABELS[map.zoom] || 30) && place !== home) continue;
    let [x, y] = map.project(place.lon, place.lat);
    let major = place === home || place.population >= PLACE_MAJOR_POPULATION;
    context.font = major ? PLACE_MAJOR_FONT : PLACE_MINOR_FONT;
    let height = major ? 28 : 24;
    let width = Math.ceil(context.measureText(place.name).width) + 18; // dot and gap
    // Try the label to the right of the dot, then to the left, then hanging below or sitting
    // above the dot so neighboring cities can both be labeled
    let right = x - 6, left = x - width + 6;
    let box = [
      {x: right, y: y - height / 2}, {x: left, y: y - height / 2, left: true},
      {x: right, y: y - 6, below: true}, {x: right, y: y - height + 6, above: true},
      {x: left, y: y - 6, left: true, below: true}, {x: left, y: y - height + 6, left: true, above: true},
    ].map((b) => Object.assign(b, {width, height}))
      .find((b) => b.x >= 4 && b.y >= 4 && b.x + b.width <= RADAR_WIDTH - 4 && b.y + b.height <= RADAR_HEIGHT - 4 && !overlaps({x: b.x - 4, y: b.y - 2, width: b.width + 8, height: b.height + 4}, place));
    if (!box && place === home) box = {x: right, y: y - height / 2, width, height};
    if (!box) continue;
    taken.push(box);
    count++;
    let label = document.createElement('div');
    label.className = 'radar-place' + (major ? ' radar-place-major' : '') + (place === home ? ' radar-place-home' : '') +
      (box.left ? ' radar-place-left' : '') + (box.below ? ' radar-place-below' : '') + (box.above ? ' radar-place-above' : '');
    label.box = box;
    label.isHome = place === home;
    label.style.left = box.x + 'px';
    label.style.top = box.y + 'px';
    label.style.width = box.width + 'px';
    label.style.height = box.height + 'px';
    let dot = document.createElement('span');
    dot.className = 'radar-place-dot';
    label.appendChild(dot);
    label.appendChild(document.createTextNode(place.name));
    map.placeLayer.appendChild(label);
  }
}
