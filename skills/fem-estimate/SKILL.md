---
name: fem-estimate
description: "Convert traced backend impact into person-days using the fem.config.json rubric — base sizes per layer, risk multipliers, the L7 test percentage, module overhead, and the evidence-state multiplier that sets P90. Emits P50 and P90 per change and per layer, module totals, a confidence label and the top five cost drivers, as JSON, Markdown and CSV. Phase P5."
---

# fem-estimate — P5

## Split

**The script does the arithmetic. You choose which rubric rows apply.** That
split is what makes NFR-6 true — every number traces to a change item, a layer
and a rubric row, and nobody can get a different total from the same impact.

```bash
bun .claude/skills/fem-estimate/scripts/compute-estimate.ts cms timetable
```

## Order of operations — pinned, and this matters

L7 is a **percentage** in a table of absolutes, so without a fixed order two
people get different answers from identical inputs. `fem.config.json` pins it:

```
1  sum L1-L6 base sizes
2  apply §9.2 risk multipliers to that sum
3  L7 = 30 % of the MULTIPLIED L1-L6 sum
4  add L8-L12, unmultiplied
5  module subtotal
6  + 15 % module overhead
7  P90 = P50 x evidence state
```

## Risk multipliers, and the cap

```
breaking contract with >= 1 other consumer   x1.5
data migration on a large / hot table        x1.5
payments / finance / fee domain              x1.3
state-machine change (A2)                    x1.3
```

They stack multiplicatively: all four give **×3.80**, and P90 at ×1.6 reaches
**×6.08** — a 2-day change reading as 12 days.

**The spec sets no cap. `fem.config.json` sets `riskMultiplierCap: 3.0` pending
a decision.** When the cap fires, the script records `CAPPED` in
`multipliersApplied`, so it is visible rather than silent. Raise it at gate 2 if
the tech lead disagrees.

## Evidence state → P90

```
all items Evidenced              x1.3
any item Assumed                 x1.6
ambiguity question unanswered    x2.0
```

Confidence: **High** with no assumed items, **Medium** at ≤20 %, **Low** above.

## Say what the numbers are

The §9.1 base sizes are labelled *"defaults · calibrated in pilot"*. They are
estimates of estimates until `fem-calibrate` has run against a shipped module.
**Report the range, never the midpoint alone**, and say the rubric is
uncalibrated if it is. M4's ±25 % bar is realistically a post-calibration
target.

## Output

```
05-estimate.json   per change, per layer, totals, drivers
05-estimate.md     readable
05-estimate.csv    one row per change, one column per layer — for a spreadsheet
```
