#!/usr/bin/env python3
"""Corpus sweep: return-map eigenvalue |lambda| of the capacity cycle across
every long-run series that carries the (Scale, MaxScale) pair.

Flieller/Riedinger/Louis: a hybrid limit cycle is locally stable iff the
eigenvalues of the sampled return map's Jacobian lie inside the unit circle.
This reports |lambda| per run so we can see whether the cycle sits above, below
or on the unit circle.
"""
import glob, os, subprocess, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, 'tools', '_cycle_gain.py')

series = sorted(glob.glob(os.path.join(ROOT, 'tools/longrun/results/*/series.csv')))
print(f'{"run":22s} {"ironSmelter":>12s} {"sandMine":>10s} {"coalMine":>10s} {"ironMine":>10s}')
rows_out = []
for path in series:
    try:
        with open(path) as fh:
            head = fh.readline()
    except OSError:
        continue
    if 'ironSmelterMaxScale' not in head:
        continue
    out = subprocess.run([sys.executable, TOOL, path], capture_output=True, text=True).stdout
    vals = {}
    for line in out.splitlines():
        m = re.match(r'^(ironSmelter|sandMine|coalMine|ironMine)\s+\d+\s+[\d.]+\s+[\d.]+\s+([\d.]+)', line)
        if m:
            vals[m.group(1)] = float(m.group(2))
    if not vals:
        continue
    run = os.path.basename(os.path.dirname(path))
    rows_out.append((run, vals))

for run, vals in rows_out:
    def cell(k):
        return f'{vals[k]:>12.3f}' if k in vals else f'{"-":>12s}'
    print(f'{run:22s} {cell("ironSmelter")} {cell("sandMine"):>10s} {cell("coalMine"):>10s} {cell("ironMine"):>10s}')

flat = [v for _, vals in rows_out for v in vals.values()]
if flat:
    over = sum(1 for v in flat if v > 1.0)
    import statistics
    print(f'\n{len(flat)} facility-cycles across {len(rows_out)} runs: '
          f'median |lambda| = {statistics.median(flat):.3f}, '
          f'{over}/{len(flat)} above 1.0')
