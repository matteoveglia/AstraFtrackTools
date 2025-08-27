import { Checkbox, Confirm, Input, Select } from "@cliffy/prompt";
import { debugToFile } from "../utils/debug.ts";
import { loadPreferences } from "../utils/preferences.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";
import { getDownloadsDirectory } from "../utils/systemPaths.ts";

import { SessionService } from "../services/session.ts";
import { ComponentService } from "../services/componentService.ts";
import { MediaDownloadService } from "../services/mediaDownloadService.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { FilterService } from "../services/filterService.ts";
import type {
  StatusFilter,
  UserFilter,
  DateFilter,
  CustomAttrFilter,
} from "../services/filterService.ts";

import type { Session } from "@ftrack/api";
import type {
  AssetVersion,
  Component,
  MediaPreference,
  Shot,
} from "../types/mediaDownload.ts";

const DEBUG_LOG_PATH =
  "/Users/matteoveglia/Documents/Coding/AstraFtrackTools/downloadMedia_debug.log";

/**
 * Download Media Tool - Downloads media files from Ftrack asset versions
 *
 * This tool allows users to:
 * - Download from single asset version by ID
 * - Download from multiple shots using fuzzy search
 * - Choose media preferences (original vs encoded)
 * - Download media files with progress tracking
 */
export async function downloadMediaTool(
  session: Session,
  projectContextService: ProjectContextService,
  queryService: QueryService,
): Promise<void> {
  const projectContext = projectContextService.getContext();
  const contextDisplay = projectContext.isGlobal
    ? "all projects"
    : `project "${projectContext.project?.name}"`;

  console.log(`\n📥 Download Media Tool (${contextDisplay})`);
  console.log("=====================================");

  // Initialize services
  const sessionService = new SessionService(session);
  const componentService = new ComponentService(sessionService, queryService);

  // Get authentication headers for downloads as fallback
  const prefs = await loadPreferences();
  const authHeaders = {
    "ftrack-user": prefs.FTRACK_API_USER || "",
    "ftrack-api-key": prefs.FTRACK_API_KEY || "",
  };

  // Pass session object for session-based authentication, with auth headers as fallback
  const mediaDownloadService = new MediaDownloadService(
    4,
    session,
    authHeaders,
  );

  try {
    // Clear previous debug log
    await debugToFile(
      DEBUG_LOG_PATH,
      "=== DOWNLOAD MEDIA TOOL DEBUG SESSION STARTED ===",
    );
    await debugToFile(DEBUG_LOG_PATH, "Project context:", projectContext);
    await debugToFile(DEBUG_LOG_PATH, "Context display:", contextDisplay);

    // Step 1: Initial Selection - Single Asset Version vs Multiple Shots
    const downloadMode = await selectDownloadMode();
    await debugToFile(DEBUG_LOG_PATH, "Download mode selected:", downloadMode);

    if (downloadMode === "single") {
    await handleSingleVersionDownload(
      componentService,
      mediaDownloadService,
      queryService,
    );
    } else {
      await handleMultipleShotsDownload(
        componentService,
        mediaDownloadService,
        queryService,
      );
    }

    console.log("\n✅ Download process completed!");
  } catch (error) {
    handleError(error, {
      operation: "download media",
      entity: "AssetVersion",
      additionalData: { contextDisplay },
    });
    throw error;
  }
}

/**
 * Prompt user to select download mode
 */
async function selectDownloadMode(): Promise<"single" | "multiple"> {
  const mode = await Select.prompt({
    message: "Download media from:",
    options: [
      { name: "A) Single version (enter ID)", value: "single" as const },
      { name: "B) Multiple shots (fuzzy search)", value: "multiple" as const },
    ],
  });

  return mode as "single" | "multiple";
}

/**
 * Handle single version download workflow
 */
