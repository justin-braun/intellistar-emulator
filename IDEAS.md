# Retrocast feature ideas

A working list of features to pick from. Effort is a rough guess: **S** is an hour or two, **M** is
an afternoon, **L** is a day or more. Every data source listed is free and needs no API key, to keep
Retrocast keyless.

## Top picks

These add the most for the effort, or fix gaps people are likely to notice.

| Idea | Why | Effort |
|---|---|---|
| Recover from failed data loads | When looping, a single NWS hiccup leaves the screen stuck. Retry, and fall back to the last good forecast. | M |
| Rotate through several locations | A kiosk could show home, work and a cabin in turn, one per loop. | M |
| Hourly forecast page | The NWS hourly forecast is already one request away. TV forecasts often show the next few hours. | M |
| Units setting on the start screen | Metric support already exists in the code but can't be turned on without editing it. | S |
| Default location for Docker | Set a ZIP code in `compose.yaml` so the container starts playing without a start link. | S |
| Quiet hours | Mute the music automatically overnight, for displays in bedrooms or offices. | S |

## Forecast content

- **Hourly forecast page** (M). Next 6 to 12 hours of temperature, sky and chance of rain. Source: NWS `forecast/hourly`, from the same grid point already used.
- **Sunrise, sunset and moon phase** (S). A small almanac page. Calculated in the browser, or from Open-Meteo daily `sunrise`/`sunset`.
- **Almanac: normals and records** (M). "Normal high 58°, record 81° in 1953." Source: NOAA's ACIS API (`data.rcc-acis.org`).
- **Air quality and UV index** (S). Source: Open-Meteo's air quality API (`air-quality-api.open-meteo.com`). Could be added to the current conditions page or get its own page.
- **Nearby cities page** (M). Current temperatures for 6 to 8 towns around the location, like the classic regional observations screen. Source: the nearest NWS stations, using the Census city list the radar already loads.
- **Better alert pages** (M). Show each alert's headline, timing and affected area instead of the raw text block, colored to match the radar's hazard colors.
- **Precipitation totals** (S). Rain or snow in the last 24 hours. Source: NWS station observations, which are already loaded.
- **Tropical outlook during hurricane season** (L). Show active storms and their cones from the National Hurricane Center's public map data.

## Radar and maps

- **Satellite view** (M). IEM also offers GOES satellite tiles. Show clouds on a separate page, or as a layer when the radar is quiet.
- **Regional temperature map** (M). Temperatures plotted on the map for the labeled cities, using the same map as the radar.
- **Radar playback speed and length settings** (S). Make the 2-hour loop and frame speed configurable.
- **Storm tracks on warnings** (L). Draw the direction of travel for storm-based warnings, using the motion data in NWS alerts.

## Kiosk and display

- **Rotate through several locations** (M). For example `?zip=55401,55379,87102`, one location per loop.
- **Recover from failed data loads** (M). Retry with a backoff, and keep showing the last good data with a small "updated 10 min ago" note instead of stopping.
- **Quiet hours** (S). Mute between set times, or dim the screen at night.
- **More settings in the start link** (S). Units, mute, crawl text and greeting, for example `?zip=55401&units=m&muted=1`, so a kiosk needs no clicks at all.
- **Configurable page order and length** (M). Skip pages you don't want, or hold the radar longer.
- **Burn-in protection** (S). Shift the layout a few pixels every so often for displays that stay on all day.
- **Clock and date screen** (S). A simple full-screen time and date between loops, with a 12 or 24 hour option.
- **Default location from Docker** (S). An environment variable like `RETROCAST_ZIP=55379` in `compose.yaml`, written into the config when the container starts.

## Sound

- **Volume control** (S). A slider next to the mute button, remembered like mute.
- **Alert tone for warnings** (S). Play a short tone when a warning (not a watch or advisory) covers the location.
- **Spoken forecast** (M). Read the forecast aloud with the browser's built-in speech, as an option.
- **Choose the music style** (S). Group the tracks (jazz, lounge, funk) and let the start screen pick a group.

## Look and feel

- **Animated weather icons** (M). Subtle motion for rain, snow and clouds.
- **Seasonal touches** (S). Holiday or seasonal greeting text and background picks.
- **Classic theme** (L). An optional 1990s-style blue-and-yellow look as a second theme.
- **High-contrast option** (S). Stronger panels and larger text for displays viewed from far away.

## Project and maintenance

- **Live demo on GitHub Pages** (S). The app is static files, so Pages can host it straight from `master`. Then link it as the repo homepage.
- **Automated layout tests** (M). A headless browser test that loads each page and checks text fits its boxes. That would have caught the clipped HELLO and the tomorrow night heading.
- **Tag a v2.0.0 release** (S). Mark the break from the original project, with release notes.
- **Remove old broadcast assets from Git history** (M). The original fonts, music and logos are still in past commits. Removing them means rewriting history and force pushing.
- **Clean up leftover code** (M). Rename remaining old IDs (like `amazing-*`), group the global variables, and split `MainScript.js` into smaller files.
