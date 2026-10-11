#!/usr/bin/env python3
"""Per-run extremes over a common horizon, grouped by arm.

usage: armSummary.py <horizon-years> <arm=series.csv> [<arm=series.csv> ...]
"""

import csv
import sys

HORIZON = int(sys.argv[1])
RUNS = [entry.split("=", 1) for entry in sys.argv[2:]]

WANTED = {
    "groceryFillRate": min,
    "tightnessPrimary": max,
    "capacityPrimary": max,
    "capacityNone": max,
    "employable": min,
    "fillPrimary": min,
    "bankLoans": max,
    "market_Grocery_price": max,
    "priceLevelServices": max,
    "totalPopulation": max,
}


def extremes(path):
    with open(path) as handle:
        reader = csv.reader(handle)
        header = next(reader)
        index = {name: position for position, name in enumerate(header)}
        sums = {}
        counts = {}
        for row in reader:
            year = int(float(row[index["tick"]]) // 360)
            if year < 1 or year > HORIZON:
                continue
            bucket = sums.setdefault(year, {})
            counts[year] = counts.get(year, 0) + 1
            for name in WANTED:
                position = index.get(name)
                if position is None or position >= len(row):
                    continue
                bucket[name] = bucket.get(name, 0.0) + float(row[position])
        yearly = {year: {name: value / counts[year] for name, value in bucket.items()} for year, bucket in sums.items()}

    last = max(yearly)
    result = {}
    for name, reduce in WANTED.items():
        values = [row[name] for row in yearly.values() if name in row]
        result[name] = reduce(values) if values else float("nan")
    result["lastYear"] = last
    return result


print(f"horizon y1-{HORIZON}\n")
header = f"{'arm':<28}" + "".join(f"{name[:13]:>15}" for name in list(WANTED) + ["lastYear"])
print(header)
for label, path in RUNS:
    result = extremes(path)
    cells = "".join(
        f"{result[name]:>15.4g}" if name in result else f"{'-':>15}" for name in list(WANTED) + ["lastYear"]
    )
    print(f"{label:<28}{cells}")
