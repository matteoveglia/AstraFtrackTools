/** Minimal list helpers scaffold for Delete Media Tool */
export class ListService {
  constructor(private session: any, private projectContextService: any) {}

  async fetchAssetVersionLists(): Promise<any[]> {
    // Placeholder: return empty; to be implemented with proper schema types
    return [];
  }

  async getAssetVersionIdsFromList(listId: string): Promise<string[]> {
    // Placeholder: return empty; to be implemented with ListObject queries
    return [];
  }
}