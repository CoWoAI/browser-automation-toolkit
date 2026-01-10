/**
 * Clipboard tools
 */

import { exec } from '../utils/content-script.js';

/**
 * Get clipboard text content
 */
export async function get_clipboard({}, tabId) {
  return await exec(tabId, async () => {
    try {
      return { success: true, text: await navigator.clipboard.readText() };
    } catch (e) {
      return {
        success: false,
        error: 'Clipboard access denied. Page must be focused and have permission.'
      };
    }
  });
}

/**
 * Set clipboard text content
 */
export async function set_clipboard({ text }, tabId) {
  return await exec(tabId, async (t) => {
    try {
      await navigator.clipboard.writeText(t);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: 'Clipboard access denied. Page must be focused and have permission.'
      };
    }
  }, [text]);
}
