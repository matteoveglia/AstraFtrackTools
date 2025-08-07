/**
 * Utility functions for getting system-specific paths
 */

import { debug } from "./debug.ts";

/**
 * Get the user's Downloads directory path for the current platform
 * @returns The path to the user's Downloads directory
 */
export function getDownloadsDirectory(): string {
  const os = Deno.build.os;
  
  try {
    switch (os) {
      case 'windows':
        const userProfile = Deno.env.get('USERPROFILE');
        if (userProfile) {
          return `${userProfile}\\Downloads`;
        }
        break;
        
      case 'darwin': // macOS
        const homeDir = Deno.env.get('HOME');
        if (homeDir) {
          return `${homeDir}/Downloads`;
        }
        break;
        
      case 'linux':
        const linuxHome = Deno.env.get('HOME');
        if (linuxHome) {
          return `${linuxHome}/Downloads`;
        }
        break;
        
      default:
        debug(`Unknown operating system: ${os}, falling back to current directory`);
        break;
    }
  } catch (error) {
    debug(`Error getting Downloads directory: ${error}`);
  }
  
  // Fallback to current directory if we can't determine the Downloads folder
  debug('Falling back to ./downloads directory');
  return './downloads';
}

/**
 * Verify that a directory exists and is writable
 * @param dirPath - The directory path to verify
 * @returns Promise resolving to true if directory is accessible and writable
 */
export async function verifyDirectoryAccess(dirPath: string): Promise<boolean> {
  try {
    // Try to create the directory if it doesn't exist
    await Deno.mkdir(dirPath, { recursive: true });
    
    // Test write access
    const testFile = `${dirPath}/.write_test_${Date.now()}`;
    await Deno.writeTextFile(testFile, 'test');
    await Deno.remove(testFile);
    
    return true;
  } catch (error) {
    debug(`Directory access verification failed for ${dirPath}: ${error}`);
    return false;
  }
}