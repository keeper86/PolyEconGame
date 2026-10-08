#!/usr/bin/env python3
"""Analysis of long-run series.csv output: stability, oscillation, floor pressure, finance, services.

Usage: python3 tools/longrun/sessionAnalysis.py [run ...]
"""
import csv
import math
import sys

BASE = "tools/longrun/results"
TICKS_PER_YEAR = 360

RUNS = sys.argv[1:] or ["svc125anchor-10000y-s1001", "svc125anchor-pers-10000y-s1001"]


def load(run):
    rows = []
    with open(f"{BASE}/{run}/series.csv") as f:
        for r in csv.DictReader(f):
            r["year"] = float(r["tick"]) / TICKS_PER_YEAR
            rows.append(r)
    return rows


def num(r, k):
    v = r.get(k)
    if v is None or v == "":
        return None
    try:
        v = float(v)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def win(rows, y0, y1=None):
    return [r for r in rows if r["year"] >= y0 and (y1 is None or r["year"] <= y1)]


def agg(rs, k):
    vs = [v for v in (num(r, k) for r in rs) if v is not None]
    if not vs:
        return dict(n=0, mean=float("nan"), sd=float("nan"), mn=float("nan"), mx=float("nan"),
                    slope=float("nan"))
    n = len(vs)
    mean = sum(vs) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in vs) / n)
    pts = [(r["year"], num(r, k)) for r in rs if num(r, k) is not None]
    sl = 0.0
    if len(pts) >= 3:
        my = sum(p[0] for p in pts) / len(pts)
        mv = sum(p[1] for p in pts) / len(pts)
        den = sum((p[0] - my) ** 2 for p in pts)
        if den > 0:
            sl = sum((p[0] - my) * (p[1] - mv) for p in pts) / den
    return dict(n=n, mean=mean, sd=sd, mn=min(vs), mx=max(vs), slope=sl)


def frac(rs, k, pred):
    vs = [v for v in (num(r, k) for r in rs) if v is not None]
    if not vs:
        return float("nan")
    return sum(1 for v in vs if pred(v)) / len(vs)


def fac_keys(rows):
    return [n[len("facilityCount_"):] for n in rows[0] if n.startswith("facilityCount_")]


def hdr(t):
    print("\n" + "=" * 100)
    print(t)
    print("=" * 100)


def stability(rows, label, y0, y1=None):
    rs = win(rows, y0, y1)
    hdr(f"STABILITY  {label}  (y{rs[0]['year']:.0f}-y{rs[-1]['year']:.0f}, {len(rs)} samples)")
    cols = [
        "totalPopulation", "employed", "employable", "unableToWork", "avgGroceryStarvation",
        "starvationSevereFraction", "deathsStarvationPerTick", "meanWealth", "wealthTotal",
        "gdpAnnual", "priceLevelServices", "priceLevelRaw", "market_Grocery_price",
        "groceryFillRate", "policyRate", "companyCount", "priceFloorHits", "priceCeilHits",
    ]
    print(f"{'series':<28}{'mean':>14}{'sd':>13}{'CV':>8}{'q':>9}{'min':>12}{'max':>12}{'slope/yr':>11}{'%/dec':>9}")
    for k in cols:
        a = agg(rs, k)
        if a["n"] == 0:
            continue
        cv = a["sd"] / abs(a["mean"]) if a["mean"] else float("nan")
        q = (a["mx"] - a["mn"]) / abs(a["mean"]) if a["mean"] else float("nan")
        dec = 100 * a["slope"] * 10 / abs(a["mean"]) if a["mean"] else float("nan")
        print(f"{k:<28}{a['mean']:>14.5g}{a['sd']:>13.4g}{cv:>8.3f}{q:>9.3f}"
              f"{a['mn']:>12.5g}{a['mx']:>12.5g}{a['slope']:>11.4g}{dec:>9.2f}")


