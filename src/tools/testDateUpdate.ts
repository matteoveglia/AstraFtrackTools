import dotenv from 'dotenv';
import { Session } from '@ftrack/api';
import { Shot, TypedCustomAttributeValue, ContextCustomAttributeValue } from '../schemas/schema.js';
import { initSession } from '../utils/initSession.js';
import moment from 'moment';
import { createFtrackDatetime } from '../types/customAttributes.js';
import { debug } from '../utils/debug.js';

// Load environment variables
dotenv.config();

// Get environment variables with type checking
const ftrackServer = process.env.FTRACK_SERVER;
const ftrackApiUser = process.env.FTRACK_API_USER;
const ftrackApiKey = process.env.FTRACK_API_KEY;

// Validate environment variables
if (!ftrackServer || !ftrackApiUser || !ftrackApiKey) {
    throw new Error('Missing required environment variables. Please check your .env file.');
}

interface FtrackQueryResponse<T> {
    data: T[];
    metadata?: Record<string, unknown>;
}

// Updated interface to match Ftrack's response structure
interface ShotQueryResult {
    id: string;
    name: string;
    custom_attributes: ContextCustomAttributeValue[];
    type_id?: string;
    object_type_id: string;
}

async function testDateUpdate() {
    try {
        const session = await initSession();
        debug('Successfully connected to ftrack');

        // Get the shot and inspect its current date format
        const shotResponse = await session.query(`
            select id, name, custom_attributes, type_id, object_type_id
            from Shot 
            where name is "ADO0430"
        `) as unknown as FtrackQueryResponse<ShotQueryResult>;

        if (!shotResponse.data || !shotResponse.data.length) {
            throw new Error('Could not find shot ADO0430');
        }

        const shot = shotResponse.data[0];
        console.log('Found shot:', shot.name);
        console.log('Current custom attributes:', shot.custom_attributes);

        // Generate a date using moment
        const randomDaysAgo = Math.floor(Math.random() * 30);
        const momentDate = moment().subtract(randomDaysAgo, 'days').startOf('day');
        const isoDateString = momentDate.toISOString();

        // Find the specific custom attribute we want to update
        const dateAttribute = shot.custom_attributes.find(attr => 
            attr.key === 'latestVersionSentDate'
        );

        if (!dateAttribute) {
            throw new Error('Could not find latestVersionSentDate attribute');
        }

        console.log('Attempting to set date to:', isoDateString);

        try {
            // Update using documented approach
            await session.update(
                'ContextCustomAttributeValue', 
                [dateAttribute.configuration_id, shot.id],
                {
                    value: isoDateString,
                    key: dateAttribute.key,
                    entity_id: shot.id,
                    configuration_id: dateAttribute.configuration_id
                }
            );
            debug('Successfully updated date');
        } catch (error) {
            console.error('Failed to update date:', error);
            throw error;
        }

        // Verify the update
        const verifyResponse = await session.query(`
            select custom_attributes from Shot where id is "${shot.id}"
        `);

        if (!verifyResponse.data || verifyResponse.data.length === 0) {
            throw new Error('Could not verify update');
        }

        console.log('Updated custom attributes:', verifyResponse.data[0].custom_attributes);
    } catch (error) {
        console.error('Test failed:', error);
        if (error instanceof Error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        throw error;
    }
}

// Run the test if this file is being run directly
if (import.meta.url === new URL(import.meta.url).href) {
    testDateUpdate()
        .then(() => debug('Test completed'))
        .catch(error => console.error('Test failed:', error))
        .finally(() => process.exit());
}

export { testDateUpdate };