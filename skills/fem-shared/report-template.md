# REPORT.md template

Ten sections, §8 P8. Keep the order — readers learn where to look.

```markdown
# <app> / <module> — Migration Impact Report

Index ref `<branch>@<sha>` · rubric <calibrated|UNCALIBRATED>

## 1 · Executive summary
  N screens · N changes · N need backend work
  P50 Xd · P90 Yd · confidence Z
  after variants: P50 Xd — saving Yd
  top five cost drivers

## 2 · Screen map            1:1 · split · merge · new · removed
## 3 · Change catalogue      every C- id, before → after, taxonomy counts
## 4 · Impact matrix         the L1-L12 grid; "none" is a value, blank is a bug
## 5 · Estimate              per change, per layer, order of operations shown
## 6 · Decisions             buckets + deltas + who approved at gate 2
## 7 · Plan                  expand → migrate → contract, shippable increments
## 8 · Risks                 including any layer reading 0 that should not
## 9 · Open questions        what is unanswered and what it blocks
## 10 · Evidence appendix    every file:line, plus the index ref
```

## SUMMARY.md template — one page, plain language

Written at P8, after REPORT.md, for non-technical readers. Rules in
`fem-report/SKILL.md`: no technical words, ranges only, about 120 lines.

**The API and database block first, then these ten sections, in this order** —
note that "Does this affect colleges?" comes BEFORE the verdict: a reader
deciding for a college needs to know the design does not serve them before they
read a day count.
`validate-outputs.ts` rejects P8 if the block is not above the verdict, or if a
section is missing or out of order — a reader should find the same thing in the
same place in every module's summary.

```markdown
# <Module> — do we take the new design?

**<Yes / Yes, with conditions / Not yet>. <the one-line reason, in API and
database terms>.** <N of M> changes are screen work. <what the rest are>.

## <⚠️ if anything changes, ✅ if nothing does> API and database changes
| | What | Why it is needed |
|---|---|---|
| **New endpoints** | n — <name them> · or **none** | <why, in one line> |
| **New tables** | n · or **none** | <why> |
| **New columns** | n — <where> · or **none** | <why> |
| **Indexes** | n · or **none** | <why> |
| **Fields added to existing APIs** | n · or **none** | <why> |
| **Removed or deprecated** | n · or **none** | <why> |

<one bold line summing it up. If nothing changes, say so — that is the answer
people want, and it belongs above the fold, not halfway down the page>

## Does this affect colleges?
<who can use the new screen, who cannot, what they get instead. If there is no
school-only assumption, say so and why>.

## The verdict
| | Changes | Likely | If it goes badly | Meaning |
|---|---|---|---|---|
| ✅ **Take it** | n | X days | Y days | <why it is cheap> |
| ⚠️ **Small ask** | n | X days | Y days | <what the server actually does> |

Plus 15% for review, testing and release. **Agreed scope: about X days likely,
Y if things go badly.**

## The choice
| Option | What users get | Cost | |
|---|---|---|---|
| **Keep what we have** | <today> | none | |
| **Build the design as drawn** | <everything> | X–Y days | |
| **Take the agreed version** | <what was approved> | **X–Y days** | ✅ |

## Recommendation
**<Take / Take with conditions / Wait>.** <two or three sentences: what makes
it cheap or expensive, and which decisions produced the saving>.

## What changes, in numbers
| | |
|---|---|
| Screen-only changes | n |
| Changes needing server work | n |
| Tests and checks only | n |
| Put off for now | n |

On screens: <replaced · kept · removed>.

## What users gain
- <plain bullet>

## What users lose
- <plain bullet> — <kept / replaced by … / accepted>

## What makes it expensive
<the one or two changes that carry the cost, and why — in user terms>.

## How sure we are
<confidence, what is still assumed or unanswered, and what would tighten it>.

## Exactly what changes
Three tables, each with a **Why** column — never only what changed:

```
### 1 · API changes
| Endpoint | Change | Type | Why | Breaks anything? | Ref |

### 2 · Database changes
| Table | Change | Type | Why | Data migration | Ref |

### 3 · Screen changes
| Screen | Change | Type | Backend needed | Ref |
```

Then **Not being done now** (with what it would cost) and **Still unanswered**.
```

## Rules

- **Ranges, never a single number.** P50 alone reads as a commitment.
- **Stamp the ref.** A number without one cannot be reproduced — that is exactly
  how the spec's own §3 came to be 66 % low.
- **A zero that is not a saving goes in Risks.** A module with no e2e suite
  estimates L10 at zero; that is missing coverage, not free.
- **Carry `Assumed` markers through.** They are the reason P90 sits where it does.
- **Keep `06-decisions.md` separate.** UX does not need the handler paths.
