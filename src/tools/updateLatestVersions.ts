/**
 * Updates all shots with the latest delivered version.
 * 
 * This function:
 * 
 * 1. Gets the custom attribute configuration for latestVersionSent.
 * 2. Queries all shots and their current links.
 * 3. Queries all versions linked to these shots.
 * 4. Filters for delivered versions.
 * 5. Sorts by date descending.
 * 6. Updates the latestVersionSent link for each shot if necessary.
 * 7. Prompts for confirmation.
 * 8. Performs the updates.
 */

import { Session } from '@ftrack/api';
import { createInterface } from 'readline';
import type { 
  Shot, 
  AssetVersion,
  TypedCustomAttributeValue,
  TypedContextCustomAttributesMap,
  ContextCustomAttributeValue
} from '../schemas/schema.js';
import { AssetVersionCustomAttributes, isDeliveredAttribute } from '../types/index.js';
import { debug } from '../utils/debug.js';

interface ProposedChange {
  shotName: string;
  shotId: string;
  currentVersion: string;
  newVersion: string;
  versionId: string;
  date: string;
  parentName: string;
  currentLinkId?: string;
  dateSent: string | null;
  dateAttributeConfig?: {
    configuration_id: string;
    key: string;
    entity_id: string;
  };
}

export async function updateLatestVersionsSent(session: Session): Promise<void> {
  try {
    debug('Starting updateLatestVersionsSent process');
    // Get both custom attribute configurations
    const configResponse = await session.query(`
      select id, key
      from CustomAttributeLinkConfiguration
      where key is "latestVersionSent"
      and entity_type is "task"
    `);

    const dateConfigResponse = await session.query(`
      select id, key
      from CustomAttributeConfiguration
      where key is "latestVersionSentDate"
      and object_type_id in (select id from ObjectType where name is "Shot")
    `);

    if (!configResponse.data || configResponse.data.length === 0) {
      throw new Error('Could not find latestVersionSent configuration');
    }

    if (!dateConfigResponse.data || dateConfigResponse.data.length === 0) {
      throw new Error('Could not find latestVersionSentDate configuration');
    }

    const configId = configResponse.data[0].id;
    const dateConfigId = dateConfigResponse.data[0].id;
    debug(`Found configuration ID: ${configId}`);
    debug(`Found date configuration ID: ${dateConfigId}`);

    // Get all shots and their current links
    const shotsResponse = await session.query(`
      select id, name, parent.name
      from Shot
    `);

    debug(`Found ${shotsResponse.data.length} shots to process`);

    // Update query to include versions linked through asset.parent
    debug('Querying versions for all shots');
    const versionsResponse = await session.query(`
      select 
        id,
        version,
        asset.name,
        asset.parent.id,
        date,
        custom_attributes,
        is_published,
        task.parent.id
      from AssetVersion
      where (task.parent.id in (${shotsResponse.data.map(shot => `'${shot.id}'`).join(',')})
      or asset.parent.id in (${shotsResponse.data.map(shot => `'${shot.id}'`).join(',')}))
    `);

    // Process each shot
    const proposedChanges: ProposedChange[] = [];

    for (const shot of shotsResponse.data as Shot[]) {
      debug(`Processing shot: ${shot.name}`);
      // Get current link for this shot
      const currentLinkResponse = await session.query(`
        select to_id
        from CustomAttributeLink
        where configuration.key is "latestVersionSent"
        and from_id is "${shot.id}"
      `);

      const currentVersionId = currentLinkResponse.data[0]?.to_id;
      debug(`Current version ID for ${shot.name}: ${currentVersionId || 'None'}`);

      // Get all versions for this shot (through task or asset parent)
      const shotVersions = (versionsResponse.data as AssetVersion[]).filter(version =>
        (version.task?.parent?.id === shot.id) || (version.asset?.parent?.id === shot.id)
      );

      // Filter for delivered versions
      const deliveredVersions = shotVersions.filter(version => {
        if (!version.custom_attributes) return false;
        const deliveredAttr = (version.custom_attributes as ContextCustomAttributeValue[])
          .find(isDeliveredAttribute);
        return version.is_published && deliveredAttr?.value === true;
      });

      debug(`Found ${deliveredVersions.length} delivered versions for ${shot.name}`);

      // Sort by date descending
      const sortedVersions = deliveredVersions.sort((a, b) =>
        new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );

      if (sortedVersions.length > 0) {
        const latestVersion = sortedVersions[0];
        
        // Get the date from the version
        const dateSent = latestVersion.date ? new Date(latestVersion.date).toISOString() : null;

        // Get current version details
        let currentVersionName = 'None';
        if (currentVersionId) {
          const currentVersion = deliveredVersions.find(v => v.id === currentVersionId);
          if (currentVersion?.asset?.name && currentVersion.version) {
            currentVersionName = `${currentVersion.asset.name}_v${currentVersion.version.toString().padStart(3, '0')}`;
          }
        }

        if (latestVersion.asset?.name && latestVersion.version) {
          const newVersionName = `${latestVersion.asset.name}_v${latestVersion.version.toString().padStart(3, '0')}`;
          // Only update if different
          if (currentVersionId !== latestVersion.id) {
            debug(`Found newer version for ${shot.name}: ${newVersionName}`);
            proposedChanges.push({
              shotName: shot.name,
              shotId: shot.id,
              currentVersion: currentVersionName,
              newVersion: newVersionName,
              versionId: latestVersion.id,
              date: latestVersion.date ? new Date(latestVersion.date).toLocaleDateString() : 'No date',
              parentName: shot.parent?.name || 'No Parent',
              currentLinkId: currentLinkResponse.data[0]?.id,
              dateSent,
              dateAttributeConfig: {
                configuration_id: dateConfigId,
                key: 'latestVersionSentDate',
                entity_id: shot.id
              }
            });
          }
        }
      } else {
        console.log(`No delivered versions found for shot: ${shot.name} (${shot.parent?.name || 'No Parent'})`);
      }
    }

    // Preview changes
    if (proposedChanges.length === 0) {
      console.log('No updates needed - all shots are up to date.');
      return;
    }

    console.log('\nProposed Changes:');
    console.log('=================');
    proposedChanges.forEach(change => {
      console.log(`\nShot: ${change.shotName} (${change.parentName})`);
      console.log(`Current Latest Version: ${change.currentVersion}`);
      console.log(`New Latest Version: ${change.newVersion}`);
      console.log(`Version Date: ${change.date}`);
    });

    // Prompt for confirmation
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>(resolve => {
      rl.question('\nWould you like to proceed with these changes?\n(Type "all" for all changes, "yes" for one at a time, or "no" to cancel)\n> ', resolve);
    });

    const lowerAnswer = answer.toLowerCase();
    if (lowerAnswer === 'no') {
      rl.close();
      console.log('Update cancelled.');
      return;
    }

    if (lowerAnswer === 'all') {
      // Perform all updates at once
      for await (const change of proposedChanges) {
        try {
          debug(`Processing update for ${change.shotName}`);
          debug(`Shot ID: ${change.shotId}`);
          debug(`Version ID: ${change.versionId}`);
          debug(`Config ID: ${configId}`);

          if (change.currentLinkId) {
            debug(`Updating existing link: ${change.currentLinkId}`);
            await session.update('CustomAttributeLink', [change.currentLinkId], {
              to_id: change.versionId
            });
          } else {
            debug('Creating new link');
            const linkData = {
              configuration_id: configId,
              from_id: change.shotId,
              to_id: change.versionId,
              to_entity_type: 'AssetVersion'
            };
            debug(`Link data: ${JSON.stringify(linkData, null, 2)}`);

            // Try direct operation first
            try {
              const operation = {
                action: 'create',
                entity_type: 'CustomAttributeLink',
                entity_data: linkData
              };

              debug('Sending direct operation');
              await session.call([operation]);
            } catch (directError) {
              debug('Direct operation failed, trying alternative method');
              await session.create('AssetVersionCustomAttributeLink', [linkData]);
            }
          }

          // Update date if available
          if (change.dateSent && change.dateAttributeConfig) {
            await session.update(
              'ContextCustomAttributeValue',
              [change.dateAttributeConfig.configuration_id, change.dateAttributeConfig.entity_id],
              {
                value: change.dateSent,
                key: change.dateAttributeConfig.key,
                entity_id: change.dateAttributeConfig.entity_id,
                configuration_id: change.dateAttributeConfig.configuration_id
              }
            );
          }

          console.log(`Updated ${change.shotName}: ${change.currentVersion} → ${change.newVersion} (Date: ${change.dateSent || 'Not set'})`);
        } catch (error) {
          console.error(`Failed to update shot ${change.shotName}:`, error);
        }
      }
      console.log('\nAll updates completed successfully!');
    } else if (lowerAnswer === 'yes') {
      // Process one at a time
      for await (const change of proposedChanges) {
        const confirmThis = await new Promise<string>(resolve => {
          rl.question(`\nUpdate ${change.shotName} (${change.parentName})?\nCurrent: ${change.currentVersion}\nNew: ${change.newVersion}\nDate: ${change.date}\n(yes/no/quit) > `, resolve);
        });

        if (confirmThis.toLowerCase() === 'quit') {
          console.log('Updates stopped by user.');
          break;
        }

        if (confirmThis.toLowerCase() === 'yes') {
          try {
            debug(`Processing individual update for ${change.shotName}`);
            debug(`Shot ID: ${change.shotId}`);
            debug(`Version ID: ${change.versionId}`);
            debug(`Config ID: ${configId}`);

            if (change.currentLinkId) {
              debug(`Updating existing link: ${change.currentLinkId}`);
              await session.update('CustomAttributeLink', [change.currentLinkId], {
                to_id: change.versionId
              });
            } else {
              debug('Creating new link');
              const linkData = {
                configuration_id: configId,
                from_id: change.shotId,
                to_id: change.versionId,
                to_entity_type: 'AssetVersion'
              };
              debug(`Link data: ${JSON.stringify(linkData, null, 2)}`);

              // Try direct operation first
              try {
                const operation = {
                  action: 'create',
                  entity_type: 'CustomAttributeLink',
                  entity_data: linkData
                };

                debug('Sending direct operation');
                await session.call([operation]);
              } catch (directError) {
                debug('Direct operation failed, trying alternative method');
                await session.create('AssetVersionCustomAttributeLink', [linkData]);
              }
            }

            // Update date if available
            if (change.dateSent && change.dateAttributeConfig) {
              await session.update(
                'ContextCustomAttributeValue',
                [change.dateAttributeConfig.configuration_id, change.dateAttributeConfig.entity_id],
                {
                  value: change.dateSent,
                  key: change.dateAttributeConfig.key,
                  entity_id: change.dateAttributeConfig.entity_id,
                  configuration_id: change.dateAttributeConfig.configuration_id
                }
              );
            }

            console.log(`Updated ${change.shotName}: ${change.currentVersion} → ${change.newVersion} (Date: ${change.dateSent || 'Not set'})`);
          } catch (error) {
            console.error(`Failed to update shot ${change.shotName}:`, error);
            const continueAfterError = await new Promise<string>(resolve => {
              rl.question('Continue with remaining updates? (yes/no) > ', resolve);
            });
            if (continueAfterError.toLowerCase() !== 'yes') {
              break;
            }
          }
        } else {
          debug(`Skipped update for ${change.shotName}`);
          console.log(`Skipped ${change.shotName}`);
        }
      }
      console.log('\nFinished processing all selected updates.');
    }

    rl.close();

  } catch (error) {
    console.error('Error during processing:', error);
    throw error;
  }
}
