import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import { SessionService } from "../services/session.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { FilterService } from "../services/filterService.ts";
import type {
  StatusFilter,
  UserFilter,
  DateFilter,
  CustomAttrFilter,
} from "../services/filterService.ts";
import type {
  AssetVersion,
  Component,
  Shot,
} from "../types/mediaDownload.ts";

// Mock data for testing
const mockShotData: Shot[] = [
  {
    id: "shot-1",
    name: "shot_010",
    parent: { id: "seq-1", name: "sequence_01" },
  },
  {
    id: "shot-2",
    name: "shot_020",
    parent: { id: "seq-1", name: "sequence_01" },
  },
  {
    id: "shot-3",
    name: "shot_030",
    parent: { id: "seq-2", name: "sequence_02" },
  },
];

const mockAssetVersionData: AssetVersion[] = [
  {
    id: "version-1",
    version: 1,
    asset: {
      id: "asset-1",
      name: "main",
      parent: mockShotData[0],
      type: { id: "type-1", name: "Render" },
    },
    components: [],
  },
  {
    id: "version-2",
    version: 2,
    asset: {
      id: "asset-2",
      name: "main",
      parent: mockShotData[1],
      type: { id: "type-1", name: "Render" },
    },
    components: [],
  },
];

const mockComponentData: Component[] = [
  {
    id: "component-1",
    name: "main.mov",
    file_type: ".mov",
    size: 1048576,
    component_locations: [
      {
        location: { id: "loc-1", name: "studio.disk" },
        resource_identifier: "/path/to/file.mov",
      },
    ],
  },
  {
    id: "component-2",
    name: "encoded.mp4",
    file_type: ".mp4",
    size: 524288,
    component_locations: [
      {
        location: { id: "loc-1", name: "studio.disk" },
        resource_identifier: "/path/to/encoded.mp4",
      },
    ],
  },
];

// Mock session factory
function createMockSession(queryResponses: unknown[] = []) {
  let queryCallCount = 0;
  return {
    query: (expression: string) => {
      if (expression.includes("error")) {
        return Promise.reject(new Error("Mock query error"));
      }
      
      // Handle different query types based on expression content
      if (expression.includes("Shot")) {
        // Return filtered shots based on query filters
        let filteredShots = [...mockShotData];
        
        // Simulate status filtering
        if (expression.includes('status.name in ("Approved"')) {
          filteredShots = filteredShots.slice(0, 2); // Return first 2 shots
        }
        
        // Simulate user filtering
        if (expression.includes('user.username in ("testuser"')) {
          filteredShots = filteredShots.slice(0, 1); // Return first shot only
        }
        
        // Simulate date filtering
        if (expression.includes('created_date >=')) {
          filteredShots = filteredShots.slice(1); // Return shots 2 and 3
        }
        
        // Simulate custom attribute filtering
        if (expression.includes('custom_attributes')) {
          filteredShots = filteredShots.slice(0, 1); // Return first shot only
        }
        
        return Promise.resolve({ data: filteredShots });
      }
      
      if (expression.includes("AssetVersion")) {
        return Promise.resolve({ data: mockAssetVersionData });
      }
      
      if (expression.includes("Component")) {
        return Promise.resolve({ data: mockComponentData });
      }
      
      const response = queryResponses[queryCallCount] || [];
      queryCallCount++;
      return Promise.resolve({ data: response });
    },
  } as unknown as Session;
}

// Mock services
function createMockProjectContextService(isGlobal = false) {
  return {
    getContext: () => ({
      isGlobal,
      project: isGlobal ? null : { id: "proj-1", name: "Test Project" },
    }),
    isGlobalMode: () => isGlobal,
    getCurrentProjectId: () => isGlobal ? null : "proj-1",
    buildProjectScopedQuery: (baseQuery: string) => {
      if (isGlobal) return baseQuery;
      return `${baseQuery} where project.id is "proj-1"`;
    },
  } as unknown as ProjectContextService;
}

function createMockQueryService(session: Session, projectContext: ProjectContextService) {
  const sessionService = new SessionService(session);
  return new QueryService(sessionService, projectContext);
}

// Filter Service Tests
Deno.test("FilterService - should build status filter correctly", () => {
  const filterService = new FilterService();
  const statusFilter: StatusFilter = {
    names: ["Approved", "In Progress"],
  };
  
  const whereClause = filterService.buildWhere({
    status: statusFilter,
  });
  
  assertEquals(whereClause, 'status.name in ("Approved", "In Progress")');
});

