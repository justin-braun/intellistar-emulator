// Background photo that matches either the location or the current conditions.
// Location photos are the lead image of the nearest town's Wikipedia article. Condition photos
// are picked at random from curated Wikimedia Commons categories (featured and quality images).
// Both are free to use with credit, which is shown in the corner. Neither needs a key.

const BACKGROUND_WIDTH = 1920;
const BACKGROUND_FALLBACK = 'https://picsum.photos/1920/1080/?random';
const BACKGROUND_CACHE_MS = 24 * 60 * 60 * 1000;

// Commons categories for each group of TWC icon codes, and how often to prefer them over a
// location photo. Clear days (32, 34, 36) have no good category, so they always use the location.
const CONDITION_BACKGROUNDS = [
  // The broader categories (storms, quality images of rain or snow) include damage photos and
  // pictures of people or things that just happen to be in the weather, so they're left out
  {icons: [0, 1, 2, 3, 4, 17, 35, 37, 38, 47], chance: 0.7,
   categories: ['Featured pictures of lightning', 'Quality images of lightning']},
  {icons: [9, 11, 12, 39, 40, 45], chance: 0.6,
   categories: ['Featured pictures of rain']},
  {icons: [5, 7, 13, 14, 15, 16, 41, 42, 43, 46], chance: 0.6,
   categories: ['Featured pictures of snow']},
  {icons: [6, 8, 10, 18, 25], chance: 0.6,
   categories: ['Featured pictures of ice']},
  {icons: [19, 20, 21, 22], chance: 0.6,
   categories: ['Featured pictures of fog']},
  {icons: [23, 24, 26, 27, 28, 29, 30], chance: 0.4,
   categories: ['Featured pictures of clouds']},
  {icons: [31, 33], chance: 0.4,
   categories: ['Featured pictures of the Milky Way', 'Quality images of the Milky Way']},
];

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

function setMainBackground(){
  let condition = CONDITION_BACKGROUNDS.find((c) => c.icons.includes(currentIcon));
  let sources = [fetchLocationBackground, fetchConditionBackground];
  if (condition && Math.random() < condition.chance) {
    sources.reverse();
  }
  // Try the preferred source, then the other, then a random photo
  sources[0](condition)
    .catch((err) => { console.warn('Background error', err); return sources[1](condition); })
    .catch((err) => { console.warn('Background error', err); return {url: BACKGROUND_FALLBACK}; })
    .then(showBackground);
}

function showBackground(photo){
  let background = getElement('background-image');
  // Wait for the image to load so it doesn't appear half drawn
  let image = new Image();
  image.onload = function() {
    background.style.backgroundImage = `url("${photo.url}")`;
    let credit = getElement('background-credit');
    credit.textContent = photo.credit || '';
    credit.style.display = photo.credit ? '' : 'none';
  };
  image.src = photo.url;
}

function fetchLocationBackground(){
  let location = nwsRelativeLocation;
  if (!location) return Promise.reject(new Error('no location'));
  let title = `${location.city}, ${STATE_NAMES[location.state] || location.state}`;
  let params = new URLSearchParams({action: 'query', format: 'json', origin: '*', redirects: 1, titles: title, prop: 'pageimages', piprop: 'name'});
  return fetch(`https://en.wikipedia.org/w/api.php?${params}`)
    .then((response) => response.json())
    .then(function(data) {
      let page = Object.values(data.query.pages)[0];
      if (!page.pageimage) throw new Error(`no Wikipedia image for ${title}`);
      return fetchCommonsPhotos({titles: 'File:' + page.pageimage});
    })
    .then(function(photos) {
      if (photos.length == 0) throw new Error(`Wikipedia image for ${title} isn't a landscape photo`);
      return photos[0];
    });
}

function fetchConditionBackground(condition){
  if (!condition) return Promise.reject(new Error('no photos for this condition'));
  let category = condition.categories[Math.floor(Math.random() * condition.categories.length)];
  return fetchCommonsPhotos({generator: 'categorymembers', gcmtitle: 'Category:' + category, gcmtype: 'file', gcmlimit: 200})
    .then(function(photos) {
      if (photos.length == 0) throw new Error(`no usable photos in ${category}`);
      return photos[Math.floor(Math.random() * photos.length)];
    });
}

// Resolves to [{url, credit}] for the landscape photos big enough to fill the screen.
// Results are cached for a day since looping reloads the page every minute or so.
function fetchCommonsPhotos(query){
  let params = new URLSearchParams(Object.assign({
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: BACKGROUND_WIDTH, iiextmetadatafilter: 'Artist|LicenseShortName',
  }, query));
  let cacheKey = 'background:' + params;
  try {
    let cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached && Date.now() - cached.time < BACKGROUND_CACHE_MS) return Promise.resolve(cached.photos);
  } catch (err) {}
  return fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    .then(function(response) {
      if (response.status !== 200) throw new Error(`Commons request error ${response.status}`);
      return response.json();
    })
    .then(function(data) {
      let pages = data.query ? Object.values(data.query.pages) : [];
      return pages
        .map((page) => page.imageinfo && page.imageinfo[0])
        .filter((info) => info && info.mime == 'image/jpeg' && info.width >= 1600 && info.width >= info.height * 1.3)
        .map(function(info) {
          let meta = info.extmetadata || {};
          // Artist is HTML, often a link to the user page
          let artist = meta.Artist ? new DOMParser().parseFromString(meta.Artist.value, 'text/html').body.textContent.trim() : '';
          let license = meta.LicenseShortName ? meta.LicenseShortName.value : '';
          let credit = ['Photo: ' + (artist || 'Unknown') + ' / Wikimedia Commons', license].filter((s) => s).join(', ');
          return {url: info.thumburl || info.url, credit};
        });
    })
    .then(function(photos) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify({time: Date.now(), photos}));
      } catch (err) {}
      return photos;
    });
}
