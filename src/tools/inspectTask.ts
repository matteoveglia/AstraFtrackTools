import { Session } from '@ftrack/api';
import inquirer from 'inquirer';
import { debug } from '../utils/debug.js';

async function inspectTask(session: Session, taskId?: string) {
    // If no taskId provided, prompt user for input
    if (!taskId) {
        debug('No task ID provided, prompting user for input');
        const answer = await inquirer.prompt({
            type: 'input',
            name: 'taskId',
            message: 'Enter Task ID:',
            validate: (input: string) => {
                return input.length > 0 || 'Please enter a valid ID';
            }
        });
        taskId = answer.taskId;
    }

    debug(`Fetching task details for ID: ${taskId}`);

    // Get task info
    const response = await session.query(`
        select 
            id,
            name,
            type.name,
            type.id,
            status.name,
            status.id,
            priority.name,
            priority.id,
            parent.name,
            parent.id,
            parent.type.name,
            bid,
            start_date,
            end_date,
            custom_attributes,
            metadata.key,
            metadata.value
        from Task 
        where id is "${taskId}"`
    );

    debug('Task details retrieved');

    // Get time logs for this task
    const timelogsQuery = await session.query(`
        select 
            id,
            user.username,
            start,
            duration,
            comment
        from Timelog 
        where context_id is "${taskId}"
        order by start desc`
    );

    debug('Time logs retrieved');

    // Get versions created under this task
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
        where task_id is "${taskId}"
        order by version desc`
    );

    debug('Versions retrieved');

    console.log('\n=== TASK DETAILS ===\n');
    console.log(JSON.stringify(response.data[0], null, 2));
    console.log('\n=== TIME LOGS ===\n');
    console.log(JSON.stringify(timelogsQuery.data, null, 2));
    console.log('\n=== VERSIONS ===\n');
    console.log(JSON.stringify(versionsQuery.data, null, 2));
}

export default inspectTask;