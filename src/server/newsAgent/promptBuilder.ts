import type { CondensedReport } from './types';

/**
 * Build a concise prompt using only the pre-computed delta data.
 * No raw agent/planet dumps — just the interesting bits.
 */
export function buildNewsPrompt(condensed: CondensedReport): string {
    const dataJson = JSON.stringify(condensed, null, 2);
    const interval = condensed.pd
        ? `This report covers the period from ${condensed.pd} to ${condensed.d}.`
        : `This is the first report, covering ${condensed.d}.`;

    return `
    You are a news agent tasked with finding interesting stories.
In the following, we provide an extensive overview of the current economic situation.

${interval}

CONDENSED REPORT (JSON):
${dataJson}

TYPE GUIDE — what each field in the JSON means:
────────────────────────────────────────────
Top-level fields:
  t  = simulation tick number
  d  = current date string (e.g. "September 2233")
  pd = previous date string (null for first report)
  a  = top wealth gainers (sorted by absolute delta, descending)
  b  = bottom wealth losers (sorted by absolute delta, descending)
  fp = facility performance (aggregated by facility type across all planets)
  rg = resource production gaps
  rc = root cause chains (bottleneck propagation)
  pl = planet snapshots (current month)
  pd_d = planet deltas (month-over-month changes)
  cv = commodity price volatility
  ci = currency info per planet

AgentDelta (a and b arrays):
  aid = agentId
  n   = agent name
  pid = associated planetId
  pn  = previous net balance (balance one month ago)
  cn  = current net balance
  d   = absolute change in net balance (cn - pn)
  dp  = percentage change in net balance

FacilityPerf (fp array) — one entry per facility type:
  n   = facility type name (e.g. "Iron Mine", "Bakery")
  c   = instance count (how many of this facility exist across all agents)
  sc  = total scale currently used
  msc = total max scale (capacity)
  eff = scale-weighted average efficiency (0.0 to 1.0, higher = better)
  bn  = bottleneck type: "w"=worker shortage, "r"=resource shortage, ""=none
  wi  = worst input name (education level if bn=w, resource name if bn=r)
  wiv = worst input value (fill rate 0.0-1.0, lower = more severe bottleneck)
  out = map of resource name → actual quantity produced per tick

ResourceGap (rg array) — production shortfalls:
  n   = resource name
  act = actual production per tick
  max = theoretical max production per tick (if all facilities had full inputs)
  rat = ratio act/max (0.0-1.0, lower = worse shortage)

RootCause (rc array) — bottleneck propagation chains:
  fac = root facility name (origin of the bottleneck)
  rt  = root type: "w"=worker shortage, "rs"=resource shortage, "mf"=market failure
  ri  = root resource name (for rs/mf types)
  riv = root resource production ratio (0.0-1.0)
  v   = list of downstream facility names affected by this bottleneck

PlanetSnap (pl array) — current month planet stats:
  id   = planetId
  n    = planet name
  pop  = population
  gdpPC = GDP per capita
  emp  = employment rate (0.0-1.0, higher = more people employed)
  dr   = death rate per 100,000 people (annualized)
  col  = cost of living index
  gStv = grocery service starvation (0.0-1.0, >0.3 = crisis)
  hStv = healthcare starvation (0.0-1.0, high = disability surge)
  eStv = education starvation (0.0-1.0)
  rStv = retail starvation (0.0-1.0)

PlanetDelta (pd_d array) — month-over-month changes:
  id    = planetId
  n     = planet name
  gdpPC_d = GDP per capita change (%)
  pop_d = population change (%)
  emp_d = employment rate change (absolute, -1.0 to 1.0)
  col_d = cost of living change (%)
  ms_d  = money supply change (%)
  dr_d  = death rate change (absolute change in deaths/100k)

CommodityVol (cv array) — volatile prices:
  pid = planetId
  pn  = planet name
  rn  = resource name
  d   = price change (%)

CurInfo (ci array) — currency details:
  pid = planetId
  pn  = planet name
  cn  = currency name
  sy  = currency symbol
  ex  = exchange rate to the base currency

────────────────────────────────────────────

Important context:
- Each planet uses its own currency (see CurInfo for names and exchange rates).
- There are fixed supply chains: raw resources → refined materials → manufactured goods → services.
- A price shock in one resource can cascade downstream.
- When writing, use human-readable month/year dates (not tick numbers).
- Starvation values (0-1): how starved the population is for essential services. High grocery starvation = mortality crisis. High healthcare starvation = disability surge.
- Death rate per 100k: annualized deaths per 100,000 people. Spikes indicate famine or disaster.
- Rising unemployment + rising starvation = recession signal.
- If population goes to zero, agents may still have money and resources. But these are ghost signals. Ignore them.
- "bn" = "w" means facilities can't find enough workers. "bn" = "r" means facilities lack input resources.
- A facility bottleneck cascades: if Coal Mines produce poorly, everything downstream (Steel Mills → Factories) slows.
- Resource gap ratio < 0.7 means the economy is producing <70% of theoretical capacity for that good.

Focus on:
1. The rise and fall of major agents — who gained/lost the most wealth and why might that be.
2. Volatile commodities — where prices are swinging and what downstream effects they may have.
3. Demographic stress — which planets have rising starvation, mortality spikes, or high unemployment.
4. Overall economic health — which planets are growing, which are struggling.

Return JSON array of articles with format:
[
  {
    "title": "string",
    "summary": "string",
    "planetId": "string | null",
    "category": "agent | commodity | economy | population",
    "importance": 1-10
  }
]

Only include articles for genuinely interesting or surprising events.
Use a neutral reporting style. 
Do not fabricate data — base everything on the numbers provided.`;
}
