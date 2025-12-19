import type { Session } from "@ftrack/api";
import type {
	ComponentDeletionChoice,
	DeletionResultSummary,
	DryRunReportItem,
} from "../types/deleteMedia.ts";
import type { Component, ComponentLocation } from "../types/index.ts";
import { ComponentService } from "./componentService.ts";
import type { SessionService } from "./session.ts";
import type { QueryService } from "./queries.ts";
import { debug } from "../utils/debug.ts";

/**
 * DeletionService
 * - Provides deletion operations with dry-run support and batching.
 * - Fetches real component data for size estimation and type filtering.
 */
export class DeletionService {
	private componentService: ComponentService;

	constructor(
		private session: Session,
		private sessionService: SessionService,
		private queryService: QueryService,
	) {
		this.componentService = new ComponentService(sessionService, queryService);
	}

	/**
	 * Delete asset versions with dry-run support and proper component/size analysis
	 */
	async deleteAssetVersions(
		versionIds: string[],
		opts: { dryRun: boolean },
	): Promise<{ report: DryRunReportItem[]; summary: DeletionResultSummary }> {
		debug(
			`DeletionService.deleteAssetVersions - IDs: ${versionIds.length}, dryRun: ${opts.dryRun}`,
		);

		const report: DryRunReportItem[] = [];
		const failures: Array<{ id: string; reason: string }> = [];
		let totalBytesDeleted = 0;
		let totalComponentsDeleted = 0;

		// Process versions in concurrent batches for better performance
		const concurrencyLimit = 5; // Limit concurrent API calls
		const batchSize = Math.min(concurrencyLimit, versionIds.length);

		for (let i = 0; i < versionIds.length; i += batchSize) {
			const batch = versionIds.slice(i, i + batchSize);

			// Process batch concurrently
			const batchPromises = batch.map(async (versionId) => {
				try {
					// Fetch version with components and metadata
					const versionDetails = await this.fetchVersionDetails(versionId);

					if (!versionDetails) {
						return { versionId, error: "Version not found" };
					}

					// Get all components for this version
					const components =
						await this.componentService.getComponentsForAssetVersion(versionId);

					// Calculate total size of all components for this version
					const versionSizeBytes = components.reduce(
						(total, comp) => total + (comp.size || 0),
						0,
					);

					// Create report entry for the whole version deletion
					const versionReport: DryRunReportItem = {
						operation: "delete_version",
						assetVersionId: versionId,
						assetVersionLabel: `${((versionDetails.asset as Record<string, unknown> | undefined)?.name as string) || "Unknown"} v${
							(versionDetails.version as string) || "?"
						}`,
						shotName:
							((
								(versionDetails.asset as Record<string, unknown> | undefined)
									?.parent as Record<string, unknown> | undefined
							)?.name as string) || undefined,
						status:
							((versionDetails.status as Record<string, unknown> | undefined)
								?.name as string) || undefined,
						user:
							((versionDetails.user as Record<string, unknown> | undefined)
								?.username as string) || undefined,
						size: versionSizeBytes,
						locations: this.extractLocationIdentifiers(components),
					};

					// Create component reports
					const componentReports: DryRunReportItem[] = components.map(
						(component) => ({
							operation: "delete_components",
							assetVersionId: versionId,
							assetVersionLabel: `${((versionDetails.asset as Record<string, unknown> | undefined)?.name as string) || "Unknown"} v${
								(versionDetails.version as string) || "?"
							}`,
							shotName:
								((
									(versionDetails.asset as Record<string, unknown> | undefined)
										?.parent as Record<string, unknown> | undefined
								)?.name as string) || undefined,
							componentId: component.id,
							componentName: component.name,
							componentType:
								this.componentService.identifyComponentType(component),
							size: component.size || 0,
							locations:
								component.component_locations
									?.map((loc: ComponentLocation) => loc.resource_identifier)
									.filter(Boolean) || [],
						}),
					);

					debug(
						`Version ${versionId}: ${components.length} components, ${versionSizeBytes} bytes`,
					);

					return {
						versionId,
						versionSizeBytes,
						componentsCount: components.length,
						reports: [versionReport, ...componentReports],
					};
				} catch (error) {
					debug(`Failed to process version ${versionId}: ${error}`);
					return {
						versionId,
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			});

			// Wait for batch to complete
			const batchResults = await Promise.all(batchPromises);

			// Process results
			for (const result of batchResults) {
				if ("error" in result) {
					failures.push({
						id: result.versionId,
						reason: result.error || "Unknown error",
					});
				} else {
					totalBytesDeleted += result.versionSizeBytes;
					totalComponentsDeleted += result.componentsCount;
					report.push(...result.reports);
				}
			}

			// Small delay between batches to avoid overwhelming the API
			if (i + batchSize < versionIds.length) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// Perform actual deletion if not dry-run
		if (!opts.dryRun) {
			await this.executeVersionDeletions(versionIds, failures);
		}

		const summary: DeletionResultSummary = {
			versionsDeleted: versionIds.length - failures.length,
			componentsDeleted: totalComponentsDeleted,
			bytesDeleted: totalBytesDeleted,
			failures,
		};

		return { report, summary };
	}

	/**
	 * Delete components from versions with type filtering and thumbnail protection
	 * Optimized with concurrent processing and efficient batching
	 */
	async deleteComponents(
		versionIdToComponentChoice: Map<string, ComponentDeletionChoice>,
		opts: { dryRun: boolean },
	): Promise<{ report: DryRunReportItem[]; summary: DeletionResultSummary }> {
		debug(
			`DeletionService.deleteComponents - ${versionIdToComponentChoice.size} versions, dryRun: ${opts.dryRun}`,
		);

		const report: DryRunReportItem[] = [];
		const failures: Array<{ id: string; reason: string }> = [];
		let totalBytesDeleted = 0;
		let totalComponentsDeleted = 0;

		// Convert map to array for batch processing
		const versionEntries = Array.from(versionIdToComponentChoice.entries());

		// Process versions in concurrent batches for better performance
		const concurrencyLimit = 5; // Limit concurrent API calls
		const batchSize = Math.min(concurrencyLimit, versionEntries.length);

		for (let i = 0; i < versionEntries.length; i += batchSize) {
			const batch = versionEntries.slice(i, i + batchSize);

			// Process batch concurrently
			const batchPromises = batch.map(async ([versionId, choice]) => {
				try {
					// Fetch version details
					const versionDetails = await this.fetchVersionDetails(versionId);

					if (!versionDetails) {
						return { versionId, error: "Version not found" };
					}

					// Get all components for this version
					const allComponents =
						await this.componentService.getComponentsForAssetVersion(versionId);

					// Filter components based on user choice and exclude thumbnails
					const componentsToDelete = this.filterComponentsByChoice(
						allComponents,
						choice,
						versionDetails.thumbnail_id as string | undefined,
					);

					// Calculate total size of components to delete
					const versionSizeBytes = componentsToDelete.reduce(
						(total, comp) => total + (comp.size || 0),
						0,
					);

					// Create component reports
					const componentReports: DryRunReportItem[] = componentsToDelete.map(
						(component) => ({
							operation: "delete_components",
							assetVersionId: versionId,
							assetVersionLabel: `${((versionDetails.asset as Record<string, unknown> | undefined)?.name as string) || "Unknown"} v${
								(versionDetails.version as string) || "?"
							}`,
							shotName:
								((
									(versionDetails.asset as Record<string, unknown> | undefined)
										?.parent as Record<string, unknown> | undefined
								)?.name as string) || undefined,
							status:
								((versionDetails.status as Record<string, unknown> | undefined)
									?.name as string) || undefined,
							user:
								((versionDetails.user as Record<string, unknown> | undefined)
									?.username as string) || undefined,
							componentId: component.id,
							componentName: component.name,
							componentType:
								this.componentService.identifyComponentType(component),
							size: component.size || 0,
							locations:
								component.component_locations
									?.map((loc: ComponentLocation) => loc.resource_identifier)
									.filter(Boolean) || [],
						}),
					);

					debug(
						`Version ${versionId}: ${componentsToDelete.length}/${allComponents.length} components selected for deletion (${choice})`,
					);

					return {
						versionId,
						versionSizeBytes,
						componentsCount: componentsToDelete.length,
						reports: componentReports,
					};
				} catch (error) {
					debug(`Failed to process version ${versionId}: ${error}`);
					return {
						versionId,
						error: error instanceof Error ? error.message : "Unknown error",
					};
				}
			});

			// Wait for batch to complete
			const batchResults = await Promise.all(batchPromises);

			// Process results
			for (const result of batchResults) {
				if ("error" in result) {
					failures.push({
						id: result.versionId,
						reason: result.error || "Unknown error",
					});
				} else {
					totalBytesDeleted += result.versionSizeBytes;
					totalComponentsDeleted += result.componentsCount;
					report.push(...result.reports);
				}
			}

			// Small delay between batches to avoid overwhelming the API
			if (i + batchSize < versionEntries.length) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// Perform actual deletion if not dry-run
		if (!opts.dryRun) {
			await this.executeComponentDeletions(
				versionIdToComponentChoice,
				failures,
			);
		}

		const summary: DeletionResultSummary = {
			versionsDeleted: 0,
			componentsDeleted: totalComponentsDeleted,
			bytesDeleted: totalBytesDeleted,
			failures,
		};

		return { report, summary };
	}

	/**
	 * Fetch version details including thumbnail_id for safety checks
	 */
	private async fetchVersionDetails(
		versionId: string,
	): Promise<Record<string, unknown>> {
		try {
			// Use QueryService which handles project scoping properly
			const result = await this.queryService.queryAssetVersions(
				`id is "${versionId}"`,
			);

			if (result.data && result.data.length > 0) {
				const version = result.data[0] as Record<string, unknown>;

				// If we need additional fields not included in queryAssetVersions, fetch them separately
				const additionalQuery = `
          select id, status.name, user.username, thumbnail_id, date
          from AssetVersion 
          where id is "${versionId}"
        `;

				const additionalResult = await this.session.query(additionalQuery);
				if (additionalResult.data && additionalResult.data.length > 0) {
					const additionalData = additionalResult.data[0] as Record<
						string,
						Record<string, unknown>
					>;
					return {
						...version,
						status: additionalData.status,
						user: additionalData.user,
						thumbnail_id: additionalData.thumbnail_id,
						date: additionalData.date,
					};
				}

				return version;
			}

			return {} as Record<string, unknown>;
		} catch (error) {
			debug(`Error fetching version details for ${versionId}: ${error}`);
			throw error;
		}
	}

	/**
	 * Filter components based on deletion choice and exclude thumbnails
	 */
	private filterComponentsByChoice(
		components: Component[],
		choice: ComponentDeletionChoice,
		thumbnailId?: string,
	): Component[] {
		// First, exclude thumbnail component if present
		const filteredComponents = components.filter(
			(comp) => comp.id !== thumbnailId,
		);

		// Then filter by choice
		switch (choice) {
			case "all":
				return filteredComponents;

			case "original_only":
				return filteredComponents.filter(
					(comp) =>
						this.componentService.identifyComponentType(comp) === "original",
				);

			case "encoded_only":
				return filteredComponents.filter((comp) => {
					const type = this.componentService.identifyComponentType(comp);
					return type === "encoded-1080p" || type === "encoded-720p";
				});

			default:
				return [];
		}
	}

	/**
	 * Extract resource identifiers from components for location tracking
	 */
	private extractLocationIdentifiers(components: Component[]): string[] {
		const identifiers: string[] = [];

		for (const component of components) {
			if (component.component_locations) {
				for (const location of component.component_locations) {
					if (location.resource_identifier) {
						identifiers.push(location.resource_identifier);
					}
				}
			}
		}

		return [...new Set(identifiers)]; // Remove duplicates
	}

	/**
	 * Execute actual version deletions with optimized batching and error handling
	 */
	private async executeVersionDeletions(
		versionIds: string[],
		failures: Array<{ id: string; reason: string }>,
	): Promise<void> {
		debug(`Executing deletion of ${versionIds.length} asset versions`);

		const batchSize = 15; // Increased batch size for better throughput
		const concurrencyLimit = 3; // Allow some concurrent batches
		const delayBetweenBatches = 75; // Reduced delay

		// Filter out already failed versions
		const failedIds = new Set(failures.map((f) => f.id));
		const validVersionIds = versionIds.filter((id) => !failedIds.has(id));

		for (let i = 0; i < validVersionIds.length; i += batchSize) {
			const batch = validVersionIds.slice(i, i + batchSize);
			debug(
				`Deleting batch ${Math.floor(i / batchSize) + 1}: ${batch.length} versions`,
			);

			// Process deletions in smaller concurrent groups within the batch
			const concurrentGroups: string[][] = [];
			for (let j = 0; j < batch.length; j += concurrencyLimit) {
				concurrentGroups.push(batch.slice(j, j + concurrencyLimit));
			}

			for (const group of concurrentGroups) {
				const deletionPromises = group.map(async (versionId) => {
					try {
						debug(`Deleting asset version: ${versionId}`);
						await this.session.call([
							{
								action: "delete",
								entity_type: "AssetVersion",
								entity_key: versionId,
							},
						]);
						debug(`Successfully deleted version: ${versionId}`);
						return { versionId, success: true };
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : "Unknown deletion error";
						debug(`Failed to delete version ${versionId}: ${errorMessage}`);
						return { versionId, success: false, error: errorMessage };
					}
				});

				const results = await Promise.all(deletionPromises);

				// Process results and update failures
				for (const result of results) {
					if (!result.success) {
						failures.push({
							id: result.versionId,
							reason: result.error || "Unknown error",
						});
					}
				}

				// Small delay between concurrent groups
				if (group !== concurrentGroups[concurrentGroups.length - 1]) {
					await new Promise((resolve) => setTimeout(resolve, 25));
				}
			}

			// Add delay between batches to be respectful to the API
			if (i + batchSize < validVersionIds.length) {
				await new Promise((resolve) =>
					setTimeout(resolve, delayBetweenBatches),
				);
			}
		}
	}

	/**
	 * Execute actual component deletions with optimized batching and error handling
	 */
	private async executeComponentDeletions(
		versionIdToComponentChoice: Map<string, ComponentDeletionChoice>,
		failures: Array<{ id: string; reason: string }>,
	): Promise<void> {
		debug(
			`Executing component deletion for ${versionIdToComponentChoice.size} versions`,
		);

		const batchSize = 8; // Increased batch size for better throughput
		const concurrencyLimit = 3; // Allow some concurrent operations
		const delayBetweenBatches = 40; // Reduced delay

		const versionEntries = Array.from(versionIdToComponentChoice.entries());

		// Filter out already failed versions
		const failedIds = new Set(failures.map((f) => f.id));
		const validEntries = versionEntries.filter(
			([versionId]) => !failedIds.has(versionId),
		);

		for (let i = 0; i < validEntries.length; i += batchSize) {
			const batch = validEntries.slice(i, i + batchSize);
			debug(
				`Processing component deletion batch ${Math.floor(i / batchSize) + 1}: ${batch.length} versions`,
			);

			// Process versions in smaller concurrent groups within the batch
			const concurrentGroups: Array<[string, ComponentDeletionChoice][]> = [];
			for (let j = 0; j < batch.length; j += concurrencyLimit) {
				concurrentGroups.push(batch.slice(j, j + concurrencyLimit));
			}

			for (const group of concurrentGroups) {
				const versionPromises = group.map(async ([versionId, choice]) => {
					try {
						// Get version details and components
						const versionDetails = await this.fetchVersionDetails(versionId);
						if (!versionDetails) {
							return { versionId, success: false, error: "Version not found" };
						}

						const allComponents =
							await this.componentService.getComponentsForAssetVersion(
								versionId,
							);
						const componentsToDelete = this.filterComponentsByChoice(
							allComponents,
							choice,
							versionDetails.thumbnail_id as string | undefined,
						);

						// Delete components concurrently for this version
						const componentDeletionPromises = componentsToDelete.map(
							async (component) => {
								try {
									await this.session.call([
										{
											action: "delete",
											entity_type: "Component",
											entity_key: component.id,
										},
									]);
									debug(`Successfully deleted component: ${component.id}`);
									return { componentId: component.id, success: true };
								} catch (error) {
									const errorMessage =
										error instanceof Error
											? error.message
											: "Unknown deletion error";
									debug(
										`Failed to delete component ${component.id}: ${errorMessage}`,
									);
									return {
										componentId: component.id,
										success: false,
										error: errorMessage,
									};
								}
							},
						);

						const componentResults = await Promise.all(
							componentDeletionPromises,
						);

						// Collect any component failures
						const componentFailures = componentResults
							.filter((result) => !result.success)
							.map((result) => ({
								id: `${versionId}:${result.componentId}`,
								reason: result.error || "Unknown error",
							}));

						return {
							versionId,
							success: true,
							componentFailures,
							deletedCount: componentResults.filter((r) => r.success).length,
						};
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : "Unknown error";
						debug(`Failed to process version ${versionId}: ${errorMessage}`);
						return { versionId, success: false, error: errorMessage };
					}
				});

				const results = await Promise.all(versionPromises);

				// Process results and update failures
				for (const result of results) {
					if (!result.success) {
						failures.push({
							id: result.versionId,
							reason: result.error || "Unknown error",
						});
					} else if (
						"componentFailures" in result &&
						result.componentFailures
					) {
						failures.push(...result.componentFailures);
						if (result.deletedCount && result.deletedCount > 0) {
							debug(
								`Version ${result.versionId}: ${result.deletedCount} components deleted successfully`,
							);
						}
					}
				}

				// Small delay between concurrent groups
				if (group !== concurrentGroups[concurrentGroups.length - 1]) {
					await new Promise((resolve) => setTimeout(resolve, 20));
				}
			}

			// Add delay between batches
			if (i + batchSize < validEntries.length) {
				await new Promise((resolve) =>
					setTimeout(resolve, delayBetweenBatches),
				);
			}
		}
	}

	/**
	 * Format bytes into human-readable size
	 */
	static formatBytes(bytes: number, decimals: number = 2): string {
		if (bytes === 0) return "0 Bytes";

		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return parseFloat((bytes / k ** i).toFixed(dm)) + " " + sizes[i];
	}
}
