import { SessionService } from "./session.ts";
import { ProjectContextService } from "./projectContext.ts";
import { debug } from "../utils/debug.ts";

/**
 * Common query builders for Ftrack entities
 */
export class QueryService {
  constructor(
    private sessionService: SessionService,
    private projectContext: ProjectContextService
  ) {}

  /**
   * Build and execute a project-scoped query
   */
  async executeProjectScopedQuery(baseQuery: string): Promise<any> {
    const scopedQuery = this.projectContext.buildProjectScopedQuery(baseQuery);
    debug(`Executing project-scoped query: ${scopedQuery}`);
    return await this.sessionService.query(scopedQuery);
  }

  /**
   * Query shots with project scoping
   */
  async queryShots(additionalFilters: string = ""): Promise<any> {
    let baseQuery = 'select id, name, parent.name, status.name from Shot';
    
    if (additionalFilters) {
      baseQuery += ` where ${additionalFilters}`;
    }
    
    return await this.executeProjectScopedQuery(baseQuery);
  }

  /**
   * Query asset versions with project scoping
   */
  async queryAssetVersions(additionalFilters: string = ""): Promise<any> {
    let baseQuery = 'select id, version, asset.name, asset.parent.name, task.name from AssetVersion';
    
    if (additionalFilters) {
      baseQuery += ` where ${additionalFilters}`;
    }
    
    return await this.executeProjectScopedQuery(baseQuery);
  }

  /**
   * Query tasks with project scoping
   */
  async queryTasks(additionalFilters: string = ""): Promise<any> {
    let baseQuery = 'select id, name, type.name, status.name, parent.name from Task';
    
    if (additionalFilters) {
      baseQuery += ` where ${additionalFilters}`;
    }
    
    return await this.executeProjectScopedQuery(baseQuery);
  }

  /**
   * Query projects (always global)
   */
  async queryProjects(additionalFilters: string = ""): Promise<any> {
    let baseQuery = 'select id, name, full_name, status.name from Project';
    
    if (additionalFilters) {
      baseQuery += ` where ${additionalFilters}`;
    }
    
    // Projects query is always global
    return await this.sessionService.query(baseQuery);
  }
}