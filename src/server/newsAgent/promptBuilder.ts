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

Important context:
- Each planet uses its own currency (see currencyInfo section for names and exchange rates).
- There are fixed supply chains: raw resources → refined materials → manufactured goods → services.
- A price shock in one resource can cascade downstream.
- When writing, use human-readable month/year dates (not tick numbers).
- Demographic data (demographicDeltas + demographics inside economyDeltas) shows population health:
  - employmentRate = fraction of population with jobs (higher = healthier)
  - serviceStarvation (0-1): how starved the population is for essential services. High grocery starvation = mortality crisis. High healthcare starvation = disability surge.
  - serviceBuffers: how many days of service reserves the population has.
  - deathRatePer100k: annualized deaths per 100,000 people. Spikes indicate famine or disaster.
  - Rising unemployment + rising starvation = recession signal.
  - If population goes to zero agents still have money and resources. But these are ghost signals. Just ignore.
    

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
