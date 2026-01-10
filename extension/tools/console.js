/**
 * Console log and error tools
 */

import {
  getConsoleLogs,
  clearConsoleLogs,
  getPageErrors,
  clearPageErrors
} from '../state/index.js';

/**
 * Get console logs
 */
export async function get_console_logs({ level = 'all', clear = false }) {
  let logs = getConsoleLogs(level);
  if (clear) {
    clearConsoleLogs(logs);
  }
  return { success: true, logs, count: logs.length };
}

/**
 * Get page errors
 */
export async function get_page_errors({ clear = false }) {
  const errors = getPageErrors();
  if (clear) {
    clearPageErrors();
  }
  return { success: true, errors, count: errors.length };
}

/**
 * Clear console logs
 */
export async function clear_console_logs() {
  clearConsoleLogs();
  return { success: true };
}
