function guessZipCode(){
  // Skip geolookup until replaced with TWC (wunderground api dead)
  return;

  var zipCodeElement = getElement("zip-code-text");
  // Before filling with auto zip, check and see if
  // there is already an input
  if(zipCodeElement.value != ""){
    return;
  }

  // always use wunderground API for geolookup
  // only valid equivalent is GET v3/location/search
  // TODO: use TWC API GET v3/location/search instead of wunderground geolookup
  fetch(`https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/geolookup/q/autoip.json`)
    .then(function(response) {
      //check for error
      if (response.status !== 200) {
        console.log("zip code request error");
        return;
      }
      response.json().then(function(data) {
        // Only fill zip if the user didn't touch
        // the box while the zip was fetching
        if(zipCodeElement.value == ""){
          zipCodeElement.value = data.location.zip;
        }
      });
    })
}

function fetchAlerts(){
  var alertCrawl = "";
  fetch(`https://api.weather.gov/alerts/active?point=${latitude},${longitude}`)
    .then(function(response) {
        if (response.status !== 200) {
            console.warn("Alerts Error, no alerts will be shown");
        }
      response.json().then(function(data) {
        if (data.features == undefined){
          fetchForecast();
          return;
        }
        if (data.features.length == 1) {
          alerts[0] = data.features[0].properties.event + '<br>' + data.features[0].properties.description.replace("..."," ").replace(/\*/g, "")
          for(var i = 0; i < data.features.length; i++){
            /* Take the most important alert message and set it as crawl text
            This will supply more information i.e. tornado warning coverage */
            alertCrawl = alertCrawl + " " + data.features[i].properties.description.replace("...", " ");
          }
        }
        else {
          for(var i = 0; i < data.features.length; i++){
            /* Take the most important alert message and set it as crawl text
            This will supply more information i.e. tornado warning coverage */
            alertCrawl = alertCrawl + " " + data.features[i].properties.description.replace("...", " ");

            alerts[i] = data.features[i].properties.event
          }
        }
        if(alertCrawl != ""){
          CONFIG.crawl = alertCrawl;
        }
        alertsActive = alerts.length > 0;
        fetchForecast();
      });
    })
}

