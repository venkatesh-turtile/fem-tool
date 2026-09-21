---
name: fem-report
description: "Assemble the final Migration Impact Report for a module — executive summary, screen map, change catalogue, impact matrix across all twelve layers, estimate, decisions, phased plan, risks, open questions and an evidence appendix — plus the separate decisions sheet for UX. Phase P8 of the Frontend Migration Impact Workflow."
---

# fem-report — P8

## Three documents, three audiences

```
REPORT.md          engineering — everything, with evidence
SUMMARY.md         everyone else — page 1 plain language,     (written at P8)
                   then "Exactly what changes": three tables
                   of API, database and screen changes
06-decisions.md    UX — costs and variants, no internals      (written at P6)
```

Do not merge them. UX reading about composite indexes is how a scope
conversation turns into an architecture argument. A manager reading REPORT.md
is how a clear decision gets lost in forty tables.

## SUMMARY.md — the one-page plain summary

Write it **after** REPORT.md, from REPORT.md and `06-decisions.md` only, so it
cannot say anything the report does not. Use the template in
`.claude/skills/fem-shared/report-template.md`.

The reader is a principal, a product owner or a manager: someone who has not
seen the design, does not know the codebase, and has five minutes.

### The reader may not be an engineer

From 2026-09-21 the person running this workflow is often non-technical. They
drop a design in, run the command, approve two gates, and read `SUMMARY.md`.

So `SUMMARY.md` is **pure text about consequences**, never about implementation:

| Keep out of it | Put it in `REPORT.md` instead |
|---|---|
| endpoint paths (`GET /calendar/entries`) | ✅ |
| table and column names (`academic_calendar_entries.academic_node_id`) | ✅ |
| file paths and schema names (`subjects.schema.ts`, `SubjectTypeSchema`) | ✅ |
| change ids in prose (C-019) — they may appear only in the reference tables at the end | ✅ |

The three buckets `fem-impact` wrote in plain words — **Needs a server change**,
**Not in the CMS today**, **Extra we must handle** — are carried into
`SUMMARY.md` unchanged, near the top, before any cost. A reader must be able to
answer *"does this need backend work?"* from the first half page, without
meeting a single identifier.

Say the quiet thing plainly. "Nothing needs a server change" is the most useful
sentence this workflow produces. So is "this cannot be saved anywhere today".

### SUMMARY.md exists to settle one question

> **Do we build the new design, keep what we have, or take something in
> between?**

Everything on page one serves that decision. If a sentence does not help someone
choose, it belongs in REPORT.md instead. A reader who finishes page one and
still asks "so what are we doing?" means this document failed.

### The house style — set 2026-09-21, from cms/academic-calendar run 3

That summary is the model every later one follows. What makes it work:

- **Plain words, no ids on page one.** "42 of 55 events become unreachable", not
  "C-020 · D1 · year-bound window". Change ids live in the tables at the end.
- **Every claim carries a live count.** Query the database and say *18 of 55
  events use a category outside the design's five*. A number a reader can check
  beats an adjective.
- **Say what changed since the last run.** If a design answered an earlier
  report, open with it — withdrawn findings are as important as new ones.
- **End with three labelled lists**, in an appendix after "Exactly what changes":

  | | |
  |---|---|
  | **Breaks** | what stops working, or blocks release, with counts |
  | **Lost** | capabilities that go away, with how many rows depend on them |
  | **Newly required** | what a school must now do that it never did before |

  Then **No longer a problem** (withdrawn findings) and **Nothing is deleted**
  (what stays in the database, and the build rule that keeps it safe).
- **Each break and loss names its cheapest fix**, in days, so the reader chooses
  rather than discovers.
- **Length is not the enemy; vagueness is.** Detail is welcome when every
  paragraph helps someone decide.

### The rule that decides it

**A screen that needs no backend work is adopted as drawn. No debate, no
trade-off discussion — take the new design.**

Backend work means any of these:

