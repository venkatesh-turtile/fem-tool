#!/usr/bin/env bun
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
/**
 * fem-index — P0. Builds the static codebase graph every later phase queries.
 *
 * Spec: docs/specs/fe-migration-impact-workflow-requirements.md §8 P0.
 * Read-only (NFR-1). Deterministic (NFR-2): every array is sorted, no
 * timestamps, and the git ref is stamped so an index can be reproduced.
 *
 *   bun .claude/skills/fem-index/scripts/build-index.ts [--app cms] [--check]
 */
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
// The alias the front end imports server schemas through, and what it points
// at on disk. Both come from fem.config.json so the tool travels to a repo
// that lays its server out differently.
const SERVER_ROOT: string = CFG.server.root;
const SERVER_MODULES: string = CFG.server.modules;
const SERVER_ALIAS: string = CFG.server.alias ?? "@server/";
const ARGV = process.argv.slice(2);
const ONLY_APP = ARGV.includes("--app")
	? ARGV[ARGV.indexOf("--app") + 1]
	: null;
const CHECK_ONLY = ARGV.includes("--check");

const SKIP = new Set([
	"node_modules",
	".next",
	".turbo",
	"dist",
	"build",
	".git",
	"coverage",
]);

function walk(dir: string, out: string[] = []): string[] {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const e of entries.sort()) {
		if (SKIP.has(e)) {
			continue;
		}
		const p = join(dir, e);
		let st;
		try {
			st = statSync(p);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			walk(p, out);
		} else {
			out.push(p);
		}
	}
	return out;
}
const read = (p: string) => {
	try {
		return readFileSync(p, "utf8");
	} catch {
		return "";
	}
};
const rel = (p: string) => relative(ROOT, p);
const uniq = <T>(a: T[]) => [...new Set(a)].sort();

/**
 * NFR-3: ids must survive re-runs. A positional id (sort order + 1) shifts
 * every later screen when one is REMOVED — and R1 removal is in the taxonomy,
 * so it happens. Decisions taken at gate 2 would then attach to the wrong
 * change. Derive the id from the thing itself: stable under insert and delete.
 */
const shortId = (v: string) =>
	createHash("sha256").update(v).digest("hex").slice(0, 6);

// ── git ref, so the index is reproducible (the gap that made §3 stale) ───────
function gitRef() {
	const q = (c: string) => {
		try {
			return execSync(c, { encoding: "utf8" }).trim();
		} catch {
			return "unknown";
		}
	};
	return {
		branch: q("git rev-parse --abbrev-ref HEAD"),
		sha: q("git rev-parse --short HEAD"),
		dirty: q("git status --porcelain") !== "",
	};
}

// ── 1 · PAGES ────────────────────────────────────────────────────────────────
// Route-prefix scoped, never substring: 'library' must not match
// fee-management/library-fees, lms/my-library, lms/content-library.
type AppCfg = { root: string; routeBase: string; modules: string };
type Page = {
	id: string;
	app: string;
	route: string;
	file: string;
	module: string | null;
};

function buildPages(): Page[] {
	const pages: Page[] = [];
	for (const [app, cfg] of Object.entries(CFG.apps) as [string, AppCfg][]) {
		if (ONLY_APP && app !== ONLY_APP) {
			continue;
		}
		const base = join(ROOT, cfg.routeBase);
		for (const f of walk(base).filter((f) => basename(f) === "page.tsx")) {
			const route = `/${relative(base, dirname(f)).split("/").join("/")}`;
			// module = first non-dynamic route segment
			const seg = route
				.split("/")
				.filter((s) => s && !s.startsWith("[") && !s.startsWith("("));
			pages.push({
				id: "",
				app,
				route: route === "/." ? "/" : route,
				file: rel(f),
				module: seg[0] ?? null,
			});
		}
	}
	pages.sort((a, b) => (a.app + a.route).localeCompare(b.app + b.route));
	for (const p of pages) {
		p.id = `S-${p.app}-${shortId(p.route)}`;
	}
	return pages;
}