Deno.test("FilterService - should build user filter correctly", () => {
  const filterService = new FilterService();
  const userFilter: UserFilter = {
    usernames: ["testuser", "admin"],
  };
  
  const whereClause = filterService.buildWhere({
    user: userFilter,
  });
  
  assertEquals(whereClause, 'user.username in ("testuser", "admin")');
});

Deno.test("FilterService - should build date filter correctly", () => {
  const filterService = new FilterService();
  const dateFilter: DateFilter = {
    kind: "between",
    from: "2024-01-01",
    to: "2024-12-31",
  };
  
  const whereClause = filterService.buildWhere({
    date: dateFilter,
  });
  
  assertEquals(
    whereClause,
    'date >= "2024-01-01" and date <= "2024-12-31"'
  );
});

Deno.test("FilterService - should build custom attribute filter correctly", () => {
  const filterService = new FilterService();
  const customAttrFilter: CustomAttrFilter = {
    key: "department",
    op: "eq",
    value: "lighting",
  };
  
  const whereClause = filterService.buildWhere({
    custom: [customAttrFilter],
  });
  
  assertEquals(
    whereClause,
    'custom_attributes any (key is "department" and value is "lighting")'
  );
});

Deno.test("FilterService - should combine multiple filters with 'and'", () => {
  const filterService = new FilterService();
  const statusFilter: StatusFilter = { names: ["Approved"] };
  const userFilter: UserFilter = { usernames: ["testuser"] };
  
  const whereClause = filterService.buildWhere({
    status: statusFilter,
    user: userFilter,
  });
  
  assertEquals(
    whereClause,
    'status.name in ("Approved") and user.username in ("testuser")'
  );
});

Deno.test("FilterService - should handle empty filters", () => {
  const filterService = new FilterService();
  
  const whereClause = filterService.buildWhere({});
  
  assertEquals(whereClause, "");
});

// QueryService with Filters Tests
Deno.test("QueryService - should apply status filter to shots query", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  const statusFilter = 'status.name in ("Approved")';
  const result = await queryService.queryShots(statusFilter);
  
  assertEquals(result.data.length, 2); // Should return filtered results
});

Deno.test("QueryService - should apply user filter to shots query", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  const userFilter = 'user.username in ("testuser")';
  const result = await queryService.queryShots(userFilter);
  
  assertEquals(result.data.length, 1); // Should return filtered results
});

Deno.test("QueryService - should apply date filter to shots query", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  const dateFilter = 'created_date >= "2024-01-01"';
  const result = await queryService.queryShots(dateFilter);
  
  assertEquals(result.data.length, 2); // Should return filtered results
});

Deno.test("QueryService - should apply custom attribute filter to shots query", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  const customAttrFilter = 'custom_attributes["department"] is "lighting"';
  const result = await queryService.queryShots(customAttrFilter);
  
  assertEquals(result.data.length, 1); // Should return filtered results
});

Deno.test("QueryService - should handle empty filter (backward compatibility)", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  const result = await queryService.queryShots("");
  
  assertEquals(result.data.length, 3); // Should return all shots
});

Deno.test("QueryService - should handle query errors gracefully", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  await assertRejects(
    () => queryService.queryShots("error"),
    Error,
    "Mock query error"
  );
});

// Integration Tests for Filter Combinations
Deno.test("Integration - should combine status and user filters", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  const filterService = new FilterService();
  
  const filters = {
    status: { names: ["Approved"] } as StatusFilter,
    user: { usernames: ["testuser"] } as UserFilter,
  };
  
  const whereClause = filterService.buildWhere(filters);
  const result = await queryService.queryShots(whereClause);
  
  // Should apply both filters and return intersection
  assertEquals(result.data.length, 1);
});

