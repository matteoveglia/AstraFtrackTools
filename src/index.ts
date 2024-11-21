import { Session } from '@ftrack/api';
import inquirer from 'inquirer';
import type { Question } from 'inquirer';
import dotenv from 'dotenv';
import { updateLatestVersionsSent } from './tools/updateLatestVersions.js';
import { exportSchema } from './tools/exportSchema.js';
import { inspectVersion } from './tools/inspectVersion.js';
import inspectShot from './tools/inspectShot.js';
import inspectTask from './tools/inspectTask.js';
import { propagateThumbnails } from './tools/propagateThumbnails.js';
import { debug } from './utils/debug.js';

dotenv.config();

// Validate environment variables
if (!process.env.FTRACK_SERVER || !process.env.FTRACK_API_USER || !process.env.FTRACK_API_KEY) {
    throw new Error('Missing required environment variables. Please check your .env file.');
}

// Initialize ftrack session
async function initSession(): Promise<Session> {
    if (!process.env.FTRACK_SERVER || !process.env.FTRACK_API_USER || !process.env.FTRACK_API_KEY) {
        throw new Error('Missing required environment variables');
    }
    
    debug('Initializing ftrack session...');
    const session = new Session(
        process.env.FTRACK_SERVER,
        process.env.FTRACK_API_USER,
        process.env.FTRACK_API_KEY,
        { autoConnectEventHub: false }
    );
    await session.initializing;
    debug('Successfully connected to ftrack');
    return session;
}

interface Tool {
    name: string;
    value: string;
    description: string;
    subMenu?: { name: string; value: string; }[];
}

type ExportFormat = 'json' | 'yaml' | 'csv' | 'ts';

// Available tools
const tools: Tool[] = [
    {
        name: 'Update Latest Versions Sent',
        value: 'updateVersions',
        description: 'Updates all shots with their latest delivered version'
    },
    {
        name: 'Export Schema',
        value: 'exportSchema',
        description: 'Exports schema information for major entity types including custom attributes',
        subMenu: [
            { name: 'Export to JSON', value: 'json' },
            { name: 'Export to YAML', value: 'yaml' },
            { name: 'Export to CSV', value: 'csv' },
            { name: 'Generate TypeScript (.ts) file', value: 'ts' }
        ]
    },
    {
        name: 'Inspect Version',
        value: 'inspectVersion',
        description: 'Inspect a specific version\'s relationships'
    },
    {
        name: 'Inspect Shot',
        value: 'inspectShot',
        description: 'Inspect a specific shot\'s details and relationships'
    },
    {
        name: 'Inspect Task',
        value: 'inspectTask',
        description: 'Inspect a specific task\'s details and time logs'
    },
    {
        name: 'Propagate Thumbnails',
        value: 'propagateThumbnails',
        description: 'Update shots with thumbnails from their latest asset versions'
    }
];

// Main menu questions
const menuQuestion = {
    type: 'list',
    name: 'tool',
    message: 'Select a tool to run:',
    choices: [
        ...tools.map(tool => ({
            name: `${tool.name} - ${tool.description}`,
            value: tool.value
        })),
        { name: 'Exit', value: 'exit' }
    ]
} as const;

// After tool completion question
const continueQuestion = {
    type: 'confirm',
    name: 'continue',
    message: 'Would you like to run another tool?',
    default: true
} as const;

async function runTool(session: Session, tool: string, subOption?: ExportFormat) {
    debug(`Running tool: ${tool}${subOption ? ` with option: ${subOption}` : ''}`);
    switch (tool) {
        case 'updateVersions':
            await updateLatestVersionsSent(session);
            break;
        case 'exportSchema':
            if (subOption) {
                await exportSchema(session, subOption);
            }
            break;
        case 'inspectVersion':
            await inspectVersion(session);
            break;
        case 'inspectShot':
            await inspectShot(session);
            break;
        case 'inspectTask':
            await inspectTask(session);
            break;
        case 'propagateThumbnails':
            await propagateThumbnails(session);
            break;
        default:
            console.error('Invalid tool selected');
    }
    debug(`Completed tool: ${tool}`);
}

async function main() {
    try {
        debug('Starting application...');
        // Initialize ftrack session
        const session = await initSession();
        
        let running = true;
        while (running) {
            // Show main menu
            const { tool } = await inquirer.prompt(menuQuestion);
            
            if (tool === 'exit') {
                running = false;
                console.log('Goodbye!');
                continue;
            }
            
            if (tool === 'exportSchema') {
                const exportTool = tools.find(t => t.value === 'exportSchema');
                if (!exportTool?.subMenu) {
                    throw new Error('Export schema submenu not found');
                }
                const { subOption } = await inquirer.prompt({
                    type: 'list',
                    name: 'subOption',
                    message: 'Select export format:',
                    choices: exportTool.subMenu
                } as const);
                await runTool(session, tool, subOption as ExportFormat);
            } else {
                // Run selected tool
                await runTool(session, tool);
            }
            
            // Ask if user wants to continue
            const { continue: shouldContinue } = await inquirer.prompt(continueQuestion);
            running = shouldContinue;
            
            if (!shouldContinue) {
                console.log('Goodbye!');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run the application
main();