def oscillation(rows, label, y0, y1=None):
    rs = win(rows, y0, y1)
    hdr(f"OSCILLATION  {label}  (year-averaged; turning points and peak-to-peak)")
    cols = [
        "totalPopulation", "employed", "wealthTotal", "gdpAnnual", "market_Grocery_price",
        "priceLevelServices", "facilityOfferPriceOverCost_groceryChain", "bankLoans", "bankDeposits",
    ]
    span = rs[-1]["year"] - rs[0]["year"] if rs else 0.0
    print(f"{'series':<44}{'turns/100y':>12}{'peakToPeak(y)':>15}{'amp%/mean':>12}")
    byyear = {}
    for r in rs:
        byyear.setdefault(int(r["year"]), []).append(r)
    for k in cols:
        pts = []
        for y in sorted(byyear):
            vs = [num(r, k) for r in byyear[y] if num(r, k) is not None]
            if vs:
                pts.append((float(y), sum(vs) / len(vs)))
        if len(pts) < 4 or span <= 0:
            continue
        turns = 0
        lastpeak = None
        gaps = []
        for i in range(1, len(pts) - 1):
            if (pts[i][1] - pts[i - 1][1]) * (pts[i + 1][1] - pts[i][1]) < 0:
                turns += 1
                if lastpeak is not None:
                    gaps.append(pts[i][0] - lastpeak)
                lastpeak = pts[i][0]
        a = agg(rs, k)
        amp = (a["mx"] - a["mn"]) / abs(a["mean"]) / 2 if a["mean"] else float("nan")
        p2p = sum(gaps) / len(gaps) if gaps else float("nan")
        print(f"{k:<44}{turns/span*100:>12.1f}{p2p:>15.4g}{amp:>12.3f}")


def trajectory(rows, label, step):
    hdr(f"TRAJECTORY  {label}  (yearly means, every {step}y)")
    cols = [
        "totalPopulation", "employed", "avgGroceryStarvation", "meanWealth", "wealthMonthsMean",
        "gdpAnnual", "market_Grocery_price", "groceryFillRate", "policyRate", "bankEquity",
        "bankDeposits", "totalLoans", "householdDeposits", "populationBelowFloorFraction",
        "companyDebtEquityMedian", "companiesUnderwater", "bankruptcies", "debtWriteOffs",
    ]
    byyear = {}
    for r in rows:
        byyear.setdefault(int(r["year"]), []).append(r)
    print(f"{'y':>5}" + "".join(f"{c[:13]:>15}" for c in cols))
    for y in sorted(byyear):
        if y % step:
            continue
        grp = byyear[y]
        line = f"{y:>5}"
        for c in cols:
            vs = [num(r, c) for r in grp if num(r, c) is not None]
            line += f"{sum(vs)/len(vs):>15.5g}" if vs else f"{'--':>15}"
        print(line)


def service_trajectory(rows, label, step):
    hdr(f"SERVICE MARKET VOLUMES (volume / fillRate)  {label}")
    svc = ["Grocery", "Retail", "Healthcare", "Education", "Administration", "Logistics",
           "Construction", "Maintenance"]
    byyear = {}
    for r in rows:
        byyear.setdefault(int(r["year"]), []).append(r)
    print(f"{'y':>5}" + "".join(f"{s[:12]:>17}" for s in svc))
    for y in sorted(byyear):
        if y % step:
            continue
        g = byyear[y]
        line = f"{y:>5}"
        for s in svc:
            v = sum(num(r, f"market_{s}_volume") or 0 for r in g) / len(g)
            d = sum(num(r, f"market_{s}_demand") or 0 for r in g) / len(g)
            line += f"{'%.3g/f%.2f' % (v, v / d if d > 0 else 0.0):>17}"
        print(line)


