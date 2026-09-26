/**
 * Regressions from the HRMS run (25 Sep 2026). Each test builds a throwaway
 * repo in a temp folder — a fem.config.json, an index and a run's outputs — and
 * runs the real script against it.
 *
 *   bun test tests/
 */
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SKILLS = join(import.meta.dir, "..", "skills");
const MODULES = "apps/server/src/modules/cms/institutions/[institutionId]";
const SCHEMA = "apps/server/src/database/schema";

function repo(files: Record<string, unknown>): string {
	const root = mkdtempSync(join(tmpdir(), "fem-test-"));
	const config = JSON.parse(
		readFileSync(join(import.meta.dir, "..", "fem.config.example.json"), "utf8")
	);
	writeFileSync(join(root, "fem.config.json"), JSON.stringify(config));
	for (const [path, body] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(
			join(root, path),
			typeof body === "string" ? body : JSON.stringify(body)
		);
	}
	return root;
}

function run(cwd: string, script: string, args: string[]) {
	const p = Bun.spawnSync(["bun", join(SKILLS, script), ...args], { cwd });
	return `${p.stdout.toString()}${p.stderr.toString()}`;
}

const endpoint = (path: string, tables: string[]) => ({
	id: `EP-${path.length}`,
	serverPath: `${MODULES}/${path}`,
	methods: ["get", "post"],
	paths: ["/"],
	tables,
});

// Departments reads its own table; attendance config owns the time columns.
const INDEX = {
	endpoints: [
		endpoint("departments", ["cms/departments"]),
		endpoint("hrms/attendance/config", [
			"cms/hrms/attendance/staff-attendance-configs",
		]),
	],
};

const change = (resolution: string, table: string) => ({
	id: "C-departments-001",
	type: "D1",
	resolution,
	impact: { L4: { change: "join", evidence: [`${SCHEMA}/${table}.ts:12`] } },
});

const validate = (c: object) =>
	run(
		repo({
			"docs/fe-migration/_index/endpoints.json": INDEX,
			"docs/fe-migration/cms/departments/04-impact.json": { changes: [c] },
		}),
		"fem-run/scripts/validate-outputs.ts",
		["cms", "departments", "P4"]
	);

test("Rule M: rung 3 on another module's table fails", () => {
	const out = validate(
		change(
			"ladder step 3 — start and end time",
			"cms/hrms/attendance/staff-attendance-configs"
		)
	);
	expect(out).toContain("Rule M");
	expect(out).toContain("hrms/attendance/config");
});

test("Rule M: rung 3 on this module's own table passes", () => {
	const out = validate(
		change("ladder step 3 — head of department", "cms/departments")
	);
	expect(out).not.toContain("Rule M");
});

test("Rule M: rung 5 citing another module's table passes", () => {
	const out = validate(
		change(
			"ladder step 5 — attendance config is a possible source",
			"cms/hrms/attendance/staff-attendance-configs"
		)
	);
	expect(out).not.toContain("Rule M");
});

test("Rule M: a table this module's screens already call counts as its own", () => {
	// The Departments screens call endpoints under hrms/, not departments/.
	const out = run(
		repo({
			"docs/fe-migration/_index/endpoints.json": {
				endpoints: [endpoint("hrms/org-units", ["cms/hrms/org-units"])],
			},
			"docs/fe-migration/_index/frontend-bindings.json": {
				bindings: [
					{
						app: "cms",
						module: "departments",
						clientFile: "apps/cms/modules/departments/api.ts",
						serverPath: `${MODULES}/hrms/org-units/common/schemas.ts`,
						symbols: [],
					},
				],
			},
			"docs/fe-migration/cms/departments/04-impact.json": {
				changes: [change("ladder step 3 — unit code", "cms/hrms/org-units")],
			},
		}),
		"fem-run/scripts/validate-outputs.ts",
		["cms", "departments", "P4"]
	);
	expect(out).not.toContain("Rule M");
});

test("parser reads wrapped form fields by their label", () => {
	const rows = Array.from(
		{ length: 20 },
		(_, i) =>
			`<label>Field ${i}</label><span class="wrap"><input type="text" placeholder=""></span>`
	).join("\n");
	const root = repo({
		"docs/fe-migration/designs/cms/demo/form.html": `<html><body><h1>Form</h1><form>${rows}</form></body></html>`,
	});
	const out = run(root, "fem-design-intake/scripts/parse-html.ts", [
		"cms",
		"demo",
	]);
	const doc = JSON.parse(
		readFileSync(
			join(root, "docs/fe-migration/cms/demo/02-new-design.json"),
			"utf8"
		)
	);
	const fields = doc.screens[0].elements.filter(
		(e: { kind: string }) => e.kind === "field"
	);
	expect(fields.length).toBe(21);
	expect(out).not.toContain("WARNING");
});

test("parser warns when a design parses to next to nothing", () => {
	const rows = Array.from(
		{ length: 20 },
		(_, i) =>
			`<div>Field ${i}</div><span class="wrap"><input type="text" placeholder=""></span>`
	).join("\n");
	const root = repo({
		"docs/fe-migration/designs/cms/demo/form.html": `<html><body><h1>Form</h1><form>${rows}</form></body></html>`,
	});
	const out = run(root, "fem-design-intake/scripts/parse-html.ts", [
		"cms",
		"demo",
	]);
	expect(out).toContain("WARNING");
});
