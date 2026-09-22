#!/usr/bin/env bun
/**
 * fem-estimate — P5 arithmetic. Deterministic, so the same impact always
 * produces the same days (NFR-6: every number traces to a rubric row).
 *
 * The LLM half of fem-estimate chooses WHICH rubric rows apply.
 * This script does the maths, in the order pinned in fem.config.json.
 *
 *   bun .../compute-estimate.ts <app> <module>
 * reads  04-impact.json   writes  05-estimate.json|md|csv
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const [app, moduleName] = process.argv.slice(2);

// A module may be a route prefix — "hrms/admin/leaves" — so that a design
// covering one part of a large module can be analysed on its own. Folders are
// named flat, so a run is one directory and the archive numbering keeps
// working.
const moduleDir = moduleName.replace(/\//g, "-");
if (!(app && moduleName)) {
	console.error("usage: compute-estimate.ts <app> <module>");
	process.exit(2);
}

const dir = join(ROOT, CFG.paths.output, app, moduleDir);
const impact = JSON.parse(readFileSync(join(dir, "04-impact.json"), "utf8"));

const mid = (v: number | number[]) =>
	Array.isArray(v) ? (v[0] + v[1]) / 2 : v;
const LAYERS = [
	"L1",
	"L2",
	"L3",
	"L4",
	"L5",
	"L6",
	"L7",
	"L8",
	"L9",
	"L10",
	"L11",
	"L12",
] as const;
const round = (n: number) => Number(n.toFixed(2));

type Row = {
	id: string;
	type: string;
	p50: number;
	p90: number;
	confidence: string;
	multipliers: string[];
	byLayer: Record<string, number>;
	rubricRows: string[];
};

function sizeOf(
	layer: string,
	items: string[]
): { days: number; rows: string[] } {
	const table = CFG.baseSizes[layer] ?? {};
	let days = 0;
	const rows: string[] = [];
	for (const key of items) {
		if (!(key in table)) {
			continue;
		}
		days += mid(table[key]);
		rows.push(`${layer}.${key}=${mid(table[key])}`);
	}
	return { days, rows };
}

/**
 * Guard against the exact failure mode 2.2 names: "hidden costs are missed —
 * e2e selector rewrites ... estimates run 30-100% under".
 *
 * V0 and V1 skip BACKEND tracing but still cost L10, one spec + page object per
 * screen. A P4 that drops them entirely produces a silently low estimate, and
 * nothing else in the pipeline notices. Refuse rather than under-report.
 */
const catalogued = (impact.changes ?? []).length;
const visualMissingL10 = (impact.changes ?? []).filter(
	(c: { type?: string; impact?: Record<string, { change?: string }> }) =>
		(c.type === "V0" || c.type === "V1") &&
		(!c.impact?.L10 || c.impact.L10.change === "none")
);
if (visualMissingL10.length > 0) {
	console.error(
		`${visualMissingL10.length} V0/V1 change(s) carry no L10 cost. Visual-only\n` +
			"changes still require an e2e spec and page object per screen (6.1).\n" +
			"Add L10 in 04-impact.json, or the estimate is low by 0.5-1d each."
	);
	process.exit(1);
}
if (catalogued === 0) {
	console.error("04-impact.json has no changes. Did P4 run?");
	process.exit(1);
}

// Cross-check against P3. `catalogueSize` is written by fem-impact from the
// screen map. If P4 dropped V0 items instead of carrying them with L10 only,
// the estimate is low and nothing else in the pipeline would notice.
const catalogueSize: number | undefined = impact.catalogueSize;
if (catalogueSize === undefined) {
	console.error(
		"04-impact.json has no `catalogueSize`. fem-impact must record how many\n" +
			"changes P3 catalogued, so a dropped change cannot pass unnoticed."
	);
	process.exit(1);
}
if (catalogued < catalogueSize) {
	console.error(
		`P3 catalogued ${catalogueSize} changes, P4 traced ${catalogued}.\n` +
			`${catalogueSize - catalogued} missing. V0 and V1 skip BACKEND tracing\n` +
			"but must still appear with their L10 cost (6.1) — 0.5-1d per screen each."
	);
	process.exit(1);
}

