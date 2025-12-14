<script>
  import { onMount } from "svelte"
  let allBusStops
  let query = ""
  let debouncedQuery = ""
  let searchResults = []
  let placeholder = "Add bus stops"
  let busPredictions
  export let relevantBusStops
  let relevantBusStopSet = new Set()
  
  // Debounce query updates
  let debounceTimer
  $: {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQuery = query
    }, 150)
  }
  
  // Update Set for O(1) relevance checks
  $: relevantBusStopSet = new Set(
    relevantBusStops.map(stop => stop.Name + " (" + stop.StopID + ")")
  )
  
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

  // Normalize query once
  const normalizeQuery = (q) => {
    return q.toLowerCase().replace("'", "")
  }

  // Check if all query characters appear in order (fuzzy match)
  const fuzzyMatch = (text, query) => {
    let textIndex = 0
    let queryIndex = 0
    
    while (textIndex < text.length && queryIndex < query.length) {
      if (text[textIndex] === query[queryIndex]) {
        queryIndex++
      }
      textIndex++
    }
    
    return queryIndex === query.length
  }

  // Check if all words in query appear in text (word-order independent)
  const wordOrderIndependentMatch = (text, query) => {
    const queryWords = query.trim().split(/\s+/).filter(w => w.length > 0)
    if (queryWords.length === 0) return false
    
    // Check if all words appear somewhere in the text
    return queryWords.every(word => {
      // Try exact word match first
      if (text.includes(word)) return true
      // Fall back to fuzzy character-in-order match for each word
      return fuzzyMatch(text, word)
    })
  }

  // Calculate simple edit distance for typo handling (only for short queries)
  const simpleEditDistance = (text, query) => {
    if (query.length > 10) return Infinity // Skip for long queries to keep it fast
    
    const m = text.length
    const n = query.length
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
    
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (text[i - 1] === query[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          )
        }
      }
    }
    
    return dp[m][n]
  }

  // Score a match: higher is better
  const scoreMatch = (stop, normalizedQuery) => {
    const searchText = stop.stopNameForSearch
    
    // Tier 1: Exact substring match (highest priority)
    if (searchText.includes(normalizedQuery)) {
      // Bonus for matches at the start
      if (searchText.startsWith(normalizedQuery)) {
        return 100
      }
      return 90
    }
    
    // Tier 1.5: Word-order independent match (all words present, any order)
    if (wordOrderIndependentMatch(searchText, normalizedQuery)) {
      // Score based on word positions and how close they are
      const queryWords = normalizedQuery.trim().split(/\s+/).filter(w => w.length > 0)
      let score = 80
      
      // Bonus if words appear in the same order as query
      let lastIndex = -1
      let wordsInOrder = true
      for (const word of queryWords) {
        const index = searchText.indexOf(word)
        if (index === -1) {
          wordsInOrder = false
          break
        }
        if (index < lastIndex) {
          wordsInOrder = false
          break
        }
        lastIndex = index
      }
      
      if (wordsInOrder) {
        score = 85 // Slight bonus for words in order
      }
      
      return score
    }
    
    // Tier 2: Fuzzy match (characters in order)
    if (fuzzyMatch(searchText, normalizedQuery)) {
      // Score based on how close the match is (fewer gaps = higher score)
      let score = 70
      let textIndex = 0
      let queryIndex = 0
      let gaps = 0
      
      while (textIndex < searchText.length && queryIndex < normalizedQuery.length) {
        if (searchText[textIndex] === normalizedQuery[queryIndex]) {
          queryIndex++
        } else {
          gaps++
        }
        textIndex++
      }
      
      // Reduce score based on gaps (but keep it above typo scores)
      score = Math.max(50, score - Math.min(gaps * 2, 20))
      return score
    }
    
    // Tier 3: Typo handling (edit distance) - only for short queries
    if (normalizedQuery.length <= 10) {
      const distance = simpleEditDistance(searchText, normalizedQuery)
      const maxDistance = Math.floor(normalizedQuery.length / 3) // Allow ~33% errors
      
      if (distance <= maxDistance) {
        // Score inversely proportional to distance
        return Math.max(10, 40 - (distance * 5))
      }
    }
    
    return 0 // No match
  }

  // Perform search with debounced query
  $: {
    if (debouncedQuery === "") {
      searchResults = []
    } else {
      const normalizedQuery = normalizeQuery(debouncedQuery)
      
      // Track search event once (not per item)
      if (normalizedQuery.length > 0) {
        gtag('event', 'busStopSearch', {"query": debouncedQuery})
      }
      
      // Score and filter all stops
      const scoredResults = allBusStops
        .map(stop => ({
          stop,
          score: scoreMatch(stop, normalizedQuery)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score) // Sort by score descending
        .slice(0, 50) // Limit to top 50 results
        .map(item => item.stop) // Extract just the stops
      
      searchResults = scoredResults
    }
  }

  const toggle = (stop) => { 
    if (relevantBusStops && stop) {
      const stopKey = stop.Name + " (" + stop.StopID + ")"
      let i = relevantBusStops.findIndex(s => s.Name + " (" + s.StopID + ")" === stopKey)
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
  }



  
</script>
<input type="text" id="search" placeholder="🚌 {placeholder}" bind:value={query}>
<table>
{#each searchResults as stop}
    <tr class="stop">
      <td>
        <button on:click={() => toggle(stop)} class="stop-result {relevantBusStopSet.has(stop.Name + " (" + stop.StopID + ")") ? "is-relevant" : ""}" autocomplete="off">
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