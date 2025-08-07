import { Input, Select, Confirm } from "@cliffy/prompt";
import { join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";

import { debugToFile } from "../utils/debug.ts";
import { loadPreferences } from "../utils/preferences.ts";
import { withErrorHandling, handleError } from "../utils/errorHandler.ts";

import { SessionService } from "../services/session.ts";
import { ComponentService } from "../services/componentService.ts";
import { MediaDownloadService } from "../services/mediaDownloadService.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";

import type { Session } from "@ftrack/api";
import type { AssetVersion, Component, MediaPreference } from "../types/mediaDownload.ts";

const DEBUG_LOG_PATH = "/Users/matteoveglia/Documents/Coding/AstraFtrackTools/downloadMedia_debug.log";

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
  queryService: QueryService
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
    'ftrack-user': prefs.FTRACK_API_USER || '',
    'ftrack-api-key': prefs.FTRACK_API_KEY || ''
  };
  
  // Pass session object for session-based authentication, with auth headers as fallback
  const mediaDownloadService = new MediaDownloadService(4, session, authHeaders);

  try {
    // Clear previous debug log
    await debugToFile(DEBUG_LOG_PATH, "=== DOWNLOAD MEDIA TOOL DEBUG SESSION STARTED ===");
    await debugToFile(DEBUG_LOG_PATH, "Project context:", projectContext);
    await debugToFile(DEBUG_LOG_PATH, "Context display:", contextDisplay);

    // Step 1: Initial Selection - Single Asset Version vs Multiple Shots
    const downloadMode = await selectDownloadMode();
    await debugToFile(DEBUG_LOG_PATH, "Download mode selected:", downloadMode);

    if (downloadMode === "single") {
      await handleSingleAssetVersionDownload(componentService, mediaDownloadService, queryService);
    } else {
      await handleMultipleShotsDownload(componentService, mediaDownloadService, queryService);
    }

    console.log("\n✅ Download process completed!");

  } catch (error) {
    handleError(error, {
      operation: 'download media',
      entity: 'AssetVersion',
      additionalData: { contextDisplay }
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
      { name: "A) Single asset version (enter ID)", value: "single" as const },
      { name: "B) Multiple shots (fuzzy search)", value: "multiple" as const }
    ]
  });

  return mode as "single" | "multiple";
}

/**
 * Handle single asset version download workflow
 */
async function handleSingleAssetVersionDownload(
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  queryService: QueryService
): Promise<void> {
  // Get asset version ID from user
  const assetVersionId = await promptForAssetVersionId();
  if (!assetVersionId) return;

  await debugToFile(DEBUG_LOG_PATH, "Asset version ID entered:", assetVersionId);

  // Validate and fetch the asset version
  console.log(`\n🔍 Looking up asset version: ${assetVersionId}`);
  
  const assetVersions = await withErrorHandling(
    async () => {
      const result = await queryService.queryAssetVersions(`id is "${assetVersionId}"`);
      await debugToFile(DEBUG_LOG_PATH, "Asset version query result:", result);
      return result;
    },
    {
      operation: 'fetch asset version',
      entity: 'AssetVersion',
      additionalData: { assetVersionId }
    }
  );

  if (!assetVersions?.data || assetVersions.data.length === 0) {
    console.log(`❌ Asset version "${assetVersionId}" not found`);
    return;
  }

  const assetVersion = assetVersions.data[0] as AssetVersion;
  console.log(`\n📦 Found asset version: ${assetVersion.asset?.name || "Unknown"} v${assetVersion.version || "Unknown"}`);

  // Get media preference and download path
  const mediaPreference = await selectMediaPreference();
  const downloadPath = await getDownloadPath();

  // Process the asset version
  await processAssetVersion(
    assetVersion,
    componentService,
    mediaDownloadService,
    mediaPreference,
    downloadPath
  );
}

/**
 * Handle multiple shots download workflow with fuzzy search
 */
