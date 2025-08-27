/**
 * Type definitions for media download functionality
 */

// Core Ftrack entity interfaces for media download
export interface Component {
  id: string;
  name: string;
  file_type: string;
  size: number;
  component_locations: ComponentLocation[];
}

export interface ComponentLocation {
  location: Location;
  resource_identifier: string;
}

export interface Location {
  id: string;
  name: string;
}

export interface AssetVersion {
  id: string;
  version: number;
  asset: Asset;
  components: Component[];
  status?: { id: string; name: string };
  user?: { id: string; username: string };
  date?: string;
  custom_attributes?: Record<string, unknown>;
}

export interface Asset {
  id: string;
  name: string;
  parent: Shot;
  type: AssetType;
}

export interface AssetType {
  id: string;
  name: string;
}

export interface Shot {
  id: string;
  name: string;
  parent?: Sequence;
}

export interface Sequence {
  id: string;
  name: string;
}

// Download operation types
export interface DownloadTask {
  component: Component;
  assetVersion: AssetVersion;
  url: string;
  outputPath: string;
  filename: string;
}

export interface DownloadResult {
  task: DownloadTask;
  success: boolean;
  error?: string;
  filePath?: string;
  fileSize?: number;
}

// Configuration types
export type MediaPreference = "original" | "encoded";
export type DownloadMode = "single" | "multiple";
export type ComponentType =
  | "original"
  | "encoded-1080p"
  | "encoded-720p"
  | "image"
  | "other";

// Download progress tracking
export interface DownloadProgress {
  taskId: string;
  filename: string;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  status: "pending" | "downloading" | "completed" | "failed";
}

// Service configuration
export interface DownloadConfig {
  maxConcurrentDownloads: number;
  outputDirectory: string;
  mediaPreference: MediaPreference;
  createTimestampedFolder: boolean;
}

// Error types
export class ComponentNotFoundError extends Error {
  constructor(assetVersionId: string) {
    super(`No components found for asset version: ${assetVersionId}`);
    this.name = "ComponentNotFoundError";
  }
}

export class DownloadUrlNotFoundError extends Error {
  constructor(componentId: string) {
    super(`No download URL available for component: ${componentId}`);
    this.name = "DownloadUrlNotFoundError";
  }
}

export class InvalidAssetVersionError extends Error {
  constructor(assetVersionId: string) {
    super(`Invalid or non-existent asset version: ${assetVersionId}`);
    this.name = "InvalidAssetVersionError";
  }
}
