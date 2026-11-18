"""
Balance check for docs/jerusalem-plot.md and docs/jerusalem-progression.md: a
greedy player builds the plot hour by hour, buying missing materials at the
Market. Prints the day each house level is reached for four player types.

The tables (PRICE, SELL, B) are generated from shared/src/plot.ts, so they
can't drift from the game: after changing the numbers there, regenerate them
with `npx tsx shared/scripts/plotsim-tables.mts > docs/balance/plotsim_tables.py`.

Fields are modelled as producers of barley (an average crop, harvested on each
visit), the Bakehouse turns barley into bread; copper is bought (the mines are
a cheaper extra the sim leaves out, like the other expeditions, the scrolls and
the skills, so real players are faster). Two builders from House 4. Run with
`--sell` for a player who sells everything above 150 of a material on each
visit, at the flooded market's falling price (FLOOD, FLOOD_FLOOR).

    python3 docs/balance/plotsim.py [--sell]
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plotsim_tables import PRICE, SELL, B
SELLING = '--sell' in sys.argv
FLOOD, FLOOD_FLOOR = 0.95, 0.2

# An average field: barley's 20 per 12 h, net of seed, half the time in season (+50 %).
FIELD_BARLEY_PER_H = (20 * 1.25 - 4) / 12
def coin(c): return sum(PRICE[k]*v for k,v in c.items())
def price_of(extra): return extra.get('price', 0)

def sim(per_day, collects_per_day, label, days=400):
    lvl = {k: 0 for k in B}; lvl['house'] = 1
    coins = 0; acc = {k: 0.0 for k in PRICE}
    inv = {k: 0 for k in PRICE}; inv.update(wood=20, bricks=20, stone=20)  # starter gift
    oven = 0  # hours left in the Bakehouse's batch
    builders = []  # (finish_hour, building)
    milestones = {}
    for h in range(days*24):
        if h % 24 == 0: coins += per_day; sold = {}
        nb = 2 if lvl['house'] >= 4 else 1
        cap = B['store'][lvl['store']-1][3]['cap'] if lvl['store'] else 10
        for b in B:
            if lvl[b] and 'make' in B[b][lvl[b]-1][3]:
                m, r = B[b][lvl[b]-1][3]['make']
                acc[m] = min(cap, acc[m] + r)
        # The fields' barley (harvested on visits like everything else) and the oven.
        floor = B['thresh'][lvl['thresh']-1][3]['grain'] if lvl['thresh'] else 0
        for i in range(1, 7):
            f = f'field{i}'
            if lvl[f]: acc['barley'] += FIELD_BARLEY_PER_H * B[f][lvl[f]-1][3]['field'] * (1 + floor)
        oven = max(0, oven - 1)
        if h % (24 // collects_per_day) == 0:
            for m in acc:
                inv[m] += int(acc[m]); acc[m] -= int(acc[m])
        for f, b in list(builders):
            if f <= h:
                builders.remove((f, b)); lvl[b] += 1
                if b == 'house': milestones.setdefault(f'House {lvl[b]}', round(h/24, 1))
        if all(lvl[b] == len(B[b]) for b in B):
            milestones.setdefault('all done', round(h/24, 1)); break
        if h % (24 // collects_per_day): continue  # player only acts when they open the app
        if lvl['bake'] and oven == 0 and inv['barley'] >= 10:
            grain, hrs = B['bake'][lvl['bake']-1][3]['bake']
            n = min(grain, inv['barley'] // 10 * 10)
            inv['barley'] -= n; inv['bread'] += int(n * 0.8); oven = hrs
        if SELLING:
            for m in SELL:
                while inv[m] > 150:
                    coins += SELL[m] * max(FLOOD_FLOOR, FLOOD ** sold.get(m, 0)); sold[m] = sold.get(m, 0) + 1; inv[m] -= 1
        busy = {b for _, b in builders}
        while len(builders) < nb:
            water = B['well'][lvl['well']-1][3]['water'] if lvl['well'] else 0
            used = sum(B[b][lvl[b]-1][3].get('water', 0) for b in B if lvl[b] and b != 'well')
            opts = []
            for b, levels in B.items():
                if b in busy or lvl[b] >= len(levels): continue
                cost, hrs, req, extra = levels[lvl[b]]
                if any(lvl[r] < v for r, v in req.items()): continue
                prev = B[b][lvl[b]-1][3].get('water', 0) if lvl[b] else 0
                if b != 'well' and extra.get('water', 0) - prev > water - used: continue
                missing = {k: max(0, v - inv[k]) for k, v in cost.items()}
                pay = coin(missing) + price_of(extra)
                prio = pay * (0.6 if 'make' in extra or b == 'well' else 1.0)
                opts.append((prio, pay, b, cost, hrs))
            opts = [o for o in opts if o[1] <= coins]
            if not opts: break
            _, pay, b, cost, hrs = min(opts)
            coins -= pay
            for k, v in cost.items(): inv[k] = max(0, inv[k] - v)
            if hrs == 0: lvl[b] += 1; continue  # the old threshing floor comes with Field 1
            builders.append((h + max(1, round(hrs)), b)); busy.add(b)
    print(f'{label:<34}', milestones, int(coins))

total = sum(coin(l[0]) for b in B.values() for l in b)
house = sum(coin(l[0]) for l in B['house'])
print('total plot coin-equivalent', total, '| house', house)
for per_day, c, label in [(40, 1, 'solo casual  (40/day, 1 visit)'), (70, 1, 'casual + arena (70/day, 1 visit)'), (130, 2, 'keen (130/day, 2 visits)'), (220, 2, 'very keen (220/day, 2 visits)')]:
    sim(per_day, c, label, days=1500)
