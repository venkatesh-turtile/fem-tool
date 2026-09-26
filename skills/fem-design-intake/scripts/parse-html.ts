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

// A module may be a route prefix — "hrms/admin/leaves" — so that a design
// covering one part of a large module can be analysed on its own. Folders are
// named flat, so a run is one directory and the archive numbering keeps
// working.
const moduleDir = moduleName.replace(/\//g, "-");
if (!(app && moduleName)) {
	console.error("usage: parse-html.ts <app> <module>");
	process.exit(2);
}

const srcDir = join(ROOT, CFG.paths.designs, app, moduleDir);
if (!existsSync(srcDir)) {
	console.error(
		`no designs at ${CFG.paths.designs}/${app}/${moduleName}\nAsk UX to drop one HTML file per screen state there — see §14 Q1.`
	);
	process.exit(2);
}

// Which kinds of institution this repo analyses, and how a design marks each
// one. A marker is a CSS fragment — the 3D designs switch with a class on the
// body — so a rule naming it belongs to that variant.
const SCOPE = CFG.institutionScope ?? {};
const IN_SCOPE: string[] = SCOPE.inScope ?? [];
const VARIANT_MARKERS: Record<string, string> = SCOPE.variantMarkers ?? {};

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

/** How far past a </label> a control still counts as that label's field. */
const LABEL_REACH = 400;

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
	hiddenByCss?: Hidden[];
	elements: El[];
};
type El = {
	id: string;
	kind: string;
	label: string;
	binding: null;
	static: boolean;
};

/**
 * What the design DECLARES but never SHOWS.
 *
 * The parser reads markup and nothing else, so a column removed in CSS is
 * invisible to it. On cms/academic-structure that mattered twice in one run:
 * a subjects table declaring eleven columns showed seven, and two items were
 * traced as new storage that the design had deliberately taken off the page —
 * "the week is set where a subject is given to a class", "the lab is a row of
 * its own here now". Both sentences were sitting in a comment above the rule.
 *
 * So: find `display:none` rules, work out which column each one removes, and
 * carry the design's own explanation with it.
 *
 * It also catches the more valuable case. When a rule is qualified by a class
 * on `body` — `body.coll` versus `body:not(.coll)` — the design is drawing TWO
 * variants of the same screen, one per kind of institution. That is a finding
 * about who the design serves, and it is the question every module has to
 * answer.
 */
type Hidden = {
	selector: string;
	table: string | null;
	columnIndex: number | null;
	shownTo: string | null;
	reason: string | null;
	hiddenFrom: string | null;
	inScope: boolean;
};

