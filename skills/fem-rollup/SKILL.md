---
name: fem-rollup
description: "Aggregate completed module estimates into a programme-level total for the frontend migration — deduplicating cross-cutting X-NN items and shared endpoints so nothing is counted twice — and produce sequencing and a risk register. Use after several modules have been through fem-run, or when the user asks for the programme total, the whole-migration estimate, or what the redesign costs overall."
---

# fem-rollup

## Steps

1. **Collect** every `05-estimate.json` and `06-decisions.md` under
   `docs/fe-migration/<app>/<module>/`.
2. **Deduplicate `X-NN`.** A cross-cutting item is counted **once** at programme
   level, plus its per-module adoption cost. Never sum the platform cost across
   modules.
3. **Deduplicate shared endpoints.** Two modules calling the same endpoint that
   both need the same new param is one piece of work. Compare **full server
   module paths** — same-named modules in different trees are different code.
4. **Total** accepted scope only — Take and Take-variant. Report Defer and
   Reject separately so the conversation about them stays open.
5. **Sequence.** Modules that share an endpoint or an `X-NN` item should land
   near each other. Modules with a consumer in another app need release
   coordination.
6. **Risk register.** Roll up every module's risks; flag anything appearing in
   three or more modules as programme-level.

## Report honestly

- **State how many modules are in, and how many exist.** A total over 6 of 65
  modules is not a programme estimate.
- **State whether the rubric has been calibrated.** Before `fem-calibrate` has
  run against a shipped module, every number is a default.
- **Quote the index ref**, and say if modules were analysed at different refs —
  that is a real source of drift.

## Output

`docs/fe-migration/_rollup/ROLLUP.md`
