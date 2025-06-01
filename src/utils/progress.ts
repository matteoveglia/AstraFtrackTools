/**
 * Progress tracking utility for consistent progress reporting across tools
 */

export interface ProgressTracker {
  current: number;
  total: number;
  startTime: number;
  lastUpdate: number;
}

/**
 * Create a new progress tracker
 */
export function createProgressTracker(total: number): ProgressTracker {
  return {
    current: 0,
    total,
    startTime: Date.now(),
    lastUpdate: Date.now(),
  };
}

/**
 * Format progress as "001/100" style
 */
export function formatProgress(current: number, total: number): string {
  const digits = total.toString().length;
  return `${current.toString().padStart(digits, '0')}/${total.toString().padStart(digits, '0')}`;
}

/**
 * Calculate estimated time remaining
 */
export function getETA(tracker: ProgressTracker): string {
  if (tracker.current === 0) return 'calculating...';
  
  const elapsed = Date.now() - tracker.startTime;
  const rate = tracker.current / elapsed; // items per millisecond
  const remaining = tracker.total - tracker.current;
  const etaMs = remaining / rate;
  
  if (etaMs > 60000) {
    const minutes = Math.ceil(etaMs / 60000);
    return `~${minutes}m`;
  } else {
    const seconds = Math.ceil(etaMs / 1000);
    return `~${seconds}s`;
  }
}

/**
 * Update progress and optionally log
 */
export function updateProgress(tracker: ProgressTracker, item?: string, logProgress = true): void {
  tracker.current++;
  tracker.lastUpdate = Date.now();
  
  if (logProgress) {
    const progress = formatProgress(tracker.current, tracker.total);
    const eta = tracker.current < tracker.total ? ` (ETA: ${getETA(tracker)})` : '';
    const itemText = item ? `: ${item}` : '';
    
    console.log(`[${progress}]${eta} Processing${itemText}`);
  }
}

/**
 * Complete progress tracking
 */
export function completeProgress(tracker: ProgressTracker, actionName = 'processing'): void {
  const elapsed = Date.now() - tracker.startTime;
  const seconds = (elapsed / 1000).toFixed(1);
  
  console.log(`\n✅ ${actionName} complete! Processed ${tracker.total} items in ${seconds}s.`);
} 