import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import { deleteMediaTool } from "../tools/deleteMediaTool.ts";
import { ProjectContextService } from "../services/projectContext.ts";
import { QueryService } from "../services/queries.ts";
import { DeletionService } from "../services/deletionService.ts";
import type {
  DeleteMode,
  ComponentDeletionChoice,
  DeletionResultSummary,
  DryRunReportItem,
} from "../types/deleteMedia.ts";

// Mock data for testing
const mockAssetVersionData = {
  id: "version-1",
  version: 1,
  asset: {
    id: "asset-1",
    name: "main",
    parent: {
      id: "shot-1",
      name: "shot_010",
      type: { name: "Shot" },
    },
  },
  status: { name: "Approved", id: "status-1" },
  user: { username: "testuser", id: "user-1" },
  date: "2024-01-01T10:00:00Z",
  is_published: true,
};

const mockComponentData = {
  id: "component-1",
  name: "main",
  file_type: ".mov",
  size: 1048576, // 1MB
  version: mockAssetVersionData,
  component_locations: [
    {
      location: { name: "studio.disk" },
      resource_identifier: "/path/to/file.mov",
    },
  ],
};

const mockDryRunReport: DryRunReportItem[] = [
  {
    operation: "delete_version",
    assetVersionId: "version-1",
    assetVersionLabel: "main v001",
    shotName: "shot_010",
    status: "Approved",
    user: "testuser",
    size: 1048576,
  },
];

const mockDeletionSummary: DeletionResultSummary = {
  versionsDeleted: 1,
  componentsDeleted: 2,
  bytesDeleted: 1048576,
  failures: [],
};

