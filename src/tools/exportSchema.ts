import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { createObjectCsvWriter } from 'csv-writer';
import { MOCK_SCHEMA } from '../schemas/mockSchema.js';
import type { Session } from '@ftrack/api';
import { debug } from '../utils/debug.js';

export interface SchemaField {
    type: string;
    required: boolean;
}

export interface CustomAttribute {
    id: string;
    key: string;
    label: string;
    config: { type: string; };
    entity_type: string;
    type?: string;
}

export interface EntitySchema {
    type: string;
    baseFields: Record<string, SchemaField>;
    customAttributes: {
        standard: CustomAttribute[];
        links: CustomAttribute[];
    };
    sample: any;
    error?: string;
}

type Schema = Record<string, EntitySchema>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENTITY_TYPES = [
    'Action',
    'ActionLog',
    'ApiKey',
    'Appointment',
    'Asset',
    'AssetBuild',
    'AssetVersion',
    'Shot',
    'Task',
    'Sequence',
    'Project',
    'User'
];

async function generateSchema(session: Session | null): Promise<Schema> {
    // If we're in test mode (no session), return mock schema
    if (!session) {
        debug('No session provided, returning mock schema');
        return MOCK_SCHEMA;
    }

    // The schema generator uses the same environment variables we already have
    // No need to set them from session since they're already in process.env
    
    // Create temporary directory for schema generation
    const tempDir = path.join(__dirname, '../../temp');
    await fs.mkdir(tempDir, { recursive: true });
    debug(`Created temporary directory: ${tempDir}`);

    try {
        // Generate schema using ftrack-ts-schema-generator
        debug('Generating schema using ftrack-ts-schema-generator...');
        execSync('pnpm ftrack-ts-schema-generator ./temp schema.ts', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '../..')
        });

        // Read generated schema
        const schemaContent = await fs.readFile(path.join(tempDir, 'schema.ts'), 'utf8');
        debug('Successfully read generated schema file');

        // Parse the TypeScript interfaces into a more JSON-friendly format
        const schema: Schema = {};
        
        for (const entityType of ENTITY_TYPES) {
            debug(`Parsing schema for entity type: ${entityType}`);
            const entitySchema = parseEntitySchema(schemaContent, entityType);
            if (entitySchema) {
                schema[entityType] = entitySchema;
                debug(`Successfully parsed schema for ${entityType}`);
            }
        }

        return schema;
    } finally {
        // For TypeScript export, we don't want to remove the temp directory
        // as we'll need to copy the schema.ts file from there
        if (!process.env.KEEP_TEMP) {
            try {
                debug('Cleaning up temporary directory');
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.warn('Failed to cleanup temporary files:', error);
            }
        }
    }
}

function parseEntitySchema(schemaContent: string, entityType: string): EntitySchema | null {
    try {
        // Find the interface definition for the entity type
        const interfaceRegex = new RegExp(`interface ${entityType}\\s*{([^}]+)}`, 'g');
        const match = interfaceRegex.exec(schemaContent);
        
        if (!match) {
            debug(`No schema found for ${entityType}`);
            return null;
        }

        const interfaceContent = match[1];
        const fields = interfaceContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('//'));

        const baseFields: Record<string, SchemaField> = {};
        const customAttributes = {
            standard: [] as CustomAttribute[],
            links: [] as CustomAttribute[]
        };

        // Parse fields
        fields.forEach(field => {
            const [key, type] = field.split(':').map(s => s.trim());
            if (!key || !type) return;

            const cleanKey = key.replace('?', '');
            const isRequired = !key.includes('?');
            const isCustomAttribute = cleanKey.startsWith('custom_');

            if (isCustomAttribute) {
                const attrName = cleanKey.replace('custom_', '');
                const isLink = type.includes('Link');

                const attr: CustomAttribute = {
                    id: `custom_${attrName}`,
                    key: attrName,
                    label: attrName,
                    config: { type: convertTypeToConfig(type) },
                    entity_type: entityType
                };

                if (isLink) {
                    customAttributes.links.push({
                        ...attr,
                        type: 'link'
                    });
                } else {
                    customAttributes.standard.push(attr);
                }
            } else {
                baseFields[cleanKey] = {
                    type: convertTypeToConfig(type),
                    required: isRequired
                };
            }
        });

        return {
            type: entityType,
            baseFields,
            customAttributes,
            sample: null // Sample data not available from TypeScript schema
        };
    } catch (err) {
        const error = err as Error;
        console.error(`Error parsing schema for ${entityType}:`, error);
        return {
            type: entityType,
            baseFields: {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true }
            },
            customAttributes: {
                standard: [],
                links: []
            },
            sample: null,
            error: error.message || 'Unknown error occurred'
        };
    }
}

