<script>
  import Board from "./Board.svelte"
  import StationPicker from "./StationPicker.svelte"
  let relevantStations = []
  let relevantStationNames = ""
  if (localStorage.getItem("relevantStations")) {
      relevantStations = JSON.parse(localStorage.getItem("relevantStations"));
  }
  
  $: relevantStationNames = relevantStations.map(station => station.Name)

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
  }
  // localStorage.setItem("relevantStations", []);
  
</script>

<div class="relevant-stations">
  {#each relevantStations as station}
    <span class="station" on:click={() => toggle(station)}>{station.Name.length > 20 ? station.Name.substring(0,20) : station.Name}</span>
  {/each}
</div>

<StationPicker bind:relevantStations={relevantStations}/>
<Board bind:relevantStationNames={relevantStationNames} />
<style>
  .station {
    background-color: grey;
    border-radius: 5px;
    padding: 2px;
    margin: 2px;
    text-align: center;
  }

  .relevant-stations {
    margin: 5px;
    display: grid;
    width: 100%;
  }
</style>
