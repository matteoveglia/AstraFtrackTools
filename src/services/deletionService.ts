import type { Session } from "@ftrack/api";
import type { DryRunReportItem, DeletionResultSummary, ComponentDeletionChoice } from "../types/deleteMedia.ts";
import type { Component, ComponentLocation } from "../types/index.ts";
import { ComponentService } from "./componentService.ts";
import { SessionService } from "./session.ts";
import { QueryService } from "./queries.ts";
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
    private queryService: QueryService
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
    debug(`DeletionService.deleteAssetVersions - IDs: ${versionIds.length}, dryRun: ${opts.dryRun}`);
    
    const report: DryRunReportItem[] = [];
    const failures: Array<{ id: string; reason: string }> = [];
    let totalBytesDeleted = 0;
    let totalComponentsDeleted = 0;

    for (const versionId of versionIds) {
      try {
        // Fetch version with components and metadata
        const versionDetails = await this.fetchVersionDetails(versionId);
        
        if (!versionDetails) {
          failures.push({ id: versionId, reason: "Version not found" });
          continue;
        }

        // Get all components for this version
        const components = await this.componentService.getComponentsForAssetVersion(versionId);
        
        // Calculate total size of all components for this version
        const versionSizeBytes = components.reduce((total, comp) => total + (comp.size || 0), 0);
        totalBytesDeleted += versionSizeBytes;
        totalComponentsDeleted += components.length;

        // Create report entry for the whole version deletion
        report.push({
          operation: "delete_version",
          assetVersionId: versionId,
          assetVersionLabel: `${versionDetails.asset?.name || "Unknown"} v${versionDetails.version || "?"}`,
          shotName: versionDetails.asset?.parent?.name || undefined,
          status: versionDetails.status?.name || undefined,
          user: versionDetails.user?.username || undefined,
          size: versionSizeBytes,
          locations: this.extractLocationIdentifiers(components),
        });

        // Add individual component entries for detailed tracking
        for (const component of components) {
          report.push({
            operation: "delete_components",
            assetVersionId: versionId,
            assetVersionLabel: `${versionDetails.asset?.name || "Unknown"} v${versionDetails.version || "?"}`,
            shotName: versionDetails.asset?.parent?.name || undefined,
            componentId: component.id,
            componentName: component.name,
            componentType: this.componentService.identifyComponentType(component),
            size: component.size || 0,
            locations: component.component_locations?.map((loc: ComponentLocation) => loc.resource_identifier).filter(Boolean) || [],
          });
        }

        debug(`Version ${versionId}: ${components.length} components, ${versionSizeBytes} bytes`);

      } catch (error) {
        debug(`Failed to process version ${versionId}: ${error}`);
        failures.push({ id: versionId, reason: error instanceof Error ? error.message : "Unknown error" });
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
   */
  async deleteComponents(
    versionIdToComponentChoice: Map<string, ComponentDeletionChoice>,
    opts: { dryRun: boolean },
  ): Promise<{ report: DryRunReportItem[]; summary: DeletionResultSummary }> {
    debug(`DeletionService.deleteComponents - ${versionIdToComponentChoice.size} versions, dryRun: ${opts.dryRun}`);
    
    const report: DryRunReportItem[] = [];
    const failures: Array<{ id: string; reason: string }> = [];
    let totalBytesDeleted = 0;
    let totalComponentsDeleted = 0;

    for (const [versionId, choice] of versionIdToComponentChoice.entries()) {
      try {
        // Fetch version details
        const versionDetails = await this.fetchVersionDetails(versionId);
        
        if (!versionDetails) {
          failures.push({ id: versionId, reason: "Version not found" });
          continue;
        }

        // Get all components for this version
        const allComponents = await this.componentService.getComponentsForAssetVersion(versionId);

        // Filter components based on user choice and exclude thumbnails
        const componentsToDelete = this.filterComponentsByChoice(allComponents, choice, versionDetails.thumbnail_id);

        for (const component of componentsToDelete) {
          totalBytesDeleted += component.size || 0;
          totalComponentsDeleted++;

          report.push({
            operation: "delete_components",
            assetVersionId: versionId,
            assetVersionLabel: `${versionDetails.asset?.name || "Unknown"} v${versionDetails.version || "?"}`,
            shotName: versionDetails.asset?.parent?.name || undefined,
            status: versionDetails.status?.name || undefined,
            user: versionDetails.user?.username || undefined,
            componentId: component.id,
            componentName: component.name,
            componentType: this.componentService.identifyComponentType(component),
            size: component.size || 0,
            locations: component.component_locations?.map((loc: ComponentLocation) => loc.resource_identifier).filter(Boolean) || [],
          });
        }

        debug(`Version ${versionId}: ${componentsToDelete.length}/${allComponents.length} components selected for deletion (${choice})`);

      } catch (error) {
        debug(`Failed to process version ${versionId}: ${error}`);
        failures.push({ id: versionId, reason: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    // Perform actual deletion if not dry-run
    if (!opts.dryRun) {
      await this.executeComponentDeletions(versionIdToComponentChoice, failures);
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
  private async fetchVersionDetails(versionId: string): Promise<any> {
    try {
      // Use QueryService which handles project scoping properly
      const result = await this.queryService.queryAssetVersions(`id is "${versionId}"`);
      
      if (result.data && result.data.length > 0) {
        const version = result.data[0] as Record<string, any>;
        
        // If we need additional fields not included in queryAssetVersions, fetch them separately
        const additionalQuery = `
          select id, status.name, user.username, thumbnail_id, date
          from AssetVersion 
          where id is "${versionId}"
        `;
        
        const additionalResult = await this.session.query(additionalQuery);
        if (additionalResult.data && additionalResult.data.length > 0) {
          const additionalData = additionalResult.data[0] as Record<string, any>;
          return {
            ...version,
            status: additionalData.status,
            user: additionalData.user,
            thumbnail_id: additionalData.thumbnail_id,
            date: additionalData.date
          };
        }
        
        return version;
      }
      
      return null;
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
    thumbnailId?: string
  ): Component[] {
    // First, exclude thumbnail component if present
    let filteredComponents = components.filter(comp => comp.id !== thumbnailId);

    // Then filter by choice
    switch (choice) {
      case "all":
        return filteredComponents;
      
      case "original_only":
        return filteredComponents.filter(comp => 
          this.componentService.identifyComponentType(comp) === "original"
        );
      
      case "encoded_only":
        return filteredComponents.filter(comp => {
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
   * Execute actual version deletions in batches
   */
  private async executeVersionDeletions(
    versionIds: string[],
    failures: Array<{ id: string; reason: string }>
  ): Promise<void> {
    debug(`Executing deletion of ${versionIds.length} asset versions`);
    
    const batchSize = 10; // Process in batches to avoid overwhelming the API
    
    for (let i = 0; i < versionIds.length; i += batchSize) {
      const batch = versionIds.slice(i, i + batchSize);
      
      for (const versionId of batch) {
        try {
          // Check if this version already failed during dry-run analysis
          const alreadyFailed = failures.some(f => f.id === versionId);
          if (alreadyFailed) {
            debug(`Skipping ${versionId} - already marked as failed`);
            continue;
          }
          
          debug(`Deleting asset version: ${versionId}`);
          await this.session.call([{
            action: "delete",
            entity_type: "AssetVersion",
            entity_key: versionId
          }]);
          
        } catch (error) {
          debug(`Failed to delete version ${versionId}: ${error}`);
          failures.push({ 
            id: versionId, 
            reason: error instanceof Error ? error.message : "Deletion failed" 
          });
        }
      }
      
      // Small delay between batches to be gentle on the API
      if (i + batchSize < versionIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Execute actual component deletions in batches
   */
  private async executeComponentDeletions(
    versionIdToComponentChoice: Map<string, ComponentDeletionChoice>,
    failures: Array<{ id: string; reason: string }>
  ): Promise<void> {
    debug(`Executing component deletion for ${versionIdToComponentChoice.size} versions`);
    
    for (const [versionId, choice] of versionIdToComponentChoice.entries()) {
      try {
        // Check if this version already failed during dry-run analysis
        const alreadyFailed = failures.some(f => f.id === versionId);
        if (alreadyFailed) {
          debug(`Skipping ${versionId} - already marked as failed`);
          continue;
        }
        
        // Fetch version details to get thumbnail_id
        const versionDetails = await this.fetchVersionDetails(versionId);
        if (!versionDetails) {
          failures.push({ id: versionId, reason: "Version not found during execution" });
          continue;
        }
        
        // Get all components for this version
        const allComponents = await this.componentService.getComponentsForAssetVersion(versionId);
        
        // Filter components based on user choice and exclude thumbnails
        const componentsToDelete = this.filterComponentsByChoice(allComponents, choice, versionDetails.thumbnail_id);
        
        // Delete components in batches
        const batchSize = 5;
        for (let i = 0; i < componentsToDelete.length; i += batchSize) {
          const batch = componentsToDelete.slice(i, i + batchSize);
          
          const deleteActions = batch.map(component => ({
            action: "delete",
            entity_type: "Component",
            entity_key: component.id
          }));
          
          debug(`Deleting ${batch.length} components from version ${versionId}`);
          await this.session.call(deleteActions);
          
          // Small delay between batches
          if (i + batchSize < componentsToDelete.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
      } catch (error) {
        debug(`Failed to delete components for version ${versionId}: ${error}`);
        failures.push({ 
          id: versionId, 
          reason: error instanceof Error ? error.message : "Component deletion failed" 
        });
      }
    }
  }

  /**
   * Format bytes into human-readable size
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}