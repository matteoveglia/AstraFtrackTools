/**
 * Manages ftrack Lists with comprehensive functionality
 * 
 * This tool allows users to:
 * 1. Create new lists with category selection
 * 2. Delete existing lists with confirmation
 * 3. Add shots to lists (existing functionality)
 * 4. Browse lists with pagination for better performance
 * 
 * Features:
 * - Mode selection for different operations
 * - Lists are visually grouped by their categories with pagination
 * - Shot codes can be comma-separated or one per line
 * - Provides feedback on successful/failed associations
 * - Confirmation prompts for destructive operations
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
import type { ProjectContextService } from '../services/projectContext.ts';

// Constants for pagination
const LISTS_PER_PAGE = 20;

// Operation modes
type OperationMode = 'add_shots' | 'create_list' | 'delete_list';

interface PaginatedListDisplay {
  choices: string[];
  listMap: Record<string, string>;
  hasMore: boolean;
  currentPage: number;
  totalPages: number;
}

export async function manageLists(
  session: Session,
  projectContextService: ProjectContextService
): Promise<void> {
  try {
    debug('Starting manageLists process');

    const projectContext = projectContextService.getContext();
    const contextInfo = projectContext.isGlobal 
      ? "all projects (site-wide)" 
      : `project "${projectContext.project?.name}"`;
    
    console.log(chalk.blue(`\nManaging lists for: ${contextInfo}\n`));

    // Mode selection
    const { mode } = await inquirer.prompt({
      type: 'list',
      name: 'mode',
      message: 'What would you like to do?',
      choices: [
        { name: '📝 Add shots to a list', value: 'add_shots' },
        { name: '➕ Create a new list', value: 'create_list' },
        { name: '🗑️  Delete a list', value: 'delete_list' }
      ]
    });

    switch (mode) {
      case 'add_shots':
        await handleAddShots(session, projectContextService);
        break;
      case 'create_list':
        await handleCreateList(session, projectContextService);
        break;
      case 'delete_list':
        await handleDeleteList(session, projectContextService);
        break;
    }
    
  } catch (error) {
    console.error('Error during list management:', error);
    throw error;
  }
}

/**
 * Fetches and organizes lists by category
 */
async function fetchAndOrganizeLists(
  session: Session, 
  projectContextService: ProjectContextService
): Promise<Record<string, List[]>> {
  // Build project-scoped query for lists
  const listsQuery = projectContextService.buildProjectScopedQuery(`
    select id, name, category.id, category.name, project.name
    from List
    order by category.name, name
  `);

  const listsResponse = await session.query(listsQuery);
  const allLists = (listsResponse.data || []) as List[];
  
  debug(`Found ${allLists.length} total lists`);

  // Group lists by category
  const listsByCategory: Record<string, List[]> = {};
  
  allLists.forEach(list => {
    const categoryName = list.category?.name || 'Uncategorized';
    if (!listsByCategory[categoryName]) {
      listsByCategory[categoryName] = [];
    }
    listsByCategory[categoryName].push(list);
  });

  // Sort lists within each category
  Object.keys(listsByCategory).forEach(categoryName => {
    listsByCategory[categoryName].sort((a, b) => 
      (a.name || '').localeCompare(b.name || '')
    );
  });

  return listsByCategory;
}

/**
 * Displays categories and allows user to select one
 */
async function selectCategory(listsByCategory: Record<string, List[]>): Promise<string | null> {
  const categoryNames = Object.keys(listsByCategory).sort();
  
  if (categoryNames.length === 0) {
    console.log(chalk.yellow('No categories found.'));
    return null;
  }

  const categoryChoices = categoryNames.map(categoryName => {
    const listCount = listsByCategory[categoryName].length;
    return {
      name: `${categoryName} (${listCount} list${listCount !== 1 ? 's' : ''})`,
      value: categoryName
    };
  });

  categoryChoices.push({ name: '❌ Cancel', value: 'CANCEL' });

  const { selectedCategory } = await inquirer.prompt({
    type: 'list',
    name: 'selectedCategory',
    message: 'Select a category to view lists:',
    choices: categoryChoices,
    pageSize: 15
  });

  return selectedCategory === 'CANCEL' ? null : selectedCategory;
}

