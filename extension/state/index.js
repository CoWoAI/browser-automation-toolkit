/**
 * Centralized state management for browser automation toolkit
 */

/**
 * Global state object
 */
export const state = {
  consoleLogs: [],
  pageErrors: [],
  networkRequests: [],
  blockedUrls: [],
  mockResponses: new Map(),
  pendingDialogAction: null,
  currentFrameId: 0, // 0 = main frame
};

/**
 * Device presets for emulation
 */
export const DEVICES = {
  'iPhone 12': { width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 3 },
  'iPhone 14': { width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 3 },
  'Pixel 5': { width: 393, height: 851, userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36', deviceScaleFactor: 2.75 },
  'iPad': { width: 768, height: 1024, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 2 },
  'iPad Pro': { width: 1024, height: 1366, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 2 },
};

// ============ CONSOLE LOGS ============

/**
 * Add a console log entry
 * @param {Object} log - Log entry
 */
export function addConsoleLog(log) {
  if (state.consoleLogs.length > 1000) {
    state.consoleLogs.shift();
  }
  state.consoleLogs.push(log);
}

/**
 * Get console logs, optionally filtered by level
 * @param {string} [level='all'] - Log level filter
 * @returns {Array} - Console logs
 */
export function getConsoleLogs(level = 'all') {
  if (level === 'all') return [...state.consoleLogs];
  return state.consoleLogs.filter(l => l.level === level);
}

/**
 * Clear console logs
 * @param {Array} [logs] - Specific logs to clear, or all if not provided
 */
export function clearConsoleLogs(logs) {
  if (logs) {
    state.consoleLogs = state.consoleLogs.filter(l => !logs.includes(l));
  } else {
    state.consoleLogs = [];
  }
}

// ============ PAGE ERRORS ============

/**
 * Add a page error
 * @param {Object} error - Error entry
 */
export function addPageError(error) {
  state.pageErrors.push(error);
}

/**
 * Get page errors
 * @returns {Array} - Page errors
 */
export function getPageErrors() {
  return [...state.pageErrors];
}

/**
 * Clear page errors
 */
export function clearPageErrors() {
  state.pageErrors = [];
}

// ============ NETWORK REQUESTS ============

/**
 * Add a network request
 * @param {Object} request - Request entry
 */
export function addNetworkRequest(request) {
  if (state.networkRequests.length > 1000) {
    state.networkRequests.shift();
  }
  state.networkRequests.push(request);
}

/**
 * Get network requests, optionally filtered by URL
 * @param {string} [filter] - URL filter string
 * @returns {Array} - Network requests
 */
export function getNetworkRequests(filter) {
  if (!filter) return [...state.networkRequests];
  return state.networkRequests.filter(r => r.url.includes(filter));
}

/**
 * Clear network requests
 * @param {Array} [requests] - Specific requests to clear, or all if not provided
 */
export function clearNetworkRequests(requests) {
  if (requests) {
    state.networkRequests = state.networkRequests.filter(r => !requests.includes(r));
  } else {
    state.networkRequests = [];
  }
}

// ============ BLOCKED URLS ============

/**
 * Add blocked URL patterns
 * @param {Array<string>} patterns - URL patterns to block
 */
export function addBlockedUrls(patterns) {
  state.blockedUrls.push(...patterns);
}

/**
 * Get blocked URL patterns
 * @returns {Array<string>} - Blocked URL patterns
 */
export function getBlockedUrls() {
  return [...state.blockedUrls];
}

/**
 * Remove blocked URL patterns
 * @param {Array<string>} [patterns] - Patterns to remove, or all if not provided
 */
export function removeBlockedUrls(patterns) {
  if (patterns) {
    state.blockedUrls = state.blockedUrls.filter(p => !patterns.includes(p));
  } else {
    state.blockedUrls = [];
  }
}

// ============ MOCK RESPONSES ============

/**
 * Set a mock response for a URL pattern
 * @param {string} pattern - URL pattern
 * @param {Object} response - Mock response
 */
export function setMockResponse(pattern, response) {
  state.mockResponses.set(pattern, response);
}

/**
 * Get mock response for a URL
 * @param {string} url - URL to check
 * @returns {Object|null} - Mock response or null
 */
export function getMockResponse(url) {
  for (const [pattern, response] of state.mockResponses.entries()) {
    if (url.includes(pattern)) return response;
  }
  return null;
}

/**
 * Get all mock response patterns
 * @returns {Array<string>} - Mock response patterns
 */
export function getMockPatterns() {
  return Array.from(state.mockResponses.keys());
}

/**
 * Clear all mock responses
 */
export function clearMockResponses() {
  state.mockResponses.clear();
}

// ============ DIALOGS ============

/**
 * Set pending dialog action
 * @param {Object} action - Dialog action
 */
export function setPendingDialogAction(action) {
  state.pendingDialogAction = action;
}

/**
 * Get pending dialog action
 * @returns {Object|null} - Pending dialog action
 */
export function getPendingDialogAction() {
  return state.pendingDialogAction;
}

// ============ FRAMES ============

/**
 * Set current frame ID
 * @param {number} frameId - Frame ID
 */
export function setCurrentFrameId(frameId) {
  state.currentFrameId = frameId;
}

/**
 * Get current frame ID
 * @returns {number} - Current frame ID
 */
export function getCurrentFrameId() {
  return state.currentFrameId;
}
