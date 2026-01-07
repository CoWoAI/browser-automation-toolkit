// Service Worker - Browser Task Executor
// Handles native messaging and tool execution

console.log('[ServiceWorker] ====== SERVICE WORKER LOADING ======');
console.log('[ServiceWorker] Time:', new Date().toISOString());

const NATIVE_HOST_NAME = 'com.anthropic.browser_task_executor';

let nativePort = null;

// Connect to native host
function connectNativeHost() {
  console.log('[ServiceWorker] Attempting to connect to native host...');
  if (nativePort) {
    console.log('[ServiceWorker] Already connected to native host');
    return nativePort;
  }

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((message) => {
      console.log('[ServiceWorker] Received from native host:', message);
      handleToolRequest(message);
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('[ServiceWorker] Native host disconnected');
      if (chrome.runtime.lastError) {
        console.error('[ServiceWorker] Disconnect error:', chrome.runtime.lastError.message);
      }
      nativePort = null;
    });

    console.log('[ServiceWorker] Connected to native host successfully');
    return nativePort;
  } catch (e) {
    console.error('[ServiceWorker] Failed to connect to native host:', e);
    return null;
  }
}

// Send response back to native host
function sendResponse(id, success, result, error) {
  const response = { id, success, result, error };
  console.log('[ServiceWorker] Sending response:', { id, success, hasResult: !!result, error });
  if (nativePort) {
    nativePort.postMessage(response);
  }
  return response;
}

// Get active tab, or fallback to first available tab
async function getActiveTab() {
  console.log('[ServiceWorker] Getting active tab...');

  // Try active tab in current window
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    console.log('[ServiceWorker] Active tab:', { id: tab.id, url: tab.url });
    return tab;
  }

  // Try active tab in any window
  [tab] = await chrome.tabs.query({ active: true });
  if (tab) {
    console.log('[ServiceWorker] Active tab (any window):', { id: tab.id, url: tab.url });
    return tab;
  }

  // Fallback to first non-extension tab
  const tabs = await chrome.tabs.query({});
  tab = tabs.find(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
  if (tab) {
    console.log('[ServiceWorker] Fallback tab:', { id: tab.id, url: tab.url });
    return tab;
  }

  // Last resort: any tab
  if (tabs.length > 0) {
    console.log('[ServiceWorker] Last resort tab:', { id: tabs[0].id, url: tabs[0].url });
    return tabs[0];
  }

  console.log('[ServiceWorker] No tabs found');
  return null;
}

// Get tab by ID or active tab
async function getTab(tabId) {
  if (tabId) {
    return await chrome.tabs.get(tabId);
  }
  return await getActiveTab();
}

// Inject content script if not already loaded
async function ensureContentScriptLoaded(tabId) {
  console.log('[ServiceWorker] Checking if content script is loaded in tab:', tabId);
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.getAttribute('data-browser-executor')
    });
    if (results[0]?.result === 'loaded') {
      console.log('[ServiceWorker] Content script already loaded');
      return true;
    }
  } catch (e) {
    console.log('[ServiceWorker] Could not check content script status:', e.message);
  }

  // Inject bridge into MAIN world (receives postMessage from page)
  console.log('[ServiceWorker] Injecting bridge into MAIN world...');
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/bridge.js'],
      world: 'MAIN'
    });
    console.log('[ServiceWorker] Bridge injected into MAIN world');

    // Inject content script into ISOLATED world (has chrome.runtime access)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/accessibility-tree.js']
    });
    console.log('[ServiceWorker] Content script injected into ISOLATED world');
    return true;
  } catch (e) {
    console.error('[ServiceWorker] Failed to inject scripts:', e.message);
    return false;
  }
}

// Execute script in tab
async function executeScript(tabId, func, args = []) {
  console.log('[ServiceWorker] Executing script in tab:', tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });
  console.log('[ServiceWorker] Script result:', results[0]?.result ? 'got result' : 'no result');
  return results[0]?.result;
}

