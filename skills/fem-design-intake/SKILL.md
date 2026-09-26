---
name: fem-design-intake
description: "Parse new UX design HTML into the same fem screen spec that fem-baseline emits, so old and new can be compared element by element. Extracts headings, table headers, form inputs, buttons, links, tabs, dialogs, pagination, search, filters and empty/error text; raises ambiguity questions instead of guessing; SHA-256s every file so design updates trigger targeted re-runs. Phase P2. Use when new designs arrive, when the user asks what a design needs from the backend, or as part of fem-run."
---

# fem-design-intake — P2

The *new* half of the comparison.

## Run

```bash
bun .claude/skills/fem-design-intake/scripts/parse-html.ts cms timetable
```

Reads `docs/fe-migration/designs/<app>/<module>/*.html`, one file per screen
**state**, named `<screen>--<state>.html` (§14 Q1). Empty, loading and error
states each get their own file, because each can imply different backend work.

## Steps

1. **Run the script.** It extracts structure and hashes each file.
2. **Stop if anything is UNPARSEABLE.** The script exits non-zero and says which
   files. Do not proceed — see below.
3. **Infer semantics, never silently.** The script produces labels; you decide
   what they mean. Every inference you cannot ground becomes a question in
   `questions.md`.
4. **Leave `binding` null.** Resolving a new element to a field, column or join
   is P4's job, via the data-resolution ladder. P2 records *what the screen
   asks for*, not where it comes from.
5. **Write the questions file.** Unanswered questions take P90 to ×2.0 (§9.3)
   and block gate 2 for the items they touch. That is the mechanism that stops
   ambiguity from being priced as certainty.

## When files are UNPARSEABLE

The script reports `semanticTags` and `createElementCalls` per file. Precompiled
React bundles — 1.3 MB with ~1,800 `createElement` calls and zero `<table>`,
`<th>`, `<input>` or `<button>` — carry **no DOM**. The content does not exist
until the bundle runs.

The script **fails loudly** rather than emitting an empty spec, because an empty
spec would flow downstream as "the new design has no columns" and every later
phase would be confidently wrong.

Two fixes:

- Ask UX for semantic HTML — about a day, and the cheapest option
- Render each file headless in a sandbox and parse the result — two or three
  days, and **NFR-7 changes** from *"parse, never execute"* to *"execute
  sandboxed, no network, then parse"*

## A form is read through its labels

There was no rule for `<label>`, so **a form parsed to nothing.** Its labels were
never looked at, and its inputs carry no `name`, `placeholder` or `aria-label` of
their own — the text is in the label — so each input fell back to its own `type`
and was filed as a *filter* called `"text"`.

An organisation setup screen with fifteen fields and no filters reported **one
field and twenty filters**, and P3 then read every real field on it as removed.

Each `<label>` is now paired with the control that follows it within 400
characters and emitted once, as a `field`. A control with no label keeps the old
classification, so a toolbar search box and a filter select on a table screen are
unaffected — re-parsing the four modules that had already run changed **no column
and no action**, and moved only labelled inputs out of `filter`.

Forms are half a CMS: onboarding, settings, profiles, every create and edit
screen. Before this the tool read tables well and forms not at all, which is why
the runs that worked were all table-shaped.

## What the markup declares and the page never shows

**The parser reads markup, not styles.** A column removed with `display:none`
is in the element list exactly as though it were on screen, and it will be
traced as work and priced.

This is not hypothetical. On `cms/academic-structure` a subjects table declared
eleven columns and showed seven. Two of the four hidden ones were traced as new
database columns before anyone noticed, and the design had explained itself in a
comment directly above each rule:

> *"the week is set where a subject is given to a class, not in the catalogue"*
> *"the lab is a row of its own here now"*

The parser now reports them — `hiddenByCss` in `02-new-design.json`, and a
question naming each column with the design's own reason. **Read that question
before cataloguing anything.** A column nobody sees is not a column the backend
has to serve.