async function handleSingleVersionDownload(
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  queryService: QueryService,
): Promise<void> {
  // Get version ID from user
  const versionId = await promptForVersionId();
  if (!versionId) return;

  await debugToFile(
    DEBUG_LOG_PATH,
    "Version ID entered:",
    versionId,
  );

  // Validate and fetch the version
  console.log(`\n🔍 Looking up version: ${versionId}`);

  const assetVersions = await withErrorHandling(
    async () => {
      const result = await queryService.queryAssetVersions(
        `id is "${versionId}"`,
      );
      await debugToFile(DEBUG_LOG_PATH, "Version query result:", result);
      return result;
    },
    {
      operation: "fetch version",
      entity: "AssetVersion",
      additionalData: { versionId },
    },
  );

  if (!assetVersions?.data || assetVersions.data.length === 0) {
    console.log(`❌ Version "${versionId}" not found`);
    return;
  }

  const assetVersion = assetVersions.data[0] as AssetVersion;
  console.log(
    `\n📦 Found version: ${assetVersion.asset?.name || "Unknown"} v${
      assetVersion.version || "Unknown"
    }`,
  );

  // Get media preference and download path
  const mediaPreference = await selectMediaPreference();
  const downloadPath = await getDownloadPath();

  // Process the asset version
  const result = await processAssetVersion(
    assetVersion,
    componentService,
    mediaDownloadService,
    mediaPreference,
    downloadPath,
  );

  // Handle fallback if the download failed
  if (!result.success) {
    console.log(`\n⚠️  Primary download failed: ${result.reason}`);

    const components = await componentService.getComponentsForAssetVersion(
      assetVersion.id,
    );
    if (components.length > 0) {
      const failedDownloads = [{
        shot: {
          id: assetVersion.asset?.parent?.id || "",
          name: assetVersion.asset?.parent?.name || "Unknown",
        } as Shot,
        version: assetVersion,
        components,
        reason: result.reason || "Unknown error",
      }];

      await handleFallbackDownloads(
        failedDownloads,
        componentService,
        mediaDownloadService,
        downloadPath,
      );
    } else {
      console.log(`❌ No components available for fallback`);
    }
  }
}

/**
 * Configure optional filters for shot selection
 */
