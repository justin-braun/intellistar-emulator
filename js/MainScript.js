// Preset timeline sequences
const MORNING = [{name: "Now", subpages: [{name: "current-page", duration: 9000}, {name: "radar-page", duration: 8000}, {name: "hourly-page", duration: 9000}]},{name: "Today", subpages: [{name: "today-page", duration: 10000}]},{name: "Tonight", subpages: [{name: "tonight-page", duration: 10000}]},{name: "Beyond", subpages: [{name: "tomorrow-page", duration: 10000}, {name: "7day-page", duration: 13000}, {name: "almanac-page", duration: 12000}]},]
const NIGHT = [{name: "Now", subpages: [{name: "current-page", duration: 9000}, {name: "radar-page", duration: 8000}, {name: "hourly-page", duration: 9000}]},{name: "Tonight", subpages: [{name: "tonight-page", duration: 10000}]},{name: "Beyond", subpages: [{name: "tomorrow-page", duration: 10000}, {name: "tomorrow-night-page", duration: 10000}, {name: "7day-page", duration: 13000}, {name: "almanac-page", duration: 12000}]},]
const SINGLE = [{name: "Alert", subpages: [{name: "single-alert-page", duration: 7000}]},{name: "Now", subpages: [{name: "current-page", duration: 8000}, {name: "radar-page", duration: 8000}, {name: "zoomed-radar-page", duration: 8000}, {name: "hourly-page", duration: 8000}]},{name: "Tonight", subpages: [{name: "tonight-page", duration: 8000}]},{name: "Beyond", subpages: [{name: "tomorrow-page", duration: 8000}, {name: "7day-page", duration: 13000}]},]
const MULTIPLE = [{name: "Alerts", subpages: [{name: "multiple-alerts-page", duration: 7000}]},{name: "Now", subpages: [{name: "current-page", duration: 8000}, {name: "radar-page", duration: 8000}, {name: "zoomed-radar-page", duration: 8000}, {name: "hourly-page", duration: 8000}]},{name: "Tonight", subpages: [{name: "tonight-page", duration: 8000}]},{name: "Beyond", subpages: [{name: "tomorrow-page", duration: 8000}, {name: "7day-page", duration: 13000}]},]
const WEEKDAY = ["SUN",  "MON", "TUES", "WED", "THU", "FRI", "SAT"];

const HOURLY_FORECAST_HOURS = 8;
const MUSIC_TRACK_COUNT = 11; // assets/music/1.mp3 to 11.mp3, see assets/music/CREDITS.md
const MUSIC_FADE_IN = 1500;
const MUSIC_FADE_OUT = 2000; // the end of the sequence takes about 2.6 seconds
const MUSIC_RESUME_WITHIN = 30000; // resume the last loop's track if it was saved this recently
const REPLAY_TIMEOUT = 30000; // when skipping the ending, reload instead if the next loop's data takes longer than this
const REPLAY_RELOAD_AFTER = 30 * 60 * 1000; // when skipping the ending, still reload this often to clear anything stuck

const crawlSpeedCasual = 10; // A normal reading pace, in characters per second
const crawlSpeedFast = 20; // A fast reading pace, in characters per second
const crawlScreenTime = 45; // Shortest time crawl will be on screen, in seconds
const crawlSpace = 70; // Approx number of characters that can fix in the crawl bar. Used for crawl speed calcs

var isDay = true;
var currentLogo;
var currentLogoIndex = 0;
var pageOrder;
var music;
var musicTrack; // "1" to "11", or "storm"
var musicStarted = false;
var replaying = false; // fetching data to play again without the ending, see replaySequence
var replayStarted;
var replayWatchdog;
var replayCrawl;

window.onload = function () {

  CONFIG.addLocationOption('airport-code', 'Airport', 'ATL or KATL')
  CONFIG.addLocationOption('zip-code', 'Postal', '00000')

  CONFIG.addOption('crawlText', 'Crawl Text', 'Text that scrolls along the bottom')
  CONFIG.addOption('greetingText', 'Greeting Text', 'Message (or joke) that appears at the start')
  CONFIG.load();
  preLoadMusic();
  resizeWindow();
  setClockTime();
  // Esc stops looping during playback, for screens without a mouse
  // M mutes or unmutes the music, except while typing on the start screen
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && CONFIG.loop && !settingsVisible()) logoClick();
    if ((e.key === 'm' || e.key === 'M') && !settingsVisible()) toggleMute();
  });
  updateMuteButton();
  if (!CONFIG.started) {
    getElement("settings-container").style.display = 'block';
    (getElement('airport-code-button').checked ? getElement('airport-code-text') : getElement('zip-code-text')).focus();
  }
}

