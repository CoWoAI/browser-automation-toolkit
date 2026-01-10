/**
 * Browser Automation Toolkit - Service Worker v2.1
 * Modular architecture with ES modules
 */

import { tools, getTool, tabRequiredTools } from './tools/index.js';
import { getActiveTab } from './utils/tab-utils.js';
import { addNetworkRequest } from './state/index.js';

// ============ SETTINGS ============

let settings = {
  pollingEnabled: true,
  serverUrl: 'http://127.0.0.1:8766',
  pollInterval: 100
};

console.log('[BAT] Service worker v2.1 starting...');

// Load settings from storage
chrome.storage.local.get(['pollingEnabled', 'serverUrl', 'pollInterval']).then(stored => {
  if (stored.pollingEnabled !== undefined) settings.pollingEnabled = stored.pollingEnabled;
  if (stored.serverUrl) settings.serverUrl = stored.serverUrl;
  if (stored.pollInterval) settings.pollInterval = stored.pollInterval;
  console.log('[BAT] Settings loaded:', settings);
});

// ============ REQUEST HANDLER ============

async function handleToolRequest(message) {
  const { id, tool, args = {}, tabId } = message;

  try {
    const handler = getTool(tool);
    if (!handler) {
      return { id, success: false, error: `Unknown tool: ${tool}` };
    }

    let targetTabId = tabId;

    if (!targetTabId && tabRequiredTools.includes(tool)) {
      const activeTab = await getActiveTab();
      if (!activeTab) {
        return { id, success: false, error: 'No active tab' };
      }
      targetTabId = activeTab.id;
    }

    const result = await handler(args, targetTabId);
    return { id, success: true, result };
  } catch (e) {
    console.error(`[BAT] Tool error (${tool}):`, e);
    return { id, success: false, error: e.message };
  }
}

// ============ HTTP POLLING ============

async function pollForCommands() {
  if (!settings.pollingEnabled) return;

  try {
    const response = await fetch(`${settings.serverUrl}/command`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.status === 200) {
      const command = await response.json();
      console.log('[BAT] Command:', command.tool);
      const result = await handleToolRequest(command);
      await fetch(`${settings.serverUrl}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
    }
  } catch (e) {
    // Server not running - silent fail
  }
}

// Start polling with dynamic interval
let pollIntervalId = setInterval(pollForCommands, settings.pollInterval);

// Function to restart polling with new interval
function restartPolling() {
  clearInterval(pollIntervalId);
  if (settings.pollingEnabled) {
    pollIntervalId = setInterval(pollForCommands, settings.pollInterval);
    console.log('[BAT] Polling started with interval:', settings.pollInterval);
  } else {
    console.log('[BAT] Polling disabled');
  }
}

// ============ EVENT LISTENERS ============

// Capture network requests
chrome.webRequest.onCompleted.addListener((details) => {
  addNetworkRequest({
    url: details.url,
    method: details.method,
    statusCode: details.statusCode,
    type: details.type,
    timestamp: details.timeStamp
  });
}, { urls: ['<all_urls>'] });

// Message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle settings changes from popup
  if (message.type === 'settingsChanged') {
    settings = { ...settings, ...message.settings };
    restartPolling();
    sendResponse({ success: true });
    return true;
  }

  // Handle tool requests from popup
  if (message.source === 'popup' || message.source === 'external') {
    handleToolRequest(message).then(sendResponse);
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleToolRequest(message).then(sendResponse);
  return true;
});

console.log('[BAT] Service worker v2.1 ready');
console.log('[BAT] Tools available:', Object.keys(tools).length);
