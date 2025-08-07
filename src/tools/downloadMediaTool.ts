import type { Session } from "@ftrack/api";
import { Select, Input, Confirm } from "@cliffy/prompt";
import { debug, debugToFile } from "../utils/debug.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { ComponentService } from "../services/componentService.ts";
import { MediaDownloadService } from "../services/mediaDownloadService.ts";
import { SessionService } from "../services/session.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";
import { loadPreferences } from "../utils/preferences.ts";
import type { 
  MediaPreference, 
  Component, 
  AssetVersion,
  ComponentType 
} from "../types/index.ts";

const DEBUG_LOG_PATH = "/Users/matteoveglia/Documents/Coding/AstraFtrackTools/downloadMedia_debug.log";

/**
 * Download Media Tool - Downloads media files from Ftrack asset versions
 * 
 * This tool allows users to:
 * - Search and select shots
 * - View available asset versions and components
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

    // Step 1: Shot Selection
    const shotInput = await promptForShotId();
    if (!shotInput) return;

    await debugToFile(DEBUG_LOG_PATH, "Shot input entered:", shotInput);
    
    // Step 2: Resolve shot name to ID
    console.log(`\n🔍 Looking up shot: ${shotInput}`);
    const shotId = await resolveShotNameToId(shotInput, queryService);
    if (!shotId) {
      console.log(`❌ Shot "${shotInput}" not found in project`);
      return;
    }

    await debugToFile(DEBUG_LOG_PATH, "Resolved shot ID:", shotId);
    console.log(`\n🔍 Searching for asset versions in shot: ${shotInput} (ID: ${shotId})`);

    // Step 3: Fetch asset versions for the shot
    const queryFilter = `asset.parent.id is "${shotId}"`;
    await debugToFile(DEBUG_LOG_PATH, "Query filter:", queryFilter);

    const assetVersions = await withErrorHandling(
      async () => {
        await debugToFile(DEBUG_LOG_PATH, "Executing queryAssetVersions with filter:", queryFilter);
        const result = await queryService.queryAssetVersions(queryFilter);
        await debugToFile(DEBUG_LOG_PATH, "Raw query result:", result);
        return result;
      },
      {
        operation: 'fetch asset versions',
        entity: 'AssetVersion',
        additionalData: { shotId, contextDisplay }
      }
    );

    await debugToFile(DEBUG_LOG_PATH, "Asset versions result:", assetVersions);

    if (!assetVersions?.data || assetVersions.data.length === 0) {
      await debugToFile(DEBUG_LOG_PATH, "No asset versions found - result was:", assetVersions);
      console.log(`❌ No asset versions found for shot "${shotId}"`);
      return;
    }

    console.log(`\n📦 Found ${assetVersions.data.length} asset version(s)`);

    // Step 3: Let user select asset version(s)
    const selectedVersions = await selectAssetVersions(assetVersions.data);
    if (selectedVersions.length === 0) return;

    // Step 4: Get media preference
    const mediaPreference = await selectMediaPreference();

    // Step 5: Get download path
    const downloadPath = await getDownloadPath();

    // Step 6: Process each selected version
    for (const version of selectedVersions) {
      await processAssetVersion(
        version,
        componentService,
        mediaDownloadService,
        mediaPreference,
        downloadPath
      );
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
 * Resolve shot name to ID
 */
async function resolveShotNameToId(shotInput: string, queryService: QueryService): Promise<string | null> {
  await debugToFile(DEBUG_LOG_PATH, "Resolving shot name to ID:", shotInput);
  
  try {
    // First try to find by name
    const shotByNameResponse = await queryService.queryShots(`name is "${shotInput}"`);
    await debugToFile(DEBUG_LOG_PATH, "Shot query by name result:", shotByNameResponse);
    
    if (shotByNameResponse?.data && shotByNameResponse.data.length > 0) {
      const shot = shotByNameResponse.data[0] as { id: string; name: string };
      await debugToFile(DEBUG_LOG_PATH, "Found shot by name:", shot);
      return shot.id;
    }
    
    // If not found by name, try to use the input as an ID directly (in case it's already an ID)
    const shotByIdResponse = await queryService.queryShots(`id is "${shotInput}"`);
    await debugToFile(DEBUG_LOG_PATH, "Shot query by ID result:", shotByIdResponse);
    
    if (shotByIdResponse?.data && shotByIdResponse.data.length > 0) {
      const shot = shotByIdResponse.data[0] as { id: string; name: string };
      await debugToFile(DEBUG_LOG_PATH, "Found shot by ID:", shot);
      return shot.id;
    }
    
    await debugToFile(DEBUG_LOG_PATH, "Shot not found by name or ID");
    return null;
  } catch (error) {
    await debugToFile(DEBUG_LOG_PATH, "Error resolving shot:", error);
    return null;
  }
}

/**
 * Prompt user for shot ID with validation
 */
async function promptForShotId(): Promise<string | null> {
  const shotId = await Input.prompt({
    message: "Enter the Shot name or ID to download media from:",
    validate: (input: string) => {
      if (!input.trim()) {
        return "Shot name or ID is required";
      }
      return true;
    },
  });

  return shotId.trim() || null;
}

/**
 * Let user select which asset versions to download
 */
async function selectAssetVersions(versions: unknown[]): Promise<AssetVersion[]> {
  // Display available versions
  console.log("\n📋 Available Asset Versions:");
  versions.forEach((version: unknown, index: number) => {
    const versionData = version as AssetVersion;
    console.log(`   ${index + 1}. ${versionData.asset?.name || "Unknown asset"} v${versionData.version || "Unknown"}`);
    console.log(`      Asset: ${versionData.asset?.name || "Unknown asset"}`);
    console.log(`      Shot: ${versionData.asset?.parent?.name || "Unknown shot"}`);
    console.log(`      Version: ${versionData.version || "Unknown version"}`);
    console.log(`      Components: ${versionData.components?.length || 0}`);
    console.log(""); // Empty line for readability
  });

  const versionIndex = await Select.prompt({
    message: "Select an asset version to download:",
    options: versions.map((version: unknown, index: number) => {
      const versionData = version as AssetVersion;
      return {
        name: `${versionData.asset?.name || "Unknown"} v${versionData.version || "Unknown"} (${versionData.asset?.parent?.name || "Unknown shot"})`,
        value: index
      };
    })
  });

  return [versions[versionIndex] as AssetVersion];
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