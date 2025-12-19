import type { SessionService } from "./session.ts";
import type { ProjectContextService } from "./projectContext.ts";
import { debug, debugToFile } from "../utils/debug.ts";

const DEBUG_LOG_PATH =
	"/Users/matteoveglia/Documents/Coding/AstraFtrackTools/downloadMedia_debug.log";

/**
 * Common query builders for Ftrack entities
 */
export class QueryService {
	constructor(
		private sessionService: SessionService,
		private projectContext: ProjectContextService,
	) {}

	/**
	 * Build and execute a project-scoped query
	 */
	async executeProjectScopedQuery(
		baseQuery: string,
	): Promise<{ data: unknown[] }> {
		await debugToFile(
			DEBUG_LOG_PATH,
			"QueryService.executeProjectScopedQuery - Base query:",
			baseQuery,
		);
		const scopedQuery = this.projectContext.buildProjectScopedQuery(baseQuery);
		await debugToFile(
			DEBUG_LOG_PATH,
			"QueryService.executeProjectScopedQuery - Scoped query:",
			scopedQuery,
		);
		debug(`Executing project-scoped query: ${scopedQuery}`);
		const result = await this.sessionService.query(scopedQuery);
		await debugToFile(
			DEBUG_LOG_PATH,
			"QueryService.executeProjectScopedQuery - Query result:",
			result,
		);
		return result;
	}

	/**
	 * Query shots with project scoping
	 */
	async queryShots(
		additionalFilters: string = "",
	): Promise<{ data: unknown[] }> {
		let baseQuery = "select id, name, parent.name, status.name from Shot";

		if (additionalFilters) {
			baseQuery += ` where ${additionalFilters}`;
		}

		return await this.executeProjectScopedQuery(baseQuery);
	}

	/**
	 * Query asset versions with project scoping
	 */
	async queryAssetVersions(
		additionalFilters: string = "",
	): Promise<{ data: unknown[] }> {
		await debugToFile(
			DEBUG_LOG_PATH,
			"QueryService.queryAssetVersions - Additional filters:",
			additionalFilters,
		);
		let baseQuery =
			"select id, version, asset.name, asset.parent.name, task.name from AssetVersion";

		if (additionalFilters) {
			baseQuery += ` where ${additionalFilters}`;
		}

		await debugToFile(
			DEBUG_LOG_PATH,
			"QueryService.queryAssetVersions - Final base query:",
			baseQuery,
		);
		return await this.executeProjectScopedQuery(baseQuery);
	}

	/**
	 * Query tasks with project scoping
	 */
	async queryTasks(
		additionalFilters: string = "",
	): Promise<{ data: unknown[] }> {
		let baseQuery =
			"select id, name, type.name, status.name, parent.name from Task";

		if (additionalFilters) {
			baseQuery += ` where ${additionalFilters}`;
		}

		return await this.executeProjectScopedQuery(baseQuery);
	}

	/**
	 * Query projects (always global)
	 */
	async queryProjects(
		additionalFilters: string = "",
	): Promise<{ data: unknown[] }> {
		let baseQuery = "select id, name, full_name, status.name from Project";

		if (additionalFilters) {
			baseQuery += ` where ${additionalFilters}`;
		}

		// Projects query is always global
		return await this.sessionService.query(baseQuery);
	}
}