### A class on `<body>` means two versions of one screen

When the hiding is conditional — `body.coll` versus `body:not(.coll)` — the
design is drawing the same table two ways, and that is nearly always **one per
kind of institution**. The same file answered the college question that way:
a school is shown "needs a lab"; a college is shown "department" and "domain"
instead.

That is a finding about **who the design serves**, which every module has to
answer, and it is answerable here rather than guessed at P3. Say which version
is for whom, and whether both are in scope.

### The design may also contradict an answer

A hidden column with an explanation is the design saying what it thinks that
column is. If someone has already answered differently — "it is a maximum the
school types", where the design says "it is the roll, counted" — that is a
conflict, not a detail. Put it back to them as a question naming both, and if
the decision stands against the design, record it as a deviation: the screen has
to show what the design takes off the page.

## Constraints

- **NFR-7** HTML is untrusted. Parse with regex over raw text; never execute,
  never follow a URL a design file contains.
- **NFR-3** File hashes go in `state.json`. A changed design re-runs P2 onward
  and produces a catalogue **diff**, not a fresh catalogue.

## How a question is written — the reader may not be an engineer

`questions.md` is the one file the person running this workflow has to *answer*,
so each entry is written for them, not for the developer:

1. **Say what the screen does, not what the code does.** "An event can cover
   several classes at once — today an event belongs to one class" beats "entries
   carry a single academic_node_id".
2. **Say what it changes for a school**, in one clause: what they gain, lose, or
   cannot do until it is settled.
3. **Lay out the choices with their prices**, and say which one you priced, so
   somebody reading it can disagree in one sentence:

```markdown
### Q2 · An event that covers several classes — **Decision**

Today an event belongs to one class, and the new screen lets one event name
several.

- **a)** Save it as one event per class and show them as one row — quickest,
  nothing changes underneath. **+0.5 days.**
- **b)** Build it properly so one event holds many classes — tidier, and it
  survives the next screen that needs it. **+3 days.**
- **c)** Keep one class per event and drop the multi-select from the design.
  **0 days**, and the design loses a control.

*Priced as (a), because that is the smallest thing that draws what the design
draws. (b) is the one to take if events are about to get more complicated.*
```

4. **No identifiers.** No endpoint paths, table or column names, or file names.
   If the developer needs them, they are in `04-impact.md`.
5. **One question per decision.** If two things can be answered separately, they
   are two questions.
6. **Number every entry as its own `### Qn ·` heading**, and end it by saying
   which way you priced it and why. An answer, if one ever arrives, is filed
   under that heading — so every entry needs one.

Later phases append to this file in the same style. Nothing here is marked
mandatory, because nothing here is asked: an entry is a thing noticed and
priced as drawn, with the alternative's cost beside it.

## Write them down — do not ask anybody

**Do not ask.** Take the design as drawn and record what it shows.
`questions.md` is a record of what was noticed, not a form for somebody to fill
in, and nothing in it blocks a phase or a gate. See
`.claude/skills/fem-shared/asking-questions.md` for what to write instead, and
where each kind of uncertainty lands — the summary's table, the report's
per-key ripple, or the appendix as a priced decision.

Before you write an entry down, look for the answer: the design's own comments,
the module's schema, and the index you just built answer most of them. Three of
one day's twelve questions had their answer in a comment directly above the
rule that raised them.

If somebody records an answer later, after reading the report:

```bash
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q2 a "<who>"
```


A resumed run reads `state.json` and asks only what is still open, so nobody is
asked the same thing twice. Optional questions offer "Skip for now" and the run
moves on the moment it is chosen.

Then re-check per `.claude/skills/fem-shared/answer-consequences.md` — even at
P2 an answer can contradict another, and two contradictory answers are a new
question, not a coin toss.

## Output

```
02-new-design.json    screens + elements + per-file diagnostics
questions.md          ambiguity questions, numbered
```
