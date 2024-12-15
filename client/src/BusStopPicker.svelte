<script>
  import { onMount } from "svelte"
  let allBusStops
  let query = ""
  let searchResults = []
  let placeholder = "Add bus stops"
  let busPredictions
  export let relevantBusStops
  $: relevantBusStopNames = relevantBusStops.map(stop => stop.Name + " (" + stop.StopID + ")")
  // $: console.log(searchResults)
  
  onMount(async () => {
    allBusStops = await getBusStops()
    searchResults = []

  })

  const getBusStops = async () => {
    const response = await fetch(`./bus_stops`)
    let stops = await response.json()
    stops.forEach(s => {
      s.stopNameForSearch = s.Name.toLowerCase().replace("'", "") + " (" + s.StopID + ")";
    })
    return stops
  }

  const searchBusStops = () => {
    if (query == "") {
      return searchResults = []
    }
    else {
      return searchResults = allBusStops.filter(stop => {
        gtag('event', 'busStopSearch', {"query": query})
        return stop.stopNameForSearch.includes(query.toLowerCase().replace("'", ""))
      })
    } 
    
  }

  const toggle = (stop) => { 
    if (relevantBusStops && stop) {
      let i = relevantBusStopNames.indexOf(stop.Name + " (" + stop.StopID + ")")
      if (i > -1) {
        relevantBusStops = [...relevantBusStops.slice(0, i), ...relevantBusStops.slice(i + 1)];
      }
      else {        
        relevantBusStops = [...relevantBusStops, stop]
      }
      localStorage.setItem("relevantBusStops", JSON.stringify(relevantBusStops));
      gtag('event', 'addBusStop', {"stop": stop})
    }
    query = ""
    searchBusStops()
  }



  
</script>
<input type="text" id="search" placeholder="🚌 {placeholder}" bind:value={query} on:input={searchBusStops}>
<table>
{#each searchResults as stop}
    <tr class="stop">
      <td>
        <button on:click={() => toggle(stop)} class="stop-result {relevantBusStopNames.indexOf(stop.Name) > -1 ? "is-relevant" : ""}" autocomplete="off">
          <span>{stop.Name}</span>
          <div>
            <span class="stop-id">{stop.StopID}</span>
          </div>
          <div class="routes">
            {#each stop.Routes as route}
              {#if !route.includes("*") && !route.includes("/")}
                <span class="route">{route}</span>
              {/if}
            {/each}
          </div>
        </button>
      </td>
      <!-- {JSON.stringify(station)} -->
    </tr>
  
{/each}
</table>    



<style>
  
  .stop {
    text-transform: uppercase;
    color: #FFF068;
    margin-bottom: 3px;
/*    font-family: "Open Sans";*/
  }
  #search {
    text-transform: uppercase;
/*    font-family: "Open Sans";*/
    color: #78a6ee;
    font-size: 22px;
    background-color: #21292f;
    width: 100%;
    border-width: 1px;
    border-radius: 10px;
  }
  ::placeholder {
    color: #78a6ee;
    opacity: 1; 
  }
  .is-relevant {
    background-color: #ffffffeb;
    color: black;
  }
  .route {
    background-color: red;
    color: white;
    margin-right: 2px;
    border-radius: 6px;
    padding: 2px;
  }
  .stop-id {
    background-color: #5977b5;
    color: white;
    margin: 2px;
    border-radius: 6px;
    padding: 2px;
    font-size: 18px;
  }
  .stop-result {
    text-align: left;
  }
</style>