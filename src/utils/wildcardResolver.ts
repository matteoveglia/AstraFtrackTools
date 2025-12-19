/**
 * Advanced wildcard and pattern matching utilities for asset version selection
 * Supports multiple wildcard patterns, fuzzy matching, and manual resolution
 */

export interface WildcardPattern {
	pattern: string;
	type: "wildcard" | "regex" | "fuzzy";
	caseSensitive?: boolean;
}

export interface MatchResult {
	value: string;
	score: number; // 0-1, higher is better match
	matchType: "exact" | "wildcard" | "fuzzy" | "regex";
}

export interface ResolverOptions {
	maxResults?: number;
	minFuzzyScore?: number;
	enableRegex?: boolean;
	enableFuzzy?: boolean;
}

/**
 * Advanced wildcard resolver with multiple pattern types
 */
export class WildcardResolver {
	private static readonly DEFAULT_OPTIONS: ResolverOptions = {
		maxResults: 100,
		minFuzzyScore: 0.6,
		enableRegex: true,
		enableFuzzy: true,
	};

	/**
	 * Resolve patterns against a list of candidates
	 */
	static resolve(
		patterns: string[],
		candidates: string[],
		options: ResolverOptions = {},
	): MatchResult[] {
		const opts = { ...WildcardResolver.DEFAULT_OPTIONS, ...options };
		const results: MatchResult[] = [];

		for (const pattern of patterns) {
			const patternType = WildcardResolver.detectPatternType(pattern);

			for (const candidate of candidates) {
				const match = WildcardResolver.matchPattern(pattern, candidate, patternType, opts);
				if (match) {
					results.push(match);
				}
			}
		}

		// Sort by score (descending) and remove duplicates
		const uniqueResults = new Map<string, MatchResult>();
		for (const result of results) {
			const existing = uniqueResults.get(result.value);
			if (!existing || result.score > existing.score) {
				uniqueResults.set(result.value, result);
			}
		}

		return Array.from(uniqueResults.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, opts.maxResults);
	}

	/**
	 * Convert wildcard pattern to SQL LIKE pattern for Ftrack queries
	 */
	static toSqlLike(pattern: string): string {
		// Handle advanced wildcard patterns
		let sqlPattern = pattern;

		// Convert * to %
		sqlPattern = sqlPattern.replaceAll("*", "%");

		// Convert ? to _ (single character)
		sqlPattern = sqlPattern.replaceAll("?", "_");

		// Handle character classes [abc] -> convert to multiple LIKE conditions
		// This is a simplified approach - full implementation would need OR conditions
		sqlPattern = sqlPattern.replace(/\[([^\]]+)\]/g, "%");