async function handleMultipleShotsDownload(
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  queryService: QueryService
): Promise<void> {
  // Get search pattern from user
  const searchPattern = await promptForShotSearchPattern();
  if (!searchPattern) return;

  await debugToFile(DEBUG_LOG_PATH, "Shot search pattern entered:", searchPattern);

  // Fetch all shots and filter client-side for fuzzy matching
  console.log(`\n🔍 Searching for shots matching: "${searchPattern}"`);
  
  const allShots = await withErrorHandling(
    async () => {
      const result = await queryService.queryShots();
      await debugToFile(DEBUG_LOG_PATH, "All shots query result:", result);
      return result;
    },
    {
      operation: 'fetch shots',
      entity: 'Shot',
      additionalData: { searchPattern }
    }
  );

  if (!allShots?.data || allShots.data.length === 0) {
    console.log("❌ No shots found in project");
    return;
  }

  // Filter shots using fuzzy matching (case-insensitive)
  const matchingShots = allShots.data.filter((shot: any) => 
    shot.name && shot.name.toLowerCase().includes(searchPattern.toLowerCase())
  );

  await debugToFile(DEBUG_LOG_PATH, "Matching shots found:", matchingShots);

  if (matchingShots.length === 0) {
    console.log(`❌ No shots found matching pattern: "${searchPattern}"`);
    return;
  }

  // Display found shots with their latest versions
  console.log(`\n📋 Found ${matchingShots.length} matching shot(s):`);
  
  const shotsWithVersions = [];
  for (const shot of matchingShots) {
    // Get latest asset version for each shot
    const latestVersion = await getLatestAssetVersionForShot(shot.id, queryService);
    const versionInfo = latestVersion ? `v${latestVersion.version}` : "No versions";
    console.log(`   - ${shot.name} (Latest version: ${versionInfo})`);
    
    if (latestVersion) {
      shotsWithVersions.push({
        shot,
        latestVersion
      });
    }
  }

  if (shotsWithVersions.length === 0) {
    console.log("❌ No asset versions found for matching shots");
    return;
  }

  // Confirm with user
  const proceed = await Confirm.prompt({
    message: `Continue with downloading from these ${shotsWithVersions.length} shot(s)?`,
    default: true
  });

  if (!proceed) {
    console.log("❌ Download cancelled by user");
    return;
  }

  // Get media preference and download path
  const mediaPreference = await selectMediaPreference();
  const downloadPath = await getDownloadPath();

  // Process each shot's latest version
  console.log(`\n📥 Starting bulk download from ${shotsWithVersions.length} shot(s)...`);
  
  for (let i = 0; i < shotsWithVersions.length; i++) {
    const { shot, latestVersion } = shotsWithVersions[i];
    console.log(`\n[${i + 1}/${shotsWithVersions.length}] Processing ${shot.name}...`);
    
    await processAssetVersion(
      latestVersion,
      componentService,
      mediaDownloadService,
      mediaPreference,
      downloadPath
    );
  }
}

/**
 * Get latest asset version for a shot
 */
