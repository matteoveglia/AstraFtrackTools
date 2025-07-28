import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { createObjectCsvWriter } from "csv-writer";
import type { Session } from "@ftrack/api";
import { debug } from "../utils/debug.ts";
import inquirer from "inquirer";
import { ProjectContextService } from "../services/projectContext.ts";
import { handleError, withErrorHandling } from "../utils/errorHandler.ts";

export interface SchemaField {
  type: string;
  required: boolean;
}

export interface CustomAttribute {
  id: string;
  key: string;
  label: string;
  config: { type: string };
  entity_type: string;
  type?: string;
}

export interface SampleData {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface EntitySchema {
  type: string;
  baseFields: Record<string, SchemaField>;
  customAttributes: {
    standard: CustomAttribute[];
    links: CustomAttribute[];
  };
  sample?: SampleData;
}

type Schema = Record<string, EntitySchema>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const _ENTITY_TYPES = [
  "Action",
  "ActionLog",
  "ApiKey",
  "Appointment",
  "Asset",
  "AssetBuild",
  "AssetVersion",
  "Shot",
  "Task",
  "Sequence",
  "Project",
  "User",
];

async function generateSchema(
  session: Session,
  projectContextService: ProjectContextService
): Promise<Schema> {
  debug("Starting schema generation...");
  const schema: Schema = {};

  const projectContext = projectContextService.getContext();
  const contextDisplay = projectContext.isGlobal 
    ? "all projects" 
    : `project "${projectContext.project?.name}"`;

  try {
    // Get all entity types using session directly (schema queries don't need project scoping)
    const entityTypesResponse = await withErrorHandling(
      () => session.query("select id, name from ObjectType"),
      {
        operation: 'fetch entity types',
        entity: 'ObjectType'
      }
    );

    if (!entityTypesResponse || !entityTypesResponse.data) {
      throw new Error("Failed to fetch entity types");
    }
    
    console.log(`\nGenerating schema for ${contextDisplay}...`);
    debug(`Found ${entityTypesResponse.data.length} entity types`);

    for (const entityType of entityTypesResponse.data) {
      debug(`Processing entity type: ${entityType.name}`);
      schema[entityType.name] = {
        type: entityType.name,
        baseFields: {},
        customAttributes: { standard: [], links: [] },
      };

      // Get base fields for this entity type
      try {
        // Add common base fields that exist for most entity types
        const commonBaseFields = {
          'id': { type: 'string', required: true },
          'name': { type: 'string', required: false },
          'created_date': { type: 'datetime', required: false },
          'updated_date': { type: 'datetime', required: false }
        };
        
        // Add entity-specific base fields
        const entitySpecificFields: Record<string, Record<string, SchemaField>> = {
          'Project': {
            'full_name': { type: 'string', required: false },
            'status': { type: 'string', required: false },
            'start_date': { type: 'date', required: false },
            'end_date': { type: 'date', required: false }
          },
          'Shot': {
            'status': { type: 'string', required: false },
            'priority': { type: 'string', required: false },
            'description': { type: 'text', required: false }
          },
          'Task': {
            'status': { type: 'string', required: false },
            'priority': { type: 'string', required: false },
            'bid': { type: 'number', required: false },
            'type': { type: 'string', required: false }
          },
          'AssetVersion': {
            'version': { type: 'number', required: false },
            'comment': { type: 'text', required: false },
            'is_latest_version': { type: 'boolean', required: false }
          },
          'User': {
            'username': { type: 'string', required: false },
            'email': { type: 'string', required: false },
            'first_name': { type: 'string', required: false },
            'last_name': { type: 'string', required: false }
          }
        };
        
        // Merge common and entity-specific fields
        schema[entityType.name].baseFields = {
          ...commonBaseFields,
          ...(entitySpecificFields[entityType.name] || {})
        };
        
      } catch (schemaError) {
        debug(`Could not set base fields for ${entityType.name}: ${schemaError}`);
        // Set minimal base fields as fallback
        schema[entityType.name].baseFields = {
          'id': { type: 'string', required: true },
          'name': { type: 'string', required: false }
        };
      }

      // Get custom attributes for this entity type
      const customAttributesResponse = await withErrorHandling(
        () => session.query(`
          select 
            id,
            key,
            label,
            type,
            config,
            entity_type
          from CustomAttributeConfiguration 
          where entity_type="${entityType.name}"
        `),
        {
          operation: 'fetch custom attributes',
          entity: 'CustomAttributeConfiguration',
          additionalData: { entityType: entityType.name }
        }
      );

      // Process custom attributes
      if (customAttributesResponse && customAttributesResponse.data) {
        for (const attr of customAttributesResponse.data) {
          const customAttr = {
            id: attr.id,
            key: attr.key,
            label: attr.label,
            type: attr.type,
            config: attr.config,
            entity_type: entityType.name,
          };

          if (attr.type === "link") {
            schema[entityType.name].customAttributes.links.push(customAttr);
          } else {
            schema[entityType.name].customAttributes.standard.push(customAttr);
          }
        }
      }
    }

    debug("Schema generation completed successfully");
    return schema;
  } catch (error) {
    handleError(error, {
      operation: 'generate schema',
      additionalData: { contextDisplay: contextDisplay }
    });
    throw error;
  }
}

async function exportToCSV(schema: Schema, outputPath: string): Promise<void> {
  debug("Starting CSV export...");
  const records = [];

  // Process each entity type
  for (const [entityType, entitySchema] of Object.entries(schema)) {
    debug(`Processing ${entityType} for CSV export`);
    // Add base fields
    for (
      const [fieldName, fieldInfo] of Object.entries(entitySchema.baseFields)
    ) {
      records.push({
        "Entity Type": entityType,
        "Field Category": "Base Field",
        "Field Name": fieldName,
        "Field Type": fieldInfo.type,
        "Required": fieldInfo.required ? "Yes" : "No",
        "Is Custom": "No",
        "Description": `Base ${fieldName} field`,
      });
    }

    // Add standard custom attributes
    entitySchema.customAttributes.standard.forEach((attr) => {
      records.push({
        "Entity Type": entityType,
        "Field Category": "Custom Attribute",
        "Field Name": attr.key,
        "Field Type": attr.config.type,
        "Required": "No",
        "Is Custom": "Yes",
        "Description": attr.label,
      });
    });

    // Add link custom attributes
    entitySchema.customAttributes.links.forEach((attr) => {
      records.push({
        "Entity Type": entityType,
        "Field Category": "Custom Link",
        "Field Name": attr.key,
        "Field Type": "link",
        "Required": "No",
        "Is Custom": "Yes",
        "Description": attr.label,
      });
    });
  }

  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: "Entity Type", title: "Entity Type" },
      { id: "Field Category", title: "Field Category" },
      { id: "Field Name", title: "Field Name" },
      { id: "Field Type", title: "Field Type" },
      { id: "Required", title: "Required" },
      { id: "Is Custom", title: "Is Custom" },
      { id: "Description", title: "Description" },
    ],
  });

  await csvWriter.writeRecords(records);
  debug("CSV export completed successfully");
}

