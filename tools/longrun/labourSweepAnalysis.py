#!/usr/bin/env python3
"""Comprehensive comparison of the labour-requirement sweep (1000y) against the (0,0) control."""
import csv
import math

BASE = "tools/longrun/results"
RUNS = [
    ("control(0,0)", "svc125anchor-10000y-s1001"),
    ("ton1(1,0)", "labour2-ton1-1000y-s1001"),
    ("svc1(0,1)", "labour2-svc1-1000y-s1001"),
    ("both1(1,1)", "labour2-both1-1000y-s1001"),
    ("ton2svc1(2,1)", "labour2-ton2svc1-1000y-s1001"),
    ("ton1svc2(1,2)", "labour2-ton1svc2-1000y-s1001"),
]
YEARS = [30, 100, 200, 300, 500, 800, 1000]


def load(run):
    byyear = {}
    with open(f"{BASE}/{run}/series.csv") as f:
        for r in csv.DictReader(f):
            r["year"] = float(r["tick"]) / 360
            byyear.setdefault(int(r["year"]), []).append(r)
    return byyear


def num(r, k):
    v = r.get(k)
    if v is None or v == "":
        return None
    try:
        v = float(v)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def mean(byyear, y, k):
    vs = [num(r, k) for r in byyear.get(y, []) if num(r, k) is not None]
    return sum(vs) / len(vs) if vs else None


def window(byyear, y0, y1, k):
    vs = []
    for y in range(y0, y1 + 1):
        for r in byyear.get(y, []):
            v = num(r, k)
            if v is not None:
                vs.append(v)
    return sum(vs) / len(vs) if vs else None


def fac_sum(byyear, y, suffix):
    out = 0.0
    anyv = False
    for k in byyear.get(y, [{}])[0]:
        if k.startswith("facilityScale_"):
            v = num(byyear[y][0], k)
            if v is not None:
                out += v
                anyv = True
    return out if anyv else None


HEAD = f"{'run':<14}{'pop':>11}{'employed':>11}{'empRate':>9}{'wageN':>8}{'wageT':>8}{'tightN':>9}" \
       f"{'starv':>8}{'sev':>7}{'fill':>7}{'wealth':>10}{'gdp':>10}{'psvc':>8}{'bankEq':>12}"


def row(label, byyear, y):
    pop = mean(byyear, y, "totalPopulation")
    emp = mean(byyear, y, "employed")
    empable = mean(byyear, y, "employable")

    def g(k):
        v = mean(byyear, y, k)
        return f"{v:>10.4g}" if v is not None else f"{'--':>10}"

    return (
        f"{label:<14}{pop/1e6:>11.4g}{emp/1e6:>11.4g}"
        f"{(emp/empable if empable else 0):>9.4f}"
        f"{g('wageNone'):>8}{g('wageTertiary'):>8}{g('tightnessNone'):>9}"
        f"{g('avgGroceryStarvation'):>8}{g('starvationSevereFraction'):>7}{g('groceryFillRate'):>7}"
        f"{g('meanWealth'):>10}{g('gdpAnnual'):>10}{g('priceLevelServices'):>8}{g('bankEquity'):>12}"
    )


data = {lab: load(d) for lab, d in RUNS}

print("=" * 160)
print("CROSS-RUN SNAPSHOT  (empRate = employed/employable; tightN = tightnessNone)")
print("=" * 160)
for y in YEARS:
    print(f"\n--- y{y} " + "-" * 150)
    print(HEAD)
    for lab, _ in RUNS:
        if y in data[lab] or any(y in data[lab] for y in [y]):
            if max(data[lab]) >= y:
                print(row(lab, data[lab], y))

print("\n" + "=" * 160)
print("TRAJECTORY OF EMPLOYMENT AND WAGES (every 100y)")
print("=" * 160)
print(f"{'run':<14}{'metric':<10}" + "".join(f"{('y%d' % y):>13}" for y in range(100, 1001, 100)))
for lab, _ in RUNS:
    if max(data[lab]) < 200:
        continue
    for k in ["employed", "wageNone", "tightnessNone", "avgGroceryStarvation", "groceryFillRate"]:
        line = f"{lab:<14}{k:<10}"
        for y in range(100, 1001, 100):
            v = mean(data[lab], y, k)
            line += f"{v:>13.4g}" if v is not None else f"{'--':>13}"
        print(line)
    print()

print("=" * 160)
print("WHERE THE EXTRA EMPLOYMENT COMES FROM  (total facility scale, and labour demand)")
print("=" * 160)
print(f"{'run':<14}" + "".join(f"{('y%d' % y):>16}" for y in [30, 100, 300, 600, 1000]))
for lab, _ in RUNS:
    if max(data[lab]) < 200:
        continue
    line = f"{lab:<14}"
    for y in [30, 100, 300, 600, 1000]:
        s = fac_sum(data[lab], y, "")
        line += f"{s:>16.4g}" if s is not None else f"{'--':>16}"
    print(line)
