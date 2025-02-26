import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { fileURLToPath } from "node:url";
import type { Session } from "@ftrack/api";
import { exportSchema } from "../tools/exportSchema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "../../output");

describe("exportSchema", () => {
  beforeEach(async () => {
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      const files = await fs.readdir(outputDir);
      await Promise.all(
        files.map((file) => fs.unlink(path.join(outputDir, file))),
      );
      await fs.rmdir(outputDir);
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  it("should export schema in JSON format", async () => {
    const outputPath = await exportSchema(null, "json");
    const content = await fs.readFile(outputPath, "utf8");
    const schema = JSON.parse(content);

    expect(schema).toHaveProperty("Shot");
    expect(schema.Shot).toHaveProperty("baseFields");
    expect(schema.Shot).toHaveProperty("customAttributes");
    expect(schema.Shot.customAttributes).toHaveProperty("standard");
    expect(schema.Shot.customAttributes).toHaveProperty("links");
  });

  it("should export schema in YAML format", async () => {
    const outputPath = await exportSchema(null, "yaml");
    const content = await fs.readFile(outputPath, "utf8");
    const schema = yaml.load(content) as Record<string, any>;

    expect(schema).toHaveProperty("Shot");
    expect(typeof schema.Shot).toBe("object");
    expect(schema.Shot.customAttributes.standard).toBeInstanceOf(Array);
  });

  it("should export schema in CSV format", async () => {
    const outputPath = await exportSchema(null, "csv");
    const content = await fs.readFile(outputPath, "utf8");
    const lines = content.split("\n");

    expect(lines[0]).toContain("Entity Type");
    expect(lines[0]).toContain("Field Category");
    expect(lines[0]).toContain("Field Name");
    expect(lines.some((line) => line.includes("Shot"))).toBe(true);
  });

  it("should export schema in TypeScript format", async () => {
    const outputPath = await exportSchema(null, "ts");
    const content = await fs.readFile(outputPath, "utf8");

    expect(content).toContain("interface Shot");
    expect(content).toContain("interface Asset");
    expect(content).toContain("interface Task");
  });

  it("should throw error with invalid session credentials", async () => {
    const mockSession: Partial<Session> = {
      apiUser: "",
      apiKey: "",
      serverUrl: "",
      apiEndpoint: "",
    };
    process.env.FTRACK_SERVER = "";
    process.env.FTRACK_API_USER = "";
    process.env.FTRACK_API_KEY = "";

    await expect(() => exportSchema(mockSession as Session, "json")).rejects
      .toThrow("Missing required environment variables");
  });

  it("should create output directory if it does not exist", async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
    const outputPath = await exportSchema(null, "json");

    const dirExists = await fs.stat(path.dirname(outputPath))
      .then(() => true)
      .catch(() => false);

    expect(dirExists).toBe(true);
  });
});
