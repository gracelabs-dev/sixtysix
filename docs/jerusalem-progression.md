# Jerusalem progression: a longer climb, a living city

Proposal, 2026-11-18. It builds on `jerusalem-plot.md` (the homestead) and
`jerusalem-expansion.md` (fields, bread, expeditions, Phase 3 ideas). Nothing
here is built yet; §9 lists the decisions the owner still has to make.

## 1. What we measured

**Live city (2026-11-18, `/api/city` and `/api/players`):** 6 families. Three
reached House 6–7 in 2–3 weeks:

| Player | House | Homestead buildings | Valley | Games played |
|---|---|---|---|---|
| szaboantal | **7** | all at 4 | Bake 3, Stable 1, Field 1 | 11 |
| godsson98 | 6 | all at 4 | Bake 3, Stable 2, Field 1 at 2 | 14 |
| PeterParker | 6 | 3–4 | Bake 2, Stable 1, Field 1 | 14 |

With 11–14 quiz games each, quiz coins paid for only a small part of it. **The
rest came from selling produce at the Market.**

**The Market already has a 50 % spread.** Selling pays half the buy price
(stone: buy 5, sell 2), and 60–70 % of it with Fair trader. A 25 % spread
would make selling *easier*, not harder. The problem is the volume, not the
spread:

| | Wood | Bricks | Wool | Oil | **Coins a day if sold** |
|---|---|---|---|---|---|
| Produced a day at the "all at 4" plot above | 144 | 216 | 60 | 36 | **≈ 830** |
| Produced a day with everything at the top | 240 | 288 | 108 | 60 | **≈ 1,330** (+30 % with Good harvest) |
| A regular player's quiz coins a day | | | | | ≈ 130 |

So one day's produce buys about 165 stone. Selling earns 6–10× the quiz income.

**The sim (`plotsim.py`), keen player (130 coins a day), with different Market rules:**

| Market rule | House 7 | Everything done |
|---|---|---|
| No selling | day 153 | day 280 |
| Today: sell at 50 % | day 32 | day 43 |
| Sell at 35 % | day 38 | day 53 |
| Sell at 25 % | day 45 | day 65 |
| **Flooded market** (each unit sold today pays 5 % less, see §2.1) | **day 72** | **day 122** |

The sim leaves out expeditions, scrolls, bread and skills. Real players were
about twice as fast as the sim (House 7 in ~3 weeks against its 32 days).

**Other leaks:**
- **The families' stall** allows prices up to the full Market *buy* price. Two
  family members can trade each other's surplus at 100 % and skip the spread.
- **Builders:** 1 builder, 2 from House 4, 3 with the Third builder skill
  (tier 3 of the Builder path). Add the scrolls (up to −50 %), bread (−10 % per
  10 bread), Quick hands and Master builder, and three long builds run at once
  at half time.
- **The gate already exists, but it's low.** House 7 needs every homestead
  building at 4, and most of them go to 5–6. Nothing above House 7 needs the
  valley, the Stable or the Bakehouse.

## 2. Fix the economy first (small, ships first)

### 2.1 A flooded market instead of a lower price

Each unit of a material you sell on a UTC day pays 5 % less than the one
before (price × 0.95^sold today), and the count resets at midnight UTC.
- The first units still sell at today's price. Selling a little each day stays
  worthwhile, so nobody feels robbed.
- One material can earn at most about 20× its sell price a day: wood 40,
  bricks 20, wool 60, oil 80, stone 40, cedar 300, gold 800 coins. Four
  producers together earn about 200 a day instead of 830–1,330.
