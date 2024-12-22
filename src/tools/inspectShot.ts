import { Session } from '@ftrack/api';
import inquirer from 'inquirer';
import { debug } from '../utils/debug.ts';

export default async function inspectShot(session: Session, shotId?: string) {
    // If no shotId provided, prompt user for input
    if (!shotId) {
        debug('No shot ID provided, prompting user for input');
        const answer = await inquirer.prompt({
            type: 'input',
            name: 'shotId',
            message: 'Enter Shot ID:',
            validate: (input: string) => {
                return input.length > 0 || 'Please enter a valid ID';
            }
        });
        shotId = answer.shotId;
    }

    try {
        debug(`Fetching shot details for ID: ${shotId}`);

        // Get shot info with custom attributes
        const response = await session.query(`
            select 
                id,
                name,
                parent.name,
                parent.id,
                parent.type.name,
                project.id,
                project.name,
                custom_attributes,
                status.name,
                status.id,
                type.name,
                type.id,
                priority.name,
                priority.id,
                metadata.key,
                metadata.value
            from Shot 
            where id is "${shotId}"`
        );

        debug('Shot details retrieved');

        // Get tasks associated with the shot
        const tasksQuery = await session.query(`
            select 
                id,
                name,
                type.name,
                status.name,
                priority.name,
                custom_attributes
            from Task 
            where parent_id is "${shotId}"`
        );

        debug('Shot tasks retrieved');

        // Get latest versions linked to this shot using the correct relationship
        const versionsQuery = await session.query(`
            select 
                id,
                version,
                asset.name,
                status.name,
                date,
                comment,
                custom_attributes,
                is_published
            from AssetVersion 
            where components any (version.asset.parent.id is "${shotId}")
            order by version desc
            limit 5`
        );

        debug('Latest versions retrieved');

        console.log('\n=== SHOT DETAILS ===\n');
        console.log(JSON.stringify(response.data[0], null, 2));
        console.log('\n=== TASKS ===\n');
        console.log(JSON.stringify(tasksQuery.data, null, 2));
        console.log('\n=== LATEST VERSIONS ===\n');
        console.log(JSON.stringify(versionsQuery.data, null, 2));
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error while fetching shot information:', errorMessage);
        throw error;
    }
}