		return sqlPattern;
	}

	/**
	 * Build Ftrack query conditions from wildcard patterns
	 */
	static buildFtrackConditions(
		patterns: string[],
		fieldPath: string,
	): string[] {
		const conditions: string[] = [];

		for (const pattern of patterns) {
			const patternType = WildcardResolver.detectPatternType(pattern);

			if (patternType === "exact") {
				conditions.push(`${fieldPath} is "${pattern}"`);
			} else if (patternType === "wildcard") {
				const sqlPattern = WildcardResolver.toSqlLike(pattern);
				conditions.push(`${fieldPath} like "${sqlPattern}"`);
			} else if (patternType === "regex") {
				// Ftrack doesn't support regex directly, so we'll need to fetch and filter
				// For now, convert to a broad wildcard and filter later
				conditions.push(`${fieldPath} like "%"`);
			}
		}

		return conditions;
	}

	/**
	 * Filter results using regex patterns (post-query filtering)
	 */
	static filterByRegex(
		items: Array<Record<string, unknown>>,
		patterns: string[],
		fieldExtractor: (item: Record<string, unknown>) => string,
	): Array<Record<string, unknown>> {
		const regexPatterns = patterns
			.filter((p) => WildcardResolver.detectPatternType(p) === "regex")
			.map((p) => {
				try {
					// Remove leading/trailing slashes if present
					const cleanPattern = p.replace(/^\/|\/$/, "");
					return new RegExp(cleanPattern, "i");
				} catch {
					return null;
				}
			})
			.filter(Boolean) as RegExp[];

		if (regexPatterns.length === 0) return items;

		return items.filter((item) => {
			const value = fieldExtractor(item);
			return regexPatterns.some((regex) => regex.test(value));
		});
	}

	private static detectPatternType(
		pattern: string,
	): "exact" | "wildcard" | "regex" {
		// Check for regex pattern (starts and ends with /)
		if (pattern.startsWith("/") && pattern.endsWith("/")) {
			return "regex";
		}

		// Check for wildcard characters
		if (
			pattern.includes("*") ||
			pattern.includes("?") ||
			pattern.includes("[")
		) {
			return "wildcard";
		}

		return "exact";
	}

	private static matchPattern(
		pattern: string,
		candidate: string,
		patternType: "exact" | "wildcard" | "regex",
		options: ResolverOptions,
	): MatchResult | null {
		switch (patternType) {
			case "exact":
				return candidate === pattern
					? { value: candidate, score: 1.0, matchType: "exact" }
					: null;

			case "wildcard": {
				const wildcardScore = WildcardResolver.matchWildcard(pattern, candidate);
				return wildcardScore > 0
					? { value: candidate, score: wildcardScore, matchType: "wildcard" }
					: null;
			}

			case "regex":
				if (!options.enableRegex) return null;
				try {
					const cleanPattern = pattern.replace(/^\/|\/$/, "");
					const regex = new RegExp(cleanPattern, "i");
					return regex.test(candidate)
						? { value: candidate, score: 0.9, matchType: "regex" }
						: null;
				} catch {
					return null;
				}

			default:
				return null;
		}
	}

	private static matchWildcard(pattern: string, candidate: string): number {
		// Convert wildcard pattern to regex
		let regexPattern = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
			.replace(/\*/g, ".*") // * matches any sequence
			.replace(/\?/g, "."); // ? matches single character

		// Handle character classes [abc]
		regexPattern = regexPattern.replace(/\\\[([^\]]+)\\\]/g, "[$1]");

		try {
			const regex = new RegExp(`^${regexPattern}$`, "i");
			if (regex.test(candidate)) {
				// Calculate score based on specificity
				const wildcardCount = (pattern.match(/[*?]/g) || []).length;
				const specificity = Math.max(0.1, 1 - wildcardCount * 0.1);
				return specificity;
			}
		} catch {
			// Invalid pattern
		}

		return 0;
	}

	/**
	 * Calculate fuzzy match score using Levenshtein distance
	 */
	static fuzzyMatch(pattern: string, candidate: string): number {
		const patternLower = pattern.toLowerCase();
		const candidateLower = candidate.toLowerCase();

		if (patternLower === candidateLower) return 1.0;
		if (candidateLower.includes(patternLower)) return 0.8;

		const distance = WildcardResolver.levenshteinDistance(patternLower, candidateLower);
		const maxLength = Math.max(pattern.length, candidate.length);
		return Math.max(0, 1 - distance / maxLength);
	}

	private static levenshteinDistance(a: string, b: string): number {
		const matrix = Array(b.length + 1)
			.fill(null)
			.map(() => Array(a.length + 1).fill(null));

		for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
		for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

		for (let j = 1; j <= b.length; j++) {
			for (let i = 1; i <= a.length; i++) {
				const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
				matrix[j][i] = Math.min(
					matrix[j][i - 1] + 1, // deletion
					matrix[j - 1][i] + 1, // insertion
					matrix[j - 1][i - 1] + indicator, // substitution
				);
			}
		}

		return matrix[b.length][a.length];
	}
}

/**
 * Interactive pattern resolver for manual refinement
 */
export class InteractiveResolver {
	/**
	 * Provide suggestions for ambiguous patterns
	 */
	static suggestPatterns(input: string, candidates: string[]): string[] {
		const suggestions = new Set<string>();

		// Extract common patterns from candidates
		const words = input.toLowerCase().split(/\s+/);

		for (const candidate of candidates) {
			const candidateLower = candidate.toLowerCase();

			// Suggest wildcards for partial matches
			for (const word of words) {
				if (candidateLower.includes(word)) {
					suggestions.add(`*${word}*`);
					suggestions.add(`${word}*`);
					suggestions.add(`*${word}`);
				}
			}

			// Suggest character classes for similar patterns
			if (WildcardResolver.fuzzyMatch(input, candidate) > 0.7) {
				suggestions.add(candidate);
			}
		}

		return Array.from(suggestions).slice(0, 10);
	}

	/**
	 * Analyze pattern effectiveness
	 */
	static analyzePattern(
		pattern: string,
		candidates: string[],
	): {
		matchCount: number;
		examples: string[];
		suggestions: string[];
	} {
		const matches = WildcardResolver.resolve([pattern], candidates);
		const matchCount = matches.length;
		const examples = matches.slice(0, 5).map((m) => m.value);

		let suggestions: string[] = [];

		if (matchCount === 0) {
			suggestions = InteractiveResolver.suggestPatterns(pattern, candidates);
		} else if (matchCount > 50) {
			suggestions = [
				`${pattern}*`, // More specific
				`*${pattern}*`, // Substring match
			];
		}

		return { matchCount, examples, suggestions };
	}
}
