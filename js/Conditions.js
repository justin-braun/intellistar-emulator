var zipCode;
var airportCode;
var cityName;

var longitude;
var latitude;

var currentTemperature;
var currentIcon;
var currentCondition;
var windSpeed;
var gusts;
var feelsLike;
var visibility;
var humidity;
var dewPoint;
var pressure;
var pressureTrend;
var nwsForecastUrl;
var nwsForecastHourlyUrl;
var nwsTimeZone; // the location's time zone, like America/Chicago
var nwsRelativeLocation; // nearest town to the location, {city, state}
var hourlyForecast = []; // [{time, temperature, icon, phrase, precipitation}]
var forecastNarrative = [];
var forecastTemp = [];
var forecastIcon = [];
var forecastPrecip = [];
var outlookHigh = [];
var outlookLow = [];
var outlookCondition = [];
var outlookIcon = [];
var radarImage;
var zoomedRadarImage;
var alertsActive;
var alerts = [];
