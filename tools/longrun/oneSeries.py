import csv
import sys

path = sys.argv[1]
years_wanted = [int(y) for y in sys.argv[2:]] or list(range(1, 101))
columns = [
    "totalPopulation",
    "birthsThisMonth",
    "deathsThisMonth",
    "deathsStarvationPerTick",
    "avgGroceryStarvation",
    "starvationFatalFraction",
    "groceryFillRate",
    "priceLevelRaw",
    "priceLevelServices",
    "market_Grocery_price",
    "capacityPrimary",
    "employable",
    "employed",
    "tightnessPrimary",
    "fillPrimary",
    "bankLoans",
    "gdpAnnual",
]

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
        counts[year] = counts.get(year, 0) + 1
        for name in columns:
            position = index.get(name)
            if position is None or position >= len(row):
                continue
            bucket[name] = bucket.get(name, 0.0) + float(row[position])

print(f"{'year':>5}" + "".join(f"{name[:13]:>15}" for name in columns))
for year in years_wanted:
    if year not in sums:
        continue
    cells = []
    for name in columns:
        value = sums[year].get(name)
        cells.append(f"{value / counts[year]:>15.5g}" if value is not None else f"{'-':>15}")
    print(f"{year:>5}" + "".join(cells))