// Forecast and 7 day outlook come from the NWS 12 hour period forecast.
// nwsForecastUrl is set by fetchNWSObservations.
function fetchForecast(){
  fetch(`${nwsForecastUrl}?units=${CONFIG.units === 'e' ? 'us' : 'si'}`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`forecast request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      let periods = data.properties.periods
      // narratives
      isDay = periods[0].isDaytime; // If the API spits out a day forecast, use the day timings
      // there must be a day forecast so if the API doesn't provide one, just make it the night one. It won't show anyway.
      let ns = isDay ? periods.slice(0, 4) : [periods[0], periods[0], periods[1], periods[2]]
      for (let i = 0; i <= 3; i++) {
        let n = ns[i]
        let icon = nwsIcon(n.icon)
        let pop = (n.probabilityOfPrecipitation && n.probabilityOfPrecipitation.value) || 0
        forecastTemp[i] = n.temperature
        forecastIcon[i] = icon ? icon.code : 'na'
        forecastNarrative[i] = n.detailedForecast
        forecastPrecip[i] = `${pop}% Chance<br/> of ${nwsPrecipType(n.icon)}`
      }
      // 7 day outlook
      // startTime is in the location's local time, so its date prefix is the local date
      let firstDate = periods[0].startTime.slice(0, 10)
      let outlookDates = []
      let incomplete = []
      for (var i = 0; i < 7; i++) {
        let date = new Date(firstDate + 'T00:00:00Z')
        date.setUTCDate(date.getUTCDate() + i + 1)
        date = date.toISOString().slice(0, 10)
        outlookDates[i] = date
        let day = periods.find((p) => p.isDaytime && p.startTime.startsWith(date))
        let night = periods.find((p) => !p.isDaytime && p.startTime.startsWith(date))
        if (!day) {
          // The forecast doesn't reach this far
          setOutlookDay(i)
          incomplete.push(i)
          continue
        }
        let icon = nwsIcon(day.icon)
        setOutlookDay(i, day.temperature, night ? night.temperature : null, icon && icon.phrase, icon && icon.code)
        if (!night) incomplete.push(i)
      }
      fetchOpenMeteoOutlook(outlookDates, incomplete).then(fetchRadarImages);
    })
    .catch(function(err) {
      alert("Could not load the forecast from the National Weather Service (check the console)")
      console.error(err)
    });
}

function setOutlookDay(i, high, low, phrase, icon){
  outlookHigh[i] = high == null ? '--' : high
  outlookLow[i] = low == null ? '--' : low
  outlookCondition[i] = (phrase || 'N/A').split(' ').join('<br/>')
  // thunderstorm doesn't fit in the 7 day outlook boxes
  // so I multilined it similar to that of the original
  outlookCondition[i] = outlookCondition[i].replace("Thunderstorm", "Thunder</br>storm");
  outlookIcon[i] = icon == null ? 'na' : icon
}

// The NWS forecast only reaches about 7 days out, so depending on the time of day the
// last outlook day (or its low) is missing. Fill those from Open-Meteo, which needs no key.
function fetchOpenMeteoOutlook(outlookDates, incomplete){
  if (incomplete.length == 0) {
    return Promise.resolve();
  }
  let unit = CONFIG.units === 'e' ? 'fahrenheit' : 'celsius'
  return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=${unit}&timezone=auto&forecast_days=10`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`Open-Meteo request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      let daily = data.daily
      incomplete.forEach(function(i) {
        let d = daily.time.indexOf(outlookDates[i])
        if (d == -1) return;
        let low = Math.round(daily.temperature_2m_min[d])
        if (outlookIcon[i] !== 'na') {
          // NWS has the day but not the night, so only the low is needed
          outlookLow[i] = low
          return;
        }
        let icon = WMO_ICONS[daily.weather_code[d]] || [null, null]
        setOutlookDay(i, Math.round(daily.temperature_2m_max[d]), low, icon[1], icon[0])
      })
    })
    .catch((err) => console.warn("Open-Meteo error, outlook will be incomplete", err))
}

// WMO weather codes used by Open-Meteo, mapped to a TWC icon code and a short phrase
const WMO_ICONS = {
  0: [32, 'Sunny'],
  1: [34, 'Mostly Sunny'],
  2: [30, 'Partly Cloudy'],
  3: [26, 'Cloudy'],
  45: [20, 'Fog'],
  48: [20, 'Fog'],
  51: [9, 'Drizzle'],
  53: [9, 'Drizzle'],
  55: [9, 'Drizzle'],
  56: [8, 'Freezing Drizzle'],
  57: [8, 'Freezing Drizzle'],
  61: [11, 'Light Rain'],
  63: [12, 'Rain'],
  65: [40, 'Heavy Rain'],
  66: [10, 'Freezing Rain'],
  67: [10, 'Freezing Rain'],
  71: [16, 'Light Snow'],
  73: [16, 'Snow'],
  75: [42, 'Heavy Snow'],
  77: [13, 'Flurries'],
  80: [11, 'Showers'],
  81: [11, 'Showers'],
  82: [40, 'Heavy Rain'],
  85: [14, 'Snow Showers'],
  86: [14, 'Snow Showers'],
  95: [4, 'Thunderstorms'],
  96: [4, 'Thunderstorms'],
  99: [4, 'Thunderstorms'],
}

// NWS forecasts give a chance of precipitation but not its type, so guess it from the icon
function nwsPrecipType(url){
  let snow = /snow|blizzard/.test(url)
  let rain = /rain|tsra/.test(url)
  let ice = /sleet|fzra/.test(url)
  if (snow && !rain && !ice) return 'Snow';
  if (rain && !snow && !ice) return 'Rain';
  return 'Precip';
}

// Locations are US only, since all weather data comes from the National Weather Service
function fetchCurrentWeather(){

  //Let's check what we're dealing with
  let locationRequest;
  console.log(CONFIG.locationMode)
  if(CONFIG.locationMode=="POSTAL") {
    locationRequest = fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zipCode)}`)
      .then(function(response) {
        if (response.status == 404) return null;
        if (response.status !== 200) throw new Error(`postal code request error ${response.status}`);
        return response.json().then(function(data) {
          let place = data.places[0]
          return { name: place['place name'], latitude: parseFloat(place.latitude), longitude: parseFloat(place.longitude) }
        })
      })
  }
  else if (CONFIG.locationMode=="AIRPORT") {
    //Determine whether this is an IATA or ICAO code
    let airportCodeLength=airportCode.length;
    let icaoCode;
    if(airportCodeLength==3){icaoCode=`K${airportCode}`} // contiguous US IATA codes are the ICAO code without the K
    else if (airportCodeLength==4){icaoCode=airportCode}
    else {
      alert("Please enter a valid ICAO or IATA Code")
      console.error(`Expected Airport Code Lenght to be 3 or 4 but was ${airportCodeLength}`)
      return;
    }
    // Airports are NWS observation stations, which include the airport name and location
    locationRequest = fetch(`https://api.weather.gov/stations/${encodeURIComponent(icaoCode.toUpperCase())}`)
      .then(function(response) {
        if (response.status == 404) return null;
        if (response.status !== 200) throw new Error(`airport request error ${response.status}`);
        return response.json().then(function(data) {
          // Names look like "Minneapolis, Minneapolis-St. Paul International Airport"
          let name = data.properties.name.split(', ').pop()
          return { name, longitude: data.geometry.coordinates[0], latitude: data.geometry.coordinates[1] }
        })
      })
  }
  else {
    alert("Please select a location type");
    console.error("Unknown what to use for location")
    return;
  }

  locationRequest
    .then(function(location) {
      if (!location) {
        alert("Location not found! (US locations only)")
        console.log('location request error');
        return;
      }
      if(CONFIG.locationMode=="AIRPORT"){
        cityName = location.name
        .toUpperCase() //Airport names are long
        .replace("INTERNATIONAL","INTL.") //If a city name is too long, info bar breaks
        .replace("AIRPORT","") //This is an attempt to fix it
        .trim();
        console.log(cityName);
      } else {
        cityName = location.name.toUpperCase();
      }
      latitude = location.latitude;
      longitude = location.longitude;
      fetchNWSObservations();
    })
    .catch(function(err) {
      alert("Something went wrong (check the console)")
      console.error(err)
    });
}

