import { assertEquals, assertRejects } from "@std/assert";
import { Session } from "@ftrack/api";
import { propagateThumbnails } from "../tools/propagateThumbnails.ts";

// Mock modules
let mockInquirer: any;
let mockDebug: any;
let mockConsoleLog: any;
let mockConsoleError: any;

// Test setup
const mockShots = [
  { id: "shot-1", name: "shot_020" }, // Note: reversed order to test A-Z sorting
  { id: "shot-2", name: "shot_010" },
];

  const mockVersions = [
    {
      id: "version-1",
      version: 1,
      thumbnail_id: "thumb-1",
      asset: { name: "main" },
      date: "2024-01-01T10:00:00Z",
    },
  ];

const mockShotDetails = [
  { thumbnail_id: null }, // No current thumbnail
];

// Mock session factory
function createMockSession(queryResponses: any[], updateMock?: any) {
  let queryCallCount = 0;
  return {
    query: () => {
      const response = queryResponses[queryCallCount];
      queryCallCount++;
      return Promise.resolve({ data: response });
    },
    update: updateMock || (() => Promise.resolve()),
  } as unknown as Session;
}

// Mock inquirer
function mockInquirerPrompt(responses: Record<string, any>) {
  return () => Promise.resolve(responses);
}

Deno.test("propagateThumbnails - should update thumbnail for a specific shot with progress indicator", async () => {
  // Setup mocks
  const originalConsoleLog = console.log;
  const logCalls: string[] = [];
  console.log = (...args: any[]) => {
    logCalls.push(args.join(' '));
  };

  let updateCalled = false;
  let updateParams: any[] = [];
  
  const mockSession = createMockSession(
    [mockShots.slice(0, 1), mockVersions, mockShotDetails],
    (...args: any[]) => {
      updateCalled = true;
      updateParams = args;
      return Promise.resolve();
    }
  );

  try {
    await propagateThumbnails(mockSession, "shot-1");

    // Verify progress indicator was shown (new format includes ETA and chalk formatting)
    const progressLog = logCalls.find(log => log.includes("[1/1]") && log.includes("Processing"));
    assertEquals(progressLog !== undefined, true, "Should show progress indicator");

    // Verify shot name was logged
    const shotLog = logCalls.find(log => log.includes("shot_020"));
    assertEquals(shotLog !== undefined, true, "Should log shot name");

    // Verify update was called
    assertEquals(updateCalled, true, "Should call update");
    assertEquals(updateParams[0], "Shot", "Should update Shot entity");
    assertEquals(updateParams[1], ["shot-1"], "Should update correct shot ID");
    assertEquals(updateParams[2].thumbnail_id, "thumb-1", "Should set correct thumbnail ID");

  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("propagateThumbnails - should skip update if shot already has the latest thumbnail", async () => {
  const originalConsoleLog = console.log;
  const logCalls: string[] = [];
  console.log = (...args: any[]) => {
    logCalls.push(args.join(' '));
  };

  let updateCalled = false;
  const mockShotWithThumbnail = [{ thumbnail_id: "thumb-1" }];

  const mockSession = createMockSession(
    [mockShots.slice(0, 1), mockVersions, mockShotWithThumbnail],
    () => {
      updateCalled = true;
      return Promise.resolve();
    }
  );

  try {
    await propagateThumbnails(mockSession, "shot-1");

    // Verify update was not called
    assertEquals(updateCalled, false, "Should not call update when thumbnail already exists");

    // Verify appropriate message was logged
    const skipLog = logCalls.find(log => log.includes("already has the latest thumbnail"));
    assertEquals(skipLog !== undefined, true, "Should log skip message");

  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("propagateThumbnails - should handle shots without versions", async () => {
  const originalConsoleLog = console.log;
  const logCalls: string[] = [];
  console.log = (...args: any[]) => {
    logCalls.push(args.join(' '));
  };

  let updateCalled = false;
  const mockSession = createMockSession(
    [mockShots.slice(0, 1), []], // Empty versions array
    () => {
      updateCalled = true;
      return Promise.resolve();
    }
  );

  try {
    await propagateThumbnails(mockSession, "shot-1");

    // Verify update was not called
    assertEquals(updateCalled, false, "Should not call update when no versions found");

    // Verify warning message was logged
    const warningLog = logCalls.find(log => log.includes("⚠ No versions"));
    assertEquals(warningLog !== undefined, true, "Should log warning message");

  } finally {
    console.log = originalConsoleLog;
  }
});

Deno.test("propagateThumbnails - should handle errors properly", async () => {
  const originalConsoleError = console.error;
  const errorCalls: string[] = [];
  console.error = (...args: any[]) => {
    errorCalls.push(args.join(' '));
  };

  const mockSession = {
    query: () => Promise.reject(new Error("API Error")),
  } as unknown as Session;

  try {
    await assertRejects(
      async () => {
        await propagateThumbnails(mockSession, "shot-1");
      },
      Error,
      "API Error"
    );

    // Verify error was logged (new error format)
    const errorLog = errorCalls.find(log => log.includes("❌ Error during propagate thumbnails"));
    assertEquals(errorLog !== undefined, true, "Should log error message");

  } finally {
    console.error = originalConsoleError;
  }
});
