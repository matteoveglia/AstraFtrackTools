import { Session } from "@ftrack/api";
import { debug } from "../utils/debug.ts";

/**
 * Session management service for Ftrack API operations
 */
export class SessionService {
  constructor(private session: Session) {}

  /**
   * Execute a query with error handling
   */
  async query(expression: string): Promise<any> {
    try {
      debug(`Executing query: ${expression}`);
      const response = await this.session.query(expression);
      debug(`Query returned ${response.data?.length || 0} results`);
      return response;
    } catch (error) {
      debug(`Query failed: ${error}`);
      throw new Error(`Query execution failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get the underlying session
   */
  getSession(): Session {
    return this.session;
  }
}