/**
 * Manages ftrack Lists and adds shots to them
 * 
 * This tool allows users to:
 * 1. View and select from all available Lists, grouped by ListCategory
 * 2. Paste in a list of shot codes (e.g., AKE0120) in various formats
 * 3. Link the corresponding Shots to the selected List
 * 
 * Features:
 * - Lists are visually grouped by their categories
 * - Shot codes can be comma-separated or one per line
 * - Provides feedback on successful/failed associations
 */

import { Session } from '@ftrack/api';
import inquirer from 'inquirer';
import chalk from 'chalk';
import type { 
  List,
  ListCategory,
  Shot,
  ListObject
} from '../schemas/schema.ts';
import { debug } from '../utils/debug.ts';

export async function manageLists(session: Session): Promise<void> {
  try {
    debug('Starting manageLists process');

    // Fetch all list categories
    const categoriesResponse = await session.query(`
      select id, name
      from ListCategory
    `);

    if (!categoriesResponse.data || categoriesResponse.data.length === 0) {
      console.log(chalk.yellow('No list categories found.'));
      return;
    }

    const categories = categoriesResponse.data as ListCategory[];
    debug(`Found ${categories.length} list categories`);

    // Fetch all lists with their categories
    const listsResponse = await session.query(`
      select id, name, category.id, category.name, project.name
      from List
    `);

    if (!listsResponse.data || listsResponse.data.length === 0) {
      console.log(chalk.yellow('No lists found.'));
      return;
    }

    const lists = listsResponse.data as List[];
    debug(`Found ${lists.length} lists`);

    // Create a mapping from display name to list ID for lookup after selection
    const listMap: Record<string, string> = {};
    
    // Group lists by category for display
    const listsByCategory: Record<string, {name: string, displayName: string}[]> = {};
    
    lists.forEach(list => {
      const categoryName = chalk.blue(list.category?.name || 'Uncategorized');
      const displayName = `${list.name} (${list.project?.name || 'No Project'})`;
      
      if (!listsByCategory[categoryName]) {
        listsByCategory[categoryName] = [];
      }
      
      listsByCategory[categoryName].push({
        name: list.name || '',
        displayName
      });
      
      // Store mapping from display name to ID
      listMap[displayName] = list.id;
    });
    
    // Create a sorted array of categories
    const categoryNames = Object.keys(listsByCategory).sort();
    
    // Create flat array of choices with category headers
    const choices: string[] = [];
    
    categoryNames.forEach(categoryName => {
      // Add category header
      choices.push(`-- ${categoryName} --`);
      
      // Add list items for this category, sorted by name
      listsByCategory[categoryName]
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(list => {
          choices.push(list.displayName);
        });
    });

    // No need to apply inquirer fix before each prompt - done at app startup
    
    // Prompt user to select a list
    const { selectedList } = await inquirer.prompt({
      type: 'list',
      name: 'selectedList',
      message: 'Select a list to add shots to:',
      pageSize: 30,
      choices
    });
    
    // Skip category headers if selected
    if (selectedList.startsWith('-- ') && selectedList.endsWith(' --')) {
      console.log(chalk.yellow('Please select a list, not a category header.'));
      return;
    }
    
    // Get the ID from our mapping
    const selectedListId = listMap[selectedList];
    if (!selectedListId) {
      console.log(chalk.red('Error: Could not find the selected list ID.'));
      return;
    }
    
    const selectedListName = selectedList.split(' (')[0]; // Extract name for display
    
    console.log(chalk.green(`\nSelected list: ${selectedListName}`));
    
    // No need to apply inquirer fix before shot codes prompt
    
    // Prompt for shot codes
    const { shotCodes } = await inquirer.prompt({
      type: 'editor',
      name: 'shotCodes',
      message: 'Enter shot codes (comma separated or one per line):',
      default: '',
      validate: (input) => {
        if (!input.trim()) {
          return 'Please enter at least one shot code';
        }
        return true;
      }
    });

    // Parse shot codes from input (handles comma-separated or line-by-line)
    const parsedCodes = shotCodes
      .replace(/\r\n/g, '\n')
      .split(/[\n,]/)
      .map(code => code.trim())
      .filter(code => code.length > 0);
    
    if (parsedCodes.length === 0) {
      console.log(chalk.yellow('No valid shot codes provided.'));
      return;
    }

    debug(`Parsed ${parsedCodes.length} shot codes: ${parsedCodes.join(', ')}`);

    // Query shots that match the provided codes
    const shotQuery = `
      select id, name, parent.name
      from Shot
      where name in (${parsedCodes.map(code => `"${code}"`).join(',')})
    `;
    
    const shotsResponse = await session.query(shotQuery);
    const foundShots = (shotsResponse.data || []) as Shot[];
    
    // Compare found shots against requested codes
    const foundShotNames = foundShots.map(shot => shot.name);
    const notFoundCodes = parsedCodes.filter(code => !foundShotNames.includes(code));
    
    if (notFoundCodes.length > 0) {
      console.log(chalk.yellow(`\nWarning: The following shot codes were not found:`));
      console.log(notFoundCodes.join(', '));
    }

    if (foundShots.length === 0) {
      console.log(chalk.red('\nNo matching shots found. Please check the shot codes and try again.'));
      return;
    }

    console.log(chalk.green(`\nFound ${foundShots.length} matching shots:`));
    foundShots.forEach(shot => {
      console.log(`- ${shot.name} (${shot.parent?.name || 'No Parent'})`);
    });

    // Check if shots are already in the list
    const existingLinksResponse = await session.query(`
      select entity_id
      from ListObject
      where list_id is "${selectedListId}"
    `);
    
    const existingLinks = (existingLinksResponse.data || []) as ListObject[];
    const existingEntityIds = existingLinks.map(link => link.entity_id);
    
    // Filter out shots that are already in the list
    const shotsToAdd = foundShots.filter(shot => !existingEntityIds.includes(shot.id));
    const alreadyLinkedShots = foundShots.filter(shot => existingEntityIds.includes(shot.id));
    
    if (alreadyLinkedShots.length > 0) {
      console.log(chalk.yellow(`\nThe following shots are already in the list:`));
      alreadyLinkedShots.forEach(shot => {
        console.log(`- ${shot.name}`);
      });
    }

    if (shotsToAdd.length === 0) {
      console.log(chalk.yellow('\nAll found shots are already in the list. No changes needed.'));
      return;
    }

    // No need to apply inquirer fix before confirmation prompt
    
    // Confirm with user
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: `Add ${shotsToAdd.length} shots to list "${selectedListName}"?`,
      default: true
    });

    if (!confirm) {
      console.log(chalk.yellow('\nOperation cancelled.'));
      return;
    }

    // Create list objects to link shots to the list
    const operations = shotsToAdd.map(shot => ({
      action: 'create',
      entity_type: 'ListObject',
      entity_data: {
        list_id: selectedListId,
        entity_id: shot.id
      }
    }));

    debug(`Creating ${operations.length} links to list ${selectedListId}`);
    const result = await session.call(operations);
    debug(`Create operation result: ${JSON.stringify(result)}`);

    console.log(chalk.green(`\nSuccessfully added ${shotsToAdd.length} shots to list "${selectedListName}"`));
    
  } catch (error) {
    console.error('Error during list management:', error);
    throw error;
  }
} 