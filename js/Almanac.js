// Almanac page: sunrise and sunset, normal and record temperatures, precipitation this month,
// and the next four moon phases. Sun and moon times are calculated in the browser. Normals,
// records and precipitation come from NOAA's Applied Climate Information System (ACIS) for
// the nearest ThreadEx station, which merges a city's long-term records into one history.
// None of these need a key.

const ACIS = 'https://data.rcc-acis.org';
const THREADEX_STATIONS = 'assets/data/threadex-stations.json';
const THREADEX_MAX_DISTANCE_KM = 150;
const MOON_PHASE_NAMES = ['New', 'First', 'Full', 'Last'];
const WEEKDAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Fills in the page. Sun and moon right away, climate data when it arrives.
function setAlmanac(){
  let days = [localDate(0), localDate(1)];
  days.forEach(function(date, i) {
    getElement('almanac-day' + i).textContent = WEEKDAY_NAMES[dateFromString(date).getUTCDay()];
    let sun = sunTimes(date, latitude, longitude);
    getElement('almanac-sunrise' + i).textContent = sun ? formatLocalTime(sun.rise) : '--';
    getElement('almanac-sunset' + i).textContent = sun ? formatLocalTime(sun.set) : '--';
  });
  setMoonPhases(nextMoonPhases(new Date(), 4));
  let month = MONTH_NAMES[dateFromString(days[0]).getUTCMonth()];
  getElement('almanac-precip-title').textContent = month + ' Precipitation';
  fetchClimate(days).then(setClimate);
}

function setClimate(climate){
  let temperature = (value) => value == null ? '--' : (CONFIG.units === 'e' ? value : Math.round((value - 32) * 5 / 9)) + '°';
  let precipitation = function(value) {
    if (value == null) return '--';
    if (value === 'T') return 'Trace';
    return CONFIG.units === 'e' ? value.toFixed(2) + ' in' : Math.round(value * 25.4) + ' mm';
  };
  let record = function(id, entry) {
    let element = getElement(id);
    element.textContent = temperature(entry && entry.value);
    if (entry && entry.year) {
      let year = document.createElement('span');
      year.className = 'almanac-year';
      year.textContent = entry.year;
      element.appendChild(year);
    }
  };
  [0, 1].forEach(function(i) {
    let day = climate ? climate.days[i] : {};
    getElement('almanac-normal-high' + i).textContent = temperature(day.normalHigh);
    getElement('almanac-normal-low' + i).textContent = temperature(day.normalLow);
    record('almanac-record-high' + i, day.recordHigh);
    record('almanac-record-low' + i, day.recordLow);
  });
  getElement('almanac-precip').textContent = precipitation(climate && climate.monthPrecipitation);
  getElement('almanac-precip-normal').textContent = 'Normal ' + precipitation(climate && climate.monthNormalPrecipitation);
  getElement('almanac-source').textContent = climate ? 'Normals and records: ' + climate.station : '';
}

// The location's date, days from today, as YYYY-MM-DD
function localDate(daysFromToday){
  let today = new Intl.DateTimeFormat('en-CA', {timeZone: nwsTimeZone || undefined}).format(new Date());
  let date = dateFromString(today);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function dateFromString(date){
  return new Date(date + 'T00:00:00Z');
}

function formatLocalTime(time){
  return new Intl.DateTimeFormat('en-US', {timeZone: nwsTimeZone || undefined, hour: 'numeric', minute: '2-digit'})
    .format(time).replace('AM', 'am').replace('PM', 'pm');
}

function formatLocalDay(time){
  return new Intl.DateTimeFormat('en-US', {timeZone: nwsTimeZone || undefined, month: 'short', day: 'numeric'}).format(time);
}

// Sunrise and sunset for a date (YYYY-MM-DD), from the sunrise equation. Accurate to about a
// minute. Returns null when the sun doesn't rise or set that day, as in Alaska in winter.
function sunTimes(date, lat, lon){
  let rad = Math.PI / 180;
  let julianDay = dateFromString(date).getTime() / 86400000 + 2440587.5 + 0.5; // noon UTC
  let n = Math.round(julianDay - 2451545 + 0.0008);
  let meanSolarTime = n - lon / 360;
  let anomaly = (357.5291 + 0.98560028 * meanSolarTime) % 360;
  let center = 1.9148 * Math.sin(anomaly * rad) + 0.02 * Math.sin(2 * anomaly * rad) + 0.0003 * Math.sin(3 * anomaly * rad);
  let longitude = (anomaly + center + 180 + 102.9372) % 360;
  let transit = 2451545 + meanSolarTime + 0.0053 * Math.sin(anomaly * rad) - 0.0069 * Math.sin(2 * longitude * rad);
  let declination = Math.asin(Math.sin(longitude * rad) * Math.sin(23.4397 * rad));
  let cosHourAngle = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(declination)) / (Math.cos(lat * rad) * Math.cos(declination));
  if (cosHourAngle < -1 || cosHourAngle > 1) return null;
  let hourAngle = Math.acos(cosHourAngle) / rad;
  let toDate = (jd) => new Date((jd - 2440587.5) * 86400000);
  return {rise: toDate(transit - hourAngle / 360), set: toDate(transit + hourAngle / 360)};
}