function toggleAdvancedSettings(){
  let advancedSettingsOptions = getElement('advanced-settings-options')
  let advancedOptionsText = getElement('advanced-options-text')

  var advancedSettingsHidden = advancedSettingsOptions.classList.contains('hidden')

  if(advancedSettingsHidden){
    advancedSettingsOptions.classList.remove('hidden')
    advancedOptionsText.innerHTML = 'Hide advanced options'
  }
  else{
    advancedSettingsOptions.classList.add('hidden')
    advancedOptionsText.innerHTML = 'Show advanced options'
  }
  advancedOptionsText.setAttribute('aria-expanded', advancedSettingsHidden)
}

function settingsVisible(){
  return getElement('settings-container').style.display == 'block' && !getElement('settings-prompt').classList.contains('hide');
}

// Disable the start button while the weather loads
function setSettingsLoading(loading){
  let button = getElement('submit-button');
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? 'Loading forecast…' : 'Start';
  if (loading) getElement('settings-error').innerHTML = '';
}

// When looping, the music continues from where the last loop left off, so it sounds like
// one continuous piece instead of restarting with a new track every minute
function preLoadMusic(){
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem('music-position'));
    localStorage.removeItem('music-position');
  } catch (err) {}
  if (saved && Date.now() - saved.time < MUSIC_RESUME_WITHIN) {
    loadTrack(saved.track, saved.position);
    // Start right away instead of waiting for the weather, to keep the gap short
    startMusic();
  } else {
    loadTrack(randomTrack());
  }
}

// Holiday music during the holiday theme, see Seasons.js
function randomTrack(except){
  let holiday = holidayThemeOn();
  let count = holiday ? HOLIDAY_TRACK_COUNT : MUSIC_TRACK_COUNT;
  let track;
  do {
    track = (holiday ? 'holiday' : '') + (Math.floor(Math.random() * count) + 1);
  } while (track === except && count > 1);
  return track;
}

// The first track is picked before the start screen's holiday switch can change, so pick
// again if it doesn't match
function matchMusicToTheme(){
  if (!music || musicStarted || musicTrack === 'storm') return;
  if (String(musicTrack).startsWith('holiday') != holidayThemeOn()) loadTrack(randomTrack());
}

function loadTrack(track, position){
  if (music) music.pause();
  musicTrack = track;
  // A media fragment starts playback at the saved position
  music = new Audio("assets/music/" + track + ".mp3" + (position ? "#t=" + position.toFixed(1) : ""));
  music.muted = isMuted();
  // When a track finishes, go on to another one (or repeat the storm track)
  music.onended = function() {
    loadTrack(track === 'storm' ? 'storm' : randomTrack(track));
    startMusic();
  };
}

// Saves where the music is, for the next loop to continue from
function saveMusicPosition(){
  if (!music || !musicStarted) return;
  try {
    localStorage.setItem('music-position', JSON.stringify({track: musicTrack, position: music.currentTime, time: Date.now()}));
  } catch (err) {}
}

function fadeMusic(target, duration){
  if (!music) return;
  let audio = music;
  clearInterval(audio.fadeTimer);
  let start = audio.volume;
  let began = Date.now();
  audio.fadeTimer = setInterval(function() {
    let progress = Math.min(1, (Date.now() - began) / duration);
    audio.volume = start + (target - start) * progress;
    if (progress >= 1) clearInterval(audio.fadeTimer);
  }, 50);
}

/* Set the timeline page order depending on time of day and if
alerts are present */
function scheduleTimeline(){
  if(alerts.length == 1){
    pageOrder = SINGLE;
  }else if(alerts.length > 1){
    pageOrder = MULTIPLE;
  }else if(isDay){
    pageOrder = MORNING;
  }else{
    pageOrder = NIGHT;
  }
  // Leave out the hourly page if the hourly forecast couldn't be loaded
  if (hourlyForecast.length == 0) {
    pageOrder = pageOrder.map((page) => Object.assign({}, page, {subpages: page.subpages.filter((s) => s.name != 'hourly-page')}));
  }
  setInformation();
}

