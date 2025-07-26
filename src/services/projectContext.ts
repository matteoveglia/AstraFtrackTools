import { ProjectContext } from "../utils/projectSelection.ts";
import { debug } from "../utils/debug.ts";

/**
 * Project context management service
 */
export class ProjectContextService {
  private context: ProjectContext;

  constructor(initialContext: ProjectContext) {
    this.context = initialContext;
    debug(`Project context initialized: ${this.context.isGlobal ? 'Global' : this.context.project?.name}`);
  }

  /**
   * Get current project context
   */
  getContext(): ProjectContext {
    return this.context;
  }

  /**
   * Update project context
   */
  setContext(context: ProjectContext): void {
    this.context = context;
    debug(`Project context updated: ${this.context.isGlobal ? 'Global' : this.context.project?.name}`);
  }

  /**
   * Check if operating in global mode
   */
  isGlobalMode(): boolean {
    return this.context.isGlobal;
  }

  /**
   * Get current project ID (null if global)
   */
  getCurrentProjectId(): string | null {
    return this.context.project?.id || null;
  }

  /**
   * Get project-scoped query filter
   * Returns empty string for global mode, project filter for project mode
   */
  getProjectFilter(): string {
    if (this.context.isGlobal || !this.context.project) {
      return "";
    }
    return ` and project.id is "${this.context.project.id}"`;
  }

  /**
   * Build a project-scoped query
   * Some schemas don't have project attributes, so we need to handle them differently
   */
  buildProjectScopedQuery(baseQuery: string): string {
    if (this.context.isGlobal || !this.context.project) {
      return baseQuery;
    }

    // Extract the schema name from the query
    const fromMatch = baseQuery.match(/from\s+(\w+)/i);
    if (!fromMatch) {
      return baseQuery;
    }

    const schemaName = fromMatch[1];
    
    // Schemas that don't have a project attribute - these are typically link/value tables
    const schemasWithoutProject = [
      'CustomAttributeLink',
      'ContextCustomAttributeValue',
      'ListObject',
      'CustomAttributeConfiguration'
    ];

    if (schemasWithoutProject.includes(schemaName)) {
      // For these schemas, we can't filter by project directly
      // Return the original query - the calling code should handle project filtering differently
      return baseQuery;
    }

    // For schemas with project attributes, add the project filter
    if (baseQuery.toLowerCase().includes(' where ')) {
      return baseQuery.replace(/ where /i, ` where project.id is "${this.context.project!.id}" and `);
    } else {
      return `${baseQuery} where project.id is "${this.context.project!.id}"`;
    }
  }
}