#!/usr/bin/env bun
/**
 * fem-run — output validator. Checks a module's phase outputs against the
 * schemas in fem-shared/schemas, plus the fem rules no schema can express.
 *
 * It exists because two real errors got through three runs unnoticed: a
 * compatibility check and an integration test each vanished when gate 2
 * approved a cheaper variant, and the layer that claimed to be "covered by"
 * them still pointed at an owner that no longer priced anything. Rule F below
 * is that check.
 *
 *   validate-outputs.ts <app> <module> [P1|P2|P4|P5]
 * exit 0 clean (warnings allowed) · 1 violations · 2 usage
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const SCHEMA_DIR = join(import.meta.dir, "..", "..", "fem-shared", "schemas");
const [app, moduleName, onlyPhase] = process.argv.slice(2);

// A module may be a route prefix — "hrms/admin/leaves" — so that a design
// covering one part of a large module can be analysed on its own. Folders are
// named flat, so a run is one directory and the archive numbering keeps
// working.
const moduleDir = moduleName.replace(/\//g, "-");
if (!(app && moduleName)) {
	console.error("usage: validate-outputs.ts <app> <module> [P1|P2|P4|P5]");
	process.exit(2);
}
const dir = join(ROOT, CFG.paths.output, app, moduleDir);

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

// ── the subset of JSON Schema these documents actually use ───────────────────
type Schema = Record<string, unknown>;
const schemaCache = new Map<string, Schema>();
function loadSchema(file: string): Schema {
	const hit = schemaCache.get(file);
	if (hit) {
		return hit;
	}
	const s = JSON.parse(readFileSync(join(SCHEMA_DIR, file), "utf8"));
	schemaCache.set(file, s);
	return s;
}

function typeOf(v: unknown): string {
	if (v === null) {
		return "null";
	}
	return Array.isArray(v) ? "array" : typeof v;
}

function validate(value: unknown, schema: Schema, path: string): void {
	if (typeof schema.$ref === "string") {
		validate(value, loadSchema(schema.$ref), path);
		return;
	}
	if (schema.enum && !(schema.enum as unknown[]).includes(value as never)) {
		err(
			`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`
		);
		return;
	}
	if (schema.type) {
		const want = Array.isArray(schema.type) ? schema.type : [schema.type];
		const got = typeOf(value);
		const integerOk =
			want.includes("integer") && got === "number" && Number.isInteger(value);
		if (!(want.includes(got) || integerOk)) {
			err(`${path}: expected ${want.join("|")}, got ${got}`);
			return;
		}
	}
	if (typeof value === "string") {
		if (
			typeof schema.pattern === "string" &&
			!new RegExp(schema.pattern).test(value)
		) {
			err(`${path}: "${value}" does not match ${schema.pattern}`);
		}
		if (
			typeof schema.minLength === "number" &&
			value.length < schema.minLength
		) {
			err(`${path}: shorter than minLength ${schema.minLength}`);
		}
	}
	if (Array.isArray(value) && schema.items) {
		value.forEach((v, i) => {
			validate(v, schema.items as Schema, `${path}[${i}]`);
		});
	}
	if (typeOf(value) === "object") {
		const obj = value as Record<string, unknown>;
		for (const key of (schema.required as string[]) ?? []) {
			if (!(key in obj)) {
				err(`${path}: missing required "${key}"`);
			}
		}
		const props = (schema.properties as Record<string, Schema>) ?? {};
		const patterns = Object.entries(
			(schema.patternProperties as Record<string, Schema>) ?? {}
		);
		for (const [key, v] of Object.entries(obj)) {
			if (props[key]) {
				validate(v, props[key], `${path}.${key}`);
				continue;
			}
			const hit = patterns.find(([re]) => new RegExp(re).test(key));
			if (hit) {
				validate(v, hit[1], `${path}.${key}`);
				continue;
			}
			if (schema.additionalProperties === false) {
				err(`${path}: unexpected property "${key}" (schema forbids it)`);
			}
		}
	}
}

const read = (file: string) =>
	JSON.parse(readFileSync(join(dir, file), "utf8"));
const want = (phase: string) => !onlyPhase || onlyPhase === phase;
const LAYERS = Array.from({ length: 12 }, (_, i) => `L${i + 1}`);

// ── P1 · baseline ────────────────────────────────────────────────────────────
if (want("P1") && existsSync(join(dir, "01-baseline.json"))) {
	validate(
		read("01-baseline.json").spec,
		loadSchema("screen-spec.schema.json"),
		"01-baseline.spec"
	);
}

// ── P2 · design intake ───────────────────────────────────────────────────────
if (want("P2") && existsSync(join(dir, "02-new-design.json"))) {
	const doc = read("02-new-design.json");
	validate(doc, loadSchema("screen-spec.schema.json"), "02-new-design");
	for (const s of doc.screens ?? []) {
		if (s.parseable === false) {
			err(
				`02-new-design: screen "${s.file}" is UNPARSEABLE — P3 must not run on it (rule 2)`
			);
		}
	}
}

// ── P4 · impact ──────────────────────────────────────────────────────────────
// The screens that actually exist, from the two specs that define them.
const knownScreens = new Set<string>();
for (const [file, at] of [
	["01-baseline.json", join(dir, "01-baseline.json")],
	["02-new-design.json", join(dir, "02-new-design.json")],
] as [string, string][]) {
	if (!existsSync(at)) {
		continue;
	}
	const doc = JSON.parse(readFileSync(at, "utf8"));
	const screens = doc.spec?.screens ?? doc.screens ?? [];
	for (const sc of screens) {
		if (sc?.id) {
			knownScreens.add(sc.id as string);
		}
	}
	void file;
}

if (want("P4") && existsSync(join(dir, "04-impact.json"))) {
	const doc = read("04-impact.json");
	validate(doc, loadSchema("impact.schema.json"), "04-impact");
	const changes: Record<string, never>[] = doc.changes ?? [];
	const byId = new Map(
		changes.map((c: Record<string, never>) => [c.id as string, c])
	);

	// N · the design hid columns and nobody said what happened to them.
	// The parser reads markup, not styles, so a hidden column arrives in the
	// element list looking like any other. Two were traced as new database columns
	// on cms/academic-structure before a human noticed they were never on screen.
	if (want("P4") && existsSync(join(dir, "02-new-design.json"))) {
		const design = JSON.parse(
			readFileSync(join(dir, "02-new-design.json"), "utf8")
		);
		const hiddenCols = (design.screens ?? []).flatMap(
			(sc: { hiddenByCss?: { columnIndex: number | null }[] }) =>
				(sc.hiddenByCss ?? []).filter((x) => x.columnIndex !== null)
		);
		if (hiddenCols.length > 0) {
			const impactMd = join(dir, "04-impact.md");
			const said =
				existsSync(impactMd) &&
				/hidden|not shown|off the page/i.test(readFileSync(impactMd, "utf8"));
			if (!said) {
				err(
					`02-new-design.json reports ${hiddenCols.length} column(s) the design declares but hides, and 04-impact.md never mentions them — say which are out of scope and why, or a hidden column gets priced as work`
				);
			}
		}
	}

	// A · P3 catalogued more than P4 traced
	if (
		typeof doc.catalogueSize === "number" &&
		changes.length < doc.catalogueSize
	) {
		err(
			`04-impact: P3 catalogued ${doc.catalogueSize} changes, P4 traced ${changes.length}`
		);
	}
	for (const c of changes) {
		const id = c.id as string;
		const impact = c.impact as Record<string, Record<string, unknown>>;
		// B · V0/V1 still cost L10 (§6.1) — caught here, not only in the estimate
		const kind = c.type as string;
		if (
			(kind === "V0" || kind === "V1") &&
			String(impact.L10?.change ?? "none").startsWith("none")
		) {
			err(
				`${id}: ${kind} carries no L10 — visual-only changes still need an e2e spec (§6.1)`
			);
		}
		// M · a change that points at a screen nobody has seen.
		// Screen ids are content hashes, so one typed from memory looks exactly
		// like one that was read. This was written after a whole trace was
		// filed against an invented id and every other check passed.
		for (const side of ["old", "new"] as const) {
			const sid = (c.screen as Record<string, string | null>)?.[side];
			if (sid && !knownScreens.has(sid)) {
				err(
					`${id}: screen.${side} is "${sid}", which is not a screen in ${side === "old" ? "01-baseline.json" : "02-new-design.json"}`
				);
			}
		}
		// O · a new endpoint priced without looking for the one that exists.
		// "Save the whole structure in one press" was priced at 7.4 days — a
		// third of its module — against an endpoint that already took the whole
		// structure, ordered it by depth and wrote it in a transaction, and was
		// already being called by the screen next door. Nothing had required
		// anyone to look.
		const NEW_ENDPOINT_KEYS = [
			"new_mutation_endpoint",
			"new_read_endpoint_paginated",
		];
		for (const L of LAYERS) {
			const layer = impact[L];
			const prices = ((layer?.rubric as string[]) ?? []).some((k) =>
				NEW_ENDPOINT_KEYS.includes(k)
			);
			if (!prices) {
				continue;
			}
			const looked =
				((layer?.searchedEndpoints as string[]) ?? []).length > 0 ||
				Boolean(layer?.searched);
			if (!looked) {
				err(
					`${id} ${L}: prices a new endpoint without saying what already exists. List the endpoints that touch the same tables in "searchedEndpoints" and say why none fits — \`bun .claude/skills/fem-index/scripts/endpoints-for-table.ts <table>\``
				);
			}
		}
		// L · "nobody else uses this" written for free.
		// A change that alters the contract, the handler or the schema can break
		// a reader. Saying none is allowed; saying it without having looked is
		// not — the index's table-readers answers this mechanically now, so
		// there is no excuse for an unevidenced none.
		const touchesData = ["L1", "L3", "L4"].some(
			(L) => !String(impact[L]?.change ?? "none").startsWith("none")
		);
		const l12 = impact.L12 ?? {};
		const l12None = String(l12.change ?? "none").startsWith("none");
		const l12Justified =
			((l12.evidence as string[]) ?? []).length > 0 || Boolean(l12.searched);
		if (touchesData && l12None && !l12Justified) {
			err(
				`${id} L12: says no consumer is affected, but cites nothing. Name the modules that read the tables this change touches (_index/table-readers.json), or say what was searched`
			);
		}
		// C · a rubric key must exist in fem.config.json for that layer
		for (const L of LAYERS) {
			for (const key of (impact[L]?.rubric as string[]) ?? []) {
				if (!(key in (CFG.baseSizes[L] ?? {}))) {
					err(
						`${id} ${L}: rubric key "${key}" is not in fem.config.json baseSizes.${L}`
					);
				}
			}
		}
		// D · §6.4 — an Assumed claim must say what was searched
		for (const L of LAYERS) {
			if (impact[L]?.assumed === true && !impact[L]?.searched) {
				err(`${id} ${L}: assumed=true without "searched" (§6.4)`);
			}
		}
		// E · status must reflect the layers
		const blocked = LAYERS.some((L) => impact[L]?.blockedOnQuestion);
		const assumed = LAYERS.some((L) => impact[L]?.assumed === true);
		const status = c.status as string;
		if (blocked && status !== "blocked-on-question") {
			err(`${id}: a layer is blocked on a question but status is "${status}"`);
		}
		if (!blocked && assumed && status !== "assumed") {
			warn(`${id}: has assumed layers but status is "${status}"`);
		}
		// F · fold integrity — the check that would have caught both real errors
		for (const L of LAYERS) {
			const text = String(impact[L]?.change ?? "");
			// A layer that is itself "none" defers no cost — a mention of another
			// change there is a cross-reference, not a fold.
			if (text.trim().toLowerCase().startsWith("none")) {
				continue;
			}
			for (const m of text.matchAll(
				/(?:covered by|priced in)\s+(C-[a-z0-9-]+-\d{3})/gi
			)) {
				const ownerId = m[1];
				if (ownerId === id) {
					continue;
				}
				const owner = byId.get(ownerId) as Record<string, never> | undefined;
				if (!owner) {
					err(
						`${id} ${L}: folds into ${ownerId}, which is not in this catalogue`
					);
					continue;
				}
				const ownerLayer = (
					owner.impact as Record<string, Record<string, unknown>>
				)[L];
				const ownerText = String(ownerLayer?.change ?? "");
				const ownerRubric = (ownerLayer?.rubric as string[]) ?? [];
				if (ownerText.trim().toLowerCase().startsWith("none")) {
					err(
						`${id} ${L}: says the cost is covered by ${ownerId} ${L}, but ${ownerId} ${L} is "none" — the cost was dropped`
					);
				} else if (ownerRubric.length === 0) {
					warn(
						`${id} ${L}: folds into ${ownerId} ${L}, which prices nothing (fine for a deletion, wrong otherwise)`
					);
				}
			}
		}
	}
}

// ── P8 · the two documents, in the shape every module must share ────────────
// A reader should find the same thing in the same place in every summary, so
// the ten sections are fixed and ordered. The college question is one of them:
// every design so far assumed a school, while the product serves programme-
// shaped institutions through templates, public/programmes and the university
// exam reports.
const SUMMARY_SECTIONS = [
	// Who the design is for comes before what it costs: a reader deciding for a
	// college needs to know it does not serve them before they read a day count.
	"## Does this affect colleges?",
	"## The verdict",
	"## The choice",
	"## Recommendation",
	"## What changes, in numbers",
	"## What users gain",
	"## What users lose",
	"## What makes it expensive",
	"## How sure we are",
	"## Exactly what changes",
];
// K · the three sentences drifted apart.
// They are written once and carried into three files unchanged, so a reader
// meets the same answer wherever they look. Re-tracing after an answer usually
// rewrites one of them, and rewriting one of three is how a summary ends up
// promising a free option the impact document has already ruled out.
if (want("P8")) {
	const said = new Map<string, string>();
	for (const file of ["04-impact.md", "questions.md", "SUMMARY.md"]) {
		const at = join(dir, file);
		if (!existsSync(at)) {
			continue;
		}
		const text = readFileSync(at, "utf8");
		const hit = /\*\*Needs a server change:\*\*([\s\S]*?)\n\n/.exec(text);
		if (hit?.[1]) {
			said.set(file, hit[1].replace(/\s+/g, " ").trim());
		}
	}
	const distinct = new Set(said.values());
	if (said.size > 1 && distinct.size > 1) {
		err(
			`the "Needs a server change" sentence differs between ${[...said.keys()].join(", ")} — one sentence, three homes. If it changed, change it everywhere`
		);
	}
}

// H, I, J · an answer that never reached the trace.
// Each of these happened by hand before it was automated: an item left marked
// blocked on a question that had been answered; a trace older than the answers
// it was supposed to reflect; and a number that silently improved with nothing
// saying why. See fem-shared/answer-consequences.md.
if (want("P5") || want("P6") || want("P8")) {
	const statePath = join(dir, "state.json");
	const impactPath = join(dir, "04-impact.json");
	if (existsSync(statePath) && existsSync(impactPath)) {
		const state = JSON.parse(readFileSync(statePath, "utf8"));
		const answers: Record<string, { at?: string; choice?: string }> =
			state.answers ?? {};
		const answered = new Set(
			Object.entries(answers)
				.filter(([, a]) => a.choice !== "open")
				.map(([q]) => q)
		);
		if (answered.size > 0) {
			const impact = JSON.parse(readFileSync(impactPath, "utf8"));
			// H · answered, but the item still says it is waiting
			for (const c of impact.changes ?? []) {
				for (const [L, layer] of Object.entries(
					(c.impact ?? {}) as Record<string, { blockedOnQuestion?: string }>
				)) {
					const q = layer?.blockedOnQuestion;
					if (q && answered.has(q)) {
						err(
							`${c.id} ${L}: blocked on ${q}, which has been answered — re-trace the item with the answer in hand, then re-run P5`
						);
					}
				}
			}
			// I · the trace predates the answers it should reflect.
			// Recorded times, not file mtimes: a copy or a checkout rewrites an
			// mtime and would quietly disarm this.
			const tracedAt = state.phaseTimes?.P4
				? Date.parse(state.phaseTimes.P4)
				: Number.NaN;
			if (!Number.isNaN(tracedAt)) {
				for (const [q, a] of Object.entries(answers)) {
					const at = a.at ? Date.parse(a.at) : Number.NaN;
					if (!Number.isNaN(at) && at > tracedAt) {
						err(
							`the answer to ${q} was given after P4 was recorded — the trace cannot reflect it. Re-trace the items that named it, re-run P5, then record P4 again`
						);
						break;
					}
				}
			}
			// J · a number that moved, with nothing saying why
			const impactMd = join(dir, "04-impact.md");
			if (
				existsSync(impactMd) &&
				!readFileSync(impactMd, "utf8").includes("What the answers changed")
			) {
				err(
					'04-impact.md: answers were recorded but there is no "What the answers changed" section — say what moved, and which answers changed the work rather than confirming it'
				);
			}
		}
	}
}

// G is gone. It refused a decisions sheet while a question was unanswered,
// which assumed the workflow's job was to extract answers. It is not: the job
// is to compare a design with what exists and price the difference. An open
// point is now reported in the sheet with what each way would cost, and the
// person decides with the evidence in front of them rather than in a prompt.

// H, I, J · an answer that never reached the trace.
// Each of these happened by hand before it was automated: an item left marked
// blocked on a question that had been answered; a trace older than the answers
// it was supposed to reflect; and a number that silently improved with nothing
// saying why. See fem-shared/answer-consequences.md.
if (want("P5") || want("P6") || want("P8")) {
	const statePath = join(dir, "state.json");
	const impactPath = join(dir, "04-impact.json");
	if (existsSync(statePath) && existsSync(impactPath)) {
		const state = JSON.parse(readFileSync(statePath, "utf8"));
		const answers: Record<string, { at?: string; choice?: string }> =
			state.answers ?? {};
		const answered = new Set(
			Object.entries(answers)
				.filter(([, a]) => a.choice !== "open")
				.map(([q]) => q)
		);
		if (answered.size > 0) {
			const impact = JSON.parse(readFileSync(impactPath, "utf8"));
			// H · answered, but the item still says it is waiting
			for (const c of impact.changes ?? []) {
				for (const [L, layer] of Object.entries(
					(c.impact ?? {}) as Record<string, { blockedOnQuestion?: string }>
				)) {
					const q = layer?.blockedOnQuestion;
					if (q && answered.has(q)) {
						err(
							`${c.id} ${L}: blocked on ${q}, which has been answered — re-trace the item with the answer in hand, then re-run P5`
						);
					}
				}
			}
			// I · the trace predates the answers it should reflect.
			// Recorded times, not file mtimes: a copy or a checkout rewrites an
			// mtime and would quietly disarm this.
			const tracedAt = state.phaseTimes?.P4
				? Date.parse(state.phaseTimes.P4)
				: Number.NaN;
			if (!Number.isNaN(tracedAt)) {
				for (const [q, a] of Object.entries(answers)) {
					const at = a.at ? Date.parse(a.at) : Number.NaN;
					if (!Number.isNaN(at) && at > tracedAt) {
						err(
							`the answer to ${q} was given after P4 was recorded — the trace cannot reflect it. Re-trace the items that named it, re-run P5, then record P4 again`
						);
						break;
					}
				}
			}
			// J · a number that moved, with nothing saying why
			const impactMd = join(dir, "04-impact.md");
			if (
				existsSync(impactMd) &&
				!readFileSync(impactMd, "utf8").includes("What the answers changed")
			) {
				err(
					'04-impact.md: answers were recorded but there is no "What the answers changed" section — say what moved, and which answers changed the work rather than confirming it'
				);
			}
		}
	}
}

// G · a mandatory question reached gate 2 with nobody having answered it.
// The whole point of asking in the terminal is that this can no longer happen
// by drift: an item blocked on an unanswered question is priced at x2.0, and a
// sheet built on x2.0 numbers reads as a decision when it is a shrug.
if (want("P6")) {
	const questionsAt = join(dir, "questions.md");
	if (existsSync(questionsAt)) {
		const blocks = readFileSync(questionsAt, "utf8")
			.split(/^###\s+/m)
			.slice(1);
		for (const block of blocks) {
			if (!block.includes("**Mandatory**")) {
				continue;
			}
			const answered =
				block.includes("**Answer") || block.includes("**Left open:**");
			if (!answered) {
				const title = (block.split("\n")[0] ?? "").trim();
				err(
					`questions.md: "${title}" is mandatory and unanswered — ask it in the terminal and record it with record-answer.ts, or record it as left open. Gate 2 cannot be presented on a guess`
				);
			}
		}
	}
}

if (want("P8")) {
	const reportAt = join(dir, "REPORT.md");
	if (
		existsSync(reportAt) &&
		!readFileSync(reportAt, "utf8").includes("Institution shape")
	) {
		err(
			'REPORT.md: missing the "Institution shape" section — say whether the design works for a college, even if the answer is "no assumption"'
		);
	}
	const impactMd = join(dir, "04-impact.md");
	if (
		existsSync(impactMd) &&
		!readFileSync(impactMd, "utf8").includes("in plain words")
	) {
		err(
			'04-impact.md: missing the "What this needs from the server, in plain words" section — three buckets, in sentences, no identifiers'
		);
	}
	// questions.md is the file the reader has to answer, so it is held to the
	// same plain-words rule as the summary.
	const questionsAt = join(dir, "questions.md");
	if (existsSync(questionsAt)) {
		const asked = readFileSync(questionsAt, "utf8");
		// Once impact is traced, the reader must meet the verdict where they are
		// already answering — not only in an engineering document.
		if (
			existsSync(impactMd) &&
			!asked.includes("What this needs from the server")
		) {
			err(
				'questions.md: missing the "What this needs from the server" block — P4 puts the same three plain sentences at the top of this file, above the questions'
			);
		}
		for (const [pattern, what] of [
			[/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w{}/:-]+/, "an endpoint path"],
			[/\b\w+\.(ts|tsx)\b/, "a source file name"],
			[/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/, "a table or column name"],
		] as [RegExp, string][]) {
			const hit = asked.match(pattern);
			if (hit) {
				err(
					`questions.md: ${what} ("${hit[0]}") — the person answering may not be an engineer. Ask it in terms of what the screen does`
				);
			}
		}
	}
	const summaryAt = join(dir, "SUMMARY.md");
	if (existsSync(summaryAt)) {
		const text = readFileSync(summaryAt, "utf8");
		// New endpoints, tables and columns are the first thing a tech lead looks
		// for, so the block sits ABOVE the fold — before the verdict, not buried
		// in the middle of the page.
		const highlight = text.indexOf("API and database changes");
		if (highlight === -1) {
			err(
				'SUMMARY.md: missing the "API and database changes" block — say what new endpoints, tables, columns and indexes the module needs, or that there are none'
			);
		} else {
			const first = text.indexOf("\n## Does this affect colleges?");
			if (first !== -1 && highlight > first) {
				err(
					'SUMMARY.md: the "API and database changes" block must come FIRST, above "Does this affect colleges?" — it is the answer a tech lead scans for'
				);
			}
		}
		// Every API and database row says why it is needed, not only what it is.
		for (const heading of ["### 1 · API changes", "### 2 · Database changes"]) {
			const at = text.indexOf(heading);
			if (at === -1) {
				continue;
			}
			const header = text
				.slice(at, at + 400)
				.split("\n")
				.find((l) => l.startsWith("|"));
			if (header && !header.includes("Why")) {
				err(`SUMMARY.md: "${heading}" table has no "Why" column`);
			}
		}
		// The person reading this may not be an engineer. Page one is about
		// consequences; identifiers belong in REPORT.md. The three plain buckets
		// fem-impact wrote must survive the trip into the summary.
		const plainBuckets = [
			"Needs a server change",
			"Not in the CMS today",
			"Extra we must handle",
		];
		if (!plainBuckets.some((bucket) => text.includes(bucket))) {
			err(
				'SUMMARY.md: none of the plain-words buckets appear — carry "Needs a server change", "Not in the CMS today" and "Extra we must handle" over from 04-impact.md, or say in one line that a bucket is empty'
			);
		}
		const jargon: [RegExp, string][] = [
			[/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[\w{}/:-]+/g, "an endpoint path"],
			[/\b\w+\.(ts|tsx)\b/g, "a source file name"],
			[/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g, "a table or column name"],
		];
		const half = text.slice(
			0,
			Math.max(0, text.indexOf("## Exactly what changes"))
		);
		for (const [pattern, what] of jargon) {
			const hit = half.match(pattern);
			if (hit) {
				err(
					`SUMMARY.md: ${what} ("${hit[0]}") appears before "Exactly what changes". Say it in plain words there and keep the identifier in REPORT.md`
				);
			}
		}

		let cursor = -1;
		for (const heading of SUMMARY_SECTIONS) {
			const at = text.indexOf(`\n${heading}`);
			if (at === -1) {
				err(`SUMMARY.md: missing the section "${heading}"`);
				continue;
			}
			if (at < cursor) {
				err(
					`SUMMARY.md: "${heading}" is out of order — the ten sections are fixed`
				);
			}
			cursor = at;
		}
	}
}

// ── P5 · estimate ────────────────────────────────────────────────────────────
if (want("P5") && existsSync(join(dir, "05-estimate.json"))) {
	validate(
		read("05-estimate.json"),
		loadSchema("estimate.schema.json"),
		"05-estimate"
	);
}

const where = `${app}/${moduleName}${onlyPhase ? ` ${onlyPhase}` : ""}`;
for (const w of warnings) {
	console.log(`  warn  ${w}`);
}
for (const e of errors) {
	console.error(`  FAIL  ${e}`);
}
console.log(
	`fem-validate · ${where} · ${errors.length} error(s) · ${warnings.length} warning(s)`
);
process.exit(errors.length ? 1 : 0);
