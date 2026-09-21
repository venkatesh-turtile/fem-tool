#!/usr/bin/env bun
import { createHash } from "node:crypto";
/**
 * fem-design-intake — P2 script half. Parses new design HTML into the same
 * screen spec fem-baseline emits, so P3 can diff them directly.
 *
 * NFR-7: HTML is untrusted data. This parses with regex over the raw text and
 * never executes it. If a file has no parseable DOM it is reported as
 * UNPARSEABLE, never silently empty.
 *
 *   bun .../parse-html.ts <app> <module>
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
const [app, moduleName] = process.argv.slice(2);
if (!(app && moduleName)) {
	console.error("usage: parse-html.ts <app> <module>");
	process.exit(2);
}

const srcDir = join(ROOT, CFG.paths.designs, app, moduleName);
if (!existsSync(srcDir)) {
	console.error(
		`no designs at ${CFG.paths.designs}/${app}/${moduleName}\nAsk UX to drop one HTML file per screen state there — see §14 Q1.`
	);
	process.exit(2);
}

// NFR-3: ids derive from the screen name, not file order.
const shortId = (v: string) =>
	createHash("sha256").update(v).digest("hex").slice(0, 6);

const strip = (h: string) =>
	h
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "");
// Entities survive stripping tags, so "Save &amp; exit" reached the change
// catalogue verbatim on the 15 Sep runs. Decode the handful a design export
// actually emits, plus numeric escapes.
const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	times: "x",
	ndash: "-",
	mdash: "-",
	hellip: "...",
	rsquo: "'",
	lsquo: "'",
	ldquo: '"',
	rdquo: '"',
	middot: "-",
	laquo: "<<",
	raquo: ">>",
	deg: "deg",
};
const decode = (v: string) =>
	v
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n: string) =>
			String.fromCodePoint(Number.parseInt(n, 16))
		)
		.replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);

const text = (h: string) =>
	decode(h.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
const all = (h: string, re: RegExp) => [...h.matchAll(re)];

/** Is there real DOM here, or is it a compiled React bundle? */
function parseability(raw: string) {
	const dom = strip(raw);
	const semantic = (
		dom.match(
			/<(table|th|td|input|button|select|form|nav|h[1-6]|ul|li|a)\b/gi
		) ?? []
	).length;
	const createElement = (raw.match(/createElement/g) ?? []).length;
	return {
		semanticTags: semantic,
		createElementCalls: createElement,
		parseable: semantic >= 10,
		reason:
			semantic >= 10
				? null
				: createElement > 50
					? `compiled React — ${createElement} createElement calls, only ${semantic} semantic tags. The content does not exist until the bundle runs.`
					: `only ${semantic} semantic tags found.`,
	};
}

type Screen = {
	id: string;
	name: string;
	route: null;
	file: string;
	state: string;
	parseable: boolean;
	diagnostics: unknown;
	elements: El[];
};
type El = {
	id: string;
	kind: string;
	label: string;
	binding: null;
	static: boolean;
};
function elements(raw: string, sid: string): El[] {
	const h = strip(raw);
	const out: { kind: string; label: string }[] = [];
	const push = (kind: string, label: string) => {
		const l = text(label);
		if (l && l.length < 120) {
			out.push({ kind, label: l });
		}
	};

	for (const m of all(h, /<th[^>]*>([\s\S]*?)<\/th>/gi)) {
		push("column", m[1]);
	}
	for (const m of all(h, /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
		push("field", m[1]);
	}
	for (const m of all(h, /<button[^>]*>([\s\S]*?)<\/button>/gi)) {
		push("action", m[1]);
	}
	for (const m of all(h, /<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
		push("action", m[1]);
	}
	for (const m of all(h, /<select[^>]*>/gi)) {
		push("filter", m[0].match(/name=["']([^"']+)/)?.[1] ?? "select");
	}
	for (const m of all(h, /<input[^>]*>/gi)) {
		const t = m[0].match(/type=["']([^"']+)/)?.[1] ?? "text";
		const n =
			m[0].match(/(?:name|placeholder|aria-label)=["']([^"']+)/)?.[1] ?? t;
		push(t === "search" ? "search" : "filter", n);
	}
	for (const m of all(h, /role=["']tab["'][^>]*>([\s\S]*?)</gi)) {
		push("tab", m[1]);
	}
	for (const _m of all(h, /role=["']dialog["']/gi)) {
		push("dialog", "dialog");
	}

	const seen = new Set<string>();
	return out
		.filter((e) => {
			const k = `${e.kind}|${e.label}`;
			if (seen.has(k)) {
				return false;
			}
			seen.add(k);
			return true;
		})
		.map((e, i) => ({
			id: `E-${sid}-${String(i + 1).padStart(3, "0")}`,
			kind: e.kind,
			label: e.label,
			binding: null,
			static: false,
		}));
}

const files = readdirSync(srcDir)
	.filter((f) => f.endsWith(".html"))
	.sort();
const hashes: Record<string, string> = {};
const screens: Screen[] = [];
const questions: string[] = [];
let unparseable = 0;

files.forEach((f, i) => {
	const raw = readFileSync(join(srcDir, f), "utf8");
	hashes[f] = createHash("sha256").update(raw).digest("hex");
	const p = parseability(raw);
	// "<screen>--<state>.html"  — §14 Q1
	const [base, state = "default"] = f.replace(/\.html$/, "").split("--");
	const sid = `${moduleName}-${shortId(`${base}--${state}`)}`;

	if (!p.parseable) {
		unparseable++;
		questions.push(
			`**${f} is UNPARSEABLE** — ${p.reason}\n  Nothing was extracted. Do not treat this screen as empty.`
		);
		screens.push({
			id: `S-${sid}`,
			name: base,
			route: null,
			file: f,
			state,
			parseable: false,
			diagnostics: p,
			elements: [],
		});
		return;
	}
	const els = elements(raw, sid);
	if (!els.some((e) => e.kind === "empty-state")) {
		questions.push(`${f}: no empty state visible — is one designed?`);
	}
	screens.push({
		id: `S-${sid}`,
		name: base,
		route: null,
		file: f,
		state,
		parseable: true,
		diagnostics: p,
		elements: els,
	});
});

const outDir = join(ROOT, CFG.paths.output, app, moduleName);
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "02-new-design.json"),
	`${JSON.stringify(
		{
			app,
			module: moduleName,
			source: "design-html",
			ref: { files: hashes },
			screens,
		},
		null,
		2
	)}\n`
);
writeFileSync(
	join(outDir, "questions.md"),
	`# ${app} / ${moduleName} — ambiguity questions\n\n` +
		"Spec §8 P2: raise questions, never guess silently. Unanswered questions take\n" +
		"P90 to x2.0 (§9.3) and block gate 2 for the items they touch.\n\n" +
		(questions.length
			? questions.map((q, i) => `${i + 1}. ${q}`).join("\n\n")
			: "_none_") +
		"\n"
);

console.log(`fem-design-intake · ${app}/${moduleName}`);
console.log(
	`  files ${files.length} · parseable ${files.length - unparseable} · UNPARSEABLE ${unparseable}`
);
console.log(
	`  elements ${screens.reduce((n: number, s: Screen) => n + s.elements.length, 0)} · questions ${questions.length}`
);
if (unparseable) {
	console.error(
		`\n  ${unparseable} file(s) could not be parsed. P3 MUST NOT run on this output.`
	);
	console.error(
		"  Fix: ask UX for semantic HTML, or render headless in a sandbox first"
	);
	console.error(
		`  (NFR-7 then changes from "parse, never execute" to "execute sandboxed, then parse").`
	);
	process.exit(1);
}
