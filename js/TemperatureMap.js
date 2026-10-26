// Current temperatures page: a map of the location's state with the conditions and temperature
// for its main cities, spread out across the state, with the temperatures colored like the dial
// on the current conditions page. Conditions and temperatures come from Open-Meteo, which needs
// no key. The forecast location uses the NWS observation, to match the first page.

const TEMPERATURE_MAX_LABELS = 14;
const TEMPERATURE_LABEL_WIDTH = 110; // room for the icon and temperature after a city name
const TEMPERATURE_CITY_SPACING = 50; // a city closer than this many pixels to a bigger one is skipped
const TEMPERATURE_CACHE_MS = 15 * 60 * 1000; // Open-Meteo updates current conditions every 15 minutes

// Census state codes, to ask for the cities of one state
const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55',
  WY: '56', PR: '72',
};

// Night versions of the clear and partly cloudy icons
const NIGHT_ICONS = {32: 31, 34: 33, 30: 29};

function buildTemperatureMap(){
  let state = nwsRelativeLocation && nwsRelativeLocation.state;
  let view = stateView(state);
  let zoom = view ? view.zoom : RADAR_ZOOM, center = view ? view.center : undefined;
  let map = buildRadarMap(zoom, [], {imagery: true, credit: 'Conditions: Open-Meteo', center});
  map.showTemperatures = true;
  // Simplify the state lines to about a pixel at this scale
  fetchStateFeatures(STATE_FIPS[state], radarBounds(zoom, center), 360 / (256 * Math.pow(2, zoom)))
    .then(function(features) {
      if (features) features.places = spreadOutPlaces(map, features.places);
      drawMapFeatures(map, features);
    });
  return map;
}

// The most detailed zoom that fits a state on the map, and its center
function stateView(state){
  let bounds = STATE_BOUNDS[state];
  if (!bounds) return null;
  for (let zoom = RADAR_ZOOM; zoom >= 3; zoom--) {
    let [x1, y1] = worldPixel(bounds[0], bounds[3], zoom), [x2, y2] = worldPixel(bounds[2], bounds[1], zoom);
    if (x2 - x1 <= RADAR_WIDTH - 80 && y2 - y1 <= RADAR_HEIGHT - 60) {
      let y = (y1 + y2) / 2, worldSize = 256 * Math.pow(2, zoom);
      return {zoom, center: [(bounds[0] + bounds[2]) / 2, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / worldSize))) * 180 / Math.PI]};
    }
  }
  return null;
}

// State lines on the map, and the state's biggest cities. Kept for a week like the radar's map data.
function fetchStateFeatures(fips, bounds, tolerance){
  let envelope = bounds.map((v) => v.toFixed(2)).join(',');
  let key = `${fips}:${envelope}`;
  try {
    let cached = JSON.parse(localStorage.getItem('state-map-features'));
    if (cached && cached.key == key && Date.now() - cached.time < MAP_FEATURES_CACHE_MS) return Promise.resolve(cached.features);
  } catch (err) {}
  return Promise.all([
    tigerQuery('State_County/MapServer/54', envelope, { // Census 2020 states
      where: '1=1', outFields: 'GEOID', returnGeometry: true, maxAllowableOffset: tolerance, geometryPrecision: 3,
    }),
    tigerQuery('Places_CouSub_ConCity_SubMCD/MapServer/25', envelope, { // Census 2020 incorporated places
      where: (fips ? `STATE='${fips}' AND ` : '') + `POP100 >= ${PLACE_MIN_POPULATION}`, outFields: 'BASENAME,POP100,INTPTLAT,INTPTLON',
      returnGeometry: false, orderByFields: 'POP100 DESC', resultRecordCount: 400,
    }),
  ])
    .then(function([states, places]) {
      let features = {counties: [], states: states.map((f) => f.geometry), places: places.map(censusPlace)};
      try {
        localStorage.setItem('state-map-features', JSON.stringify({key, time: Date.now(), features}));
      } catch (err) {}
      return features;
    })
    .catch(function(err) {
      console.warn('Census state map data error, using Esri borders and places instead', err);
      return null;
    });
}

