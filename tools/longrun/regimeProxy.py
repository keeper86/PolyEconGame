#!/usr/bin/env python3
"""Two-sector toy with prices tied to the unit labour cost.

Every price is a wedge over the unit labour cost, so the *nominal wage is the
numeraire* and cancels from every real ratio. The levers are the relative unit costs.

  unit labour cost of one unit of good i :  chi_i * w * ticks_per_month
  price                                  :  p_i = wedge_i * chi_i * w * ticks_per_month
  food coverage                          :  cov = min(1, e / (wedge_f * chi_f))      [w cancels]
  food employment                        :  e_f = min(chi_f, e / wedge_f)
  discretionary per head per month       :  disc = w*TPM*max(0, e - wedge_f*chi_f)
  service units                          :  svc = propensity*(e - wedge_f*chi_f)/(wedge_s*chi_s)   [w cancels]
  service employment                     :  e_s = chi_s * svc
  desired employment                     :  e*  = e_f + e_s

Calibration anchors: e=0.065, cov=0.5, p_food=3.875, churn=-0.027 at w=1.
  chi_f = 0.13 workers per unit of food per month
  wedge_f = p_food / (chi_f * w * TPM) = 3.875 / 3.9 = 0.9936   <- the fate parameter
"""

P = dict(
    ticks_per_month=30.0,
    chi_food=0.13,
    chi_service=0.35,
    wedge_food=0.9936,
    wedge_service=1.0,
    service_propensity=1.0,
    min_wage=1.0,
    max_wage=1000.0,
    step_cap=0.05,
    step_gain=1.0,
    tau0=3.0,
    outside_bias=0.9,
    out_sens=0.05,
    fair_sens=0.005,
    quit_target=0.009,
    churn_gain=3.0,
    wage_share=0.6,
    profit_ratio=0.41,
    emp_gain=0.05,
)


def clamp(x, lo=-1.0, hi=1.0):
    return max(lo, min(hi, x))


def derive(e, w, p):
    tpm = p["ticks_per_month"]
    pf = p["wedge_food"] * p["chi_food"] * w * tpm
    cov = min(1.0, e / (p["wedge_food"] * p["chi_food"]))
    e_food = min(p["chi_food"], e / p["wedge_food"])
    disc = w * tpm * max(0.0, e - p["wedge_food"] * p["chi_food"])
    svc = p["service_propensity"] * disc / (p["wedge_service"] * p["chi_service"] * w * tpm)
    e_service = p["chi_service"] * svc
    return dict(pf=pf, cov=cov, disc=disc, svc=svc, e_food=e_food, e_service=e_service,
                e_target=e_food + e_service)


def step_state(e, w, p):
    d = derive(e, w, p)
    tau = p["tau0"] * e / max(1e-9, 1.0 - e)
    outside = p["outside_bias"] * min(1.0, tau) * w
    ratio = p["wage_share"] * (1.0 + p["profit_ratio"])
    q = max(0.0, p["out_sens"] * clamp((outside - w) / w)
            + p["fair_sens"] * clamp((ratio - 1.0) / ratio))
    churn = p["churn_gain"] * (q - p["quit_target"])
    shortage = max(0.0, d["e_target"] - e) / max(d["e_target"], 1e-9)
    w2 = max(p["min_wage"], min(p["max_wage"],
             w * (1 + clamp(p["step_gain"] * (shortage ** 2 + churn), -p["step_cap"], p["step_cap"]))))
    e2 = min(1.0, max(1e-9, e + p["emp_gain"] * (d["e_target"] - e)))
    return e2, w2


def simulate(e0, w0, years=1200, over=None):
    p = dict(P)
    if over:
        p.update(over)
    e, w = e0, w0
    hist = []
    for _ in range(years):
        e, w = step_state(e, w, p)
        d = derive(e, w, p)
        hist.append((e, w, d["cov"], d["svc"], d["e_food"], d["e_service"]))
    return hist


def attractor(e0, w0, over=None):
    tail = simulate(e0, w0, over=over)[600:]
    n = len(tail)
    return (sum(r[0] for r in tail) / n, sum(r[1] for r in tail) / n, sum(r[3] for r in tail) / n)


def basin(label, over=None):
    lo = attractor(0.05, 1.0, over)
    hi = attractor(0.60, 1.0, over)
    tag = "SINGLE" if abs(lo[0] - hi[0]) < 0.02 else "BISTABLE"
    print("  %-44s famine-start: e=%.3f w=%8.2f svc=%7.3f | affluent-start: e=%.3f w=%8.2f svc=%7.3f -> %s"
          % (label, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], tag))


if __name__ == "__main__":
    print("=== does the wage system matter at all? (numeraire test) ===")
    for w0 in [1.0, 3.0, 10.0, 100.0]:
        e, w, svc = attractor(0.60, w0)
        print("  start wage %8.2f -> e=%.4f  svc=%.5f" % (w0, e, svc))
    print("  (identical => the wage is the numeraire; no wage system can move the real allocation)")

    print()
    print("=== D. food productivity chi_food (the ignition lever: cheap food frees discretionary income) ===")
    for cf in [0.13, 0.11, 0.09, 0.07, 0.05, 0.035]:
        basin("chi_food=%.3f (cov=1 at e=%.3f)" % (cf, 0.9936 * cf), {"chi_food": cf})

    print()
    print("=== E. productivity + cheap services together ===")
    for cf, cs in [(0.09, 0.12), (0.07, 0.12), (0.07, 0.08), (0.05, 0.05)]:
        basin("chi_food=%.3f chi_service=%.2f" % (cf, cs), {"chi_food": cf, "chi_service": cs})

    print()
    print("=== A. food wedge (1 = food price equals its unit labour cost) ===")
    for wf in [1.10, 1.02, 0.994, 0.95, 0.85, 0.70]:
        basin("wedge_food=%.3f" % wf, {"wedge_food": wf})

    print()
    print("=== B. relative cost of services to food (wedge_s * chi_s) / (wedge_f * chi_f) ===")
    rel0 = 1.0 * 0.35 / (0.9936 * 0.13)
    print("  reference relative service cost ratio = %.2f" % rel0)
    for cs in [0.35, 0.20, 0.12, 0.08, 0.05]:
        basin("chi_service=%.2f (rel=%.2f)" % (cs, 1.0 * cs / (0.9936 * 0.13)), {"chi_service": cs})

    print()
    print("=== C. both levers together ===")
    for wf, cs in [(0.95, 0.12), (0.85, 0.12), (0.85, 0.08), (0.70, 0.08)]:
        basin("wedge_food=%.2f chi_service=%.2f" % (wf, cs), {"wedge_food": wf, "chi_service": cs})
