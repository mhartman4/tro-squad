<script>
  import { onMount } from "svelte"
  let allStations
  let query = ""
  let searchResults = []
  export let relevantStations
  $: relevantStationNames = relevantStations.map(station => station.Name)

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
    }
    query = ""
    searchStations()
  }



  
</script>
<input type="text" id="search" placeholder="🔍 Add stations" bind:value={query} on:input={searchStations}>
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
  .dot {
    height: 15px;
    width: 15px;
    border-radius: 50%;
    display: inline-block;
    margin-left: 2px;
    margin-right: 2px;
  }
  .RD {
    background-color: red;
  }

  .SV {
    background-color: silver;
  }

  .YL {
    background-color: yellow;
  }
  .BL {
    background-color: blue;
  }
  .OR {
    background-color: orange;
  }
  .GR {
    background-color: green;
  }
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