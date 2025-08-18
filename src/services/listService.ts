/** Minimal list helpers scaffold for Delete Media Tool */
import type { Session } from "@ftrack/api";
import type { ProjectContextService } from "./projectContext.ts";

export class ListService {
  constructor(private session: Session, private projectContextService: ProjectContextService) {}

  async fetchAssetVersionLists(): Promise<any[]> {
    // Fetch all lists within current project scope (or globally if in global mode)
    const listsQuery = this.projectContextService.buildProjectScopedQuery(`
      select id, name, category.id, category.name, project.name
      from List
      order by category.name, name
    `);
    const listsResponse = await this.session.query(listsQuery);
    return (listsResponse?.data || []) as any[];
  }

  async getAssetVersionIdsFromList(listId: string): Promise<string[]> {
    if (!listId) return [];

    // 1) Get all entity links for the list
    const listObjectsResponse = await this.session.query(`
      select entity_id
      from ListObject
      where list_id is "${listId}"
    `);

    const entityIds = (listObjectsResponse?.data || []).map((lo: any) => lo.entity_id).filter((id: unknown): id is string => typeof id === "string");
    if (entityIds.length === 0) return [];

    // 2) Of those entity_ids, keep only those that are AssetVersion IDs
    // We determine this by querying AssetVersion with id in (...)
    const chunkSize = 50;
    const versionIds: string[] = [];

    for (let i = 0; i < entityIds.length; i += chunkSize) {
      const chunk = entityIds.slice(i, i + chunkSize);
      const filter = `id in (${chunk.map((id) => `"${id}"`).join(", ")})`;
      const avQuery = this.projectContextService.buildProjectScopedQuery(`
        select id
        from AssetVersion
        where ${filter}
      `);
      const avResponse = await this.session.query(avQuery);
      const chunkIds = (avResponse?.data || []).map((av: any) => av.id).filter((id: unknown): id is string => typeof id === "string");
      versionIds.push(...chunkIds);
    }

    // Deduplicate, just in case
    return Array.from(new Set(versionIds));
  }
}