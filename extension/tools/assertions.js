/**
 * Assertion tools for testing
 */

import { exec } from '../utils/content-script.js';

/**
 * Assert text content matches expected value
 */
export async function assert_text({ selector, expected, contains = false }, tabId) {
  const result = await exec(tabId, (sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim() : null;
  }, [selector]);

  if (result === null) {
    return { success: false, error: 'Element not found' };
  }

  const pass = contains ? result.includes(expected) : result === expected;
  return { success: pass, actual: result, expected, contains };
}

/**
 * Assert element is visible
 */
export async function assert_visible({ selector }, tabId) {
  const result = await exec(tabId, (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { visible: false, reason: 'not found' };
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible = rect.width > 0 && rect.height > 0 &&
                    style.visibility !== 'hidden' && style.display !== 'none';
    return { visible };
  }, [selector]);

  return { success: result.visible, visible: result.visible, reason: result.reason };
}

/**
 * Assert element is hidden
 */
export async function assert_hidden({ selector }, tabId) {
  const result = await assert_visible({ selector }, tabId);
  return { success: !result.visible };
}

/**
 * Assert current URL matches expected value
 */
export async function assert_url({ expected, contains = false }, tabId) {
  const tab = await chrome.tabs.get(tabId);
  const pass = contains ? tab.url.includes(expected) : tab.url === expected;
  return { success: pass, actual: tab.url, expected, contains };
}

/**
 * Assert page title matches expected value
 */
export async function assert_title({ expected, contains = false }, tabId) {
  const tab = await chrome.tabs.get(tabId);
  const pass = contains ? tab.title.includes(expected) : tab.title === expected;
  return { success: pass, actual: tab.title, expected, contains };
}

/**
 * Assert element count matches expected value
 */
export async function assert_element_count({ selector, count }, tabId) {
  const actual = await exec(tabId, (sel) => {
    return document.querySelectorAll(sel).length;
  }, [selector]);
  return { success: actual === count, actual, expected: count };
}