async function getLatestAssetVersionForShot(shotId: string, queryService: QueryService): Promise<AssetVersion | null> {
  try {
    // First, try to find any asset versions for this shot (not just "Review" type)
    const allVersionsResult = await queryService.queryAssetVersions(
      `asset.parent.id is "${shotId}" order by version desc limit 10`
    );
    
    await debugToFile(DEBUG_LOG_PATH, `All asset versions for shot ${shotId}:`, allVersionsResult);
    
    if (allVersionsResult?.data && allVersionsResult.data.length > 0) {
      // Log what asset types we found
      const assetTypes = allVersionsResult.data.map((av: any) => av.asset?.type?.name).filter(Boolean);
      await debugToFile(DEBUG_LOG_PATH, `Asset types found for shot ${shotId}:`, assetTypes);
      
      // Try to find "Review" type first
      const reviewVersion = allVersionsResult.data.find((av: any) => av.asset?.type?.name === "Review");
      if (reviewVersion) {
        return reviewVersion as AssetVersion;
      }
      
      // If no Review type, try common media types
      const mediaTypes = ["Comp", "Render", "Movie", "Video", "Media"];
      for (const mediaType of mediaTypes) {
        const mediaVersion = allVersionsResult.data.find((av: any) => av.asset?.type?.name === mediaType);
        if (mediaVersion) {
          await debugToFile(DEBUG_LOG_PATH, `Using asset type "${mediaType}" for shot ${shotId}`);
          return mediaVersion as AssetVersion;
        }
      }
      
      // If no common media types, return the latest version of any type
      await debugToFile(DEBUG_LOG_PATH, `Using latest version of any type for shot ${shotId}:`, allVersionsResult.data[0]);
      return allVersionsResult.data[0] as AssetVersion;
    }
    
    return null;
  } catch (error) {
    await debugToFile(DEBUG_LOG_PATH, `Error getting latest version for shot ${shotId}:`, error);
    return null;
  }
}

/**
 * Prompt user for asset version ID
 */
async function promptForAssetVersionId(): Promise<string | null> {
  const assetVersionId = await Input.prompt({
    message: "Enter asset version ID:",
    validate: (input: string) => {
      if (!input.trim()) {
        return "Asset version ID is required";
      }
      return true;
    },
  });

  return assetVersionId.trim() || null;
}

/**
 * Prompt user for shot search pattern
 */
async function promptForShotSearchPattern(): Promise<string | null> {
  const searchPattern = await Input.prompt({
    message: "Enter search pattern (e.g., \"SHOT0\") - Which would find all shots containing \"SHOT0\" in their name:",
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
      { name: "Encoded Quality (prefer encoded/review files)", value: "encoded" }
    ]
  });

  return preference as MediaPreference;
}

/**
 * Get download path from user
 */
async function getDownloadPath(): Promise<string> {
  const downloadPath = await Input.prompt({
    message: "Enter download directory path (or press Enter for default):",
    default: "./downloads"
  });

  return downloadPath.trim() || "./downloads";
}

/**
 * Process a single asset version for download
 */
async function processAssetVersion(
  version: AssetVersion,
  componentService: ComponentService,
  mediaDownloadService: MediaDownloadService,
  mediaPreference: MediaPreference,
  downloadPath: string
): Promise<void> {
  try {
    console.log(`\n📋 Processing: ${version.asset?.name || 'Unknown Asset'} v${version.version}`);

    // Get components for this asset version
    const components = await componentService.getComponentsForAssetVersion(version.id);

    if (!components || components.length === 0) {
      console.log(`⚠️  No components found for asset version ${version.id}`);
      return;
    }

    console.log(`📁 Found ${components.length} component(s)`);

    // Find the best component based on preference
    const bestComponent = componentService.findBestComponent(components, mediaPreference);

    if (!bestComponent) {
      console.log(`❌ No suitable component found for preference: ${mediaPreference}`);
      return;
    }

    const componentType = componentService.identifyComponentType(bestComponent);
    console.log(`🎯 Selected component: ${bestComponent.name} (${componentType})`);

    // Get download URL
      const downloadUrl = await componentService.getDownloadUrl(bestComponent.id);
      await debugToFile(DEBUG_LOG_PATH, `Generated download URL for component ${bestComponent.id}:`, downloadUrl);
      
      if (!downloadUrl) {
        console.log(`❌ Could not get download URL for component: ${bestComponent.name}`);
        return;
      }

     // Generate filename
     const filename = mediaDownloadService.generateSafeFilename(bestComponent, version);

     console.log(`📥 Starting download: ${filename}`);

     // Download the file
     await mediaDownloadService.downloadFile(downloadUrl, downloadPath, filename);
     console.log(`✅ Download completed: ${filename}`);

  } catch (error) {
    handleError(error, {
      operation: 'process asset version',
      entity: 'AssetVersion',
      additionalData: { versionId: version.id }
    });
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}