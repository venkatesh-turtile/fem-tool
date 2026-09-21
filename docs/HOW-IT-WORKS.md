# fem — how it works, end to end

A walkthrough of the Frontend Migration Impact Workflow, using **CMS `timetable`**
as the worked example.

Spec · `docs/specs/fe-migration-impact-workflow-requirements.md`
Every number below is **measured** against `dev@334475e81`, except the sections
marked *illustrative* — the new timetable design does not exist yet.

---

## The whole thing, on one page

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  ONCE PER PROGRAMME                                                     │
 │                                                                         │
 │   $ bun .claude/skills/fem-index/scripts/build-index.ts                 │
 │                              │                                          │
 │        walks the repo ───────┴──────── no LLM, pure static analysis     │
 │                                                                         │
 │        356 routes · 1,844 bindings · 484 endpoints · 1,377 route defs   │
 │                              │                                          │
 │                              ▼                                          │
 │              docs/fe-migration/_index/*.json                            │
 │              stamped  dev@334475e81 · 1.0s · byte-identical             │
 └──────────────────────────────┬──────────────────────────────────────────┘
                                │
 ┌──────────────────────────────┼──────────────────────────────────────────┐
 │  PER MODULE                  │                                          │
 │                              │                                          │
 │   you drop ──► docs/fe-migration/designs/cms/timetable/*.html           │
 │                              │                                          │
 │   $ /fem-run cms timetable   │                                          │
 │                              │                                          │
 │      ┌───────────────────────┴───────────────────────┐                  │
 │      ▼                                               ▼                  │
 │  ╭─────────────────╮                        ╭──────────────────╮        │
 │  │ P1  baseline    │                        │ P2 design-intake │        │
 │  │ reads _index    │                        │ parses your HTML │        │
 │  │ NO input needed │                        │   ⚠ BLOCKED      │        │
 │  │                 │                        │                  │        │
 │  │  2 screens      │                        │  designs today   │        │
 │  │ 26 bindings     │                        │  are compiled    │        │
 │  │  3 endpoints    │                        │  React — 1,826   │        │
 │  │ 28 routes       │                        │  createElement,  │        │
 │  │ 12 tables       │                        │  zero DOM        │        │
 │  │ 100% resolved   │                        │                  │        │
 │  ╰────────┬────────╯                        ╰────────┬─────────╯        │
 │           └──────────────────┬───────────────────────┘                  │
 │                              ▼                                          │
 │                   ╭─────────────────────╮                               │
 │                   │ P3  screen-map      │  1:1 · split · merge          │
 │                   │ change catalogue    │  new · removed                │
 │                   ╰──────────┬──────────╯  C-timetable-001 … NNN        │
 │                              ▼                                          │
 │         ╔════════════════════════════════════════════╗                  │
 │         ║  GATE 1   the developer confirms the map   ║                  │
 │         ╚════════════════════╤═══════════════════════╝                  │
 │                              ▼                                          │
 │                   ╭─────────────────────╮                               │
 │                   │ P4  impact          │  one subagent per change      │
 │                   │ ladder → L1…L12     │  V0/V1 skip · L10 still counts│
 │                   ╰──────────┬──────────╯                               │
 │                              ▼                                          │
 │                   ╭─────────────────────╮                               │
 │                   │ P5  estimate        │  P50 / P90 · confidence       │
 │                   ╰──────────┬──────────╯  from fem.config.json         │
 │                              ▼                                          │
 │                   ╭─────────────────────╮                               │
 │                   │ P6  tradeoff        │  Take · Take-variant          │
 │                   │                     │  Defer · Reject               │
 │                   ╰──────────┬──────────╯                               │
 │                              ▼                                          │
 │         ╔════════════════════════════════════════════╗                  │
 │         ║  GATE 2   the tech lead approves buckets   ║                  │
 │         ╚════════════════════╤═══════════════════════╝                  │
 │                              ▼                                          │
 │                   ╭─────────────────────╮                               │
 │                   │ P7  plan            │  expand → migrate → contract  │
 │                   ╰──────────┬──────────╯                               │
 │                              ▼                                          │
 │                   ╭─────────────────────╮                               │
 │                   │ P8  report          │                               │
 │                   ╰──────────┬──────────╯                               │
 │                              ▼                                          │
 │        docs/fe-migration/cms/timetable/                                 │
 │            REPORT.md        ──► engineering                             │
 │            06-decisions.md  ──► UX        ← the point of all of it      │
 └─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼  after several modules
                  fem-rollup      programme total · X-NN deduped
                  fem-calibrate   estimate vs actuals → update the rubric
```

**The one rule that shapes everything:** the model never reads the repo. It only
ever sees JSON a script produced — §3.2, *"should be built with code, not by a
model reading files."*

---

## 1 · The skills — who does what

13 skills plus one shared folder. `script` means a deterministic program;
`model` means LLM judgement with the script's output as its only input.

### Once per programme

| Skill | | What it does |
|---|---|---|
| **fem-index** | `script` | Walks the repo and builds the graph everything else queries: routes → components → hooks → API clients → server schema → route → handler → tables → tests → dashboards → consumers. Re-run when `dev` moves. **Nothing else reads source code.** |
| **fem-system-diff** | `model` | Reads all the new designs at once looking for design-system patterns — a shared table with sort/filter/export, a global search, a notification centre. Emits `X-NN` items estimated **once** at programme level, so 39 modules don't each pay for the same capability. |

### Per module — `fem-run` drives these in order

| Skill | | What it does |
|---|---|---|
| **fem-baseline** | `script` `model` | Describes the module as it exists today in the normalised screen spec — screens, columns, filters, actions, tabs, dialogs, states — every data element tied to a binding or marked static. Reads only `_index/`. |
| **fem-design-intake** | `script` `model` | Parses the new HTML into that *same* spec so the two are comparable. Raises **ambiguity questions** instead of guessing, and SHA-256s each file so a design update re-runs only what changed. |
| **fem-screen-map** | `model` **GATE 1** | Aligns old screens to new ones — 1:1, split, merge, new, removed — then diffs them element by element into the change catalogue, each item with a stable `C-` ID and a taxonomy code. Tags `V0` so later phases skip backend tracing. **Stops for the developer.** |
| **fem-impact** | `model` *subagent per change* | For every non-`V0` change: walks the data-resolution ladder, then the index — binding → endpoint → handler → tables → tests → dashboards → consumers — and fills in all twelve layers. Classifies API changes additive or breaking and names who else breaks. Each claim cites `file:line` or is marked Assumed. |
| **fem-estimate** | `model` *config* | Turns impact into person-days using `fem.config.json` — base sizes, risk multipliers, the L7 percentage, module overhead, and the evidence-state multiplier that sets P90. Emits P50/P90 per change and per layer, module total, confidence, top five cost drivers. |
| **fem-tradeoff** | `model` **GATE 2** | Weighs user value against backend cost. Proposes **cheaper variants** — client-side filtering for bounded lists, composing existing endpoints, deriving in the front end, async instead of sync, keeping the old field alongside the new — then buckets each change Take / Take-variant / Defer / Reject with a cost delta. **Stops for the tech lead.** |
| **fem-plan** | `model` | Sequences what was accepted into a safe migration: expand (additive schema, indexes, backfills) → migrate (switch screens) → contract (remove deprecated fields once consumers move). Dependency-sorted into shippable increments; flags any two-app release. |
| **fem-report** | `model` | Assembles `REPORT.md` — summary, screen map, change catalogue, impact matrix, estimate, decisions, plan, risks, open questions, evidence appendix — and `06-decisions.md`, the slice that goes to UX. |

### Orchestration and programme

| Skill | | What it does |
|---|---|---|
| **fem-run** | — | The one command you type. Runs P1→P8 for `<app> <module>`, manages `state.json`, supports `--from` and `--only`, stops at both gates, and detects changed design hashes. |
| **fem-rollup** | `model` | Aggregates module estimates into a programme total, deduplicating `X-NN` items and shared endpoints so nothing is counted twice. Produces sequencing and a risk register. |
| **fem-calibrate** | `model` | After a module actually ships, compares the estimate with real actuals **per layer** and proposes updates to `fem.config.json`. This is how the rubric stops being a guess. |
| **fem-shared** | — | Not a skill — the files the others read: `taxonomy.md` (§6, single source of truth), `estimation-rubric.md`, `report-template.md`, and the four JSON schemas for screen-spec, change-item, impact and estimate. |

**Read the table as two halves.** `fem-index`, `fem-baseline` and the parser
inside `fem-design-intake` establish *facts* and are reproducible byte for byte.
Everything else is *judgement*, and every judgement is bounded by the facts
handed to it and checked by a human at one of the two gates.

---

## 2 · Build the index — once per programme

```bash
bun .claude/skills/fem-index/scripts/build-index.ts
```

```
  apps/cms/app/**/page.tsx ─────────────────────►  356 routes
  apps/cms/modules/**/*.ts ─────────────────────►  1,844 schema imports
       import { … } from "@server/modules/…/sections/timetable/…"
                   │
                   ▼
  apps/server/src/modules/** ───────────────────►  486 endpoints
       createRoute({ method, path })                1,260 route definitions
       handler → @server/database/schema            → Drizzle tables
                   │
  apps/e2e/** ───────────────────────────────────►  specs + page objects
  every app in apps/ ────────────────────────────►  consumers   (L12)
```

**Measured:** 1.4 s · **100 %** of endpoints resolved · byte-identical across
runs. Budget was ≤120 s and ≥95 %. Across all 45 CMS modules, **27 of 27** that
have endpoints pass the bar.

Every output file carries the ref it was built from:

```json
"ref": { "branch": "dev", "sha": "334475e81", "dirty": false }
```

> **Why the ref matters.** §3 of the spec was scanned without one. Those figures
> came from `main`. On `dev` there are **393 pages, not 237** — a 66 % undercount
> on the number the whole programme is sized against. An index that cannot name
> its commit drifts the same way.

### There are four route styles, not two conventions

The spec names two conventions. Building the indexer found four route styles,
and one of them is described misleadingly. **Timetable uses two of them**, which
is part of why it is a good pilot:

| Style | Route definition in | Handlers | In timetable |
|---|---|---|---|
| feature-folder | `route.ts` | `handler.ts` | — |
| **suffixed** | **`*.schema.ts`** — *not* `*.routes.ts` | `*.handlers.ts` | `sections/timetable` |
| routes-plural | `routes.ts` | `handlers.ts` | `hrms/timetable/*` |
| **hono-chain** | `router.post("/runs", …)` — **no Zod, no OpenAPI** | inline | — |

The fourth is worth knowing about beyond indexing: **33 endpoints are plain Hono
chains with no Zod schema and no OpenAPI entry**, so a contract change there is
invisible to the generated spec. The index flags them in
`summary.honoChainEndpoints`.

Two more findings fell out:

- **Service-layer indirection.** Admissions handlers import **no** Drizzle
  tables — they call `services/*.service`, and the service imports them.
  Resolving one hop took admissions from **1 table to 38**. The spec names this
  as risk #2 and prescribes marking items Assumed; one hop resolves it outright.
- **3 dead stubs** — `details`, `location`, `logo` each have the full
  `*.routes.ts` / `*.schema.ts` / `*.handlers.ts` file set and define **zero**
  routes. Two-line files, nothing importing them. Recorded as
  `no-routes-defined` rather than silently counted as failures.

In the suffixed convention the `*.routes.ts` file only wires definitions to
handlers via `.openapi()`. An indexer that greps `method:` in the routes file
finds nothing and sits at **55 %** resolution. Scanning every `.ts` in the
feature directory gives **98.8 %**.

Directories holding shared types with no `createRoute` at all are recorded as
`shared-schema`, not counted as failed endpoints — 49 of them in CMS.

---

## 3 · What you provide — one thing

```
docs/fe-migration/designs/cms/timetable/
    timetable.html
    timetable--empty.html
    timetable--error.html
    timetable-detail.html
    …
```

One file per screen **state** (§14 Q1). Empty, loading and error states each get
their own file, because each can imply different backend work.

**You do not provide the existing module.** `cms timetable` resolves itself.

---

## 4 · P1 · baseline — what timetable is today

### The module-name trap, and why prefix scoping matters

```
  find -ipath '*timetable*'                    →  8 pages
      /timetable                                    ← timetable
      /timetable/[academicNodeId]                   ← timetable
      /nexus/timetable                              ← nexus
      /academic-structure/…/timetable               ← academic-structure
      /hrms/personal/timetable                      ← hrms
      /hrms/admin/timetable                         ← hrms
      /hrms/admin/timetable/calendar                ← hrms
      /hrms/admin/timetable/workload                ← hrms

  route-prefix scoped  /timetable                →  2 pages
```

Eight matches spanning **four different modules**. A substring match would drag
`nexus`, `academic-structure` and four `hrms` screens into timetable's report and
inflate every layer. The index scopes by route prefix; `fem-baseline`'s
acceptance check — *"screen list matches the module's `page.tsx` routes"* — is
what catches it if this ever regresses.

### What resolves, with no input from you

```
  screens        2      /timetable
                        /timetable/[academicNodeId]

  bindings      26      across 20 files — and NOT just api/ :
                          api/configuration.api.ts   api/pdf.api.ts
                          api/sections.api.ts
                          components/timetable-grid.tsx
                          components/substitute-dialog.tsx
                          components/conflict-alert.tsx
                          hooks/use-time-slots-configuration.ts    … +13

  endpoints      3      100 % resolved
      …/academic-nodes/sections/timetable     suffixed      21 routes
                                              get post patch delete
      …/hrms/timetable/admin                  routes-plural  4 routes  get put
      …/hrms/timetable/staff                  routes-plural  3 routes  get

  route defs    28
  tables        12      timetable/slots            timetable/assignments
                        timetable/pdfs             timetable/assignment-history
                        timetable/subject-staff-assignments
                        academic/nodes             academic/subjects
                        departments                students/student-in-institutes
                        hrms/staff-in-institutes   hrms/staff-designations
                        hrms/workload-config

  tests         10 server unit · 32 cms unit · 9 e2e specs

  consumers     none — no app outside cms imports these three modules
```

> **A trap the tool caught, and worth knowing.** `student-cms` does import a
> module called timetable — but it is
> `@server/modules/**student**/institutions/[institutionId]/timetable`, an
> entirely **separate** server module from the three CMS timetable uses. Same
> word, different code. Redesigning the CMS timetable does not touch the student
> one, and vice versa.
>
> A human scanning for "who else uses timetable" would very likely have called
> this a shared endpoint and applied §9.2's ×1.5 breaking-contract multiplier to
> the whole module. The index compares full module paths, so it says `none` —
> correctly. This is precisely the class of mistake the workflow exists to
> remove.

---

## 5 · P2 · design intake — the blocked step

Parses the new HTML into the same screen spec, raises **ambiguity questions**
rather than guessing, and SHA-256s each file into `state.json` so a design update
re-runs only what it touched.

The questions are not filed away: P2 **asks them in the terminal**, with options,
before it records itself as done — as does every later phase for its own
questions. See `fem-shared/asking-questions.md`, and
`fem-shared/answer-consequences.md` for the re-check that follows every answer.

> ⚠ **This does not work yet.** The designs shipped so far are precompiled React
> — 1.3 MB with **1,826 `createElement` calls and zero `<table>`, `<th>`,
> `<input>` or `<button>`**. A DOM parser returns nothing.
>
> Two fixes: ask UX for semantic HTML (≈1 day), or render each file headless in
> a sandbox and parse the result (≈2–3 days, and NFR-7 changes from *"parse,
> never execute"* to *"execute sandboxed, then parse"*).
>
> **Settle this before anything downstream is built** — every later phase reads
> P2's output.

---

## 6 · P3 · screen map  *(illustrative)*

```
  S-timetable-01  /timetable                    →  1:1
  S-timetable-02  /timetable/[academicNodeId]   →  1:N   grid + list view
                                           NEW  →  S-new-03  substitution board
