<script>
  import { onMount } from "svelte"
  let allStations
  let query = ""
  let searchResults = []
  let placeholder = "Add train stations"
  export let relevantStations, hideBusses
  
  // Export search state so parent can check if user is searching
  export let isSearching = false
  $: isSearching = query.length > 0
  $: relevantStationNames = relevantStations.map(station => station.Name)
  // $: placeholder = relevantStations.length == 0 ? "Add stations" : ""
  onMount(async () => {
    allStations = await getStations()
    searchResults = []
  })

  const getStations = async () => {
    const response = await fetch(`./stations`)
    return response.json()
  }

  const searchStations = () => {
    if (query == "") {
      return searchResults = []
    }
    else {
      return searchResults = allStations.filter(station => {
        gtag('event', 'stationSearch', {"query": query})
        let stationName = station.Name.toLowerCase().replace("'", "");
        return stationName.includes(query.toLowerCase().replace("'", ""))
      })
    } 
    
  }

  const toggle = (station) => { 
    if (relevantStations && station) {
      let i = relevantStationNames.indexOf(station.Name)
      if (i > -1) {
        relevantStations = [...relevantStations.slice(0, i), ...relevantStations.slice(i + 1)];
      }
      else {        
        relevantStations = [...relevantStations, station]
      }
      localStorage.setItem("relevantStations", JSON.stringify(relevantStations));
      gtag('event', 'addStation', {"station": station})
    }
    query = ""
    searchStations()
  }



  
</script>
<input type="text" id="search" placeholder="{hideBusses ? "" : "🚆"} {placeholder}" bind:value={query} on:input={searchStations}>
<table>
{#each searchResults as station}
    <tr class="station">
      <td>
        <button on:click={() => toggle(station)} class="{relevantStationNames.indexOf(station.Name) > -1 ? "is-relevant" : ""}" autocomplete="off">
          {station.Name.length > 20 ? station.Name.substring(0,20) : station.Name}
          {#each station.Lines as line}
            {#if line}
              <span class="dot {line}"></span>
            {/if}
          {/each}
        </button>
      </td>
      <!-- {JSON.stringify(station)} -->
    </tr>
  
{/each}
</table>    



<style>
  
  .station {
    text-transform: uppercase;
    color: #FFF068;
    margin-bottom: 3px;
  }
  .lines {
    text-align: left;
  }
  #search {
    text-transform: uppercase;
    color: #FF5442;
    font-size: 22px;
    background-color: #21292f;
    width: 100%;
    border-width: 1px;
    border-radius: 10px;
  }
  ::placeholder {
    color: #FFF068;
    opacity: 1; 
  }
  .is-relevant {
    background-color: #ffffffeb;
    color: black;
  }
</style>