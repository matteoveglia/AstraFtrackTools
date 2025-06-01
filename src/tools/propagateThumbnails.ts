import { Session } from "@ftrack/api";
import inquirer from "inquirer";
import chalk from "chalk";
import { debug } from "../utils/debug.ts";
import { createProgressTracker, formatProgress, getETA, completeProgress } from "../utils/progress.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

// Custom progress function for propagate thumbnails with bold formatting
function updateProgressWithBold(tracker: any, item?: string): void {
  tracker.current++;
  tracker.lastUpdate = Date.now();
  
  const progress = formatProgress(tracker.current, tracker.total);
  const eta = tracker.current < tracker.total ? ` (ETA: ${getETA(tracker)})` : '';
  const itemText = item ? `: ${item}` : '';
  
  console.log(chalk.bold(`[${progress}]${eta} Processing${itemText}`));
}

export async function propagateThumbnails(session: Session, shotId?: string) {
  // If no shotId provided, prompt user for input
  if (!shotId) {
    debug("No shot ID provided, prompting user for input");
    const answer = await inquirer.prompt({
      type: "input",
      name: "shotId",
      message: "Enter Shot ID (leave empty to process all shots):",
    });
    shotId = answer.shotId;
  }

  try {
    // Get shots to process
    const shotsQuery = shotId
      ? `select id, name from Shot where id is "${shotId}"`
      : "select id, name from Shot";

    const shotsResponse = await session.query(shotsQuery);
    const shots = shotsResponse.data;

    debug(`Found ${shots.length} shots to process`);

    // Sort shots alphabetically by name (A-Z)
    shots.sort((a: any, b: any) => a.name.localeCompare(b.name));

    const progressTracker = createProgressTracker(shots.length);

    for (const shot of shots) {
      updateProgressWithBold(progressTracker, shot.name);
      debug(`Processing shot: ${shot.name} (${shot.id})`);

      // Get latest version with thumbnail for this shot
      // Updated query to ensure we get the most recent version by date and version number
      const versionsResponse = await session.query(`
                select 
                    id,
                    version,
                    thumbnail_id,
                    asset.name,
                    date
                from AssetVersion 
                where (components any (version.asset.parent.id is "${shot.id}"))
                and thumbnail_id != null
                order by date desc, version desc
                limit 1
            `);

      if (versionsResponse.data.length > 0) {
        const latestVersion = versionsResponse.data[0];
        if (latestVersion.thumbnail_id) {
          debug(
            `Found latest version: v${latestVersion.version} (${latestVersion.id}) with thumbnail ${latestVersion.thumbnail_id} for shot ${shot.name}`,
          );
          
          // Check if shot already has this thumbnail to avoid unnecessary updates
          const shotDetailsResponse = await session.query(`
            select thumbnail_id from Shot where id is "${shot.id}"
          `);
          
          const currentThumbnailId = shotDetailsResponse.data[0]?.thumbnail_id;
          
          if (currentThumbnailId === latestVersion.thumbnail_id) {
            console.log(chalk.hex('#808080')(`    ✓ Shot ${shot.name} already has the latest thumbnail (v${latestVersion.version})`));
            debug(`Shot ${shot.name} already has thumbnail ${latestVersion.thumbnail_id}, skipping update`);
          } else {
            await withErrorHandling(
              () => session.update("Shot", [shot.id], {
                thumbnail_id: latestVersion.thumbnail_id,
              }),
              {
                operation: 'update shot thumbnail',
                entity: 'Shot',
                entityId: shot.id,
                additionalData: { thumbnailId: latestVersion.thumbnail_id, version: latestVersion.version }
              }
            );
            console.log(chalk.hex('#2D5016')(`    ✓ Updated thumbnail for shot: ${shot.name} (from version ${latestVersion.version})`));
            debug(`Updated thumbnail for shot ${shot.name} from version ${latestVersion.version}, thumbnail_id: ${latestVersion.thumbnail_id}`);
          }
        }
      } else {
        console.log(chalk.hex('#808080')(`    ⚠ No versions with thumbnails found for shot: ${shot.name}`));
        debug(`No versions with thumbnails found for shot: ${shot.name} (${shot.id})`);
      }
    }

    completeProgress(progressTracker, 'Thumbnail propagation');
  } catch (error: unknown) {
    handleError(error, {
      operation: 'propagate thumbnails',
      additionalData: { shotId }
    });
  }
}
