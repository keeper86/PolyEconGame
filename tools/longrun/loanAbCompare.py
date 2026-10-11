#!/usr/bin/env python3
"""Compare two longrun series.csv files: yearly samples plus the year two runs diverge.

usage: loanAbCompare.py <baseline-run-or-dir> <candidate-run-or-dir> [years...]

Each argument is either a run name under tools/longrun/results or a path to a run directory.
series.csv is sampled monthly; values are aggregated to yearly means before comparison.
"""

import csv
import os
import sys

RESULTS = "tools/longrun/results"

COLUMNS = [
    ("totalPopulation", "pop"),
    ("gdpAnnual", "gdp"),
    ("bankLoans", "bankLoans"),
    ("totalLoans", "allLoans"),
    ("loansStarter", "starterLn"),
    ("bankruptcies", "bankrupt"),
    ("companiesNearInsolvent", "nearInsolv"),
    ("facilityLossCount", "facilLoss"),
    ("capacityPrimary", "capPrim"),
    ("capacityNone", "capNone"),
    ("employable", "employabl"),
    ("employed", "employed"),
    ("tightnessPrimary", "tightPrim"),
    ("tightnessNone", "tightNone"),
    ("fillPrimary", "fillPrim"),
    ("fillNone", "fillNone"),
    ("wagePrimary", "wagePrim"),
    ("wageCeiling", "wageCeil"),
    ("workersAboveCeilingFrac", "wAboveCeil"),
    ("priceLevelRaw", "pxRaw"),
    ("priceLevelRefined", "pxRefined"),
    ("market_ProcessedFood_price", "foodPx"),
    ("market_Produce_price", "producePx"),
    ("market_Grocery_price", "groceryPx"),
    ("avgGroceryStarvation", "starv"),
    ("starvationFatalFraction", "starvFatal"),
    ("deathsStarvationPerTick", "starvDeaths"),
]


def resolve(argument):
    if os.path.isdir(argument):
        return argument
    candidate = os.path.join(RESULTS, argument)
    if os.path.isdir(candidate):
        return candidate
    raise SystemExit(f"no run directory for '{argument}'")


def loadYearly(run):
    path = os.path.join(resolve(run), "series.csv")
    with open(path) as handle:
        reader = csv.reader(handle)
        header = next(reader)
        index = {name: position for position, name in enumerate(header)}
        sums = {}
        counts = {}
        for row in reader:
            year = int(float(row[index["tick"]]) // 360)
            if year < 1:
                continue
            bucket = sums.setdefault(year, {})
            count = counts.setdefault(year, 0)
            for name, _ in COLUMNS:
                position = index.get(name)
                if position is None or position >= len(row):
                    continue
                bucket[name] = bucket.get(name, 0.0) + float(row[position])
            counts[year] = count + 1
        return {year: {name: value / counts[year] for name, value in bucket.items()} for year, bucket in sums.items()}


def value(yearly, year, name):
    row = yearly.get(year)
    if row is None or name not in row:
        return None
    return row[name]


def lastYear(*runs):
    return max(years for run in runs for years in run)


def firstDivergence(baseline, candidate, name, tolerance):
    for year in range(1, lastYear(baseline, candidate) + 1):
        left = value(baseline, year, name)
        right = value(candidate, year, name)
        if left is None or right is None:
            continue
        scale = max(abs(left), abs(right), 1e-9)
        if abs(left - right) / scale > tolerance:
            return year
    return None


def main():
    arguments = sys.argv[1:]
    if len(arguments) < 2:
        raise SystemExit(__doc__)
    baselineName, candidateName, *rest = arguments
    years = [int(year) for year in rest] or [1, 10, 25, 30, 40, 50, 60, 80, 100]
    tolerance = 0.001

    baseline = loadYearly(baselineName)
    candidate = loadYearly(candidateName)
    horizon = lastYear(baseline, candidate)

    print(f"baseline  {baselineName}: {len(baseline)} years")
    print(f"candidate {candidateName}: {len(candidate)} years")
    print(f"shared horizon: {horizon} years, yearly means, relative tolerance {tolerance:g}\n")

    header = f"{'metric':<12}" + "".join(f"{year:>13}" for year in years)
    print(header)
    for name, label in COLUMNS:
        left = " ".join(f"{(value(baseline, year, name) or 0):>12.4g}" for year in years)
        right = " ".join(f"{(value(candidate, year, name) or 0):>12.4g}" for year in years)
        top = value(baseline, 1, name)
        bottom = value(candidate, 1, name)
        if top is None and bottom is None:
            continue
        print(f"{label:<12}{left}")
        print(f"{'':<12}{right}")

    print(f"\n{'metric':<12}{'diverges':>10}{'baseline@div':>14}{'candidate@div':>14}")
    for name, label in COLUMNS:
        year = firstDivergence(baseline, candidate, name, tolerance)
        if year is None:
            print(f"{label:<12}{'never':>10}{'':>14}{'':>14}")
            continue
        left = value(baseline, year, name)
        right = value(candidate, year, name)
        print(f"{label:<12}{year:>10}{left:>14.6g}{right:>14.6g}")


if __name__ == "__main__":
    main()