async function exportToYAML(schema: Schema, outputPath: string): Promise<void> {
  debug("Starting YAML export...");
  const yamlContent = yaml.dump(schema, {
    indent: "2",
    lineWidth: -1,
    noRefs: true,
    sortKeys: true,
  });
  await fs.writeFile(outputPath, yamlContent, "utf8");
  debug("YAML export completed successfully");
}

async function exportToJSON(schema: Schema, outputPath: string): Promise<void> {
  debug("Starting JSON export...");
  const jsonContent = JSON.stringify(schema, null, 2)
    // Ensure proper line endings for Windows compatibility
    .replace(/\n/g, "\r\n");
  await fs.writeFile(outputPath, jsonContent, "utf8");
  debug("JSON export completed successfully");
}

async function exportToTypeScript(
  schema: Record<string, EntitySchema>,
  outputPath: string,
): Promise<string> {
  debug("Starting TypeScript export...");
  const tempDir = path.join(process.cwd(), "temp");
  const tempFile = path.join(tempDir, "schema.ts");

  try {
    // Create temp directory if it doesn't exist
    await fs.mkdir(tempDir, { recursive: true });
    debug(`Created temporary directory: ${tempDir}`);

    // Generate TypeScript content
    const tsContent = generateTypeScriptSchema(schema);

    // Write to temp file first
    await fs.writeFile(tempFile, tsContent, "utf8");
    debug("Generated TypeScript content written to temporary file");

    // Copy to final destination
    await fs.copyFile(tempFile, outputPath);
    debug(`Copied TypeScript schema to final destination: ${outputPath}`);

    // Clean up temp file
    await fs.unlink(tempFile);
    await fs.rmdir(tempDir);
    debug("Cleaned up temporary files");

    return outputPath;
  } catch (error) {
    console.error("Error in TypeScript schema export:", error);
    throw new Error(
      "Failed to export TypeScript schema. Check temporary directory permissions.",
    );
  }
}

