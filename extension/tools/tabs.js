/**
 * Tab management tools
 */

import { getActiveTab } from '../utils/tab-utils.js';

/**
 * Get all open tabs
 */
export async function get_tabs() {
  const tabs = await chrome.tabs.query({});
  return {
    success: true,
    tabs: tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
      windowId: t.windowId
    }))
  };
}

/**
 * Create a new tab
 */
export async function create_tab({ url, active = true }) {
  const tab = await chrome.tabs.create({ url: url || 'about:blank', active });
  return { success: true, tabId: tab.id };
}

/**
 * Close a tab
 */
export async function close_tab({ tabId }) {
  const id = tabId || (await getActiveTab())?.id;
  if (id) await chrome.tabs.remove(id);
  return { success: true };
}

/**
 * Switch to a tab
 */
export async function switch_tab({ tabId }) {
  await chrome.tabs.update(tabId, { active: true });
  const tab = await chrome.tabs.get(tabId);
  await chrome.windows.update(tab.windowId, { focused: true });
  return { success: true };
}

/**
 * Duplicate a tab
 */
export async function duplicate_tab({ tabId }) {
  const id = tabId || (await getActiveTab())?.id;
  const newTab = await chrome.tabs.duplicate(id);
  return { success: true, tabId: newTab.id };
}
