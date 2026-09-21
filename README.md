# Frontend Migration Impact Workflow

You have a new design for a screen. Before anyone builds it, you want to know:
**does this need backend work, and what does it cost?**

This answers that. You drop the design HTML into a folder, run one command, and
approve two decisions along the way. Out comes a plain-language summary for
product, a decisions sheet for UX, and an evidenced report for engineering.

It is not a code generator and it does not judge the design. It compares what a
screen does **today** with what the design asks for, traces every difference
through twelve layers of the stack, and prices it.

## What it catches

Database and API changes are the obvious ones. The ones teams miss:

- **What the design quietly removes.** A capability that vanishes between two
  versions of a design, with a count of how many live rows depend on it.
- **Where data can come from, cheapest first** — already in the response,
  derivable in the browser, in the database but not exposed, computable on the
  server, or stored nowhere at all. The last rung is the expensive one.
- **Rules a screen must obey or it breaks things.** "The save must not wipe the
  syllabus." "These values must exist before anything can be saved."
- **Silent data loss** — the difference between a field the screen omits and a
  field it saves blank.
- **Work that is not this module's** — a shared frame that shows up in every
  design and should be priced once, not five times.
- **Whether the design still fits every customer**, not just the one it was
  drawn for.

## Install

```bash
git clone <this-repo> fem
./fem/install.sh /path/to/your-repo
```

That copies the skills into `<repo>/.claude/skills/` and leaves a starter
`fem.config.json` if you do not have one.

## Use

In Claude Code, point it at the design wherever it happens to be:

```
/fem-run cms academic-calendar ~/Downloads/Academic_Calendar_v4.html
```

Then approve the two gates when asked. That is the whole thing.

The run files the design under its module, creates the results folder, and — if
a run already exists for an older design — archives that run and its design
together first, so nothing is lost and you can compare. Re-running with the
same design resumes where you left off, gates and answers intact.

The module name is given explicitly because it has to match the module in your
codebase; a file called `Academic_Calendar_v4.html` cannot say which module it
belongs to.

There is no setup step to remember. Every run starts by reading your codebase
and building its own map — route → component → hook → API client → server
schema → handler → database tables, plus tests, dashboards and cross-app
consumers. It takes about two seconds, and it means the analysis can never
describe a codebase that has moved on.

## The eight phases, and the two gates

```
P1  baseline        what the screen does today
P2  design intake   what the design asks for
P3  screen map      what changed
        ══ GATE 1 · is this what changed? ══
P4  impact          what the backend needs, across 12 layers
P5  estimate        what it costs
P6  trade-offs      cheaper options, and what is in scope
        ══ GATE 2 · is this what we build? ══
P7  plan            build order: additive first, remove last
P8  report          the documents
```

**Gate 1** is a factual check: is the change list right, and is anything
missing? **Gate 2** is a scope decision: which options do we take? Each is one
command, and it records who approved it:

```bash
bun .claude/skills/fem-run/scripts/run-state.ts approve <app> <module> gate1 you@example.com
```

Both are real blocks. Nothing is traced before gate 1, and no plan is written
before gate 2.

## What you get

```
docs/fe-migration/<app>/<module>/
  SUMMARY.md        plain language, for product and management
  06-decisions.md   options and costs, for UX
  REPORT.md         evidence for every claim, for engineering
  07-plan.md        build order
  questions.md      what the workflow could not decide alone
  04-impact.md      the twelve-layer trace
  05-estimate.*     the numbers, per change and per layer
```

`SUMMARY.md`, `questions.md` and `04-impact.md` all carry the same three
sentences, word for word:

> **Needs a server change:** …
> **Not in the CMS today:** …
> **Extra we must handle:** …

Written for someone who does not read code. The validator refuses a summary
that slips back into endpoint paths, table names or file names before its
reference tables.

## Configuration

`fem.config.json` has two halves.

**Where things are** — change these for your repo: `paths`, `apps`, `server`
(including the import alias the front end uses for server schemas), `e2e`,
`observability`, `consumerApps`.

**How work is costed** — leave these alone unless you are calibrating:
`baseSizes`, `riskMultipliers`, `evidenceState`, `moduleOverhead`, `taxonomy`,
`resolutionLadder`, `acceptance`.

After a module ships, `fem-calibrate` compares the estimate with what it
actually took and proposes rubric changes, so the numbers improve with use.

## What it assumes about your codebase

The index understands a particular shape: a Next.js App Router frontend with a
modules folder, a Hono + Zod backend, Drizzle tables, and — the important one —
**the frontend importing its types from the server's schemas**. That import
chain is what makes "which screen touches which table" answerable.

A repo built differently still runs, but the index will be thinner and the
analysis weaker in proportion.

## Resumable, and honest about uncertainty

State is recorded per module, so you can stop after gate 1 and come back
tomorrow. Change the design and re-run: the file's hash is stored, the phases
after it are invalidated, and you see a **diff** of the change list rather than
a fresh one — earlier decisions survive.

Anything the workflow cannot determine becomes a question rather than a guess.
Unanswered questions widen the estimate, so uncertainty shows up in the number
instead of hiding in it.

## Docs

- `docs/HOW-IT-WORKS.md` — the reasoning behind each phase
- `docs/STEP-BY-STEP.md` — a full walkthrough
- `docs/VALIDATION.md` — what the validator checks, and why each rule exists