- The sale sheet shows the falling price live ("the merchants have enough
  wool today").
- Fair trader keeps its effect: it raises the starting price, not the limit.
- The sim puts the keen player's House 7 on **day 72** instead of 32.

The owner said no to a hard daily purse (expansion §8.1). This is a softer
version of the same idea, with no wall to hit. A **lower flat price** (25 % of
buy) is the alternative. It's simpler but much weaker (House 7 on day 45).

### 2.2 The stall

Narrow the range to *sell price … halfway to the buy price*, and charge a
10 % toll at the gate (§6.2), paid by the seller. Trading still beats the
Market, but family members can no longer skip the spread.

### 2.3 Builders

Recommended: **at most two builders on long builds.**
- 1 builder, then 2 from House 4 (as today).
- Third builder becomes **"Apprentice"**: a third builder who takes only builds
  of 2 hours or less. It still matters early on and stops mattering for the
  long builds.
- Alternative: move the 2nd builder to House 6 and leave the skill as it is.

### 2.4 Stone stays scarce

Stone has no producer on purpose. Once selling is limited, stone comes from
the quarry expeditions (≈ 3 coins a stone in wages), the Market at 5, and
small rewards (hunt, clearing fields, helping). Optionally raise the Market's
stone price to 6. Late levels already cost hundreds of stone each.

## 3. More house levels, gated by the whole homestead (House 8–12)

From House 8 up, every house level needs the rest of the homestead first. Each
gate pulls in a part of the game that players skip today: the valley, the
Stable, expeditions, new buildings, the city.

| Level | Name (verse) | Needs (besides materials) | Build | Cost (approx.) |
|---|---|---|---|---|
| 8 | House with an upper room for guests (2 Kgs 4:10) | every homestead building at 5 (kiln 5 = top), Bakehouse 3, Stable 2, Threshing floor 3, Field 2 at 2 | 3 days | stone 250, bricks 80, cedar 40, wool 60, oil 40, copper 15, gold 8, bread 60 |
| 9 | Elder's house by the gate (Prov 31:23) | every homestead building at its top, Bakehouse 4, Stable 3, Threshing floor 4, Fields 1–3 irrigated | 4 days | stone 350, cedar 60, copper 25, gold 15, bread 100 |
| 10 | Steward's house (Gen 43:16) | new levels: Wall 6, Well 7, Storehouse 7; new buildings Smithy 2 and Weaver's house 2; a city job worked 7 times (§7) | 5 days | stone 450, cedar 80, iron 30, linen 20, gold 20, bread 150 |
| 11 | House of hewn stone (1 Kgs 7:9) | Smithy 3, Weaver 3, Vineyard 3, all 6 fields irrigated, gifts to the Temple (§6.3) | 7 days | stone 600, cedar 100, iron 50, linen 40, wine 40, gold 30 |
| 12 | Solomon's house (1 Kgs 7:1, "thirteen years") | everything at its top, served once as an elder (§7) | 10 days | stone 800, cedar 150, gold 50, every rare material |

**Targets for a keen player** (re-simulated before release): House 8 in month
2–3, House 10 in month 5–6, House 12 in about a year.

**What it needs:**
- **New top levels for the existing buildings.** Wall 6 Gatehouse and 7 Tower
  of Hananel (Neh 3:1). Well 7 Pool and aqueduct (2 Kgs 20:20). Storehouse 7
  Treasury. Producers get a 7th level that unlocks something, not more output.
- **New buildings and materials** from expansion Phase 3:
  - Smithy: copper + iron → tools (1 Sam 13:19).
  - Weaver's house: flax → linen (Prov 31:13).
  - Vineyard and Winepress: grapes → wine.
  - Iron from a new expedition (Deut 8:9). Flax from the fields.
  - Can be bought, never sold, like grain and bread today.
- **A new 3D model per house level 8–12.** They are procedural (`drawHouse`),
  so there's no art cost. The city draws them too. Each level stays within the
  triangle budget in `graphics-plan.md`.
- **Optional: tighten Houses 5–7 for new players** (e.g. House 6 needs the Stable
  and Bakehouse 1). Existing plots keep their levels, because nothing is ever
  taken away.

## 4. Things that happen to the homestead (events)

Rules for every event:
- It never takes a level away.
- Losses are capped (at most ~20 % of one stock, or a few hours of one producer).
- A Bible question or a defence building lessens or prevents the loss.
- It resolves lazily on load, like `advance` (seeded per plot and day, decided
  by the server).
- At most one bad event per family every 3–4 days, and none while you are
  away 3+ days. Absence already brings weeds, so events should not punish
  people who stay away.

**Catastrophes** (each one gives a defence building a job):

| Event | What happens | Defence |
|---|---|---|
| Earthquake (Amos 1:1; Zech 14:5) | one building is "cracked": its production −50 % until repaired (stone + wood, or 3 questions) | Wall level lowers the odds; Storehouse 7 = no loss of stock |
| Drought (1 Kgs 17–18) | for one game-season week, the well gives −30 % water; users beyond the supply slow down | Well 5+ cisterns cover part, Well 7 all of it |
| Locusts (Joel 1:4) | one growing field loses half its crop | Threshing floor 4 / tithe blessing; 3 questions from Joel save it |
| Fire (Judg 15:5) | one producer's waiting stock burns | collect often; Wall 6 gatehouse watch |
| Sickness in the flock (Ex 9:3) | sheepfold stops for 12 h | feeding barley (already exists) halves it |
| **Raiders on the homestead** (extends the field raiders) | they come for the storehouse: up to 15 % of one material | Wall 5+ and the watchtower turn back weak raids; questions drive off the rest; neighbours can lend a hand (like *Help*) |

**Good events** (just as often, so the homestead doesn't feel hostile):
- **Three visitors** (Gen 18): offer bread and get a blessing, +25 % production for a day.
- **A merchant caravan** (Gen 37:25): for 6 h it sells one rare material
  (iron, linen, cedar) cheaply.
- **Early and late rain** (Deut 11:14): the next harvest +50 %.
- **A lost sheep** (already exists).

## 5. Upkeep: a coin sink that grows with you

The bigger the house, the more it costs to keep. Today the late game has no
running costs, so coins pile up.
- **Workers' bread** (already partly there): from House 8, the house eats
  bread every day. Without it, builds slow down by 25 %.
- **The city tax** (§6.2) scales with house level.

## 6. Taxes, tithes and the city treasury

### 6.1 The tithe (voluntary; Mal 3:10, Deut 14:22)
- Once a week, give a tenth of what your fields and producers made to the
  Temple (a button with the amount worked out for you).
- In return, the **blessing**: +15 % production for 7 days, and progress on
  the city's Temple.
- Voluntary, because a forced tithe sits badly with the theology. The reward
  makes it worth doing.

### 6.2 The city tax and the gate toll (Matt 17:24–27; 22:21)
- **House tax**, weekly, in coins: house level² × 4 (House 4: 64, House 8:
  256, House 12: 576).
- The tax collector (a walker in the city, Zacchaeus) comes on Monday.
- If you don't pay, nothing breaks, but no new house level can start until it
  is paid.
- **Gate toll:** 10 % of every stall sale.
- Both go into the **city treasury**: one shared pot, shown on the city map.

### 6.3 What the treasury pays for: city projects
- City projects anyone can give to:
  - repair the city wall after an earthquake;
  - an aqueduct (all wells +1 water for a month);
  - a feast (Deut 16: producers +25 % for everyone for a week);
  - the Temple's stages (foundation → walls → Jachin and Boaz → Holy Place →
    dedication, expansion §3.3).
- Givers go on a donor list, with a rare look item at milestones.
- Temple gifts are a gate for House 11.
- Every project works with 2 families as well as 200, because goals scale
  with the number of active families.

## 7. Roles and jobs in the city

### 7.1 Jobs (anyone, from House 5)
- A job is a daily shift: 5 questions from that job's books, then a wage in
  coins plus a little material.
- Wages count as quiz income, inside the daily cap, so this is a reason to
  play, not a money tap.
- You hold one job at a time, and switch weekly. The job title shows on your
  name tag and your profile.

| Job | Books | Pays |
|---|---|---|
| Scribe (Ezra 7:6) | Law, history | coins + XP |
| Gatekeeper (Neh 7:1) | Nehemiah, Kings | coins + stone |
| Shepherd for the city (Ps 23) | Psalms, Gospels | coins + wool |
| Water carrier (Josh 9:21) | Joshua, Judges | coins + a well bonus |
| Tax collector (Luke 19) | Gospels | coins + a share of the tax round (and the jokes write themselves) |

### 7.2 Elders and the governor (Ruth 4:2; Neh 5:14)

*Decided otherwise: the governor becomes a hard-to-get job (§9.5); elders come later.*

- **Elder** is a threshold, not a contest. Any family with House 9+, a job
  worked 20 times and Temple gifts is an elder. Elders get a seat at the gate:
  a look item and a seat drawn in the city.
- **Governor:** each week, the family with the most *standing* (help given,
  tax paid, Temple gifts, jobs worked) becomes governor. With 6 families, an
  election would be thin, so standing decides. A vote among elders can come
  later.
- The governor's powers, all inside safe bounds:
  - set the gate toll between 5 and 15 %;
  - pick which city project the treasury funds this week;
  - declare one feast a month.
- The governor also gets a residence marker in the city and the governor's robe
  (look item).
- Nehemiah declined the governor's allowance (Neh 5:14–18). A governor who
  waives the role's coin stipend gets extra standing.

## 8. Order of work

| Phase | What | Size |
|---|---|---|
| A | Flooded market, stall range + toll, builders rule, re-simulate (`plotsim.py` gets the real Market) | small, 1 session |
| B | Wall 6–7, Well 7, Store 7, House 8–9 with gates and 3D models | medium, 2–3 sessions |
| C | Events (catastrophes, homestead raiders, good events) | medium, 2 sessions |
| D | City tax, gate toll, treasury, tithe, city projects | medium, 2 sessions |
| E | Jobs, elders, governor | medium, 2 sessions |
| F | Smithy, Weaver, Vineyard, iron/flax/linen/wine, House 10–12, the Temple | large, 4+ sessions |

Every phase: en/de/hu texts, guide cards in `tutorial/content.ts`, server
authority, and an entry in CLAUDE.md.

## 9. The owner's decisions (2026-11-18)

1. **Market: flooded market with a floor.** Each unit sold today pays 5 %
   less than the one before, but never less than a floor share of the sell
   price. A lot's price is summed and then rounded down, so bricks at 0.2 coin
   still add up.
   - Sim, keen player, House 7: floor 20 % → **day 60**; floor 10 % → day 66;
     floor 30 % → day 54. No floor → day 72; today → day 32.
   - Suggested floor: 20 %. Past the flood, a House-6 plot still earns about
     170 a day.
2. **Costs also grow steeply with level.** Today's costs grow slowly: each
   level costs about 1.5–2× the one before, with long flat stretches. From
   level 5 on (and for House 8–12), use a fixed growth factor of about 1.6×
   per level, so the costs in §3 turn into a curve and the top levels of every
   building get much dearer.
   - The flooded market and steeper costs add up, so the sim gets both
     before the numbers are fixed.
   - Existing levels below 5 stay as they are, so new players start just as
     fast.
3. **Builders: the Apprentice.** At most 2 builders on builds over 2 h; the
   Third builder skill becomes the Apprentice for builds of 2 h or less.
4. **Catastrophes: mild**, plus a **Philistine raid** (1 Sam 13:17–20;
   23:1):
   - The Philistines raid the storehouse and take part of several materials
     (capped, e.g. 10–15 % each).
   - They damage two buildings. Each produces at a reduced rate (e.g. 50 %)
     until it is repaired, with stone and wood, and optionally 3 questions to
     cut the cost.
   - The wall and the watchtower lower the odds and the losses.
   - Damage never removes a level, and a damaged building can still be
     upgraded (the upgrade repairs it).
   - The 3D yard shows it: smoke, broken fence pieces, a "repair" tag.
5. **Roles: jobs only for now.** The **governor is a job too**, the top one:
   - It pays well (the best wage in the city, still inside the daily coin cap,
     plus a weekly stipend in materials).
   - It's genuinely hard to get. Candidates:
     - House 10+;
     - 50 shifts worked in other jobs;
     - a large one-off fee to the treasury;
     - a level requirement (e.g. level 30);
     - a 10-question governor's examination that needs 9 right, at most once
       a week.
   - One governor per city at a time, for 4 weeks. Then the next qualified
     family who applied takes over (if nobody did, the governor stays).
   - The governor's powers (toll, project, feast) come with the job, as in §7.2.
   - Elders and elections come later.

### Second round (2026-11-18)

6. **Up to House 12.**
7. **The Apprentice:**
   - builds anything of 2 h or less on his own (above a certain level, no
     building is that short);
   - *or* helps a builder, which takes 25 % off the time left;
   - does repairs (when the raids land).
8. **Every building gets higher levels.** New buildings unlock from House 7:
   - Vineyard and Weaver's house at House 7;
   - Smithy at House 8;
   - Apiary at House 9.
   - They make wine, linen, tools and honey (bought at the Market, never sold).
9. **A larger yard in a Hay Day style:** more room, the camera close in on
   the house, drag to look round. Not everything has to be on screen at once.

## 10. Still open

1. **House levels:** up to 12 as in §3, or fewer?
2. **Existing players:** keep everything (recommended), or also give a small
   welcome gift when Phase A lands, since their income drops?
3. **The governor's bar:** which of the candidate requirements in §9.5, and
   how strict?

## 11. Built: release 1 (2026-11-18)

Phase A and most of Phase B:

- **The flooded market:** `FLOOD` 0.95 per unit, `FLOOD_FLOOR` 20 %, counted
  per UTC day.
- **The stall:** prices up to halfway between sell and buy, and a 10 % toll.
- **The Apprentice** (skill `third`): short builds on his own, or −25 % of the
  time left on one build.
- **House 8–12**, gated as in §3.
- **New levels for every building:** well, storehouse, workshop, sheepfold and
  olive grove up to 9; wall and kiln up to 8; Bakehouse and Stable up to 6;
  threshing floor up to 5; fields up to 4.
- **Four buildings from House 7:** Vineyard, Weaver's house, Smithy and Apiary,
  making wine, linen, tools and honey.
- **A larger yard** (R 45), the scene filling most of the screen, a closer
  first view.
- **Checks:** `shared/scripts/check-progression.mts` (the ladder has no dead
  ends) and `plotsim.py`, now reading its tables from `plot.ts`.

**Release 2 (Phase C, 2026-11-18): events.** One roll a day when the family
comes, at most one bad event every 3 days.
- Bad events: the Philistine raid (questions, damaged producers, repairs by
  builders or the Apprentice), earthquake, drought, locusts and fire.
- Good events: three visitors (a blessing), a caravan and early rain.

**Release 3 (Phase D, 2026-11-18): the city.**
- The weekly house tax (from 23 Nov 2026) and the voluntary tithe.
- The city treasury, which holds feasts and builds an aqueduct for everyone.
- The Temple, raised by gifts, which gates House 11 and 12. It takes the place
  of the Temple listed under Phase F.

Not done yet:
- jobs and the governor (E).
- Costs of the *existing* levels 5–7 were left alone; only the new levels
  follow the steeper curve.

The sim (`--sell`, the flooded market) says, in days:

| Player | House 7 | House 8 | House 10 | House 12 |
|---|---|---|---|---|
| Casual + arena (70 a day) | 80 | 109 | 251 | 434 |
| Regular (130 a day) | 60 | 85 | 212 | 377 |
| Very keen (220 a day) | 49 | 70 | 179 | 324 |

Real players are faster: the sim sends no expeditions and uses no scrolls,
bread or skills.
