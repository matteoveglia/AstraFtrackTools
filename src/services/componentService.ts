import { SessionService } from "./session.ts";
import { QueryService } from "./queries.ts";
import { debug } from "../utils/debug.ts";
import type { Session } from "@ftrack/api";
import type {
  Component,
  AssetVersion,
  ComponentType,
  MediaPreference,
  ComponentNotFoundError,
  InvalidAssetVersionError,
} from "../types/index.ts";

// Extend Session type to optionally include getComponentUrl without using `any`
type SessionWithGetComponentUrl = Session & {
  getComponentUrl?: (componentId: string) => Promise<string | null>;
};

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
    
    // Check for image file types
    const imageExtensions = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'exr', 'dpx', 'bmp', 'gif', 'webp'];
    const hasImageExtension = imageExtensions.some(ext => 
      component.file_type?.toLowerCase().includes(ext) || 
      name.includes(`.${ext}`)
    );
    
    if (hasImageExtension) {
      return 'image';
    }
    
    // Check if it's a video file type that could be original
    const videoExtensions = ['.mov', '.mp4', '.avi', '.mkv', '.mxf', '.r3d'];
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
   * Get download URL for a component using Ftrack session method
   * @param componentId - The component ID
   * @returns Promise resolving to download URL or null if not available
   */
  async getDownloadUrl(componentId: string): Promise<string | null> {
    try {
      debug(`Getting download URL for component: ${componentId}`);

      // Use the session's getComponentUrl method which handles authentication properly
      const session = this.sessionService.getSession() as SessionWithGetComponentUrl;
      
      if (typeof session.getComponentUrl === 'function') {
        const downloadUrl = await session.getComponentUrl(componentId);
        
        if (downloadUrl) {
          debug(`Got authenticated download URL: ${downloadUrl}`);
          return downloadUrl;
        } else {
          debug(`getComponentUrl returned null for component: ${componentId}`);
          return null;
        }
      } else {
        debug(`Session does not have getComponentUrl method`);
        return null;
      }

    } catch (error) {
      debug(`Error getting download URL for component ${componentId}: ${error}`);
      return null;
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
      fallbackChain = ['original', 'encoded-1080p', 'encoded-720p', 'image'];
    } else {
      fallbackChain = ['encoded-1080p', 'encoded-720p', 'image', 'original'];
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

  /**
   * Format component type for display with additional file type information
   * @param component - The component to format
   * @returns Formatted display string
   */
  formatComponentTypeDisplay(component: Component): string {
    const baseType = this.identifyComponentType(component);
    
    if (baseType === 'image' && component.file_type) {
      // Extract file extension and format it nicely
      const cleanFileType = component.file_type.replace(/^\.+/, '').toUpperCase();
      return `image (${cleanFileType})`;
    }
    
    return baseType;
  }
}