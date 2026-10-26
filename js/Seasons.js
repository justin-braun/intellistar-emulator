// Holidays and seasons: the holiday theme for November and December (red and green colors and
// holiday music), greetings for holidays and the first day of each season, and holiday
// background photos. Dates come from the viewer's clock.

const HOLIDAY_TRACK_COUNT = 4; // assets/music/holiday1.mp3 to holiday4.mp3, see assets/music/CREDITS.md
const HOLIDAY_PHOTO_CHANCE = 0.5; // how often a holiday photo is used instead of the usual pick

// Background photos for holidays, hand picked from Wikimedia Commons as scenic night shots
// that sit well behind the forecast. Files that are later deleted are skipped.
const CHRISTMAS_PHOTOS = [
  '28.12.16 Stradun Dubrovnik 06 (31801256922).jpg',
  '37th Street Lights (321687686).jpg',
  'A Light in the Darkness - Flickr - Muffet.jpg',
  'Abstract in Christmas lights (10768476373).jpg',
  'Alnwick.jpg',
  'Baguio City Rose Garden - 2025.jpg',
  'Bromyard Christmas Lights 2005.JPG',
  'CDAResortHolidayLights.jpg',
  'CHRISTMAS AT LEHIGH COUNTY ZOO.jpg',
  'Christmas market Schloss Charlottenburg Berlin-Charlottenburg 2025-12-17 04.jpg',
  'Entrance to Helsinki Christmas Market on an evening in November 2024.jpg',
  'Weihnachtsmarkt bei Nacht.jpg',
];
const FIREWORKS_PHOTOS = [
  '2007 Nagaoka Festival 004.jpg',
  '2014-01-01 00-11-24 feux-artifices-belfort.jpg',
  '2014-01-01 00-11-34 feux-artifices-belfort.jpg',
  '2014-01-01 00-16-04 feux-artifices-belfort.jpg',
  'Australia Day 2013 Perth 28.jpg',
  'Australia Day 2013 Perth 33.jpg',
  'Berlin Central Station opening (2006).jpg',
  "Feu d'artifice - 198.jpg",
];

// The holiday theme runs through November and December unless it's turned off
function holidayThemeOn(date = new Date()){
  return CONFIG.holidayTheme && date.getMonth() >= 10;
}

function applyHolidayTheme(){
  document.documentElement.classList.toggle('holiday-theme', holidayThemeOn());
}

// Day of the month of the nth weekday (0 is Sunday) in a month
function nthWeekday(year, month, weekday, n){
  return 1 + (weekday - new Date(year, month, 1).getDay() + 7) % 7 + (n - 1) * 7;
}

// Easter Sunday as [month, day], using the anonymous Gregorian algorithm
function easter(year){
  let a = year % 19, b = Math.floor(year / 100), c = year % 100;
  let d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  let h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  let l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  let month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  return [month, (h + l - 7 * m + 114) % 31 + 1];
}

// The greeting for a holiday or the first day of a season, or null on other days.
// The first days of the seasons are the usual dates and can be a day off in some years.
function holidayGreeting(date = new Date()){
  let year = date.getFullYear(), month = date.getMonth(), day = date.getDate();
  let on = (m, d) => month == m && day == d;
  let [easterMonth, easterDay] = easter(year);
  if (on(0, 1)) return 'Happy New Year!';
  if (on(1, 14)) return "Happy Valentine's Day!";
  if (on(2, 17)) return "Happy St. Patrick's Day!";
  if (on(easterMonth, easterDay)) return 'Happy Easter!';
  if (on(4, nthWeekday(year, 4, 0, 2))) return "Happy Mother's Day!";
  if (on(5, nthWeekday(year, 5, 0, 3))) return "Happy Father's Day!";
  if (on(6, 4)) return 'Happy Fourth of July!';
  if (on(8, nthWeekday(year, 8, 1, 1))) return 'Happy Labor Day!';
  if (on(9, 31)) return 'Happy Halloween!';
  if (on(10, nthWeekday(year, 10, 4, 4))) return 'Happy Thanksgiving!';
  if (on(11, 24)) return 'Merry Christmas Eve!';
  if (on(11, 25)) return 'Merry Christmas!';
  if (on(11, 31)) return "Happy New Year's Eve!";
  if (on(2, 20)) return 'Happy first day of spring!';
  if (on(5, 21)) return 'Happy first day of summer!';
  if (on(8, 22)) return 'Happy first day of fall!';
  if (on(11, 21)) return 'Happy first day of winter!';
  if (month == 11 && day <= 23) return 'Happy holidays!';
  return null;
}

// Background photos for the holiday around a date, or null
function holidayPhotos(date = new Date()){
  let month = date.getMonth(), day = date.getDate();
  if (month == 11 && day <= 26) return CHRISTMAS_PHOTOS;
  if ((month == 6 && day >= 3 && day <= 5) || (month == 11 && day == 31) || (month == 0 && day == 1)) return FIREWORKS_PHOTOS;
  return null;
}
