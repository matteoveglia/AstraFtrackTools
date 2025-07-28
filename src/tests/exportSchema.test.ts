import { assertEquals, assertRejects } from "@std/assert";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { fileURLToPath } from "node:url";
import type { Session } from "@ftrack/api";
import { exportSchema } from "../tools/exportSchema.ts";
import { ProjectContextService } from "../services/projectContext.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "../../output");

// Mock ProjectContextService
const mockProjectContextService = {
  getContext: () => ({
    isGlobal: true,
    project: null
  })
} as unknown as ProjectContextService;

// Mock session
const mockSession = {
  apiUser: "test",
  apiKey: "test",
  serverUrl: "test",
  apiEndpoint: "test",
  query: () => Promise.resolve({ data: [] })
} as unknown as Session;

async function setupTest() {
  await fs.mkdir(outputDir, { recursive: true });
}

async function cleanupTest() {
  try {
    const files = await fs.readdir(outputDir);
    await Promise.all(
      files.map((file) => fs.unlink(path.join(outputDir, file))),
    );
    await fs.rmdir(outputDir);
  } catch (error) {
    console.warn("Cleanup failed:", error);
  }
}

Deno.test("exportSchema - should export schema in JSON format", async () => {
  await setupTest();
  
  try {
    const outputPath = await exportSchema(mockSession, mockProjectContextService, "json");
    const content = await fs.readFile(outputPath, "utf8");
    const schema = JSON.parse(content);

    assertEquals(typeof schema, "object", "Schema should be an object");
    assertEquals(typeof schema.Shot, "object", "Shot should be an object");
  } finally {
    await cleanupTest();
  }
});

Deno.test("exportSchema - should export schema in YAML format", async () => {
  await setupTest();
  
  try {
    const outputPath = await exportSchema(mockSession, mockProjectContextService, "yaml");
    const content = await fs.readFile(outputPath, "utf8");
    const schema = yaml.load(content) as Record<string, unknown>;

    assertEquals(typeof schema, "object", "Schema should be an object");
    assertEquals(typeof schema.Shot, "object", "Shot should be an object");
  } finally {
    await cleanupTest();
  }
});

Deno.test("exportSchema - should export schema in CSV format", async () => {
  await setupTest();
  
  try {
    const outputPath = await exportSchema(mockSession, mockProjectContextService, "csv");
    const content = await fs.readFile(outputPath, "utf8");
    const lines = content.split("\n");

    assertEquals(lines[0].includes("Entity Type"), true, "Should contain Entity Type header");
    assertEquals(lines[0].includes("Field Category"), true, "Should contain Field Category header");
    assertEquals(lines[0].includes("Field Name"), true, "Should contain Field Name header");
  } finally {
    await cleanupTest();
  }
});

Deno.test("exportSchema - should export schema in TypeScript format", async () => {
  await setupTest();
  
  try {
    const outputPath = await exportSchema(mockSession, mockProjectContextService, "ts");
    const content = await fs.readFile(outputPath, "utf8");

    assertEquals(content.includes("interface"), true, "Should contain interface definitions");
  } finally {
    await cleanupTest();
  }
});

Deno.test("exportSchema - should throw error with invalid session credentials", async () => {
  const invalidSession: Partial<Session> = {
    apiUser: "",
    apiKey: "",
    serverUrl: "",
    apiEndpoint: "",
  };
  
  // Temporarily clear environment variables
  const originalServer = Deno.env.get("FTRACK_SERVER");
  const originalUser = Deno.env.get("FTRACK_API_USER");
  const originalKey = Deno.env.get("FTRACK_API_KEY");
  
  Deno.env.delete("FTRACK_SERVER");
  Deno.env.delete("FTRACK_API_USER");
  Deno.env.delete("FTRACK_API_KEY");

  try {
    await assertRejects(
      async () => {
        await exportSchema(invalidSession as Session, mockProjectContextService, "json");
      },
      Error,
      "Missing required environment variables"
    );
  } finally {
    // Restore environment variables
    if (originalServer) Deno.env.set("FTRACK_SERVER", originalServer);
    if (originalUser) Deno.env.set("FTRACK_API_USER", originalUser);
    if (originalKey) Deno.env.set("FTRACK_API_KEY", originalKey);
  }
});

Deno.test("exportSchema - should create output directory if it does not exist", async () => {
  await fs.rm(outputDir, { recursive: true, force: true });
  
  try {
    const outputPath = await exportSchema(mockSession, mockProjectContextService, "json");

    const dirExists = await fs.stat(path.dirname(outputPath))
      .then(() => true)
      .catch(() => false);

    assertEquals(dirExists, true, "Output directory should exist");
  } finally {
    await cleanupTest();
  }
});
