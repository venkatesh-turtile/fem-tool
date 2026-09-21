---
name: fem-impact
description: "Trace every non-visual change item down through all twelve backend layers — API contract, middleware and authZ, handler, database schema, data migration, async and realtime, unit tests, integration tests, E2E API, E2E UI, observability, and consumer compatibility — citing a file path for every claim or marking it Assumed. Applies the data-resolution ladder to data and query changes. Phase P4, one subagent per change item."
---

# fem-impact — P4

The phase that turns differences into backend work.

## Steps

1. **Skip `V0` and `V1`** for backend tracing. Record `L10` for them and nothing
   else.
2. **For `D1` and `D2`, walk the resolution ladder** — top down, stop at the
   first hit, cite evidence at each step:

   ```
   1  in the current response schema              cost 0 · FE only
   2  derivable client-side from returned fields  cost 0 · flag perf
   3  in the DB but not exposed                   additive API · low
   4  derivable server-side (join, aggregate)     handler + index · medium
   5  not stored anywhere                         DB + write path + backfill · high
   ```

   Landing on step 5 is the strongest signal a proposed option is expensive.
   Say so at gate 2.

3. **Walk the index**, never the repo:
   `binding → endpoint → handler → tables → tests → dashboards → consumers`.
4. **Classify every API change additive or breaking**, and name the affected
   consumers. With no feature flags in this repo (§3), a breaking change forces
   expand → migrate → contract.
5. **For `D2`, check pagination, sort and filter against Postal Law 4**, and
   name any missing index as `table + columns` — not "add an index".
6. **For `A1` and `A2`,** identify the authZ scope, audit trail, idempotency key
   and any async or notification work.
7. **Fill all twelve layers for every change** — a value or an explicit
   `"none"`. §8 acceptance is **100 % coverage**. A blank is a bug, not a zero.
8. **Mark every claim** Evidenced with `file:line`, or Assumed with what was
   searched (§6.4). Assumed takes P90 from ×1.3 to ×1.6.
9. **Name the rubric keys** each layer needs, in `impact.LN.rubric`, so
   `compute-estimate.ts` can price it deterministically.

## Institution shape — required for every module

**Ask of every design: does this still work for a college?** The answer is not
optional and does not belong only in prose — it is a finding with evidence,
like any other.

The vocabulary that signals a school-only design: Level · Grade · Section ·
"Class 1" · Day care/Play school/Primary/Secondary/Senior secondary · a fixed
three-tier hierarchy · one academic year with no terms or semesters.

Where the index answers it:

| Evidence | What it tells you |
|---|---|
| `EP-a1d674` academic-node **templates** | the hierarchy is configurable per institution — a fixed shape removes that |
| `public/programmes` + `MarketingProgrammesTreeResponseSchema` | the public site publishes **programmes**, not grades |
| `exam-module/reports/university-excel` | a university-specific report format exists |
| `cms/exam/exam-program-completion(-memos)` | programme completion is a modelled concept |
| `admissions` intake cycles / academic years | admission shapes that are not school terms |

Record the outcome as **either**:
- a change item of its own when the design removes or constrains the shape
  (e.g. an `R1` for template removal), **or**
- an explicit line in the affected item's `L12` — colleges are a consumer
  group like any other — plus a question.

**Never leave it silent.** "The design only shows grades" reads as a UI detail
and is actually a decision about which customers can use the screen.

## Bounded context — §7.1.6

**One subagent per change item**, given only that item plus its slice of the
index. Never load the whole index into one context. This is what keeps fee,
finance and HRMS from overflowing.

## L12 honesty

`consumers.json` finds cross-app use **only** where an app imports a server Zod
schema. `apps/student` imports none. So:

- `none` means **no web consumer**, not **no consumer**
- Two modules sharing a name may share no code. Compare **full module paths** —
  CMS `timetable` and student `timetable` are different server modules, and
  treating them as one would wrongly apply the ×1.5 breaking-contract multiplier

## The plain-words verdict — required in `04-impact.md`

**The person running this workflow may not be an engineer.** P4 is the first
moment the facts exist, so `04-impact.md` opens with a section titled
**"What this needs from the server, in plain words"**, written as sentences, in
three buckets. No endpoint paths, no table names, no change ids in it.

| Bucket | Means |
|---|---|
| **Needs a server change** | something must be built or changed before the screen can work |
| **Not in the CMS today** | the information is stored nowhere, so there is nowhere to save what the screen asks for |
| **Extra we must handle** | it works, but something has to be done around it — seeding values, a rule the save must obey, existing data to migrate |

Each item says what the screen cannot do without it, and — where one exists —
**the cheaper alternative that makes it disappear**. The shape:

```markdown
**Needs a server change:** somewhere to keep the academic year's start and end
dates. Nothing in the CMS stores them today, and the screen cannot draw the
chart or the day counts without them. *Or we work them out from the year's name
and this disappears.*

**Not in the CMS today:** an event that covers several classes at once. Today an
event belongs to one class. *We can save it as one event per class and show them
as one row.*

**Extra we must handle:** the five event types have to exist for each school
before anything can be saved, otherwise every save is refused.
```

If a bucket is empty, say so in one line — *"Nothing needs a server change"* is
the most useful sentence this workflow can produce, and it must be visible
without reading a table.

### The same three buckets go into `questions.md`

The person running this workflow reads `questions.md` because it is the file
they have to answer. So P4 writes the verdict **at the top of that file too**,
under **"What this needs from the server"**, above the numbered questions —
same sentences, no identifiers.

That way the reader meets the answer where they are already looking, instead of
having to open an engineering document to find out whether the design costs
backend work.

The sentences therefore appear in three places, unchanged:

| File | Why |
|---|---|
| `04-impact.md` | where they are written, with the evidence beneath them |
| `questions.md` | where the reader is already answering |
| `SUMMARY.md` | the document that gets circulated |

Never reword them per file. One sentence, three homes — if it changes in one
place and not the others, the reader learns not to trust any of them.

## Output

`04-impact.json` — validates against
`.claude/skills/fem-shared/schemas/change-item.schema.json`, which requires all
twelve layers to be present — plus a readable `04-impact.md`.
