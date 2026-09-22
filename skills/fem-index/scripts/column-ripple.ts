#!/usr/bin/env bun
/**
 * A new column on a table — what else has to change, file by file.
 *
 *   column-ripple.ts cms/academic/subjects needs_lab
 *
 * "One additive field, nothing breaking" is true and useless. The developer
 * picking the work up needs to know WHICH schema objects gain the key, which
 * handlers must select it, and which front-end files will see it — and in a
 * schema-first codebase that last one is answerable, because the client imports
 * the server's own Zod schemas.
 *
 * This reads the index and prints that list as Markdown, ready to paste into
 * the REPORT. It is for REPORT.md only: the summary is for people who do not
 * read code, and a table of file paths is exactly what does not belong there.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const table = process.argv[2];
// The key being added. Named, because "what does a new column touch" is
// answered per key: a request schema gains it only if the key is something a
// caller sets, and a form needs a field only if it is.
const key = process.argv[3];

if (!(table && key)) {
	console.error(
		"usage: column-ripple.ts <table> <key>\n" +
			"  e.g. column-ripple.ts cms/academic/subjects needs_lab"
	);
	process.exit(2);
}
// snake_case in the database, camelCase in the contracts.
const camel = key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
// "cms/academic/subjects" → "Subject": the word a schema object is named after.
const Entity = ((table.split("/").pop() ?? table).replace(/s$/, "") || "")
	.split(/[-_]/)
	.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
	.join("");

type Endpoint = {
	id: string;
	serverPath: string;
	methods: string[];
	paths: string[];
	tables: string[];
	routeFile: string | null;
	handlerFiles: string[];
};
type Binding = {
	app: string;
	clientFile: string;
	serverPath: string;
	symbols: string[];
};

const idx = (f: string) =>
	JSON.parse(readFileSync(join(ROOT, CFG.paths.index, f), "utf8"));
const { endpoints } = idx("endpoints.json") as { endpoints: Endpoint[] };
const { bindings } = idx("frontend-bindings.json") as { bindings: Binding[] };
const { pages } = idx("pages.json") as {
	pages: { app: string; route: string; file: string; usesFiles?: string[] }[];
};

// apps/server/src/modules/cms/institutions/[institutionId]/…/subjects
//   → /api/cms/institutions/{institutionId}/…/subjects
const urlOf = (serverPath: string) =>
	`/api/${(serverPath.split("modules/").pop() ?? serverPath).replace(
		/\[(\w+)\]/g,
		"{$1}"
	)}`;
// The screens that reach a given module file, through the import chain the
// index already walked. This is what turns "a file changes" into "this screen
// changes".
const screensUsing = (
	clientFile: string
): { routes: string[]; direct: boolean } => {
	const direct = pages
		.filter((pg) => (pg.usesFiles ?? []).includes(clientFile))
		.map((pg) => pg.route);
	if (direct.length > 0) {
		return { routes: [...new Set(direct)], direct: true };
	}
	// The index walks three hops from a page, and a dialog four levels down is
	// still that screen's dialog. Saying "not reached from a page" reads as
	// dead code, which is worse than saying "through this screen's module".
	const folder = clientFile.split("/").slice(0, -1).join("/");
	const nearby = pages
		.filter((pg) =>
			(pg.usesFiles ?? []).some((f) =>
				f.startsWith(`${folder.split("/ui")[0]}/`)
			)
		)
		.map((pg) => pg.route);
	return { routes: [...new Set(nearby)], direct: false };
};

const touching = endpoints.filter((e) => e.tables?.includes(table));
if (touching.length === 0) {
	console.error(`no endpoint touches ${table}`);
	process.exit(1);
}

// The endpoints that OWN the table, by name affinity — the same test the
// endpoint lookup uses. A column change ripples through its own module's
// contracts; forty other endpoints that read the table in passing do not
// define its shape.
const own = (table.split("/").pop() ?? table).replace(/s$/, "");
const owners = touching.filter(
	(e) => e.serverPath.includes(own) || e.serverPath.includes(`${own}s`)
);
const rest = touching.filter((e) => !owners.includes(e));

// Every schema object a route file declares. These are what gain the key.
const schemasIn = (file: string): string[] => {
	const at = join(ROOT, file);
	if (!existsSync(at)) {
		return [];
	}
	return [
		...readFileSync(at, "utf8").matchAll(
			/export const (\w*(?:Request|Response|Query|Schema))\s*=/g
		),
	]
		.map((m) => m[1] as string)
		.filter((n, i, all) => all.indexOf(n) === i);
};

console.log(`### Adding \`${key}\` to \`${table}\`\n`);
console.log(
	`The contract name is \`${camel}\`. Every place below either carries that key or has to learn it.\n`
);

console.log("**1 · The API routes that carry this row**\n");
console.log("| Endpoint | Route | Paths | Methods | What changes |");
console.log("|---|---|---|---|---|");
for (const e of owners) {
	const base = urlOf(e.serverPath);
	// endpoints.json records paths relative to the feature folder, and the
	// folder is already in the URL — joining them blindly gave
	// /subjects/import/import.
	const subs = e.paths
		.map((sp) => (sp === "/" ? "" : sp))
		.filter((sp) => sp && !base.endsWith(sp))
		.map((sp) => `\`${sp}\``);
	const ms = e.methods.join(" ").toUpperCase();
	// Methods are recorded per endpoint, not per path, so say so rather than
	// implying DELETE works on every route under it.
	const writes = /POST|PUT|PATCH/.test(ms);
	console.log(
		`| \`${e.id}\` | \`${base}\` | ${subs.length ? subs.join(" ") : "—"} | ${ms} | ${
			writes
				? `accept \`${camel}\` where a subject is written, and return it on every read`
				: `return \`${camel}\``
		} |`
	);
}

console.log(`\n**2 · Server contracts that gain \`${camel}\`**\n`);
console.log("| Schema object | Kind | Add the key? | File |");
console.log("|---|---|---|---|");
for (const e of owners) {
	const objs = e.routeFile ? schemasIn(e.routeFile) : [];
	for (const o of objs) {
		// A schema file holds more than the entity: a syllabus item, a path
		// node, an import error. Saying all of them gain the key is worse than
		// saying nothing — a developer would go and add it to each.
		if (!o.includes(Entity)) {
			continue;
		}
		// `SubjectTypeSchema` is an enum of values, not the row. A schema named
		// for a property of the entity is not the entity.
		if (/^\w*Type(Schema)?$|^\w*StatusSchema$/.test(o)) {
			continue;
		}
		const kind = /Response/.test(o)
			? "response"
			: /Request/.test(o)
				? "request"
				: /Query/.test(o)
					? "query"
					: "the entity";
		const verdict =
			kind === "response"
				? "**yes** — so the screen can read it back"
				: kind === "request"
					? "**yes** — it is what the caller sets"
					: kind === "query"
						? "only if the screen filters by it"
						: "**yes** — this is the row itself";
		console.log(
			`| \`${o}\` | ${kind} | ${verdict} | \`${e.routeFile?.split("modules/").pop() ?? "—"}\` |`
		);
	}
}

console.log(
	`\n**3 · Handlers that must read, write and return \`${camel}\`**\n`
);
for (const e of owners) {
	for (const h of e.handlerFiles) {
		console.log(`- \`${h}\``);
	}
}
console.log(
	"\nThis codebase forbids `select()` without explicit columns, so every read of"
);
console.log(
	"this table names its columns and each one has to add the new key."
);

// Schema-first: the client imports the server's schemas, so adding a key to a
// schema reaches every one of these files. The ones that BUILD a request are
// the ones that need a form field; the rest only read.
const owned = new Set(owners.map((e) => e.serverPath));
const clients = bindings.filter((b) =>
	[...owned].some((sp) => b.serverPath.startsWith(sp))
);
console.log(
	`\n**4 · Front end — ${clients.length} file(s) import these schemas**\n`
);
console.log(
	"Schema-first: the client imports the server's Zod schemas, so the type"
);
console.log(
	"arrives on its own. What does NOT arrive is a form field or a column.\n"
);
console.log("| App | Screen | File | Symbols it imports | What it needs |");
console.log("|---|---|---|---|---|");
for (const b of clients) {
	// A Response schema is read; only a Request schema is something the file
	// fills in. "Create" alone matched CreateSubjectResponseSchema, which reads.
	const builds = b.symbols.some(
		(sym) => /Request/.test(sym) && !/Response/.test(sym)
	);
	const on = screensUsing(b.clientFile);
	const where = on.routes.length
		? on.routes.map((r) => `\`${r}\``).join("<br>") +
			(on.direct ? "" : " *(through this screen's module)*")
		: "*no page reaches this — check whether it is still used*";
	console.log(
		`| ${b.app} | ${where} | \`${b.clientFile.split("modules/").pop()}\` | ${b.symbols
			.map((sym) => `\`${sym}\``)
			.join(", ")} | ${
			builds
				? `**an input for \`${camel}\`** — it builds a request`
				: "nothing, unless it should display it"
		} |`
	);
}

if (rest.length > 0) {
	console.log(
		`\n**Other endpoints that read this table** — ${rest.length}. They select their own columns, so an addition does not reach them:\n`
	);
	for (const e of rest.slice(0, 12)) {
		console.log(`- \`${e.id}\` ${e.serverPath.split("modules/").pop()}`);
	}
	if (rest.length > 12) {
		console.log(`- …and ${rest.length - 12} more`);
	}
}
