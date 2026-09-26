#!/usr/bin/env bun
/**
 * Which endpoints already touch this table?
 *
 *   endpoints-for-table.ts cms/academic/nodes
 *
 * Exists because of one mistake: a change needing "save the whole structure in
 * one press" was priced as a new endpoint, 7.4 days, a third of its module.
 * The endpoint already existed — it took the whole structure, ordered it and
 * wrote it in a transaction — and was already being called from the screen
 * next door. Nobody had looked, because nothing made them.
 *
 * So before pricing a new one, ask this. It reads the index, which already
 * knows every endpoint, its methods and the tables it writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { affinity, ownersOf } from "./table-owners.ts";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const table = process.argv[2];

if (!table) {
	console.error(
		"usage: endpoints-for-table.ts <table>\n" +
			"  e.g. endpoints-for-table.ts cms/academic/nodes\n" +
			"  (table names are the ones endpoints.json reports)"
	);
	process.exit(2);
}

type Endpoint = {
	id: string;
	serverPath: string;
	methods: string[];
	paths: string[];
	tables: string[];
};
const { endpoints } = JSON.parse(
	readFileSync(join(ROOT, CFG.paths.index, "endpoints.json"), "utf8")
) as { endpoints: Endpoint[] };

const hits = endpoints.filter((e) => e.tables?.includes(table));
if (hits.length === 0) {
	console.log(`no endpoint touches ${table}`);
	console.log("Check the table name against _index/endpoints.json before");
	console.log("concluding that nothing exists.");
	process.exit(0);
}

// Writers first, and among writers the ones that BELONG to this table rather
// than touching it in passing. Forty-four endpoints read the academic tree;
// the three that own it are the ones that answer "does this already exist".
const writes = (e: Endpoint) =>
	e.methods.some((m) => ["post", "put", "patch", "delete"].includes(m));
// Shared words between the table's name and the endpoint's path. "nodes"
// against ".../academic-nodes/bulk-import" scores; against
// ".../fee-management/rate-card" it does not. The rules live in
// table-owners.ts, shared with the column ripple and the validator.
const { words, owners: owning } = ownersOf(table, hits);
const score = (e: Endpoint) => affinity(words, e.serverPath);
const sorted = [...hits].sort(
	(a, b) =>
		Number(owning.includes(b)) - Number(owning.includes(a)) ||
		score(b) - score(a) ||
		Number(writes(b)) - Number(writes(a)) ||
		a.id.localeCompare(b.id)
);

const owners = sorted.filter((e) => owning.includes(e));
const others = sorted.filter((e) => !owning.includes(e));

const show = (e: Endpoint) => {
	console.log(`  ${e.id}  ${writes(e) ? "WRITES" : "reads "}  ${e.serverPath}`);
	console.log(
		`      ${e.methods.join(" ")} · ${e.paths.slice(0, 4).join(" ")}${e.paths.length > 4 ? " …" : ""}`
	);
};

console.log(`${hits.length} endpoint(s) touch ${table}\n`);
if (owners.length === 0) {
	console.log(
		"── none of them is named after this table; the list below is everything ──\n"
	);
}
if (owners.length > 0) {
	console.log(`── ${owners.length} that belong to it ──\n`);
	for (const e of owners) {
		show(e);
	}
}
if (others.length > 0) {
	console.log(
		`\n── ${others.length} more touch it in passing (${others.filter(writes).length} of them write) ──`
	);
	console.log("   run with --all to list them");
	if (process.argv.includes("--all")) {
		console.log("");
		for (const e of others) {
			show(e);
		}
	}
}
console.log(
	"\nName the ones you considered in the layer's searchedEndpoints, and say"
);
console.log("why none of them fits, before pricing a new endpoint.");