// Tool handlers
const toolHandlers = {
  // Read page accessibility tree
  async read_page({ filter = 'all', depth = 15, ref_id = null }, tabId) {
    console.log('[ServiceWorker] read_page:', { filter, depth, ref_id, tabId });
    const result = await executeScript(tabId, (f, d, r) => {
      return window.__generateAccessibilityTree?.(f, d, r) || { error: 'Content script not loaded' };
    }, [filter, depth, ref_id]);
    return result;
  },

  // Take screenshot
  async screenshot({}, tabId) {
    console.log('[ServiceWorker] screenshot for tab:', tabId);
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    // Get viewport dimensions
    const viewport = await executeScript(tabId, () => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    console.log('[ServiceWorker] Screenshot captured, viewport:', viewport);
    return {
      image: dataUrl,
      viewport
    };
  },

  // Click element
  async click({ coordinate, ref, button = 'left' }, tabId) {
    console.log('[ServiceWorker] click:', { coordinate, ref, button, tabId });
    if (ref) {
      // Click by ref ID
      const result = await executeScript(tabId, (refId, btn) => {
        return window.__clickElementByRef?.(refId, btn) || { success: false, error: 'Content script not loaded' };
      }, [ref, button]);
      return result;
    } else if (coordinate) {
      // Click by coordinates using chrome.debugger or DOM
      const [x, y] = coordinate;
      const result = await executeScript(tabId, (cx, cy, btn) => {
        const element = document.elementFromPoint(cx, cy);
        if (!element) {
          return { success: false, error: 'No element at coordinates' };
        }

        const eventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: cx,
          clientY: cy,
          button: btn === 'right' ? 2 : 0
        };

        element.dispatchEvent(new MouseEvent('mousedown', eventInit));
        element.dispatchEvent(new MouseEvent('mouseup', eventInit));
        element.dispatchEvent(new MouseEvent('click', eventInit));

        return { success: true, element: element.tagName };
      }, [x, y, button]);
      return result;
    } else {
      return { success: false, error: 'Must provide either coordinate or ref' };
    }
  },

  // Type text
  async type({ text, ref }, tabId) {
    console.log('[ServiceWorker] type:', { text, ref, tabId });
    const result = await executeScript(tabId, (refId, txt) => {
      return window.__typeIntoElement?.(refId, txt) || { success: false, error: 'Content script not loaded' };
    }, [ref, text]);
    return result;
  },

  // Navigate
  async navigate({ url, direction }, tabId) {
    console.log('[ServiceWorker] navigate:', { url, direction, tabId });
    if (direction === 'back') {
      await chrome.tabs.goBack(tabId);
      return { success: true, action: 'back' };
    } else if (direction === 'forward') {
      await chrome.tabs.goForward(tabId);
      return { success: true, action: 'forward' };
    } else if (url) {
      await chrome.tabs.update(tabId, { url });
      return { success: true, url };
    } else {
      return { success: false, error: 'Must provide url or direction' };
    }
  },

  // Scroll
  async scroll({ direction, amount = 300 }, tabId) {
    console.log('[ServiceWorker] scroll:', { direction, amount, tabId });
    const result = await executeScript(tabId, (dir, amt) => {
      return window.__scrollPage?.(dir, amt) || { success: false, error: 'Content script not loaded' };
    }, [direction, amount]);
    return result;
  },

  // Execute arbitrary script
  async execute_script({ code }, tabId) {
    console.log('[ServiceWorker] execute_script in tab:', tabId);
    try {
      const result = await executeScript(tabId, (c) => {
        try {
          return { success: true, result: eval(c) };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }, [code]);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // Wait
  async wait({ ms }) {
    console.log('[ServiceWorker] wait:', ms, 'ms');
    await new Promise(resolve => setTimeout(resolve, ms));
    return { success: true, waited: ms };
  },

  // Get tabs info
  async get_tabs({}) {
    console.log('[ServiceWorker] get_tabs');
    const tabs = await chrome.tabs.query({});
    console.log('[ServiceWorker] Found', tabs.length, 'tabs');
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
  },

  // Create new tab
  async create_tab({ url }) {
    console.log('[ServiceWorker] create_tab:', url);
    const tab = await chrome.tabs.create({ url: url || 'about:blank' });
    return { success: true, tabId: tab.id };
  },

  // Inject content script manually
  async inject_content_script({}, tabId) {
    console.log('[ServiceWorker] inject_content_script for tab:', tabId);
    const success = await ensureContentScriptLoaded(tabId);
    return { success };
  }
};

// Handle tool request from native host or popup
async function handleToolRequest(message) {
  const { id, tool, args = {}, tabId } = message;

  console.log(`[ServiceWorker] ====== TOOL REQUEST ======`);
  console.log(`[ServiceWorker] Tool: ${tool}`);
  console.log(`[ServiceWorker] Args:`, args);
  console.log(`[ServiceWorker] TabId:`, tabId);

  try {
    const handler = toolHandlers[tool];
    if (!handler) {
      console.error(`[ServiceWorker] Unknown tool: ${tool}`);
      return sendResponse(id, false, null, `Unknown tool: ${tool}`);
    }

    // Get tab ID - use provided or get active tab
    let targetTabId = tabId;
    if (!targetTabId && tool !== 'wait' && tool !== 'get_tabs' && tool !== 'create_tab') {
      const activeTab = await getActiveTab();
      if (!activeTab) {
        console.error('[ServiceWorker] No active tab found');
        return sendResponse(id, false, null, 'No active tab');
      }
      targetTabId = activeTab.id;
    }

    // Ensure content script is loaded for tools that need it
    if (targetTabId && ['read_page', 'click', 'type', 'scroll'].includes(tool)) {
      await ensureContentScriptLoaded(targetTabId);
    }

    console.log(`[ServiceWorker] Executing handler for ${tool} on tab ${targetTabId}`);
    const result = await handler(args, targetTabId);
    console.log(`[ServiceWorker] Handler completed for ${tool}`);
    return sendResponse(id, true, result, null);

  } catch (e) {
    console.error(`[ServiceWorker] Tool error:`, e);
    return sendResponse(id, false, null, e.message);
  }
}

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponseFn) => {
  console.log('[ServiceWorker] ====== MESSAGE RECEIVED ======');
  console.log('[ServiceWorker] Message:', message);
  console.log('[ServiceWorker] Sender:', sender.tab ? { tabId: sender.tab.id, url: sender.tab.url } : 'extension');

  if (message.source === 'popup' || message.source === 'external') {
    console.log('[ServiceWorker] Processing as tool request...');
    handleToolRequest(message).then(response => {
      console.log('[ServiceWorker] Sending response back');
      sendResponseFn(response);
    });
    return true; // Keep channel open for async response
  } else {
    console.log('[ServiceWorker] Unknown message source:', message.source);
  }
});

// Log startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[ServiceWorker] ====== EXTENSION STARTUP ======');
});

