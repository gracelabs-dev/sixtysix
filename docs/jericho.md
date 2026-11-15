# The March on Jericho

The arena's standings scene between questions (classic mode), and the finale
before the Crowning. Joshua 6: Israel marches round Jericho, the horns sound,
the people shout and the wall falls down flat.

Code: `app/src/ceremony/jericho/` (`Jericho.tsx` the scene, `geometry.ts` the
road and the rules for who stands where), styles `app/src/theme/jericho.css`,
texts `ceremony.jericho.*`. Used by `screens/arena/game/Leaderboard.tsx`
(every question) and `Podium.tsx` (`final`, then the Crowning). Dev page:
`/jericho-lab?n=1…200&total=3…30&layout=board|phone|upright&me=N`.

## What it shows

- Jericho painted from above. A road (drawn in code, not painted) leaves the
  Israelite camp at the lower left, runs clockwise round the city and ends at
  the gate. Further along = further ahead; the gate is the goal. The road is
  open, not a ring, so the leader never stands next to the last player.
- **Medallions** (portrait, colour rim, rank chip) for the leaders: boards up to
  8, phones up to 6 plus your own (bigger, gold ring, "You"). The leader is drawn
  1.2× with the horn badge, rays and a name ribbon. Only as many medallions as fit
  on the road without piling up (at least 3); players still on 0 points wait in
  the camp as dots.
- **The crowd**: everyone else is a dot in their colour (one canvas), always
  behind the last medallion, in rows of three when they bunch up. 200 players
  read as a marching column.
- **The trodden road** turns gold up to the leader.
- **Seven horns**: one more lights and the wall cracks a little more as the game
  goes on (`hornsAfter`: `ceil(7 × played / total)`, at most 6 before the end).
- **Boards** add the rail (title, horns, top 8 with ▲/▼ and counting scores,
  "+N more marching"). **Phones** get the title and horns above the map and the
  top three plus their own row under it; their standing panel (`Standing`) follows.

## Rules for positions (`geometry.ts`)

- Distance = score × `progressScale`: a whole road is `questions × 800` points,
  the leader stops at 94 % until the last question, and in the finale the leader
  ends exactly at the gate (everyone scaled alike). Before and after a beat use
  the same scale, so nobody walks backwards.
- `layoutPacks`: medallions in rank order; anyone who would stand on the one
  ahead joins its pack, which walks two by two behind its head (the leader's
  first row a little further back). Tokens are only ever pushed back, so the order
  on the road is the rank order. A pack that reaches back past the camp queue is
  squeezed to fit (only happens at the very start).
- Medallions never leave the picture (clamped to the edges); the name ribbon
  hangs below near the top edge and is nudged inward at the sides.

## One beat (≈ 6 s; the server shows the standings for 6 s)

| ms | |
|---|---|
| 0 | old positions, old ranks |
| 250 | "+points" rise over the scorers |
| 650–2850 | everyone marches together (ease in-out, a shared bob, sand at the feet), the gold road grows, rail scores count up |
| 2900 | ranks flip, the rail reorders, the horn badge moves to the leader |
| 3350 | a new horn lights, the city shakes, a crack draws, dust (only when the stage changes) |

The finale replaces the wall beat: all horns light in turn, "Shout!", a flash and
a shake, a ring of dust, the fallen painting under the dust, light on the city,
the verse, the champion grows at the gate; after about 7.6 s the Crowning.
Reduced motion: the end state at once (the finale holds 3.5 s).

## Art

`bg-jericho.webp` and `bg-jericho-fallen.webp` (an edit of the first, same
camera), `fx-shofar.webp`, `fx-dust.webp`, all from `art-pipeline/prompts.json`
(`bg-jericho`, `bg-jericho-fallen`, `item-shofar`, `fx-dust`). The road ellipse,
gate, camp and crack positions in `geometry.ts` are measured on a 5 % grid of the
painting: re-measure them if it is ever regenerated.
