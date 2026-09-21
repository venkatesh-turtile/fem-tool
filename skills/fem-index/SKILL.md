---
name: fem-index
description: "Build the static codebase graph that every later phase of the Frontend Migration Impact Workflow queries — routes to components to hooks to API clients to server Zod schema to route to handler to Drizzle tables, plus tests, page objects, dashboards and cross-app consumers. Deterministic, read-only, no LLM. Run once per programme and again whenever dev moves. Use this skill when the user asks to build or rebuild the fem index, says the index is stale, asks 'which endpoints does module X call', 'what tables does this handler touch', 'who else consumes this endpoint', or before running fem-baseline or fem-run for the first time."
---

# fem-index — P0

Builds the graph every later phase reads. **This is the only skill that reads
application source code.** Everything downstream reads the JSON it emits, which
is what keeps the workflow deterministic (NFR-2) and keeps the model out of the
repo (§3.2).

## Parameters

| Parameter | Required | Default | Notes |
|---|---|---|---|
| `--app <name>` | no | all apps | `cms`, `student-cms`, `admin`. Scope a run while iterating |
| `--check` | no | off | Print the acceptance summary and exit non-zero on failure. Does not write files |

## Run

```bash
bun .claude/skills/fem-index/scripts/build-index.ts
bun .claude/skills/fem-index/scripts/build-index.ts --app cms
bun .claude/skills/fem-index/scripts/build-index.ts --check
```

## Steps

1. **Read `fem.config.json`** for app roots, server conventions, e2e paths and
   the acceptance thresholds. Never hard-code a path in the script.
2. **Pages.** Walk `<app>/app/**/page.tsx`. The route is the directory path;
   the module is the first non-dynamic segment. Assign `S-<app>-NNN` after
   sorting, so IDs are stable across runs.
3. **Bindings.** Walk `<app>/modules/**`, match
   `import { … } from "@server/modules/…"`. Record app, module, client file,
   server path and the imported symbols. Components and hooks import schemas
   too — do not restrict this to `api/`.
4. **Endpoints.** For each distinct server feature directory, scan **every**
   `.ts` in it for `createRoute({ … method … path … })`. Do not assume which
   file holds it — see Conventions below. Record methods, paths, route count,
   handler files and the Drizzle tables those handlers import.
5. **Consumers.** For every app in `consumerApps`, record which server module
   groups it imports. A group referenced by more than one app is an L12 risk.
6. **Tests.** Server unit, server integration, per-app frontend unit, e2e API
   specs, e2e UI specs, e2e page objects.
7. **Observability.** List dashboard and alert sources. When none are found,
   record `NO COVERAGE` explicitly — absence is a finding, not a blank.
8. **Write** `docs/fe-migration/_index/*.json`, each stamped with the git ref.

## Conventions — there are three, not two

The spec names two and describes one of them misleadingly. `createRoute` does
not live in the same file across them:

| Convention | `createRoute` in | Handlers |
|---|---|---|
| feature-folder | `route.ts` | `handler.ts`, or `handlers/` |
| **suffixed** | **`*.schema.ts`** | `*.handlers.ts` |
| routes-plural | `routes.ts` | `handlers.ts` |

In the suffixed convention `*.routes.ts` only wires definitions to handlers with
`.openapi()`. Grepping `method:` there finds nothing and the index sits at
**55 %**. Scanning every `.ts` in the directory gives **98.8 %**.

A directory with no `createRoute` anywhere is shared types. Record it as
`shared-schema` and exclude it from the resolution denominator — it is not a
failed endpoint.

## Module names are route prefixes, never substrings

`*timetable*` matches 8 CMS pages spanning **four** modules — `timetable`,
`nexus`, `academic-structure` and `hrms`. Scoped to the `/timetable` route
prefix it is **2**. A substring match inflates every layer of the report and can
pull an unrelated module's risk multiplier into the estimate.

## Output

```
docs/fe-migration/_index/
  pages.json               route → file → module
  frontend-bindings.json   client file → server schema path → symbols
  endpoints.json           server dir → convention, methods, paths, handlers, tables
  consumers.json           server module group → apps that import it   (L12)
  tests.json               unit, integration, e2e specs, page objects
  observability.json       dashboard sources, or NO COVERAGE
  summary.json             counts + acceptance results
```

Every file carries:

```json
"ref": { "branch": "dev", "sha": "334475e81", "dirty": false }
```

**Always report the ref when quoting a number from the index.** §3 of the spec
was scanned without one: its figures came from `main`, and `dev` has 393 pages
against the 237 quoted — a 66 % undercount on the number the programme is sized
against.

## Acceptance — §8 P0

| | Threshold | Measured |
|---|---|---|
| Binding resolution | ≥ 95 % | **98.8 %** CMS-wide · **100 %** on `timetable` |
| Identical across runs | byte-identical | **pass** |
| Runtime | < 2 min | **1.0 s** |

Runtime is printed to stdout and deliberately **not** persisted — it varies per
run and would break NFR-2.

Check without writing:

```bash
bun .claude/skills/fem-index/scripts/build-index.ts --check
```

## Constraints

- **NFR-1** Read-only. Writes only under `docs/fe-migration/`.
- **NFR-2** Sort every array; no timestamps; no `Map` iteration order in output.
- **NFR-7** No secrets in output. Paths only, never file contents.

## Known gap

`consumers.json` finds cross-app use **only** where an app imports a server Zod
schema. `apps/student` has zero such imports, so an Expo consumer is invisible
here. Treat a `none` result for L12 as *"no web consumer"*, not *"no consumer"*,
until a registry, a mobile-repo scan, or production route telemetry covers it.
