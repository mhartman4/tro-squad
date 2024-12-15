<script>
  import Board from "./Board.svelte"
  import BusBoard from "./BusBoard.svelte"
  import StationPicker from "./StationPicker.svelte"
  import BusStopPicker from "./BusStopPicker.svelte"
  
  let relevantStations = []
  let relevantStationNames = ""
  let relevantBusStops = []

  let hideBusses

  
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
  $: relevantBusStops = relevantBusStops

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

  const toggleBusMode = () => {
    hideBusses = !hideBusses
    localStorage.setItem("hideBusses", JSON.stringify(hideBusses));
  }
  
</script>

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
<StationPicker bind:relevantStations={relevantStations} bind:hideBusses={hideBusses}/>

{#if !hideBusses}
  <BusStopPicker bind:relevantBusStops={relevantBusStops}/>
{/if}

<Board bind:relevantStationNames={relevantStationNames} bind:hideBusses={hideBusses} />
{#if !hideBusses}
  <BusBoard bind:relevantBusStops={relevantBusStops}/>
{/if}

<br>
<button id="hide-busses" on:click={() => toggleBusMode()}>{hideBusses ? "🚌 Show Busses too!" : "🚌 Hide Busses"}</button>

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
</style>
