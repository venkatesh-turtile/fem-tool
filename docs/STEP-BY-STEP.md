# fem — step by step

fem compares a module as it is today with its new design, and tells you how much
backend work the change needs. This page covers every step: what it does, what
it produces, and what comes next.

---

## The whole flow

```
Step 0   Build the index              (once)
Step 1   Put the design files in      (you)
Step 2   Start the run                /fem-run cms <module>
           P1  Baseline               today's module
           P2  Design intake          the new design
           P3  Screen map             list of changes
           ── GATE 1: you approve ──
           P4  Impact                 backend work per change
           P5  Estimate               days
           P6  Decisions              cheaper options, for UX
           ── GATE 2: tech lead approves ──
           P7  Plan                   build order
           P8  Report                 final REPORT.md + one-page SUMMARY.md
```

**You type only two things:** the index command, once, and `/fem-run`. Claude
runs everything else and stops at the two gates for you.

## The 8 phases

**P stands for "Phase".** Each phase is one skill. It reads the previous
phase's output and writes its own file. The number at the start of each file
name is the phase that made it.

| Phase | Skill | In one line | Done by | Output file |
|---|---|---|---|---|
| **P1** | fem-baseline | **What the module is today:** pages, APIs, tables, tests | Script (from the index) | `01-baseline.md` |
| **P2** | fem-design-intake | **What the new design shows:** columns, buttons, inputs | Script (from design HTML) + Claude reading | `02-new-design.json`, `questions.md` |
| **P3** | fem-screen-map | **List of changes:** old vs new, each change numbered and typed | Claude | `03-screen-map.md` |
| ⛔ | **Gate 1** | **You approve** the change list | You | — |
| **P4** | fem-impact | **Backend work per change,** across 12 areas (API, database, tests…) | Claude (one helper per change) | `04-impact.md` |
| **P5** | fem-estimate | **Days of effort** (P50 likely, P90 if things go wrong) | Script (fixed maths) | `05-estimate.md` |
| **P6** | fem-tradeoff | **Cheaper options + decisions** (Take / Take-variant / Defer / Reject) | Claude | `06-decisions.md` |
| ⛔ | **Gate 2** | **Tech lead approves** the decisions | Tech lead | — |
| **P7** | fem-plan | **Build order:** add safely → switch screens → remove old | Claude | `07-plan.md` |
| **P8** | fem-report | **Final documents** | Claude | `REPORT.md`, `SUMMARY.md` |

**How they connect:**

```
P1 today ─┐
          ├─► P3 changes ─► GATE 1 ─► P4 backend work ─► P5 days ─► P6 decisions ─► GATE 2 ─► P7 plan ─► P8 report
P2 design ┘
```

**Every phase is validated before it is recorded.** `done` runs
`validate-outputs.ts`, which checks the file against the schemas and against
the fem rules — including the one that catches a cost that says it is "covered
by" another change which no longer prices it. If it fails, the phase is not
recorded.

**What run messages mean:**
- **"P1 recorded"**: that phase finished and was saved in `state.json`.
- **"BLOCKED gate1"**: the run is waiting for approval.
- **`--from P4`**: resume starting at phase 4.
- **`--only P5`**: re-run just phase 5.

### Which phase creates which file

Times are from the real academic-structure run, so you can see the order.

```
PHASE                    FILE                     academic-structure
─────────────────────────────────────────────────────────────────────
P1  fem-baseline         01-baseline.json/md      15:53
P2  fem-design-intake    02-new-design.json       15:56
                         questions.md ◄── born here
P3  fem-screen-map       03-screen-map.md         16:19
    ══ GATE 1 ══
P4  fem-impact           04-impact.json/md        16:24 · 16:25
P5  fem-estimate         05-estimate.json/md/csv  16:24
P6  fem-tradeoff         06-decisions.md          16:27
    ══ GATE 2 ══
P7  fem-plan             07-plan.md               16:28
P8  fem-report           REPORT.md                16:32
                         SUMMARY.md               16:39
─────────────────────────────────────────────────────────────────────
     fem-run             state.json               updated after each phase
```

**`questions.md` is not one phase's file.** P2 creates it when the design
leaves something unclear. Later phases add to it whenever they hit something
they cannot answer. That is why its time in this run is 16:26, after P5, and
not 15:56 when P2 ran.

**Each file feeds the next phase:**

```
04-impact.json   →  P5 reads it to work out days
05-estimate      →  P6 reads it to decide what is worth doing
06-decisions     →  P7 plans only the changes that were accepted
all of them      →  P8 puts the report together
```

If the design file changes, the run clears everything from P2 onward and makes
it again in this same order.

---

## Step 0 · Build the index

**Run in:** terminal, from the repo root

```bash
bun .claude/skills/fem-index/scripts/build-index.ts
```

**What it does:** scans the whole codebase and writes down how everything is
connected:

