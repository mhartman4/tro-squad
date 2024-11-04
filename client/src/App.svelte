<script>
  import { onMount } from "svelte"
  let trainPredictions, relevantStations;
  
  if (window.location.href.includes("?alex")) {
    relevantStations = ["NoMa-Gallaudet U", "Metro Center", "Rosslyn"]
  }
  else if (window.location.href.includes("?barry")) {
    relevantStations = ["Friendship Heights", "Farragut North", "Foggy Bottom-GWU", "Dupont Circle", "Waterfront"]
  }
  else {
    relevantStations = ["Congress Heights", "Gallery Pl-Chinatown", "Cleveland Park"]
  }
  

  onMount(async () => {
    trainPredictions = await getTrainPredictions()
    // TODO: figure out refreshes!
    // setInterval( () => {
    //   trainPredictions = getTrainPredictions()
    // }, 3000)
  })

  const getTrainPredictions = async () => {
    const response = await fetch(`./train_predictions`)
    return response.json()
  }

  
  
  
</script>
{#each relevantStations as station}
  <h1 class="station">🚉 {station}</h1>
  {#if trainPredictions}
    <table>
    {#each trainPredictions as train}
      {#if train.LocationName == station && train.Line != "YL" && train.Destination != "ssenger"}
        <tr class="train">
          <td><span class="dot {train.Line}"></span></td>
          <td>{train.Destination}&nbsp;&nbsp;&nbsp;&nbsp;</td>
          <td>{train.Min}</td>
        </tr>
      {/if}
    {/each}
    </table>
  {:else}
    Loading...
  {/if}
{/each}

<style>
  .dot {
    height: 15px;
    width: 15px;
    border-radius: 50%;
    display: inline-block;
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
    font-family: "VT323";
    text-transform: uppercase;
    color: #FF5442;
    margin-bottom: 3px;
  }
  .train {
    font-family: "VT323";
    text-transform: uppercase;
    color: #FFF068;
    font-size: 22px;
  }
</style>