function hiddenByCss(raw: string): Hidden[] {
	const found = new Map<string, Hidden>();
	for (const style of all(raw, /<style[^>]*>([\s\S]*?)<\/style>/gi)) {
		const css = style[1] ?? "";
		// Where every /* ... */ sits, so a rule found INSIDE one can be skipped.
		// A comment explaining a rule tends to quote it -- "/* .btn { display:none }
		// is not enough */" -- and the rule scanner below matched the braces in
		// the quote, cut the comment in half, and reported the prose either side
		// of a comma as two selectors. Real findings ended up next to entries
		// like "is not", which makes the whole block look untrustworthy.
		const commentSpans: [number, number][] = [];
		for (const cm of all(css, /\/\*[\s\S]*?\*\//g)) {
			const from = cm.index ?? 0;
			commentSpans.push([from, from + cm[0].length]);
		}
		const inComment = (i: number) =>
			commentSpans.some(([from, to]) => i >= from && i < to);
		// Walk rule by rule. The text between the previous rule and this one's
		// brace holds the selector AND any comment above it, which is where the
		// designer says why a column comes off the page.
		let cursor = 0;
		for (const rule of all(css, /\{([^{}]*)\}/g)) {
			const at = rule.index ?? 0;
			if (inComment(at)) {
				continue;
			}
			const head = css.slice(cursor, at);
			cursor = at + rule[0].length;
			const body = rule[1] ?? "";
			if (!/display\s*:\s*none/i.test(body)) {
				continue;
			}
			const comments = [...head.matchAll(/\/\*([\s\S]*?)\*\//g)].map((c) =>
				(c[1] ?? "").replace(/\s+/g, " ").trim()
			);
			const reason = comments.length > 0 ? (comments.at(-1) ?? null) : null;
			const selectors = head.replace(/\/\*[\s\S]*?\*\//g, "").trim();
			for (const sel of selectors.split(",")) {
				const one = sel.trim();
				if (!one) {
					continue;
				}
				// A selector names something. Prose that survived a malformed
				// comment does not, and it is worth dropping rather than
				// reporting: a findings block with "is not" in it gets ignored
				// wholesale, including the findings that matter.
				const looksLikeSelector =
					/^[\w.#:[>+~*\]()="'-]/.test(one) && !/\s{2,}|[.!?]\s|\n/.test(one);
				if (!looksLikeSelector) {
					continue;
				}
				const nth = /nth-child\(\s*(\d+)\s*\)/.exec(one);
				const table = /\[data-t=["']([^"']+)["']\]/.exec(one)?.[1] ?? null;
				const bodyClass = /body\s*(:not\()?\.([\w-]+)\)?/.exec(one);
				let shownTo: string | null = null;
				if (bodyClass) {
					shownTo = bodyClass[1]
						? `only when the page has .${bodyClass[2]}`
						: `only when the page does NOT have .${bodyClass[2]}`;
				}
				// thead th:nth-child(n) and tbody td:nth-child(n) are two
				// selectors for one hidden column. Report the column, once.
				const key = `${table}|${nth?.[1] ?? one}|${shownTo ?? ""}`;
				const prior = found.get(key);
				if (prior) {
					// Keep whichever spelling carried the explanation.
					if (!prior.reason && reason) {
						prior.reason = reason;
					}
					continue;
				}
				// A display:none rule says who does NOT see this, so the marker
				// names the kind it is hidden FROM — and the element belongs to
				// everyone else. Read the other way round it inverts: the rule
				// hiding a column from schools is a college's column.
				let hiddenFrom: string | null = null;
				for (const [kind, marker] of Object.entries(VARIANT_MARKERS)) {
					if (marker && one.includes(marker)) {
						hiddenFrom = kind;
					}
				}
				// Out of scope only when nobody we analyse would ever see it.
				const unseen =
					hiddenFrom !== null &&
					IN_SCOPE.length > 0 &&
					IN_SCOPE.every((k) => k === hiddenFrom);
				found.set(key, {
					selector: one,
					table,
					columnIndex: nth?.[1] ? Number.parseInt(nth[1], 10) : null,
					shownTo,
					reason,
					hiddenFrom,
					inScope: !unseen,
				});
			}
		}
	}
	return [...found.values()];
}

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
	// A <label> names a field, and a control sitting just after one is that
	// field rather than a filter. There was no rule for <label> at all, so a
	// setup form parsed to NOTHING: its labels were never read, and its inputs
	// carry no name, placeholder or aria-label of their own -- the text is in
	// the label -- so each fell back to its own type and landed as a filter
	// called "text". An organisation setup screen with fifteen fields and no
	// filters reported one field and twenty filters, and P3 then read every
	// field on it as removed.
	//
	// Controls with no label keep the OLD classification, so a toolbar search
	// box or a filter select on a table screen is unaffected.
	const labels = all(h, /<label[^>]*>([\s\S]*?)<\/label>/gi);
	const controls = all(h, /<(?:input|select|textarea)\b[^>]*>/gi);
	const claimed = new Set<number>();

	for (const c of controls) {
		const at = c.index ?? 0;
		let nearest = -1;
		for (let i = 0; i < labels.length; i++) {
			const end = (labels[i].index ?? 0) + labels[i][0].length;
			if (end <= at && at - end <= LABEL_REACH && !claimed.has(i)) {
				nearest = i;
			}
		}
		if (nearest >= 0) {
			claimed.add(nearest);
			push("field", labels[nearest][1]);
			continue;
		}
		const tag = c[0].slice(1).toLowerCase();
		if (tag.startsWith("select")) {
			push("filter", c[0].match(/name=["']([^"']+)/)?.[1] ?? "select");
			continue;
		}
		if (tag.startsWith("textarea")) {
			push("field", c[0].match(/(?:name|aria-label)=["']([^"']+)/)?.[1] ?? "text");
			continue;
		}
		const t = c[0].match(/type=["']([^"']+)/)?.[1] ?? "text";
		const n =
			c[0].match(/(?:name|placeholder|aria-label)=["']([^"']+)/)?.[1] ?? t;
		push(t === "search" ? "search" : "filter", n);
	}
	// A label with no control after it still names something on the screen.
	for (let i = 0; i < labels.length; i++) {
		if (!claimed.has(i)) {
			push("field", labels[i][1]);
		}
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
	const sid = `${moduleDir}-${shortId(`${base}--${state}`)}`;

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
	// What is in the markup but not on the page. Columns first: they are what
	// a change catalogue is built from, and a column nobody sees is not a
	// column the backend has to serve.
	const hidden = hiddenByCss(raw);
	const allHiddenCols = hidden.filter((x) => x.columnIndex !== null);
	const hiddenCols = allHiddenCols.filter((x) => x.inScope);
	const outOfScope = allHiddenCols.filter((x) => !x.inScope);
	if (outOfScope.length > 0) {
		questions.push(
			`${f}: **${outOfScope.length} column(s) belong to a variant this repo does not analyse** ` +
				`(in scope: ${IN_SCOPE.join(", ") || "all"}). They are NOT change items and carry no days — ` +
				"mention them once as deliberately not built, and move on:\n" +
				outOfScope
					.map(
						(x) =>
							`  - column ${x.columnIndex}${x.table ? ` of the \`${x.table}\` table` : ""} — hidden from ${x.hiddenFrom}, and ${x.hiddenFrom} is all we analyse`
					)
					.join("\n")
		);
	}
	if (hiddenCols.length > 0) {
		questions.push(
			`${f}: **${hiddenCols.length} column(s) are declared but hidden in CSS.** ` +
				"The parser reads markup, not styles, so they appear in the element " +
				"list above as though they were on screen. Check each before it is " +
				"traced as work:\n" +
				hiddenCols
					.map(
						(x) =>
							`  - column ${x.columnIndex}${x.table ? ` of the \`${x.table}\` table` : ""}` +
							`${x.shownTo ? `, shown ${x.shownTo}` : ", hidden from everyone"}` +
							`${x.reason ? ` — the design says: "${x.reason.slice(0, 180)}"` : ""}`
					)
					.join("\n")
		);
	}
	// A rule keyed on a class on <body> means the design draws more than one
	// version of this screen. Who each version is for is the question every
	// module has to answer, and it is answerable here.
	// Only the classes that gate COLUMNS. A design uses body classes for all
	// sorts of panel state; a class that decides which columns a table has is
	// the design drawing two versions of one screen, and that is a finding.
	const variants = [
		...new Set(hiddenCols.map((x) => x.shownTo).filter(Boolean)),
	];
	if (variants.length > 0) {
		questions.push(
			`${f}: **this design draws more than one version of the same table**, ` +
				`switched by a class on the page — ${variants.join("; ")}. ` +
				"That is usually one version per kind of institution. Say which is " +
				"which, and whether both are in scope."
		);
	}
	screens.push({
		id: `S-${sid}`,
		name: base,
		route: null,
		file: f,
		state,
		parseable: true,
		diagnostics: p,
		hiddenByCss: hidden,
		elements: els,
	});
});

const outDir = join(ROOT, CFG.paths.output, app, moduleDir);
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
// questions.md is written here and then WRITTEN IN by a person: the questions
// get rewritten for a reader, answers are filed under them, and later phases
// add the plain-words verdict at the top. Rebuilding the design — which is a
// routine thing to do — used to replace the lot, and it did exactly that
// during a smoke test: seven recorded answers gone in one command. The answers
// survived only because record-answer.ts also writes them to state.json.
//
// So the parser owns one marked block and nothing else. Everything a person
// wrote stays where they put it.
const OPEN = "<!-- fem:parser-findings -->";
const CLOSE = "<!-- /fem:parser-findings -->";
const findings =
	`${OPEN}\n` +
	"## What the parser noticed\n\n" +
	"Raised automatically from the design file. Rewrite these as questions for a\n" +
	"reader, or delete the ones that do not apply — this block is replaced on\n" +
	"every re-run, and nothing outside it is touched.\n\n" +
	(questions.length
		? questions.map((q, i) => `${i + 1}. ${q}`).join("\n\n")
		: "_none_") +
	`\n${CLOSE}\n`;

const questionsPath = join(outDir, "questions.md");
if (existsSync(questionsPath)) {
	const prior = readFileSync(questionsPath, "utf8");
	const from = prior.indexOf(OPEN);
	const to = prior.indexOf(CLOSE);
	writeFileSync(
		questionsPath,
		from !== -1 && to > from
			? prior.slice(0, from) + findings + prior.slice(to + CLOSE.length + 1)
			: `${prior.trimEnd()}\n\n${findings}`
	);
} else {
	writeFileSync(
		questionsPath,
		`# ${app} / ${moduleName} — what we could not decide on our own\n\n` +
			"Spec §8 P2: raise questions, never guess silently. Unanswered questions\n" +
			"take P90 to x2.0 (§9.3) and block gate 2 for the items they touch.\n\n" +
			findings
	);
}

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
