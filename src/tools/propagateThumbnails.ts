import type { Session } from "@ftrack/api";
import { Input } from "@cliffy/prompt";
import chalk from "chalk";
import { debug } from "../utils/debug.ts";
import {
	completeProgress,
	createProgressTracker,
	formatProgress,
	getETA,
	type ProgressTracker,
} from "../utils/progress.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";
import type { ProjectContextService } from "../services/projectContext.ts";
import type { QueryService } from "../services/queries.ts";

// Custom progress function for propagate thumbnails with bold formatting
function updateProgressWithBold(tracker: ProgressTracker, item?: string): void {
	tracker.current++;
	tracker.lastUpdate = Date.now();

	const progress = formatProgress(tracker.current, tracker.total);
	const eta =
		tracker.current < tracker.total ? ` (ETA: ${getETA(tracker)})` : "";
	const itemText = item ? `: ${item}` : "";

	console.log(chalk.bold(`[${progress}]${eta} Processing${itemText}`));
}

export async function propagateThumbnails(
	session: Session,
	projectContextService: ProjectContextService,
	queryService: QueryService,
	shotId?: string,
): Promise<void> {
	const projectContext = projectContextService.getContext();
	const contextDisplay = projectContext.isGlobal
		? "all projects"
		: `project "${projectContext.project?.name}"`;

	try {
		// Prompt for shot ID if not provided
		if (!shotId) {
			debug("No shot ID provided, prompting user for input");
			shotId = await Input.prompt({
				message: "Enter Shot ID (leave empty to process all shots):",
			});
		}

		// Build project-scoped query for shots
		const additionalFilters = shotId ? `id is "${shotId}"` : "";

		debug(`Querying shots with filters: ${additionalFilters}`);
		const shotsResponse = await withErrorHandling(
			() => queryService.queryShots(additionalFilters),
			{
				operation: "fetch shots for thumbnail propagation",
				entity: "Shot",
				additionalData: { shotId, contextDisplay },
			},
		);

		if (!shotsResponse?.data) {
			console.log("❌ No shots found");
			return;
		}

		const shots = shotsResponse.data;

		debug(`Found ${shots.length} shots to process in ${contextDisplay}`);
		console.log(
			chalk.blue(`Processing ${shots.length} shots in ${contextDisplay}`),
		);

		// Sort shots alphabetically by name (A-Z)
		shots.sort((a: unknown, b: unknown) => {
			const shotA = a as { name: string };
			const shotB = b as { name: string };
			return shotA.name.localeCompare(shotB.name);
		});

		const progressTracker = createProgressTracker(shots.length);

		for (const shotData of shots) {
			const shot = shotData as { id: string; name: string };
			updateProgressWithBold(progressTracker, shot.name);
			debug(`Processing shot: ${shot.name} (${shot.id})`);

			// Get latest version with thumbnail for this shot using QueryService
			const versionsResponse = await withErrorHandling(
				() =>
					queryService.queryAssetVersions(
						`components any (version.asset.parent.id is "${shot.id}") and thumbnail_id != null`,
					),
				{
					operation: "fetch versions with thumbnails",
					entity: "Version",
					additionalData: {
						shotId: shot.id,
						shotName: shot.name,
						contextDisplay,
					},
				},
			);

			if (versionsResponse?.data && versionsResponse.data.length > 0) {
				// Sort by date and version to get the latest
				const sortedVersions = versionsResponse.data.sort(
					(a: unknown, b: unknown) => {
						const versionA = a as { date?: string; version?: number };
						const versionB = b as { date?: string; version?: number };
						const dateA = new Date(versionA.date || 0).getTime();
						const dateB = new Date(versionB.date || 0).getTime();
						if (dateA !== dateB) return dateB - dateA; // Latest date first
						return (versionB.version || 0) - (versionA.version || 0); // Highest version first
					},
				);

				const latestVersionData = sortedVersions[0];
				const latestVersion = latestVersionData as {
					id: string;
					version: number;
					thumbnail_id: string;
					date?: string;
				};

				if (latestVersion.thumbnail_id) {
					debug(
						`Found latest version: v${latestVersion.version} (${latestVersion.id}) with thumbnail ${latestVersion.thumbnail_id} for shot ${shot.name}`,
					);

					// Check if shot already has this thumbnail to avoid unnecessary updates
					const shotDetailsResponse = await withErrorHandling(
						() =>
							session.query(
								`select thumbnail_id from Shot where id is "${shot.id}"`,
							),
						{
							operation: "fetch shot thumbnail details",
							entity: "Shot",
							additionalData: {
								shotId: shot.id,
								shotName: shot.name,
								contextDisplay,
							},
						},
					);

					const currentThumbnailId =
						shotDetailsResponse?.data?.[0]?.thumbnail_id;

					if (currentThumbnailId === latestVersion.thumbnail_id) {
						console.log(
							chalk.hex("#808080")(
								`    ✓ Shot ${shot.name} already has the latest thumbnail (v${latestVersion.version})`,
							),
						);
						debug(
							`Shot ${shot.name} already has thumbnail ${latestVersion.thumbnail_id}, skipping update`,
						);
					} else {
						await withErrorHandling(
							() =>
								session.update("Shot", [shot.id], {
									thumbnail_id: latestVersion.thumbnail_id,
								}),
							{
								operation: "update shot thumbnail",
								entity: "Shot",
								entityId: shot.id,
								additionalData: {
									thumbnailId: latestVersion.thumbnail_id,
									version: latestVersion.version,
									contextDisplay,
								},
							},
						);
						console.log(
							chalk.hex("#2D5016")(
								`    ✓ Updated thumbnail for shot: ${shot.name} (from version ${latestVersion.version})`,
							),
						);
						debug(
							`Updated thumbnail for shot ${shot.name} from version ${latestVersion.version}, thumbnail_id: ${latestVersion.thumbnail_id}`,
						);
					}
				}
			} else {
				console.log(
					chalk.hex("#808080")(
						`    ⚠ No versions with thumbnails found for shot: ${shot.name}`,
					),
				);
				debug(
					`No versions with thumbnails found for shot: ${shot.name} (${shot.id})`,
				);
			}
		}

		completeProgress(progressTracker, "Thumbnail propagation");
	} catch (error: unknown) {
		handleError(error, {
			operation: "propagate thumbnails",
			additionalData: { shotId, contextDisplay },
		});
		throw error;
	}
}