def floor_pressure(rows, label, y0, table=True):
    rs = win(rows, y0)
    keys = fac_keys(rs)
    hdr(f"FLOOR PRESSURE  {label}  (y{y0:.0f}-y{rs[-1]['year']:.0f})")
    print(
        "offerP/C = mean(offer price / costFloor); spring>0 = share of facility-months inside the\n"
        "brake zone (price < 1.25*cost, spring pushing up); pinned = |netFactor-1|<0.02;\n"
        "baseFac = mean sell-through factor (1.0 neutral, lower = deeper cut)."
    )
    out = []
    for k in keys:
        pc = agg(rs, f"facilityOfferPriceOverCost_{k}")
        if pc["n"] == 0 or pc["mean"] == 0:
            continue
        act = frac(rs, f"facilityCostSpringDeviation_{k}", lambda v: v > 1e-9)
        pin = frac(rs, f"facilityNetPriceFactor_{k}", lambda v: abs(v - 1) < 0.02)
        bf = agg(rs, f"facilitySellThroughFactor_{k}")
        nf = agg(rs, f"facilityNetPriceFactor_{k}")
        mg = agg(rs, f"facilityMargin_{k}")
        pf = agg(rs, f"facilityProfit_{k}")
        cnt = agg(rs, f"facilityCount_{k}")
        sf = agg(rs, f"facilityScaleFrac_{k}")
        out.append((k, cnt["mean"], pc["mean"], act, pin, bf["mean"], nf["mean"], mg["mean"],
                    pf["mean"], sf["mean"]))
    out.sort(key=lambda r: r[2])
    if table:
        print(f"{'facility':<24}{'cnt':>7}{'offerP/C':>10}{'spring>0':>10}{'pinned':>8}"
              f"{'baseFac':>9}{'netFac':>8}{'margin':>10}{'profit':>12}{'scaleFrac':>10}")
        for r in out:
            print(f"{r[0]:<24}{r[1]:>7.2f}{r[2]:>10.3f}{r[3]:>10.2f}{r[4]:>8.2f}"
                  f"{r[5]:>9.3f}{r[6]:>8.4f}{r[7]:>10.3f}{r[8]:>12.4g}{r[9]:>10.3f}")
    buckets = {"<1.00": 0, "1.00-1.25": 0, "1.25-1.50": 0, ">=1.50": 0}
    for r in out:
        b = "<1.00" if r[2] < 1.0 else "1.00-1.25" if r[2] < 1.25 else "1.25-1.50" if r[2] < 1.5 else ">=1.50"
        buckets[b] += 1
    print(f"\nfacility types by mean offerP/C: {buckets}")
    print(f"types with spring active >50% of months: {sum(1 for r in out if r[3] > 0.5)}/{len(out)}"
          f"   pinned >0.5: {sum(1 for r in out if r[4] > 0.5)}/{len(out)}")
    print(f"unweighted mean spring-active share {sum(r[3] for r in out)/len(out):.3f}, "
          f"mean pinned share {sum(r[4] for r in out)/len(out):.3f}, "
          f"mean baseFac {sum(r[5] for r in out)/len(out):.3f}")


FIN_COLS = [
    "policyRate", "bankEquity", "bankDeposits", "bankLoans", "householdDeposits",
    "totalAgentDeposits", "totalLoans", "loanInterestCollected", "emergencyLoansGranted",
    "debtWriteOffs", "bankruptcies", "agentsInDistress", "loansWageCoverage", "loansBufferCoverage",
    "loansRollover", "loansStarter", "loansOther", "companyNetWorthMedian",
    "companyNetWorthNegativeCount", "companyDebtEquityMedian", "companyDebtRevenueMedian",
    "companyRunwayMedian", "companiesUnderwater", "companiesNearInsolvent",
    "companiesOverCreditLimit", "overLimitLoanAmount", "companiesProfitable", "companiesDeepLoss",
    "companiesContracting", "companiesWithRolloverLoans", "rolloverLoanPrincipal",
    "totalFacilitiesCollateral", "totalMaxLoanAmount", "governmentDebt", "governmentDeposits",
    "profitShareBonuses", "gdpAnnual",
]


def finance(rows, label, y0):
    rs = win(rows, y0)
    hdr(f"FINANCE  {label}  (y{y0:.0f}-y{rs[-1]['year']:.0f})")
    print(f"{'series':<30}{'mean':>13}{'min':>13}{'max':>13}{'last':>13}{'slope/yr':>12}")
    last = rs[-1]
    for k in FIN_COLS:
        a = agg(rs, k)
        if a["n"] == 0:
            continue
        print(f"{k:<30}{a['mean']:>13.5g}{a['mn']:>13.5g}{a['mx']:>13.5g}{num(last, k):>13.5g}"
              f"{a['slope']:>12.4g}")
    a = agg(rs, "bankLoans")
    d = agg(rs, "bankDeposits")
    e = agg(rs, "bankEquity")
    t = agg(rs, "totalLoans")
    g = agg(rs, "gdpAnnual")
    hd = agg(rs, "householdDeposits")
    td = agg(rs, "totalAgentDeposits")
    if d["mean"]:
        print(f"\nloan/deposit {a['mean']/d['mean']:.3f}  equity/loans "
              f"{e['mean']/t['mean'] if t['mean'] else float('nan'):.4f}  totalLoans/GDP "
              f"{t['mean']/g['mean'] if g['mean'] else float('nan'):.3f}  deposits/GDP "
              f"{d['mean']/g['mean'] if g['mean'] else float('nan'):.3f}")
    if td["mean"]:
        print(f"household deposits / total agent deposits: {hd['mean']/td['mean']:.4f}")


