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
3. **Offer the choices**, each with its consequence, so the answer is a pick
   rather than an essay:

```markdown
### Q2 · An event that covers several classes — **Mandatory**

Today an event belongs to one class, and the new screen lets one event name
several.

- **a)** Save it as one event per class and show them as one row — quickest, and
  nothing changes underneath
- **b)** Build it properly so one event holds many classes — tidier, a few days more
- **c)** Keep one class per event and drop the multi-select from the design
```

4. **No identifiers.** No endpoint paths, table or column names, or file names.
   If the developer needs them, they are in `04-impact.md`.
5. **One question per decision.** If two things can be answered separately, they
   are two questions.
6. **Number every question as its own `### Qn ·` heading** and mark it
   **Mandatory** or **Optional**. An answer is filed under its heading, so a
   question without one cannot be answered.

Later phases append to this file in the same style. An unanswered question
doubles the bad-case estimate for every item that depends on it, so a question
nobody can understand is a question nobody answers — and the estimate stays
wide for the wrong reason.

## Ask them — do not leave a file and hope

Writing the file is half the job. **Ask every question this phase raised — the
optional ones too — in the terminal before P2 is recorded**, with `AskUserQuestion`: one call per question, the
lettered choices as the options, "Leave it open" always available, and the
person's own answer — the built-in "Other" — treated as the best answer of all.

The convention is `.claude/skills/fem-shared/asking-questions.md`: which
questions are mandatory, how to phrase the call, what order to ask in, and how
an answer is recorded. Read it before asking.

Record each answer as it arrives:

```bash
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q2 a "<who>"
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q2 \
  --own "one row per class, but only for exams" "<who>"
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