// Current conditions come from the nearest NWS observation station
function fetchNWSObservations(){
  fetch(`https://api.weather.gov/points/${latitude},${longitude}`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`points request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      nwsForecastUrl = data.properties.forecast
      nwsRelativeLocation = data.properties.relativeLocation.properties
      return fetch(data.properties.observationStations).then((response) => response.json())
    })
    .then(function(data) {
      let station = data.features[0].properties.stationIdentifier
      // Several hours of observations so the pressure trend can be calculated
      return fetch(`https://api.weather.gov/stations/${station}/observations?limit=50`).then((response) => response.json())
    })
    .then(function(data) {
      // Newest first. Use the newest observation with a temperature. Its other fields are
      // sometimes missing, so fall back to observations from up to 90 minutes earlier.
      let obs = data.features.map((f) => f.properties)
      let current = obs.find((o) => o.temperature && o.temperature.value != null)
      if (!current) throw new Error('no recent observations');
      let cutoff = new Date(current.timestamp).getTime() - 90 * 60 * 1000
      let recent = obs.filter((o) => new Date(o.timestamp).getTime() >= cutoff)
      let value = (o, field) => o[field] ? o[field].value : null
      let latest = (field) => {
        let o = recent.find((o) => value(o, field) != null)
        return o ? value(o, field) : null
      }
      let described = recent.find((o) => o.textDescription)

      let temp = value(current, 'temperature')
      let wspd = value(current, 'windSpeed') ?? latest('windSpeed')
      // No gust, wind chill or heat index means there isn't one, so only use the current observation for those
      let gust = value(current, 'windGust')
      currentTemperature = nwsTemperature(temp);
      currentCondition = described ? described.textDescription : '';
      windSpeed = wspd ? `${degreesToCardinal(latest('windDirection'))} ${nwsSpeed(wspd)} ${CONFIG.units === 'm' ? 'km/h' : 'mph'}` : 'CALM';
      gusts = gust ? nwsSpeed(gust) : 'NONE';
      feelsLike = nwsTemperature(value(current, 'windChill') ?? value(current, 'heatIndex') ?? temp)
      visibility = Math.round(CONFIG.units === 'm' ? latest('visibility') / 1000 : latest('visibility') / 1609.344)
      humidity = Math.round(latest('relativeHumidity'))
      dewPoint = nwsTemperature(latest('dewpoint'))
      let pa = latest('seaLevelPressure') ?? latest('barometricPressure')
      pressure = CONFIG.units === 'e' ? (pa / 3386.389).toPrecision(4) : Math.round(pa / 100);
      pressureTrend = nwsPressureTrend(obs);
      let icon = described && nwsIcon(described.icon)
      currentIcon = icon ? icon.code : 'na'
      setMainBackground();
      fetchAlerts();
    })
    .catch(function(err) {
      alert("Could not load current conditions from the National Weather Service (US locations only)")
      console.error(err)
    });
}

