# How the workflow checks its own work

A plain-language guide to `validate-outputs.ts` — what it checks at each phase,
what it refuses to let through, and, just as importantly, **what it cannot
catch**.

---

## 1 · Why it exists

Three times, a real piece of work silently disappeared from a finished report.

The pattern was always the same. Gate 2 approved a cheaper version of a change,
so that change stopped paying for something — say, a compatibility check. But a
*different* change had said "my cost is covered by that one". The owner now paid
nothing. The follower still pointed at it. **Nobody paid, and the report added
up perfectly.**

Two of those reached a signed-off report. The third was found the day this
checker was written. So the rule is now automatic instead of remembered.

---

## 2 · Where it runs

It is not an optional step you can forget. It is wired into the phase recorder:

```
bun run-state.ts done cms academic-structure P4
        │
        ├─ Is the output file even there?           no → stop
        ├─ Run validate-outputs.ts on that phase
        │
        ├─ clean  → "P4 recorded"           you may move on
        └─ broken → "P4 NOT recorded — fix the output above, then re-run done"
```

**You cannot advance the pipeline past a broken output.** Before this existed, a
phase was recorded because the model said it was done.

You can also run it by hand at any time:

```bash
# one phase
bun .claude/skills/fem-run/scripts/validate-outputs.ts cms academic-structure P4

# everything
bun .claude/skills/fem-run/scripts/validate-outputs.ts cms academic-structure

# a variant folder — this is where the cheaper-version swap happens
bun .claude/skills/fem-run/scripts/validate-outputs.ts cms academic-structure/_variants/recommended
```

---

## 3 · The two kinds of checking

**Shape.** Is this file built correctly? Right fields, right types, ids that look
like ids, nothing misspelled. A typo'd key is an error, not something quietly
ignored.

**Rules.** Does this file contradict itself? A change that vanished, a cost with
no owner, a price that doesn't exist in the rate card, a guess with no record of
what was looked for.

Neither of them asks *"is this true?"* — see §7, which is the part worth reading
twice.

---

## 4 · Phase by phase

| Phase | Output | What gets checked |
|---|---|---|
| **P1** baseline | `01-baseline.json` | shape only — the screen list is built correctly |
| **P2** design intake | `02-new-design.json` | shape, **plus: refuses any screen marked unreadable** |
| **P3** screen map | `03-screen-map.md` | file exists. No automatic checks — it is prose, and a human approves it at gate 1 |
| **P4** impact | `04-impact.json` | shape, **plus all six rules below** — this is where the real work happens |
| **P5** estimate | `05-estimate.json` | shape. The arithmetic itself is a script, so it cannot be wrong, only mis-fed |
| **P6** decisions | `06-decisions.md` | file exists. A human approves it at gate 2 |
| **P7** plan | `07-plan.md` | file exists |
| **P8** report | `REPORT.md` + `SUMMARY.md` | **both files must exist**, and the summary must be in the standard shape (§6) |

### P2 · the one that stops everything

If the design file could not be read properly, P2 marks the screen unreadable
and the checker **refuses to let P3 run on it**.

This matters because an empty screen list does not look like an error further
down. It looks like a design with no columns — and every later phase is
confidently wrong about it.

### P4 · where almost everything is caught

This is the file that says what each change touches across the twelve layers. It
gets the full treatment: shape, then the six rules.

---

## 5 · The twelve rules, in plain words

| | In one line | What it stops |
|---|---|---|
| **A** | The catalogue said 23 changes; only 22 were traced | A change quietly falling off the list |
| **B** | A screen-only change with no screen test priced | "It's just a restyle" — it still costs a test |
| **C** | A price tag that isn't on the rate card | Invented costs. Every number must come from `fem.config.json` |
| **D** | "We assumed this" with no note of what was searched | A guess dressed as a finding |
| **E** | A layer is blocked on a question, but the change says it isn't | Blocked work being quietly counted as settled |
| **F** | **"My cost is covered by C-019" — but C-019 pays nothing** | **Work with no owner. This is the one that failed three times** |
| **G** | A mandatory question reached gate 2 with nobody having answered it | A decision sheet built on a shrug. Every blocked item is priced at double, and doubled numbers read like estimates |
| **H** | An item still says it is waiting on a question that has been answered | The answer never reached the trace, so the price still reflects the old uncertainty |
| **I** | The trace is older than the answers it is supposed to reflect | Answering and then not re-tracing. The number cannot have accounted for something given after it was written |
| **J** | Answers were recorded, but nothing says what they changed | A number that silently improves is indistinguishable from one that is wrong |
| **K** | The three plain sentences differ between the three files | A summary promising a free option the impact document already ruled out |
| **M** | A change filed against a screen that does not exist | Screen ids are content hashes, so one typed from memory looks exactly like one that was read. A whole trace was once filed against an invented id and every other check passed |
| **L** | "No one else is affected", with nothing cited | The cheapest sentence in the document to write, and the most expensive to be wrong about. The index now answers it mechanically |

