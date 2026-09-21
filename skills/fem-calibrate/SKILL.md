---
name: fem-calibrate
description: "After a module has actually shipped, compare the fem estimate against real actuals per layer and propose updates to the fem.config.json rubric. This is how the estimation model stops being a guess. Use when a module from the migration has been delivered, when the user asks whether the estimates were accurate, or when they want to tune the rubric."
---

# fem-calibrate

**This is the skill that makes M4 reachable.** §9.1's base sizes are labelled
*"defaults · calibrated in pilot"* — they are guesses until a real module has
been measured against them. Until this has run once, every estimate the
workflow produces is provisional, and should say so.

## Steps

1. **Gather actuals per layer** for the shipped module — from the PR, from time
   tracking, or by asking the engineers who did it. Per **layer**, not just a
   module total. A module total that happens to match while L4 was 3× under and
   L10 3× over teaches nothing.
2. **Compare** against `05-estimate.json`. Report per-layer variance as a ratio.
3. **Separate estimation error from scope change.** Work added after gate 2 is
   not a rubric failure. Check `06-decisions.md` and the git history.
4. **Propose rubric updates.** Show old → new with the evidence. Never edit
   `fem.config.json` silently — a changed rubric changes every past estimate's
   meaning.
5. **Check the multipliers separately.** Did the ×1.5 breaking-contract case
   actually cost 1.5×? Was the cap right? These are the least-evidenced numbers
   in the whole model.
6. **Check P90 held.** If actuals exceeded P90 more than ~10 % of the time, the
   evidence-state multipliers are too tight.

## What to watch for

- **A layer that is always zero.** L11 reading 0 across five modules means
  either observability genuinely never changes, or nobody is looking. §3 found
  alert rules cover platform health only — so it is probably the latter.
- **L7 as a percentage.** If unit-test effort does not actually track L1–L6
  proportionally, 30 % is the wrong shape, not just the wrong number.
- **L10 where no suite exists.** A module with no e2e specs estimates L10 at
  zero. That is not a saving, it is missing coverage.

## Output

`docs/fe-migration/_rollup/calibration-<module>.md` — per-layer variance, the
proposed rubric diff, and a recommendation on whether to apply it.
