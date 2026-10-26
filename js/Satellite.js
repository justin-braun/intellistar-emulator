// Satellite page: GOES GeoColor imagery from NASA GIBS, animated over the last 2 hours on the
// same map as the radar. GeoColor looks like a color photo by day and shows infrared clouds
// and city lights at night. GOES-West covers the western US, Alaska and Hawaii better.
// No key is needed.

const SATELLITE_FRAME_COUNT = 13; // 2 hours of frames
const SATELLITE_FRAME_MINUTES = 10; // how often GIBS adds an image
const SATELLITE_WEST_OF = -106; // use GOES-West for locations west of this longitude
const SATELLITE_CACHE_HOURS = 3;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

function satelliteLayer(){
  return longitude < SATELLITE_WEST_OF ? 'GOES-West_ABI_GeoColor' : 'GOES-East_ABI_GeoColor';
}

function satelliteSource(){
  return {
    tiles: `${GIBS}/${satelliteLayer()}/default/{time}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
    timeString: (time) => time.toISOString().replace('.000', ''),
    maxZoom: 7, imagery: false, load: cachedTileUrl, frameDuration: 300, className: 'satellite-map',
    credit: `Satellite: NOAA ${satelliteLayer().split('_')[0]} via NASA GIBS`,
  };
}

// Builds the satellite map from the images GIBS has for the last few hours. Resolves to null
// if there are none, and the satellite page is left out.
function fetchSatelliteImage(){
  let now = Date.now();
  let iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  let start = iso(now - (SATELLITE_FRAME_COUNT + 6) * SATELLITE_FRAME_MINUTES * 60 * 1000);
  // Lists the times GIBS has, as ranges like 2026-10-25T20:00:00Z/2026-10-26T01:20:00Z/PT10M
  let url = `${GIBS}/1.0.0/${satelliteLayer()}/default/GoogleMapsCompatible_Level7/all/${start}--${iso(now + 3600000)}.xml`;
  return fetch(url, {cache: 'no-cache', signal: AbortSignal.timeout(RADAR_LOAD_TIMEOUT)})
    .then(function(response) {
      if (response.status !== 200) throw new Error(`GIBS request error ${response.status}`);
      return response.text();
    })
    .then(function(xml) {
      let domain = new DOMParser().parseFromString(xml, 'text/xml').querySelector('Domain');
      let times = [];
      (domain ? domain.textContent : '').split(',').forEach(function(range) {
        let [first, last] = range.trim().split('/').map((t) => Date.parse(t));
        for (let t = first; t <= last; t += SATELLITE_FRAME_MINUTES * 60 * 1000) times.push(new Date(t));
      });
      times = times.slice(-SATELLITE_FRAME_COUNT);
      return times.length ? buildRadarMap(RADAR_ZOOM, times, satelliteSource()) : null;
    })
    .catch(function(err) {
      console.warn('Satellite error, the satellite page will be left out', err);
      return null;
    });
}

// GIBS asks browsers not to keep its tiles, but an image for a given time never changes. Keeping
// them in the browser means each loop only downloads the newest image, instead of the whole
// 2 hours again. Resolves a tile URL to an object URL for a stored or newly downloaded copy.
let tileCache = null;

function openTileCache(){
  if (!tileCache) tileCache = new Promise(function(resolve) {
    try {
      let request = indexedDB.open('retrocast-tiles', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tiles');
      request.onsuccess = () => { resolve(request.result); pruneTileCache(request.result); };
      request.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
  return tileCache;
}

// Drops tiles older than the loop
function pruneTileCache(db){
  try {
    let store = db.transaction('tiles', 'readwrite').objectStore('tiles');
    store.openCursor().onsuccess = function(event) {
      let cursor = event.target.result;
      if (!cursor) return;
      if (Date.now() - cursor.value.time > SATELLITE_CACHE_HOURS * 3600000) cursor.delete();
      cursor.continue();
    };
  } catch (err) {}
}

function cachedTileUrl(url){
  return openTileCache()
    .then(function(db) {
      if (!db) return null;
      return new Promise(function(resolve) {
        let request = db.transaction('tiles').objectStore('tiles').get(url);
        request.onsuccess = () => resolve(request.result ? request.result.blob : null);
        request.onerror = () => resolve(null);
      });
    })
    .then(function(blob) {
      if (blob) return blob;
      // Longer than the radar's limit, since on a first load many tiles wait their turn
      return fetch(url, {signal: AbortSignal.timeout(60000)})
        .then(function(response) {
          if (response.status !== 200) throw new Error(`satellite tile error ${response.status}`);
          return response.blob();
        })
        .then(function(blob) {
          openTileCache().then(function(db) {
            try {
              if (db) db.transaction('tiles', 'readwrite').objectStore('tiles').put({blob, time: Date.now()}, url);
            } catch (err) {}
          });
          return blob;
        });
    })
    .then((blob) => URL.createObjectURL(blob));
}
