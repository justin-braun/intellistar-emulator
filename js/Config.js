window.CONFIG = {
  crawl: `Welcome to Retrocast, a retro local forecast powered by the National Weather Service. Forecasts, radar and alerts update every time the forecast plays. Thanks for watching.`,
  greeting: 'This is your weather',
  units: 'e', // e = English (imperial), m = Metric, h = Hybrid (UK)
  unitField: 'imperial', // This field will be filled in automatically. (imperial = e, metric = m, uk_hybrid = h)
  loop: false,
  locationMode: "POSTAL",

  // Config Functions (index.html settings manager)
  locationOptions:[],
  addLocationOption: (id, name, desc) => {
    CONFIG.locationOptions.push({
      id,
      name,
      desc,
    })
  },
  options: [],
  addOption: (id, name, desc) => {
    CONFIG.options.push({
      id,
      name,
      desc,
    })
  },
  submit: (btn, e) => {
    let args = {}
    const currentLoop = (localStorage.getItem('loop') === 'y')
    CONFIG.locationOptions.forEach((opt) => {
      args[opt.id] = getElement(`${opt.id}-text`).value
      args[`${opt.id}-button`] = getElement(`${opt.id}-button`).checked
      if (!currentLoop) {
        localStorage.setItem(opt.id, args[opt.id])
      }
    })
    CONFIG.options.forEach((opt) => {
      args[opt.id] = getElement(`${opt.id}-text`).value
      if (!currentLoop) {
        localStorage.setItem(opt.id, args[opt.id])
      }
    })
    console.log(args)
    if (currentLoop) {
      if (localStorage.getItem('crawlText')) CONFIG.crawl = localStorage.getItem('crawlText')
      if (localStorage.getItem('greetingText')) CONFIG.greeting = localStorage.getItem('greetingText')
    } else {
      if (args.crawlText !== '') CONFIG.crawl = args.crawlText
      if (args.greetingText !== '') CONFIG.greeting = args.greetingText
    }
    
    if (args['airport-code-button']==true){
      CONFIG.locationMode="AIRPORT"
      if(!currentLoop && !/^[A-Za-z0-9]{3,4}$/.test(args['airport-code'])){
        alert("Enter a 3 or 4 letter airport code, like MSP or KMSP")
        return
      }
    }
    else {
      CONFIG.locationMode="POSTAL"
      if(!currentLoop && !/^\d{5}$/.test(args['zip-code'])){
        alert("Enter a 5 digit ZIP code")
        return
      }

    }
    if (!currentLoop) {
      localStorage.setItem('location-mode', CONFIG.locationMode)
      CONFIG.loop = getElement('loop-toggle-input').checked
      localStorage.setItem('loop', CONFIG.loop ? 'y' : 'n')
    }

    zipCode = args['zip-code'] || localStorage.getItem('zip-code')
    airportCode = args['airport-code'] || localStorage.getItem('airport-code')

    CONFIG.unitField = CONFIG.units === 'm' ? 'metric' : (CONFIG.units === 'h' ? 'uk_hybrid' : 'imperial')
    setSettingsLoading(true);
    fetchCurrentWeather();
  },
  load: () => {
    // A link like ?zip=55401 or ?airport=MSP starts straight away, looping unless &loop=0.
    // It's saved like a normal start, so the forecast keeps playing after each reload.
    let params = new URLSearchParams(location.search)
    let airport = params.has('airport')
    let linkLocation = airport ? params.get('airport') : params.get('zip')
    if (linkLocation && !(airport ? /^[A-Za-z0-9]{3,4}$/ : /^\d{5}$/).test(linkLocation)) {
      console.warn(`Ignoring invalid ${airport ? 'airport' : 'zip'} in the link: ${linkLocation}`)
      linkLocation = null
    }
    if (linkLocation) {
      localStorage.setItem(airport ? 'airport-code' : 'zip-code', linkLocation)
      localStorage.setItem('location-mode', airport ? 'AIRPORT' : 'POSTAL')
      localStorage.setItem('loop', params.get('loop') === '0' ? 'n' : 'y')
    }

    let settingsPrompt = getElement('settings-prompt')
    let advancedSettingsOptions = getElement('advanced-settings-options')

    //Advanced Options Setup
    CONFIG.options.forEach((option) => {
      let label = document.createElement('label')
      label.classList.add('settings-label')
      label.appendChild(document.createTextNode(option.name))
      label.id = `${option.id}-label`
      label.htmlFor = `${option.id}-text`
      let textbox = document.createElement('textarea')
      textbox.classList.add('settings-field')
      textbox.placeholder = option.desc
      textbox.id = `${option.id}-text`
      if (localStorage.getItem(option.id)) textbox.value = localStorage.getItem(option.id)
      advancedSettingsOptions.appendChild(label)
      advancedSettingsOptions.appendChild(textbox)
    })

    // Start button and advanced options toggle go above the advanced options
    let btn = document.createElement('button')
    btn.classList.add('start-button')
    btn.id = 'submit-button'
    btn.onclick = CONFIG.submit
    btn.appendChild(document.createTextNode('Start'))
    settingsPrompt.insertBefore(btn, advancedSettingsOptions)
    let advancedButton = document.createElement('button')
    advancedButton.innerHTML = "Show advanced options"
    advancedButton.id = "advanced-options-text"
    advancedButton.setAttribute('onclick', 'toggleAdvancedSettings()')
    advancedButton.setAttribute('aria-expanded', 'false')
    advancedButton.classList.add('advanced-toggle')
    settingsPrompt.insertBefore(advancedButton, advancedSettingsOptions)

    // Fill in the last location used, and start with Enter
    let zipCodeText = getElement('zip-code-text')
    let airportCodeText = getElement('airport-code-text')
    if (localStorage.getItem('zip-code')) zipCodeText.value = localStorage.getItem('zip-code')
    if (localStorage.getItem('airport-code')) airportCodeText.value = localStorage.getItem('airport-code')
    if (localStorage.getItem('location-mode') === 'AIRPORT') getElement('airport-code-button').checked = true
    let updateLocationMode = function(focus) {
      let airport = getElement('airport-code-button').checked
      document.querySelector('.location-picker').classList.toggle('airport-mode', airport)
      getElement('settings-error').innerHTML = ''
      if (focus) (airport ? airportCodeText : zipCodeText).focus()
    }
    updateLocationMode(false)
    getElement('zip-code-button').onchange = () => updateLocationMode(true)
    getElement('airport-code-button').onchange = () => updateLocationMode(true)
    ;[zipCodeText, airportCodeText].forEach((field) => field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btn.disabled) CONFIG.submit()
    }))
    zipCodeText.addEventListener('input', () => zipCodeText.value = zipCodeText.value.replace(/\D/g, ''))
    // Looping is on unless it was turned off
    getElement('loop-toggle-input').checked = localStorage.getItem('loop') !== 'n'
    if (CONFIG.loop || localStorage.getItem('loop') === 'y' || linkLocation) {
      CONFIG.loop = localStorage.getItem('loop') === 'y';
      CONFIG.started = true;
      hideSettings();
      CONFIG.submit()
    }
  }
}

CONFIG.unitField = CONFIG.units === 'm' ? 'metric' : (CONFIG.units === 'h' ? 'uk_hybrid' : 'imperial')
