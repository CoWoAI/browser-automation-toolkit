/**
 * Content script injection and execution utilities
 */

import { state } from '../state/index.js';

/**
 * Ensure the accessibility tree content script is loaded in a tab
 * @param {number} tabId - Target tab ID
 * @returns {Promise<boolean>} - Whether the script is loaded
 */
export async function ensureContentScript(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.__generateAccessibilityTree === 'function'
    });
    if (results[0]?.result) return true;
  } catch (e) { /* ignore */ }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/accessibility-tree.js']
    });
    return true;
  } catch (e) {
    console.error('[BAT] Failed to inject content script:', e.message);
    return false;
  }
}

/**
 * Execute a function in the page context
 * @param {number} tabId - Target tab ID
 * @param {Function} func - Function to execute
 * @param {Array} [args=[]] - Arguments to pass to the function
 * @returns {Promise<any>} - Result of the function
 */
export async function exec(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [state.currentFrameId] },
    func,
    args
  });
  return results[0]?.result;
}