function convertTypeToConfig(tsType: string): string {
    // Remove any trailing semicolons and clean up the type
    tsType = tsType.replace(/;$/, '').trim();
    
    // Handle union types
    if (tsType.includes('|')) {
        return 'string'; // Default to string for union types
    }

    // Handle array types
    if (tsType.includes('[]')) {
        return 'array';
    }

    // Map TypeScript types to ftrack types
    const typeMap: Record<string, string> = {
        'string': 'string',
        'number': 'number',
        'boolean': 'boolean',
        'Date': 'date',
        'any': 'string',
        'object': 'object',
        'Record<string, any>': 'object'
    };

    return typeMap[tsType] || 'string';
}

async function exportToCSV(schema: Schema, outputPath: string): Promise<void> {
    debug('Starting CSV export...');
    const records = [];

    // Process each entity type
    for (const [entityType, entitySchema] of Object.entries(schema)) {
        debug(`Processing ${entityType} for CSV export`);
        // Add base fields
        for (const [fieldName, fieldInfo] of Object.entries(entitySchema.baseFields)) {
            records.push({
                'Entity Type': entityType,
                'Field Category': 'Base Field',
                'Field Name': fieldName,
                'Field Type': fieldInfo.type,
                'Required': fieldInfo.required ? 'Yes' : 'No',
                'Is Custom': 'No',
                'Description': `Base ${fieldName} field`
            });
        }

        // Add standard custom attributes
        entitySchema.customAttributes.standard.forEach(attr => {
            records.push({
                'Entity Type': entityType,
                'Field Category': 'Custom Attribute',
                'Field Name': attr.key,
                'Field Type': attr.config.type,
                'Required': 'No',
                'Is Custom': 'Yes',
                'Description': attr.label
            });
        });

        // Add link custom attributes
        entitySchema.customAttributes.links.forEach(attr => {
            records.push({
                'Entity Type': entityType,
                'Field Category': 'Custom Link',
                'Field Name': attr.key,
                'Field Type': 'link',
                'Required': 'No',
                'Is Custom': 'Yes',
                'Description': attr.label
            });
        });
    }

    const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: [
            {id: 'Entity Type', title: 'Entity Type'},
            {id: 'Field Category', title: 'Field Category'},
            {id: 'Field Name', title: 'Field Name'},
            {id: 'Field Type', title: 'Field Type'},
            {id: 'Required', title: 'Required'},
            {id: 'Is Custom', title: 'Is Custom'},
            {id: 'Description', title: 'Description'}
        ]
    });

    await csvWriter.writeRecords(records);
    debug('CSV export completed successfully');
}

async function exportToYAML(schema: Schema, outputPath: string): Promise<void> {
    debug('Starting YAML export...');
    const yamlContent = yaml.dump(schema, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: true
    });
    await fs.writeFile(outputPath, yamlContent, 'utf8');
    debug('YAML export completed successfully');
}

async function exportToJSON(schema: Schema, outputPath: string): Promise<void> {
    debug('Starting JSON export...');
    // Use native JSON.stringify with proper formatting
    const jsonContent = JSON.stringify(schema, null, 2)
        // Ensure proper line endings for Windows compatibility
        .replace(/\n/g, '\r\n');
    await fs.writeFile(outputPath, jsonContent, 'utf8');
    debug('JSON export completed successfully');
}

