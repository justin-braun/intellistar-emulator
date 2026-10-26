// Current temperatures page: a map of the location's state, scaled up to fill the frame, with the
// conditions and temperature for up to 10 cities spread across it. Each city is a compact block
// centered on it, with the temperature colored like the dial on the current conditions page.
// Conditions and temperatures come from Open-Meteo, which needs no key. The forecast location
// uses the NWS observation, to match the first page.

const TEMPERATURE_MAX_CITIES = 10;
const TEMPERATURE_CITY_SPACING = 50; // a city closer than this many pixels to one already picked is skipped
const TEMPERATURE_NAME_FONT = "600 19px 'Retrocast Sans'";
const TEMPERATURE_CACHE_MS = 15 * 60 * 1000; // Open-Meteo updates current conditions every 15 minutes
// Where a block can go when it doesn't fit centered on its city, nearest first
const TEMPERATURE_NUDGES = [[0, 0], [0, -30], [0, 30], [-45, 0], [45, 0], [-40, -30], [40, -30], [-40, 30], [40, 30], [0, -56], [0, 56], [-90, 0], [90, 0]];

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
  let scale = view ? stateScale(map, STATE_BOUNDS[state]) : 1;
  // Where a place ends up once the map is scaled
  let point = function(place) {
    let [x, y] = map.project(place.lon, place.lat);
    return [RADAR_WIDTH / 2 + (x - RADAR_WIDTH / 2) * scale, RADAR_HEIGHT / 2 + (y - RADAR_HEIGHT / 2) * scale];
  };
  // Simplify the state lines to about a pixel at this zoom. The font is needed to measure names.
  Promise.all([fetchStateFeatures(STATE_FIPS[state], radarBounds(zoom, center), 360 / (256 * Math.pow(2, zoom))), document.fonts.load(TEMPERATURE_NAME_FONT)])
    .then(function([features]) {
      drawMapFeatures(map, features && {counties: [], states: features.states, places: []});
      // Scaled after the lines are drawn, so Esri's borders are scaled too if the Census data didn't load
      scaleMap(map, scale);
      if (features) drawTemperatureBlocks(map, pickCities(features.places, point));
    });
  return map;
}

// The most detailed zoom that fits a state on the map, and its center. Small states like
// Rhode Island go closer than the radar, so they don't have to be enlarged much.
function stateView(state){
  let bounds = STATE_BOUNDS[state];
  if (!bounds) return null;
  for (let zoom = RADAR_ZOOM + 2; zoom >= 3; zoom--) {
    let [x1, y1] = worldPixel(bounds[0], bounds[3], zoom), [x2, y2] = worldPixel(bounds[2], bounds[1], zoom);
    if (x2 - x1 <= RADAR_WIDTH - 80 && y2 - y1 <= RADAR_HEIGHT - 60) {
      let y = (y1 + y2) / 2, worldSize = 256 * Math.pow(2, zoom);
      return {zoom, center: [(bounds[0] + bounds[2]) / 2, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / worldSize))) * 180 / Math.PI]};
    }
  }
  return null;
}

// How much to enlarge the map so the state fills the frame. Map tiles only come in whole zoom
// levels, so a state usually fills well under the frame at the zoom that fits it.
function stateScale(map, bounds){
  let [x1, y1] = map.project(bounds[0], bounds[3]), [x2, y2] = map.project(bounds[2], bounds[1]);
  // Leave room above and below for the blocks of cities on the state's edge
  return Math.max(1, Math.min((RADAR_WIDTH - 60) / (x2 - x1), (RADAR_HEIGHT - 90) / (y2 - y1)));
}