// Picks cities biggest first, skipping any too close to one already picked, so they spread
// across the state instead of bunching up around the biggest city. The forecast location's
// town is always included.
function spreadOutPlaces(map, places){
  let distance = (p) => Math.hypot(p.lon - longitude, p.lat - latitude);
  let home = places.reduce((nearest, p) => (!nearest || distance(p) < distance(nearest)) ? p : nearest, null);
  let picked = home && distance(home) <= 0.15 ? [home] : [];
  for (let place of places) {
    if (picked.length >= TEMPERATURE_MAX_LABELS) break;
    let [x, y] = map.project(place.lon, place.lat);
    if (x < 20 || y < 20 || x > RADAR_WIDTH - 20 || y > RADAR_HEIGHT - 20) continue;
    let crowded = picked.some(function(other) {
      let [ox, oy] = map.project(other.lon, other.lat);
      return Math.hypot(ox - x, oy - y) < TEMPERATURE_CITY_SPACING;
    });
    if (!crowded) picked.push(place);
  }
  return picked;
}

// Fills in the conditions and temperature labels added by drawPlaceLabels
function fillTemperatures(labels){
  fetchCurrentConditions(labels.map((label) => label.place)).then(function(conditions) {
    labels.forEach(function(label, i) {
      let {temperature, icon} = conditions[i] || {};
      if (label.isHome && currentTemperature != null) temperature = currentTemperature;
      if (label.isHome && currentIcon && currentIcon !== 'na') icon = currentIcon;
      if (icon != null) label.icon.src = 'assets/icons/conditions/' + icon + '.svg';
      else label.icon.style.display = 'none';
      if (temperature == null) {
        label.temperature.style.display = 'none';
        return;
      }
      label.temperature.textContent = temperature + '°';
      let fahrenheit = CONFIG.units === 'e' ? temperature : temperature * 9 / 5 + 32;
      let color = getTemperatureColor(fahrenheit);
      let [r, g, b] = color.match(/\d+/g).map(Number);
      label.temperature.style.backgroundColor = color;
      // Dark text on the light yellows, white on the rest
      label.temperature.style.color = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : 'white';
    });
  });
}

// Resolves to {temperature, icon} for each place, with nulls where there's no data.
// Kept for 15 minutes, since looping reloads the page every minute or so.
function fetchCurrentConditions(places){
  let unit = CONFIG.units === 'e' ? 'fahrenheit' : 'celsius';
  let lats = places.map((p) => p.lat.toFixed(2)).join(','), lons = places.map((p) => p.lon.toFixed(2)).join(',');
  let key = `${unit}:${lats}:${lons}`;
  try {
    let cached = JSON.parse(localStorage.getItem('map-conditions'));
    if (cached && cached.key == key && Date.now() - cached.time < TEMPERATURE_CACHE_MS) return Promise.resolve(cached.conditions);
  } catch (err) {}
  return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,is_day&temperature_unit=${unit}`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`Open-Meteo request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      // One location comes back on its own, several as a list
      let conditions = [].concat(data).map(function(d) {
        let current = d.current || {};
        let icon = (WMO_ICONS[current.weather_code] || [null])[0];
        if (icon != null && current.is_day === 0) icon = NIGHT_ICONS[icon] || icon;
        return {temperature: current.temperature_2m != null ? Math.round(current.temperature_2m) : null, icon};
      });
      try {
        localStorage.setItem('map-conditions', JSON.stringify({key, time: Date.now(), conditions}));
      } catch (err) {}
      return conditions;
    })
    .catch(function(err) {
      console.warn('Open-Meteo conditions error', err);
      return places.map(() => ({temperature: null, icon: null}));
    });
}
