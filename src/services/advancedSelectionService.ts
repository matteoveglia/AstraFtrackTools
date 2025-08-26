/**
 * Advanced selection service with pagination, filtering, and manual resolution
 * Enhances list-based selections with sophisticated user interaction patterns
 */

import type { Session } from "@ftrack/api";
import { Checkbox, Input, Select } from "@cliffy/prompt";
import chalk from "chalk";
import type { ProjectContextService } from "./projectContext.ts";
import type { QueryService } from "./queries.ts";
import { ListService } from "./listService.ts";
import { WildcardResolver, InteractiveResolver } from "../utils/wildcardResolver.ts";
import { debug } from "../utils/debug.ts";

export interface SelectionItem {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface SelectionOptions {
  pageSize?: number;
  enableSearch?: boolean;
  enableWildcards?: boolean;
  enableFuzzySearch?: boolean;
  allowMultiple?: boolean;
  showMetadata?: boolean;
}

export interface SelectionResult {
  items: SelectionItem[];
  cancelled: boolean;
  searchUsed?: boolean;
  patterns?: string[];
}

/**
 * Advanced selection service with enhanced user interaction
 */
export class AdvancedSelectionService {
  private static readonly DEFAULT_PAGE_SIZE = 20;
  private static readonly DEFAULT_OPTIONS: SelectionOptions = {
    pageSize: this.DEFAULT_PAGE_SIZE,
    enableSearch: true,
    enableWildcards: true,
    enableFuzzySearch: true,
    allowMultiple: true,
    showMetadata: false,
  };

  constructor(
    private session: Session,
    private projectContextService: ProjectContextService,
    private queryService: QueryService,
  ) {}

  /**
   * Enhanced asset version selection with advanced features
   */
  async selectAssetVersions(
    options: SelectionOptions = {},
  ): Promise<SelectionResult> {
    const opts = { ...AdvancedSelectionService.DEFAULT_OPTIONS, ...options };
    
    console.log(chalk.blue("\n🔍 Advanced Asset Version Selection"));
    console.log(chalk.green("Features: Search, Wildcards, Fuzzy Matching, Pagination"));
    
    const selectionMode = await Select.prompt({
      message: "How would you like to select asset versions?",
      options: [
        { name: "🔍 Search with patterns (wildcards, regex)", value: "search" },
        { name: "📋 Browse from lists", value: "lists" },
        { name: "🎯 Direct ID input", value: "direct" },
        { name: "❌ Cancel", value: "cancel" },
      ],
    });

    if (selectionMode === "cancel") {
      return { items: [], cancelled: true };
    }

    switch (selectionMode) {
      case "search":
        return await this.searchBasedSelection(opts);
      case "lists":
        return await this.listBasedSelection(opts);
      case "direct":
        return await this.directIdSelection(opts);
      default:
        return { items: [], cancelled: true };
    }
  }

  /**
   * Search-based selection with advanced pattern matching
   */
  private async searchBasedSelection(
    _options: SelectionOptions,
  ): Promise<SelectionResult> {
    console.log(chalk.blue("\n🔍 Pattern-Based Search"));
    console.log(chalk.yellow("Supported patterns:"));
    console.log("  • Wildcards: SHOT* (prefix), *_v001 (suffix), SH*_v* (multiple)");
    console.log("  • Single char: SH?T_001 (? matches one character)");
    console.log("  • Regex: /^SHOT[0-9]+$/ (advanced patterns)");
    console.log("  • Fuzzy: approximate matching for typos");

    let searchResults: SelectionItem[] = [];
    let searchPatterns: string[] = [];
    let searchUsed = false;

    while (true) {
      const action = await Select.prompt({
        message: searchResults.length > 0 
          ? `Found ${searchResults.length} matches. What would you like to do?`
          : "Choose search action:",
        options: [
          { name: "🔍 Enter search patterns", value: "search" },
          ...(searchResults.length > 0 ? [
            { name: "📋 Review and select from results", value: "select" },
            { name: "🔄 Refine search", value: "refine" },
          ] : []),
          { name: "❌ Cancel", value: "cancel" },
        ],
      });

      if (action === "cancel") {
        return { items: [], cancelled: true };
      }

      if (action === "search" || action === "refine") {
        const patterns = await this.getSearchPatterns();
        if (!patterns || patterns.length === 0) continue;

        searchPatterns = patterns;
        searchUsed = true;
        
        console.log(chalk.blue("Searching asset versions..."));
        searchResults = await this.performPatternSearch(patterns);
        
        if (searchResults.length === 0) {
          console.log(chalk.yellow("No matches found."));
          const suggestions = await this.getSuggestions(patterns);
          if (suggestions.length > 0) {
            console.log(chalk.blue("Suggestions:"));
            suggestions.forEach((s: string) => console.log(`  • ${s}`));
          }
        } else {
          console.log(chalk.green(`Found ${searchResults.length} matches`));
        }
      } else if (action === "select") {
        const selected = await this.paginatedSelection(
          searchResults,
          _options,
          "Select asset versions:",
        );
        return {
          items: selected,
          cancelled: selected.length === 0,
          searchUsed,
          patterns: searchPatterns,
        };
      }
    }
  }

