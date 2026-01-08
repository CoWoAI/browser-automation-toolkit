#!/usr/bin/env node
/**
 * Browser Automation Toolkit - Command Server
 *
 * HTTP server that bridges external tools with the Chrome extension.
 * Extension polls GET /command, external tools POST /command and wait for results.
 */

import { createServer } from 'http';

const PORT = process.env.PORT || 8766;
const TIMEOUT_MS = 30000;

// State
let pendingCommand = null;
let pendingResult = null;
let resultResolve = null;

/**
 * Available tools documentation
 * Each tool has: args (parameters), desc (description)
 * Args ending with ? are optional
 */
const TOOLS = {
  // ============ NAVIGATION ============
  navigate: {
    args: ['url?', 'direction?'],
    desc: 'Navigate to URL or use direction: "back", "forward", "reload"'
  },
  reload: {
    args: ['ignoreCache?'],
    desc: 'Reload current page. Set ignoreCache=true to bypass cache'
  },

  // ============ SCREENSHOTS & PAGE CONTENT ============
  screenshot: {
    args: ['fullPage?', 'quality?', 'format?'],
    desc: 'Capture screenshot. format: "png" or "jpeg". quality: 0-100 for jpeg'
  },
  screenshot_element: {
    args: ['ref', 'format?', 'quality?'],
    desc: 'Capture screenshot of specific element by ref'
  },
  screenshot_full_page: {
    args: ['format?', 'quality?'],
    desc: 'Capture full scrollable page by stitching multiple screenshots'
  },
  read_page: {
    args: ['filter?', 'depth?', 'ref_id?'],
    desc: 'Get accessibility tree. filter: "all" or "interactive". depth: max tree depth'
  },
  get_html: {
    args: ['selector?', 'outer?'],
    desc: 'Get HTML of page or element. outer=true for outerHTML, false for innerHTML'
  },
  get_text: {
    args: ['selector?'],
    desc: 'Get text content of page body or specific element'
  },
  save_pdf: {
    args: ['options?'],
    desc: 'Save page as PDF. Returns base64-encoded PDF data'
  },

  // ============ ELEMENT INTERACTION ============
  click: {
    args: ['ref?', 'coordinate?', 'button?', 'clickCount?', 'modifiers?'],
    desc: 'Click element. button: "left", "right", "middle". modifiers: {ctrl, shift, alt, meta}'
  },
  type: {
    args: ['text', 'ref?', 'delay?', 'clear?'],
    desc: 'Type text into focused element or element by ref. delay: ms between keys'
  },
  fill: {
    args: ['ref', 'value'],
    desc: 'Fill input/textarea with value, clearing existing content first'
  },
  select: {
    args: ['ref', 'value'],
    desc: 'Select option in dropdown by value or visible text'
  },
  check: {
    args: ['ref', 'checked?'],
    desc: 'Check or uncheck checkbox/radio. checked defaults to true'
  },
  focus: {
    args: ['ref'],
    desc: 'Focus element by ref'
  },
  blur: {
    args: ['ref?'],
    desc: 'Blur (unfocus) element. If no ref, blurs active element'
  },
  hover: {
    args: ['ref?', 'coordinate?'],
    desc: 'Hover over element by ref or coordinates. Triggers mouseenter/mouseover'
  },
  set_attribute: {
    args: ['ref', 'name', 'value'],
    desc: 'Set attribute on element'
  },
  remove_attribute: {
    args: ['ref', 'name'],
    desc: 'Remove attribute from element'
  },
  set_style: {
    args: ['ref', 'property', 'value'],
    desc: 'Set CSS style property on element'
  },

  // ============ DOM MANIPULATION ============
  remove_element: {
    args: ['ref'],
    desc: 'Remove element from DOM'
  },
  hide_element: {
    args: ['ref'],
    desc: 'Hide element by setting display:none (useful for screenshots without ads)'
  },
  show_element: {
    args: ['ref'],
    desc: 'Show hidden element by removing display:none'
  },
  highlight_element: {
    args: ['ref', 'color?', 'duration?'],
    desc: 'Temporarily highlight element with colored border for debugging'
  },
  insert_html: {
    args: ['ref', 'position', 'html'],
    desc: 'Insert HTML relative to element. position: "beforebegin", "afterbegin", "beforeend", "afterend"'
  },

  // ============ KEYBOARD ============
  press: {
    args: ['key', 'modifiers?'],
    desc: 'Press key. Examples: "Enter", "Tab", "Escape", "ArrowDown". modifiers: {ctrl, shift, alt, meta}'
  },
  keyboard: {
    args: ['action', 'key?', 'text?'],
    desc: 'Low-level keyboard control. action: "down", "up", "press", "type"'
  },

  // ============ MOUSE ============
  mouse: {
    args: ['action', 'x?', 'y?', 'button?'],
    desc: 'Low-level mouse control. action: "move", "down", "up", "click"'
  },
  drag: {
    args: ['from', 'to'],
    desc: 'Drag from [x,y] to [x,y] coordinates'
  },

  // ============ SCROLLING ============
  scroll: {
    args: ['direction?', 'amount?', 'ref?'],
    desc: 'Scroll page. direction: "up", "down", "left", "right". amount in pixels'
  },
  scroll_to: {
    args: ['ref'],
    desc: 'Scroll element into view (centered)'
  },
  scroll_to_bottom: {
    args: [],
    desc: 'Scroll to the bottom of the page'
  },
  scroll_to_top: {
    args: [],
    desc: 'Scroll to the top of the page'
  },
  infinite_scroll: {
    args: ['maxScrolls?', 'delay?', 'threshold?'],
    desc: 'Keep scrolling until no new content loads. For lazy-load pages'
  },

  // ============ TABS ============
  get_tabs: {
    args: [],
    desc: 'List all browser tabs with id, url, title, active status'
  },
  create_tab: {
    args: ['url?', 'active?'],
    desc: 'Create new tab. active=false to open in background'
  },
  close_tab: {
    args: ['tabId?'],
    desc: 'Close tab by ID. If no ID, closes active tab'
  },
  switch_tab: {
    args: ['tabId'],
    desc: 'Switch to tab and focus its window'
  },
  duplicate_tab: {
    args: ['tabId?'],
    desc: 'Duplicate current or specified tab'
  },

  // ============ WINDOWS ============
  get_windows: {
    args: [],
    desc: 'List all browser windows with id, bounds, state'
  },
  create_window: {
    args: ['url?', 'type?', 'width?', 'height?'],
    desc: 'Create new window. type: "normal", "popup", "panel"'
  },
  close_window: {
    args: ['windowId?'],
    desc: 'Close window by ID. If no ID, closes current window'
  },
  resize_window: {
    args: ['width', 'height', 'windowId?'],
    desc: 'Resize window to specified dimensions'
  },
  move_window: {
    args: ['x', 'y', 'windowId?'],
    desc: 'Move window to specified position'
  },
  maximize_window: {
    args: ['windowId?'],
    desc: 'Maximize window'
  },
  minimize_window: {
    args: ['windowId?'],
    desc: 'Minimize window'
  },
  fullscreen_window: {
    args: ['windowId?'],
    desc: 'Set window to fullscreen'
  },

  // ============ WAIT ============
  wait: {
    args: ['ms'],
    desc: 'Wait for specified milliseconds'
  },
  wait_for: {
    args: ['selector?', 'ref?', 'state?', 'timeout?'],
    desc: 'Wait for element. state: "attached", "visible", "hidden". timeout in ms'
  },
  wait_for_navigation: {
    args: ['timeout?'],
    desc: 'Wait for page navigation to complete'
  },
  wait_for_network_idle: {
    args: ['timeout?', 'idleTime?'],
    desc: 'Wait until no network requests for idleTime ms'
  },
  poll_until: {
    args: ['code', 'timeout?', 'interval?'],
    desc: 'Poll until JavaScript code returns truthy value'
  },

  // ============ EXECUTE SCRIPT ============
  execute_script: {
    args: ['code', 'args?'],
    desc: 'Execute JavaScript in page context. Use "return" to get value back'
  },
  evaluate: {
    args: ['code', 'args?'],
    desc: 'Alias for execute_script'
  },

  // ============ SESSION & AUTH ============
  save_session: {
    args: ['name?'],
    desc: 'Save current session (cookies + localStorage + sessionStorage) as JSON'
  },
  restore_session: {
    args: ['session'],
    desc: 'Restore session from saved JSON data'
  },
  import_cookies: {
    args: ['cookies', 'format?'],
    desc: 'Import cookies. format: "json" (default) or "netscape" (curl format)'
  },
  export_cookies: {
    args: ['format?', 'domain?'],
    desc: 'Export cookies. format: "json" (default) or "netscape". domain: filter by domain'
  },

  // ============ COOKIES ============
  get_cookies: {
    args: ['url?', 'name?'],
    desc: 'Get cookies. Filter by URL and/or name'
  },
  set_cookie: {
    args: ['cookie'],
    desc: 'Set cookie. cookie: {url, name, value, domain?, path?, secure?, httpOnly?, sameSite?, expirationDate?}'
  },
  delete_cookies: {
    args: ['url?', 'name?'],
    desc: 'Delete cookies. If no params, deletes all cookies'
  },

  // ============ STORAGE ============
  get_storage: {
    args: ['type', 'key?'],
    desc: 'Get storage. type: "local" or "session". key: specific key or all if omitted'
  },
  set_storage: {
    args: ['type', 'key', 'value'],
    desc: 'Set storage item. type: "local" or "session"'
  },
  clear_storage: {
    args: ['type'],
    desc: 'Clear all items from localStorage or sessionStorage'
  },

  // ============ PAGE INFO ============
  get_url: {
    args: [],
    desc: 'Get current page URL'
  },
  get_title: {
    args: [],
    desc: 'Get current page title'
  },
  get_viewport: {
    args: [],
    desc: 'Get viewport dimensions and device pixel ratio'
  },

  // ============ ELEMENT QUERIES ============
  find: {
    args: ['selector'],
    desc: 'Find first element matching CSS selector, returns ref'
  },
  find_all: {
    args: ['selector', 'limit?'],
    desc: 'Find all elements matching selector. limit defaults to 100'
  },
  find_by_text: {
    args: ['text', 'exact?'],
    desc: 'Find element containing text. exact=true for exact match'
  },
  get_element_info: {
    args: ['ref'],
    desc: 'Get element tag, attributes, text, bounding box, visibility'
  },
  get_bounding_box: {
    args: ['ref'],
    desc: 'Get element position (x, y) and size (width, height)'
  },
  count_elements: {
    args: ['selector'],
    desc: 'Count elements matching CSS selector'
  },
  get_all_text: {
    args: ['selector'],
    desc: 'Get text content from all elements matching selector'
  },
  click_all: {
    args: ['selector', 'limit?'],
    desc: 'Click all elements matching selector. limit defaults to 10'
  },

  // ============ FORMS ============
  fill_form: {
    args: ['fields'],
    desc: 'Fill multiple form fields. fields: {selector: value, ...}'
  },
  submit_form: {
    args: ['ref?', 'selector?'],
    desc: 'Submit form by ref, selector, or closest form to focused element'
  },
  get_form_data: {
    args: ['ref?', 'selector?'],
    desc: 'Get all form field values as object'
  },
  clear_form: {
    args: ['ref?', 'selector?'],
    desc: 'Clear all form fields'
  },

  // ============ TABLES ============
  get_table_data: {
    args: ['ref?', 'selector?', 'headers?'],
    desc: 'Extract table data as array of objects. headers: use first row as keys'
  },

  // ============ FRAMES ============
  get_frames: {
    args: [],
    desc: 'List all frames/iframes with name, url, id'
  },
  switch_frame: {
    args: ['frameId?', 'name?', 'selector?'],
    desc: 'Switch execution context to frame'
  },
  switch_to_main: {
    args: [],
    desc: 'Switch back to main frame context'
  },

  // ============ FILES ============
  set_file: {
    args: ['ref', 'filePaths'],
    desc: 'Set files on file input element. filePaths: array of file paths'
  },
  download: {
    args: ['url', 'filename?'],
    desc: 'Download file from URL'
  },
  wait_for_download: {
    args: ['timeout?'],
    desc: 'Wait for download to complete, returns download info'
  },

  // ============ DIALOGS ============
  handle_dialog: {
    args: ['action', 'text?'],
    desc: 'Handle alert/confirm/prompt. action: "accept", "dismiss". text: for prompt input'
  },
  get_dialog: {
    args: [],
    desc: 'Get info about current dialog if any'
  },

  // ============ CONSOLE & ERRORS ============
  get_console_logs: {
    args: ['level?', 'clear?'],
    desc: 'Get captured console logs. level: "all", "log", "warn", "error". clear: remove after getting'
  },
  get_page_errors: {
    args: ['clear?'],
    desc: 'Get captured JavaScript errors. clear: remove after getting'
  },
  clear_console_logs: {
    args: [],
    desc: 'Clear captured console logs'
  },

  // ============ NETWORK ============
  get_network_requests: {
    args: ['filter?', 'clear?'],
    desc: 'Get captured network requests. filter: URL pattern. clear: remove after getting'
  },
  clear_network_requests: {
    args: [],
    desc: 'Clear captured network requests'
  },
  block_urls: {
    args: ['patterns'],
    desc: 'Block requests matching URL patterns (glob). patterns: array of strings'
  },
  unblock_urls: {
    args: ['patterns?'],
    desc: 'Unblock previously blocked URL patterns. If no patterns, unblock all'
  },
  set_request_interception: {
    args: ['enabled', 'patterns?'],
    desc: 'Enable/disable request interception for URL patterns'
  },
  mock_response: {
    args: ['pattern', 'response'],
    desc: 'Mock response for URL pattern. response: {status, headers, body}'
  },
  clear_mocks: {
    args: [],
    desc: 'Clear all response mocks'
  },
  wait_for_request: {
    args: ['pattern', 'timeout?'],
    desc: 'Wait for request matching URL pattern'
  },
  wait_for_response: {
    args: ['pattern', 'timeout?'],
    desc: 'Wait for response matching URL pattern'
  },

  // ============ DEVICE EMULATION ============
  set_user_agent: {
    args: ['userAgent'],
    desc: 'Set browser user agent string'
  },
  set_geolocation: {
    args: ['latitude', 'longitude', 'accuracy?'],
    desc: 'Set mock geolocation coordinates'
  },
  clear_geolocation: {
    args: [],
    desc: 'Clear mock geolocation, use real location'
  },
  emulate_device: {
    args: ['device'],
    desc: 'Emulate device. device: "iPhone 12", "Pixel 5", "iPad", or {width, height, userAgent, deviceScaleFactor}'
  },

  // ============ CLIPBOARD ============
  get_clipboard: {
    args: [],
    desc: 'Get clipboard text content'
  },
  set_clipboard: {
    args: ['text'],
    desc: 'Set clipboard text content'
  },

  // ============ BROWSER STATE ============
  clear_cache: {
    args: [],
    desc: 'Clear browser cache'
  },
  clear_browsing_data: {
    args: ['dataTypes?', 'since?'],
    desc: 'Clear browsing data. dataTypes: ["cache", "cookies", "history", "localStorage"]. since: timestamp'
  },

  // ============ ASSERTIONS (for testing) ============
  assert_text: {
    args: ['selector', 'expected', 'contains?'],
    desc: 'Assert element text equals or contains expected value'
  },
  assert_visible: {
    args: ['selector'],
    desc: 'Assert element is visible'
  },
  assert_hidden: {
    args: ['selector'],
    desc: 'Assert element is hidden or not present'
  },
  assert_url: {
    args: ['expected', 'contains?'],
    desc: 'Assert current URL equals or contains expected value'
  },
  assert_title: {
    args: ['expected', 'contains?'],
    desc: 'Assert page title equals or contains expected value'
  },
  assert_element_count: {
    args: ['selector', 'count'],
    desc: 'Assert number of elements matching selector'
  },

  // ============ UTILITY ============
  ping: {
    args: [],
    desc: 'Health check - returns pong with timestamp'
  },
  get_tools: {
    args: [],
    desc: 'List all available tools with arguments and descriptions'
  },
  retry: {
    args: ['tool', 'args', 'maxAttempts?', 'delay?'],
    desc: 'Retry a tool on failure. maxAttempts defaults to 3, delay in ms'
  },
};