/**
 * Interface for list selection choices
 */
interface ListSelectionChoice {
  id: string | null;
  name: string | null;
  action: 'select' | 'prev' | 'next' | 'back' | 'cancel';
}

/**
 * Interface for list selection result
 */
interface ListSelectionResult {
  listId: string | null;
  listName: string | null;
  action: 'select' | 'prev' | 'next' | 'back' | 'cancel';
}

/**
 * Displays lists within a category with pagination
 */
async function selectListFromCategory(
  categoryName: string,
  lists: List[],
  page: number = 1
): Promise<ListSelectionResult> {
  const totalPages = Math.ceil(lists.length / LISTS_PER_PAGE);
  const startIndex = (page - 1) * LISTS_PER_PAGE;
  const endIndex = startIndex + LISTS_PER_PAGE;
  const pageItems = lists.slice(startIndex, endIndex);

  const choices: { name: string; value: ListSelectionChoice }[] = pageItems.map(list => {
    const displayName = `${list.name} (${list.project?.name || 'No Project'})`;
    return {
      name: displayName,
      value: { id: list.id, name: list.name || null, action: 'select' as const }
    };
  });

  // Add navigation options
  if (page > 1) {
    choices.push({ name: '⬅️  Previous page', value: { id: null, name: null, action: 'prev' as const } });
  }
  if (page < totalPages) {
    choices.push({ name: '➡️  Next page', value: { id: null, name: null, action: 'next' as const } });
  }
  
  choices.push({ name: '⬅️  Back to categories', value: { id: null, name: null, action: 'back' as const } });
  choices.push({ name: '❌ Cancel', value: { id: null, name: null, action: 'cancel' as const } });

  const pageInfo = totalPages > 1 ? ` (Page ${page}/${totalPages})` : '';

  const { selection } = await inquirer.prompt({
    type: 'list',
    name: 'selection',
    message: `Select a list from "${categoryName}"${pageInfo}:`,
    choices,
    pageSize: 20
  });

  return {
    listId: selection.id,
    listName: selection.name,
    action: selection.action
  };
}

/**
 * Handles adding shots to a list (with category-first navigation)
 */
async function handleAddShots(
  session: Session,
  projectContextService: ProjectContextService
): Promise<void> {
  let selectedListId: string | null = null;
  let selectedListName: string | null = null;

  while (!selectedListId) {
    // First, get all lists organized by category
    const listsByCategory = await fetchAndOrganizeLists(session, projectContextService);
    
    if (Object.keys(listsByCategory).length === 0) {
      console.log(chalk.yellow('No lists found.'));
      return;
    }

    // Let user select a category
    const selectedCategory = await selectCategory(listsByCategory);
    if (!selectedCategory) {
      console.log(chalk.yellow('Operation cancelled.'));
      return;
    }

    // Now navigate within the selected category with pagination
    const categoryLists = listsByCategory[selectedCategory];
    let currentPage = 1;
    let categorySelection = false;

    while (!categorySelection) {
      const result = await selectListFromCategory(selectedCategory, categoryLists, currentPage);
      
      switch (result.action) {
        case 'select':
          selectedListId = result.listId;
          selectedListName = result.listName;
          categorySelection = true;
          break;
        case 'next':
          currentPage++;
          break;
        case 'prev':
          currentPage--;
          break;
        case 'back':
          categorySelection = true; // Go back to category selection
          break;
        case 'cancel':
          console.log(chalk.yellow('Operation cancelled.'));
          return;
      }
    }
  }

  if (!selectedListId || !selectedListName) {
    return; // Should not happen, but safety check
  }

  console.log(chalk.green(`\nSelected list: ${selectedListName}`));
  
  // Continue with shot addition logic
  await addShotsToList(session, projectContextService, selectedListId, selectedListName);
}