### Rule L — who else reads this

`consumers.json` answers "which app imports this module's types?". A second
server module can read the same table and import nothing, so that question has
a blind spot: in the calendar run, the parent app and a dashboard both read the
events table and neither appeared. Both were found by hand.

`table-readers.json` now answers the other question — table → the server modules
that read it — and rule L refuses an unevidenced "none" on any change that
touches the contract, the handler or the schema. Say who you checked, or say
what you searched.

### Rules G to J — the answer loop

These four came out of one run, in one afternoon, in this order: a gate was
presented while four questions were unanswered; an answer was given and the item
stayed marked blocked; the estimate was re-run against a trace that predated the
answer; and the number improved by four days with nothing in the document saying
why.

Each was caught by hand, and each is now caught by the validator. Together they
enforce the loop in `fem-shared/answer-consequences.md`: ask, record, re-check,
ask again if the check found something, re-trace, re-price, and say what moved.

### Rule F, with the real example

In this module, C-024 (syllabus) said its rule was *"priced in C-021"*. Then gate
2 approved a cheaper C-021, which no longer priced that rule.

```
C-024  L3:  "the rule belongs to C-021"   →   C-021  L3:  none
                                                      ▲
                                          nobody is doing this work
```

The checker caught it, and three more like it, worth **2.1 days** — including the
rule that stops the first save from wiping every syllabus in the school. Without
the check, that work would simply not have existed.

**Run it against the `_variants/` folders too.** That is where the cheaper-version
swap happens, so that is where costs go missing.

---

## 6 · P8 · the report and the summary

Every module's summary has the same shape, so a reader finds the same thing in
the same place every time. The checker enforces:

- **The API and database block comes first**, above everything else — what is
  new on the server, and why. It is the first thing a tech lead looks for.
- **Then ten sections, in a fixed order**, starting with *Does this affect
  colleges?* — who the design is for, before what it costs.
- **The API and Database tables must have a "Why" column.** What changed without
  why is how a reviewer ends up guessing.
- **REPORT.md must have an "Institution shape" section** — does this work for a
  college? Even "no assumption made" must be said out loud. Silence is not an
  answer.

Move a section, and the checker says so:

```
FAIL  SUMMARY.md: "## The verdict" is out of order — the ten sections are fixed
```

---

## 7 · What it CANNOT catch — read this part

> The checker asks **"is this document well-built and consistent with itself?"**
> It never asks **"is this true?"**

A real example from this module. The report said the Subjects screen needed a new
database column for a subject's Type. It passed every check cleanly:

- valid change id, all twelve layers filled in ✅
- a real price from the rate card ✅
- marked `assumed`, with a written note of everything that was searched ✅

And it was **wrong**. The column already existed — `subjects.subject_type` — and
had for a long time. A person found it by opening the file. The checker never
could have, because the index the workflow reads lists tables but **not their
columns**.

| Catches | Does not catch |
|---|---|
| a change silently dropped | a change confidently mis-priced |
| a cost that nobody pays | a fact inferred from a name instead of checked |
| a missing or reordered section | a wrong claim in a correctly-shaped table |
| a made-up price | a real price applied to the wrong thing |

So: **the machinery guards the bookkeeping. It does not guard the claims about
your codebase.** Those are still the model's, and they are where the one real
error in this run came from.

**What would close the gap:** teach the indexer to read database tables and API
schemas — the actual columns and fields, not just the file names. Then "nothing
stores a subject type" becomes something the workflow can check instead of guess.

---

## 8 · Errors and warnings

**FAIL** stops the phase being recorded. **warn** is printed and allowed through
— it flags a pattern that is usually wrong but is sometimes fine.

The usual warning:

```
warn  C-…-015 L10: folds into C-…-016 L10, which prices nothing
      (fine for a deletion, wrong otherwise)
```

Deleting a test costs nothing, so a fold into a zero is correct here. The
checker cannot tell the difference, so it tells you and lets you decide. **Read
every warning once. Do not train yourself to scroll past them** — that habit is
what rule F exists to undo.

---

## 9 · Quick reference

```bash
R=.claude/skills/fem-run/scripts
V=$R/validate-outputs.ts

bun $V cms <module>             # every phase
bun $V cms <module> P4          # just the impact file
bun $V cms <module>/_variants/recommended
bun $R/run-state.ts done cms <module> P4    # validates, then records
```

Exit codes: `0` clean (warnings allowed) · `1` something failed · `2` wrong usage.

**Related:** `STEP-BY-STEP.md` — how to run the whole workflow on a new module.
