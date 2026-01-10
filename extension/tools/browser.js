/**
 * Browser state management tools
 */

/**
 * Clear browser cache
 */
export async function clear_cache() {
  await chrome.browsingData.removeCache({});
  return { success: true };
}

/**
 * Clear various types of browsing data
 */
export async function clear_browsing_data({ dataTypes = ['cache', 'cookies'], since }) {
  const options = since ? { since } : {};
  const dataToRemove = {};

  if (dataTypes.includes('cache')) dataToRemove.cache = true;
  if (dataTypes.includes('cookies')) dataToRemove.cookies = true;
  if (dataTypes.includes('history')) dataToRemove.history = true;
  if (dataTypes.includes('localStorage')) dataToRemove.localStorage = true;

  await chrome.browsingData.remove(options, dataToRemove);
  return { success: true, cleared: dataTypes };
}