  /**
   * Enhanced list-based selection with filtering
   */
  private async listBasedSelection(
    options: SelectionOptions,
  ): Promise<SelectionResult> {
    const listService = new ListService(this.session, this.projectContextService);
    
    console.log(chalk.blue("Fetching available lists..."));
    const lists = await listService.fetchAssetVersionLists();

    if (lists.length === 0) {
      console.log(chalk.yellow("No lists found in current project scope."));
      return { items: [], cancelled: true };
    }

    // Enhanced list selection with search
    const listItems: SelectionItem[] = lists.map(list => {
      const listRecord = list as Record<string, unknown>;
      const category = listRecord.category as Record<string, unknown> | undefined;
      const project = listRecord.project as Record<string, unknown> | undefined;
      return {
        id: list.id,
        name: list.name || "Unnamed List",
        description: `${category?.name as string || "Uncategorized"} - ${project?.name as string || "No Project"}`,
        metadata: { category: category?.name as string, project: project?.name as string },
      };
    });

    const selectedLists = await this.paginatedSelection(
      listItems,
      { ...options, allowMultiple: false },
      "Select a list:",
    );

    if (selectedLists.length === 0) {
      return { items: [], cancelled: true };
    }

    const selectedList = selectedLists[0];
    console.log(chalk.blue("Extracting asset versions from list..."));
    
    const versionIds = await listService.getAssetVersionIdsFromList(selectedList.id);
    
    if (versionIds.length === 0) {
      console.log(chalk.yellow("No asset versions found in the selected list."));
      return { items: [], cancelled: true };
    }

    // Fetch detailed info for the versions
    const versionItems = await this.fetchAssetVersionDetails(versionIds);
    
    const selected = await this.paginatedSelection(
      versionItems,
      options,
      `Select from ${selectedList.name} (${versionItems.length} versions):`,
    );

    return {
      items: selected,
      cancelled: selected.length === 0,
    };
  }

  /**
   * Direct ID input with validation and suggestions
   */
  private async directIdSelection(
    _options: SelectionOptions,
  ): Promise<SelectionResult> {
    const idsInput = await Input.prompt({
      message: "Enter AssetVersion IDs (comma-separated):",
      validate: (input) => {
        if (!input.trim()) return "Please enter at least one ID";
        const ids = input.split(/[,\s]+/).filter(Boolean);
        if (ids.some(id => !/^[a-f0-9-]{36}$/i.test(id))) {
          return "Invalid ID format. IDs should be UUIDs (e.g., 12345678-1234-1234-1234-123456789abc)";
        }
        return true;
      },
    });

    const ids = idsInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const items = await this.fetchAssetVersionDetails(ids);
    
    if (items.length < ids.length) {
      const foundIds = new Set(items.map(item => item.id));
      const missingIds = ids.filter(id => !foundIds.has(id));
      console.log(chalk.yellow(`Warning: ${missingIds.length} IDs not found: ${missingIds.join(", ")}`));
    }

    return {
      items,
      cancelled: false,
    };
  }