function revealTimeline(){
  getElement('timeline-event-container').classList.add('shown');
  getElement('progressbar-container').classList.add('shown');
  getElement('logo-stack').classList.add('shown');
  var timelineElements = document.querySelectorAll(".timeline-item");
  for (var i = 0; i < timelineElements.length; i++) {
    timelineElements[i].style.top = '0px';
  }
}

/* Now that all the fetched information is stored in memory, display them in
the appropriate elements */
function setInformation(){
  if(!replaying) setGreetingPage();
  checkStormMusic();
  setAlertPage();
  setForecast();
  setOutlook();
  setHourly();
  setAlmanac();
  setCurrentConditions();
  if(replaying){
    // Give the last page time to slide out before starting again
    setTimeout(restartSequence, Math.max(0, replayStarted + 1000 - Date.now()));
    return;
  }
  createLogoElements();
  setTimelineEvents();
  hideSettings();
  setTimeout(startAnimation, 1000);
}

// Switch to the storm track during storms, and back once they pass
function checkStormMusic(){
  let storm = currentCondition.toLowerCase().includes("storm");
  if (storm == (musicTrack === 'storm')) return;
  loadTrack(storm ? 'storm' : randomTrack());
  if (musicStarted) startMusic();
}

function startAnimation(){
  setInitialPositionCurrentPage();
  if (!musicStarted) startMusic();
  executeGreetingPage();
}

function startMusic(){
  musicStarted = true;
  music.muted = isMuted();
  music.volume = 0;
  playAudio(music);
  fadeMusic(1, MUSIC_FADE_IN);
}

// Browsers block audio that starts without a click, such as after a looping reload or a
// start link, so try again on the first click or key press
function playAudio(audio){
  audio.play().catch((err) => {
    console.warn("Audio didn't start, it will start on the next click or key press", err);
    let retry = (e) => {
      // The mute button starts or mutes the music itself
      if (e.target.closest && e.target.closest('#mute-button')) return;
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
      if (audio == music && audio.paused && !isMuted()) audio.play().catch(() => {});
    };
    document.addEventListener('pointerdown', retry);
    document.addEventListener('keydown', retry);
  });
}

function isMuted(){
  try {
    return localStorage.getItem('muted') === 'y';
  } catch (err) {
    return false;
  }
}

// Mutes or unmutes the music, remembered across loops
function toggleMute(){
  let muted = !isMuted();
  try {
    localStorage.setItem('muted', muted ? 'y' : 'n');
  } catch (err) {}
  if (music) music.muted = muted;
  // Unmuting is a click, so it can start music the browser blocked earlier
  if (!muted && musicStarted && music && music.paused) playAudio(music);
  updateMuteButton();
}

function updateMuteButton(){
  let muted = isMuted();
  let button = getElement('mute-button');
  button.classList.toggle('muted', muted);
  button.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
  button.title = (muted ? 'Unmute music' : 'Mute music') + ' (M)';
}

function hideSettings(){
  // Animate settings prompt out
  getElement('settings-prompt').classList.add('hide');
  getElement('settings-container').style.pointerEvents = 'none';
}

function executeGreetingPage(){
  getElement('background-image').classList.remove("below-screen");
  getElement('content-container').classList.add('shown');
  getElement('infobar-logo').classList.add('shown');
  getElement('hello-text').classList.add('shown');
  getElement('hello-location-text').classList.add('shown');
  getElement('greeting-text').classList.add('shown');
  getElement('greeting-logo-container').classList.add("shown");
  setTimeout(clearGreetingPage, 2500);
}

function clearGreetingPage(){
  // Remove transition delay from greeting
  getElement('greeting-text').classList.remove('shown');
  getElement('greeting-logo-container').classList.remove('shown');

  // Hide everything
  getElement('greeting-text').classList.add('hidden');
  getElement('hello-text-container').classList.add('hidden');
  getElement("hello-location-container").classList.add("hidden");
  getElement("greeting-logo-container").classList.add("hidden");

  schedulePages();
  loadInfoBar();
  revealTimeline();
  setTimeout(showCrawl, 3000);
}

// Set start and end times for every sub page.
function schedulePages(){
  var cumlativeTime = 0;
  for(var p = 0; p < pageOrder.length; p++){
    for (var s = 0; s < pageOrder[p].subpages.length; s++) {
      //for every single sub page
      var startTime = cumlativeTime;
      var clearTime = cumlativeTime + pageOrder[p].subpages[s].duration;
      setTimeout(executePage, startTime, p, s);
      setTimeout(clearPage, clearTime, p, s);
      cumlativeTime = clearTime;
    }
  }
}