// Enlarges the imagery and lines around the middle of the map, but not the labels on top
function scaleMap(map, scale){
  [...map.children].forEach(function(layer) {
    if (layer === map.placeLayer || layer === map.attribution || layer.classList.contains('radar-time') || layer.classList.contains('radar-legend')) return;
    layer.style.transform = `scale(${scale})`;
    layer.style.transformOrigin = `${RADAR_WIDTH / 2}px ${RADAR_HEIGHT / 2}px`;
  });
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
      let features = {states: states.map((f) => f.geometry), places: places.map(censusPlace)};
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

// Picks cities biggest first, starting with the forecast location's town. A city is skipped if
// it's close to one already picked, so suburbs don't crowd their big neighbor, or if its block
// can't fit centered on it or nudged a little.
function pickCities(places, point){
  let context = document.createElement('canvas').getContext('2d');
  context.font = TEMPERATURE_NAME_FONT;
  // The forecast location's town, by name, since a big city's census point can be miles from
  // its downtown. Otherwise the nearest town.
  let distance = (p) => Math.hypot(p.lon - longitude, p.lat - latitude);
  let home = places.find((p) => p.name.toUpperCase() == cityName && distance(p) < 0.5);
  if (!home) {
    home = places.reduce((nearest, p) => (!nearest || distance(p) < distance(nearest)) ? p : nearest, null);
    if (home && distance(home) > 0.15) home = null;
  }
  // Keep clear of the credits in the bottom right corner
  let boxes = [{left: RADAR_WIDTH - 440, right: RADAR_WIDTH, top: RADAR_HEIGHT - 24, bottom: RADAR_HEIGHT}];
  let picked = [];
  for (let place of [...(home ? [home] : []), ...places.filter((p) => p !== home)]) {
    if (picked.length >= TEMPERATURE_MAX_CITIES) break;
    let [x, y] = point(place);
    if (x < 10 || y < 10 || x > RADAR_WIDTH - 10 || y > RADAR_HEIGHT - 10) continue;
    if (picked.some((city) => Math.hypot(city.x - x, city.y - y) < TEMPERATURE_CITY_SPACING)) continue;
    let half = Math.max(54, context.measureText(place.name).width / 2 + 4);
    for (let [dx, dy] of TEMPERATURE_NUDGES) {
      let box = {left: x + dx - half, right: x + dx + half, top: y + dy - 22, bottom: y + dy + 42};
      if (box.left < 4 || box.right > RADAR_WIDTH - 4 || box.top < 4 || box.bottom > RADAR_HEIGHT - 2) continue;
      if (boxes.some((b) => box.left < b.right + 6 && box.right > b.left - 6 && box.top < b.bottom + 4 && box.bottom > b.top - 4)) continue;
      boxes.push(box);
      picked.push({place, x, y, dx, dy, isHome: place === home});
      break;
    }
  }
  return picked;
}

function drawTemperatureBlocks(map, cities){
  fetchCurrentConditions(cities.map((city) => city.place)).then(function(conditions) {
    cities.forEach(function(city, i) {
      let {temperature, icon} = conditions[i];
      if (city.isHome && currentTemperature != null) temperature = currentTemperature;
      if (city.isHome && currentIcon && currentIcon !== 'na') icon = currentIcon;
      if (temperature == null) return;
      if (city.dx || city.dy) {
        let dot = document.createElement('span');
        dot.className = 'radar-place-dot temperature-dot';
        dot.style.left = city.x + 'px';
        dot.style.top = city.y + 'px';
        map.placeLayer.appendChild(dot);
      }
      let block = document.createElement('div');
      block.className = 'temperature-block' + (city.isHome || city.place.population >= PLACE_MAJOR_POPULATION ? ' temperature-block-major' : '');
      block.style.left = city.x + city.dx + 'px';
      block.style.top = city.y + city.dy + 'px';
      let row = document.createElement('div');
      row.className = 'temperature-row';
      if (icon != null) {
        let image = new Image();
        image.className = 'temperature-icon';
        image.alt = '';
        image.src = 'assets/icons/conditions/' + icon + '.svg';
        row.appendChild(image);
      }
      let value = document.createElement('span');
      value.className = 'temperature-value';
      value.textContent = temperature + '°';
      let fahrenheit = CONFIG.units === 'e' ? temperature : temperature * 9 / 5 + 32;
      let color = getTemperatureColor(fahrenheit);
      let [r, g, b] = color.match(/\d+/g).map(Number);
      value.style.backgroundColor = color;
      // Dark text on the light yellows, white on the rest
      value.style.color = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : 'white';
      row.appendChild(value);
      let name = document.createElement('div');
      name.className = 'temperature-name';
      name.textContent = city.place.name;
      block.append(row, name);
      map.placeLayer.appendChild(block);
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
