---
name: fem-baseline
description: "Describe a CMS / student-cms / admin module exactly as it exists today, in the normalised fem screen spec — screens, columns, filters, actions, tabs, dialogs and states, each data element tied to an endpoint binding or marked static. Reads only the fem index, never application source. Phase P1 of the Frontend Migration Impact Workflow. Use when the user asks what a module does today, wants a baseline before a redesign, asks 'which endpoints does this screen call', or runs fem-run."
---

# fem-baseline — P1

The *old* half of the comparison. Emits the same screen spec `fem-design-intake`
emits for the new designs, so P3 can diff them directly.

## Parameters

| | Required | Notes |
|---|---|---|
| `app` | yes | `cms`, `student-cms`, `admin` |
| `module` | yes | Route-segment name, e.g. `timetable` |

## Steps

1. **Run the script.** It reads `_index/` only — never application source.

   ```bash
   bun .claude/skills/fem-baseline/scripts/build-baseline.ts cms timetable
   ```

2. **Check the screen list against the module owner's expectation.** This is the
   §8 P1 acceptance criterion. Screens are matched on the **first non-dynamic
   route segment**, so `/[institutionId]/timetable` belongs to `timetable` and
   `/[institutionId]/hrms/admin/timetable` stays with `hrms`. If the count looks
   wrong, that is a real finding — say so rather than adjusting the filter.

3. **Fill in `elements` for each screen.** The script establishes the frame and
   the bindings; you populate columns, fields, filters, actions, tabs, dialogs
   and empty/error states from the module's components. **Every element must
   carry a binding or be marked `static: true`.** An unmarked element fails
   acceptance.

4. **Resolve each binding** through `_index/endpoints.json` to a server path,
   method and table. Cite the endpoint id.

5. **Report L12 honestly, from `table-readers.json`.** `none` in
   `consumers.json` means *no web consumer* — it sees cross-app use only where an
   app imports a server Zod schema. The list that matters is
   `_index/table-readers.json`: for each table this module touches, which server
   modules read it. Name them in the baseline. Never write "no consumers"
   unqualified.

## The trap worth knowing

Two modules can share a word and share no code. `timetable` in CMS uses
`@server/modules/**cms**/…/sections/timetable`; student-cms uses
`@server/modules/**student**/…/timetable`. Different modules entirely. A human
scanning for "who else uses timetable" would likely call it shared and apply the
×1.5 breaking-contract multiplier to the whole module. Compare **full module
paths**, never names.

## Output

```
docs/fe-migration/<app>/<module>/
  01-baseline.json   spec + facts
  01-baseline.md     for the module owner to review
```

## Acceptance — §8 P1

- Screen list matches the module's `page.tsx` routes
- Every data element has a binding or is marked static
- Binding resolution ≥ 95 %

**M1 exit also requires the module owner to review `01-baseline.md`.** The
numbers passing is half of it; a person who knows the module confirming they
are right is the other half.