function executePage(pageIndex, subPageIndex){
  var currentPage = pageOrder[pageIndex];
  var currentSubPageName = currentPage.subpages[subPageIndex].name;
  var currentSubPageElement = getElement(currentSubPageName);
  var subPageCount = currentPage.subpages.length
  var currentSubPageDuration = currentPage.subpages[subPageIndex].duration;

  if(subPageIndex === 0){
    var pageTime = 0;
    for (var i = 0; i < subPageCount; i++) {
      pageTime += currentPage.subpages[i].duration;
    }
      getElement('progressbar').style.transitionDuration = pageTime + "ms";
      getElement('progressbar').classList.add('progress');
      getElement('timeline-event-container').style.left = (-280*pageIndex).toString() + "px";
      getElement('progress-stack').style.left = (-280*pageIndex).toString() + "px";
  }

  if(currentLogo != getPageLogoFileName(currentSubPageName)){
    getElement('logo-stack').style.left = ((-85*currentLogoIndex)-(20*currentLogoIndex)).toString() + "px";
    currentLogo = getPageLogoFileName(currentSubPageName);
    currentLogoIndex++;
  }

  currentSubPageElement.style.transitionDelay = '0.5s';
  if(pageIndex === 0 && subPageIndex == 0){
    currentSubPageElement.style.top = '0px';
  }
  else{
    currentSubPageElement.style.left = '0px';
  }

  var isLastPage = pageIndex >= pageOrder.length-1 && subPageIndex >= pageOrder[pageOrder.length-1].subpages.length-1;
  if(isLastPage && !skipEnding())
    setTimeout(hideCrawl, 2000);


  if(currentSubPageName == "current-page"){
    setTimeout(loadCC, 1000);
    setTimeout(scrollCC, currentSubPageDuration / 2);
    animateValue('cc-temperature-text', -20, currentTemperature, 2500, 1);
    animateDialFill('cc-dial-color', currentTemperature, 2500);
  }
  else if(currentSubPageName == 'radar-page'){
    startRadar();
  }
  else if(currentSubPageName == 'zoomed-radar-page'){
    startZoomedRadar();
  }
  else if(currentSubPageName == "7day-page"){
  }
}

function clearPage(pageIndex, subPageIndex){
  var currentPage = pageOrder[pageIndex];
  var currentSubPageName = currentPage.subpages[subPageIndex].name;
  var currentSubPageElement = getElement(currentSubPageName);
  var subPageCount = currentPage.subpages.length
  var currentSubPageDuration = currentPage.subpages[subPageIndex].duration;

  var isNewPage = subPageCount-1 == subPageIndex;
  var isLastPage = pageIndex >= pageOrder.length-1 && subPageIndex >= pageOrder[pageOrder.length-1].subpages.length-1;

  if(isNewPage && !isLastPage){
    resetProgressBar();
  }

  if(isLastPage && !skipEnding()){
    endSequence();
  }
  else{
    currentSubPageElement.style.transitionDelay = '0s';
    currentSubPageElement.style.left = '-101%';
    if(isLastPage){
      // Reload now and then, which also picks a new background photo, once the last page has slid out
      if(performance.now() > REPLAY_RELOAD_AFTER) setTimeout(reloadPage, 700);
      else replaySequence();
    }
  }
}

// When looping, the ending can be skipped so the pages play again straight away
function skipEnding(){
  return CONFIG.loop && CONFIG.skipEnding;
}

// Fetches fresh data to play the pages again, without the ending or the greeting.
// setInformation calls restartSequence once the data is in.
function replaySequence(){
  replaying = true;
  replayStarted = Date.now();
  [radarImage, zoomedRadarImage].forEach((map) => map && clearTimeout(map.timer));
  zoomedRadarImage = null;
  alerts = [];
  alertsActive = false;
  // Alerts replace the crawl, so go back to the usual one in case they've ended
  replayCrawl = CONFIG.crawl;
  CONFIG.crawl = CONFIG.userCrawl;
  // Reload like a normal loop if the data doesn't come back
  replayWatchdog = setTimeout(reloadPage, REPLAY_TIMEOUT);
  fetchCurrentWeather();
}

