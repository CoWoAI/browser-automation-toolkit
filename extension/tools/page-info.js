/**
 * Page information tools
 */

import { exec } from '../utils/content-script.js';

/**
 * Get the current URL
 */
export async function get_url({}, tabId) {
  const tab = await chrome.tabs.get(tabId);
  return { success: true, url: tab.url };
}

/**
 * Get the page title
 */
export async function get_title({}, tabId) {
  const tab = await chrome.tabs.get(tabId);
  return { success: true, title: tab.title };
}

/**
 * Get viewport dimensions
 */
export async function get_viewport({}, tabId) {
  return await exec(tabId, () => ({
    success: true,
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio
  }));
}
