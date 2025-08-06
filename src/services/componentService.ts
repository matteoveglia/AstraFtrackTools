import { SessionService } from "./session.ts";
import { QueryService } from "./queries.ts";
import { debug } from "../utils/debug.ts";
import type {
  Component,
  AssetVersion,
  ComponentType,
  MediaPreference,
  ComponentNotFoundError,
  DownloadUrlNotFoundError,
  InvalidAssetVersionError,
} from "../types/index.ts";

/**
 * Service for handling component querying, identification, and URL resolution
 */
export class ComponentService {
  constructor(
    private sessionService: SessionService,
    private queryService: QueryService
  ) {}

  /**
   * Query components for asset versions with locations
   * @param assetVersionId - The asset version ID to query components for
   * @returns Promise resolving to array of components with location data
   */
  async getComponentsForAssetVersion(assetVersionId: string): Promise<Component[]> {
    try {
      debug(`Querying components for asset version: ${assetVersionId}`);
      
      const query = `
        select id, version, asset.name, asset.parent.name, task.name, 
               components.id, components.name, components.file_type, components.size,
               components.component_locations.location.id,
               components.component_locations.location.name, 
               components.component_locations.resource_identifier
        from AssetVersion 
        where id is "${assetVersionId}"
      `;

      const result = await this.sessionService.query(query);
      
      if (!result.data || result.data.length === 0) {
        throw new Error(`Asset version not found: ${assetVersionId}`) as InvalidAssetVersionError;
      }

      const assetVersion = result.data[0] as AssetVersion;
      
      if (!assetVersion.components || assetVersion.components.length === 0) {
        throw new Error(`No components found for asset version: ${assetVersionId}`) as ComponentNotFoundError;
      }

      debug(`Found ${assetVersion.components.length} components for asset version ${assetVersionId}`);
      return assetVersion.components;
      
    } catch (error) {
      debug(`Failed to query components for asset version ${assetVersionId}: ${error}`);
      throw error;
    }
  }

  /**
   * Identify component type based on naming patterns
   * @param component - The component to identify
   * @returns The identified component type
   */
  identifyComponentType(component: Component): ComponentType {
    const name = component.name.toLowerCase();
    
    // Check for encoded types first (more specific patterns)
    if (name === "ftrackreview-mp4-1080") {
      return 'encoded-1080p';
    }
    
    if (name === "ftrackreview-mp4") {
      return 'encoded-720p';
    }
    
    // Check if it's a video file type that could be original
    const videoExtensions = ['.mov', '.mp4', '.avi', '.mkv', '.mxf', '.r3d', '.dpx', '.exr'];
    const hasVideoExtension = videoExtensions.some(ext => 
      component.file_type?.toLowerCase().includes(ext.substring(1)) || 
      name.includes(ext)
    );
    
    if (hasVideoExtension && !name.includes('ftrackreview')) {
      return 'original';
    }
    
    return 'other';
  }

  /**
   * Get download URL from component location
   * @param componentId - The component ID
   * @param locationName - The location name (defaults to "ftrack.server")
   * @returns Promise resolving to the download URL
   */
  async getDownloadUrl(componentId: string, locationName: string = "ftrack.server"): Promise<string> {
    try {
      debug(`Getting download URL for component ${componentId} from location ${locationName}`);
      
      // Get the Ftrack session to access server URL
      const session = this.sessionService.getSession();
      const serverUrl = session.serverUrl;
      
      // Construct the download URL using Ftrack's component download endpoint
      // Ftrack typically provides downloads at: {server_url}/component/{component_id}/download
      const downloadUrl = `${serverUrl}/component/${componentId}/download`;
      
      debug(`Constructed download URL for component ${componentId}: ${downloadUrl}`);
      return downloadUrl;
      
    } catch (error) {
      debug(`Failed to get download URL for component ${componentId}: ${error}`);
      throw error;
    }
  }

  /**
   * Find best component based on user preference with fallback logic
   * @param components - Array of components to search
   * @param preference - User's media preference
   * @returns The best matching component or null if none found
   */
  findBestComponent(components: Component[], preference: MediaPreference): Component | null {
    if (!components || components.length === 0) {
      return null;
    }

    // Categorize components by type
    const componentsByType = new Map<ComponentType, Component[]>();
    
    for (const component of components) {
      const type = this.identifyComponentType(component);
      if (!componentsByType.has(type)) {
        componentsByType.set(type, []);
      }
      componentsByType.get(type)!.push(component);
    }

    debug(`Component types found: ${Array.from(componentsByType.keys()).join(', ')}`);

    // Define fallback chains based on preference
    let fallbackChain: ComponentType[];
    
    if (preference === 'original') {
      fallbackChain = ['original', 'encoded-1080p', 'encoded-720p'];
    } else {
      fallbackChain = ['encoded-1080p', 'encoded-720p', 'original'];
    }

    // Try each type in the fallback chain
    for (const type of fallbackChain) {
      const componentsOfType = componentsByType.get(type);
      if (componentsOfType && componentsOfType.length > 0) {
        // Return the first (or largest) component of this type
        const bestComponent = componentsOfType.reduce((best, current) => 
          (current.size || 0) > (best.size || 0) ? current : best
        );
        
        debug(`Selected component: ${bestComponent.name} (type: ${type}, size: ${bestComponent.size || 'unknown'})`);
        return bestComponent;
      }
    }

    debug('No suitable component found with fallback logic');
    return null;
  }

  /**
   * Get asset version with components by ID
   * @param assetVersionId - The asset version ID
   * @returns Promise resolving to the asset version with components
   */
  async getAssetVersionWithComponents(assetVersionId: string): Promise<AssetVersion> {
    try {
      debug(`Getting asset version with components: ${assetVersionId}`);
      
      const query = `
        select id, version, asset.id, asset.name, asset.parent.id, asset.parent.name, 
               asset.type.id, asset.type.name, task.name,
               components.id, components.name, components.file_type, components.size,
               components.component_locations.location.id,
               components.component_locations.location.name, 
               components.component_locations.resource_identifier
        from AssetVersion 
        where id is "${assetVersionId}"
      `;

      const result = await this.sessionService.query(query);
      
      if (!result.data || result.data.length === 0) {
        throw new Error(`Asset version not found: ${assetVersionId}`) as InvalidAssetVersionError;
      }

      const assetVersion = result.data[0] as AssetVersion;
      debug(`Retrieved asset version: ${assetVersion.asset.name} v${assetVersion.version}`);
      
      return assetVersion;
      
    } catch (error) {
      debug(`Failed to get asset version with components ${assetVersionId}: ${error}`);
      throw error;
    }
  }
}