<script>
  import { onMount } from "svelte"
  let trainPredictions;
  export let relevantStationNames;

  onMount(async () => {
    trainPredictions = await getTrainPredictions()
  })

  const getTrainPredictions = async () => {
    const response = await fetch(`./train_predictions`)
    return response.json()
  }

</script>
{#if relevantStationNames}
  {#each relevantStationNames as station}
    <h1 class="board-station">{station.length > 20 ? station.substring(0,20) : station}</h1>
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
{/if}

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
  .board-station {
    text-transform: uppercase;
    color: #FF5442;
    margin-bottom: 3px;
  }
  .train {
    text-transform: uppercase;
    color: #FFF068;
    font-size: 22px;
  }
</style>