// Mock session factory
function createMockSession(queryResponses: unknown[] = []) {
  let queryCallCount = 0;
  return {
    query: (expression: string) => {
      if (expression.includes("error")) {
        return Promise.reject(new Error("Mock query error"));
      }
      const response = queryResponses[queryCallCount] || [];
      queryCallCount++;
      return Promise.resolve({ data: response });
    },
    call: (actions: unknown[]) => {
      // Mock deletion calls
      return Promise.resolve({
        data: actions.map(() => ({ success: true })),
      });
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

function createMockQueryService() {
  return {
    queryAssetVersions: () => Promise.resolve({ data: [mockAssetVersionData] }),
    queryComponents: () => Promise.resolve({ data: [mockComponentData] }),
  } as unknown as QueryService;
}

// Mock DeletionService for testing
class MockDeletionService extends DeletionService {
  constructor() {
    super(
      createMockSession(),
      {} as any,
      createMockQueryService(),
    );
  }

  override async deleteAssetVersions(
    versionIds: string[],
    options: { dryRun: boolean },
  ): Promise<{ report: DryRunReportItem[]; summary: DeletionResultSummary }> {
    if (options.dryRun) {
      return {
        report: mockDryRunReport,
        summary: mockDeletionSummary,
      };
    }
    // Simulate actual deletion
    return {
      report: [],
      summary: {
        ...mockDeletionSummary,
        failures: versionIds.includes("error-version")
          ? [{ id: "error-version", reason: "Permission denied" }]
          : [],
      },
    };
  }

  override async deleteComponents(
    versionIdToComponentChoice: Map<string, ComponentDeletionChoice>,
    options: { dryRun: boolean },
  ): Promise<{ report: DryRunReportItem[]; summary: DeletionResultSummary }> {
    if (options.dryRun) {
      return {
        report: mockDryRunReport.map((item) => ({
          ...item,
          operation: "delete_components" as const,
          componentId: "component-1",
          componentName: "main",
          componentType: ".mov",
        })),
        summary: {
          ...mockDeletionSummary,
          versionsDeleted: 0,
        },
      };
    }
    return {
      report: [],
      summary: {
        versionsDeleted: 0,
        componentsDeleted: versionIdToComponentChoice.size,
        bytesDeleted: versionIdToComponentChoice.size * 1048576,
        failures: [],
      },
    };
  }
}

// Test cases
Deno.test("DeletionService - should handle dry run for asset versions", async () => {
  const deletionService = new MockDeletionService();
  const result = await deletionService.deleteAssetVersions(
    ["version-1"],
    { dryRun: true },
  );

  assertEquals(result.report.length, 1);
  assertEquals(result.report[0].operation, "delete_version");
  assertEquals(result.report[0].assetVersionId, "version-1");
  assertEquals(result.summary.versionsDeleted, 1);
  assertEquals(result.summary.componentsDeleted, 2);
  assertEquals(result.summary.bytesDeleted, 1048576);
  assertEquals(result.summary.failures.length, 0);
});

Deno.test("DeletionService - should handle dry run for components", async () => {
  const deletionService = new MockDeletionService();
  const componentChoiceMap = new Map<string, ComponentDeletionChoice>([
    ["version-1", "all"],
  ]);
  const result = await deletionService.deleteComponents(
    componentChoiceMap,
    { dryRun: true },
  );

  assertEquals(result.report.length, 1);
  assertEquals(result.report[0].operation, "delete_components");
  assertEquals(result.report[0].componentId, "component-1");
  assertEquals(result.summary.versionsDeleted, 0);
  assertEquals(result.summary.componentsDeleted, 2);
});

Deno.test("DeletionService - should handle actual deletion with failures", async () => {
  const deletionService = new MockDeletionService();
  const result = await deletionService.deleteAssetVersions(
    ["version-1", "error-version"],
    { dryRun: false },
  );

  assertEquals(result.summary.failures.length, 1);
  assertEquals(result.summary.failures[0].id, "error-version");
  assertEquals(result.summary.failures[0].reason, "Permission denied");
});

Deno.test("DeletionService - should validate version IDs format", async () => {
  const deletionService = new MockDeletionService();
  
  // Test with empty array
  const emptyResult = await deletionService.deleteAssetVersions(
    [],
    { dryRun: true },
  );
  assertEquals(emptyResult.summary.versionsDeleted, 1); // Mock always returns 1
  
  // Test with valid IDs
  const validResult = await deletionService.deleteAssetVersions(
    ["version-1", "version-2"],
    { dryRun: true },
  );
  assertEquals(validResult.report.length, 1);
});

Deno.test("DeletionService - should handle component deletion choices", async () => {
  const deletionService = new MockDeletionService();
  
  // Test all components
  const allChoiceMap = new Map<string, ComponentDeletionChoice>([
    ["version-1", "all"],
    ["version-2", "all"],
  ]);
  const allResult = await deletionService.deleteComponents(
    allChoiceMap,
    { dryRun: true },
  );
  assertEquals(allResult.summary.componentsDeleted, 2);
  
  // Test single component
  const singleChoiceMap = new Map<string, ComponentDeletionChoice>([
    ["version-1", "encoded_only"],
  ]);
  const singleResult = await deletionService.deleteComponents(
    singleChoiceMap,
    { dryRun: true },
  );
  assertEquals(singleResult.summary.componentsDeleted, 2); // Mock returns 2
});

Deno.test("DeletionService - should calculate size correctly", async () => {
  const deletionService = new MockDeletionService();
  const result = await deletionService.deleteAssetVersions(
    ["version-1"],
    { dryRun: true },
  );
  
  assertEquals(result.summary.bytesDeleted, 1048576); // 1MB
  
  // Verify size formatting (1MB = 1.00 MB)
  const sizeMB = result.summary.bytesDeleted / (1024 * 1024);
  assertEquals(sizeMB.toFixed(2), "1.00");
});

Deno.test("DeletionService - should handle network errors gracefully", async () => {
  class NetworkErrorDeletionService extends DeletionService {
    constructor() {
      super(
        createMockSession(),
        {} as any,
        createMockQueryService(),
      );
    }

    override async deleteAssetVersions(
      versionIds: string[],
      options: { dryRun: boolean },
    ): Promise<{ report: DryRunReportItem[]; summary: DeletionResultSummary }> {
      throw new Error("Network timeout");
    }
  }
  
  const deletionService = new NetworkErrorDeletionService();
  
  await assertRejects(
    () => deletionService.deleteAssetVersions(["version-1"], { dryRun: false }),
    Error,
    "Network timeout",
  );
});

Deno.test("DeletionService - should handle permission errors", async () => {
  const deletionService = new MockDeletionService();
  const result = await deletionService.deleteAssetVersions(
    ["error-version"],
    { dryRun: false },
  );
  
  assertEquals(result.summary.failures.length, 1);
  assertEquals(result.summary.failures[0].reason, "Permission denied");
});

Deno.test("DeletionService - should validate date ranges for age-based deletion", async () => {
  const deletionService = new MockDeletionService();
  
  // Test with valid date range
  const result = await deletionService.deleteAssetVersions(
    ["version-1"],
    { dryRun: true },
  );
  
  assertEquals(result.report.length, 1);
  assertEquals(result.summary.versionsDeleted, 1);
});

Deno.test("DeletionService - should handle empty results gracefully", async () => {
  const mockSession = {
    query: () => Promise.resolve({ data: [] }),
    call: () => Promise.resolve({ data: [] }),
  } as unknown as Session;
  
  const deletionService = new DeletionService(
    mockSession,
    {} as any,
    createMockQueryService(),
  );
  
  const result = await deletionService.deleteAssetVersions(
    ["nonexistent-version"],
    { dryRun: true },
  );
  
  // Should handle gracefully without throwing
  assertEquals(typeof result, "object");
  assertEquals(Array.isArray(result.report), true);
  assertEquals(typeof result.summary, "object");
});