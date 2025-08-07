import { debug } from "../utils/debug.ts";
import type { Session } from "@ftrack/api";
import type {
  DownloadTask,
  DownloadResult,
  DownloadProgress,
  DownloadConfig,
  Component,
  AssetVersion,
} from "../types/index.ts";

/**
 * Service for handling file downloads, concurrency, and file system operations
 */
export class MediaDownloadService {
  private readonly maxConcurrentDownloads: number;
  private activeDownloads = new Map<string, DownloadProgress>();
  private session?: Session;
  private authHeaders: Record<string, string> = {};

  constructor(maxConcurrentDownloads: number = 4, session?: Session, authHeaders?: Record<string, string>) {
    this.maxConcurrentDownloads = maxConcurrentDownloads;
    this.session = session;
    if (authHeaders) {
      this.authHeaders = authHeaders;
    }
  }

  /**
   * Make an authenticated request - URLs from session.getComponentUrl are already authenticated
   * @param url - The URL to request (should be from session.getComponentUrl)
   * @param options - Additional fetch options
   * @returns Promise resolving to Response
   */
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    // URLs from session.getComponentUrl already include authentication parameters
    // so we can make a direct fetch request without additional headers
    return fetch(url, options);
  }

  /**
   * Download single file with progress tracking
   * @param url - The download URL
   * @param outputPath - The output directory path
   * @param filename - The filename to save as
   * @returns Promise resolving when download completes
   */
  async downloadFile(url: string, outputPath: string, filename: string): Promise<void> {
    const taskId = `${outputPath}/${filename}`;
    const fullPath = `${outputPath}/${filename}`;

    try {
      debug(`Starting download: ${filename} from ${url}`);

      // Initialize progress tracking
      this.activeDownloads.set(taskId, {
        taskId,
        filename,
        bytesDownloaded: 0,
        totalBytes: 0,
        percentage: 0,
        status: 'pending',
      });

      // Update status to downloading
      this.updateProgress(taskId, { status: 'downloading' });

      // Fetch the file with session-based authentication
      const response = await this.makeAuthenticatedRequest(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      this.updateProgress(taskId, { totalBytes });

      // Ensure output directory exists
      await Deno.mkdir(outputPath, { recursive: true });

      // Create write stream
      const file = await Deno.open(fullPath, { create: true, write: true });
      
      try {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        let bytesDownloaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          await file.write(value);
          bytesDownloaded += value.length;

          // Update progress
          const percentage = totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0;
          this.updateProgress(taskId, {
            bytesDownloaded,
            percentage,
          });

          // Log progress for large files (every 10MB)
          if (bytesDownloaded % (10 * 1024 * 1024) === 0 || done) {
            debug(`Download progress for ${filename}: ${this.formatBytes(bytesDownloaded)}${totalBytes > 0 ? ` / ${this.formatBytes(totalBytes)} (${percentage.toFixed(1)}%)` : ''}`);
          }
        }

        this.updateProgress(taskId, { status: 'completed' });
        debug(`Download completed: ${filename} (${this.formatBytes(bytesDownloaded)})`);

      } finally {
        file.close();
      }

    } catch (error) {
      this.updateProgress(taskId, { status: 'failed' });
      debug(`Download failed for ${filename}: ${error}`);
      throw error;
    } finally {
      // Clean up progress tracking
      this.activeDownloads.delete(taskId);
    }
  }

  /**
   * Download multiple files with concurrency control (max 4)
   * @param downloads - Array of download tasks
   * @returns Promise resolving to array of download results
   */
  async downloadFiles(downloads: DownloadTask[]): Promise<DownloadResult[]> {
    debug(`Starting batch download of ${downloads.length} files with max ${this.maxConcurrentDownloads} concurrent downloads`);

    const results: DownloadResult[] = [];
    const chunks = this.chunkArray(downloads, this.maxConcurrentDownloads);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (task): Promise<DownloadResult> => {
        try {
          await this.downloadFile(task.url, task.outputPath, task.filename);
          
          return {
            task,
            success: true,
            filePath: `${task.outputPath}/${task.filename}`,
            fileSize: await this.getFileSize(`${task.outputPath}/${task.filename}`),
          };
        } catch (error) {
          return {
            task,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      debug(`Completed chunk of ${chunk.length} downloads`);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    debug(`Batch download completed: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Create and validate download directory
   * @param basePath - The base path for downloads
   * @returns Promise resolving to the created directory path
   */
  async prepareDownloadDirectory(basePath: string): Promise<string> {
    try {
      // Create timestamped folder name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const downloadDir = `${basePath}/${timestamp}_ftrackMediaDownload`;

      debug(`Preparing download directory: ${downloadDir}`);

      // Create directory
      await Deno.mkdir(downloadDir, { recursive: true });

      // Verify directory is writable
      const testFile = `${downloadDir}/.write_test`;
      await Deno.writeTextFile(testFile, 'test');
      await Deno.remove(testFile);

      debug(`Download directory ready: ${downloadDir}`);
      return downloadDir;

    } catch (error) {
      debug(`Failed to prepare download directory: ${error}`);
      throw new Error(`Failed to create download directory: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate safe filename from component info
   * @param component - The component
   * @param assetVersion - The asset version
   * @returns Safe filename string
   */
  generateSafeFilename(component: Component, assetVersion: AssetVersion): string {
    const shotName = assetVersion.asset.parent.name;
    const assetName = assetVersion.asset.name;
    const version = `v${assetVersion.version.toString().padStart(3, '0')}`;
    const componentType = this.getComponentTypeForFilename(component);
    
    // Get file extension from component
    const extension = component.file_type ? `.${component.file_type}` : '';
    
    // Create base filename
    const baseFilename = `${shotName}_${assetName}_${version}_${componentType}`;
    
    // Sanitize filename (remove/replace unsafe characters)
    const safeFilename = baseFilename.replace(/[<>:"/\\|?*]/g, '_');
    
    return `${safeFilename}${extension}`;
  }

  /**
   * Get current download progress for all active downloads
   * @returns Array of current download progress
   */
  getActiveDownloads(): DownloadProgress[] {
    return Array.from(this.activeDownloads.values());
  }

  /**
   * Get file size in bytes
   * @param filePath - Path to the file
   * @returns Promise resolving to file size in bytes
   */
  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stat = await Deno.stat(filePath);
      return stat.size;
    } catch {
      return 0;
    }
  }

  /**
   * Update progress for a download task
   * @param taskId - The task ID
   * @param updates - Progress updates to apply
   */
  private updateProgress(taskId: string, updates: Partial<DownloadProgress>): void {
    const current = this.activeDownloads.get(taskId);
    if (current) {
      this.activeDownloads.set(taskId, { ...current, ...updates });
    }
  }

  /**
   * Split array into chunks of specified size
   * @param array - Array to chunk
   * @param chunkSize - Size of each chunk
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Format bytes to human readable string
   * @param bytes - Number of bytes
   * @returns Formatted string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get component type string for filename
   * @param component - The component
   * @returns Component type string for filename
   */
  private getComponentTypeForFilename(component: Component): string {
    const name = component.name.toLowerCase();
    
    if (name === "ftrackreview-mp4-1080") {
      return 'encoded_1080p';
    }
    
    if (name === "ftrackreview-mp4") {
      return 'encoded_720p';
    }
    
    return 'original';
  }
}