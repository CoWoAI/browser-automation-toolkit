/**
 * Web storage tools (localStorage/sessionStorage)
 */

import { exec } from '../utils/content-script.js';

/**
 * Get storage items
 */
export async function get_storage({ type, key }, tabId) {
  return await exec(tabId, (t, k) => {
    const storage = t === 'session' ? sessionStorage : localStorage;
    if (k) {
      return { success: true, value: storage.getItem(k) };
    }
    const items = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      items[key] = storage.getItem(key);
    }
    return { success: true, items };
  }, [type, key]);
}

/**
 * Set a storage item
 */
export async function set_storage({ type, key, value }, tabId) {
  return await exec(tabId, (t, k, v) => {
    const storage = t === 'session' ? sessionStorage : localStorage;
    storage.setItem(k, v);
    return { success: true };
  }, [type, key, value]);
}

/**
 * Clear storage
 */
export async function clear_storage({ type }, tabId) {
  return await exec(tabId, (t) => {
    const storage = t === 'session' ? sessionStorage : localStorage;
    storage.clear();
    return { success: true };
  }, [type]);
}
