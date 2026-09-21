---
name: fem-tradeoff
description: "Recommend scope for a redesigned module by weighing user value against backend cost and risk — proposing cheaper variants and bucketing every change Take, Take-variant, Defer or Reject with a cost delta. Produces the decisions sheet that goes to UX. Stops at gate 2 for the tech lead. Phase P6 of the Frontend Migration Impact Workflow."
---

# fem-tradeoff — P6 · GATE 2

**This is the output the whole workflow exists to produce.** Everything before
it is machinery to make this sheet defensible.

## Steps

1. **Read** `05-estimate.json` and `04-impact.json`.
2. **Propose a cheaper variant wherever one exists.** Standard moves:

   | Expensive | Variant |
   |---|---|
   | Server-side filter on a bounded list | Filter client-side — a week of timetable is a few hundred rows |
   | New aggregate endpoint | Compose two existing endpoints |
   | New stored field | Derive it in the front end from fields already returned |
   | Synchronous export | Async job + download link |
   | Rename a field | Add the new one alongside; remove in the contract phase |
   | Bulk action | Single action first, bulk later if it is actually used |

3. **Bucket every change** with a cost delta:

   ```
   Take           worth the cost as designed
   Take-variant   worth it in the cheaper form — state the delta
   Defer          depends on work not yet done
   Reject         cost is out of proportion — always offer an alternative
   ```

4. **Never Reject without an alternative.** *"4.0 days of lifecycle rewrite for a
   status label — here is a display-only version for 0.5"* is a negotiation.
   *"Rejected"* is a wall.
5. **Block items with unanswered questions.** §9.3 puts them at ×2.0. They
   cannot be bucketed honestly — say so rather than guessing.
6. **Say who the design is for.** If it assumes a school shape, the decisions
   sheet states which institutions **cannot** use the screen and what they get
   instead — today's page, a second design, or nothing. UX is choosing the
   customer set, whether or not anyone says so out loud.
7. **Write for UX, not for engineering.** `06-decisions.md` names screens and
   options, not handlers and indexes. The reason for a cost can be one clause
   — *"needs an index on a hot table"* — not a paragraph.

## Gate 2

The tech lead approves the buckets:

```bash
bun .claude/skills/fem-run/scripts/run-state.ts approve cms timetable gate2 <who>
```

§7.1.4: a real gate. And §14 Q3 is still open — module owner or central
architect? Agree it before the first run.

## Output

`06-decisions.md` — formatted to share with UX as-is.