function nwsTemperature(c){
  if (c == null) return '--';
  return Math.round(CONFIG.units === 'e' ? c * 9 / 5 + 32 : c);
}

function nwsSpeed(kmh){
  return Math.round(CONFIG.units === 'm' ? kmh : kmh / 1.609344);
}

function degreesToCardinal(deg){
  if (deg == null) return 'VAR';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// Compare the newest pressure with one from about 3 hours earlier
function nwsPressureTrend(obs){
  let withPressure = obs.filter((o) => o.barometricPressure && o.barometricPressure.value != null)
  if (withPressure.length < 2) return '';
  let newest = withPressure[0]
  let cutoff = new Date(newest.timestamp).getTime() - 3 * 60 * 60 * 1000
  let older = withPressure.find((o) => new Date(o.timestamp).getTime() <= cutoff) || withPressure[withPressure.length - 1]
  let change = newest.barometricPressure.value - older.barometricPressure.value
  return change > 50 ? '▲' : change < -50 ? '▼' : ''; // more than 0.5 mb rising up arrow, falling down arrow, else steady
}

// Map an NWS icon url (e.g. https://api.weather.gov/icons/land/night/rain_showers,20/bkn?size=medium)
// to a TWC icon code and a short phrase. Uses the first condition in the url.
const NWS_ICONS = {
  skc: [32, 31, 'Sunny', 'Clear'],
  few: [34, 33, 'Mostly Sunny', 'Mostly Clear'],
  sct: [30, 29, 'Partly Cloudy'],
  bkn: [28, 27, 'Mostly Cloudy'],
  ovc: [26, 26, 'Cloudy'],
  wind_skc: [24, 24, 'Windy'],
  wind_few: [24, 24, 'Windy'],
  wind_sct: [24, 24, 'Windy'],
  wind_bkn: [24, 24, 'Windy'],
  wind_ovc: [24, 24, 'Windy'],
  snow: [16, 16, 'Snow'],
  rain_snow: [5, 5, 'Rain/Snow'],
  rain_sleet: [6, 6, 'Rain/Sleet'],
  snow_sleet: [7, 7, 'Wintry Mix'],
  fzra: [10, 10, 'Freezing Rain'],
  rain_fzra: [10, 10, 'Freezing Rain'],
  snow_fzra: [7, 7, 'Wintry Mix'],
  sleet: [18, 18, 'Sleet'],
  rain: [12, 12, 'Rain'],
  rain_showers: [11, 11, 'Showers'],
  rain_showers_hi: [39, 45, 'Scattered Showers'],
  tsra: [4, 4, 'Thunderstorms'],
  tsra_sct: [38, 47, 'Scattered Thunderstorms'],
  tsra_hi: [37, 47, 'Isolated Thunderstorms'],
  tornado: [0, 0, 'Tornado'],
  hurricane: [2, 2, 'Hurricane'],
  tropical_storm: [1, 1, 'Tropical Storm'],
  dust: [19, 19, 'Dust'],
  smoke: [22, 22, 'Smoke'],
  haze: [21, 21, 'Haze'],
  hot: [36, 36, 'Hot'],
  cold: [25, 25, 'Cold'],
  blizzard: [43, 43, 'Blizzard'],
  fog: [20, 20, 'Fog'],
}

function nwsIcon(url){
  let match = /\/icons\/land\/(day|night)\/([a-z_]+)/.exec(url || '')
  if (!match || !NWS_ICONS[match[2]]) return null;
  let [day, night, dayPhrase, nightPhrase] = NWS_ICONS[match[2]]
  let isNight = match[1] === 'night'
  return { code: isNight ? night : day, phrase: isNight ? (nightPhrase || dayPhrase) : dayPhrase }
}