function generateTypeScriptSchema(
  schema: Record<string, EntitySchema>,
): string {
  let output = "// Generated Ftrack Schema Types\n\n";

  for (const [entityName, entitySchema] of Object.entries(schema)) {
    output += `interface ${entityName} {\n`;
    // Add fields from schema
    output += generateTypeScriptFields(entitySchema);
    output += "}\n\n";
  }

  return output;
}

function generateTypeScriptFields(entitySchema: EntitySchema): string {
  let fields = "";
  // Add base fields
  if (entitySchema.baseFields) {
    for (const [fieldName, field] of Object.entries(entitySchema.baseFields)) {
      const typeField = field as SchemaField;
      fields += `    ${fieldName}${typeField.required ? "" : "?"}: ${
        mapTypeToTypeScript(typeField.type)
      };\n`;
    }
  }
  // Add custom attributes
  if (entitySchema.customAttributes) {
    const { standard = [], links = [] } = entitySchema.customAttributes;
    for (const attr of [...standard, ...links]) {
      const fieldName = `custom_${attr.key}`;
      const fieldType = attr.type === "link"
        ? "string"
        : mapTypeToTypeScript(attr.config.type);
      fields += `    ${fieldName}?: ${fieldType};\n`;
    }
  }
  return fields;
}

function mapTypeToTypeScript(ftrackType: string): string {
  const typeMap: Record<string, string> = {
    "string": "string",
    "number": "number",
    "boolean": "boolean",
    "date": "Date",
    "object": "Record<string, unknown>",
    "array": "unknown[]",
    "link": "string",
  };
  return typeMap[ftrackType] || "unknown";
}

export async function exportSchema(
  session: Session,
  projectContextService: ProjectContextService,
  format: "json" | "yaml" | "csv" | "ts",
  interactive: boolean = true,
): Promise<string> {
  try {
    debug(`Starting schema export in ${format} format...`);
    const schema = await generateSchema(session, projectContextService);

    const outputDir = path.join(process.cwd(), "output");
    await fs.mkdir(outputDir, { recursive: true });
    debug(`Created output directory: ${outputDir}`);

    const formatConfig = {
      json: { ext: ".json", fn: exportToJSON },
      yaml: { ext: ".yaml", fn: exportToYAML },
      csv: { ext: ".csv", fn: exportToCSV },
      ts: { ext: ".ts", fn: exportToTypeScript },
    } as const;

    const { ext, fn } = formatConfig[format];
    const outputPath = path.join(outputDir, `schema${ext}`);

    await fn(schema, outputPath);
    debug(`Schema exported successfully to ${outputPath}`);

    if (format === "json") {
      console.log("\nTo view the schema, you can use:");
      console.log(`cat ${outputPath} | jq`);
    }

    // Add post-export menu only in interactive mode
    if (interactive) {
      const { nextAction } = await inquirer.prompt([{
        type: "list",
        name: "nextAction",
        message: "What would you like to do next?",
        choices: [
          { name: "Export in another format", value: "export_again" },
          { name: "Return to main menu", value: "main_menu" },
        ],
      }]);

      if (nextAction === "export_again") {
        const { newFormat } = await inquirer.prompt([{
          type: "list",
          name: "newFormat",
          message: "Select export format:",
          choices: [
            { name: "Export to JSON", value: "json" },
            { name: "Export to YAML", value: "yaml" },
            { name: "Export to CSV", value: "csv" },
            { name: "Generate TypeScript (.ts) file", value: "ts" },
          ].filter((choice) => choice.value !== format), // Remove current format from choices
        }]);
        return exportSchema(session, projectContextService, newFormat, interactive);
      }
    }

    return outputPath;
  } catch (err) {
    const error = err as Error;
    console.error("Error exporting schema:", error);
    throw error;
  }
}
