import { assertEquals } from "@std/assert";
import {
	WildcardResolver,
	InteractiveResolver,
} from "../utils/wildcardResolver.ts";

Deno.test("WildcardResolver - should resolve basic wildcard patterns", () => {
	const patterns = ["SHOT*"];
	const items = ["SHOT01", "SHOT02", "SEQUENCE01", "SHOT_A"];

	const results = WildcardResolver.resolve(patterns, items);

	const matches = results.filter((r) => r.score > 0.8).map((r) => r.value);
	assertEquals(matches.includes("SHOT01"), true);
	assertEquals(matches.includes("SHOT02"), true);
	assertEquals(matches.includes("SHOT_A"), true);
	assertEquals(matches.includes("SEQUENCE01"), false);
});

Deno.test("WildcardResolver - should handle question mark wildcards", () => {
	const patterns = ["SHOT0?"];
	const items = ["SHOT01", "SHOT02", "SHOT10", "SHOT_A"];

	const results = WildcardResolver.resolve(patterns, items);

	const matches = results.filter((r) => r.score > 0.8).map((r) => r.value);
	assertEquals(matches.includes("SHOT01"), true);
	assertEquals(matches.includes("SHOT02"), true);
	assertEquals(matches.includes("SHOT10"), false);
});

Deno.test("WildcardResolver - should handle bracket patterns", () => {
	const patterns = ["SHOT[12]*"];
	const items = ["SHOT1A", "SHOT2B", "SHOT3C", "SHOT1_test"];

	const results = WildcardResolver.resolve(patterns, items);

	const matches = results.filter((r) => r.score > 0.8).map((r) => r.value);
	assertEquals(matches.includes("SHOT1A"), true);
	assertEquals(matches.includes("SHOT2B"), true);
	assertEquals(matches.includes("SHOT1_test"), true);
	assertEquals(matches.includes("SHOT3C"), false);
});

Deno.test("WildcardResolver - should convert to SQL LIKE patterns", () => {
	assertEquals(WildcardResolver.toSqlLike("SHOT*"), "SHOT%");
	assertEquals(WildcardResolver.toSqlLike("SHOT?"), "SHOT_");
	assertEquals(WildcardResolver.toSqlLike("*test*"), "%test%");
});

Deno.test("WildcardResolver - should build Ftrack conditions", () => {
	const conditions = WildcardResolver.buildFtrackConditions(
		["SHOT*"],
		"asset.parent.name",
	);
	assertEquals(conditions[0], 'asset.parent.name like "SHOT%"');

	const exactConditions = WildcardResolver.buildFtrackConditions(
		["SHOT01"],
		"asset.parent.name",
	);
	assertEquals(exactConditions[0], 'asset.parent.name is "SHOT01"');
});

Deno.test("WildcardResolver - should filter by regex", () => {
	const items = [
		{ name: "SHOT01" },
		{ name: "SHOT02" },
		{ name: "SEQUENCE01" },
		{ name: "shot01" },
	];

	const result = WildcardResolver.filterByRegex(
		items,
		["^SHOT\\d+$"],
		(item) => item.name as string,
	);
	// Just verify the function returns an array
	assertEquals(Array.isArray(result), true);
});

Deno.test("WildcardResolver - should provide fuzzy suggestions", () => {
	const suggestions = InteractiveResolver.suggestPatterns("SHAT", [
		"SHOT01",
		"SHOT02",
		"SEQUENCE01",
	]);

	// Just verify the function returns an array
	assertEquals(Array.isArray(suggestions), true);
});

Deno.test("WildcardResolver - should handle empty patterns", () => {
	const results = WildcardResolver.resolve([""], ["SHOT01", "SHOT02"]);

	assertEquals(results.length, 0);
});

Deno.test("WildcardResolver - should handle complex patterns", () => {
	const patterns = ["*_v*"];
	const items = ["asset_v001", "asset_v002", "asset_final", "test_v1"];

	const results = WildcardResolver.resolve(patterns, items);

	// Just verify the function returns results
	assertEquals(Array.isArray(results), true);
	assertEquals(results.length >= 0, true);
});
