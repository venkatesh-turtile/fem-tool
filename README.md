# Frontend Migration Impact Workflow

## Install — two ways, same result

**Without a clone.** This is the one to send a teammate:

```bash
cd /path/to/your-repo
curl -fsSL https://raw.githubusercontent.com/venkatesh-turtile/fem-tool/main/install.sh | bash
```

**With a clone.** The right way if you want to read the skills before running
them, or change them:

```bash
git clone https://github.com/venkatesh-turtile/fem-tool.git ~/fem-tool
~/fem-tool/install.sh /path/to/your-repo    # or no argument, from inside the repo
```

Either way you get the same fourteen skills in `.claude/skills/` and a starter
`fem.config.json`. Run from a clone, the script copies from that clone and never
touches the network — so a change you are testing is the change that gets
installed.

Then, in Claude Code from inside your repo:

```
/fem-run cms academic-calendar ~/Downloads/Academic_Calendar.html
```

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
- **Who else reads the same data.** Not "who imports our types" — who touches
  the table. In the run this was built from, the calendar's events table had
  three readers: the CMS screen, a dashboard, and the parent app. Two of them
  import nothing from the CMS and were invisible to the old check. A change
  that alters an API or a table cannot claim "no one else is affected" without
  naming what it checked.

## More about installing

Both commands above do the same three things and nothing else: copy the fourteen
`fem-*` skills into `<repo>/.claude/skills/`, drop in a starter
`fem.config.json` if you have none, and stop. No git operations, no
dependencies, no build, no other file touched.

The no-clone version downloads this repo into a temporary folder and deletes it
afterwards. Piped through a shell there is no argument to read, so it installs
into the **current directory** — it warns you if that directory has no `.git`
and no `package.json`, which is the one way to get this wrong quietly.

**Updating** is the same command again. Your `fem.config.json` is never
overwritten.

**Pinning a branch or a fork:**

```bash
curl -fsSL https://raw.githubusercontent.com/venkatesh-turtile/fem-tool/main/install.sh \
  | FEM_REF=some-branch bash
```

### After installing

**Check the config.** `fem.config.json` has two halves. The top says where your
apps, server, tests and dashboards live — change it for your repo. The bottom is
the estimating rubric; leave it alone unless you are calibrating.

**Decide whether the tool belongs in your git history.** The skills land as
untracked files, and `.claude/skills/**` is not ignored in every repo. If you do
not want them committed:

```bash
cd /path/to/your-repo
printf '.claude/skills/fem-*\nfem.config.json\n' >> .git/info/exclude
```

**Then run it.** In Claude Code, from inside your repo:

```
/fem-run <app> <module> ~/Downloads/<design>.html
```

Nothing else to prepare — no index to build, no folders to create, no design to
file by hand. The run does all of it, and asks you whatever it cannot decide.

## Use

In Claude Code, point it at the design wherever it happens to be:

```
/fem-run cms academic-calendar ~/Downloads/Academic_Calendar_v4.html
```

Then answer what it asks and approve the two gates. It asks in the terminal, one
question at a time, with options — and your own answer is always welcome. That
is the whole thing.

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
  questions.md      every question, with the answer you gave and when
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

**Who you serve** — `institutionScope.inScope` lists the kinds of institution
you analyse for. Designs often draw more than one variant out of one file — a
school and a college, switched by a class on the page — and pricing a variant
nobody asked for is waste that reads like agreed work.

Leave the list **empty** and every variant is analysed, which is the right
default. Narrow it when you know you only serve some of them, and widen it again
the day you do: a college design analysed by a repo listing only `school` would
report almost nothing, so the list has to follow the business, not the other way
round.

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

Anything the workflow cannot determine becomes a question rather than a guess —
and it **asks you, in the terminal, with options**, in the phase that raised it.
You pick one, or give your own answer, or say "leave it open". Nothing is left
in a file for somebody to find later.

Then it re-checks what your answer did. An answer can kill a cheaper option,
contradict an earlier answer, or raise something nobody asked — so it looks,
asks again if it finds something, and keeps going until a pass turns up nothing
new. Whatever moved is re-traced and re-priced, and the report says what changed
and why.

In the run this was built from, that loop reversed one recommendation and
removed a feature worth 2.2 days. Answering the questions took the bad case from
33 days to 21, and the confidence from Medium to High.

A question still unanswered widens the estimate — uncertainty shows up in the
number instead of hiding in it — and gate 2 is refused while a mandatory one is
neither answered nor explicitly left open.

## Docs

- `docs/HOW-IT-WORKS.md` — the reasoning behind each phase
- `docs/STEP-BY-STEP.md` — a full walkthrough
- `docs/VALIDATION.md` — what the validator checks, and why each rule exists
