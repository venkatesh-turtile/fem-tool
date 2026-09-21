---
name: fem-system-diff
description: "Find design-system patterns across all the new HTML designs at once — a shared table with sort, filter and export, a global search, a notification centre, a common layout — that imply platform-wide backend capabilities rather than per-module work. Emits X-NN cross-cutting items estimated once at programme level so modules reference them instead of each paying for the same capability. Phase P0-prime, run once per programme."
---

# fem-system-diff — P0′

## The problem it solves

If the new design system gives every list a sortable, filterable, exportable
table, that is **one platform capability, not 39 module changes**. Estimated
per-module it is counted 39 times and the programme total is nonsense.

## Steps

1. **Read every design** under `docs/fe-migration/designs/`, across all apps.
   Skip and report any file marked unparseable.
2. **Look for repetition.** A pattern appearing in three or more modules is a
   candidate: shared table capabilities, a filter bar, global search, export,
   notifications, a common empty state, pagination style.
3. **Emit `X-NN` items** with impact, an estimate, and **the list of modules
   that use each one**.
4. **Estimate once.** A cross-cutting item gets one P50/P90 at programme level.
5. **Modules reference, never re-estimate.** `fem-screen-map` tags the change
   `X` and points at the id; `fem-rollup` counts it once.

## Acceptance — §8 P0′

Module runs reference `X-NN` items instead of re-estimating them. If two module
reports both contain a full estimate for "table sort", this phase failed.

## Output

`docs/fe-migration/_shared/cross-cutting.md`

```
X-01  Sortable / filterable table with CSV export
      L1 query params on every list endpoint
      L4 indexes per sorted column — named per module
      P50 4.0d platform + 0.25d per module adopting
      used by: library, timetable, fee-management, admissions, … (23)
```

## Caveat

§14 Q2 is open: will UX supply a design-system component list? If they do, this
phase reads it instead of inferring — faster and more reliable. Ask before
inferring a capability the design team could simply tell you.