```
new API endpoint            new table or column
field added to an API       index, constraint, or data migration
behaviour change in an API  anything removed that a consumer still uses
```

Test changes alone are **not** backend work. A restyle still costs an e2e spec,
and that never blocks adoption.

So classify every screen into exactly one of three:

| | Meaning | What happens |
|---|---|---|
| **Take it** | no API and no database change | Adopt as drawn. Ship whenever the frontend is ready |
| **Small ask** | only fields added to APIs that already exist — additive, breaks nobody | Usually take it. Name the days so someone can say no |
| **Needs a decision** | a new endpoint, a new table or column, a migration, or something a consumer depends on | This is what the options table below is for |

**Put this classification first, as a table, before anything else**, because for
most modules it settles most of the module:

| Screen | Verdict | Why | Days |
|---|---|---|---|
| `/academic-structure` | ✅ Take it | restyle only | 0 |
| `/academic-structure/[nodeId]` | ⚠️ Small ask | one field added to an existing API | 0.5 |
| `/academic-structure/bulk` | ⛔ Needs a decision | new endpoint + a new column | 6–11 |

Then lead with the count: **"N of M screens can be taken as drawn today."**
That sentence is usually the most useful one in the document.

**Only the "Needs a decision" screens go into the options table below.** Never
put a whole module to a vote when three of its four screens are free.

**Page one is written in this order, and nothing is optional:**

**1 · The screen verdict table** from the rule above, and the sentence
"N of M screens can be taken as drawn today."

**2 · The choice, as a table — for the "Needs a decision" screens only.** Always
three options, even when one is obviously wrong: a reader needs to see what was
weighed. Skip this section entirely when every screen is Take it or Small ask,
and say so in one line instead.

| Option | What users get | Cost | Recommendation |
|---|---|---|---|
| **Keep what we have** | nothing changes — say what stays awkward | none | |
| **Build the design as drawn** | the full intent, in one line | likely X–Y days | |
| **Take the cheaper middle** | what is kept, what is dropped | likely X–Y days | ✅ |

The middle row is the Take-variant scope from `06-decisions.md`. If no variant
was proposed, say so explicitly rather than dropping the row — "no cheaper
version was found" is itself a finding.

**3 · The recommendation, in two or three sentences.** Name the option, say why,
and name the single fact that decided it. Be direct: "Take the middle option"
beats "the middle option may be preferable". If the honest answer is *keep what
we have*, say that.

**4 · What users gain, and what they lose.** Short bullets, in the user's
language. The loses list matters more than the gains list and is the one people
forget to write.

**5 · What makes this expensive.** One to three bullets, the biggest cost
drivers in plain terms — "storing something we have never stored", "another part
of the product uses the same data". This is what a reader argues with, so it has
to be legible.

**6 · How sure we are, and what would change the answer.** One sentence of
confidence, then the open questions as plain questions with an owner each. Say
which answers could move the cost most.

**Before all six of those comes the `API and database changes` block**, directly
under the one-line answer. **Then the footnote**, then `## Exactly what changes`
below it.

**Rules:**
- **Short.** At most about 120 lines of Markdown including blank lines, which
  is roughly one to two printed pages. If it doesn't fit, cut detail, never the
  ranges, the counts or the open decisions.
- **Always include "What changes, in numbers"**, placed directly after the
  recommendation, between steps 3 and 4. (The `API and database changes` block
  is no longer part of it — that lives above the verdict.) Based on the **approved** scope and
  counted from `_variants/recommended` (or `04-impact.json` if no variant was
  taken). The four rows must add up to the total number of changes:
  - **Screen-only changes:** no rubric cost in L1–L9, L11 or L12
  - **Server changes:** any L1–L6 rubric row
  - **Checks and tests only:** L7–L12 cost but no L1–L6
  - **Put off for now:** Defer bucket

  Then say plainly:
  - on the server: new APIs, new stored fields or tables, indexes, fields
    added to existing APIs, anything removed
  - on screens: pages replaced, kept or untouched
  - testing: screen test areas, API tests, integration tests, compatibility
    checks
  - one sentence contrasting with the design exactly as drawn

  Re-count from the files; never copy counts from the report by hand.