// Log install
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ServiceWorker] ====== EXTENSION INSTALLED ======');
  console.log('[ServiceWorker] Reason:', details.reason);
});

// External message listener
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[ServiceWorker] ====== EXTERNAL MESSAGE ======');
  console.log('[ServiceWorker] Message:', message);
  console.log('[ServiceWorker] Sender:', sender);

  handleToolRequest(message).then(response => {
    sendResponse(response);
  });
  return true;
});

// ============ HTTP POLLING FOR REMOTE COMMANDS ============
const COMMAND_SERVER_URL = 'http://127.0.0.1:8766';
let pollingEnabled = true;

async function pollForCommands() {
  if (!pollingEnabled) return;

  try {
    const response = await fetch(`${COMMAND_SERVER_URL}/command`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.status === 200) {
      const command = await response.json();
      console.log('[ServiceWorker] ====== RECEIVED REMOTE COMMAND ======');
      console.log('[ServiceWorker] Command:', command);

      // Execute the command
      const result = await handleToolRequest({
        id: command.id || `remote_${Date.now()}`,
        tool: command.tool,
        args: command.args || {},
        tabId: command.tabId,
        source: 'remote'
      });

      // Send result back to server
      console.log('[ServiceWorker] Sending result back to server...');
      await fetch(`${COMMAND_SERVER_URL}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
      console.log('[ServiceWorker] Result sent');
    }
    // 204 = no command pending, that's fine
  } catch (e) {
    // Server not running or network error - silent fail
    if (!e.message.includes('Failed to fetch')) {
      console.log('[ServiceWorker] Poll error:', e.message);
    }
  }
}

// Poll every 100ms for faster response
setInterval(pollForCommands, 100);
console.log('[ServiceWorker] Polling enabled for', COMMAND_SERVER_URL, '(100ms interval)');

// Keep alive ping (helps with debugging)
setInterval(() => {
  console.log('[ServiceWorker] Heartbeat -', new Date().toISOString());
}, 30000);

console.log('[ServiceWorker] ====== SERVICE WORKER READY ======');
