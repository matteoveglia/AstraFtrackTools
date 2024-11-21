import { Session } from '@ftrack/api';
import inquirer from 'inquirer';
import { debug } from '../utils/debug.js';

export async function propagateThumbnails(session: Session, shotId?: string) {
    // If no shotId provided, prompt user for input
    if (!shotId) {
        debug('No shot ID provided, prompting user for input');
        const answer = await inquirer.prompt({
            type: 'input',
            name: 'shotId',
            message: 'Enter Shot ID (leave empty to process all shots):',
        });
        shotId = answer.shotId;
    }

    try {
        // Get shots to process
        const shotsQuery = shotId 
            ? `select id, name from Shot where id is "${shotId}"`
            : 'select id, name from Shot';
        
        const shotsResponse = await session.query(shotsQuery);
        const shots = shotsResponse.data;
        
        debug(`Found ${shots.length} shots to process`);

        for (const shot of shots) {
            debug(`Processing shot: ${shot.name}`);
            
            // Get latest version with thumbnail for this shot
            const versionsResponse = await session.query(`
                select 
                    id,
                    version,
                    thumbnail_id,
                    asset.name
                from AssetVersion 
                where (components any (version.asset.parent.id is "${shot.id}"))
                and thumbnail_id != null
                order by version desc
                limit 1
            `);

            if (versionsResponse.data.length > 0) {
                const latestVersion = versionsResponse.data[0];
                if (latestVersion.thumbnail_id) {
                    debug(`Updating thumbnail for shot ${shot.name} from version ${latestVersion.version}`);
                    await session.update('Shot', [shot.id], {
                        thumbnail_id: latestVersion.thumbnail_id
                    });
                    console.log(`Updated thumbnail for shot: ${shot.name}`);
                }
            } else {
                console.log(`No versions with thumbnails found for shot: ${shot.name}`);
            }
        }

        console.log('Thumbnail propagation complete');

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error while propagating thumbnails:', errorMessage);
        throw error;
    }
}