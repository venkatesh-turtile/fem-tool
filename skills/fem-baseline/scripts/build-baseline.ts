#!/usr/bin/env bun
import { createHash } from "node:crypto";
/**
 * fem-baseline — P1. Describes a module as it exists today, in the screen spec
 * that fem-design-intake also emits, so P3 can diff them directly.
 *
 * Reads ONLY docs/fe-migration/_index/*.json — never application source.
 * Spec §8 P1.  bun .../build-baseline.ts <app> <module>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
// Where the server lives, so a module path can be shown without its prefix.
const SERVER_MODULES: string = `${CFG.server.modules}/`;
const [app, moduleName] = process.argv.slice(2);
if (!(app && moduleName)) {
	console.error("usage: build-baseline.ts <app> <module>");
	process.exit(2);
}

// ── shapes of the _index/*.json documents this reads ────────────────────────
type Ref = { branch: string; sha: string; dirty: boolean };
type Page = {
	id: string;
	app: string;
	route: string;
	file: string;
	module: string | null;
	usesModules?: string[];
	usesFiles?: string[];
};
type Binding = {
	app: string;
	module: string;
	clientFile: string;
	serverPath: string;
	symbols: string[];
};
type Endpoint = {
	id: string;
	serverPath: string;
	convention: string;
	methods: string[];
	paths: string[];
	routeCount: number;
	routeStyles: string[];
	routeFile: string | null;
	handlerFiles: string[];
	serviceFiles: string[];
	tables: string[];
	tablesVia: string;
};
type Tests = {
	serverUnit: string[];
	serverIntegration: string[];
	frontendUnit: Record<string, string[]>;
	e2eApi: string[];
	e2eUi: string[];
	e2ePageObjects: string[];
};

const IDX = join(ROOT, CFG.paths.index);
const load = <T>(n: string): T =>
	JSON.parse(readFileSync(join(IDX, n), "utf8")) as T;
const pagesDoc = load<{ meta: { ref: Ref }; pages: Page[] }>("pages.json");
const { bindings } = load<{ bindings: Binding[] }>("frontend-bindings.json");
const { endpoints } = load<{ endpoints: Endpoint[] }>("endpoints.json");
// Added after the first indexes were built, so an index from before it is a
// normal thing to meet. Say what to do rather than dying on a missing file —
// the orchestrator rebuilds the index every run, so this only bites someone
// running the phase by hand.
const tableReaders: Record<string, string[]> = existsSync(
	join(IDX, "table-readers.json")
)
	? load<{ tableReaders: Record<string, string[]> }>("table-readers.json")
			.tableReaders
	: (console.warn(
			"  note: no table-readers.json — rebuild the index to see who else reads these tables"
		),
		{});
const { consumers } = load<{ consumers: Record<string, string[]> }>(
	"consumers.json"
);
const tests = load<{ tests: Tests }>("tests.json").tests;
const meta = pagesDoc.meta;

const epByPath = new Map<string, Endpoint>(
	endpoints.map((e) => [e.serverPath, e])
);
const uniq = <T>(a: T[]) => [...new Set(a)].sort();

// NFR-3: derive the id from the route, not from sort position. Removing a
// screen must not renumber the others — gate 2 decisions reference these ids.
const shortId = (v: string) =>
	createHash("sha256").update(v).digest("hex").slice(0, 6);

// ── screens: route-prefix scoped, NEVER substring ────────────────────────────
// '*timetable*' matches 8 CMS pages across four modules. Scoped to the
// /<module> route prefix it is 2.
// pages.json already records `module` as the first NON-DYNAMIC route segment,
// so routes carrying [institutionId] resolve correctly and
// /hrms/admin/timetable stays with hrms, not timetable.
const screens = pagesDoc.pages
	.filter((p) => p.app === app && p.module === moduleName)
	.sort((a, b) => a.route.localeCompare(b.route));
const segAfter = (route: string) => {
	const seg = route.split("/").filter(Boolean);
	const i = seg.indexOf(moduleName);
	return i >= 0 ? seg.slice(i + 1).join("/") : "";
};

// ── bindings for this module ─────────────────────────────────────────────────
// By what the screens IMPORT, not by what they are called. /academic-structure
// is served entirely out of modules/academic-nodes, and matching on the name
// alone returned nothing at all — a screen with four routes and thirty-seven
// bindings reported as calling no endpoints and touching no tables, which every
// later phase would have repeated as fact.
const reachedFiles = new Set<string>();
for (const p of screens) {
	for (const f of p.usesFiles ?? []) {
		reachedFiles.add(f);
	}
}
const mine = bindings.filter(
	(b) =>
		b.app === app &&
		(b.module === moduleName || reachedFiles.has(b.clientFile))
);
const dirOf = (serverPath: string) => serverPath.replace(/\/[^/]*$/, "");
const endpointDirs = uniq(mine.map((b) => dirOf(b.serverPath)));

const resolvedEndpoints = endpointDirs
	.map((d) => epByPath.get(d))
	.filter((e): e is Endpoint => !!e && e.methods.length > 0);

// A `common/` or `shared/` dir holding only schemas.ts + utils.ts is shared
// types, not a failed endpoint. The index marks those `shared-schema`; they
// must not count against the resolution rate.
const sharedSchemaDirs = endpointDirs.filter(
	(d) => epByPath.get(d)?.convention === "shared-schema"
);
const stubDirs = endpointDirs.filter(
	(d) => epByPath.get(d)?.convention === "no-routes-defined"
);
const unresolved = endpointDirs.filter((d) => {
	const e = epByPath.get(d);
	if (
		e?.convention === "shared-schema" ||
		e?.convention === "no-routes-defined"
	) {
		return false;
	}
	return !e || e.methods.length === 0;
});
const realDirs = endpointDirs.filter((d) => {
	const c = epByPath.get(d)?.convention;
	return c !== "shared-schema" && c !== "no-routes-defined";
});

// ── L12: who else consumes the server modules this module uses ───────────────
const consumerHits: Record<string, string[]> = {};
for (const d of endpointDirs) {
	const key = d
		.replace(SERVER_MODULES, "")
		.split("/")
		.slice(0, 4)
		.join("/");
	const apps = consumers[key];
	if (apps?.filter((a: string) => a !== app).length) {
		consumerHits[key] = apps.filter((a: string) => a !== app);
	}
}

// Above this many readers a table is infrastructure, not a dependency worth
// enumerating: every module touches `institutions`, and saying so each time
// trains people to skip the section that matters.
const HUB_READERS = 8;

// ── L12, the other half: who READS the tables this module writes ────────────
// consumers.json answers "who imports our types". A module that queries the
// same table and imports nothing is invisible to it — which is how the parent
// app went unnoticed against the calendar's events table until someone looked
// by hand. This asks the question that catches it.
const moduleOf = (p: string) =>
	p.replace(`${SERVER_MODULES}/`, "").split("/").slice(0, 4).join("/");
const ownModules = new Set(endpointDirs.map(moduleOf));
const tableReaderHits: Record<string, string[]> = {};
for (const t of uniq(resolvedEndpoints.flatMap((e) => e.tables))) {
	const others = (tableReaders[t] ?? []).filter((m) => !ownModules.has(m));
	if (others.length > 0) {
		tableReaderHits[t] = others;
	}
}

// ── tests scoped to the module ───────────────────────────────────────────────
const hit = (arr: string[]) =>
	arr.filter((f) => f.toLowerCase().includes(moduleName.toLowerCase()));
const testCounts = {
	serverUnit: hit(tests.serverUnit).length,
	serverIntegration: hit(tests.serverIntegration).length,
	frontendUnit: hit(tests.frontendUnit?.[app] ?? []).length,
	e2eApi: hit(tests.e2eApi).length,
	e2eUi: hit(tests.e2eUi).length,
	e2ePageObjects: hit(tests.e2ePageObjects).length,
};

// ── emit the screen spec ─────────────────────────────────────────────────────
// Elements are the one part of this file a person writes, and rebuilding the
// index is a routine thing to do mid-run. Overwriting them turns a two-second
// rebuild into an hour of re-reading components, so anything already filled in
// for a screen is carried across. Screen ids are content hashes of the route,
// so a screen that survives keeps its work and a route that changed does not
// inherit somebody else's.
const priorElements = new Map<string, unknown[]>();
const priorPath = join(ROOT, CFG.paths.output, app, moduleName, "01-baseline.json");
if (existsSync(priorPath)) {
	try {
		const prior = JSON.parse(readFileSync(priorPath, "utf8"));
		for (const sc of prior.spec?.screens ?? []) {
			if (sc?.id && Array.isArray(sc.elements) && sc.elements.length > 0) {
				priorElements.set(sc.id, sc.elements);
			}
		}
	} catch {
		// A half-written file is not a reason to refuse to build a new one.
	}
}

const spec = {
	app,
	module: moduleName,
	source: "repository",
	ref: meta.ref,
	screens: screens.map((p: Page, i: number) => ({
		id: `S-${moduleName}-${shortId(p.route)}`,
		name: segAfter(p.route) || moduleName,
		route: p.route,
		file: p.file,
		state: "default",
		// Populated by the model step — the script establishes the frame and the
		// bindings; §8 P1 requires every element to carry a binding or be marked
		// static. Kept across a rebuild when the screen is the same one.
		elements: (priorElements.get(`S-${moduleName}-${shortId(p.route)}`) ??
			[]) as unknown[],
	})),
};

const facts = {
	app,
	module: moduleName,
	ref: meta.ref,
	screens: screens.length,
	bindings: mine.length,
	bindingFiles: uniq(mine.map((b) => b.clientFile)).length,
	endpoints: {
		total: realDirs.length,
		resolved: resolvedEndpoints.length,
		sharedSchemaDirs: sharedSchemaDirs.length,
		stubDirs,
		resolutionRate: realDirs.length
			? Number((resolvedEndpoints.length / realDirs.length).toFixed(4))
			: 0,
		unresolved,
		detail: resolvedEndpoints.map((e) => ({
			serverPath: e.serverPath,
			convention: e.convention,
			methods: e.methods,
			routeCount: e.routeCount,
			tables: e.tables,
		})),
	},
	routeDefinitions: resolvedEndpoints.reduce(
		(n: number, e: Endpoint) => n + e.routeCount,
		0
	),
	tables: uniq(resolvedEndpoints.flatMap((e) => e.tables)),
	tests: testCounts,
	consumers: consumerHits,
	accept: {
		// 0 of 0 resolved is not 100%. A module whose screens reach no server
		// schema at all is the quietest failure this phase has: every later
		// phase repeats "no endpoints, no tables" as though it were a finding.
		bindingsFound: {
			got: mine.length,
			pass: mine.length > 0,
		},
		resolutionRate: {
			need: CFG.acceptance.index_binding_resolution_rate,
			got: realDirs.length
				? Number((resolvedEndpoints.length / realDirs.length).toFixed(4))
				: 0,
			pass:
				!realDirs.length ||
				resolvedEndpoints.length / realDirs.length >=
					CFG.acceptance.index_binding_resolution_rate,
		},
		screensFound: { got: screens.length, pass: screens.length > 0 },
	},
};

const outDir = join(ROOT, CFG.paths.output, app, moduleName);
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "01-baseline.json"),
	`${JSON.stringify({ spec, facts }, null, 2)}\n`
);

// ── readable .md — §8 P1 requires both ───────────────────────────────────────
const md = [
	`# ${app} / ${moduleName} — baseline`,
	"",
	`Generated by \`fem-baseline\` from \`_index/\` at \`${meta.ref.branch}@${meta.ref.sha}${meta.ref.dirty ? "-dirty" : ""}\`.`,
	"Read-only. No application source was read by this step.",
	"",
	`## Screens — ${screens.length}`,
	"",
	"```",
	...screens.map(
		(p: Page) => `  S-${moduleName}-${shortId(p.route)}  ${p.route}`
	),
	"```",
	"",
	`> Matched on the first non-dynamic route segment, never a substring. \`*${moduleName}*\` would have`,
	`> matched ${pagesDoc.pages.filter((p) => p.app === app && p.route.includes(moduleName)).length} pages across several modules.`,
	"",
	`## Bindings — ${mine.length} across ${facts.bindingFiles} files`,
	"",
	`## Endpoints — ${facts.endpoints.resolved} of ${facts.endpoints.total} resolved (${(facts.endpoints.resolutionRate * 100).toFixed(1)}%)`,
	"",
	"```",
	...resolvedEndpoints.map(
		(e) =>
			`  ${e.serverPath.replace(SERVER_MODULES, "")}\n` +
			`      ${e.convention} · ${e.routeCount} routes · ${e.methods.join(" ")} · ${e.tables.length} tables`
	),
	"```",
	"",
	`## Tables — ${facts.tables.length}`,
	"",
	"```",
	...facts.tables.map((t: string) => `  ${t}`),
	"```",
	"",
	"## Tests",
	"",
	"```",
	`  server unit        ${testCounts.serverUnit}`,
	`  server integration ${testCounts.serverIntegration}`,
	`  frontend unit      ${testCounts.frontendUnit}`,
	`  e2e api            ${testCounts.e2eApi}`,
	`  e2e ui             ${testCounts.e2eUi}`,
	`  e2e page objects   ${testCounts.e2ePageObjects}`,
	"```",
	"",
	"## L12 — who else reads these tables",
	"",
	Object.keys(tableReaderHits).length
		? `\`\`\`\n${Object.entries(tableReaderHits)
				.map(([t, m]) =>
					// A table half the server reads is a hub, and listing sixty
					// modules buries the one table with three readers that
					// actually needs checking. Say the number and move on.
					m.length > HUB_READERS
						? `  ${t}\n      → a hub table · ${m.length} modules read it · narrow by the field you are changing`
						: `  ${t}\n      → ${m.join("\n      → ")}`
				)
				.join("\n")}\n\`\`\`\n\n` +
			"> These modules query the same tables. They may import nothing from this\n> module, so they will not appear below — and a column removed here breaks\n> them anyway. Every one must be accounted for at L12."
		: "```\n  no other server module reads these tables\n```",
	"",
	"## L12 — other consumers",
	"",
	Object.keys(consumerHits).length
		? "```\n" +
			Object.entries(consumerHits)
				.map(([k, v]) => `  ${k}\n      → ${v.join(", ")}`)
				.join("\n") +
			"\n```\n\n" +
			`> **Not empty.** A rename or removal here is a multi-app release. §9.2's\n> ×1.5 breaking-contract multiplier applies to any breaking change.`
		: "```\n  none found\n```\n\n" +
			"> `none` means **no web consumer**. The index sees cross-app use only\n> where an app imports a server Zod schema; `apps/student` imports none, so\n> an Expo consumer would be invisible here.",
	"",
	"## Acceptance — §8 P1",
	"",
	"| | Threshold | Measured | |",
	"|---|---|---|---|",
	`| Binding resolution | ≥ ${CFG.acceptance.index_binding_resolution_rate * 100}% | ${(facts.accept.resolutionRate.got * 100).toFixed(1)}% | ${facts.accept.resolutionRate.pass ? "PASS" : "FAIL"} |`,
	`| Screens found | > 0 | ${screens.length} | ${facts.accept.screensFound.pass ? "PASS" : "FAIL"} |`,
	"",
	`**M1 exit also needs the module owner's review of this file.**`,
	"",
].join("\n");
writeFileSync(join(outDir, "01-baseline.md"), md);

console.log(
	`fem-baseline · ${app}/${moduleName} · ${meta.ref.branch}@${meta.ref.sha}`
);
console.log(
	`  screens ${screens.length} · bindings ${mine.length} · endpoints ${facts.endpoints.resolved}/${facts.endpoints.total} (${(facts.endpoints.resolutionRate * 100).toFixed(1)}%) · tables ${facts.tables.length}`
);
const accepted =
	facts.accept.resolutionRate.pass &&
	facts.accept.screensFound.pass &&
	facts.accept.bindingsFound.pass;
console.log(
	`  ACCEPT ${accepted ? "PASS" : "FAIL"} → ${join(CFG.paths.output, app, moduleName)}/01-baseline.md`
);
if (!facts.accept.bindingsFound.pass && facts.accept.screensFound.pass) {
	// Loud, and it stops the run. A baseline saying "no endpoints, no tables"
	// is indistinguishable from a screen that genuinely calls nothing, and the
	// phases downstream cannot tell the difference either.
	console.error(
		`\n  ${screens.length} screens, and not one of them reaches a server schema.\n` +
			"  That is almost always the module name, not the truth: the route and the\n" +
			"  folder its code lives in can differ. Check what the page imports.\n" +
			"  If the screens really do call nothing, say so in the baseline by hand\n" +
			"  and re-run — do not let a silent zero flow downstream."
	);
	process.exit(1);
}