async function configureShotFilters(): Promise<{
  status?: StatusFilter;
  user?: UserFilter;
  date?: DateFilter;
  custom?: CustomAttrFilter[];
} | null> {
  // Ask user if they want to apply filters
  const useFilters = await Confirm.prompt({
    message: "Would you like to apply filters to narrow down shot selection?",
    default: false,
  });

  if (!useFilters) {
    return null;
  }

  // Let user select which filter types to configure
  const filterTypes = await Checkbox.prompt({
    message: "Select filter types to configure:",
    options: [
      { name: "Status", value: "status" },
      { name: "User", value: "user" },
      { name: "Date", value: "date" },
      { name: "Custom Attributes", value: "custom" },
    ],
    minOptions: 1,
  });

  const filters: {
    status?: StatusFilter;
    user?: UserFilter;
    date?: DateFilter;
    custom?: CustomAttrFilter[];
  } = {};

  // Configure status filter
  if (filterTypes.includes("status")) {
    const statusNames = await Input.prompt({
      message: "Enter status names (comma-separated, e.g., 'In Progress,Review'):",
      validate: (input: string) => {
        if (!input.trim()) {
          return "At least one status name is required";
        }
        return true;
      },
    });
    filters.status = {
      names: statusNames.split(",").map((name) => name.trim()),
    };
  }

  // Configure user filter
  if (filterTypes.includes("user")) {
    const usernames = await Input.prompt({
      message: "Enter usernames (comma-separated, e.g., 'john.doe,jane.smith'):",
      validate: (input: string) => {
        if (!input.trim()) {
          return "At least one username is required";
        }
        return true;
      },
    });
    filters.user = {
      usernames: usernames.split(",").map((name) => name.trim()),
    };
  }

  // Configure date filter
  if (filterTypes.includes("date")) {
    const dateKind = await Select.prompt({
      message: "Select date filter type:",
      options: [
        { name: "Older than", value: "older" },
        { name: "Newer than", value: "newer" },
        { name: "Between dates", value: "between" },
      ],
    }) as "older" | "newer" | "between";

    if (dateKind === "older") {
      const to = await Input.prompt({
        message: "Enter date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      filters.date = { kind: "older", to };
    } else if (dateKind === "newer") {
      const from = await Input.prompt({
        message: "Enter date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      filters.date = { kind: "newer", from };
    } else {
      const from = await Input.prompt({
        message: "Enter start date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      const to = await Input.prompt({
        message: "Enter end date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      filters.date = { kind: "between", from, to };
    }
  }

  // Configure custom attribute filters
  if (filterTypes.includes("custom")) {
    const customFilters: CustomAttrFilter[] = [];
    let addMore = true;

    while (addMore) {
      const key = await Input.prompt({
        message: "Enter custom attribute key:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Attribute key is required";
          }
          return true;
        },
      });

      const op = await Select.prompt({
        message: "Select operator:",
        options: [
          { name: "Equals", value: "eq" },
          { name: "Not equals", value: "neq" },
          { name: "Contains", value: "contains" },
          { name: "Is true", value: "true" },
          { name: "Is false", value: "false" },
        ],
      }) as "eq" | "neq" | "contains" | "true" | "false";

      let value: string | number | boolean | undefined;
      if (op !== "true" && op !== "false") {
        const valueInput = await Input.prompt({
          message: "Enter value:",
          validate: (input: string) => {
            if (!input.trim()) {
              return "Value is required";
            }
            return true;
          },
        });
        // Try to parse as number, otherwise keep as string
        value = isNaN(Number(valueInput)) ? valueInput : Number(valueInput);
      }

      customFilters.push({ key, op, value });

      addMore = await Confirm.prompt({
        message: "Add another custom attribute filter?",
        default: false,
      });
    }

    filters.custom = customFilters;
  }

  return filters;
}

/**
 * Configure optional filters for version selection
 */
async function configureVersionFilters(): Promise<{
  status?: StatusFilter;
  user?: UserFilter;
  date?: DateFilter;
  custom?: CustomAttrFilter[];
} | null> {
  // Let user select which filter types to configure
  const filterTypes = await Checkbox.prompt({
    message: "Select filter types to configure:",
    options: [
      { name: "Status", value: "status" },
      { name: "User", value: "user" },
      { name: "Date", value: "date" },
      { name: "Custom Attributes", value: "custom" },
    ],
    minOptions: 1,
  });

  const filters: {
    status?: StatusFilter;
    user?: UserFilter;
    date?: DateFilter;
    custom?: CustomAttrFilter[];
  } = {};

  // Configure status filter
  if (filterTypes.includes("status")) {
    const statusNames = await Input.prompt({
      message: "Enter status names (comma-separated, e.g., 'In Progress,Review'):",
      validate: (input: string) => {
        if (!input.trim()) {
          return "At least one status name is required";
        }
        return true;
      },
    });
    filters.status = {
      names: statusNames.split(",").map((name) => name.trim()),
    };
  }

  // Configure user filter
  if (filterTypes.includes("user")) {
    const usernames = await Input.prompt({
      message: "Enter usernames (comma-separated, e.g., 'john.doe,jane.smith'):",
      validate: (input: string) => {
        if (!input.trim()) {
          return "At least one username is required";
        }
        return true;
      },
    });
    filters.user = {
      usernames: usernames.split(",").map((name) => name.trim()),
    };
  }

  // Configure date filter
  if (filterTypes.includes("date")) {
    const dateKind = await Select.prompt({
      message: "Select date filter type:",
      options: [
        { name: "Older than", value: "older" },
        { name: "Newer than", value: "newer" },
        { name: "Between dates", value: "between" },
      ],
    }) as "older" | "newer" | "between";

    if (dateKind === "older") {
      const to = await Input.prompt({
        message: "Enter date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      filters.date = { kind: "older", to };
    } else if (dateKind === "newer") {
      const from = await Input.prompt({
        message: "Enter date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      filters.date = { kind: "newer", from };
    } else {
      const from = await Input.prompt({
        message: "Enter start date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      const to = await Input.prompt({
        message: "Enter end date (YYYY-MM-DD):",
        validate: (input: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
            return "Please enter date in YYYY-MM-DD format";
          }
          return true;
        },
      });
      filters.date = { kind: "between", from, to };
    }
  }

  // Configure custom attribute filters
  if (filterTypes.includes("custom")) {
    const customFilters: CustomAttrFilter[] = [];
    let addMore = true;

    while (addMore) {
      const key = await Input.prompt({
        message: "Enter custom attribute key:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Attribute key is required";
          }
          return true;
        },
      });

      const op = await Select.prompt({
        message: "Select operator:",
        options: [
          { name: "Equals", value: "eq" },
          { name: "Not equals", value: "neq" },
          { name: "Contains", value: "contains" },
          { name: "Is true", value: "true" },
          { name: "Is false", value: "false" },
        ],
      }) as "eq" | "neq" | "contains" | "true" | "false";

      let value: string | number | boolean | undefined;
      if (op !== "true" && op !== "false") {
        const valueInput = await Input.prompt({
          message: "Enter value:",
          validate: (input: string) => {
            if (!input.trim()) {
              return "Value is required";
            }
            return true;
          },
        });
        // Try to parse as number, otherwise keep as string
        value = isNaN(Number(valueInput)) ? valueInput : Number(valueInput);
      }

      customFilters.push({ key, op, value });

      addMore = await Confirm.prompt({
        message: "Add another custom attribute filter?",
        default: false,
      });
    }

    filters.custom = customFilters;
  }

  return filters;
}

/**
 * Handle multiple shots download workflow with fuzzy search
 */
async function handleMultipleShotsDownload(
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  queryService: QueryService,
): Promise<void> {
  // Get search pattern from user first
  const searchPattern = await promptForShotSearchPattern();
  if (!searchPattern) return;

  await debugToFile(
    DEBUG_LOG_PATH,
    "Shot search pattern entered:",
    searchPattern,
  );

  // Ask if user wants to apply shot filters
  const applyShotFilters = await Confirm.prompt({
    message: "Would you like to apply filters to narrow down shot selection?",
    default: false,
  });

  // Configure shot filters if requested
  const shotFilters = applyShotFilters ? await configureShotFilters() : null;
  
  // Build filter where clause if shot filters are configured
  let additionalFilters = "";
  if (shotFilters) {
    const filterService = new FilterService();
    additionalFilters = filterService.buildWhere(shotFilters);
    console.log(`📋 Applying shot filters: ${additionalFilters}`);
  }

  // Fetch all shots and filter client-side for fuzzy matching
  console.log(`\n🔍 Searching for shots matching: "${searchPattern}"`);

  const allShots = await withErrorHandling(
    async () => {
      const result = await queryService.queryShots(additionalFilters);
      await debugToFile(DEBUG_LOG_PATH, "All shots query result:", result);
      return result;
    },
    {
      operation: "fetch shots",
      entity: "Shot",
      additionalData: { searchPattern },
    },
  );

  if (!allShots?.data || allShots.data.length === 0) {
    const message = shotFilters 
      ? "❌ No shots found matching the applied shot filters."
      : "❌ No shots found in project";
    console.log(message);
    return;
  }

  // Filter shots using fuzzy matching (case-insensitive) or wildcard
  const matchingShots = searchPattern === "*"
    ? allShots.data
    : allShots.data.filter((shot: unknown) => {
      const typedShot = shot as Shot;
      return typedShot.name &&
        typedShot.name.toLowerCase().includes(searchPattern.toLowerCase());
    });

  // Sort shots alphabetically by name
  matchingShots.sort((a: unknown, b: unknown) => {
    const shotA = a as Shot;
    const shotB = b as Shot;
    return shotA.name.localeCompare(shotB.name);
  });

  await debugToFile(DEBUG_LOG_PATH, "Matching shots found:", matchingShots);

  if (matchingShots.length === 0) {
    console.log(`❌ No shots found matching pattern: "${searchPattern}"`);
    return;
  }

  // Update search message for wildcard
  if (searchPattern === "*") {
    console.log(`\n📋 Found ${matchingShots.length} shot(s) in the project:`);
  } else {
    console.log(
      `\n📋 Found ${matchingShots.length} shot(s) matching "${searchPattern}":`,
    );
  }

  // Ask if user wants to apply version filters
  const applyVersionFilters = await Confirm.prompt({
    message: "Would you like to apply filters to narrow down version selection?",
    default: false,
  });

  // Configure version filters if requested
  const versionFilters = applyVersionFilters ? await configureVersionFilters() : null;

  const shotsWithVersions: Array<{ shot: Shot; latestVersion: AssetVersion }> =
    [];
  for (const shot of matchingShots) {
    const typedShot = shot as Shot;
    // Get filtered asset versions for each shot
    const filteredVersions = await getFilteredAssetVersionsForShot(
      typedShot.id,
      queryService,
      versionFilters,
    );
    
    if (filteredVersions.length > 0) {
      // If version filters are applied, show "Found versions" even for single results
      if (versionFilters) {
        const versionList = filteredVersions.map(v => `v${v.version}`).join(", ");
        console.log(`   - ${typedShot.name} (Found versions: ${versionList})`);
        // Add all matching versions for this shot
        for (const version of filteredVersions) {
          shotsWithVersions.push({
            shot: typedShot,
            latestVersion: version,
          });
        }
      } else {
        // No version filters applied - show "Latest version"
        const version = filteredVersions[0];
        const versionInfo = `v${version.version}`;
        console.log(`   - ${typedShot.name} (Latest version: ${versionInfo})`);
        shotsWithVersions.push({
          shot: typedShot,
          latestVersion: version,
        });
      }
    } else {
      console.log(`   - ${typedShot.name} (No matching versions)`);
    }
  }

  if (shotsWithVersions.length === 0) {
    console.log("❌ No asset versions found for matching shots");
    return;
  }

  // Count unique shots for better messaging
  const uniqueShots = new Set(shotsWithVersions.map(item => item.shot.id)).size;
  const totalVersions = shotsWithVersions.length;
  
  // Confirm with user using the requested format
  const message = `Continue with downloading from these ${uniqueShots} shots - ${totalVersions} versions found?`;
    
  const proceed = await Confirm.prompt({
    message,
    default: true,
  });

  if (!proceed) {
    console.log("❌ Download cancelled by user");
    return;
  }

  // Get media preference and download path
  const mediaPreference = await selectMediaPreference();
  const downloadPath = await getDownloadPath();

  // Process each shot's latest version with concurrency

  const failedDownloads = await processShotsWithConcurrency(
    shotsWithVersions,
    componentService,
    mediaDownloadService,
    mediaPreference,
    downloadPath,
  );

  // Handle fallback downloads if there are any failures
  if (failedDownloads.length > 0) {
    await handleFallbackDownloads(
      failedDownloads,
      componentService,
      mediaDownloadService,
      downloadPath,
    );
  }
}

/**
 * Process shots with concurrency using simple console logging
 */
async function processShotsWithConcurrency(
  shotsWithVersions: Array<{ shot: Shot; latestVersion: AssetVersion }>,
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  mediaPreference: MediaPreference,
  downloadPath: string,
): Promise<
  Array<{
    shot: Shot;
    version: AssetVersion;
    components: Component[];
    reason: string;
  }>
> {
  const failedDownloads: Array<{
    shot: Shot;
    version: AssetVersion;
    components: Component[];
    reason: string;
  }> = [];

  const BATCH_SIZE = 4;
  const totalShots = shotsWithVersions.length;
  const totalBatches = Math.ceil(shotsWithVersions.length / BATCH_SIZE);
  const startTime = Date.now();

  // Simple progress tracking without complex libraries
  const progressState = new Map<
    string,
    { completed: boolean; status: string; elapsed?: number }
  >();

  // Helper function to format elapsed time
  const formatElapsedTime = (start: number): string => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatTotalElapsed = (): string => {
    return formatElapsedTime(startTime);
  };

  console.log(`\n📥 Starting bulk download: ${totalShots} file(s)`);
  console.log(`Batches: ${totalBatches} | Concurrency: ${BATCH_SIZE}`);
  console.log("─".repeat(80));

  // Process shots in batches of BATCH_SIZE
  for (let i = 0; i < shotsWithVersions.length; i += BATCH_SIZE) {
    const batch = shotsWithVersions.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    console.log(
      `\nBatch ${batchNumber}/${totalBatches}: Processing ${batch.length} shot(s)...`,
    );

    const batchStartTime = Date.now();
    let batchSuccessCount = 0;
    let batchFailureCount = 0;

    const batchPromises = batch.map(async ({ shot, latestVersion }) => {
      const key = `${shot.id}-${latestVersion.id}`;
      const itemStartTime = Date.now();

      try {
        // Simple progress callback that updates our state
        const progressCallback = (progress: number, status: string) => {
          progressState.set(key, {
            completed: progress >= 100,
            status: status,
            elapsed: progress >= 100 ? Date.now() - itemStartTime : undefined,
          });
        };

        const result = await processAssetVersionWithProgress(
          latestVersion,
          componentService,
          mediaDownloadService,
          mediaPreference,
          downloadPath,
          (p, s) => {
            void progressCallback(p, s);
          },
        );

        if (!result.success) {
          const elapsed = Math.floor((Date.now() - itemStartTime) / 1000);
          console.log(
            `❌ ${shot.name} (v${latestVersion.version}) - Failed: ${result.reason} (${elapsed}s)`,
          );

          const components = await componentService
            .getComponentsForAssetVersion(latestVersion.id);
          return {
            shot,
            version: latestVersion,
            components: components || [],
            reason: result.reason || "Unknown error",
            success: false,
          };
        }

        const elapsed = Math.floor((Date.now() - itemStartTime) / 1000);
        console.log(
          `✅ ${shot.name} (v${latestVersion.version}) - Completed (${elapsed}s)`,
        );
        return {
          shot,
          version: latestVersion,
          success: true,
          components: [],
          reason: "",
        };
      } catch (error) {
        const elapsed = Math.floor((Date.now() - itemStartTime) / 1000);
        const errorMessage = error instanceof Error
          ? error.message
          : "Unknown error";
        console.log(
          `❌ ${shot.name} (v${latestVersion.version}) - Error: ${errorMessage} (${elapsed}s)`,
        );
        return {
          shot,
          version: latestVersion,
          components: [],
          reason: errorMessage,
          success: false,
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, batchIndex) => {
      const { shot, latestVersion } = batch[batchIndex];
      if (result.status === "fulfilled") {
        if (!result.value.success) {
          failedDownloads.push({
            shot: result.value.shot,
            version: result.value.version,
            components: result.value.components || [],
            reason: result.value.reason || "Unknown error",
          });
          batchFailureCount++;
        } else {
          batchSuccessCount++;
        }
      } else {
        // Promise rejected
        componentService.getComponentsForAssetVersion(latestVersion.id).then(
          (components) => {
            failedDownloads.push({
              shot,
              version: latestVersion,
              components: components || [],
              reason: `Promise rejected: ${result.reason || "Unknown error"}`,
            });
          },
        );
        batchFailureCount++;
      }
    });

    const batchElapsed = Math.floor((Date.now() - batchStartTime) / 1000);
    console.log(
      `   ⏱️  Batch ${batchNumber} completed: ${batchSuccessCount} successful, ${batchFailureCount} failed (${batchElapsed}s)`,
    );
  }

  // Final summary
  const totalElapsed = formatTotalElapsed();
  const successCount = totalShots - failedDownloads.length;

  console.log("\n" + "═".repeat(80));
  console.log("📊 DOWNLOAD COMPLETED");
  console.log(
    `Results: ${successCount}/${totalShots} successful (${
      Math.round((successCount / totalShots) * 100)
    }%)`,
  );
  console.log(`Total time: ${totalElapsed}`);
  console.log("═".repeat(80));

  return failedDownloads;
}

/**
 * Get latest asset version for a shot
 */

async function getFilteredAssetVersionsForShot(
  shotId: string,
  queryService: QueryService,
  filters: {
    status?: StatusFilter;
    user?: UserFilter;
    date?: DateFilter;
    custom?: CustomAttrFilter[];
  } | null,
): Promise<AssetVersion[]> {
  try {
    // Build base query for asset versions in this shot
    let whereClause = `asset.parent.id is "${shotId}"`;
    
    // Apply filters if provided
    if (filters) {
      const filterService = new FilterService();
      const filterWhere = filterService.buildWhere(filters);
      if (filterWhere) {
        whereClause += ` and ${filterWhere}`;
      }
    }
    
    // Query asset versions with filters applied
    const query = `${whereClause} order by version desc limit 50`;
    const versionsResult = await queryService.queryAssetVersions(query);

    await debugToFile(
      DEBUG_LOG_PATH,
      `Asset versions query for shot ${shotId}: ${query}`,
      versionsResult,
    );

    if (versionsResult?.data && versionsResult.data.length > 0) {
      const versions = versionsResult.data as AssetVersion[];
      
      // If no filters applied, use the original logic to prefer certain asset types
      if (!filters) {
        // Log what asset types we found
        const assetTypes = versions.map((av) => av.asset?.type?.name).filter(Boolean);
        await debugToFile(
          DEBUG_LOG_PATH,
          `Asset types found for shot ${shotId}:`,
          assetTypes,
        );

        // Try to find "Review" type first
        const reviewVersion = versions.find((av) => av.asset?.type?.name === "Review");
        if (reviewVersion) {
          return [reviewVersion];
        }

        // If no Review type, try common media types
        const mediaTypes = ["Comp", "Render", "Movie", "Video", "Media"];
        for (const mediaType of mediaTypes) {
          const mediaVersion = versions.find((av) => av.asset?.type?.name === mediaType);
          if (mediaVersion) {
            await debugToFile(
              DEBUG_LOG_PATH,
              `Using asset type "${mediaType}" for shot ${shotId}`,
            );
            return [mediaVersion];
          }
        }

        // If no common media types, return the latest version of any type
        await debugToFile(
          DEBUG_LOG_PATH,
          `Using latest version of any type for shot ${shotId}:`,
          versions[0],
        );
        return [versions[0]];
      }
      
      // With filters applied, return all matching versions
      await debugToFile(
        DEBUG_LOG_PATH,
        `Found ${versions.length} filtered asset versions for shot ${shotId}`,
        versions,
      );
      return versions;
    }

    return [];
  } catch (error) {
    await debugToFile(
      DEBUG_LOG_PATH,
      `Error getting filtered versions for shot ${shotId}:`,
      error,
    );
    return [];
  }
}

/**
 * Prompt user for version ID
 */
async function promptForVersionId(): Promise<string | null> {
  const versionId = await Input.prompt({
    message: "Enter version ID:",
    validate: (input: string) => {
      if (!input.trim()) {
        return "Version ID is required";
      }
      return true;
    },
  });

  return versionId.trim() || null;
}

/**
 * Prompt user for shot search pattern
 */
async function promptForShotSearchPattern(): Promise<string | null> {
  const searchPattern = await Input.prompt({
    message:
      'Enter search pattern (e.g., "SHOT0" or "*" for all shots)\n Example: "SHOT0" would find all shots containing "SHOT0" in their name:',
    validate: (input: string) => {
      if (!input.trim()) {
        return "Search pattern is required";
      }
      return true;
    },
  });

  return searchPattern.trim() || null;
}

/**
 * Get user's media preference
 */
async function selectMediaPreference(): Promise<MediaPreference> {
  const preference = await Select.prompt({
    message: "Select media preference:",
    options: [
      { name: "Original Quality (prefer original files)", value: "original" },
      {
        name: "Encoded Quality (prefer encoded/review files)",
        value: "encoded",
      },
    ],
  });

  return preference as MediaPreference;
}

/**
 * Get download path from user
 */
async function getDownloadPath(): Promise<string> {
  const systemDownloads = getDownloadsDirectory();

  const downloadPath = await Input.prompt({
    message: "Enter download directory path (or press Enter for default):",
    default: systemDownloads,
  });

  return downloadPath.trim() || systemDownloads;
}

/**
 * Process a single asset version for download
 */
async function processAssetVersion(
  version: AssetVersion,
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  mediaPreference: MediaPreference,
  downloadPath: string,
): Promise<{ success: boolean; reason?: string }> {
  try {
    console.log(
      `\n📋 Processing: ${
        version.asset?.name || "Unknown Asset"
      } v${version.version}`,
    );

    // Get components for this asset version
    const components = await componentService.getComponentsForAssetVersion(
      version.id,
    );

    if (!components || components.length === 0) {
      console.log(`⚠️  No components found for asset version ${version.id}`);
      return { success: false, reason: "No components found" };
    }

    console.log(`📁 Found ${components.length} component(s)`);

    // Find the best component based on preference
    const bestComponent = componentService.findBestComponent(
      components,
      mediaPreference,
    );

    if (!bestComponent) {
      console.log(
        `❌ No suitable component found for preference: ${mediaPreference}`,
      );
      return {
        success: false,
        reason:
          `No suitable component found for preference: ${mediaPreference}`,
      };
    }

    const componentType = componentService.identifyComponentType(bestComponent);
    console.log(
      `🎯 Selected component: ${bestComponent.name} (${componentType})`,
    );

    // Get download URL
    const downloadUrl = await componentService.getDownloadUrl(bestComponent.id);
    await debugToFile(
      DEBUG_LOG_PATH,
      `Generated download URL for component ${bestComponent.id}:`,
      downloadUrl,
    );

    if (!downloadUrl) {
      console.log(
        `❌ Could not get download URL for component: ${bestComponent.name}`,
      );
      return { success: false, reason: "Could not get download URL" };
    }

    // Generate filename
    const filename = mediaDownloadService.generateSafeFilename(
      bestComponent,
      version,
    );

    console.log(`📥 Starting download: ${filename}`);

    // Download the file
    await mediaDownloadService.downloadFile(
      downloadUrl,
      downloadPath,
      filename,
    );
    console.log(`✅ Download completed: ${filename}`);

    return { success: true };
  } catch (error) {
    handleError(error, {
      operation: "process asset version",
      entity: "AssetVersion",
      additionalData: { versionId: version.id },
    });
    return { success: false, reason: `Error: ${error}` };
  }
}

/**
 * Process a single asset version for download with progress callback
 */
async function processAssetVersionWithProgress(
  version: AssetVersion,
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  mediaPreference: MediaPreference,
  downloadPath: string,
  progressCallback: (progress: number, status: string) => void,
): Promise<{ success: boolean; reason?: string }> {
  try {
    progressCallback(10, "Getting components...");

    // Get components for this asset version
    const components = await componentService.getComponentsForAssetVersion(
      version.id,
    );

    if (!components || components.length === 0) {
      return { success: false, reason: "No components found" };
    }

    progressCallback(30, `Found ${components.length} component(s)`);

    // Find the best component based on preference
    const bestComponent = componentService.findBestComponent(
      components,
      mediaPreference,
    );

    if (!bestComponent) {
      return {
        success: false,
        reason:
          `No suitable component found for preference: ${mediaPreference}`,
      };
    }

    const componentType = componentService.identifyComponentType(bestComponent);
    progressCallback(50, `Selected ${componentType} component`);

    // Get download URL
    const downloadUrl = await componentService.getDownloadUrl(bestComponent.id);
    await debugToFile(
      DEBUG_LOG_PATH,
      `Generated download URL for component ${bestComponent.id}:`,
      downloadUrl,
    );

    if (!downloadUrl) {
      return { success: false, reason: "Could not get download URL" };
    }

    progressCallback(70, "Starting download...");

    // Generate filename
    const filename = mediaDownloadService.generateSafeFilename(
      bestComponent,
      version,
    );

    // Download the file
    await mediaDownloadService.downloadFile(
      downloadUrl,
      downloadPath,
      filename,
    );

    progressCallback(100, "✅ Completed");

    return { success: true };
  } catch (error) {
    handleError(error, {
      operation: "process asset version",
      entity: "AssetVersion",
      additionalData: { versionId: version.id },
    });
    return { success: false, reason: `Error: ${error}` };
  }
}

/**
 * Handle fallback downloads for failed media downloads
 */
async function handleFallbackDownloads(
  failedDownloads: Array<{
    shot: Shot;
    version: AssetVersion;
    components: Component[];
    reason: string;
  }>,
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  downloadPath: string,
): Promise<void> {
  console.log(
    `\n⚠️  ${failedDownloads.length} shot(s) had missing media. Choose fallback option:`,
  );

  const fallbackOption = await Select.prompt({
    message: "How would you like to handle missing media?",
    options: [
      {
        name: "🤖 Automatic fallback (720p > 1080p > image > original)",
        value: "automatic",
      },
      {
        name: "🎯 Manual selection (choose for each shot)",
        value: "manual",
      },
      {
        name: "❌ Skip fallback downloads",
        value: "skip",
      },
    ],
  });

  if (fallbackOption === "skip") {
    console.log("⏭️  Skipping fallback downloads");
    return;
  }

  console.log(
    `\n📥 Processing ${failedDownloads.length} fallback download(s)...`,
  );

  for (let i = 0; i < failedDownloads.length; i++) {
    const { shot, version, components } = failedDownloads[i];
    console.log(
      `\n[${i + 1}/${failedDownloads.length}] Fallback for ${shot.name}:`,
    );

    if (components.length === 0) {
      console.log(`❌ No components available for fallback`);
      continue;
    }

    if (fallbackOption === "automatic") {
      await handleAutomaticFallback(
        shot,
        version,
        components,
        componentService,
        mediaDownloadService,
        downloadPath,
      );
    } else {
      await handleManualFallback(
        shot,
        version,
        components,
        componentService,
        mediaDownloadService,
        downloadPath,
      );
    }
  }
}

/**
 * Handle automatic fallback with priority: 720p > 1080p > image > original
 */
async function handleAutomaticFallback(
  _shot: Shot,
  version: AssetVersion,
  components: Component[],
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  downloadPath: string,
): Promise<void> {
  // Categorize components by type
  const componentsByType = new Map<string, Component[]>();

  for (const component of components) {
    const type = componentService.identifyComponentType(component);
    if (!componentsByType.has(type)) {
      componentsByType.set(type, []);
    }
    componentsByType.get(type)!.push(component);
  }

  // Define fallback priority: 720p > 1080p > image > original > other
  const fallbackPriority = [
    "encoded-720p",
    "encoded-1080p",
    "other",
    "original",
  ];

  let selectedComponent: Component | null = null;
  let selectedType = "";

  for (const type of fallbackPriority) {
    const componentsOfType = componentsByType.get(type);
    if (componentsOfType && componentsOfType.length > 0) {
      // For 'other' type, prefer image files
      if (type === "other") {
        const imageComponent = componentsOfType.find((c) =>
          c.file_type &&
          ["jpg", "jpeg", "png", "tiff", "tif", "exr", "dpx"].some((ext) =>
            c.file_type.toLowerCase().includes(ext)
          )
        );
        if (imageComponent) {
          selectedComponent = imageComponent;
          selectedType = "image";
          break;
        }
      } else {
        // For other types, pick the largest component
        selectedComponent = componentsOfType.reduce((best, current) =>
          (current.size || 0) > (best.size || 0) ? current : best
        );
        selectedType = type;
        break;
      }
    }
  }

  if (!selectedComponent) {
    console.log(`❌ No suitable fallback component found`);
    return;
  }

  console.log(`🎯 Auto-selected: ${selectedComponent.name} (${selectedType})`);

  try {
    const downloadUrl = await componentService.getDownloadUrl(
      selectedComponent.id,
    );
    if (!downloadUrl) {
      console.log(`❌ Could not get download URL for fallback component`);
      return;
    }

    const filename = mediaDownloadService.generateSafeFilename(
      selectedComponent,
      version,
    );
    console.log(`📥 Starting fallback download: ${filename}`);

    await mediaDownloadService.downloadFile(
      downloadUrl,
      downloadPath,
      filename,
    );
    console.log(`✅ Fallback download completed: ${filename}`);
  } catch (error) {
    console.log(`❌ Fallback download failed: ${error}`);
  }
}

/**
 * Handle manual fallback selection for each shot
 */
async function handleManualFallback(
  shot: Shot,
  version: AssetVersion,
  components: Component[],
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  downloadPath: string,
): Promise<void> {
  console.log(`📁 Available components for ${shot.name}:`);

  // Create options for each component with type and size info
  const componentOptions = components.map((component, index) => {
    const type = componentService.identifyComponentType(component);
    const sizeInfo = component.size
      ? formatBytes(component.size)
      : "Unknown size";
    return {
      name: `${component.name} (${type}, ${sizeInfo})`,
      value: index,
    };
  });

  // Add skip option
  componentOptions.push({
    name: "⏭️  Skip this shot",
    value: -1,
  });

  const selectedIndex = await Select.prompt({
    message: `Select component to download for ${shot.name}:`,
    options: componentOptions,
  });

  if (selectedIndex === -1) {
    console.log(`⏭️  Skipped ${shot.name}`);
    return;
  }

  const selectedComponent = components[selectedIndex];
  console.log(`🎯 Selected: ${selectedComponent.name}`);

  try {
    const downloadUrl = await componentService.getDownloadUrl(
      selectedComponent.id,
    );
    if (!downloadUrl) {
      console.log(`❌ Could not get download URL for selected component`);
      return;
    }

    const filename = mediaDownloadService.generateSafeFilename(
      selectedComponent,
      version,
    );
    console.log(`📥 Starting download: ${filename}`);

    await mediaDownloadService.downloadFile(
      downloadUrl,
      downloadPath,
      filename,
    );
    console.log(`✅ Download completed: ${filename}`);
  } catch (error) {
    console.log(`❌ Download failed: ${error}`);
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