/**
 * Handles creating a new list
 */
async function handleCreateList(
  session: Session,
  projectContextService: ProjectContextService
): Promise<void> {
  console.log(chalk.blue('\n📝 Creating a new list\n'));

  // Fetch list categories
  const categoriesResponse = await session.query(`
    select id, name
    from ListCategory
    order by name
  `);

  if (!categoriesResponse.data || categoriesResponse.data.length === 0) {
    console.log(chalk.yellow('No list categories found. Cannot create a list without a category.'));
    return;
  }

  const categories = categoriesResponse.data as ListCategory[];
  
  // Get list name with duplicate checking loop
  let trimmedName: string = '';
  let isNameValid = false;
  
  while (!isNameValid) {
    const { listName } = await inquirer.prompt({
      type: 'input',
      name: 'listName',
      message: 'Enter the name for the new list:',
      validate: (input) => {
        if (!input.trim()) {
          return 'List name cannot be empty';
        }
        if (input.trim().length > 100) {
          return 'List name must be 100 characters or less';
        }
        return true;
      }
    });

    trimmedName = listName.trim();

    // Check if list with same name already exists in current project context
    const existingListQuery = projectContextService.buildProjectScopedQuery(`
      select id, name
      from List
      where name is "${trimmedName}"
    `);
    
    const existingListResponse = await session.query(existingListQuery);
    
    if (existingListResponse.data && existingListResponse.data.length > 0) {
      console.log(chalk.red(`\nA list named "${trimmedName}" already exists in the current context.`));
      
      const { action } = await inquirer.prompt({
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '✏️  Enter a different name', value: 'retry' },
          { name: '❌ Cancel list creation', value: 'cancel' }
        ]
      });

      if (action === 'cancel') {
        console.log(chalk.yellow('List creation cancelled.'));
        return;
      }
      // If 'retry', continue the loop to ask for a new name
    } else {
      isNameValid = true; // Name is unique, exit the loop
    }
  }

  // Select category
  const categoryChoices = categories.map(cat => ({
    name: cat.name || 'Unnamed Category',
    value: cat.id
  }));

  const { categoryId } = await inquirer.prompt({
    type: 'list',
    name: 'categoryId',
    message: 'Select a category for the new list:',
    choices: categoryChoices,
    pageSize: 15
  });

  // Get project ID for the list
  const projectContext = projectContextService.getContext();
  let projectId: string | undefined;
  
  if (!projectContext.isGlobal && projectContext.project) {
    projectId = projectContext.project.id;
  } else {
    // For global context, we need to ask which project
    const projectsResponse = await session.query(`
      select id, name, full_name
      from Project
      where status is "Active"
      order by name
    `);
    
    if (!projectsResponse.data || projectsResponse.data.length === 0) {
      console.log(chalk.red('No active projects found.'));
      return;
    }

    const projectChoices = (projectsResponse.data as { id: string; name: string; full_name: string }[]).map((project) => ({
      name: `${project.name} (${project.full_name})`,
      value: project.id
    }));

    const { selectedProjectId } = await inquirer.prompt({
      type: 'list',
      name: 'selectedProjectId',
      message: 'Select a project for the new list:',
      choices: projectChoices,
      pageSize: 15
    });

    projectId = selectedProjectId;
  }

  if (!projectId) {
    console.log(chalk.red('No project selected. Cannot create list.'));
    return;
  }

  // Confirm creation
  const selectedCategory = categories.find(cat => cat.id === categoryId);
  const { confirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'confirm',
    message: `Create list "${trimmedName}" in category "${selectedCategory?.name}"?`,
    default: true
  });

  if (!confirm) {
    console.log(chalk.yellow('List creation cancelled.'));
    return;
  }

  // Create the list
  try {
    const createOperation = {
      action: 'create',
      entity_type: 'List',
      entity_data: {
        name: trimmedName,
        category_id: categoryId,
        project_id: projectId,
        is_open: true
      }
    };

    debug(`Creating list with data: ${JSON.stringify(createOperation)}`);
    const result = await session.call([createOperation]);
    debug(`Create list result: ${JSON.stringify(result)}`);

    console.log(chalk.green(`\n✅ Successfully created list "${trimmedName}" in category "${selectedCategory?.name}"`));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Failed to create list:'), error);
    throw error;
  }
}