```
page  →  frontend file  →  server endpoint  →  database table  →  tests
```

**How:** a plain script. No AI is involved. It searches the code for imports
like `@server/modules/...` and route definitions like `createRoute(...)`.

**Output:** 7 JSON files in `docs/fe-migration/_index/`

| File | What's in it |
|---|---|
| `pages.json` | Every page and which module it belongs to |
| `frontend-bindings.json` | Which frontend file uses which server schema |
| `endpoints.json` | Each server endpoint: methods, handlers, tables |
| `consumers.json` | Which apps use each server module |
| `tests.json` | All test files |
| `observability.json` | Monitoring files |
| `summary.json` | Totals and a pass/fail check |

**Run it again when:** the code has changed since the last build.

**Next:** Step 1.

---

## Step 1 · Put the design files in

**You do:** save the new design HTML from UX here:

```
docs/fe-migration/designs/cms/<module>/<screen>--<state>.html
```

Examples:

```
list--default.html
list--empty.html
detail--default.html
```

**Tips:**
- **One file per screen state:** default, empty, error.
- **Ask UX for plain HTML,** not compiled React. Compiled React can't be read.

**Next:** Step 2.

---

## Step 2 · Start the run

**Run in:** Claude Code, opened at the repo root

```
/fem-run cms <module>
```

`<module>` is the first folder after `[institutionId]` in the page path. For
example, `/[institutionId]/academic-calendar` → `academic-calendar`.

Claude now works through the phases below in order.

---

### P1 · Baseline: what the module is today

**Claude runs:**
```bash
bun .claude/skills/fem-baseline/scripts/build-baseline.ts cms <module>
```

**What it does:** takes the index from Step 0 and keeps only this module: its
pages, the endpoints they call, the tables and the tests.

**It does not read the code.** It only reads the Step 0 files.

**Output:**
- `01-baseline.json`
- `01-baseline.md`: ask the module owner to check it's correct

**Next:** P2.

---

### P2 · Design intake: what the new design shows

**Claude runs:**
```bash
bun .claude/skills/fem-design-intake/scripts/parse-html.ts cms <module>
```

**What it does:** reads your design HTML and lists what's on each screen:
columns, buttons, inputs, tabs, dialogs. It never runs the HTML, only reads it.

**Output:**
- `02-new-design.json`: in the same format as P1, so the two can be compared
- `questions.md`: things the design doesn't make clear

**Watch out:**
- **Parts drawn by JavaScript are missed.** Claude has to read the design to
  fill the gaps.
- **Rerunning P2 overwrites `questions.md`.** Save your answers first.

**Next:** P3.

---

### P3 · Screen map: the list of changes

**Done by:** Claude. There is no script.

**What it does:** compares P1 (old) with P2 (new) and lists every difference.
Each difference gets an id and a type:

| Type | Meaning | Backend work? |
|---|---|---|
| V0 | Looks different only | No |
| V1 | Moved somewhere else | No |
| D1 | Shows new data | Maybe |
| D2 | New filter, sort or search on the server | Yes |
| A1 | New action (import, bulk save) | Yes |
| A2 | New workflow or status | Yes, more |
| R1 | Something removed | Check who still uses it |
| X | Shared across many pages | Priced once for the whole programme |

**Output:** `03-screen-map.md`

**Next:** Gate 1.

---

### GATE 1 · You approve the list

**The run stops here.**

**You check:**
1. **Does the new design replace today's page, or is it a new page?**
2. **Is each change's type correct?**

**You reply:** `approved`, or give corrections.

**Also answer `questions.md` now if you can.** Every unanswered question makes
the estimate range wider.

**Next:** P4.

---

### P4 · Impact: what each change needs in the backend

**Done by:** Claude, one helper agent per change.

**What it does:** for each change, checks 12 areas and writes a value or
"none" for every one:

```
L1  API          L5  data migration   L9   API tests
L2  permissions  L6  jobs / emails    L10  UI tests
L3  logic        L7  unit tests       L11  monitoring
L4  database     L8  integration      L12  other apps using it
```

Each claim either points to a fact in the index, or is marked **Assumed**
together with what was searched.

**Output:** `04-impact.json` and `04-impact.md`

**Next:** P5.

---

### P5 · Estimate: how many days

**Claude runs:**
```bash
bun .claude/skills/fem-estimate/scripts/compute-estimate.ts cms <module>
```

**What it does:** turns P4 into person-days using fixed sizes from
`fem.config.json`. It's plain maths, so the same input always gives the same
answer.

It gives two numbers:
- **P50:** the likely case
- **P90:** the safe case, wider when things are assumed or unanswered

**Output:** `05-estimate.md`, `05-estimate.json`, `05-estimate.csv` (opens in a
spreadsheet)

**Next:** P6.

---

### P6 · Decisions: cheaper options

**Done by:** Claude.