SERVICE_MARKETS = ["Grocery", "Retail", "Healthcare", "Education", "Administration", "Logistics",
                   "Construction", "Maintenance"]


def services(rows, label, y0):
    rs = win(rows, y0)
    hdr(f"SERVICE MARKETS  {label}  (y{y0:.0f}-y{rs[-1]['year']:.0f})")
    pop = agg(rs, "totalPopulation")["mean"]
    print(f"{'market':<16}{'demand':>12}{'d/capita':>11}{'supply':>12}{'volume':>12}{'unfilled':>11}"
          f"{'unsold':>12}{'fillRate':>10}{'price':>10}{'buffer':>9}")
    for s in SERVICE_MARKETS:
        d = agg(rs, f"market_{s}_demand")
        if d["n"] == 0:
            print(f"{s:<16}{'-- no column --':>12}")
            continue
        su = agg(rs, f"market_{s}_supply")
        v = agg(rs, f"market_{s}_volume")
        uf = agg(rs, f"market_{s}_unfilled")
        us = agg(rs, f"market_{s}_unsold")
        fr = agg(rs, f"market_{s}_fillRate")
        pr = agg(rs, f"market_{s}_price")
        bf = agg(rs, f"market_{s}_buffer")
        print(f"{s:<16}{d['mean']:>12.5g}{d['mean']/pop:>11.3g}{su['mean']:>12.5g}{v['mean']:>12.5g}"
              f"{uf['mean']:>11.5g}{us['mean']:>12.5g}{fr['mean']:>10.3f}{pr['mean']:>10.3f}"
              f"{bf['mean']:>9.3f}")
    print("\nzero-demand / zero-volume service months (share of window):")
    anomalies = 0
    for s in SERVICE_MARKETS:
        zd = frac(rs, f"market_{s}_demand", lambda v: v <= 1e-9)
        zv = frac(rs, f"market_{s}_volume", lambda v: v <= 1e-9)
        if zd == zd and (zd > 0 or zv > 0):
            print(f"  {s:<16} demand==0 in {zd:.2%}, volume==0 in {zv:.2%}")
            anomalies += 1
    if anomalies == 0:
        print("  (all service markets have demand > 0 in every sampled month)")


def head_to_head(runs, y0, y1):
    hdr(f"HEAD TO HEAD  y{y0:.0f}-y{y1:.0f}")
    cols = [
        "totalPopulation", "employed", "avgGroceryStarvation", "starvationSevereFraction",
        "meanWealth", "wealthTotal", "gdpAnnual", "priceLevelServices", "market_Grocery_price",
        "groceryFillRate", "policyRate", "bankEquity", "totalLoans", "bankDeposits",
        "householdDeposits", "governmentDeposits", "companyDebtEquityMedian", "companiesUnderwater",
        "bankruptcies", "agentsInDistress", "facilityOfferPriceOverCost_groceryChain",
        "facilityOfferPriceOverCost_retailChain", "facilityOfferPriceOverCost_hospital",
        "facilityOfferPriceOverCost_educationCenter", "market_Retail_volume",
        "market_Education_volume", "market_Logistics_volume", "depreciatedValue",
    ]
    print(f"{'series':<48}" + "".join(f"{r.split('-')[0][:18]:>20}" for r in runs))
    for k in cols:
        line = f"{k:<48}"
        for r in runs:
            a = agg(win(runs[r], y0, y1), k)
            line += f"{a['mean']:>20.6g}" if a["n"] else f"{'--':>20}"
        print(line)


if __name__ == "__main__":
    data = {r: load(r) for r in RUNS}
    for r in RUNS:
        rows = data[r]
        print(f"\n### {r}: y0.0-y{rows[-1]['year']:.1f}, {len(rows)} samples")
    for r in RUNS:
        rows = data[r]
        last = rows[-1]["year"]
        short = max(0.0, last - 30.0)
        hdr(f"############ {r} ############")
        stability(rows, r, short)
        stability(rows, r, 0.0, 120.0)
        oscillation(rows, r, short)
        trajectory(rows, r, 20)
        floor_pressure(rows, r, short)
        floor_pressure(rows, r, 0.0, False)
        service_trajectory(rows, r, 20)
        finance(rows, r, short)
        services(rows, r, short)
    if len(RUNS) > 1:
        hi = min(data[r][-1]["year"] for r in RUNS)
        head_to_head(data, 100.0, hi)
        head_to_head(data, max(0.0, hi - 30.0), hi)




