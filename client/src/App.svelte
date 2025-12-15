<script>
  import { onMount } from "svelte"
  import Board from "./Board.svelte"
  import BusBoard from "./BusBoard.svelte"
  import StationPicker from "./StationPicker.svelte"
  import BusStopPicker from "./BusStopPicker.svelte"
  
  let relevantStations = []
  let relevantStationNames = ""
  let relevantBusStops = []
  let relevantRailLines = []
  let incidents = []

  let hideBusses
  let showMapModal = false
  let mapData = null
  let mapInstance = null
  let stationSearching = false
  let busSearching = false
  let showIncidentModal = false
  let selectedIncidents = []
  let selectedLine = null
  
  // Marker management state
  let stopMarkersLayer = null
  let visibleMarkers = new Map() // Map<stopKey, marker> where stopKey is "Lat,Lon"
  let mapUpdateDebounceTimer = null
  let mapMoveHandler = null
  let mapZoomHandler = null

  
  if (localStorage.getItem("relevantStations")) {
      relevantStations = JSON.parse(localStorage.getItem("relevantStations"));
  }

  if (localStorage.getItem("relevantBusStops")) {
      relevantBusStops = JSON.parse(localStorage.getItem("relevantBusStops"));
  }

  if (localStorage.getItem("hideBusses")) {
      hideBusses = JSON.parse(localStorage.getItem("hideBusses"));
  }
  else {
    hideBusses = true
    localStorage.setItem("hideBusses", JSON.stringify(hideBusses));
  }
  
  $: relevantStationNames = relevantStations.map(station => station.Name)
  $: relevantRailLines = [...new Set(
    relevantStations.flatMap(station => station.Lines || [])
  )]
  $: relevantBusStops = relevantBusStops
  
  // Extract all unique lines from all incidents
  $: linesWithIncidents = [...new Set(
    incidents
      .filter(incident => {
        const linesAffected = incident.LinesAffected || incident.linesAffected || incident['Lines Affected']
        return linesAffected && linesAffected.trim()
      })
      .flatMap(incident => {
        const linesAffected = incident.LinesAffected || incident.linesAffected || incident['Lines Affected']
        // Parse LinesAffected - could be "RD;" or "RD;BL;"
        return linesAffected.split(';')
          .map(l => l.trim())
          .filter(l => l)
      })
  )]
  
  // Update map popups when relevantBusStops changes (only if map is already initialized)
  $: if (mapInstance && mapData && showMapModal) {
    setTimeout(() => {
      updateMapPopups()
    }, 50)
  }
  
  // Initialize map when modal opens
  $: if (showMapModal && mapData && !mapInstance) {
    setTimeout(() => {
      initMap()
    }, 200)
  }

  onMount(async () => {
    const response = await fetch('./incidents')
    incidents = await response.json()
    console.log('Incidents loaded:', incidents)
    if (incidents.length > 0) {
      console.log('First incident:', incidents[0])
      console.log('LinesAffected property:', incidents[0].LinesAffected)
    }
  })

  const hasIncidents = (line) => {
    if (!incidents || incidents.length === 0) {
      console.log(`hasIncidents(${line}): no incidents`)
      return false
    }
    const result = incidents.some(incident => {
      const linesAffected = incident.LinesAffected || incident.linesAffected || incident['Lines Affected']
      if (!linesAffected) return false
      const includes = linesAffected.includes(line)
      if (includes) {
        console.log(`hasIncidents(${line}): found match in "${linesAffected}"`)
      }
      return includes
    })
    console.log(`hasIncidents(${line}): returning ${result}`)
    return result
  }

  const getIncidentsForLine = (line) => {
    if (!incidents || incidents.length === 0) return []
    return incidents.filter(incident => {
      const linesAffected = incident.LinesAffected || incident.linesAffected || incident['Lines Affected']
      if (!linesAffected) return false
      return linesAffected.includes(line)
    })
  }

  const showIncidents = (line) => {
    selectedLine = line
    selectedIncidents = getIncidentsForLine(line)
    showIncidentModal = true
  }

  const closeIncidentModal = () => {
    showIncidentModal = false
    selectedIncidents = []
    selectedLine = null
  }

  const linkifyDescription = (text) => {
    if (!text) return ''
    
    // Escape HTML to prevent XSS
    const escapeHtml = (str) => {
      const div = document.createElement('div')
      div.textContent = str
      return div.innerHTML
    }
    
    const escapedText = escapeHtml(text)
    
    // URL regex pattern - matches http://, https://, and www.
    const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi
    
    return escapedText.replace(urlRegex, (url, offset) => {
      // Remove any trailing punctuation that might be part of sentence structure
      const cleanUrl = url.replace(/[.,;:!?)\]}>]+$/, '')
      // Add http:// if it starts with www.
      const href = cleanUrl.startsWith('www.') ? `http://${cleanUrl}` : cleanUrl
      // Get the original text after the URL to preserve trailing punctuation
      const afterUrl = escapedText.substring(offset + url.length)
      const trailingPunctMatch = afterUrl.match(/^[.,;:!?)\]}>]+/)
      const trailingPunct = trailingPunctMatch ? trailingPunctMatch[0] : ''
      
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>${trailingPunct}`
    })
  }

  const toggle = (station) => { 
    if (relevantStations && station) {
      let i = relevantStationNames.indexOf(station.Name)
      if (i > -1) {
        relevantStations = [...relevantStations.slice(0, i), ...relevantStations.slice(i + 1)];
        gtag('event', 'removeStation', {"station": station, "button": "top-button"})
      }
      else {        
        relevantStations = [...relevantStations, station]
      }
      localStorage.setItem("relevantStations", JSON.stringify(relevantStations));
    }
  }

  const toggleBusStop = (stop) => { 
    console.log("Toggle")   
    if (relevantBusStops && stop) {
      let i = relevantBusStops.indexOf(stop)
      console.log(i)
      if (i > -1) {
        console.log("Remove stop")        
        relevantBusStops = [...relevantBusStops.slice(0, i), ...relevantBusStops.slice(i + 1)];
        gtag('event', 'removeBusStop', {"stop": stop, "button": "top-button"})
      }
      else {
        relevantBusStops = [...relevantBusStops, stop]
      }
      localStorage.setItem("relevantBusStops", JSON.stringify(relevantBusStops));
    }
  }

  const addBusStopFromMap = (stop) => {
    if (relevantBusStops && stop) {
      const stopKey = stop.Name + " (" + stop.StopID + ")"
      const existingStop = relevantBusStops.find(s => s.Name + " (" + s.StopID + ")" === stopKey)
      
      if (!existingStop) {
        relevantBusStops = [...relevantBusStops, stop]
        localStorage.setItem("relevantBusStops", JSON.stringify(relevantBusStops));
        gtag('event', 'addBusStop', {"stop": stop, "source": "map"})
        
        // Update popup after adding
        if (mapInstance) {
          updateMapPopups()
        }
      }
    }
  }

  const isStopAdded = (stop) => {
    if (!relevantBusStops || !stop) return false
    const stopKey = stop.Name + " (" + stop.StopID + ")"
    return relevantBusStops.some(s => s.Name + " (" + s.StopID + ")" === stopKey)
  }

  // Get stop key for marker tracking
  const getStopKey = (stop) => {
    return `${stop.Lat},${stop.Lon}`
  }

  // Filter stops within map bounds (with buffer)
  const getStopsInBounds = (bounds, buffer = 0.2) => {
    if (!mapData || !mapData.allStops) return []
    
    // Expand bounds by buffer percentage
    const latDiff = bounds.getNorth() - bounds.getSouth()
    const lngDiff = bounds.getEast() - bounds.getWest()
    
    const expandedBounds = L.latLngBounds([
      [bounds.getSouth() - latDiff * buffer, bounds.getWest() - lngDiff * buffer],
      [bounds.getNorth() + latDiff * buffer, bounds.getEast() + lngDiff * buffer]
    ])
    
    return mapData.allStops.filter(stop => {
      if (!stop.Lat || !stop.Lon) return false
      return expandedBounds.contains([stop.Lat, stop.Lon])
    })
  }

  // Create a marker for a stop
  const createStopMarker = (stop) => {
    const isAdded = isStopAdded(stop)
    const stopColor = isAdded ? '#78a6ee' : '#FF0000'
    
    const stopIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${stopColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    })
    
    const popupContent = createStopPopupContent(stop)
    const marker = L.marker([stop.Lat, stop.Lon], {
      icon: stopIcon,
      title: stop.Name
    }).bindPopup(popupContent)
    
    return marker
  }

  // Update visible markers based on current map bounds
  const updateVisibleMarkers = () => {
    if (!mapInstance || !mapData || !stopMarkersLayer) return
    
    const bounds = mapInstance.getBounds()
    const stopsInBounds = getStopsInBounds(bounds, 0.2)
    const stopsInBoundsKeys = new Set(stopsInBounds.map(stop => getStopKey(stop)))
    
    // Remove markers that are no longer in bounds
    const keysToRemove = []
    visibleMarkers.forEach((marker, stopKey) => {
      if (!stopsInBoundsKeys.has(stopKey)) {
        stopMarkersLayer.removeLayer(marker)
        keysToRemove.push(stopKey)
      }
    })
    keysToRemove.forEach(key => visibleMarkers.delete(key))
    
    // Add markers for stops that are now in bounds
    stopsInBounds.forEach(stop => {
      const stopKey = getStopKey(stop)
      if (!visibleMarkers.has(stopKey)) {
        const marker = createStopMarker(stop)
        stopMarkersLayer.addLayer(marker)
        visibleMarkers.set(stopKey, marker)
      }
    })
  }

  const createStopPopupContent = (stop) => {
    const isAdded = isStopAdded(stop)
    const buttonText = isAdded ? "Added" : "Add"
    const buttonStyle = isAdded 
      ? "background-color: #78a6ee; color: white;"
      : "background-color: #394d76; color: white;"
    
    // Store stop data in data attribute for event handling
    const stopData = encodeURIComponent(JSON.stringify(stop))
    
    return `
      <div style="text-align: center; padding: 5px; font-family: 'VT323', monospace;">
        <div style="margin-bottom: 8px; font-weight: bold;">${stop.Name}</div>
        <button 
          class="add-stop-btn" 
          data-stop='${stopData}'
          style="${buttonStyle} border: none; border-radius: 5px; padding: 5px 15px; cursor: pointer; font-family: 'VT323', monospace;"
        >
          ${buttonText}
        </button>
      </div>
    `
  }

  const updateMapPopups = () => {
    if (!mapInstance || !mapData || !stopMarkersLayer) return
    
    // Update all visible stop markers' popups and icons
    visibleMarkers.forEach((marker, stopKey) => {
      const [lat, lon] = stopKey.split(',').map(Number)
      const stop = mapData.allStops.find(s => 
        Math.abs(s.Lat - lat) < 0.0001 && 
        Math.abs(s.Lon - lon) < 0.0001
      )
      if (stop) {
        // Update popup content
        marker.setPopupContent(createStopPopupContent(stop))
        
        // Update marker color based on whether stop is added
        const isAdded = isStopAdded(stop)
        const stopColor = isAdded ? '#78a6ee' : '#FF0000'
        const stopIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="background-color: ${stopColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
        marker.setIcon(stopIcon)
      }
    })
    
    // Re-attach event listeners after updating popups
    setTimeout(() => {
      attachPopupButtonListeners()
    }, 100)
  }

  let popupButtonHandler = null

  const attachPopupButtonListeners = () => {
    // Remove existing listener if any
    const mapElement = document.getElementById('map')
    if (mapElement && popupButtonHandler) {
      mapElement.removeEventListener('click', popupButtonHandler)
    }
    
    // Add new listener
    popupButtonHandler = (e) => {
      if (e.target.classList.contains('add-stop-btn')) {
        const stopData = e.target.getAttribute('data-stop')
        if (stopData) {
          try {
            const stop = JSON.parse(decodeURIComponent(stopData))
            addBusStopFromMap(stop)
          } catch (err) {
            console.error('Error parsing stop data:', err)
          }
        }
      }
    }
    
    if (mapElement) {
      mapElement.addEventListener('click', popupButtonHandler)
    }
  }

  const toggleBusMode = () => {
    hideBusses = !hideBusses
    localStorage.setItem("hideBusses", JSON.stringify(hideBusses));
  }

  const findClosestStop = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const userLat = position.coords.latitude
        const userLng = position.coords.longitude
        
        // Fetch all bus stops
        const response = await fetch(`./bus_stops`)
        const allStops = await response.json()
        
        // Calculate distance using Haversine formula
        const calculateDistance = (lat1, lon1, lat2, lon2) => {
          const R = 6371 // Earth's radius in km
          const dLat = (lat2 - lat1) * Math.PI / 180
          const dLon = (lon2 - lon1) * Math.PI / 180
          const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          return R * c
        }
        
        // Calculate distance for each stop and sort
        const stopsWithDistance = allStops
          .filter(stop => stop.Lat && stop.Lon) // Only stops with coordinates
          .map(stop => ({
            ...stop,
            distance: calculateDistance(userLat, userLng, stop.Lat, stop.Lon)
          }))
          .sort((a, b) => a.distance - b.distance)
        
        // Get the 7th closest stop's distance to determine zoom level (shows ~5-10 stops)
        const referenceDistance = (stopsWithDistance[6] && stopsWithDistance[6].distance) || 1 // km
        // Calculate zoom level: closer stops need higher zoom, further need lower
        // Rough formula: zoom 15 = ~0.5km, zoom 14 = ~1km, zoom 13 = ~2km
        let zoomLevel = 14
        if (referenceDistance < 0.5) {
          zoomLevel = 15
        } else if (referenceDistance < 1) {
          zoomLevel = 14
        } else if (referenceDistance < 2) {
          zoomLevel = 13
        } else {
          zoomLevel = 12
        }
        
        console.log(stopsWithDistance)
        
        // Store map data and show modal (all stops, not just 10)
        mapData = {
          userLocation: { lat: userLat, lng: userLng },
          allStops: stopsWithDistance,
          zoomLevel: zoomLevel
        }
        showMapModal = true
      }, (error) => {
        console.error("Error getting location:", error)
      })
    } else {
      console.error("Geolocation is not supported by this browser")
    }
  }

  const closeMapModal = () => {
    showMapModal = false
    
    // Clean up map event handlers
    if (mapInstance) {
      if (mapMoveHandler) {
        mapInstance.off('moveend', mapMoveHandler)
        mapMoveHandler = null
      }
      if (mapZoomHandler) {
        mapInstance.off('zoomend', mapZoomHandler)
        mapZoomHandler = null
      }
      mapInstance.remove()
      mapInstance = null
    }
    
    // Clean up debounce timer
    if (mapUpdateDebounceTimer) {
      clearTimeout(mapUpdateDebounceTimer)
      mapUpdateDebounceTimer = null
    }
    
    // Clean up marker layer and tracking
    if (stopMarkersLayer) {
      stopMarkersLayer.clearLayers()
      stopMarkersLayer = null
    }
    visibleMarkers.clear()
    
    mapData = null
    
    // Clean up event listener
    const mapElement = document.getElementById('map')
    if (mapElement && popupButtonHandler) {
      mapElement.removeEventListener('click', popupButtonHandler)
      popupButtonHandler = null
    }
  }

  const initMap = () => {
    if (!mapData) return
    
    // Wait for Leaflet to be available
    if (!window.L) {
      // Check if script is already being loaded
      if (document.querySelector('script[src*="leaflet"]')) {
        // Wait for it to load
        const checkLeaflet = setInterval(() => {
          if (window.L) {
            clearInterval(checkLeaflet)
            createMap()
          }
        }, 100)
        return
      }
      // Leaflet should already be loaded from HTML, but wait a bit
      setTimeout(() => {
        if (window.L) {
          createMap()
        }
      }, 100)
      return
    }
    
    createMap()
  }

  const createMap = () => {
    if (!mapData || !window.L) return
    
    const mapElement = document.getElementById('map')
    if (!mapElement) return
    
    // Clear existing map if it exists
    if (mapInstance) {
      mapInstance.remove()
      mapInstance = null
    }
    
    // Reset marker tracking
    visibleMarkers.clear()
    stopMarkersLayer = null
    
    // Create map centered on user location with calculated zoom level
    const zoomLevel = mapData.zoomLevel || 14
    mapInstance = L.map(mapElement).setView(
      [mapData.userLocation.lat, mapData.userLocation.lng],
      zoomLevel
    )
    
    // Add dark mode tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19
    }).addTo(mapInstance)
    
    // Create pin icon for user location (blue)
    const userIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    })
    
    // Add user location marker
    const userMarker = L.marker([mapData.userLocation.lat, mapData.userLocation.lng], {
      icon: userIcon,
      title: 'Your Location'
    }).addTo(mapInstance).bindPopup('Your Location')
    
    // Create LayerGroup for stop markers
    stopMarkersLayer = L.layerGroup().addTo(mapInstance)
    
    // Add initial markers for stops in viewport
    updateVisibleMarkers()
    
    // Attach event listeners for popup buttons
    attachPopupButtonListeners()
    
    // Add debounced event handlers for map movement
    const debouncedUpdateMarkers = () => {
      if (mapUpdateDebounceTimer) {
        clearTimeout(mapUpdateDebounceTimer)
      }
      mapUpdateDebounceTimer = setTimeout(() => {
        updateVisibleMarkers()
      }, 250)
    }
    
    mapMoveHandler = debouncedUpdateMarkers
    mapZoomHandler = debouncedUpdateMarkers
    
    mapInstance.on('moveend', mapMoveHandler)
    mapInstance.on('zoomend', mapZoomHandler)
    
    // Center map on user location
    mapInstance.setView([mapData.userLocation.lat, mapData.userLocation.lng], 14)
  }
  
</script>

<div class="relevant-lines">
  {#each linesWithIncidents as line}
    <span class="dot {line}" on:click={() => showIncidents(line)}>
      <span class="incident-indicator">!</span>
    </span>
  {/each}
</div>

<div class="relevant-stations">
  {#each relevantStations as station}
    <span class="station" on:click={() => toggle(station)}>{station.Name.length > 20 ? station.Name.substring(0,20) : station.Name}
    </span>
  {/each}
</div>

{#if !hideBusses}
  <div class="relevant-stations">
    {#each relevantBusStops as stop}
      <span class="bus-stop" on:click={() => toggleBusStop(stop)}>{stop.Name + " (" + stop.StopID + ")"}</span>
    {/each}
  </div>
{/if}
<StationPicker bind:relevantStations={relevantStations} bind:hideBusses={hideBusses} bind:isSearching={stationSearching}/>

{#if !hideBusses}
  <BusStopPicker bind:relevantBusStops={relevantBusStops} bind:isSearching={busSearching}/>
  <button class="find-closest-stop" on:click={findClosestStop}>📍 Bus stop map</button>
{/if}

<Board bind:relevantStationNames={relevantStationNames} bind:hideBusses={hideBusses} showMapModal={showMapModal} isSearching={stationSearching || busSearching} />
{#if !hideBusses}
  <BusBoard bind:relevantBusStops={relevantBusStops}/>
{/if}

<br>
<button id="hide-busses" on:click={() => toggleBusMode()}>{hideBusses ? "🚌 Show Busses too!" : "🚌 Hide Busses"}</button>

{#if showMapModal}
  <div class="map-modal-overlay" on:click={closeMapModal}>
    <div class="map-modal" on:click|stopPropagation>
      <button class="map-close" on:click={closeMapModal}>×</button>
      <div id="map" class="map-container"></div>
    </div>
  </div>
{/if}

{#if showIncidentModal}
  <div class="incident-modal-overlay" on:click={closeIncidentModal}>
    <div class="incident-modal" on:click|stopPropagation>
      <button class="incident-close" on:click={closeIncidentModal}>×</button>
      <div class="incident-header">
        <span class="dot {selectedLine}"></span>
        <span class="incident-header-text {selectedLine}">Incidents</span>
      </div>
      <div class="incident-content">
        {#each selectedIncidents as incident}
          <div class="incident-item">
            {@html linkifyDescription(incident.Description || incident.description || 'No description available')}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .station {
    background-color: #e5e1e1;;
    border-radius: 5px;
    padding: 2px;
    margin: 2px;
    text-align: center;
    color: #ff5441;
  }

  .bus-stop {
    background-color: #78a6ee;;
    border-radius: 5px;
    padding: 2px;
    margin: 2px;
    text-align: center;
    color: #394d76;
/*    font-family: "Open Sans";*/
/*    font-size: 12px;*/
  }

  .relevant-lines {
    margin: 5px;
    display: flex;
    width: 100%;
    gap: 5px;
  }

  .relevant-lines :global(.dot) {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .incident-indicator {
    position: absolute;
    color: white;
    font-weight: bold;
    font-size: 12px;
    line-height: 1;
    text-align: center;
  }

  .relevant-stations {
    margin: 5px;
    display: flex;
    width: 100%;
  }

  #hide-busses {
    background-color: #394d76;
    color: white;
    border-width: 0px;
  }

  .find-closest-stop {
    font-size: 14px;
    padding: 4px 8px;
    margin: 5px 0;
    background-color: #394d76;
    color: white;
    border-width: 0px;
  }

  .map-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .map-modal {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: #21292f;
    padding: 0;
    border: none;
    border-radius: 0;
  }

  .map-close {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: #394d76;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 24px;
    cursor: pointer;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .map-close:hover {
    background-color: #5977b5;
  }

  .map-container {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  :global(.custom-marker) {
    background: transparent;
    border: none;
  }

  .incident-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .incident-modal {
    position: relative;
    background-color: #21292f;
    border-radius: 10px;
    padding: 20px;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .incident-close {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: #394d76;
    color: white;
    border: none;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .incident-close:hover {
    background-color: #5977b5;
  }

  .incident-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .incident-header-text {
    font-family: "VT323", monospace;
    font-size: 24px;
    font-weight: bold;
    background-color: transparent;
  }

  .incident-header-text.RD { color: red; background-color: transparent; }
  .incident-header-text.SV { color: silver; background-color: transparent; }
  .incident-header-text.YL { color: yellow; background-color: transparent; }
  .incident-header-text.BL { color: blue; background-color: transparent; }
  .incident-header-text.OR { color: orange; background-color: transparent; }
  .incident-header-text.GR { color: green; background-color: transparent; }

  .incident-content {
    color: white;
    font-family: "VT323", monospace;
  }

  .incident-item {
    margin-bottom: 15px;
    padding: 10px;
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 5px;
    font-size: 18px;
    line-height: 1.4;
  }

  .incident-item:last-child {
    margin-bottom: 0;
  }

  .incident-item a {
    color: rgb(0, 100, 200);
    text-decoration: underline;
  }

  .incident-item a:hover {
    color: rgb(0, 150, 255);
  }
</style>
