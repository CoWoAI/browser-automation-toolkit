/**
 * Network request tools
 */

import {
  getNetworkRequests,
  clearNetworkRequests,
  addBlockedUrls,
  getBlockedUrls,
  removeBlockedUrls,
  setMockResponse,
  getMockPatterns,
  clearMockResponses
} from '../state/index.js';

/**
 * Get captured network requests
 */
export async function get_network_requests({ filter, clear = false }) {
  let requests = getNetworkRequests(filter);
  if (clear) {
    clearNetworkRequests(requests);
  }
  return { success: true, requests, count: requests.length };
}

/**
 * Clear captured network requests
 */
export async function clear_network_requests() {
  clearNetworkRequests();
  return { success: true };
}

/**
 * Block URLs matching patterns
 */
export async function block_urls({ patterns }) {
  const rules = patterns.map((pattern, index) => ({
    id: getBlockedUrls().length + index + 1,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: pattern,
      resourceTypes: [
        'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
        'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'
      ]
    }
  }));

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules,
      removeRuleIds: []
    });
    addBlockedUrls(patterns);
    return { success: true, blocked: getBlockedUrls() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Unblock URLs
 */
export async function unblock_urls({ patterns }) {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    let removeIds = [];

    if (patterns) {
      removeIds = existingRules
        .filter(r => patterns.some(p => r.condition.urlFilter === p))
        .map(r => r.id);
      removeBlockedUrls(patterns);
    } else {
      removeIds = existingRules.map(r => r.id);
      removeBlockedUrls();
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [],
      removeRuleIds: removeIds
    });
    return { success: true, blocked: getBlockedUrls() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Set up request interception (limited support)
 */
export async function set_request_interception({ enabled, patterns }) {
  return {
    success: true,
    note: 'Request interception requires chrome.debugger API for full control.'
  };
}

/**
 * Set up a mock response for a URL pattern
 */
export async function mock_response({ pattern, response }) {
  setMockResponse(pattern, response);
  return { success: true, mocked: getMockPatterns() };
}

/**
 * Clear all mock responses
 */
export async function clear_mocks() {
  clearMockResponses();
  return { success: true };
}

/**
 * Wait for a request matching a pattern
 */
export async function wait_for_request({ pattern, timeout = 30000 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const match = getNetworkRequests().find(r => r.url.includes(pattern));
    if (match) return { success: true, request: match };
    await new Promise(r => setTimeout(r, 100));
  }
  return { success: false, error: `Timeout waiting for request matching "${pattern}"` };
}

/**
 * Wait for a response matching a pattern (alias for wait_for_request)
 */
export async function wait_for_response({ pattern, timeout = 30000 }) {
  return wait_for_request({ pattern, timeout });
}
