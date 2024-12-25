import { Session } from '@ftrack/api';
import inquirer from 'inquirer';
import dotenv from 'dotenv';
import { updateLatestVersionsSent } from './tools/updateLatestVersions.ts';
import { exportSchema } from './tools/exportSchema.ts';
import { inspectVersion } from './tools/inspectVersion.ts';
import inspectShot from './tools/inspectShot.ts';
import inspectTask from './tools/inspectTask.ts';
import { propagateThumbnails } from './tools/propagateThumbnails.ts';
import { debug, handleError } from './utils/debug.ts';
import { loadPreferences, savePreferences } from "./utils/preferences.ts";

dotenv.config();
const machineHostname = Deno.hostname();

// Initialize ftrack session
async function initSession(): Promise<Session> {
    debug('Loading preferences');
    const prefs = await loadPreferences();
    
    if (!prefs.FTRACK_SERVER || !prefs.FTRACK_API_USER || !prefs.FTRACK_API_KEY) {
        throw new Error('Missing required Ftrack credentials in preferences');
    }
    
    debug('Initializing ftrack session...');
    const session = new Session(
        prefs.FTRACK_SERVER,
        prefs.FTRACK_API_USER,
        prefs.FTRACK_API_KEY,
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
    action?: () => Promise<void>;  // Return type is void
}

type ExportFormat = 'json' | 'yaml' | 'csv' | 'ts';

async function testFtrackCredentials(server: string, user: string, key: string): Promise<boolean> {
    try {
        debug('Testing Ftrack credentials...');
        const testSession = new Session(server, user, key, { autoConnectEventHub: false });
        await testSession.initializing;
        debug('Credentials test successful');
        return true;
    } catch (error) {
        // Prevent the error from being logged to console
        if (error instanceof Error && 'errorCode' in error) {
            const errorMessage = handleError(error);
            console.error('Authentication failed:', errorMessage);
        } else {
            debug('Unexpected error during authentication:', error);
            console.error('Authentication failed: Unable to connect to Ftrack');
        }
        return false;
    }
}

async function setAndTestCredentials(): Promise<void> {  // Changed return type to void
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'server',
            message: 'Ftrack Server URL:',
            default: (await loadPreferences()).FTRACK_SERVER
        },
        {
            type: 'input',
            name: 'user',
            message: 'API User:',
            default: (await loadPreferences()).FTRACK_API_USER
        },
        {
            type: 'password',
            name: 'key',
            message: 'API Key:',
            mask: '*'
        }
    ]);

    const shouldTest = await inquirer.prompt([{
        type: 'confirm',
        name: 'test',
        message: 'Would you like to test these credentials?',
        default: true
    }]);

    if (shouldTest.test) {
        const isValid = await testFtrackCredentials(answers.server, answers.user, answers.key);
        if (!isValid) {
            console.log('Credentials test failed. Please try again.');
            return;  // Exit without saving if test fails
        }
    }

    await savePreferences({
        FTRACK_SERVER: answers.server,
        FTRACK_API_USER: answers.user,
        FTRACK_API_KEY: answers.key
    });
    
    console.log('Authentication success! Credentials saved successfully');
}

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
    },
    {
        name: "Set Ftrack Credentials",
        value: "set-credentials",
        description: "Configure Ftrack API credentials",
        action: setAndTestCredentials
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
        case 'set-credentials': {
            const credentialsTool = tools.find(t => t.value === 'set-credentials');
            if (credentialsTool?.action) {
                await credentialsTool.action();
            } else {
                throw new Error('Set credentials action not found');
            }
            break;
        }
        default:
            console.error('Invalid tool selected');
    }
    debug(`Completed tool: ${tool}`);
}

async function main() {
    try {
        debug('Starting application...');
        debug("Hostname is: " + machineHostname);

        // Check for existing credentials
        const prefs = await loadPreferences();
        if (!prefs.FTRACK_SERVER || !prefs.FTRACK_API_USER || !prefs.FTRACK_API_KEY) {
            console.log('No Ftrack credentials found. Please configure them first.');
            await setAndTestCredentials();
            // Try loading preferences again
            const newPrefs = await loadPreferences();
            if (!newPrefs.FTRACK_SERVER || !newPrefs.FTRACK_API_USER || !newPrefs.FTRACK_API_KEY) {
                console.log('Failed to set up valid credentials. Exiting...');
                Deno.exit(1);
            }
        }

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
        Deno.exit(1);
    }
}

// Run the application
main();