const rows: Row[] = [];
for (const c of impact.changes ?? []) {
	const byLayer: Record<string, number> = {};
	const rubricRows: string[] = [];

	// 1 · sum L1-L6
	let core = 0;
	for (const L of ["L1", "L2", "L3", "L4", "L5", "L6"]) {
		const { days, rows: r } = sizeOf(L, c.impact?.[L]?.rubric ?? []);
		byLayer[L] = round(days);
		core += days;
		rubricRows.push(...r);
	}

	// 2 · risk multipliers, capped
	const mults: string[] = [];
	let m = 1;
	for (const [name, value] of Object.entries<number>(CFG.riskMultipliers)) {
		if ((c.risks ?? []).includes(name)) {
			m *= value;
			mults.push(`${name}=x${value}`);
		}
	}
	if (m > CFG.riskMultiplierCap) {
		mults.push(`CAPPED at x${CFG.riskMultiplierCap}`);
		m = CFG.riskMultiplierCap;
	}
	core *= m;
	for (const L of ["L1", "L2", "L3", "L4", "L5", "L6"]) {
		byLayer[L] = round(byLayer[L] * m);
	}

	// 3 · L7 is a PERCENTAGE of the multiplied L1-L6 sum
	byLayer.L7 = round(core * CFG.baseSizes.L7.rate);
	rubricRows.push(`L7=${CFG.baseSizes.L7.rate * 100}% of L1-L6`);

	// 4 · L8-L12, unmultiplied
	let tail = 0;
	for (const L of ["L8", "L9", "L10", "L11", "L12"]) {
		const { days, rows: r } = sizeOf(L, c.impact?.[L]?.rubric ?? []);
		byLayer[L] = round(days);
		tail += days;
		rubricRows.push(...r);
	}

	const p50 = round(core + byLayer.L7 + tail);

	// 7 · P90 from evidence state
	const anyUnanswered = LAYERS.some((L) => c.impact?.[L]?.blockedOnQuestion);
	const anyAssumed = LAYERS.some((L) => c.impact?.[L]?.assumed);
	const ev = anyUnanswered
		? "ambiguity_question_unanswered"
		: anyAssumed
			? "any_assumed"
			: "all_evidenced";
	const p90 = round(p50 * CFG.evidenceState[ev]);

	rows.push({
		id: c.id,
		type: c.type,
		p50,
		p90,
		confidence: anyUnanswered || anyAssumed ? "Medium" : "High",
		multipliers: mults,
		byLayer,
		rubricRows: [...new Set(rubricRows)].sort(),
	});
}

// module totals — 6 · +15% overhead
const sum = (k: "p50" | "p90") => round(rows.reduce((n, r) => n + r[k], 0));
const subtotal50 = sum("p50"),
	subtotal90 = sum("p90");
const assumedShare = rows.length
	? rows.filter((r) => r.confidence !== "High").length / rows.length
	: 0;
const confidence =
	assumedShare === 0
		? "High"
		: assumedShare <= CFG.confidence.medium
			? "Medium"
			: "Low";

const byLayerTotal: Record<string, number> = {};
for (const L of LAYERS) {
	byLayerTotal[L] = round(rows.reduce((n, r) => n + (r.byLayer[L] ?? 0), 0));
}

const out = {
	app,
	module: moduleName,
	ref: impact.ref,
	orderOfOperations: CFG.orderOfOperations,
	changes: rows,
	byLayer: byLayerTotal,
	totals: {
		subtotalP50: subtotal50,
		subtotalP90: subtotal90,
		overheadRate: CFG.moduleOverhead,
		p50: round(subtotal50 * (1 + CFG.moduleOverhead)),
		p90: round(subtotal90 * (1 + CFG.moduleOverhead)),
	},
	confidence,
	assumedShare: round(assumedShare),
	topDrivers: [...rows]
		.sort((a, b) => b.p50 - a.p50)
		.slice(0, 5)
		.map((r) => ({ id: r.id, p50: r.p50 })),
};
writeFileSync(
	join(dir, "05-estimate.json"),
	`${JSON.stringify(out, null, 2)}\n`
);
writeFileSync(
	join(dir, "05-estimate.csv"),
	`${[
		`id,type,p50,p90,confidence,${LAYERS.join(",")}`,
		...rows.map((r) =>
			[
				r.id,
				r.type,
				r.p50,
				r.p90,
				r.confidence,
				...LAYERS.map((L) => r.byLayer[L] ?? 0),
			].join(",")
		),
	].join("\n")}\n`
);
writeFileSync(
	join(dir, "05-estimate.md"),
	`# ${app} / ${moduleName} — estimate\n\n` +
		"| | P50 | P90 |\n|---|---|---|\n" +
		`| subtotal | ${subtotal50} | ${subtotal90} |\n` +
		`| +${CFG.moduleOverhead * 100}% overhead | **${out.totals.p50}** | **${out.totals.p90}** |\n\n` +
		`Confidence **${confidence}** · ${(assumedShare * 100).toFixed(0)}% of items assumed\n\n` +
		"## By layer\n\n```\n" +
		LAYERS.map(
			(L) => `  ${L.padEnd(4)} ${String(byLayerTotal[L]).padStart(7)}`
		).join("\n") +
		"\n```\n\n## Order of operations\n\n```\n" +
		CFG.orderOfOperations.map((s: string) => `  ${s}`).join("\n") +
		"\n```\n"
);

console.log(`fem-estimate · ${app}/${moduleName}`);
console.log(
	`  changes ${rows.length} · P50 ${out.totals.p50}d · P90 ${out.totals.p90}d · ${confidence}`
);