// The next moon phases after a time, using Jean Meeus's algorithm (Astronomical Algorithms,
// chapter 49). Accurate to a few minutes. Returns [{phase: 0-3 (new, first, full, last), time}].
function nextMoonPhases(after, count){
  let year = after.getUTCFullYear() + (after.getUTCMonth() + after.getUTCDate() / 31) / 12;
  let k = Math.floor((year - 2000) * 12.3685) - 1;
  let phases = [];
  for (let step = 0; phases.length < count && step < 20; step++) {
    let phaseK = k + step / 4;
    let time = moonPhaseTime(phaseK);
    if (time > after) phases.push({phase: step % 4, time});
  }
  return phases;
}

function moonPhaseTime(k){
  let rad = Math.PI / 180;
  let fraction = Math.round((k - Math.floor(k)) * 4) / 4; // 0 new, 0.25 first, 0.5 full, 0.75 last
  let T = k / 1236.85;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T * T * T + 0.00000000073 * T * T * T * T;
  let E = 1 - 0.002516 * T - 0.0000074 * T * T;
  let M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T * T * T) * rad;
  let Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T - 0.000000058 * T * T * T * T) * rad;
  let F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T + 0.000000011 * T * T * T * T) * rad;
  let omega = (124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T * T * T) * rad;
  let s = Math.sin;
  let correction;
  if (fraction == 0 || fraction == 0.5) {
    let full = fraction == 0.5;
    correction = (full ? -0.40614 : -0.4072) * s(Mp) + (full ? 0.17302 : 0.17241) * E * s(M)
      + (full ? 0.01614 : 0.01608) * s(2 * Mp) + (full ? 0.01043 : 0.01039) * s(2 * F)
      + (full ? 0.00734 : 0.00739) * E * s(Mp - M) - (full ? 0.00515 : 0.00514) * E * s(Mp + M)
      + (full ? 0.00209 : 0.00208) * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
      + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F)
      + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(omega);
  } else {
    correction = -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp)
      + 0.00804 * s(2 * F) + 0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M) - 0.0018 * s(Mp - 2 * F)
      - 0.0007 * s(Mp + 2 * F) - 0.0004 * s(3 * Mp) - 0.00034 * E * s(2 * Mp - M) + 0.00032 * E * s(M + 2 * F)
      + 0.00032 * E * s(M - 2 * F) - 0.00028 * E * E * s(Mp + 2 * M) + 0.00027 * E * s(2 * Mp + M) - 0.00017 * s(omega);
    let W = 0.00306 - 0.00038 * E * Math.cos(M) + 0.00026 * Math.cos(Mp) - 0.00002 * Math.cos(Mp - M)
      + 0.00002 * Math.cos(Mp + M) + 0.00002 * Math.cos(2 * F);
    correction += fraction == 0.25 ? W : -W;
  }
  // JDE is in terrestrial time, about 69 seconds ahead of UTC
  return new Date((jde + correction - 2440587.5) * 86400000 - 69000);
}

function setMoonPhases(phases){
  let container = getElement('almanac-moons');
  container.innerHTML = '';
  phases.forEach(function(phase) {
    let item = document.createElement('div');
    item.className = 'almanac-moon';
    item.innerHTML = moonSvg(phase.phase);
    let name = document.createElement('div');
    name.className = 'strong-text almanac-moon-name';
    name.textContent = MOON_PHASE_NAMES[phase.phase];
    let date = document.createElement('div');
    date.className = 'regular-text almanac-moon-date';
    date.textContent = formatLocalDay(phase.time);
    item.appendChild(name);
    item.appendChild(date);
    container.appendChild(item);
  });
}

