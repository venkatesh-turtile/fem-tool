# Never ask. Report.

Spec §8 P2 and §9.3. Every phase that finds something it cannot settle reads
**this file**.

## The rule

**Do not ask the person running the workflow anything.** Not at P2, not at P3,
not at P4, not at P6, not at a gate. There is no question this workflow is
entitled to interrupt somebody with.

They gave you a design and a codebase. Read both. Say what is different and
what it costs.

## Why

Twelve questions were asked across one day's runs on three modules. Four were
answered *"take the design as drawn and put it in the summary"*. Three had
their answers sitting in a comment above the rule that raised them, or in the
index the workflow had just built. The rest were engineering choices the
workflow was better placed to make than the person being asked.

Meanwhile every correction that mattered — a column hidden behind a CSS rule, a
college variant that was out of scope, a count mistaken for a maximum, an
endpoint priced as new when it already existed — came from somebody **reading
the finished documents**. Not one came from being interrupted.

So the interruptions stop. The documents stay.

## What to do with the thing you cannot settle

Take the design as drawn, and write the uncertainty down where the person will
meet it anyway:

| It looks like | Do |
|---|---|
| A new column, flag or field | Record it as drawn. A column is a column. If the design's sample data says `Maternity Leave → Female`, that is what it holds. |
| Two possible shapes | Recommend one, price both, put the delta in `06-decisions.md`. |
| A rule the design implies but does not draw | Price what is drawn. Name the stricter reading in the appendix with its extra cost. |
| A policy call — who may apply, what gets re-labelled | Price what is drawn, and put it in the appendix under **Newly required** as a decision, with both prices and what each one commits to. |
| Two things that contradict each other | Say so, in the report, with both sources cited. Do not pick silently. |

Where each of those lands:

- **`SUMMARY.md`** — the new thing in plain words, in the API-and-database
  table: what it is, where it is kept, an example from the design's own data,
  and whether anything new has to be stored.
- **`REPORT.md`** — for every new key: which API routes carry it, which schema
  objects gain it, which handlers must select it, which Zod validation changes,
  and which screens need an input. `column-ripple.ts` produces that.
- **The appendix** — every decision still open, named, with what it costs each
  way.

A decision in the report reaches the same person, at the moment they are
deciding, with the evidence beside it. A decision extracted mid-run interrupts
the analysis for an answer that is usually "as drawn".

## `questions.md`

Still written. Still numbered. Still plain words. It is now a **record of what
was noticed**, and nothing in it blocks anything:

```markdown
### Q2 · The gender category could restrict who may apply — **Decision**

As drawn it is a column: All, Female or Male, shown beside the leave type.
Nothing refuses anyone.

As a rule it would refuse applicants, which means a check when a request is
made and a protected characteristic in a refusal path. That is a policy
question before it is an engineering one. **+2 days.**

*Priced as a column, because that is what the design draws.*
```

No **Mandatory** / **Optional** marking — nothing is mandatory when nothing is
asked. No "Leave it open". No gate waits on any of it.

## When somebody answers anyway

They will, after reading the report. `record-answer.ts` still exists for
exactly that:

```bash
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q1 b "<who>"
```

It files the answer under its question and into `state.json`, and prints the
items that were priced the other way. **Re-check it** —
`.claude/skills/fem-shared/answer-consequences.md`. An answer can kill a cheaper
option or contradict an earlier one, and that re-check is where the two
genuinely valuable answers of that first day came from. Then re-trace and
re-price whatever moved.

## The rules that survive

1. **No identifiers** in anything a non-engineer reads. The developer's version
   is `REPORT.md`.
2. **Never guess silently.** Taking a design as drawn is not a guess — it is
   reading. Inventing a field the design does not show is.
3. **Look before you write it down.** The design's own comments, the schema and
   the index answer most of it.
4. **Re-check an answer** if one arrives.
