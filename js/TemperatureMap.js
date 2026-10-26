// Current temperatures page: the radar page's map with the temperature beside each labeled city,
// colored like the dial on the current conditions page. Temperatures come from Open-Meteo,
// which needs no key. The forecast location uses the NWS observation, to match the first page.

const TEMPERATURE_MAX_LABELS = 20;
const TEMPERATURE_LABEL_WIDTH = 70; // room for the temperature after a city name
const TEMPERATURE_CACHE_MS = 15 * 60 * 1000; // Open-Meteo updates current conditions every 15 minutes

function buildTemperatureMap(){
  let map = buildRadarMap(RADAR_ZOOM, [], {imagery: true, credit: 'Temperatures: Open-Meteo'});
  map.showTemperatures = true;
  return map;
}

// Fills in the temperature labels added by drawPlaceLabels
function fillTemperatures(labels){
  fetchCurrentTemperatures(labels.map((label) => label.place)).then(function(temperatures) {
    labels.forEach(function(label, i) {
      let temperature = label.isHome && currentTemperature != null ? currentTemperature : temperatures[i];
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

// Resolves to the current temperature for each place, or null where there isn't one.
// Kept for 15 minutes, since looping reloads the page every minute or so.
function fetchCurrentTemperatures(places){
  let unit = CONFIG.units === 'e' ? 'fahrenheit' : 'celsius';
  let lats = places.map((p) => p.lat.toFixed(2)).join(','), lons = places.map((p) => p.lon.toFixed(2)).join(',');
  let key = `${unit}:${lats}:${lons}`;
  try {
    let cached = JSON.parse(localStorage.getItem('temperatures'));
    if (cached && cached.key == key && Date.now() - cached.time < TEMPERATURE_CACHE_MS) return Promise.resolve(cached.temperatures);
  } catch (err) {}
  return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m&temperature_unit=${unit}`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`Open-Meteo request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      // One location comes back on its own, several as a list
      let temperatures = [].concat(data).map((d) => d.current && d.current.temperature_2m != null ? Math.round(d.current.temperature_2m) : null);
      try {
        localStorage.setItem('temperatures', JSON.stringify({key, time: Date.now(), temperatures}));
      } catch (err) {}
      return temperatures;
    })
    .catch(function(err) {
      console.warn('Open-Meteo temperatures error', err);
      return places.map(() => null);
    });
}
