# intellistar-emulator
A web application that displays weather information in the same visual presentation as the cable headend unit [Intellistar](https://en.wikipedia.org/wiki/IntelliStar).

## Overview
This is a local forecast segment that airs on The Weather Channel called the "Local on the 8s". The name is because it airs at timeslots that end in "8" (9:28, 2:48, etc.). The forecast is approximately a minute long and provides information on current and forecasted weather conditions. This type of forecast started in 1982 using WeatherStar units. It was later upgraded to Intellistar in 2003 and received various graphic changes over the years. This emulator uses the style that started in 2013.

## Instructions
## Option 1 (easier)
1. Visit: <https://qconrad.github.io/intellistar-emulator/>.
2. Enter zip code
3. Click start
4. Press F11 for fullscreen

## Option 2 (more customizable)
1. Extract all contents into folder
2. Run index.html in Google Chrome
3. Enter zip code
4. Click start
5. Press F11 for fullscreen

## Option 3 (Docker)
1. `docker build -t intellistar-emulator .`
2. `docker run -p 8080:80 intellistar-emulator`
3. Visit: http://localhost:8080
4. Enter zip code
5. Click start
6. Press F11 for fullscreen

## Features
Most of core animation and logic has been replicated including severe weather alerts, forecast descriptions, crawl text, and the Doppler radar map.

Weather data comes from the [National Weather Service API](https://www.weather.gov/documentation/services-web-api) and postal codes are looked up with [Zippopotam.us](https://zippopotam.us), so no API key is needed. As a result only US locations are supported. The NWS forecast only reaches about 7 days out, so any outlook days it doesn't cover are filled in from [Open-Meteo](https://open-meteo.com) (also free, no key).

Backgrounds are photos from [Wikimedia Commons](https://commons.wikimedia.org): either the lead image of the nearest town's Wikipedia article, or a featured photo matching the current conditions (rain, snow, fog, lightning, clouds or a clear night sky). The photographer and license are credited in the corner.

## Looping
To enable or disable looping, click on the TWC logo in the info-bar in the top-left corner of the emulator.

To get looping working properly, you may (as of Chrome M66) have to go to chrome://flags#autoplay-policy (Autoplay Policy) and change it to `User gesture is required for cross-origin iframes` or `No user gesture is required`  

## Screenshots
![Screenshot 1](/screenshots/1.png)

![Screenshot 2](/screenshots/2.png)

![Screenshot 3](/screenshots/3.png)

![Screenshot 4](/screenshots/4.png)

![Screenshot 5](/screenshots/5.png)

![Screenshot 6](/screenshots/6.png)

![Screenshot 7](/screenshots/7.png)

![Screenshot 8](/screenshots/8.png)

![Screenshot 9](/screenshots/9.png)

![Screenshot 10](/screenshots/10.png)
