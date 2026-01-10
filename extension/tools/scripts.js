/**
 * Script execution tools
 */

import { exec } from '../utils/content-script.js';

/**
 * Execute arbitrary JavaScript code in the page
 */
export async function execute_script({ code, args = [] }, tabId) {
  try {
    const result = await exec(tabId, (c, a) => {
      try {
        const fn = new Function(...a.map((_, i) => `arg${i}`), c);
        return { success: true, result: fn(...a) };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, [code, args]);
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Evaluate JavaScript expression (alias for execute_script)
 */
export async function evaluate({ code, args = [] }, tabId) {
  return execute_script({ code, args }, tabId);
}