async function exportToTypeScript(schema: any, outputPath: string): Promise<string> {
    debug('Starting TypeScript export...');
    const tempDir = path.join(process.cwd(), 'temp');
    const tempFile = path.join(tempDir, 'schema.ts');

    try {
        // Create temp directory if it doesn't exist
        await fs.mkdir(tempDir, { recursive: true });
        debug(`Created temporary directory: ${tempDir}`);
        
        // Generate TypeScript content
        const tsContent = generateTypeScriptSchema(schema);
        
        // Write to temp file first
        await fs.writeFile(tempFile, tsContent, 'utf8');
        debug('Generated TypeScript content written to temporary file');
        
        // Copy to final destination
        await fs.copyFile(tempFile, outputPath);
        debug(`Copied TypeScript schema to final destination: ${outputPath}`);
        
        // Clean up temp file
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);
        debug('Cleaned up temporary files');
        
        return outputPath;
    } catch (error) {
        console.error('Error in TypeScript schema export:', error);
        throw new Error('Failed to export TypeScript schema. Check temporary directory permissions.');
    }
}

function generateTypeScriptSchema(schema: any): string {
    let output = '// Generated Ftrack Schema Types\n\n';
    
    for (const [entityName, entitySchema] of Object.entries(schema)) {
        output += `interface ${entityName} {\n`;
        // Add fields from schema
        output += generateTypeScriptFields(entitySchema);
        output += '}\n\n';
    }
    
    return output;
}

function generateTypeScriptFields(entitySchema: any): string {
    let fields = '';
    // Add base fields
    if (entitySchema.baseFields) {
        for (const [fieldName, field] of Object.entries(entitySchema.baseFields)) {
            const typeField = field as SchemaField;
            fields += `    ${fieldName}${typeField.required ? '' : '?'}: ${mapTypeToTypeScript(typeField.type)};\n`;
        }
    }
    // Add custom attributes
    if (entitySchema.customAttributes) {
        const { standard = [], links = [] } = entitySchema.customAttributes;
        for (const attr of [...standard, ...links]) {
            const fieldName = `custom_${attr.key}`;
            const fieldType = attr.type === 'link' ? 'string' : mapTypeToTypeScript(attr.config.type);
            fields += `    ${fieldName}?: ${fieldType};\n`;
        }
    }
    return fields;
}

function mapTypeToTypeScript(ftrackType: string): string {
    const typeMap: Record<string, string> = {
        'string': 'string',
        'number': 'number',
        'boolean': 'boolean',
        'date': 'Date',
        'object': 'Record<string, any>',
        'array': 'any[]',
        'link': 'string'
    };
    return typeMap[ftrackType] || 'any';
}

export async function exportSchema(session: Session | null, format: 'json' | 'yaml' | 'csv' | 'ts'): Promise<string> {
    try {
        // Only check environment variables if we have a session
        if (session && (!process.env.FTRACK_SERVER || !process.env.FTRACK_API_USER || !process.env.FTRACK_API_KEY)) {
            throw new Error('Missing required environment variables for schema generation');
        }

        debug(`Starting schema export in ${format} format...`);
        
        // Set flag to keep temp directory if exporting TypeScript
        if (format === 'ts') {
            process.env.KEEP_TEMP = 'true';
        }

        const schema = await generateSchema(session);

        // Ensure output directory exists
        const outputDir = path.join(process.cwd(), 'output');
        await fs.mkdir(outputDir, { recursive: true });
        debug(`Created output directory: ${outputDir}`);

        // Determine file extension and export function based on format
        const formatConfig = {
            json: { ext: '.json', fn: exportToJSON },
            yaml: { ext: '.yaml', fn: exportToYAML },
            csv: { ext: '.csv', fn: exportToCSV },
            ts: { ext: '.ts', fn: exportToTypeScript }
        } as const;

        const { ext, fn } = formatConfig[format as keyof typeof formatConfig] || formatConfig.json;
        const outputPath = path.join(outputDir, `schema${ext}`);

        // Export schema in the specified format
        await fn(schema, outputPath);

        debug(`Schema exported successfully to ${outputPath}`);
        
        // Log a sample command to view the schema
        if (format === 'json') {
            debug('Providing view command for JSON schema');
            console.log('\nTo view the schema, you can use:');
            console.log(`cat ${outputPath} | jq`);
        }

        // Clean up temp directory after TypeScript export
        if (format === 'ts') {
            delete process.env.KEEP_TEMP;
            const tempDir = path.join(__dirname, '../../temp');
            try {
                debug('Cleaning up temporary files after TypeScript export');
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.warn('Failed to cleanup temporary files:', error);
            }
        }
        
        return outputPath;
    } catch (err) {
        const error = err as Error;
        console.error('Error exporting schema:', error);
        throw error;
    }
}
