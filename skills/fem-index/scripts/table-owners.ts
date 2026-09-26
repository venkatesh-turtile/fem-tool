/**
 * Which of the endpoints touching a table OWN it, rather than read it in
 * passing. Shared by the endpoint lookup, the column ripple and the output
 * validator's Rule M, so the three cannot disagree about who owns a table.
 *
 * Ownership is by name affinity: the endpoint's path carries the table's name.
 * Forty-four endpoints read the academic tree; the three that own it are the
 * ones that answer "does this already exist".
 */

// A table name and an endpoint name rarely agree on plurals: leave-policies is
// served by leavepolicy, leave-requests by leaverequest. Try the spellings a
// codebase actually uses rather than guessing one.
export const stems = (name: string) => {
	const out = new Set<string>();
	// The whole name, its last word, and its first: `leave-policies` is served
	// by `leavepolicy`, and its response schemas are called
	// `allPoliciesResponseSchema` — no "leave" in sight. The first word matters
	// for a table named after the join rather than the thing: the roll lives in
	// `student-in-institutes`, whose last word is `institutes`, and it is served
	// by `.../students`. Without the first word that table has no owner at all,
	// and the ripple comes back empty while reporting 68 readers.
	const parts = name.toLowerCase().split(/[-_]/);
	for (const base of [name.toLowerCase(), parts.at(-1) ?? "", parts[0] ?? ""]) {
		if (!base) {
			continue;
		}
		out.add(base);
		if (base.endsWith("ies")) {
			out.add(`${base.slice(0, -3)}y`);
		}
		if (base.endsWith("s")) {
			out.add(base.slice(0, -1));
		}
		out.add(`${base}s`);
	}
	// Compare with the punctuation taken out. The table is `leave-requests` and
	// the endpoints that own it are called `leaverequest` — a literal match
	// finds neither, and reports that nothing owns the table.
	return [...out]
		.map((v) => v.replace(/[^a-z0-9]/g, ""))
		.filter((v) => v.length > 3);
};

const flat = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

// How many of the given spellings a path carries. One is weak evidence and two
// is strong: `leave-policies` gives "leave" and "policy", and only
// `.../hrms/leavepolicy/admin` has both — `.../leaverequest/admin` has "leave"
// alone and does not define a policy's shape.
export const affinity = (words: string[], serverPath: string) =>
	words.filter((w) => flat(serverPath).includes(w)).length;

/**
 * The spellings to match a table against, and the endpoints among `touching`
 * that own it.
 *
 * Only the best-matching endpoints own the table. Anything above zero is too
 * generous: `student-in-institutes` yields the stem "student", which half the
 * server carries somewhere in its path, and the roll's owner list filled up
 * with sign-in, fee export and the timetable.
 *
 * When the table's own name matches nothing, its schema folder is asked next.
 * `cms/timetable/subject-staff-assignments` is written only by
 * `academic-nodes/sections/timetable`, which shares no word with
 * "subject-staff-assignments" — so it had no owner, and the column ripple came
 * back with empty schema, handler and front-end sections.
 */
export function ownersOf<E extends { serverPath: string }>(
	table: string,
	touching: E[]
): { words: string[]; owners: E[] } {
	// The LAST segment of the table name is the one that identifies it.
	// Splitting the whole path matched "cms", which every endpoint in the tree
	// contains, so forty-four endpoints all looked like they belonged to it.
	const segments = table.split("/");
	const tries = [segments.at(-1) ?? table];
	// `cms/x` has no folder worth asking — every endpoint carries "cms".
	if (segments.length >= 3) {
		tries.push(segments.at(-2) ?? "");
	}
	for (const name of tries) {
		const words = stems(name);
		const best = Math.max(0, ...touching.map((e) => affinity(words, e.serverPath)));
		if (best > 0) {
			return {
				words,
				owners: touching.filter((e) => affinity(words, e.serverPath) === best),
			};
		}
	}
	return { words: stems(tries[0] ?? table), owners: [] };
}