/**
 * Handles deleting a list (with category-first navigation)
 */
async function handleDeleteList(
  session: Session,
  projectContextService: ProjectContextService
): Promise<void> {
  console.log(chalk.red('\n🗑️  Deleting a list\n'));
  console.log(chalk.yellow('⚠️  Warning: This action cannot be undone!\n'));

  let selectedListId: string | null = null;
  let selectedListName: string | null = null;

  while (!selectedListId) {
    // First, get all lists organized by category
    const listsByCategory = await fetchAndOrganizeLists(session, projectContextService);
    
    if (Object.keys(listsByCategory).length === 0) {
      console.log(chalk.yellow('No lists found.'));
      return;
    }

    // Let user select a category
    const selectedCategory = await selectCategory(listsByCategory);
    if (!selectedCategory) {
      console.log(chalk.yellow('Operation cancelled.'));
      return;
    }

    // Now navigate within the selected category with pagination
    const categoryLists = listsByCategory[selectedCategory];
    let currentPage = 1;
    let categorySelection = false;

    while (!categorySelection) {
      const result = await selectListFromCategory(selectedCategory, categoryLists, currentPage);
      
      switch (result.action) {
        case 'select':
          selectedListId = result.listId;
          selectedListName = result.listName;
          categorySelection = true;
          break;
        case 'next':
          currentPage++;
          break;
        case 'prev':
          currentPage--;
          break;
        case 'back':
          categorySelection = true; // Go back to category selection
          break;
        case 'cancel':
          console.log(chalk.yellow('Operation cancelled.'));
          return;
      }
    }
  }

  if (!selectedListId || !selectedListName) {
    return; // Should not happen, but safety check
  }

  // Get list details and count of items
  const listDetailsResponse = await session.query(`
    select id, name, category.name
    from List
    where id is "${selectedListId}"
  `);

  const listObjectsResponse = await session.query(`
    select id
    from ListObject
    where list_id is "${selectedListId}"
  `);

  const listDetails = listDetailsResponse.data?.[0] as List;
  const itemCount = listObjectsResponse.data?.length || 0;

  console.log(chalk.red(`\n⚠️  You are about to delete:`));
  console.log(`   List: ${listDetails?.name || selectedListName}`);
  console.log(`   Category: ${listDetails?.category?.name || 'Unknown'}`);
  console.log(`   Items in list: ${itemCount}`);
  console.log(chalk.red('\n   This will permanently delete the list and all its associations!'));

  // Double confirmation
  await inquirer.prompt({
    type: 'input',
    name: 'confirmName',
    message: `Type the list name "${selectedListName}" to confirm deletion:`,
    validate: (input) => {
      if (input.trim() !== selectedListName) {
        return `You must type "${selectedListName}" exactly to confirm`;
      }
      return true;
    }
  });

  const { finalConfirm } = await inquirer.prompt({
    type: 'confirm',
    name: 'finalConfirm',
    message: chalk.red('Are you absolutely sure you want to delete this list?'),
    default: false
  });

  if (!finalConfirm) {
    console.log(chalk.yellow('List deletion cancelled.'));
    return;
  }

  // Delete the list (this will cascade delete ListObjects)
  try {
    const deleteOperation = {
      action: 'delete',
      entity_type: 'List',
      entity_key: selectedListId
    };

    debug(`Deleting list with operation: ${JSON.stringify(deleteOperation)}`);
    const result = await session.call([deleteOperation]);
    debug(`Delete list result: ${JSON.stringify(result)}`);

    console.log(chalk.green(`\n✅ Successfully deleted list "${selectedListName}"`));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Failed to delete list:'), error);
    throw error;
  }
}

/**
 * Adds shots to a selected list with mode selection
 */
