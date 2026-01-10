/**
 * Tab utility functions for browser automation
 */

/**
 * Get the active tab, falling back through various query strategies
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
export async function getActiveTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) return tab;
  [tab] = await chrome.tabs.query({ active: true });
  if (tab) return tab;
  const tabs = await chrome.tabs.query({});
  tab = tabs.find(t => !t.url?.startsWith('chrome://') && !t.url?.startsWith('chrome-extension://'));
  return tab || tabs[0] || null;
}

/**
 * Get a window by ID or the window of the active tab
 * @param {number} [windowId] - Optional window ID
 * @returns {Promise<chrome.windows.Window|null>}
 */
export async function getWindow(windowId) {
  if (windowId) return await chrome.windows.get(windowId);
  const tab = await getActiveTab();
  return tab ? await chrome.windows.get(tab.windowId) : null;
}
