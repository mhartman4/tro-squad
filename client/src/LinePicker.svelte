<script>
  export let possibleLines
  export let relevantLines
</script>


{#each possibleLines as line}
  <span class="dot {line}"></span>&nbsp;
{/each}