#!/usr/bin/env python3
"""Minimal proxy for the wage / employment / ceiling loop.

State: e = employment share, w = wage. Derived: p, c, cov.

Every relation is calibrated against the long-run series:
  price pass-through:  p   = price_scale * markup * w**labour_share  (measured dln p/dln w ~ 0.93)
  affordability:       cov = min(1, e*w*ticks_per_month / (p*basket))
  ceiling (VERIFIED):  c   = w * (1 + profit_ratio)
                       accounting identity:  wageCeiling/wage
                         = (revenue - purchases - claims)/wages = 1 + profit/wages
                       measured c/w = 1.31..1.74, and dln c / dln w ~ 1.0 -> scale-free
  tightness:           tau = tau0 * e / (1 - e)
  outside option:      out = outside_bias * min(1, tau) * w
  quits:               q   = out_sens*clamp((out-w)/w) + fair_sens*clamp((fair-w)/fair)
  churn:               churn_gain * (q - quit_target)
  shortage:            max(0, cov - e)/max(cov, eps)
  wage law:            w *= 1 + clamp(step_gain*(shortage^2 + churn + afford), +-step_cap)
  employment law:      e += emp_gain * (target - e)
"""
import argparse
import math

P = dict(
    markup=1.25,
    price_scale=3.1,
    labour_share=0.5,
    basket=1.0,
    tau0=3.0,
    outside_bias=0.9,
    out_sens=0.05,
    fair_sens=0.005,
    quit_target=0.009,
    churn_gain=3.0,
    step_gain=1.0,
    step_cap=0.05,
    e_min=0.02,
    e_max=0.60,
    emp_gain=0.05,
    min_wage=1.0,
    max_wage=1000.0,
    wage_share=0.6,
    afford_gain=1.0,
    ticks_per_month=30.0,
    profit_ratio=0.41,
    margin_demand_sens=0.4,
    labour_coefficient=0.13,
    endo=False,
    e_end=0.065,
)


def simulate(mode, years=600, e0=0.47, w0=1.0, over=None):
    p = dict(P)
    if over:
        p.update(over)
    e, w = e0, w0
    out = []
    for yr in range(years):
        price = p["price_scale"] * p["markup"] * w ** p["labour_share"]
        cov = min(1.0, e * w * p["ticks_per_month"] / (price * p["basket"])) if price > 0 else 1.0
        profit_ratio = max(-0.9, p["profit_ratio"] + p["margin_demand_sens"] * (cov - 0.5))
        c = w * (1.0 + profit_ratio)

        tau = p["tau0"] * e / max(1e-9, 1.0 - e)
        outside = p["outside_bias"] * min(1.0, tau) * w
        gap_out = max(-1.0, min(1.0, (outside - w) / w if w > 0 else 0.0))
        fair = p["wage_share"] * c
        gap_fair = max(-1.0, min(1.0, (fair - w) / fair)) if fair > 0 else 0.0
        q = max(0.0, p["out_sens"] * gap_out + p["fair_sens"] * gap_fair)
        churn = p["churn_gain"] * (q - p["quit_target"])

        desired = p["labour_coefficient"] * cov
        shortage = max(0.0, desired - e) / max(desired, 1e-9)
        short_p = shortage ** 2

        if mode == "clip":
            pr = short_p + churn
            step = max(-p["step_cap"], min(p["step_cap"], p["step_gain"] * pr))
            nw = w * (1 + step)
            w = max(p["min_wage"], min(p["max_wage"], min(nw, c) if c >= p["min_wage"] else nw))
        else:
            if mode == "down":
                aff = -p["afford_gain"] * max(0.0, (w - c) / c) if c > 0 else 0.0
            elif mode == "symceil":
                aff = p["afford_gain"] * (c - w) / c if c > 0 else 0.0
            elif mode == "symfair":
                aff = p["afford_gain"] * gap_fair
            elif mode == "none":
                aff = 0.0
            else:
                raise ValueError(mode)
            pr = short_p + churn + aff
            step = max(-p["step_cap"], min(p["step_cap"], p["step_gain"] * pr))
            w = max(p["min_wage"], min(p["max_wage"], w * (1 + step)))

        if p["endo"]:
            target = p["e_min"] + (p["e_max"] - p["e_min"]) * cov
        else:
            ramp = min(1.0, 2.0 * yr / years)
            target = e0 + (p["e_end"] - e0) * ramp
        e = min(1.0, max(1e-9, e + p["emp_gain"] * (target - e)))
        out.append((e, w, price, c, cov, q, tau))
    return out


def report(mode, tag="", **kw):
    h = simulate(mode, **kw)
    tail = h[len(h) // 2:]

    def st(i):
        v = [r[i] for r in tail]
        m = sum(v) / len(v)
        sd = math.sqrt(sum((a - m) ** 2 for a in v) / len(v))
        return m, sd, min(v), max(v)

    e, w, cov = st(0), st(1), st(4)
    print(
        "%-24s e %6.3f+-%.3f [%.3f,%.3f]  w %9.3f+-%8.3f [%8.3f,%9.3f]  cov %5.3f [%.3f,%.3f]"
        % (mode + tag, e[0], e[1], e[2], e[3], w[0], w[1], w[2], w[3], cov[0], cov[2], cov[3])
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=600)
    ap.add_argument("--w0", type=float, default=1.0)
    ap.add_argument("--e0", type=float, default=0.47)
    a = ap.parse_args()
    print("(second half; e0=%.2f w0=%.2f years=%d)" % (a.e0, a.w0, a.years))
    for m in ["clip", "none", "down", "symceil", "symfair"]:
        report(m, years=a.years, w0=a.w0, e0=a.e0)