**What it does:** suggests cheaper ways to build expensive changes, then puts
every change in one bucket:

| Bucket | Meaning |
|---|---|
| Take | Build as designed |
| Take-variant | Build the cheaper version |
| Defer | Later |
| Reject | Too costly (always offered with an alternative) |

**Output:** `06-decisions.md`: written for UX and product, with no code in it.
Includes **what users lose** and **what users gain**.

**Next:** Gate 2.

---

### GATE 2 · Tech lead approves the decisions

**The run stops here.**

**Tech lead checks:** `06-decisions.md`, ideally with UX.

**Tech lead replies:** `approved`

**Next:** P7.

---

### P7 · Plan: what order to build in

**Done by:** Claude.

**What it does:** puts the approved changes in a safe order. This repo has no
feature flags, so the order is always:

```
1. EXPAND    add new backend things that break nothing
2. MIGRATE   switch the page to the new design
3. CONTRACT  remove old things nobody uses any more
```

**Output:** `07-plan.md`

**Next:** P8.

---

### P8 · Report: the final document

**Done by:** Claude.

**Output:**
- `REPORT.md`, **for engineers**, in 10 sections: summary, screen map,
  changes, impact, estimate, decisions, plan, risks, open questions, evidence.
- `SUMMARY.md`, **for everyone else**: one page in plain language, with no
  technical words. **Every module uses the same ten sections in the same
  order**, so it reads the same way each time:
  1. **The verdict** — what it costs, split into "take it" and "small ask"
  2. **The choice** — keep today's page · build as drawn · the agreed version
  3. **Recommendation** — which one, and why
  4. **What changes, in numbers** — screen-only · server · tests-only · put
     off, and a highlighted **API and database changes** block: new endpoints,
     tables, columns and indexes, each with **why it is needed** (or a bold
     "nothing changes")
  5. **What users gain**
  6. **Does this affect colleges?** — whether the design assumes a school shape
     (Level/Grade/Section, "Class 1"), who cannot use the new screen, and what
     they get instead
  7. **What users lose**
  8. **What makes it expensive**
  9. **How sure we are**
  10. **Exactly what changes** — API, database and screen tables, each row
      saying **why**, then what was dropped and what is still unanswered

P8 is only marked done when **both** files exist, when the summary has all ten
sections **in that order**, and when both answer the college question — the
validator rejects anything else, even if the answer is "this design makes no
school-only assumption".

**Done.** Every file is in `docs/fe-migration/cms/<module>/`.

---

## All output files in one place

```
docs/fe-migration/cms/<module>/
  01-baseline.json / .md      P1   today's module
  02-new-design.json          P2   new design
  questions.md                P2+  open questions
  03-screen-map.md            P3   list of changes        ← gate 1
  04-impact.json / .md        P4   backend work
  05-estimate.md/.json/.csv   P5   days
  06-decisions.md             P6   for UX                 ← gate 2
  07-plan.md                  P7   build order
  REPORT.md                   P8   final report (engineering)
  SUMMARY.md                  P8   one-page plain summary (everyone else)
  state.json                  progress tracker
```

---

## Checking the work

Every phase is checked before it is recorded — a broken output cannot be marked
done. See **[VALIDATION.md](VALIDATION.md)** for what is checked at each phase,
the six rules that catch work with no owner, and, importantly, the things the
checker **cannot** catch.

```bash
bun .claude/skills/fem-run/scripts/validate-outputs.ts cms <module>
```

## Handy commands

| I want to… | Type |
|---|---|
| Start a module | `/fem-run cms <module>` |
| Continue from a phase | `/fem-run cms <module> --from P4` |
| Re-run one phase | `/fem-run cms <module> --only P5` |
| See progress | `bun .claude/skills/fem-run/scripts/run-state.ts status cms <module>` |
| See what's next | `bun .claude/skills/fem-run/scripts/run-state.ts next cms <module>` |
| Check after UX sends new designs | `bun .claude/skills/fem-run/scripts/run-state.ts rehash cms <module>` |

---

## Tips from the first run (academic-calendar)

1. **Answer `questions.md` early.** Open questions were the biggest reason the
   estimate range was wide.
2. **Ask the module owner what fields today's records hold.** The index can't
   see fields, and a new design can drop them without anyone noticing.
3. **If the design came out of a bigger flow** (like a setup wizard), decide at
   gate 1 whether it replaces today's page.
4. **No server unit tests in the module?** Budget extra time. The estimate
   doesn't include setting up the first test suite.
5. **The estimate covers backend and tests only.** Building the new screen is
   extra.
6. **The day numbers are defaults** until the module ships and
   `/fem-calibrate` compares them with real effort.

---

## The one rule

**Scripts collect the facts. Claude only makes the judgement calls.**

Claude never reads the app code during a run. It reads only the index from
Step 0. That keeps the results repeatable, and it's why Step 0 must be run
again whenever the code changes.