- **No technical words.** Say "what users lose", not R1. Say "new information
  we need to store", not column or ladder step 5. Say "other parts of the
  product use this", not consumer or endpoint. No file paths, IDs, layer codes
  or schema names. The only exception is the footnote.
- **Ranges only,** in plain words: "about 15 to 30 working days". Never a
  single number. Say P50/P90 as "likely" and "if things go wrong".
- **Be honest about uncertainty,** in one sentence: how confident we are, and
  why.
- **Every claim on page one must be traceable** to REPORT.md or
  `06-decisions.md`. Page one persuades; it never introduces a new fact.
- **Stamp a footnote** with date, code version (index ref), and "full details:
  REPORT.md". This is the only place a ref appears.

### Part 2 of SUMMARY.md — "Exactly what changes"

The rules above cover the first page, which is for someone with five minutes.
Below it, under a `## Exactly what changes` heading, comes the detail the rest
of the team needs: backend, QA, the other frontend developers, the PM writing
tickets.

**In this part only, the "no technical words" rule is lifted.** Endpoint paths,
table names and screen routes are exactly what a reader needs here. Keep layer
codes (`L4`) and change ids (`C-…-003`) out of the prose — put the id in its own
column so a reader can look it up in REPORT.md.

Three tables, always in this order, always with these columns. Include a table
even when it is empty, with a single row saying "None", so a reader knows it was
checked rather than forgotten.

**1 · API changes**

| Endpoint | Change | Type | Why | Breaks anything? | Ref |
|---|---|---|---|---|---|

- **Endpoint** — method and path, e.g. `POST /academic-nodes/bulk`
- **Change** — one line: what is added, altered or removed
- **Type** — `New` · `Field added` · `Behaviour changed` · `Removed`
- **Why** — the screen or option that needs it, in user terms
- **Breaks anything?** — `Additive — safe`, or name every consumer that must
  change and say whether it needs a coordinated release
- **Ref** — the change id

**2 · Database changes**

| Table | Change | Type | Why | Data migration | Ref |
|---|---|---|---|---|---|

- **Type** — `New table` · `New column` · `Index` · `Constraint` · `Removed`
- **Data migration** — `None`, or what has to happen to existing rows, and
  whether the table is large enough for that to need care
- If a change stores something genuinely new, say so plainly in the Why column:
  it is usually the most expensive kind of change on the sheet

**3 · Screen changes**

| Screen | Change | Type | Backend needed | Ref |
|---|---|---|---|---|

- **Screen** — the route, plus the name a person would use for it
- **Type** — `Restyle only` · `Moved` · `New information shown` ·
  `New filter or search` · `New action` · `Removed` · `New screen`
- **Backend needed** — `None`, or a short phrase naming what from the two tables
  above. This column is the one QA and the PM read most: it tells them which
  screens can ship on their own
- Group `Restyle only` rows together at the bottom, or collapse them into one
  row saying how many there are. They matter for testing, not for planning

**After the tables, two short lists:**

- **Not being done now**, with one line each on why: deferred, rejected, or
  replaced by a cheaper version. A reader should never have to guess whether
  something was missed or decided against.
- **Still unanswered**, as plain questions with an owner role, and what each one
  is blocking.

**Rules for this part:**

- **Every row traces to a change id.** If it has no id it does not belong here.
- **Re-read `04-impact.json` to build these tables.** Do not summarise the
  summary: the whole point is that a reader can trust the detail.
- **Only approved scope.** Take/Take-variant go in the tables; Defer and Reject
  go in "Not being done now".
- **Say when a column is a guess.** If the impact entry was marked `assumed`,
  add "(estimated)" in the Why column rather than stating it as fact.
- **No length limit on this part.** The 120-line rule applies to the first page
  only.

P8 is not done until both REPORT.md and SUMMARY.md exist, and SUMMARY.md has all
three tables. `run-state.ts done` checks for both files.

