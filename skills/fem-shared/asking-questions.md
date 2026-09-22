# Asking — almost never. Reporting — always.

Spec §8 P2 and §9.3. Every phase that finds something it cannot settle reads
**this file**.

## The default is: do not ask

The workflow's job is to compare what a screen does today with what a design
asks for, and to say what that costs. **Not to interview the person running
it.** They gave you a design; read it.

When a design shows something new, take it **as drawn** and write it down. A
column is a column. A flag is a flag. If the design's sample data says
`Maternity Leave → Female`, that is what the field holds.

This was learned the hard way. Twelve questions were asked across one day's
runs; four were answered *"take the design as drawn and put it in the
summary"*, and several more could have been answered by reading the code — the
answer was in the design's own comments, or in the index. Meanwhile the
corrections that actually mattered came from a person **reading the finished
documents**, not from being interrupted.

## Ask only for a decision that is not about the design

A question is warranted when answering it is a **business or policy choice**
that the design cannot contain and the code cannot reveal:

| Ask | Do not ask |
|---|---|
| "This would refuse applicants by a protected characteristic — is that the intent?" | "What does this column hold?" — the design says |
| "Existing rows would have to be re-labelled. Is that acceptable?" | "Should this be stored?" — if the design shows it, yes |
| "Two answers already given contradict each other." | "Is this field new?" — the schema says |
| "This cannot be built without knowing X, and X is nowhere." | "Which of these two shapes should we use?" — recommend one and price it |

Everything else is a **line in the report**, not a stop.

## What to do instead of asking

Write it into the documents the reader already opens:

- **`SUMMARY.md`** — the new thing, in plain words, in the API-and-database
  table: what it is, where it is kept, an example from the design's own data,
  and whether anything new has to be stored.
- **`REPORT.md`** — for every new key: which API routes carry it, which schema
  objects gain it, which handlers must select it, which Zod validation changes,
  and which screens need an input. `column-ripple.ts` produces that.
- **The appendix** — anything a person still has to decide, as a named item
  under *Newly required*, with what it would cost if decided either way.

A decision recorded in the report reaches the same person, at the moment they
are deciding, with the evidence beside it. A decision extracted mid-run
interrupts the analysis to get an answer that is usually "as drawn".

## When you do ask

One `AskUserQuestion` call, one question, lettered options from the report,
their own answer welcome. Then record it:

```bash
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q1 b "<who>"
```

The answer goes into `questions.md` and `state.json`, so a resumed run does not
ask again — and then re-check it, per
`.claude/skills/fem-shared/answer-consequences.md`. An answer can kill a cheaper
option or contradict an earlier one, and that re-check is where the two
genuinely valuable answers of that first day came from.

**No question blocks a gate.** An open point is reported, priced with its
uncertainty, and the run continues.

## `questions.md`

Still written, still numbered, still in plain words — but it is now a record of
what was noticed rather than a form to fill in:

```markdown
### Q2 · The gender category could restrict who may apply — **Decision**

As drawn it is a column: All, Female or Male, shown beside the leave type.
Nothing refuses anyone.

As a rule it would refuse applicants, which means a check when a request is
made and a protected characteristic in a refusal path. That is a policy
question before it is an engineering one. **+2 days.**

*Reported, not blocking. Priced as a column, because that is what the design
draws.*
```

## The rules that survive

1. **No identifiers** in anything a non-engineer reads. The developer's version
   is `REPORT.md`.
2. **Never guess silently.** Taking a design as drawn is not a guess — it is
   reading. Inventing a field the design does not show is.
3. **Never ask what the design, the schema or the index already answers.** Look
   first. Three of one day's questions had their answers sitting in a comment
   above the rule that raised them.
4. **Re-check an answer** when you do get one.
