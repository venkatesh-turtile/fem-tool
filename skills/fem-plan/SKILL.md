---
name: fem-plan
description: "Sequence the accepted changes for a redesigned module into a safe migration — expand with additive schema, API and indexes, then migrate the front end screen by screen, then contract by removing deprecated fields once every consumer has moved. Dependency-sorted into shippable increments, with test and observability additions per increment and a dev to staging to demo to prod rollout. Phase P7."
---

# fem-plan — P7

## Why expand → migrate → contract is mandatory here

§3 found **no feature-flag framework** in this repo. Backend changes cannot be
hidden behind a flag, so the only safe path is additive-first. This is not a
preference; it is the consequence of a fact about the codebase.

## Steps

1. **EXPAND** — everything additive, shippable alone, breaking nothing:
   nullable columns, new endpoints alongside old, new query params, indexes
   built online, backfills, new permission scopes granted to nobody yet.
2. **MIGRATE** — switch the front end screen by screen. Each screen is its own
   increment and its own rollback unit.
3. **CONTRACT** — remove deprecated fields and endpoints, **only** once every
   consumer has moved. Name the consumers and how you will know.
4. **Dependency-sort** into increments. An increment is shippable if it leaves
   every consumer working.
5. **Flag multi-app releases explicitly.** If L12 named any consumer, the
   contract step is a coordinated release, not a single deploy. Say which apps
   and in what order.
6. **Per increment**, state the tests to add or update and any observability —
   §3 found alert rules cover platform health only, so a new critical flow may
   need a module-level alert that does not exist yet.
7. **Rollout** dev → staging → demo → prod.

## Honour the Postal Laws

`CLAUDE.md` — contract fidelity, versioning, pagination, observability. They are
hard rules here, not guidance.

## Output

`07-plan.md` — three phases, increments in order, per-increment tests and
observability, rollout, and every coordination point named.