// Puts the pages and timeline back where they start, then plays them again
function restartSequence(){
  clearTimeout(replayWatchdog);
  replaying = false;

  var resetElements = document.querySelectorAll('.page-container, .cc-vertical-group');
  for (var i = 0; i < resetElements.length; i++) {
    resetElements[i].style.transition = 'none';
    resetElements[i].style.transitionDelay = '';
    resetElements[i].style.left = '';
    resetElements[i].style.top = '';
  }
  setInitialPositionCurrentPage();
  void getElement('content-frame').offsetWidth;
  for (var i = 0; i < resetElements.length; i++) {
    resetElements[i].style.transition = '';
  }

  resetProgressBar();
  ['timeline-event-container', 'progress-stack', 'logo-stack'].forEach((id) => {
    getElement(id).replaceChildren();
    getElement(id).style.left = '0px';
  });
  currentLogo = undefined;
  currentLogoIndex = 0;
  createLogoElements();
  setTimelineEvents();
  void getElement('timeline-event-container').offsetWidth; // so the new items slide in
  revealTimeline();

  if(CONFIG.crawl != replayCrawl){
    getElement('crawl-text').innerHTML = CONFIG.crawl;
    getElement('crawl-text').classList.remove('animate');
    void getElement('crawl-text').offsetWidth;
    getElement('crawler-container').classList.toggle('shown', CONFIG.crawl.length > 0);
    startCrawl();
  }

  schedulePages();
}

function resetProgressBar(){
  getElement('progressbar').style.transitionDuration = '0ms';
  getElement('progressbar').classList.remove('progress');
  void getElement('progressbar').offsetWidth;
}

function startRadar(){
  getElement('radar-container').replaceChildren(radarImage);
  radarImage.start();
}

function startZoomedRadar(){
  getElement('zoomed-radar-container').replaceChildren(zoomedRadarImage);
  zoomedRadarImage.start();
}

function loadCC(){
  var ccElements = document.querySelectorAll(".cc-vertical-group");
  for (var i = 0; i < ccElements.length; i++) {
    ccElements[i].style.top = '0px';
  }
}

function scrollCC(){
  var ccElements = document.querySelectorAll(".cc-vertical-group");
  for (var i = 0; i < ccElements.length; i++) {
    ccElements[i].style.top = '-80px';
  }
  // Split decimal into 2 objects so that we can animate them individually.
  var pressureArray = pressure.toString().split('.');
  animateValue("cc-visibility", 0, visibility, 800, 1);
  if(CONFIG.units != 'm') {
      getElement("cc-visibility-unit-metric").style.fontSize = "0px";		//Doing the work twice, for good reason: if we simply hide it, the spacing left by the word still exists; if we simply set the size to zero, then it might still be visible at extreme zoom levels.
      getElement("cc-visibility-unit-metric").style.visibility = "hidden";
  } else {
      getElement("cc-visibility-unit-imperial").style.fontSize = "0px";
      getElement("cc-visibility-unit-imperial").style.visibility = "hidden";
  }
  animateValue("cc-humidity", 0, humidity, 1000, 1);
  animateValue("cc-dewpoint", 0, dewPoint, 1200, 1);
  if (CONFIG.units === 'e') {		//Imperial units.
    animateValue("cc-pressure1", 0, pressureArray[0], 1400, 1);
    animateValue("cc-pressure2", 0, pressureArray[1], 1400, 2);
    getElement("cc-pressure-metric").style.fontSize = "0px";		//hide the "mbar" tag
    getElement("cc-pressure-metric").style.visibility = "hidden";
  } else {      //Metric units.
      animateValue("cc-pressure1", 800, pressureArray[0], 1400, 3);
      getElement("cc-pressure2").style.visibility = "hidden";		//Hide figures after the decimal, since we don't really use decimal points when using hectopascals in the context of meteorology
      getElement("cc-pressure2").style.fontSize = "0px";
      getElement("cc-pressure-decimal").style.visibility = "hidden";		//And same for the decimal, which would look silly without something after it.
      getElement("cc-pressure-decimal").style.fontSize = "0px";
  }
}

// Called at end of sequence. Animates everything out and shows ending text
function endSequence(){
  fadeMusic(0, MUSIC_FADE_OUT);
  clearInfoBar();
}

