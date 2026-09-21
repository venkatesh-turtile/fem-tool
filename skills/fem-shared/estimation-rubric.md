# Estimation rubric — how to read `fem.config.json`

Spec §9. The **numbers** live in `fem.config.json` so they are data, not prose —
NFR-6 requires every estimate to trace to a rubric row. This file explains how
to apply them.

## The order matters, and it is pinned

L7 is a **percentage** in a table of absolutes. Without a fixed order, two
people get different totals from identical inputs:

```
1  sum L1-L6 base sizes
2  apply §9.2 risk multipliers to that sum
3  L7 = 30 % of the MULTIPLIED L1-L6 sum
4  add L8-L12, unmultiplied
5  module subtotal
6  + 15 % module overhead
7  P90 = P50 x evidence state
```

`compute-estimate.ts` implements exactly this. Do not do the arithmetic by hand.

## Ranges

Where §9.1 gives a range — `complex_logic_or_state_machine: [2, 4]` — the script
takes the **midpoint** for P50. The spread is already carried by P90 through the
evidence-state multiplier; taking the top of the range as well double-counts the
uncertainty.

## The multiplier cap — not in the spec

Four multipliers stack to **×3.80**, and P90 at ×1.6 reaches **×6.08**. A 2-day
change reads as 12 days.

`fem.config.json` sets `riskMultiplierCap: 3.0` pending a decision from the
spec's author. When it fires, `CAPPED` appears in `multipliersApplied` so it is
visible rather than silent. **Flag this at gate 2** if a change hits it.

## Confidence

```
High     no assumed items
Medium   <= 20 % assumed
Low      > 20 % assumed
```

Confidence is about **evidence**, not difficulty. A well-understood 8-day change
with every claim cited is High.

## Say the numbers are defaults

§9.1's table is headed *"defaults · calibrated in pilot"*. Until `fem-calibrate`
has run against a shipped module, the absolute days are informed guesses. The
**structure** is deterministic; the **magnitudes** are not yet evidenced.

Report it. An estimate presented as calibrated when it is not is worse than a
wide range presented honestly.
