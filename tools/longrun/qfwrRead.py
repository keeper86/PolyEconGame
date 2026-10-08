#!/usr/bin/env python3
"""Equilibrium read-out for the QUIT_FAIRNESS_SENSITIVITY sweep + the tight reference.

Usage: python3 tools/longrun/qfwrRead.py [year ...]
"""
import csv
import sys

BASE = "tools/longrun/results"
RUNS = [
    ("ref qs0.005 ws0.6", "svc125anchor-10000y-s1001"),
    ("qs0.5  ws0.6", "qfwr-0.5-1000y-s1001"),
    ("qs0.75 ws0.6", "qfwr-0.75-1000y-s1001"),
    ("qs1.0  ws0.6", "qfwr-1.0-1000y-s1001"),
    ("qs2.0  ws0.6", "qfwr-2.0-1000y-s1001"),
    ("tight ref 1.5x1.25", "map2-s150-m125-200y-s1001"),
]
KEYS = [
    "wageNone", "wageCeiling", "wageQuitRate", "tightnessNone", "vacancyWageNone",
    "employed", "totalPopulation", "market_Grocery_price", "avgGroceryStarvation",
    "facilityAggregateProfitMonth", "companiesNearInsolvent", "companiesDeepLoss",
    "market_Grocery_demand", "market_Grocery_unfilled", "market_Grocery_unsold", "market_Grocery_volume",
]


def load(run):
    byyear = {}
    with open(f"{BASE}/{run}/series.csv") as f:
        for r in csv.DictReader(f):
            r["year"] = float(r["tick"]) / 360
            byyear.setdefault(int(r["year"]), []).append(r)
    return byyear


def mean(g, k):
    vs = [float(r[k]) for r in g if r.get(k) not in (None, "")]
    return sum(vs) / len(vs) if vs else float("nan")


def main():
    years = [int(a) for a in sys.argv[1:]] or [10, 20, 50, 100, 150, 200, 300, 500, 1000]
    print(
        "%-20s%6s%9s%9s%9s%9s%9s%9s%9s%10s%11s"
        % ("run", "y", "wage", "ceiling", "quitRate", "tightN", "empShare", "starv", "price", "aggProfit", "coverage")
    )
    for label, run in RUNS:
        try:
            byyear = load(run)
        except OSError:
            print(f"{label:<20}  (no data)")
            continue
        last = max(byyear)
        for y in years:
            if y not in byyear:
                continue
            g = byyear[y]
            pop = mean(g, "totalPopulation")
            emp = mean(g, "employed")
            wage = mean(g, "wageNone")
            price = mean(g, "market_Grocery_price")
            coverage = emp / pop * wage * 30 / price if price else float("nan")
            print(
                "%-20s%6d%9.4f%9.4f%9.5f%9.4g%9.4f%9.4g%9.4f%10.4g%11.3f"
                % (
                    label, y, wage, mean(g, "wageCeiling"), mean(g, "wageQuitRate"),
                    mean(g, "tightnessNone"), emp / pop, mean(g, "avgGroceryStarvation"),
                    price, mean(g, "facilityAggregateProfitMonth"), coverage,
                )
            )
        print(f"{'':<20}  (latest y{last})")


if __name__ == "__main__":
    main()
