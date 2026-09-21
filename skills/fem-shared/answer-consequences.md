# After an answer — re-check, and ask again if something broke

Every answer is a change to the problem. The trace that was true before it may
not be true after it, and the phase that collected the answer is responsible for
finding out **before** it records itself as done.

This is not a formality. In `cms/academic-calendar` it fired twice in one run:
an answer made a free option impossible, and the re-check surfaced a decision
nobody had been asked about — which then saved 2.2 days.

## The loop

```
ask  →  record  →  RE-CHECK  →  new question?  ──yes──→  ask it
                       │                                     │
                       └──────────── no ─────────────────────┘
                                     │
                              phase records done
```

A pass that turns up nothing new ends it. Two or three passes is normal; if a
fourth is still finding things, the questions were written too coarsely — say so
rather than looping.

## The four checks, in this order

### 1 · Did the answer kill a cheaper option?

The trade-off you were relying on may no longer exist. Look at every item whose
cheap variant depended on the thing just decided.

> *Worked example.* We planned to avoid storing the academic year by deriving it
> from the year's name — zero days. Then **Q1** asked the picker to list every
> year a school has and **Q2** said a new year starts empty. An empty year has no
> events to derive itself from, so the derivation collapsed and a 6-day item
> became unavoidable. Neither answer looked expensive on its own.

Say this **loudly** when it happens: a recommendation that reverses is the most
useful sentence in the report, and the easiest one to leave out.

### 2 · Do two answers contradict each other?

Check each new answer against every answer already recorded, not just against
the code. Contradictions live in the combination, as above. If two answers
cannot both hold, do not pick one — put the conflict back to the person as a new
question naming both.

### 3 · Does the chosen option break something the other option did not?

Re-run the layers that the answer touched, for the option actually chosen:

- **L1** does the chosen shape still keep every existing field? (Postal Law 2)
- **L3** does an existing rule refuse it? A validation that reads a list, a
  check that rejects an unknown value
- **L4/L5** does it need a column or a backfill the other option did not?
- **L12** does another app read this data, and does the chosen shape still suit
  it? Check the readers the index cannot see, not only the ones it can

### 4 · Does the answer raise something nobody has been asked?

The question that was never written is the one that costs money later. After an
answer, look for an item still marked blocked on a question that does not exist,
an item whose cost now depends on something undecided, and a capability the
answer just made pointless.

> *Worked example.* An item sat blocked on a question about the year window,
> when its real question — one row per class, or a record holding many? — had
> never been written. Asking it produced a "don't build it" answer, worth 2.2
> days, because the current screen already covered the two common cases.

## After the loop

1. **Re-trace the affected items.** The `blockedOnQuestion` comes off, the
   layers are re-costed for the option chosen, `status` becomes `evidenced`.
   `record-answer.ts` prints exactly which items these are.
2. **Re-run P5.** The estimate is computed from the trace, so a trace that moved
   means a number that moved.
3. **Write what changed** into `04-impact.md`, under **"What the answers
   changed"** — the before and after numbers, and each answer that changed the
   work rather than confirming it. The validator requires this section once any
   answer exists, because a silently-improved number is indistinguishable from a
   wrong one.

## What the validator enforces

| | |
|---|---|
| An item still blocked on a question that has been answered | error — the answer never reached the trace |
| A trace older than the newest answer | error — re-trace, then re-estimate |
| Answers recorded but no "What the answers changed" section | error — say what moved and why |
| A mandatory question unanswered at gate 2 | error — ask it |

These four exist because every one of them happened by hand before it was
automated.