function logoClick() {
  var alertMessageShown = getElement('alert-message').classList.contains('shown');
  if(alertMessageShown) return;
  var loopStatus = localStorage.getItem('loop');
  if(loopStatus == "y"){
    localStorage.setItem('loop', 'n');
    CONFIG.loop = false;
  }
  else{
    localStorage.setItem('loop', 'y');
    CONFIG.loop = true;
  }
  showLoopMessage();
}

function clearInfoBar(){
  getElement("infobar-logo").classList.add("hidden");
  getElement("infobar-wordmark").classList.add("hidden");
  getElement("infobar-location-container").classList.add("hidden");
  getElement("infobar-time-container").classList.add("hidden");
  setTimeout(clearElements, 200);
}

// Animates everything out (not including main background)
function clearElements(){
  var lastPage = pageOrder[pageOrder.length-1];
  var lastSubPageName = lastPage.subpages[lastPage.subpages.length-1].name;
  if(lastSubPageName == "7day-page"){
    // The 7 day page splits apart instead of sliding out
    getElement("outlook-titlebar").classList.add('hidden');
    getElement("forecast-left-container").classList.add('hidden');
    getElement("forecast-right-container").classList.add('hidden');
  }
  else{
    var lastSubPageElement = getElement(lastSubPageName);
    lastSubPageElement.style.transitionDelay = '0s';
    lastSubPageElement.style.left = '-101%';
  }
  getElement("content-container").classList.add("expand");
  getElement("timeline-container").style.visibility = "hidden";
  showEnding();
  setTimeout(clearEnd, 2000);
}

function showEnding(){
  if(alertsActive){
    stayUpdated();
  }
  else{
    thanksForWatching();
  }
}

function thanksForWatching(){
  getElement('amazing-text').classList.add('extend');
  getElement("amazing-logo").classList.add('shown');
  getElement("amazing-container").classList.add('hide');
}

function stayUpdated(){
  getElement('updated-text').classList.add('extend');
  getElement("updated-logo").classList.add('shown');
  getElement("updated-container").classList.add('hide');
}

// Final background animate out
function clearEnd(){
  getElement('background-image').classList.add("above-screen");
  getElement('content-container').classList.add("above-screen");

  // Reload the page after animation has completed
  // If looping is enabled, the sequence will start again
  // Otherwise, the zip code prompt will show again
  setTimeout(reloadPage, 400)
}

function reloadPage(){
  // Drop a ?zip= start link when not looping, so the start screen shows instead of playing again
  if (!CONFIG.loop && location.search) {
    location.href = location.pathname;
  } else {
    if (CONFIG.loop) saveMusicPosition();
    location.reload()
  }
}

function loadInfoBar(){
  getElement("infobar-wordmark").classList.add("shown");
  getElement("infobar-location-container").classList.add("shown");
  getElement("infobar-time-container").classList.add("shown");
}

function setClockTime(){
  var currentTime = new Date();
  var diem = "AM";
  var h = currentTime.getHours();
  var m = currentTime.getMinutes();

  if(h == 0){
    h = 12;
  }
  else if(h > 12){
    h = h - 12
    diem = "PM";
  }
  if(m < 10){
    m = "0" + m;
  }

  var finalString = h + ":" + m;
  getElement("infobar-time-text").innerHTML = finalString;

  // Refresh clock every 5 seconds
  setTimeout(setClockTime, 5000);
}

/* Used to linearly animate a numeric value. In contex, the temperature and
   other current conditions at beginning are animated this way */
function animateValue(id, start, end, duration, pad) {
  var obj = getElement(id);
  if(start == end){
    obj.innerHTML = end;
    return;
  }
  var range = end - start;
  var current = start;
  var increment = end > start? 1 : -1;
  var stepTime = Math.abs(Math.floor(duration / range));
  var timer = setInterval(function() {
      current += increment;
      obj.innerHTML = current.pad(pad);
      if (current == end) {
          clearInterval(timer);
      }
  }, stepTime);
}

function animateDialFill(id, temperature, duration) {
  var start = -20;
  var end = temperature;
  var obj = getElement(id);
  if(start == end){
    obj.style.fill = getTemperatureColor(temperature);
    return;
  }
  var range = end - start;
  var current = start;
  var increment = end > start? 1 : -1;
  var stepTime = Math.abs(Math.floor(duration / range));
  var timer = setInterval(function() {
      current += increment;
      obj.style.fill = getTemperatureColor(current);
      if (current == end) {
          clearInterval(timer);
      }
  }, stepTime);
}
Number.prototype.pad = function(size) {
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}

