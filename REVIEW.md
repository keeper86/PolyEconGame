# Code Review: Changes Across 6 Commits

## 1. Overview

| Commit    | Message                           | Files Changed                                        |
| --------- | --------------------------------- | ---------------------------------------------------- |
| `8b2acdf` | new currency names                | 6 (currency renames + image assets)                  |
| `2c6c586` | Extract cost of living            | 3 (refactor into reusable functions + `minimumWage`) |
| `c4dcacf` | introduce global kpis             | 17 (database, worker, UI — full-stack feature)       |
| `2bdc78a` | polish                            | 3 (chart visual polish)                              |
| `c505b9b` | Add macroeconomic indicator chart | 11 (page restructure + UI components)                |

---

## 2. Feature Summary

### Currency Renames (8b2acdf)

- Paradies-Pesete → **Paraseto**
- Naaavi → **Tinar** (Pandara)
- Alphas → **Centas** (Alpha-Centauri)
- Symbol ₳ → **₡** (Alpha-Centauri)
- New placeholder currency images added

### Cost-of-Living Extraction (2c6c586)

- `computeTierCost(marketPrices, tier)` — reusable tier cost calculator
- `computeCostOfLiving(marketPrices, whenRich)` — for rich/normal cost-of-living
- `minimumWage(planet, age, edu, skill)` — new minimum wage function in workforce.ts
- Refactored `intergenerationalTransfers` to use `computeTierCost`

### Global KPIs / Planet Economy History (c4dcacf)

- **New hypertable**: `planet_economy_history` — per-tick rows for every planet
    - GDP (annualised: `Σ(clearingPrice × totalVolume) × 360`)
    - Cost of living (normal + rich)
    - Wages by education level (0–3)
    - Policy rate, bank equity, money supply
- **Continuous aggregates**: `planet_economy_monthly`, `planet_economy_yearly`, `planet_economy_decade`
- Worker flushes every month boundary asynchronously
- New `GranularityButtonGroup` UI component for time-range switching
- TypeScript types in `db_schemas.ts`

### Central Bank UI Restructure (c505b9b)

- `BankPanel` + `LoanPanel` **moved** from agent financial page → new `/central-bank` sub-page
- `PlanetCostOfLivingChart` + `PlanetMacroChart` moved into central-bank scope
- New `CreditButton` component with LTV/variant styling
- `financialChartLogic.ts` — shared granularity constants
- Navigation: `PlanetsNavEntry` now includes "Central Bank" entry with Landmark icon

### Chart Polish (2bdc78a)

- Cost-of-living chart now uses **stacked areas**: `costOfLiving` + `costOfLivingRichDiff`
- Tooltip combines both into one row with range display ("X — Y")
- Ghost (previous year) series stacked consistently
- Yearly views limited to last 11 data points
- Wage legend labels cleaned up (removed parentheses)

---

## 3. Issues & Potential Bugs

### ❌ Critical: Currency Name Mismatch in `InterPlanetSection.tsx`

**File**: `src/app/simulation/sections/InterPlanetSection.tsx` (lines 41–42)

The hardcoded table still shows:

```
['Pandara', 'Naaavi', '₦'],
['Alpha-Centauri', 'Alphas', '₳'],
```

But `currencyResources.ts` was updated to `Tinar`, `Centas`, and `₡` in commit `8b2acdf`. This display is now out of sync with the actual currency data.

**Fix**: Update the two rows to match:

```
['Pandara', 'Tinar', '₦'],
['Alpha-Centauri', 'Centas', '₡'],
```

### ⚠️ Medium: Decade View Type Hole in Cost-of-Living Chart

**File**: `src/app/planets/[planetId]/central-bank/_components/PlanetCostOfLivingChart.tsx`

The decade data path uses runtime `'…' in p` checks with type assertions (`p as ChartPoint`), suggesting the decade data type may not include `costOfLivingRichDiff`/ghost fields. Works at runtime but fragile.

### ⚠️ Medium: Missing Trailing Newlines

Files from these commits are missing final newlines, which may trigger prettier/eslint:

- `FinancialTooltip.tsx`
- `PlanetMacroChart.tsx`
- `PlanetCostOfLivingChart.tsx`
- `financialChartLogic.ts`
- `central-bank/page.tsx`

### ⚠️ Medium: `minimumWage` is Dead Code

**File**: `src/simulation/workforce/workforce.ts`

The `minimumWage` function is exported but not imported or used anywhere in the changed files. Unless consumed elsewhere in the codebase, it's unreachable.

### ℹ️ Low: GDP Annualisation Noise Potential

GDP = `Σ(clearingPrice × totalVolume) × 360` annualises a single tick. Zero-trade ticks cause GDP to snap to ~0. The code already uses `avgMarketResult` (EMA-smoothed), which mitigates this. The comment in the worker correctly notes this.

### ℹ️ Resolved: `planet_economy_decade` View

The migration correctly creates the decade continuous aggregate at lines 75–94. The `getPlanetEconomyHistoryAggregated()` function's reference to `planet_economy_decade` is valid.

---

## 4. Recommended Fixes

1. **Fix currency display table** in `InterPlanetSection.tsx`
2. **Add missing trailing newlines** to the 5 files listed above
3. **Either consume or remove** the `minimumWage` function
4. **Consider removing** dead import comments (the old `// historical endpoints removed` in router.ts)
