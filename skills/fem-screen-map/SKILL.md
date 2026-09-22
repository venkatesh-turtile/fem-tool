---
name: fem-screen-map
description: "Align a module's old screens with its new designs and emit the change catalogue — every difference that is not pure restyling becomes a change item with a stable ID and a taxonomy code. Handles 1:1, 1:N split, N:1 merge, new and removed mappings. Stops at gate 1 for the developer to confirm. Phase P3 of the Frontend Migration Impact Workflow."
---

# fem-screen-map — P3 · GATE 1

Where the two screen specs meet.

## Steps

1. **Read** `01-baseline.json` and `02-new-design.json`. Refuse to run if any
   design file is marked `parseable: false` — a missing screen is not an empty
   screen.
2. **Map screens.** Five relations: `1:1`, `1:N` split, `N:1` merge, `new`,
   `removed`. Every old and every new screen must appear exactly once. §4 G1
   wants ≥95 % classified.
3. **Diff elements** within each mapping. Each difference becomes a change item:

   ```
   C-<module>-NNN   stable, survives re-runs (NFR-3)
   type             V0 V1 D1 D2 A1 A2 R1 X   — .claude/skills/fem-shared/taxonomy.md
   screen           { old, new }
   summary          one sentence
   before / after   the actual text or label
   ```

4. **Tag `V0` and `V1` accurately.** This is the single biggest accuracy lever
   (§3.2): most redesign changes are visual-only, and mis-tagging one as `D2`
   sends a subagent tracing an endpoint for a button that changed colour.
   Mis-tagging the reverse hides real cost. **`V0` still costs L10** — e2e
   selectors change even when nothing server-side does.
5. **Decide the institution shape the design assumes** — within the kinds
   `fem.config.json` lists under `institutionScope.inScope`. A variant drawn for
   a kind that is not listed is out of scope and is not catalogued at all; say
   so once and move on.
    Every design so far has
   been school-shaped — Level/Grade/Section, "Class 1", Day care … Senior
   secondary. The product is not: the hierarchy is template-driven, and
   `public/programmes`, `exam-module/reports/university-excel` and
   `cms/exam/exam-program-completion` are college-facing. State plainly in
   `03-screen-map.md` whether the design **fits a college**, and if it does
   not, raise it as a question and carry it to gate 1. A fixed school
   hierarchy is a scope decision, not a detail.
6. **Reference, never re-estimate, cross-cutting items.** If the change is a
   design-system capability, point at its `X-NN` id from `_shared/`.
6. **Stop at gate 1.**

## Plain change list — required at the top of `03-screen-map.md`

Gate 1 may be answered by someone non-technical. Before the catalogue, write
**"What changed, in plain words"**: three short lists, no taxonomy codes, no ids.

```markdown
**New on the screen:** a Days column · an academic year with start and end dates ·
upload from Excel · a chart of how the year is spent

**Gone from the screen:** the school's own event categories, and the screen that
creates them

**Same thing, drawn differently:** the month view becomes a panel you open ·
events are edited in the table instead of a pop-up
```

They are confirming the design was read correctly — that nothing is missing and
nothing was invented. The taxonomy tags below the list are for the phases that
follow, and a developer should check those; the plain list is what makes the
gate answerable by anyone.

## Record what the comparison raised — before gate 1

P3 is the first phase that can see old and new together, so it is the first
that can notice the things worth noticing: whether the design still fits a
college, whether a capability is actually removed or only moved, whether a
screen is a replacement or a split.

**Write them down here, not at P4, and do not ask about any of them.** A
difference the comparison raises is a line in the change catalogue. A choice it
raises is a numbered entry in `questions.md` and a named decision in the
appendix, priced both ways. See
`.claude/skills/fem-shared/asking-questions.md`.

The college question in particular goes in the catalogue **and** the summary,
because it decides which customers can use the screen — the config says which
kind is in scope, and the design's own variant markers say which parts belong
to which kind. Both are readable. Neither needs a person.

screens   N mapped 1:1 · N split · N merged · N new · N removed
changes   N total — V0 n · V1 n · D1 n · D2 n · A1 n · A2 n · R1 n
```

Ask them to confirm the mapping and the taxonomy. **Write corrections back into
`03-screen-map.md`** — they are evidence, and they feed `fem-calibrate` later.

Record approval:

```bash
bun .claude/skills/fem-run/scripts/run-state.ts approve cms timetable gate1 <who>
```

§7.1.4: the workflow stops here until explicitly approved. Not a pause — a gate.

## Output

`03-screen-map.md` — mapping table, change catalogue, taxonomy counts, and any
corrections the developer made.
