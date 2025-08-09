import { ProjectContext } from "../utils/projectSelection.ts";
import { debug, debugToFile } from "../utils/debug.ts";

const DEBUG_LOG_PATH = "/Users/matteoveglia/Documents/Coding/AstraFtrackTools/downloadMedia_debug.log";

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
    debugToFile(DEBUG_LOG_PATH, "ProjectContextService.buildProjectScopedQuery - Input query:", baseQuery);
    debugToFile(DEBUG_LOG_PATH, "ProjectContextService.buildProjectScopedQuery - Context:", this.context);
    
    if (this.context.isGlobal || !this.context.project) {
      debugToFile(DEBUG_LOG_PATH, "ProjectContextService.buildProjectScopedQuery - Global mode, returning original query");
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
    const projectFilter = `project.id is "${this.context.project!.id}"`;
    debugToFile(DEBUG_LOG_PATH, "ProjectContextService.buildProjectScopedQuery - Project filter:", projectFilter);
    
    let finalQuery: string;
    
    if (baseQuery.toLowerCase().includes(' where ')) {
      // If there's already a WHERE clause, add our filter with AND
      finalQuery = baseQuery.replace(/ where /i, ` where ${projectFilter} and `);
    } else {
      // No WHERE clause exists, we need to insert it before ORDER BY, LIMIT, OFFSET, etc.
      // Find the position to insert WHERE clause
      const clausePattern = /\s+(order\s+by|limit|offset|group\s+by|having)\s+/i;
      const match = baseQuery.match(clausePattern);
      
      if (match && match.index !== undefined) {
        // Insert WHERE clause before the found clause
        const beforeClause = baseQuery.substring(0, match.index);
        const afterClause = baseQuery.substring(match.index);
        finalQuery = `${beforeClause} where ${projectFilter}${afterClause}`;
      } else {
        // No special clauses found, append WHERE at the end
        finalQuery = `${baseQuery} where ${projectFilter}`;
      }
    }
    
    debugToFile(DEBUG_LOG_PATH, "ProjectContextService.buildProjectScopedQuery - Final query:", finalQuery);
    return finalQuery;
  }
}