/**
 * Navigation tools - URL navigation, back/forward, reload
 */

/**
 * Navigate to a URL or direction (back/forward/reload)
 */
export async function navigate({ url, direction }, tabId) {
  if (direction === 'back') {
    await chrome.tabs.goBack(tabId);
    return { success: true, action: 'back' };
  }
  if (direction === 'forward') {
    await chrome.tabs.goForward(tabId);
    return { success: true, action: 'forward' };
  }
  if (direction === 'reload' || !url) {
    await chrome.tabs.reload(tabId);
    return { success: true, action: 'reload' };
  }
  await chrome.tabs.update(tabId, { url });
  return { success: true, url };
}

/**
 * Reload the current page
 */
export async function reload({ ignoreCache = false }, tabId) {
  await chrome.tabs.reload(tabId, { bypassCache: ignoreCache });
  return { success: true };
}
