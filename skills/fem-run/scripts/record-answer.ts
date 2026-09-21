#!/usr/bin/env bun
/**
 * Record what someone answered, so it is never asked twice and never lost.
 *
 *   record-answer.ts cms academic-calendar Q2 b  "someone@example.com"
 *   record-answer.ts cms academic-calendar Q2 --own "Only for exams" "someone@…"
 *   record-answer.ts cms academic-calendar Q4 --open "someone@example.com"
 *
 * The options we offer are our guesses at the answer. The person answering
 * knows things we do not, so --own records what they actually said, in their
 * words, and it counts as answered exactly like a lettered choice.
 *
 * The answer goes into questions.md under its own question — where the person
 * answering will look for it — and into state.json, so a resumed run asks only
 * what is still open.
 *
 * It deliberately does NOT unblock anything. An answer is a fact, not a
 * re-trace: the change items that named the question have to go back through
 * P4 with the answer in hand, and P5 re-run, before the estimate means
 * anything. So this prints those items and says so.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(join(ROOT, "fem.config.json"), "utf8"));
const [app, moduleName, qid, choice, ...rest] = process.argv.slice(2);

// --own takes the person's own words as the next argument; every other form
// takes the attribution there.
const ownText = choice === "--own" ? rest[0] : undefined;
const who = choice === "--own" ? rest[1] : rest[0];

if (!(app && moduleName && qid && choice)) {
	console.error(
		"usage: record-answer.ts <app> <module> <Qn> <letter|--own <text>|--open> [who]\n" +
			'  e.g. record-answer.ts cms academic-calendar Q2 b "you@example.com"\n' +
			'       record-answer.ts cms academic-calendar Q2 --own "Only for exams" "you@…"'
	);
	process.exit(2);
}
if (choice === "--own" && !ownText) {
	console.error("--own needs the answer in the person's own words");
	process.exit(2);
}
if (!/^Q\d+$/.test(qid)) {
	console.error(`not a question id: ${qid} — expected Q1, Q2, …`);
	process.exit(2);
}

const dir = join(ROOT, CFG.paths.output, app, moduleName);
const questionsAt = join(dir, "questions.md");
if (!existsSync(questionsAt)) {
	console.error(`no questions.md for ${app}/${moduleName} — P2 writes it`);
	process.exit(1);
}

const text = readFileSync(questionsAt, "utf8");
const lines = text.split("\n");
const heading = lines.findIndex((l) =>
	new RegExp(`^###\\s+${qid}\\s`).test(l)
);
if (heading === -1) {
	console.error(
		`questions.md has no "### ${qid} · …" heading.\n` +
			"Questions are numbered headings so an answer can be filed under one."
	);
	process.exit(1);
}

// The question ends where the next one begins, or at the end of the file.
let end = lines.length;
for (let i = heading + 1; i < lines.length; i++) {
	if (/^###\s+Q\d+\s/.test(lines[i] ?? "") || /^##\s/.test(lines[i] ?? "")) {
		end = i;
		break;
	}
}

const open = choice === "--open";
const own = choice === "--own";
const stamp = `*${who ?? "unattributed"} · ${new Date().toISOString().slice(0, 10)}*`;

// The chosen option's own words, so the answer reads as a sentence rather than
// a letter somebody has to go and look up.
let wording = own ? (ownText as string) : "";
if (!(open || own)) {
	const letter = choice.replace(/[^a-z]/gi, "").toLowerCase();
	const within = lines.slice(heading, end);
	const at = within.findIndex((l) =>
		new RegExp(`^\\s*-\\s+\\*\\*${letter}\\)\\*\\*`, "i").test(l)
	);
	if (at === -1) {
		console.error(
			`question ${qid} has no option "${letter}". Options are the lettered\n` +
				"bullets under the question."
		);
		process.exit(1);
	}
	// An option wraps across lines in the file and is still one sentence. Taking
	// only the first line filed answers that stopped mid-clause.
	const wrapped = [within[at] as string];
	for (let i = at + 1; i < within.length; i++) {
		const next = within[i] ?? "";
		if (next.trim() === "" || /^\s*-\s/.test(next) || /^#/.test(next)) {
			break;
		}
		wrapped.push(next.trim());
	}
	wording = wrapped
		.join(" ")
		.replace(/^\s*-\s+\*\*[a-z]\)\*\*\s*/i, "")
		.replace(/\s+—.*$/, "")
		.trim();
}

let block: string[];
if (open) {
	block = ["", `**Left open:** nobody can answer this yet. ${stamp}`, ""];
} else if (own) {
	// Their words, marked as theirs — none of the options fitted, which is
	// itself worth knowing when the options are reviewed later.
	block = ["", `**Answer (their own):** ${wording}`, stamp, ""];
} else {
	block = ["", `**Answer (${choice}):** ${wording}`, stamp, ""];
}

// Replace any answer already filed under this question, so answering twice
// corrects the record instead of stacking contradictions.
const body = lines
	.slice(heading, end)
	.filter(
		(l) =>
			!(
				l.startsWith("**Answer") ||
				l.startsWith("**Left open:**") ||
				/^\*[^*]+ · \d{4}-\d{2}-\d{2}\*$/.test(l)
			)
	);
while (body.length > 1 && body.at(-1)?.trim() === "") {
	body.pop();
}

lines.splice(heading, end - heading, ...body, ...block);
writeFileSync(questionsAt, lines.join("\n"));

// state.json is what stops a resumed run asking again.
const statePath = join(dir, "state.json");
const state = existsSync(statePath)
	? JSON.parse(readFileSync(statePath, "utf8"))
	: { app, module: moduleName, phases: {}, gates: {} };
state.answers ??= {};
state.answers[qid] = {
	choice: open ? "open" : own ? "own" : choice,
	answer: open ? null : wording,
	by: who ?? null,
	at: new Date().toISOString(),
};
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

if (open) {
	console.log(
		`${qid} left open — the bad case for anything waiting on it stays doubled`
	);
} else {
	console.log(`${qid} answered (${own ? "their own" : choice}) — ${wording}`);
}

// Which items were waiting on it. Naming them is the point: an answer that
// never reaches the trace changes nothing.
const impactAt = join(dir, "04-impact.json");
if (existsSync(impactAt)) {
	const impact = JSON.parse(readFileSync(impactAt, "utf8"));
	const waiting: string[] = [];
	for (const c of impact.changes ?? []) {
		for (const layer of Object.values(c.impact ?? {})) {
			if ((layer as { blockedOnQuestion?: string }).blockedOnQuestion === qid) {
				waiting.push(c.id);
				break;
			}
		}
	}
	if (waiting.length > 0 && !open) {
		console.log(
			`re-trace  ${waiting.join(", ")} — still marked blocked on ${qid}.\n` +
				"          Run P4 again for those items, then P5. An answer is not a re-trace."
		);
	}
}
