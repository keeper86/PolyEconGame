#!/usr/bin/env python3
"""Return-map (Poincare) eigenvalue of a facility's capacity cycle.

Flieller/Riedinger/Louis, "Computation and stability of Limit Cycles in Hybrid
Systems": a hybrid limit cycle is stable iff the eigenvalues of the Jacobian of
the sampled return map lie inside the unit circle. This measures that Jacobian
for a facility's operating/capacity cycle straight from the long-run series.

State is x = (scaleFrac, ln maxScale). The return map F advances x one full
oscillation (peak to peak). Its Jacobian is the cycle-to-cycle linearisation;
|lambda| > 1 means the cycle grows.
"""
import csv, math, statistics, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'tools/longrun/results/head-6000y/series.csv'
FACILITIES = [
    ('ironSmelter', 'ironSmelterScale', 'ironSmelterMaxScale'),
    ('sandMine', 'sandMineScale', 'sandMineMaxScale'),
    ('coalMine', 'coalMineScale', 'coalMineMaxScale'),
    ('ironMine', 'ironMineScale', 'ironMineMaxScale'),
    ('maintenance', 'maintFacilityScale', 'maintFacilityMaxScale'),
]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float('nan')


def load(path):
    with open(path) as fh:
        return list(csv.DictReader(fh))


def troughs(series, rise=1.6, window=6, lookahead=72):
    """Indices of deep troughs: local minima that are followed by a >= `rise`
    recovery within `lookahead` months. Plateau ticks cannot qualify because a
    plateau minimum is never followed by a large rise."""
    out = []
    n = len(series)
    for i in range(window, n - window):
        if series[i] != min(series[i - window:i + window + 1]):
            continue
        fut = max(series[i:min(n, i + lookahead + 1)])
        if series[i] > 0 and fut / series[i] >= rise:
            out.append(i)
    # collapse troughs closer than 24 months, keeping the deepest
    dedup = []
    for i in out:
        if dedup and i - dedup[-1] < 24:
            if series[i] < series[dedup[-1]]:
                dedup[-1] = i
        else:
            dedup.append(i)
    return dedup


def analyse(rows, name, scale_col, max_col):
    scale = [num(r.get(scale_col)) for r in rows]
    mx = [num(r.get(max_col)) for r in rows]
    ticks = [num(r.get('tick')) for r in rows]
    good = [(i, scale[i], mx[i]) for i in range(len(rows))
            if scale[i] == scale[i] and mx[i] == mx[i] and mx[i] > 0 and scale[i] > 0]
    if len(good) < 50:
        return None
    idx = [g[0] for g in good]
    s = [g[1] for g in good]
    m = [g[2] for g in good]
    t = [ticks[i] for i in idx]

    pk = troughs(s)
    if len(pk) < 5:
        return None
    # cycle-start state at each deep trough
    states = []
    for j in range(1, len(pk)):
        i = pk[j]
        prev = pk[j - 1]
        x = (s[i] / m[i], math.log(m[i]))
        period = (t[i] - t[prev]) / 360.0
        states.append((x, period, t[i] / 360.0))
    if len(states) < 4:
        return None

    # Return map linearisation: fit x_{k+1} = A x_k + b over cycle starts.
    # With few points, estimate the dominant gain from the ratios of the two
    # coordinates and their cycle-to-cycle growth.
    # Return map linearisation: fit x_{k+1} = A x_k + b over cycle-start states
    # by ordinary least squares on the augmented regressor [x_k, 1].
    xs = [st[0] for st in states]
    A = [[None, None], [None, None]]
    lam = None
    if len(xs) >= 6:
        # columns: f0, f1, 1
        n = len(xs) - 1
        X = [[xs[k][0], xs[k][1], 1.0] for k in range(n)]
        # solve normal equations for each target coordinate
        def lstsq(target):
            XtX = [[sum(X[k][a] * X[k][b] for k in range(n)) for b in range(3)] for a in range(3)]
            Xty = [sum(X[k][a] * target[k] for k in range(n)) for a in range(3)]
            # gaussian elimination
            M = [row[:] + [Xty[i]] for i, row in enumerate(XtX)]
            for c in range(3):
                p = max(range(c, 3), key=lambda r: abs(M[r][c]))
                M[c], M[p] = M[p], M[c]
                if abs(M[c][c]) < 1e-18:
                    return [0.0, 0.0, 0.0]
                for r in range(3):
                    if r != c:
                        f = M[r][c] / M[c][c]
                        for cc in range(c, 4):
                            M[r][cc] -= f * M[c][cc]
            return [M[i][3] / M[i][i] for i in range(3)]
        c0 = lstsq([xs[k + 1][0] for k in range(n)])
        c1 = lstsq([xs[k + 1][1] for k in range(n)])
        A = [[c0[0], c0[1]], [c1[0], c1[1]]]
        tr = A[0][0] + A[1][1]
        det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
        disc = tr * tr - 4 * det
        if disc >= 0:
            r1 = (tr + math.sqrt(disc)) / 2
            r2 = (tr - math.sqrt(disc)) / 2
            lam = max(abs(r1), abs(r2))
        else:
            lam = math.sqrt(abs(det))  # complex pair: modulus = sqrt(det)

    peri = [st[1] for st in states]
    peak_scale = [st[0][0] * math.exp(st[0][1]) for st in states]

    return {
        'name': name,
        'n_cycles': len(states),
        'median_period': statistics.median(peri),
        'first_period': peri[0],
        'last_period': peri[-1],
        'peak_scale_growth': peak_scale[-1] / peak_scale[0],
        'A': A,
        'lambda': lam,
        'states': states,
    }