async function addShotsToList(
  session: Session,
  projectContextService: ProjectContextService,
  listId: string,
  listName: string
): Promise<void> {
  // Ask user for input mode
  const { inputMode } = await inquirer.prompt({
    type: 'list',
    name: 'inputMode',
    message: 'How would you like to input shot codes?',
    choices: [
      { name: '📝 Terminal input (comma-separated)', value: 'terminal' },
      { name: '📄 Editor (paste list)', value: 'editor' },
      { name: '❌ Cancel', value: 'cancel' }
    ]
  });

  if (inputMode === 'cancel') {
    console.log(chalk.yellow('Operation cancelled.'));
    return;
  }

  let shotCodes: string;

  if (inputMode === 'terminal') {
    // Terminal mode - direct input
    const { terminalInput } = await inquirer.prompt({
      type: 'input',
      name: 'terminalInput',
      message: 'Enter shot codes (comma-separated, e.g., SHOT001, SHOT002, SHOT003):',
      validate: (input) => {
        if (!input.trim()) {
          return 'Please enter at least one shot code';
        }
        return true;
      }
    });
    shotCodes = terminalInput;
  } else {
    // Editor mode - existing functionality
    const { editorInput } = await inquirer.prompt({
      type: 'editor',
      name: 'editorInput',
      message: 'Enter shot codes (comma separated or one per line):\nIf this opens Vim, just paste, then type :wq and press Enter\n',
      default: '',
      validate: (input) => {
        if (!input.trim()) {
          return 'Please enter at least one shot code, press Enter to open editor';
        }
        return true;
      }
    });
    shotCodes = editorInput;
  }

  // Parse shot codes from input (handles comma-separated or line-by-line)
  const parsedCodes = shotCodes
    .replace(/\r\n/g, '\n')
    .split(/[\n,]/)
    .map((code: string) => code.trim())
    .filter((code: string) => code.length > 0);
  
  if (parsedCodes.length === 0) {
    console.log(chalk.yellow('No valid shot codes provided.'));
    return;
  }

  debug(`Parsed ${parsedCodes.length} shot codes: ${parsedCodes.join(', ')}`);

  // Query shots that match the provided codes using project scoping
  const shotQuery = projectContextService.buildProjectScopedQuery(`
    select id, name, parent.name
    from Shot
    where name in (${parsedCodes.map((code: string) => `"${code}"`).join(',')})
  `);
  
  const shotsResponse = await session.query(shotQuery);
  const foundShots = (shotsResponse.data || []) as Shot[];
  
  // Compare found shots against requested codes
  const foundShotNames = foundShots.map(shot => shot.name);
  const notFoundCodes = parsedCodes.filter((code: string) => !foundShotNames.includes(code));
  
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
    where list_id is "${listId}"
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

  // Confirm with user
  const { action } = await inquirer.prompt({
    type: 'list',
    name: 'action',
    message: `Add ${shotsToAdd.length} shots to list "${listName}"?`,
    choices: [
      { name: 'Yes - Add these shots', value: 'yes' },
      { name: 'No - Cancel operation', value: 'no' },
      { name: 'Change/Revise - Modify shot selection', value: 'change' }
    ],
    default: 'yes'
  });

  if (action === 'no') {
    console.log(chalk.yellow('\nOperation cancelled.'));
    return;
  }

  if (action === 'change') {
    console.log(chalk.blue('\nRestarting shot input...'));
    // Recursively call the function to restart the process
    return addShotsToList(session, projectContextService, listId, listName);
  }

  // Create list objects to link shots to the list
  const operations = shotsToAdd.map(shot => ({
    action: 'create',
    entity_type: 'ListObject',
    entity_data: {
      list_id: listId,
      entity_id: shot.id
    }
  }));

  debug(`Creating ${operations.length} links to list ${listId}`);
  const result = await session.call(operations);
  debug(`Create operation result: ${JSON.stringify(result)}`);

  console.log(chalk.green(`\nSuccessfully added ${shotsToAdd.length} shots to list "${listName}"`));
}