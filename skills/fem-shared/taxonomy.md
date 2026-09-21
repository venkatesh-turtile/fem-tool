# Change taxonomy — the single source of truth

Spec §6. Every phase that classifies a change reads **this file**, not its own
copy. `fem.config.json` holds the same codes in machine form.

## 6.1 Codes

| Code | Type | Example | Default backend impact |
|---|---|---|---|
| `V0` | Visual-only | New button style, card layout, component swap with the same behaviour | **None.** UI e2e selectors may change — L10 still applies |
| `V1` | Relocation | Filter moved into a drawer; two tabs merged into one screen | None, unless the merged screen needs an aggregate endpoint |
| `D1` | Data display | New column, new detail field, new KPI tile | Resolved by the ladder below |
| `D2` | Query capability | Server-side sort / filter / search, pagination, date range, export | Query params, indexes, perf check, maybe async export |
| `A1` | New action | Bulk approve, duplicate, archive, send reminder | New mutation: validation, authZ, audit, idempotency, tests |
| `A2` | Workflow / state | New approval step, new status, changed lifecycle | State machine, row migration, notifications. ×1.3 |
| `R1` | Removal | Option dropped from the UI | Deprecation candidate. **Never remove server-side until every consumer is checked** |
| `X` | Cross-cutting | Design-system-wide table, global search, notification centre | Estimated **once** at programme level; modules reference the `X-NN` id |

`V0` and `V1` are tagged at P3 so P4 skips backend tracing for them. They still
cost L10, which is charged per screen regardless of whether anything server-side
changed.

## 6.2 Data-resolution ladder — `D1` and `D2`

For each data element the new screen needs, resolve **top-down and stop at the
first hit**. Every decision cites evidence: the schema field, the DB column, or
"searched X, not found".

```
1  in the current response schema              cost 0 · FE only
2  derivable client-side from returned fields  cost 0 · flag perf
3  in the DB but not exposed                   additive API · low
4  derivable server-side (join, aggregate)     handler + index · medium
5  not stored anywhere                         DB + write path + backfill · high
```

Landing on step 5 is the single strongest signal that a proposed option is
expensive. Say so at gate 2.

## 6.3 Impact layers

| Layer | Name | Examples |
|---|---|---|
| `L1` | API contract | Zod schema, route, OpenAPI; additive vs breaking |
| `L2` | Middleware / AuthZ | Permission scope, institution access, rate limits |
| `L3` | Service / handler | Business rules, validation, aggregation |
| `L4` | Database schema | Columns, tables, constraints, indexes |
| `L5` | Data migration | Backfills, transforms, index builds on large tables |
| `L6` | Async & realtime | job-server jobs, sockets, email/WhatsApp notifications |
| `L7` | Unit tests | Server and client unit tests |
| `L8` | Integration tests | `__integration__` suites |
| `L9` | E2E — API | `apps/e2e/tests/api/<module>` |
| `L10` | E2E — UI | `apps/e2e/tests/ui/<module>`, page objects in `apps/e2e/pages/<module>` |
| `L11` | Observability | Dashboards, alert rules, structured logs, traces |
| `L12` | Consumer compatibility | student/driver apps, Parentz, job-server on the same endpoints |

**Every change gets a row for every layer** — a value or an explicit `"none"`.
A blank is a bug, not a zero. This is the mechanism against §2.2's *"estimates
run 30–100 % under"*.

## 6.4 Evidence rule

Every impact claim is either:

- **Evidenced** — cites `file:line` or an `_index/` entry
- **Assumed** — states what was searched and why nothing was found

Assumed items widen the estimate range: P90 goes from ×1.3 to ×1.6, and an
unanswered ambiguity question takes it to ×2.0. Confidence is **High** with no
assumed items, **Medium** at ≤20 %, **Low** above 20 %.

Never leave a claim unmarked. An unmarked claim reads as evidenced and quietly
narrows the range.