function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', name: 'browser-automation-toolkit', version: '2.0.0' }));
    return;
  }

  // List tools
  if (req.method === 'GET' && url.pathname === '/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: TOOLS, count: Object.keys(TOOLS).length }));
    return;
  }

  // Extension polls for commands
  if (req.method === 'GET' && url.pathname === '/command') {
    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cmd));
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  // External tool sends command
  if (req.method === 'POST' && url.pathname === '/command') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const command = JSON.parse(body);

        // Validate tool
        if (!command.tool) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing tool parameter' }));
          return;
        }

        // Handle server-side tools
        if (command.tool === 'ping') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result: { pong: true, timestamp: Date.now() } }));
          return;
        }

        if (command.tool === 'get_tools') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, result: { tools: TOOLS, count: Object.keys(TOOLS).length } }));
          return;
        }

        // Queue command for extension
        pendingCommand = {
          id: command.id || `cmd_${Date.now()}`,
          tool: command.tool,
          args: command.args || {},
          tabId: command.tabId
        };

        // Wait for result with timeout
        const resultPromise = new Promise(resolve => {
          resultResolve = resolve;
        });

        const timeoutPromise = new Promise(resolve => {
          setTimeout(() => resolve({ error: 'timeout', message: `Command timed out after ${TIMEOUT_MS}ms` }), TIMEOUT_MS);
        });

        const result = await Promise.race([resultPromise, timeoutPromise]);
        resultResolve = null;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON', message: e.message }));
      }
    });
    return;
  }

  // Extension posts result
  if (req.method === 'POST' && url.pathname === '/result') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const result = JSON.parse(body);
        if (resultResolve) {
          resultResolve(result);
        }
        res.writeHead(200);
        res.end();
      } catch (e) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

const server = createServer(handleRequest);

// Only start if run directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Browser Automation Toolkit v2.0.0 - Command Server`);
    console.log(`Listening on http://127.0.0.1:${PORT}`);
    console.log(`Tools available: ${Object.keys(TOOLS).length}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  /          - Health check`);
    console.log(`  GET  /tools     - List all ${Object.keys(TOOLS).length} available tools`);
    console.log(`  POST /command   - Send command (waits for result)`);
    console.log('');
    console.log('Example:');
    console.log(`  curl -X POST http://127.0.0.1:${PORT}/command -H "Content-Type: application/json" -d '{"tool": "screenshot"}'`);
  });
}

export { server, TOOLS };
