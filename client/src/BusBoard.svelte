<script>
  
  let busPredictions;
  export let relevantBusStops;

  const getBusPredictions = async (stops) => {
    const response = await fetch(`./bus_predictions/` + JSON.stringify(stops.map(stop => {return stop.StopID})))
    busPredictions = await response.json()
  }
  
  $: getBusPredictions(relevantBusStops)


</script>
{#if relevantBusStops}
  {#each relevantBusStops as stop}
    <h1 class="board-stop">🚌 {stop.Name}<span class="stop-id">{stop.StopID}</span></h1>
    
    {#if busPredictions && busPredictions[stop.StopID]}
      <table>
        {#each busPredictions[stop.StopID] as bus}
          <tr class="bus">
            <td><span class="route">{bus.RouteID}</span></td>
            <td>{bus.DirectionText}&nbsp;&nbsp;&nbsp;&nbsp;</td>
            <td>{bus.Minutes}</td>
          </tr>
        {/each}
      </table>
    {:else}
      Loading...
    {/if}
  {/each}
{/if}

<style>
  .board-stop {
    text-transform: uppercase;
    color: #78a6ee;
    margin-bottom: 3px;
    font-size: 28px;
  }
  .bus {
    color: white;
    font-size: 20px;
  }
  .stop-id {
    background-color: #78a6ee;
    color: #394d76;
    margin: 2px;
    border-radius: 6px;
    padding: 2px;
    font-size: 18px;
  }
  
  .route {
    color: white;
    padding: 0px 7px;
    background-color: rgb(157 31 26);
  }
  .stop-number {
    background-color: white;
    color: rgb(43 45 93);
  }
</style>