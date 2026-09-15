#!/usr/bin/env python3
"""Analyse per-tick autoscale data (tickProbe.csv) for the slow-oscillator question.

Usage: python3 tools/longrun/analyzeController.py <results-dir>
"""
import csv
import math
import os
import sys


def g(row, key):
    v = row.get(key, "")
    try:
        return float(v)
    except (TypeError, ValueError):
        return math.nan


def sparkline(values, width=72):
    if not values:
        return ""
    vals = [v for v in values if v is not None and not math.isnan(v)]
    if not vals:
        return ""
    mn, mx = min(vals), max(vals)
    if mx == mn:
        return "·" * min(width, len(vals))
    blocks = "▁▂▃▄▅▆▇█"
    step = max(1, len(vals) // width)
    sampled = vals[::step][:width]
    return "".join(blocks[min(7, int((v - mn) / (mx - mn) * 7.999))] for v in sampled)


def main(outdir):
    tp = os.path.join(outdir, "tickProbe.csv")
    if not os.path.exists(tp):
        print(f"no tickProbe.csv in {outdir} (run with TICK_PROBE=1)")
        sys.exit(1)

    prev_scale = {}
    scan = {}
    total = 0
    maint = []
    oilwell = []
    first_zero = {}

    with open(tp) as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            fac = row["facility"]
            aid = row.get("agentId", "")
            key = (aid, fac)
            scale = g(row, "scale")
            raw = g(row, "rawSignal")
            wres = g(row, "worstResourceEfficiency")
            dscale = scale - prev_scale[key] if key in prev_scale else 0.0
            prev_scale[key] = scale

            if raw > 0.05 and dscale > 0 and wres < 0.9:
                scan[fac] = scan.get(fac, 0) + 1

            tick = int(round(g(row, "tick")))
            year = tick / 360.0

            if fac == "Maintenance_Facility":
                if tick % 30 == 0:
                    maint.append(
                        (
                            year,
                            g(row, "scaleFrac"),
                            raw,
                            wres,
                            g(row, "overallEfficiency"),
                            g(row, "maintenanceStatus"),
                            row["need0Name"],
                            g(row, "need0Buffer"),
                            g(row, "need0Required"),
                            g(row, "need0Eff"),
                            row["need1Name"],
                            g(row, "need1Buffer"),
                            g(row, "need1Required"),
                            g(row, "need1Eff"),
                            row["need2Name"],
                            g(row, "need2Buffer"),
                            g(row, "need2Required"),
                            g(row, "need2Eff"),
                        )
                    )
                for i in range(3):
                    name = row[f"need{i}Name"]
                    buf = g(row, f"need{i}Buffer")
                    if name and buf <= 0 and (fac, name) not in first_zero:
                        first_zero[(fac, name)] = (tick, year)

            if fac == "Oil_Well":
                if tick % 30 == 0:
                    oilwell.append((year, g(row, "scaleFrac"), raw, wres))

    print(f"== controller oscillation analysis: {outdir} ==")
    print(f"   rows={total}")

    print("\n== 1. unstable-mode scan (rawSignal>0.05, scale rising, worstInputEff<0.9) ==")
    if not scan:
        print("   none")
    else:
        for fac, n in sorted(scan.items(), key=lambda kv: -kv[1]):
            print(f"   {fac:28s} {n:8d} ticks")

    print("\n== 2. first input-buffer zero (the first deviation) ==")
    if not first_zero:
        print("   no buffer hit zero in the sampled window")
    else:
        for (fac, name), (tick, year) in sorted(first_zero.items(), key=lambda kv: kv[1][0]):
            print(f"   {fac:28s} need={name:14s} first zero @ tick {tick} (y{year:.2f})")

    print("\n== 3. Maintenance Facility (steel is the smoking gun) ==")
    if maint:
        steel_idx = None
        for j in range(3):
            if maint[0][6 + j * 4] == "Steel":
                steel_idx = 6 + j * 4
                break
        if steel_idx is not None:
            print(f"   steel buffer sparkline (y{maint[0][0]:.1f}..y{maint[-1][0]:.1f}):")
            print("   " + sparkline([m[steel_idx + 1] for m in maint]))
        print("   overallEfficiency sparkline:")
        print("   " + sparkline([m[4] for m in maint]))
        print("   last 12 months (year, scaleFrac, rawSig, worstEff, overallEff, condition):")
        for m in maint[-12:]:
            print(
                f"     y{m[0]:7.2f} frac={m[1]:.3f} rawSig={m[2]:+.3f} worstEff={m[3]:.3f} "
                f"oe={m[4]:.3f} cond={m[5]:.3f}"
            )
        print("   needs (last sample):")
        for j in range(3):
            print(
                f"     {maint[-1][6+j*4]:12s} buffer={maint[-1][7+j*4]:,.0f} "
                f"required={maint[-1][8+j*4]:,.0f} eff={maint[-1][9+j*4]:.3f}"
            )

    print("\n== 4. Oil Well scale fraction / signal ==")
    if oilwell:
        print(f"   scaleFrac sparkline (y{oilwell[0][0]:.1f}..y{oilwell[-1][0]:.1f}):")
        print("   " + sparkline([o[1] for o in oilwell]))
        print("   rawSignal sparkline:")
        print("   " + sparkline([o[2] for o in oilwell]))


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    if not target:
        print(__doc__)
        sys.exit(1)
    resolved = os.path.abspath(target) if os.path.exists(target) else os.path.join("tools/longrun/results", target)
    main(resolved)