// Used for the beginning dial in order to map warmer
// temperatures to warmer colors and vice versa.
function getTemperatureColor(temperature){
  if(temperature < -20){
    return 'rgb(0, 0, 255)';
  }
  else if(temperature > 100){
    return 'rgb(201, 42, 42)';
  }

  var calculatedColor = [0, 0, 0]
  if(temperature < 40){
    var percent = (temperature + 20)/60
    calculatedColor = interpolateColor([24, 100, 171], [77, 171, 247], percent)
  }
  else if(temperature < 60){
    var percent = (temperature - 40)/20
    calculatedColor = interpolateColor([77, 171, 247], [255, 212, 59], percent)
  }
  else if(temperature < 80){
    var percent = (temperature - 60)/20
    calculatedColor = interpolateColor([255, 212, 59], [247, 103, 7], percent)
  }
  else{
    var percent = (temperature - 80)/20
    calculatedColor = interpolateColor([247, 103, 7], [201, 42, 42], percent)
  }
  return 'rgb(' + calculatedColor[0] + ', ' + calculatedColor[1] + ', ' + calculatedColor[2] + ')'
}

var interpolateColor = function(color1, color2, factor) {
  if (arguments.length < 3) { factor = 0.5; }
  var result = color1.slice();
  for (var i=0;i<3;i++) {
    result[i] = Math.round(result[i] + factor*(color2[i]-color1[i]));
  }
  return result;
};

const baseSize = {
    w: 1920,
    h: 1080
}

window.onresize = resizeWindow;
function resizeWindow(){
  var ww = window.innerWidth;
  var wh = window.innerHeight;
  var newScale = 1;

  // compare ratios
  if(ww/wh < baseSize.w/baseSize.h) { // tall ratio
      newScale = ww / baseSize.w;
  } else { // wide ratio
      newScale = wh / baseSize.h;
  }

  getElement('render-frame').style.transform = 'scale(' + newScale + ',' +  newScale + ')';
}

function getElement(id){
  return document.getElementById(id);
}

function showCrawl(){
  // only show crawl bar if it contains text
  if (CONFIG.crawl.length > 0){
    getElement('crawler-container').classList.add("shown");
    setTimeout(startCrawl, 400); // wait for the settings to fully animate out before starting
  }
}

function hideCrawl(){
  getElement('crawler-container').classList.add("hidden");
}

function startCrawl(){
  calculateCrawlSpeed();
  getElement('crawl-text').classList.add('animate');
}

function calculateCrawlSpeed() {
  var crawlTextElement = getElement('crawl-text');

  // Get the length of the crawl
  var elementLength = crawlTextElement.innerHTML.length;
  var timeTaken;
  // We basically have 3 speed cases to solve for: casual (10 chars/s), fast (20 chars/s), and then anything between.
  // To handle low lengths correctly, we need to add in the ~70 chars worth of length of the crawl box, otherwise short strings fly by too quickly.

  // Handle the low end case
  if (elementLength < ( crawlScreenTime*crawlSpeedCasual) - crawlSpace ){
    timeTaken = (elementLength + crawlSpace) / crawlSpeedCasual;
  }

  // Handle the high end case. This calc will result in animations longer than screen time, which will cut off the end of long messages, which I find preferable to long messages flying by too fast to read. 
  else if (elementLength > (crawlScreenTime*crawlSpeedFast)){
    timeTaken = elementLength / crawlSpeedFast;
  }

  // Handle the in-between case. Pin the animation time to screentime and let the chars/sec float between the casual and fast limits.
  else {
    timeTaken = crawlScreenTime;
  }
  crawlTextElement.style.animationDuration = timeTaken + "s";
}

function showLoopMessage(){
  alert(CONFIG.loop ? "Looping on" : "Looping off, the start screen will show after this forecast");
}

function hideAlertMessage(){
  getElement('alert-message').classList.remove('shown');
}

function alert(message){
  // Show errors in the settings prompt while it's on screen, such as an invalid ZIP code
  if (settingsVisible()) {
    getElement('settings-error').innerHTML = message;
    setSettingsLoading(false);
    return;
  }
  getElement('alert-message').innerHTML = message;
  getElement('alert-message').classList.add('shown');
  setTimeout(hideAlertMessage, 2000);
}