// The moon as seen from the northern hemisphere: lit on the right after new moon, on the left after full
function moonSvg(phase){
  let lit = {
    0: '',
    1: '<path d="M50 10 A40 40 0 0 1 50 90 Z" fill="url(#moon-lit)"/>',
    2: '<circle cx="50" cy="50" r="40" fill="url(#moon-lit)"/>',
    3: '<path d="M50 10 A40 40 0 0 0 50 90 Z" fill="url(#moon-lit)"/>',
  }[phase];
  return '<svg class="almanac-moon-icon" viewBox="0 0 100 100" aria-hidden="true">' +
    '<defs><radialGradient id="moon-lit" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fbf8ec"/><stop offset="1" stop-color="#c9c3ad"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="40" fill="#273046" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>' + lit + '</svg>';
}

// Resolves to {station, days: [{normalHigh, normalLow, recordHigh, recordLow}], monthPrecipitation,
// monthNormalPrecipitation}, or null if the climate data can't be loaded. Cached until the date changes.
function fetchClimate(days){
  return nearestClimateStation()
    .then(function(station) {
      if (!station) throw new Error('no climate station nearby');
      let cacheKey = 'climate:' + station.id + ':' + days[0] + ':' + CONFIG.units;
      try {
        let cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached) return cached;
      } catch (err) {}
      let [year, month] = days[0].split('-');
      let weekAgo = dateFromString(days[0]);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
      return Promise.all([
        acisData(station.id, {sdate: weekAgo.toISOString().slice(0, 10), edate: days[1], elems: [
          {name: 'maxt', normal: '1'}, {name: 'mint', normal: '1'}, {name: 'pcpn', duration: 'mtd', reduce: 'sum'}]}),
        acisData(station.id, {sdate: year + '-' + month, edate: year + '-' + month, elems: [
          {name: 'pcpn', interval: 'mly', duration: 'mly', reduce: 'sum', normal: '1'}]}),
        ...days.map((date) => acisRecords(station.id, date)),
      ]).then(function([daily, monthly, ...records]) {
        let row = (date) => daily.data.find((r) => r[0] == date) || [];
        let number = (v) => v == null || v === 'M' || v === '' ? null : (v === 'T' ? 'T' : Number(v));
        // Month to date precipitation carries forward through days without data yet
        let thisMonth = daily.data.filter((r) => r[0].startsWith(year + '-' + month) && number(r[3]) != null);
        let climate = {
          station: station.name,
          days: days.map((date, i) => ({
            normalHigh: number(row(date)[1]), normalLow: number(row(date)[2]),
            recordHigh: records[i].high, recordLow: records[i].low,
          })),
          monthPrecipitation: thisMonth.length ? number(thisMonth[thisMonth.length - 1][3]) : (days[0].endsWith('-01') ? 0 : null),
          monthNormalPrecipitation: monthly.data[0] ? number(monthly.data[0][1]) : null,
        };
        try {
          localStorage.setItem(cacheKey, JSON.stringify(climate));
        } catch (err) {}
        return climate;
      });
    })
    .catch(function(err) {
      console.warn("Climate data error, normals and records won't be shown", err);
      return null;
    });
}

// Record high and low on this date in past years, with the year each was set
function acisRecords(sid, date){
  let [year, month, day] = date.split('-');
  let leapDay = month == '02' && day == '29';
  let summary = (reduce) => ({name: reduce == 'max' ? 'maxt' : 'mint', interval: [leapDay ? 4 : 1, 0, 0], duration: 1, smry: {reduce, add: 'date'}, smry_only: 1});
  return acisData(sid, {sdate: (leapDay ? '1852' : '1850') + '-' + month + '-' + day, edate: (year - (leapDay ? 4 : 1)) + '-' + month + '-' + day,
    elems: [summary('max'), summary('min')]})
    .then(function(data) {
      let entry = (s) => s && s[0] !== 'M' ? {value: Number(s[0]), year: s[1] ? s[1].slice(0, 4) : null} : null;
      return {high: entry(data.smry[0]), low: entry(data.smry[1])};
    });
}

function acisData(sid, params){
  return fetch(`${ACIS}/StnData?params=${encodeURIComponent(JSON.stringify(Object.assign({sid}, params)))}`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`ACIS request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      if (data.error) throw new Error(`ACIS error ${data.error}`);
      return data;
    });
}

function nearestClimateStation(){
  return fetch(THREADEX_STATIONS)
    .then((response) => response.json())
    .then(function(stations) {
      let rad = Math.PI / 180;
      let distance = (s) => 6371 * Math.acos(Math.min(1, Math.sin(latitude * rad) * Math.sin(s.lat * rad) +
        Math.cos(latitude * rad) * Math.cos(s.lat * rad) * Math.cos((s.lon - longitude) * rad)));
      let nearest = stations.reduce((best, s) => (!best || distance(s) < distance(best)) ? s : best, null);
      return nearest && distance(nearest) <= THREADEX_MAX_DISTANCE_KM ? nearest : null;
    });
}