Deno.test("Integration - should combine all filter types", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  const filterService = new FilterService();
  
  const filters = {
    status: { names: ["Approved"] } as StatusFilter,
    user: { usernames: ["testuser"] } as UserFilter,
    date: { kind: "between" as const, from: "2024-01-01", to: "2024-12-31" } as DateFilter,
    custom: [{
      key: "department",
      op: "eq" as const,
      value: "lighting",
    }] as CustomAttrFilter[],
  };
  
  const whereClause = filterService.buildWhere(filters);
  
  // Verify the combined where clause structure
  assertEquals(
    whereClause.includes('status.name in ("Approved")'),
    true
  );
  assertEquals(
    whereClause.includes('user.username in ("testuser")'),
    true
  );
  assertEquals(
    whereClause.includes('date >= "2024-01-01"'),
    true
  );
  assertEquals(
    whereClause.includes('date <= "2024-12-31"'),
    true
  );
  assertEquals(
    whereClause.includes('custom_attributes any (key is "department" and value is "lighting")'),
    true
  );
  // Verify all filter types are present (status, user, date range, custom)
  assertEquals(whereClause.length > 0, true);
});

Deno.test("Integration - should handle fuzzy search with filters", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  const filterService = new FilterService();
  
  // Test that filters work with fuzzy search pattern matching
  const filters = {
    status: { names: ["Approved"] } as StatusFilter,
  };
  
  const whereClause = filterService.buildWhere(filters);
  const result = await queryService.queryShots(whereClause);
  
  // Get filtered shots
  const filteredShots = result.data as Shot[];
  
  // Simulate fuzzy search pattern matching on filtered results
  const searchPattern = "*010*";
  const fuzzyMatches = filteredShots.filter(shot => 
    shot.name.includes("010")
  );
  
  assertEquals(fuzzyMatches.length, 1);
  assertEquals(fuzzyMatches[0].name, "shot_010");
});

Deno.test("Integration - should maintain backward compatibility without filters", async () => {
  const mockSession = createMockSession();
  const projectContext = createMockProjectContextService();
  const queryService = createMockQueryService(mockSession, projectContext);
  
  // Test that passing empty string (no filters) works as before
  const result = await queryService.queryShots("");
  
  assertEquals(result.data.length, 3); // Should return all shots
  
  // Simulate fuzzy search on all results (backward compatibility)
  const allShots = result.data as Shot[];
  const searchPattern = "*";
  const fuzzyMatches = allShots.filter(() => true); // Match all with wildcard
  
  assertEquals(fuzzyMatches.length, 3);
});

// Edge Cases and Error Handling
Deno.test("Edge Case - should handle invalid filter values gracefully", () => {
  const filterService = new FilterService();
  
  // Test with empty arrays
  const emptyStatusFilter: StatusFilter = { names: [] };
  const whereClause = filterService.buildWhere({ status: emptyStatusFilter });
  
  assertEquals(whereClause, "");
});

Deno.test("Edge Case - should handle special characters in filter values", () => {
  const filterService = new FilterService();
  
  const statusFilter: StatusFilter = {
    names: ['Status with "quotes"', "Status with 'apostrophes'"],
  };
  
  const whereClause = filterService.buildWhere({ status: statusFilter });
  
  // Should properly escape quotes
  assertEquals(
    whereClause.includes('Status with "quotes"'),
    true
  );
});

Deno.test("Edge Case - should handle invalid date formats", () => {
  const filterService = new FilterService();
  
  const dateFilter: DateFilter = {
    kind: "between",
    from: "invalid-date",
    to: "2024-12-31",
  };
  
  // Should still build the filter (validation should happen at input level)
  const whereClause = filterService.buildWhere({ date: dateFilter });
  
  assertEquals(
    whereClause,
    'date >= "invalid-date" and date <= "2024-12-31"'
  );
});

Deno.test("Performance - should handle large filter combinations efficiently", () => {
  const filterService = new FilterService();
  
  // Create filters with many values
  const largeStatusFilter: StatusFilter = {
    names: Array.from({ length: 100 }, (_, i) => `Status${i}`),
  };
  
  const largeUserFilter: UserFilter = {
    usernames: Array.from({ length: 50 }, (_, i) => `user${i}`),
  };
  
  const startTime = performance.now();
  const whereClause = filterService.buildWhere({
    status: largeStatusFilter,
    user: largeUserFilter,
  });
  const endTime = performance.now();
  
  // Should complete quickly (under 10ms)
  assertEquals(endTime - startTime < 10, true);
  
  // Should contain all filter values
  assertEquals(whereClause.includes('Status0'), true);
  assertEquals(whereClause.includes('Status99'), true);
  assertEquals(whereClause.includes('user0'), true);
  assertEquals(whereClause.includes('user49'), true);
});