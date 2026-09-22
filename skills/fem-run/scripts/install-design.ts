#!/usr/bin/env bun
/**
 * Put a design where the workflow expects it, and get out of the way.
 *
 *   bun install-design.ts cms academic-calendar ~/Downloads/whatever.html
 *
 * Nobody should have to remember the folder layout, and nobody should lose a
 * finished run by dropping a new design on top of it. So this does both jobs:
 * it files the design under its module, and if a run already exists for an
 * OLDER design it archives that run — documents and design together — before
 * the new one lands.
 *
 * Re-filing the same design is a no-op: the run continues where it left off.
 */
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const DESIGNS: string = CFG.paths.designs;
const OUTPUT: string = CFG.paths.output;

const [app, moduleName, source] = process.argv.slice(2);

if (!(app && moduleName && source)) {
	console.error(
		"usage: install-design.ts <app> <module> <path-to-design.html>\n" +
			"  e.g. install-design.ts cms academic-calendar ~/Downloads/calendar.html"
	);
	process.exit(1);
}

const from = resolve(source.replace(/^~/, process.env.HOME ?? "~"));
if (!existsSync(from)) {
	console.error(`no such file: ${from}`);
	process.exit(1);
}
if (!from.toLowerCase().endsWith(".html")) {
	console.error(`not an .html file: ${basename(from)}`);
	process.exit(1);
}

const sha = (p: string) =>
	createHash("sha256").update(readFileSync(p)).digest("hex");

const designDir = join(ROOT, DESIGNS, app, moduleName);
const designAt = join(designDir, `${moduleName}.html`);
const runDir = join(ROOT, OUTPUT, app, moduleName);
const incoming = sha(from);

// Same design as last time → leave everything alone, so a resumed run keeps
// its gates and its answered questions.
if (existsSync(designAt) && sha(designAt) === incoming) {
	console.log(`design   unchanged · ${moduleName}.html`);
	console.log(
		`run      ${existsSync(runDir) ? "continues where it left off" : "not started yet"}`
	);
	process.exit(0);
}

// A finished run belongs to the design it was run against. Keep them together.
if (existsSync(runDir) && readdirSync(runDir).length > 0) {
	const stamp = new Date().toISOString().slice(0, 10);
	// Continue the module's own numbering rather than restarting per day, so
	// run3 always follows run2 even when they were archived weeks apart.
	const taken = readdirSync(join(ROOT, OUTPUT, app));
	const runOf = new RegExp(`^${moduleName}\\.run(\\d+)-`);
	let n = 1;
	for (const name of taken) {
		const seen = runOf.exec(name);
		if (seen?.[1]) {
			n = Math.max(n, Number.parseInt(seen[1], 10) + 1);
		}
	}
	const archive = join(ROOT, OUTPUT, app, `${moduleName}.run${n}-${stamp}`);
	renameSync(runDir, archive);
	if (existsSync(designAt)) {
		renameSync(designAt, join(archive, `${moduleName}.run${n}.html`));
	}
	console.log(
		`archived previous run → ${basename(archive)}/ (with its design)`
	);
}

mkdirSync(designDir, { recursive: true });
mkdirSync(runDir, { recursive: true });
copyFileSync(from, designAt);

// A design the workflow has never seen starts a fresh state file, so an
// archived run's gates cannot leak onto it.
const stateAt = join(runDir, "state.json");
if (existsSync(stateAt)) {
	writeFileSync(
		stateAt,
		`${JSON.stringify({ app, module: moduleName, phases: {}, gates: {} }, null, "\t")}\n`
	);
}

console.log(
	`design   ${basename(from)} → ${DESIGNS}/${app}/${moduleName}/${moduleName}.html`
);
console.log(`results  ${OUTPUT}/${app}/${moduleName}/`);
console.log(`sha256   ${incoming.slice(0, 16)}`);