## REPORT.md sections — §8 P8

1. **Executive summary** — screens, change count, P50/P90, confidence, top five
   cost drivers, and what the variants save
2. **Screen map** — old ↔ new with mapping types
3. **Change catalogue** — every `C-` id with before/after
4. **Impact matrix** — the L1–L12 grid across all changes
5. **Estimate** — per change and per layer, with the order of operations shown
6. **Decisions** — the buckets, and who approved them at gate 2
7. **Plan** — expand / migrate / contract in shippable order
8. **Risks**
9. **Open questions** — anything still unanswered, and what it blocks
10. **Evidence appendix** — every `file:line`, plus the index ref

## Rules

- **Stamp the index ref** — `dev@334475e81`. A number without a ref cannot be
  reproduced, and that is exactly how §3 of the spec came to be 66 % low.
- **Show ranges, never a single number.** P50 alone reads as a commitment.
- **Say when the rubric is uncalibrated.** Until `fem-calibrate` has run against
  a shipped module, the absolute days are defaults.
- **Surface the zeros that are not zeros.** A layer reading 0.0 because no test
  suite exists is a decision to make, not a saving. Put it in Risks.
- **Carry `Assumed` markers through.** They are why P90 is where it is.

## SUMMARY.md — ten sections, fixed order

Every module's summary has the same shape, so a reader finds the same thing in
the same place each time. `validate-outputs.ts` rejects P8 if a section is
missing or out of order.

```
# <Module> — do we take the new design?      title is the question
**<Yes / Yes, with conditions / Not yet>.**  the answer, in API + database terms
0  API and database changes  ABOVE THE FOLD — what is new, and why each line
                             is needed. A module that needs nothing says so
                             in bold. This is what a tech lead scans for.

1  Does this affect colleges?  WHO IT IS FOR, before what it costs
2  The verdict                what it costs, split Take vs Small ask
3  The choice                 keep today · build as drawn · the agreed version
4  Recommendation             which one, and why
5  What changes, in numbers   screen-only · server · tests-only · put off
6  What users gain
7  What users lose
8  What makes it expensive
9  How sure we are
10 Exactly what changes       the per-change table
```

**New endpoints, tables and columns come FIRST, not buried.** The
`API and database changes` block sits **above the verdict**, directly under the
one-line answer — what is new and, for each line, **why it is needed**. A module
that needs nothing says so in bold: that is the answer a tech lead is looking
for, and they should not have to scroll past four sections to find it.
`validate-outputs.ts` rejects P8 if the block appears after `## The verdict`.
Section 10 then repeats it per change, and its API and Database tables must each
carry a **Why** column. `what changed` without `why` is how a reviewer ends up
guessing.

The full template, with what goes in each section, is in
`.claude/skills/fem-shared/report-template.md`.

## Institution shape — required in both documents

Every design so far has been school-shaped. The product is not. So both
documents must answer, in as many words: **does this work for a college?**

- **REPORT.md** — a section headed **`Institution shape`**, next to the change
  catalogue. Name the school-only assumptions, the college-facing things they
  collide with (`public/programmes`, `exam-module/reports/university-excel`,
  `cms/exam/exam-program-completion`, template-driven hierarchies), which
  institutions cannot use the screen, and what they get instead. Cite evidence
  like any other finding.
- **SUMMARY.md** — a short section headed exactly
  **`## Does this affect colleges?`**, placed **above the verdict**, directly
  under the API and database block: who can use the new screen, who cannot, and
  what happens to them. It sits that high because a reader deciding on behalf of
  a college should not have to read four sections of day counts to discover the
  design does not serve them.

If the design genuinely carries no institution-shape assumption, say so and
why. Silence is not an answer — `validate-outputs.ts` rejects P8 when either
heading is missing.

## Output

```
docs/fe-migration/<app>/<module>/
  REPORT.md     ten sections, evidence appendix
  SUMMARY.md    one plain page, then the API / database / screen tables
```