// ── 2 · FRONTEND BINDINGS ────────────────────────────────────────────────────
// The key lever (§3.2): a FE api client imports its Zod schema from the exact
// server feature folder that serves the endpoint.
type Binding = {
	app: string;
	module: string;
	clientFile: string;
	serverPath: string;
	symbols: string[];
};
const IMPORT_RE =
	/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'](@server\/modules\/[^"']+)["']/g;

function buildBindings(): Binding[] {
	const out: Binding[] = [];
	for (const [app, cfg] of Object.entries(CFG.apps) as [string, AppCfg][]) {
		if (ONLY_APP && app !== ONLY_APP) {
			continue;
		}
		const modRoot = join(ROOT, cfg.modules);
		for (const f of walk(modRoot)) {
			if (!/\.tsx?$/.test(f) || /\.test\.|__tests__/.test(f)) {
				continue;
			}
			const src = read(f);
			if (!src.includes("@server/modules")) {
				continue;
			}
			const mod = relative(modRoot, f).split("/")[0];
			for (const m of src.matchAll(IMPORT_RE)) {
				out.push({
					app,
					module: mod,
					clientFile: rel(f),
					serverPath: m[2].replace(SERVER_ALIAS, `${SERVER_ROOT}/`),
					symbols: uniq(
						m[1]
							.split(",")
							.map((s) => s.trim().split(/\s+as\s+/)[0])
							.filter(Boolean)
					),
				});
			}
		}
	}
	out.sort((a, b) =>
		(a.app + a.module + a.clientFile + a.serverPath).localeCompare(
			b.app + b.module + b.clientFile + b.serverPath
		)
	);
	return out;
}

// ── 3 · ENDPOINTS ────────────────────────────────────────────────────────────
// Both server conventions (§3): feature-folder {schema,route,handler}.ts
// and suffixed *.schema.ts / *.routes.ts / *.handlers.ts.
type Endpoint = {
	id: string;
	serverPath: string;
	convention:
		| "feature-folder"
		| "suffixed"
		| "routes-plural"
		| "shared-schema"
		| "no-routes-defined"
		| "unresolved";
	routeStyles: string[];
	methods: string[];
	paths: string[];
	routeCount: number;
	routeFile: string | null;
	handlerFiles: string[];
	serviceFiles: string[];
	tables: string[];
	tablesVia: string;
};
const CREATE_ROUTE_RE = /createRoute\s*\(\s*\{/g;
const TABLE_RE = /from\s+["']@server\/database\/schema\/([^"']+)["']/g;

/**
 * createRoute() lives in different files per convention:
 *   feature-folder  → route.ts
 *   suffixed        → *.schema.ts   (the *.routes.ts only wires .openapi())
 * So scan every .ts in the feature dir rather than guessing the filename.
 */
function routesIn(
	src: string
): { method: string; path: string; style: string }[] {
	const out: { method: string; path: string; style: string }[] = [];
	// 4th style: plain Hono chaining, OUTSIDE the OpenAPI contract.
	//   nexusRouter.post("/runs", async (c) => { ... })
	// These have no Zod schema and no OpenAPI entry, so a contract change here is
	// invisible to the generated spec. Worth surfacing, not just counting.
	for (const m of src.matchAll(
		/\b[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\s*\(\s*["']([^"']*)["']/g
	)) {
		out.push({ method: m[1].toLowerCase(), path: m[2], style: "hono-chain" });
	}
	for (const m of src.matchAll(CREATE_ROUTE_RE)) {
		const at = m.index ?? 0;
		const block = src.slice(at, at + 600);
		const method = block.match(
			/method:\s*["'](get|post|put|patch|delete)["']/i
		)?.[1];
		const path = block.match(/path:\s*["']([^"']*)["']/)?.[1];
		if (method && path !== undefined) {
			out.push({ method: method.toLowerCase(), path, style: "openapi" });
		}
	}
	return out;
}

function endpointFor(serverPathRel: string): Endpoint {
	const abs = join(ROOT, serverPathRel);
	const dir = statSync_safe(abs) ? abs : dirname(abs);
	const files = (() => {
		try {
			return readdirSync(dir).sort();
		} catch {
			return [];
		}
	})();
	const ts = files.filter((f) => f.endsWith(".ts") && !f.includes(".test."));

	// convention, by the filenames present
	let convention: Endpoint["convention"] = "unresolved";
	if (files.includes("route.ts")) {
		convention = "feature-folder";
	} else if (ts.some((f) => f.endsWith(".routes.ts"))) {
		convention = "suffixed";
	} else if (files.includes("routes.ts")) {
		convention = "routes-plural";
	}

	// handlers, all four shapes
	let handlerFiles = ts
		.filter(
			(f) =>
				f === "handler.ts" || f === "handlers.ts" || f.endsWith(".handlers.ts")
		)
		.map((f) => join(dir, f));
	const hd = join(dir, "handlers");
	if (statSync_safe(hd)) {
		handlerFiles.push(
			...walk(hd).filter((f) => f.endsWith(".ts") && !f.includes(".test."))
		);
	}
	handlerFiles = uniq(handlerFiles);

	// routes: scan every .ts, plus a handlers/ subdir if present
	const scan = uniq([...ts.map((f) => join(dir, f)), ...handlerFiles]);
	const found = scan.flatMap((f) => routesIn(read(f)));
	const routeFile = scan.find((f) => routesIn(read(f)).length > 0) ?? null;

	// a dir with no routes anywhere is shared types, NOT a failed endpoint
	if (!found.length && convention === "unresolved") {
		convention = "shared-schema";
	}
	// route-convention filenames present but zero routes defined = dead
	// scaffolding. A real finding, not a resolution failure.
	if (!found.length && convention !== "shared-schema") {
		convention = "no-routes-defined";
	}

	// Tables: direct imports in the handler, plus ONE hop through a service or
	// repository in the same module. Admissions handlers import no tables at all
	// - they call services/*.service, and the service imports the tables. This is
	// the indirection the spec names as risk #2; one hop resolves it cheaply.
	const direct = uniq(
		handlerFiles.flatMap((h) =>
			[...read(h).matchAll(TABLE_RE)].map((m) => m[1])
		)
	);
	const hops: string[] = [];
	const viaTables: string[] = [];
	for (const h of handlerFiles) {
		for (const m of read(h).matchAll(
			/from\s+["']@server\/modules\/([^"']+)["']/g
		)) {
			if (
				!/\/(service|services|repository|repositories|queries|db)[./]/i.test(
					`/${m[1]}`
				)
			) {
				continue;
			}
			const f = join(ROOT, SERVER_MODULES, `${m[1]}.ts`);
			const src = read(f);
			if (!src) {
				continue;
			}
			hops.push(rel(f));
			viaTables.push(...[...src.matchAll(TABLE_RE)].map((x) => x[1]));
		}
	}
	return {
		id: "",
		serverPath: rel(dir),
		convention,
		methods: uniq(found.map((r) => r.method)),
		paths: uniq(found.map((r) => r.path)),
		routeCount: found.length,
		routeStyles: uniq(found.map((r) => r.style)),
		routeFile: routeFile ? rel(routeFile) : null,
		handlerFiles: handlerFiles.map(rel).sort(),
		serviceFiles: uniq(hops),
		tables: uniq([...direct, ...viaTables]),
		tablesVia:
			viaTables.length && !direct.length
				? "service"
				: direct.length && viaTables.length
					? "both"
					: direct.length
						? "direct"
						: "none",
	};
}
function statSync_safe(p: string) {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function buildEndpoints(bindings: Binding[]): Endpoint[] {
	const seen = new Map<string, Endpoint>();
	for (const b of bindings) {
		const dirKey = b.serverPath.replace(/\/[^/]*$/, ""); // strip the imported file
		if (seen.has(dirKey)) {
			continue;
		}
		seen.set(dirKey, endpointFor(dirKey));
	}
	const out = [...seen.values()].sort((a, b) =>
		a.serverPath.localeCompare(b.serverPath)
	);
	for (const e of out) {
		e.id = `EP-${shortId(e.serverPath)}`;
	}
	return out;
}

// ── 4 · CONSUMERS — who else imports each server module (§6.3 L12) ───────────
function buildConsumers(): Record<string, string[]> {
	const map: Record<string, Set<string>> = {};
	for (const app of CFG.consumerApps) {
		const root = join(ROOT, "apps", app);
		if (!statSync_safe(root)) {
			continue;
		}
		for (const f of walk(root)) {
			if (!/\.tsx?$/.test(f)) {
				continue;
			}
			const src = read(f);
			if (!src.includes("@server/modules")) {
				continue;
			}
			for (const m of src.matchAll(/@server\/modules\/([^"'\s]+)/g)) {
				const key = m[1].split("/").slice(0, 4).join("/");
				(map[key] ??= new Set()).add(app);
			}
		}
	}
	return Object.fromEntries(
		Object.entries(map)
			.map(([k, v]) => [k, [...v].sort()])
			.sort()
	);
}

// ── 4b · TABLE READERS — who TOUCHES each table, not who borrows its types ───
// The consumer map above answers "which app imports this module's schemas?".
// That question has a blind spot big enough to break production: a second
// server module can query the same table directly and import nothing from the
// first. In this codebase the student/parent calendar and the Chairman's
// Cockpit both read the academic calendar table that way, and both were
// invisible here until someone went looking by hand.
//
// So this pass asks the other question — for every table, which server module
// files reach it, directly or through one hop of a shared service. A module
// proposing to remove a column can then see, mechanically, who else is reading
// it.
function buildTableReaders(): Record<string, string[]> {
	const map: Record<string, Set<string>> = {};
	const serviceTables = new Map<string, string[]>();

	const tablesIn = (src: string) =>
		[...src.matchAll(TABLE_RE)].map((m) => m[1] as string);

	// Pass one: every server file, and the tables it imports outright.
	const files = [...walk(join(ROOT, SERVER_MODULES))].filter((f) =>
		/\.tsx?$/.test(f)
	);
	for (const f of files) {
		const src = read(f);
		if (!src) {
			continue;
		}
		const direct = tablesIn(src);
		if (direct.length > 0) {
			serviceTables.set(rel(f), direct);
			for (const t of direct) {
				(map[t] ??= new Set()).add(moduleKey(rel(f)));
			}
		}
	}

	// Pass two: one hop. A handler that imports a service which imports the
	// table is a reader of that table, and the handler is what a person
	// recognises — "the Cockpit", not "queries.ts".
	for (const f of files) {
		const src = read(f);
		if (!src) {
			continue;
		}
		for (const m of src.matchAll(
			/from\s+["']@server\/modules\/([^"']+)["']/g
		)) {
			const target = rel(join(ROOT, SERVER_MODULES, `${m[1]}.ts`));
			for (const t of serviceTables.get(target) ?? []) {
				(map[t] ??= new Set()).add(moduleKey(rel(f)));
			}
		}
	}

	return Object.fromEntries(
		Object.entries(map)
			.map(([k, v]) => [k, [...v].sort()] as const)
			.sort(([a], [b]) => a.localeCompare(b))
	);
}

// A file path reduced to the thing a human would name: the module it belongs
// to, four segments deep, which is where module identity lives in this tree.
function moduleKey(relPath: string): string {
	const after = relPath.replace(`${SERVER_MODULES}/`, "");
	// Drop the filename first: "admin/users/purge-identity.handlers.ts" is the
	// admin/users module, not a module of its own. Without this a hub table
	// lists the same module once per file in it.
	const dir = after.split("/").slice(0, -1);
	return dir.slice(0, 4).join("/");
}

// ── 5 · TESTS ────────────────────────────────────────────────────────────────
function buildTests() {
	const g = (dir: string, re: RegExp) =>
		statSync_safe(join(ROOT, dir))
			? walk(join(ROOT, dir))
					.filter((f) => re.test(f))
					.map(rel)
					.sort()
			: [];
	return {
		serverUnit: g(CFG.server.root, /\.test\.ts$/),
		serverIntegration: g(CFG.server.integration, /\.ts$/),
		frontendUnit: Object.fromEntries(
			Object.entries(CFG.apps)
				.filter(([a]) => !ONLY_APP || a === ONLY_APP)
				.map(([a, c]) => [a, g((c as AppCfg).root, /\.test\.tsx?$/)])
		),
		e2eApi: g(CFG.e2e.apiSpecs, /\.spec\.ts$/),
		e2eUi: g(CFG.e2e.uiSpecs, /\.spec\.ts$/),
		e2ePageObjects: g(CFG.e2e.pageObjects, /\.ts$/),
	};
}

// ── 6 · OBSERVABILITY — record "no coverage" explicitly (§8 P0) ──────────────
function buildObservability() {
	const root = join(ROOT, CFG.observability.dashboards);
	const files = statSync_safe(root)
		? walk(root).filter((f) => /\.(json|ya?ml|jsonnet)$/.test(f))
		: [];
	return {
		sources: files.map(rel).sort(),
		note: files.length
			? "parse per-module panels in a later pass"
			: "NO COVERAGE — no dashboard sources found",
	};
}

// ── main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const meta = {
	spec: "§8 P0",
	generator: "fem-index",
	ref: gitRef(),
	scope: ONLY_APP ?? "all-apps",
};

const pages = buildPages();
const bindings = buildBindings();
const endpoints = buildEndpoints(bindings);
const consumers = buildConsumers();
const tableReaders = buildTableReaders();
const tests = buildTests();
const observability = buildObservability();

const sharedSchema = endpoints.filter((e) => e.convention === "shared-schema");
const stubs = endpoints.filter((e) => e.convention === "no-routes-defined");
const realEndpoints = endpoints.filter(
	(e) =>
		e.convention !== "shared-schema" && e.convention !== "no-routes-defined"
);
const resolved = realEndpoints.filter((e) => e.methods.length > 0);
const rate = realEndpoints.length ? resolved.length / realEndpoints.length : 0;
const elapsed = (Date.now() - t0) / 1000;

const summary = {
	pages: pages.length,
	bindings: bindings.length,
	featureDirs: endpoints.length,
	sharedSchemaDirs: sharedSchema.length,
	stubDirs: stubs.length,
	stubs: stubs.map((e) => e.serverPath),
	honoChainEndpoints: realEndpoints
		.filter((e) => e.routeStyles.includes("hono-chain"))
		.map((e) => e.serverPath),
	endpoints: realEndpoints.length,
	endpointsResolved: resolved.length,
	routeDefinitions: realEndpoints.reduce((n, e) => n + e.routeCount, 0),
	resolutionRate: Number(rate.toFixed(4)),
	tables: uniq(endpoints.flatMap((e) => e.tables)).length,
	sharedServerModules: Object.entries(consumers).filter(([, a]) => a.length > 1)
		.length,
	sharedTables: Object.entries(tableReaders).filter(([, r]) => r.length > 1)
		.length,
	accept: {
		resolutionRate: {
			need: CFG.acceptance.index_binding_resolution_rate,
			got: Number(rate.toFixed(4)),
			pass: rate >= CFG.acceptance.index_binding_resolution_rate,
		},
		// NFR-2: runtime is reported to stdout, never persisted — it varies per run
		// and would break byte-identical output. Budget is recorded for reference.
		secondsBudget: CFG.acceptance.index_max_seconds,
	},
};

if (CHECK_ONLY) {
	console.log(JSON.stringify(summary, null, 2));
	process.exit(summary.accept.resolutionRate.pass ? 0 : 1);
}

const outDir = join(ROOT, CFG.paths.index);
mkdirSync(outDir, { recursive: true });
const write = (n: string, d: unknown) =>
	writeFileSync(
		join(outDir, n),
		`${JSON.stringify({ meta, ...(d as object) }, null, 2)}\n`
	);
write("pages.json", { pages });
write("frontend-bindings.json", { bindings });
write("endpoints.json", { endpoints });
write("consumers.json", { consumers });
write("table-readers.json", { tableReaders });
write("tests.json", { tests });
write("observability.json", { observability });
write("summary.json", { summary });

console.log(
	`fem-index · ${meta.ref.branch}@${meta.ref.sha}${meta.ref.dirty ? "-dirty" : ""} · ${elapsed.toFixed(1)}s`
);
console.log(
	`  pages ${pages.length} · bindings ${bindings.length} · endpoints ${realEndpoints.length} (${(rate * 100).toFixed(1)}% resolved) · routes ${summary.routeDefinitions} · shared-schema dirs ${sharedSchema.length}`
);
console.log(
	`  tables ${Object.keys(tableReaders).length} · read by more than one module ${summary.sharedTables}`
);
const timePass = elapsed <= CFG.acceptance.index_max_seconds;
console.log(
	`  ACCEPT resolution ${summary.accept.resolutionRate.pass ? "PASS" : "FAIL"} · time ${timePass ? "PASS" : "FAIL"} (${elapsed.toFixed(1)}s / ${CFG.acceptance.index_max_seconds}s)`
);
