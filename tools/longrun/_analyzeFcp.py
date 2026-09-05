import csv

rows = [l.rstrip('\n').split('\t') for l in open('results/flareChemProbe.tsv') if l.strip()]

def fields(p):
    d = {}
    cur = None
    for x in p[2:]:
        if x in ('R', 'C'):
            cur = x
            continue
        if cur == 'R':
            for c in ['crude', 'mixC', 'ChemicalAsk', 'ChemicalSold', 'ChemicalOut', 'FuelOut', 'oe']:
                if x.startswith(c):
                    d['R_' + c] = x[len(c):]
                    break
    return d

for p in rows:
    y = float(p[1])
    d = fields(p)
    fp = None
    i = 2
    while i < len(p):
        if p[i] == 'C' and i + 1 < len(p) and p[i + 1] == 'FoodProcessor':
            vals = {}
            for t in p[i + 2:i + 11]:
                for c in ['re', 'out', 'buyLast']:
                    if t.startswith(c):
                        vals[c] = t[len(c):]
                        break
            fp = vals
        i += 1
    print(
        'y%6.2f crude %s oe %s chemAsk %7s chemSold %11s chemOut %11s fuelOut %11s mixC %s | Food re %s out %s'
        % (
            y,
            d.get('R_crude', '-'),
            d.get('R_oe', '-'),
            d.get('R_ChemicalAsk', '-'),
            d.get('R_ChemicalSold', '-'),
            d.get('R_ChemicalOut', '-'),
            d.get('R_FuelOut', '-'),
            d.get('R_mixC', '-'),
            fp.get('re') if fp else '-',
            fp.get('out') if fp else '-',
        )
    )