```

Every difference that is not pure restyling becomes a change item with a stable
ID, classified by §6.1:

```
  V0  visual-only         18     no backend — L10 still applies
  V1  relocation           2
  D1  data display         4     → resolution ladder
  D2  query capability     2     → resolution ladder
  A1  new action           2
  A2  workflow / state     1
  R1  removal              0
```

```
  ╔══════════════════ GATE 1 ═══════════════════════════════╗
  ║  the developer confirms the map and the taxonomy        ║
  ║  corrections are written back into 03-screen-map.md     ║
  ╚═════════════════════════════════════════════════════════╝
```

---

## 7 · P4 · impact — one subagent per change

V0 and V1 skip backend tracing. Everything else goes down the ladder, then
across all twelve layers.

```
  for each data element the new screen needs — stop at the first hit:

  1  already in the response schema                cost 0 · FE only
  2  derivable client-side from returned fields    cost 0 · flag perf
  3  in the DB but not exposed                     additive API · low
  4  derivable server-side (join, aggregate)       handler + index · medium
  5  not stored anywhere                           DB + write path + backfill · high
```

A worked change *(illustrative, but every path and table is real)*:

```
  C-timetable-011                             A1 · new action
  Substitution board — assign cover for a leave day from one screen
  ladder step 4 — derivable server-side

  L1   API contract   new mutation POST /substitutions/bulk      ADDITIVE
                      …/academic-nodes/sections/timetable/*.schema.ts
  L2   Middleware     needs a new scope — assigning staff is not covered
                      by the existing institution-access check
  L3   Handler        conflict detection across slots · validation
  L4   Database       cms/timetable/assignments — no new column
  L5   Migration      none
  L6   Async          notify the covering staff member
  L7   Unit tests     30 % of L1–L6
  L8   Integration    1 suite
  L9   E2E — API      1 new spec
  L10  E2E — UI       1 spec + page object          9 specs already exist
  L11  Observability  none
  L12  Consumers      none — no app outside cms imports these modules
                      (student-cms uses modules/student/…/timetable, which
                       is different code)
                      evidence: _index/consumers.json
```

**Every layer gets a row even when the answer is "none".** That is what stops
costs hiding — the failure mode §2.2 says runs 30–100 % under.

---

## 8 · P5 · estimate

Order of operations is pinned in `fem.config.json`, because L7 is a percentage
in a table of absolutes and two people must not get different answers from the
same inputs (NFR-6):

```
  1  sum L1–L6 base sizes
  2  apply §9.2 risk multipliers to that sum
  3  L7 = 30 % of the multiplied L1–L6 sum
  4  add L8–L12, unmultiplied
  5  module subtotal
  6  + 15 % module overhead
  7  P90 = P50 × evidence state
            1.3 all evidenced · 1.6 any assumed · 2.0 open question
```

---

## 9 · P6 · tradeoff — the sheet UX reads  *(illustrative)*

```
  TAKE           6 changes    8.4 d
  TAKE-VARIANT   3 changes    3.1 d      was 7.0 d — saves 3.9 d
     C-011  single substitution, not bulk                   −2.2 d
     C-004  filter the grid client-side, it is one week      −1.1 d
     C-007  reuse the existing PDF export                    −0.6 d
  DEFER          1 change     needs the staff mobile app first
  REJECT         1 change     4.0 d lifecycle rewrite for a status label
```

```
  ╔══════════════════ GATE 2 ═══════════════════════════════╗
  ║  the tech lead approves the buckets                     ║
  ╚═════════════════════════════════════════════════════════╝
```

---

## 10 · P7 · plan

```
  EXPAND     add the substitutions endpoint alongside the existing ones
             add the new permission scope, granted to nobody yet
  MIGRATE    switch screens one at a time · dev → staging → demo → prod
  CONTRACT   single-app release — no external consumer of these modules
```

There are no feature flags in this repo (§3), so expand → migrate → contract is
mandatory, not a preference — even when only one app is involved.

---

## 11 · The artifact trail

Each phase reads the previous phase's files and writes its own, so a run is
resumable, reviewable and diffable.

```
  state.json
  01-baseline.json|md      P1
  02-new-design.json|md    P2   + questions.md
  03-screen-map.md         P3   ← gate 1
  04-impact.json|md        P4
  05-estimate.json|md|csv  P5
  06-decisions.md          P6   ← gate 2
  07-plan.md               P7
  REPORT.md                P8
```

```bash
  /fem-run cms timetable --from P4     # resume
  /fem-run cms timetable --only P5     # re-run one phase after a rubric change
```

Change one HTML file and its SHA-256 changes in `state.json`; only affected
phases re-run. Stable IDs mean you get a **diff** of the change catalogue, not a
fresh one — so decisions taken at gate 2 survive a design update.

---

## 12 · Known gaps

| | |
|---|---|
| **P2 cannot parse today's designs** | 1,826 `createElement`, zero DOM. Blocks the entire right-hand leg |
| **L12 is blind to the mobile apps** | `apps/student` has **0** `@server/modules` imports. The lever that carries every other layer cannot see it, so a `none` result means *no web consumer*, not *no consumer*. Needs a registry, a mobile-repo scan, or production route telemetry |
| **Risk multipliers are uncapped** | ×1.5 · ×1.5 · ×1.3 · ×1.3 = ×3.80, then P90 ×1.6 → **×6.08**. Capped at 3.0 in `fem.config.json` pending a decision |
| **§3's scan has no git ref** | Numbers are from `main`; `dev` is 66 % bigger |
| **M4's ±25 % bar** | The §9.1 numbers are labelled *"defaults · calibrated in pilot"*. ±25 % is realistically a post-calibration bar, not a first-run one |

---

## 13 · Status

```
  fem.config.json    rubric · paths · pinned order of operations      DONE
  fem-index          100 % · 1.4 s · byte-identical                    DONE
  fem-baseline       27/27 CMS modules pass                            DONE
  fem-design-intake  parser works on semantic HTML; fails loudly on
                     compiled React instead of emitting an empty spec   DONE
  fem-estimate       arithmetic verified by hand                        DONE
  fem-run            state machine, gates, design-hash invalidation     DONE
  P3 P4 P6 P7 P8     SKILL.md written — model steps, no script needed   DONE
  fem-system-diff · fem-rollup · fem-calibrate                          DONE

  Running the pipeline end to end still needs the P2 input decision.
```

**M1 exit** — *baseline reviewed by the module owner; ≥95 % bindings resolved.*
Timetable resolves at **100 %**. The review is the remaining half.