rows = load(PATH)
print(f'series: {PATH}\n')
print(f'{"facility":12s} {"cycles":>6s} {"period_1st":>10s} {"period_last":>11s} '
      f'{"peak_growth":>12s}')
results = {}
for name, sc, mc in FACILITIES:
    r = analyse(rows, name, sc, mc)
    if not r:
        continue
    results[name] = r
    print(f'{name:12s} {r["n_cycles"]:>6d} {r["first_period"]:>10.1f} {r["last_period"]:>11.1f} '
          f'{r["peak_scale_growth"]:>11.1f}x')

print('\nReturn-map eigenvalue (per full cycle), from a 2x2 OLS fit of the')
print('sampled map on x = (scale/maxScale, ln maxScale) at deep troughs.')
print('|lambda| > 1 => unstable (cycle grows); < 1 => stable.')
print(f'{"facility":12s} {"cycles":>6s} {"period1":>8s} {"periodN":>8s} '
      f'{"lam":>8s} {"verdict":>10s}   A = [[a00,a01],[a10,a11]]')
for name, r in results.items():
    lam = r['lambda']
    if lam is None:
        print(f'{name:12s} {r["n_cycles"]:>6d}  (insufficient cycles for fit)')
        continue
    verdict = 'UNSTABLE' if lam > 1.0 else 'stable'
    A = r['A']
    print(f'{name:12s} {r["n_cycles"]:>6d} {r["first_period"]:>8.1f} {r["last_period"]:>8.1f} '
          f'{lam:>8.3f} {verdict:>10s}   [[{A[0][0]:.3f},{A[0][1]:.3f}],[{A[1][0]:.3f},{A[1][1]:.3f}]]')

print('\nBecause the trough scale/maxScale is pinned to the MIN_SCALE_FRACTION')
print('floor, that coordinate is constant on the attractor. The cycle is then a')
print('1-D map in ln(maxScale); its gain is a11, the capacity-ratchet gain.')
print(f'{"facility":12s} {"trough_frac_med":>15s} {"a11(ratchet)":>13s} {"period_gain":>12s}')
for name, r in results.items():
    fracs = [st[0][0] for st in r['states']]
    peri = [st[1] for st in r['states']]
    pg = [peri[k + 1] / peri[k] for k in range(len(peri) - 1) if peri[k] > 0]
    a11 = r['A'][1][1] if r['A'][0][0] is not None else float('nan')
    print(f'{name:12s} {statistics.median(fracs):>15.4f} {a11:>13.4f} {statistics.median(pg):>12.4f}')
