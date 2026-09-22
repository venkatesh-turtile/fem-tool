---
name: fem-run
description: "Run the Frontend Migration Impact Workflow end to end for one module — baseline, design intake, screen map, impact, estimate, tradeoff, plan and report — managing state.json, stopping at both human gates, detecting changed design files by hash, and supporting resume with --from and single-phase re-runs with --only. This is the one command a backend developer types. Use when the user says run fem, analyse a module against its new designs, estimate the backend impact of a redesign, or names a module and an app."
---

# fem-run — the orchestrator

```bash
/fem-run cms timetable ~/Downloads/whatever.html   # file it and run
/fem-run cms timetable                             # design already in place
/fem-run cms timetable --from P4                   # resume
/fem-run cms timetable --only P5                   # re-run one phase
```

**When a path to an HTML file is given, file it first** — do not ask the user
to copy anything anywhere:

```bash
bun .claude/skills/fem-run/scripts/install-design.ts cms timetable <path>
```

It creates both folders, copies the design in under the module's name, and — if
a run already exists for an **older** design — archives that run and its design
together as `<module>.runN-<date>` before the new one lands. Re-filing the same
design is a no-op, so a resumed run keeps its gates and its answered questions.

The module name stays explicit because it must match the module in the
codebase; a file called `Academic_Calendar_UI_3D 4.html` cannot tell the
workflow that the module is `academic-calendar`.

**A module may be a route prefix.** Large modules are several products sharing
a folder, and a design covering one part of one should not be compared against
all of it:

```bash
/fem-run cms hrms/admin/leaves ~/Downloads/HRMS_Leaves.html
```

`hrms` is 47 screens; `hrms/admin/leaves` is 6. The prefix is matched against a
route's named segments from the first one, so `/nexus/academic-structure` is
Nexus's screen and not academic-structure's. Output lands in one flat folder —
`docs/fe-migration/cms/hrms-admin-leaves/`.

## P0 · the index — rebuilt on every run, not by the user

**Always run this first, before P1, without being asked:**

```bash
bun .claude/skills/fem-index/scripts/build-index.ts
```

It takes about two seconds on a repo of this size, so there is no reason to
make anyone remember it, and no way for the analysis to describe a codebase
that has moved on. A stale index is the quietest failure this workflow has:
every number afterwards looks right and refers to code that changed last week.

The user's whole job is `/fem-run <app> <module>` plus the two gates.

If the build fails, stop and say so — do not fall back to an older index. A
missing index is obvious; a stale one is not.

If no path was given, the design must already be in place:

```
docs/fe-migration/designs/<app>/<module>/<screen>--<state>.html
```

## Sequence

```
P1  fem-baseline        from _index/ — you provide nothing
P2  fem-design-intake   from your HTML
P3  fem-screen-map      ══ GATE 1 · developer ══
P4  fem-impact          subagent per change
P5  fem-estimate        rubric
P6  fem-tradeoff        ══ GATE 2 · tech lead ══
P7  fem-plan
P8  fem-report          REPORT.md + SUMMARY.md (one-page, plain language)
```

## State

```bash
R=.claude/skills/fem-run/scripts/run-state.ts
A=.claude/skills/fem-run/scripts/record-answer.ts
bun $A cms timetable Q2 b "you@example.com"      # what someone answered
bun $A cms timetable Q2 --own "only for exams" "you@example.com"
bun $A cms timetable Q4 --open "you@example.com" # nobody can answer this yet
bun $R status  cms timetable
bun $R next    cms timetable                  # what should run now
bun $R done    cms timetable P3               # verifies the output file exists
bun $R approve cms timetable gate1 <who>      # gates are accountable
bun $R rehash  cms timetable                  # detect changed designs
```

`done` refuses to record a phase whose output file is missing, so state cannot
drift from disk. It also runs the validator below, and refuses to record a
phase whose output breaks a schema or a fem rule.

## Validation

```bash
bun .claude/skills/fem-run/scripts/validate-outputs.ts cms timetable        # all phases
bun .claude/skills/fem-run/scripts/validate-outputs.ts cms timetable P4     # one phase
```

Checks the phase outputs against `fem-shared/schemas/`, plus the rules no
schema can express:

| | |
|---|---|
| **A** | P3 catalogued more changes than P4 traced |
| **B** | a `V0`/`V1` change carries no `L10` — §6.1 |
| **C** | a `rubric` key that is not in `fem.config.json` |
| **D** | `assumed: true` with no `searched` — §6.4 |
| **E** | a blocked layer but a status that does not say so |
| **F** | **a layer that says its cost is "covered by C-x" where `C-x` prices nothing** |

**F is why this exists.** Twice, a compatibility check and an integration test
vanished when gate 2 approved a cheaper variant: the owner's layer became
`none`, and the layer folding into it still claimed it was covered. Both
reached a signed-off report. A third instance was found the day the check was
written. Run it against `_variants/*` too — that is where the variant swap
happens.

## Rules

1. **Stop at the gates.** Do not run P4 before gate 1, or P7 before gate 2. §7.1.4
   — real gates, not pauses. `next` exits 3 when blocked.
2. **Refuse to proceed past an UNPARSEABLE design.** `fem-design-intake` exits
   non-zero. An empty screen spec flows downstream as "the new design has no
   columns" and every later phase is confidently wrong.
3. **Re-hash before resuming.** If a design changed, P2 onward is invalidated
   and both gates are reset. Stable IDs mean the developer sees a **diff** of
   the change catalogue, not a fresh one — decisions survive (NFR-3).
4. **Never write outside `docs/fe-migration/`** (NFR-1).
5. **Quote the index ref** with any number you report.
6. **The phase that raises a question asks it.** Not the next phase, not the
   gate, not the report — P2 asks the design's questions, P3 the comparison's
   before gate 1, P4 what tracing turned up, P6 whatever is left. Every kind goes
   through `AskUserQuestion`: one call per question, options, "Leave it open" or
   "Skip for now", and the person's own answer always welcome.
   `.claude/skills/fem-shared/asking-questions.md` is the convention; answers are
   recorded with `record-answer.ts` and survive a resume.
7. **Every answer is re-checked before the run moves on.** An answer can kill a
   cheaper option, contradict another answer, break something the other option
   did not, or raise a question nobody has asked. See
   `.claude/skills/fem-shared/answer-consequences.md` — re-check, ask what it
   turns up, check again, and re-trace plus re-estimate whatever moved. A phase
   is not done while that loop is still finding things.
8. **Gate 2 is refused** while a mandatory question is neither answered nor
   explicitly left open.

## Time

§4 G8 targets one module in ≤2 hours including both gates. That is compute plus
review time, and it assumes the gates are answered promptly — gate 1 by the
developer running it, gate 2 by whoever §14 Q3 settles on. In practice gate 2
usually lands on a different day. Plan calendar time accordingly; the workflow
is resumable precisely because of this.
