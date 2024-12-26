import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { createObjectCsvWriter } from 'csv-writer';
import type { Session } from '@ftrack/api';
import { debug } from '../utils/debug.ts';
import inquirer from 'inquirer';

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

async function generateSchema(session: Session): Promise<Schema> {
    const schema: Schema = {};

    for (const entityType of ENTITY_TYPES) {
        debug(`Fetching schema for ${entityType}...`);

        try {
            // Get base schema from entity metadata
            const metadataResponse = await session.query(`
                select key from CustomAttributeConfiguration 
                where object_type_id in (select id from ObjectType where name is "${entityType}")
            `);

            // Get custom attribute links
            const linksResponse = await session.query(`
                select key, label, id 
                from CustomAttributeLinkConfiguration 
                where object_type_id in (select id from ObjectType where name is "${entityType}")
            `);

            // Use schema.ts structure for base fields
            const baseFields: Record<string, SchemaField> = {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                // Common fields across most entity types
                metadata: { type: 'array', required: false },
                custom_attributes: { type: 'array', required: false },
                __entity_type__: { type: 'string', required: false },
                __permissions: { type: 'object', required: false }
            };

            // Add type-specific fields based on entityType
            switch (entityType) {
                case 'Shot':
                case 'Task':
                    baseFields.status_id = { type: 'string', required: true };
                    baseFields.type_id = { type: 'string', required: false };
                    baseFields.parent_id = { type: 'string', required: false };
                    break;
                case 'AssetVersion':
                    baseFields.asset_id = { type: 'string', required: false };
                    baseFields.version = { type: 'number', required: false };
                    baseFields.is_published = { type: 'boolean', required: true };
                    break;
                // Add more cases as needed
            }

            // Map custom attributes
            const standardAttrs = (metadataResponse.data || []).map((attr: any) => ({
                id: attr.id || `custom_${attr.key}`,
                key: attr.key,
                label: attr.key,
                config: { type: 'string' }, // Default to string, update if needed
                entity_type: entityType
            }));

            const linkAttrs = (linksResponse.data || []).map((link: any) => ({
                id: link.id,
                key: link.key,
                label: link.label || link.key,
                config: { type: 'link' },
                entity_type: entityType,
                type: 'link'
            }));

            schema[entityType] = {
                type: entityType,
                baseFields,
                customAttributes: {
                    standard: standardAttrs,
                    links: linkAttrs
                }
            };

            debug(`Successfully generated schema for ${entityType}`);
        } catch (error) {
            console.error(`Error generating schema for ${entityType}:`, error);
            schema[entityType] = {
                type: entityType,
                baseFields: {
                    id: { type: 'string', required: true },
                    name: { type: 'string', required: true }
                },
                customAttributes: {
                    standard: [],
                    links: []
                }
            };
        }
    }

    return schema;
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
        indent: "2",
        lineWidth: -1,
        noRefs: true,
        sortKeys: true
    });
    await fs.writeFile(outputPath, yamlContent, 'utf8');
    debug('YAML export completed successfully');
}

async function exportToJSON(schema: Schema, outputPath: string): Promise<void> {
    debug('Starting JSON export...');
    const jsonContent = JSON.stringify(schema, null, 2)
        // Ensure proper line endings for Windows compatibility
        .replace(/\n/g, '\r\n');
    await fs.writeFile(outputPath, jsonContent, 'utf8');
    debug('JSON export completed successfully');
}

async function exportToTypeScript(schema: Record<string, EntitySchema>, outputPath: string): Promise<string> {
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

function generateTypeScriptSchema(schema: Record<string, EntitySchema>): string {
    let output = '// Generated Ftrack Schema Types\n\n';
    
    for (const [entityName, entitySchema] of Object.entries(schema)) {
        output += `interface ${entityName} {\n`;
        // Add fields from schema
        output += generateTypeScriptFields(entitySchema);
        output += '}\n\n';
    }
    
    return output;
}

function generateTypeScriptFields(entitySchema: EntitySchema): string {
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
        'object': 'Record<string, unknown>',
        'array': 'unknown[]',
        'link': 'string'
    };
    return typeMap[ftrackType] || 'unknown';
}

export async function exportSchema(session: Session, format: 'json' | 'yaml' | 'csv' | 'ts'): Promise<string> {
    try {
        debug(`Starting schema export in ${format} format...`);
        const schema = await generateSchema(session);

        const outputDir = path.join(process.cwd(), 'output');
        await fs.mkdir(outputDir, { recursive: true });
        debug(`Created output directory: ${outputDir}`);

        const formatConfig = {
            json: { ext: '.json', fn: exportToJSON },
            yaml: { ext: '.yaml', fn: exportToYAML },
            csv: { ext: '.csv', fn: exportToCSV },
            ts: { ext: '.ts', fn: exportToTypeScript }
        } as const;

        const { ext, fn } = formatConfig[format];
        const outputPath = path.join(outputDir, `schema${ext}`);

        await fn(schema, outputPath);
        debug(`Schema exported successfully to ${outputPath}`);

        if (format === 'json') {
            console.log('\nTo view the schema, you can use:');
            console.log(`cat ${outputPath} | jq`);
        }

        // Add post-export menu
        const { nextAction } = await inquirer.prompt([{
            type: 'list',
            name: 'nextAction',
            message: 'What would you like to do next?',
            choices: [
                { name: 'Export in another format', value: 'export_again' },
                { name: 'Return to main menu', value: 'main_menu' }
            ]
        }]);

        if (nextAction === 'export_again') {
            const { newFormat } = await inquirer.prompt([{
                type: 'list',
                name: 'newFormat',
                message: 'Select export format:',
                choices: [
                    { name: 'Export to JSON', value: 'json' },
                    { name: 'Export to YAML', value: 'yaml' },
                    { name: 'Export to CSV', value: 'csv' },
                    { name: 'Generate TypeScript (.ts) file', value: 'ts' }
                ].filter(choice => choice.value !== format) // Remove current format from choices
            }]);
            return exportSchema(session, newFormat);
        }

        return outputPath;
    } catch (err) {
        const error = err as Error;
        console.error('Error exporting schema:', error);
        throw error;
    }
}
