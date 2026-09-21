# Asking the questions — the single source of truth

Spec §8 P2 and §9.3. Every phase that raises a question reads **this file**.

A question this workflow cannot answer is not a note for later. It is a decision
the person running the workflow has to make, and an unanswered one takes that
change's bad case to **twice** its likely case. So the workflow **asks, in the
terminal, one question at a time**, rather than leaving a file for somebody to
find.

## Rule 1 · The phase that raises a question asks it

Not the next phase, not gate 2, not the report. The phase that discovered it,
before it records itself as done.

| Phase | Asks about |
|---|---|
| **P2** design intake | what the design does not say — an undrawn empty state, a button with no stated effect |
| **P3** screen map | what the comparison raises — whether the design still fits a college, a mapping that could be read two ways, a capability that looks removed |
| **P4** impact | what tracing turns up — data stored nowhere, an option whose cost depends on an answer, a consumer that might care |
| **P6** trade-off | anything still open, before the sheet is written |

A question asked three phases after it was raised has already corrupted
everything in between: P3 catalogues a change on a guess, P4 traces the guess,
P5 prices the guess. Asking costs one exchange.

## Rule 2 · Every kind of question goes through the terminal

Mandatory, optional, a factual check at a gate, a choice between two readings of
a drawing — all of them, with `AskUserQuestion`. Never present a question as
prose the person is expected to answer in prose, and never write one into a file
without also asking it.

| | Means | If not answered |
|---|---|---|
| **Mandatory** | at least one change item is blocked on it, **or** the answer changes what gets built rather than how it looks | gate 2 is refused |
| **Optional** | the answer changes wording, ordering or a default | recorded as open, the run continues |

Deciding is not a judgement call: if a change item carries
`impact.LN.blockedOnQuestion`, the question is mandatory. Otherwise ask whether
two answers would produce different code. If yes, mandatory.

Optional questions are asked too — they are cheap, and an answer now is better
than a paragraph in a report nobody acts on. Offer **"Skip for now"** on those,
and move on the moment it is chosen.

## Rule 3 · How to ask

One `AskUserQuestion` call per question, so the person can think about one thing
and move on:

- `header` — three or four words: "Year window", "Event types"
- `question` — what the screen does, never what the code does. Include the
  number that makes it real: *"42 of 55 events would become unreachable"*
- `options` — the lettered choices from `questions.md`, the one you would
  recommend first and marked "(Recommended)", each with its consequence in the
  `description`
- last option — **"Leave it open"** (mandatory) or **"Skip for now"** (optional),
  with the consequence stated

Ask them in the order they cost money — the largest P50 first, so if someone
stops halfway the expensive decisions are the ones that got made.

### Their own answer always wins

`AskUserQuestion` offers **"Other"** on every question, and that is not a
fallback — it is the most valuable answer this workflow can get. The options are
our guesses; the person answering runs the business and knows things the code
does not.

Never imply the choices are exhaustive, never re-ask because the answer did not
fit a letter, and never round their words to the nearest option. Record what
they actually said:

```bash
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q2 \
  --own "one row per class, but only for exams" "<who>"
```

It is filed as **Answer (their own)** and counts as answered exactly like a
lettered choice. If their answer implies work none of the options priced, that is
a new trace and a new number — say so rather than reusing the old one.

**An answer that is really a question** — *"if nothing is selected everyone sees
it, correct?"* — is answered with evidence from the code, and then the original
question is asked again, reworded to include what was just established. That
exchange is the workflow working, not a detour.

## Rule 4 · Record every answer

```bash
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q3 b "<who>"
bun .claude/skills/fem-run/scripts/record-answer.ts <app> <module> Q4 --open "<who>"
```

The script writes it into `questions.md` under that question, stamps who and
when, and mirrors it into `state.json` so a resumed run asks only what is still
open. It prints the change items that named the question, because an answer is
not a re-trace.

## Rule 5 · Every answer is re-checked before the run moves on

An answer can break something that was sound before it. Two answers that are
each reasonable can be impossible together. And an answer can raise a question
nobody has asked yet.

So every answer is followed by the check in
`.claude/skills/fem-shared/answer-consequences.md`, which loops: re-check, ask
what it turns up, re-check again, until a pass finds nothing new. **The phase
does not record itself as done until that loop is quiet.**

## The shape in `questions.md`

```markdown
### Q2 · What should "+ Add academic year" create? — **Mandatory**

The design has a button to add a year, and does not say what a new one contains.

- **a)** An empty year — the school fills it in
- **b)** A copy of last year's holidays and exams, which they then edit
- **c)** Nothing yet — hide the button until we decide

**Answer (b):** a copy of last year, which they then edit.
*someone@example.com · 2026-09-21*
```

An unanswered mandatory question carries `**Mandatory**` and no answer line. One
deliberately left open carries `**Left open:**` with the same stamp — that is an
answer too, and it is honest about the consequence.

## The rules that make this work

1. **No identifiers.** No endpoint paths, table or column names, or file names —
   in the file or in the terminal prompt. The developer's version is in
   `04-impact.md`.
2. **One question per decision.** If two things can be answered separately, they
   are two questions and two calls.
3. **Never guess and move on.** A guess becomes a number, and a number becomes a
   commitment.
4. **Never ask twice.** `state.json` holds the answers; a resumed run asks only
   what is still open.
5. **Gate 2 is refused** while a mandatory question is neither answered nor
   explicitly left open. The validator enforces it.