  /**
   * Get search patterns from user with validation
   */
  private async getSearchPatterns(): Promise<string[] | null> {
    const patternsInput = await Input.prompt({
      message: "Enter search patterns (comma-separated):",
      hint: "Examples: SHOT*, *_v001, /^SH[0-9]+/, fuzzy:approximate",
    });

    if (!patternsInput.trim()) return null;

    const patterns = patternsInput.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    
    // Validate regex patterns
    for (const pattern of patterns) {
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        try {
          new RegExp(pattern.slice(1, -1));
        } catch {
          console.log(chalk.yellow(`Warning: Invalid regex pattern: ${pattern}`));
        }
      }
    }

    return patterns;
  }

  /**
   * Perform pattern-based search across asset versions
   */
  private async performPatternSearch(patterns: string[]): Promise<SelectionItem[]> {
    // Build Ftrack query conditions
    const conditions = WildcardResolver.buildFtrackConditions(
      patterns,
      "asset.parent.name", // Search by shot name primarily
    );

    if (conditions.length === 0) return [];

    const whereClause = conditions.join(" or ");
    const result = await this.queryService.queryAssetVersions(whereClause);
    
    if (!result.data || result.data.length === 0) return [];

    // Convert to SelectionItems
    const items: SelectionItem[] = (result.data as Array<Record<string, unknown>>).map((version) => {
      const asset = version.asset as Record<string, unknown> | undefined;
      const parent = asset?.parent as Record<string, unknown> | undefined;
      const shotName = parent?.name as string || "Unknown";
      const assetName = asset?.name as string || "Unknown";
      const versionNum = version.version || "?";
      
      return {
        id: version.id as string,
        name: `${shotName} - ${assetName} v${versionNum}`,
        description: `ID: ${version.id}`,
        metadata: {
          shotName,
          assetName,
          version: versionNum,
          status: (version.status as Record<string, unknown> | undefined)?.name as string,
          user: (version.user as Record<string, unknown> | undefined)?.username as string,
        },
      };
    });

    // Apply regex filtering if needed
    const regexPatterns = patterns.filter(p => p.startsWith('/') && p.endsWith('/'));
    if (regexPatterns.length > 0) {
      return WildcardResolver.filterByRegex(
        items as unknown as Array<Record<string, unknown>>,
        regexPatterns,
        (item) => (item as unknown as SelectionItem).name,
      ) as unknown as SelectionItem[];
    }

    return items;
  }

