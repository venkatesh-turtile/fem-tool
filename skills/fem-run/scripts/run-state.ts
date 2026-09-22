#!/usr/bin/env bun
import { createHash } from "node:crypto";
/**
 * fem-run — state machine. Owns state.json: which phase a module has reached,
 * which gates are approved, and the SHA-256 of each design file so a design
 * update invalidates only the phases downstream of it (NFR-3, NFR-4).
 *
 *   run-state.ts status  <app> <module>
 *   run-state.ts next    <app> <module>            what should run now
 *   run-state.ts done    <app> <module> <phase>
 *   run-state.ts approve <app> <module> <gate1|gate2> <who>
 *   run-state.ts rehash  <app> <module>            detect changed designs
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const [cmd, app, moduleName, ...rest] = process.argv.slice(2);

// A module may be a route prefix — "hrms/admin/leaves" — so that a design
// covering one part of a large module can be analysed on its own. Folders are
// named flat, so a run is one directory and the archive numbering keeps
// working.
const moduleDir = moduleName.replace(/\//g, "-");
if (!(cmd && app && moduleName)) {
	console.error(
		"usage: run-state.ts <status|next|done|approve|rehash> <app> <module> [...]"
	);
	process.exit(2);
}

const PHASES = [
	{ id: "P1", skill: "fem-baseline", out: "01-baseline.json", gate: null },
	{
		id: "P2",
		skill: "fem-design-intake",
		out: "02-new-design.json",
		gate: null,
	},
	{ id: "P3", skill: "fem-screen-map", out: "03-screen-map.md", gate: "gate1" },
	{ id: "P4", skill: "fem-impact", out: "04-impact.json", gate: null },
	{ id: "P5", skill: "fem-estimate", out: "05-estimate.json", gate: null },
	{ id: "P6", skill: "fem-tradeoff", out: "06-decisions.md", gate: "gate2" },
	{ id: "P7", skill: "fem-plan", out: "07-plan.md", gate: null },
	{ id: "P8", skill: "fem-report", out: "REPORT.md", gate: null },
] as const;

const dir = join(ROOT, CFG.paths.output, app, moduleDir);
const statePath = join(dir, "state.json");
mkdirSync(dir, { recursive: true });

type State = {
	app: string;
	module: string;
	phases: Record<string, string>;
	gates: Record<string, { approvedBy: string } | null>;
	phaseTimes?: Record<string, string>;
	designHashes: Record<string, string>;
};
const blank: State = {
	app,
	module: moduleName,
	phases: {},
	gates: { gate1: null, gate2: null },
	designHashes: {},
};
const state: State = existsSync(statePath)
	? JSON.parse(readFileSync(statePath, "utf8"))
	: blank;
const save = () =>
	writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

function hashDesigns(): Record<string, string> {
	const d = join(ROOT, CFG.paths.designs, app, moduleDir);
	if (!existsSync(d)) {
		return {};
	}
	return Object.fromEntries(
		readdirSync(d)
			.filter((f) => f.endsWith(".html"))
			.sort()
			.map((f) => [
				f,
				createHash("sha256")
					.update(readFileSync(join(d, f)))
					.digest("hex"),
			])
	);
}

switch (cmd) {
	case "status": {
		console.log(`${app}/${moduleName}`);
		for (const p of PHASES) {
			const done = state.phases[p.id];
			const gate = p.gate
				? state.gates[p.gate]
					? `gate approved by ${state.gates[p.gate]?.approvedBy}`
					: "GATE PENDING"
				: "";
			console.log(
				`  ${p.id}  ${p.skill.padEnd(18)} ${done ? "done" : "-   "}  ${gate}`
			);
		}
		break;
	}
	case "next": {
		for (const p of PHASES) {
			if (!state.phases[p.id]) {
				console.log(`${p.id} ${p.skill}`);
				process.exit(0);
			}
			if (p.gate && !state.gates[p.gate]) {
				console.log(
					`BLOCKED ${p.gate} — needs approval before ${PHASES[PHASES.indexOf(p) + 1]?.id}`
				);
				process.exit(3);
			}
		}
		console.log("COMPLETE");
		break;
	}
	case "done": {
		const phase = rest[0];
		const p = PHASES.find((x) => x.id === phase);
		if (!p) {
			console.error(`unknown phase ${phase}`);
			process.exit(2);
		}
		if (!existsSync(join(dir, p.out))) {
			console.error(`${p.id} claims done but ${p.out} is missing`);
			process.exit(1);
		}
		if (p.id === "P8" && !existsSync(join(dir, "SUMMARY.md"))) {
			console.error("P8 claims done but SUMMARY.md is missing");
			process.exit(1);
		}
		// Schemas and fem rules, checked before the phase is recorded. Two real
		// errors reached a signed-off report before this existed.
		const check = Bun.spawnSync([
			"bun",
			join(import.meta.dir, "validate-outputs.ts"),
			app,
			moduleName,
			p.id,
		]);
		const checkOut = new TextDecoder().decode(check.stdout).trim();
		const checkErr = new TextDecoder().decode(check.stderr).trim();
		if (check.exitCode !== 0) {
			console.error(checkErr || checkOut);
			console.error(
				`${p.id} NOT recorded — fix the output above, then re-run done`
			);
			process.exit(1);
		}
		if (checkOut.includes("warn ")) {
			console.log(checkOut);
		}
		state.phases[p.id] = p.out;
		// When, not only whether. An answer given after P4 was recorded means
		// the trace cannot reflect it, and a file's mtime cannot be trusted to
		// say so — it is reset by a copy, a checkout or a branch switch.
		state.phaseTimes ??= {};
		state.phaseTimes[p.id] = new Date().toISOString();
		if (p.id === "P2") {
			state.designHashes = hashDesigns();
		}
		save();
		console.log(`${p.id} recorded`);
		break;
	}
	case "approve": {
		const [gate, who] = rest;
		if (!["gate1", "gate2"].includes(gate ?? "")) {
			console.error("gate must be gate1 or gate2");
			process.exit(2);
		}
		if (!who) {
			console.error("name who approved — gates are accountable (§7.1.4)");
			process.exit(2);
		}
		state.gates[gate] = { approvedBy: who };
		save();
		console.log(`${gate} approved by ${who}`);
		break;
	}
	case "rehash": {
		const now = hashDesigns(),
			was = state.designHashes ?? {};
		const changed = Object.keys({ ...now, ...was })
			.filter((f) => now[f] !== was[f])
			.sort();
		if (!changed.length) {
			console.log("no design changes");
			break;
		}
		console.log(`changed: ${changed.join(", ")}`);
		console.log(
			"invalidating P2 onward — stable IDs mean you get a catalogue DIFF, not a new catalogue (NFR-3)"
		);
		for (const p of PHASES) {
			if (p.id !== "P1") {
				delete state.phases[p.id];
			}
		}
		state.gates.gate1 = null;
		state.gates.gate2 = null;
		save();
		break;
	}
	default:
		console.error(`unknown command ${cmd}`);
		process.exit(2);
}