  /**
   * Paginated selection with search and filtering
   */
  private async paginatedSelection(
    items: SelectionItem[],
    options: SelectionOptions,
    message: string,
  ): Promise<SelectionItem[]> {
    if (items.length === 0) return [];

    const pageSize = options.pageSize || AdvancedSelectionService.DEFAULT_PAGE_SIZE;
    let currentPage = 0;
    let filteredItems = [...items];
    let searchTerm = "";

    while (true) {
      const totalPages = Math.ceil(filteredItems.length / pageSize);
      const startIdx = currentPage * pageSize;
      const endIdx = Math.min(startIdx + pageSize, filteredItems.length);
      const pageItems = filteredItems.slice(startIdx, endIdx);

      const pageInfo = totalPages > 1 
        ? ` (Page ${currentPage + 1}/${totalPages}, ${filteredItems.length} total)`
        : ` (${filteredItems.length} items)`;
      
      const searchInfo = searchTerm ? ` [Filtered: "${searchTerm}"]` : "";

      const choices = [
        ...(options.enableSearch ? [
          { name: "🔍 Search/Filter items", value: "search" },
        ] : []),
        ...(searchTerm ? [
          { name: "🔄 Clear search filter", value: "clear_search" },
        ] : []),
        ...(options.allowMultiple ? [
          { name: "✅ Select all on this page", value: "select_page" },
          { name: "✅ Select all items", value: "select_all" },
        ] : []),
        ...(currentPage > 0 ? [
          { name: "⬅️ Previous page", value: "prev" },
        ] : []),
        ...(currentPage < totalPages - 1 ? [
          { name: "➡️ Next page", value: "next" },
        ] : []),
        { name: "❌ Cancel", value: "cancel" },
      ];

      const itemChoices = pageItems.map(item => ({
        name: options.showMetadata && item.description
          ? `${item.name} - ${item.description}`
          : item.name,
        value: item.id,
      }));

      const selection = options.allowMultiple
        ? await Checkbox.prompt({
            message: `${message}${pageInfo}${searchInfo}`,
            options: [...choices, ...itemChoices],
          }) as string[]
        : [await Select.prompt({
            message: `${message}${pageInfo}${searchInfo}`,
            options: [...choices, ...itemChoices],
          })] as string[];

      // Handle navigation and actions
      if (selection.includes("cancel")) {
        return [];
      }
      
      if (selection.includes("search")) {
        const term = await Input.prompt({
          message: "Enter search term (searches names and descriptions):",
          default: searchTerm,
        });
        searchTerm = term.toLowerCase();
        filteredItems = items.filter(item => 
          item.name.toLowerCase().includes(searchTerm) ||
          (item.description && item.description.toLowerCase().includes(searchTerm))
        );
        currentPage = 0;
        continue;
      }
      
      if (selection.includes("clear_search")) {
        searchTerm = "";
        filteredItems = [...items];
        currentPage = 0;
        continue;
      }
      
      if (selection.includes("prev")) {
        currentPage = Math.max(0, currentPage - 1);
        continue;
      }
      
      if (selection.includes("next")) {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        continue;
      }
      
      if (selection.includes("select_page")) {
        return pageItems;
      }
      
      if (selection.includes("select_all")) {
        return filteredItems;
      }

      // Return selected items
      const selectedIds = selection.filter(id => 
        !['search', 'clear_search', 'prev', 'next', 'select_page', 'select_all', 'cancel'].includes(id)
      );
      
      if (selectedIds.length > 0) {
        return filteredItems.filter(item => selectedIds.includes(item.id));
      }
    }
  }

  /**
   * Fetch detailed asset version information
   */
  private async fetchAssetVersionDetails(versionIds: string[]): Promise<SelectionItem[]> {
    if (versionIds.length === 0) return [];

    try {
      const filter = `id in (${versionIds.map(id => `"${id}"`).join(", ")})`;
      const result = await this.queryService.queryAssetVersions(filter);
      
      if (!result.data) return [];

      return (result.data as Array<Record<string, unknown>>).map((version) => {
        const asset = version.asset as Record<string, unknown> | undefined;
        const parent = asset?.parent as Record<string, unknown> | undefined;
        const shotName = parent?.name as string || "Unknown";
        const assetName = asset?.name as string || "Unknown";
        const versionNum = version.version || "?";
        
        return {
          id: version.id as string,
          name: `${shotName} - ${assetName} v${versionNum}`,
          description: `Status: ${(version.status as Record<string, unknown> | undefined)?.name as string || "Unknown"} | User: ${(version.user as Record<string, unknown> | undefined)?.username as string || "Unknown"}`,
          metadata: {
            shotName,
            assetName,
            version: versionNum,
            status: (version.status as Record<string, unknown> | undefined)?.name as string,
            user: (version.user as Record<string, unknown> | undefined)?.username as string,
            date: version.date,
          },
        };
      });
    } catch (error) {
      debug(`Error fetching asset version details: ${error}`);
      return [];
    }
  }

  /**
   * Get search suggestions based on patterns
   */
  private async getSuggestions(patterns: string[]): Promise<string[]> {
    try {
      // Fetch a sample of asset versions to generate suggestions
      const result = await this.queryService.queryAssetVersions("");
      if (!result.data) return [];

      const candidates = (result.data as Array<Record<string, unknown>>).map((v) => {
        const asset = v.asset as Record<string, unknown> | undefined;
        const parent = asset?.parent as Record<string, unknown> | undefined;
        return parent?.name as string || "";
      }).filter(Boolean);

      const suggestions = new Set<string>();
      for (const pattern of patterns) {
        const patternSuggestions = InteractiveResolver.suggestPatterns(pattern, candidates);
        patternSuggestions.forEach(s => suggestions.add(s));
      }

      return Array.from(suggestions).slice(0, 5);
    } catch {
      return [];
    }
  }
}