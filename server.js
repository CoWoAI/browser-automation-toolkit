#!/usr/bin/env node
/**
 * Browser Automation Toolkit - Command Server
 *
 * HTTP server that bridges external tools with the Chrome extension.
 * Extension polls GET /command, external tools POST /command and wait for results.
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8766;
const HOST = process.env.HOST || '127.0.0.1';  // Use 0.0.0.0 for Docker
const TIMEOUT_MS = parseInt(process.env.COMMAND_TIMEOUT) || 30000;
const MAX_LOGS_IN_MEMORY = 1000;
const LOGS_FILE = join(__dirname, 'data', 'logs.jsonl');

// State
let pendingCommand = null;
let pendingResult = null;
let resultResolve = null;
const startTime = Date.now();

// SubtaskId to browser/tab mapping for future multi-browser routing
const subtaskBrowserMap = new Map();

// Logs storage
const logs = [];

// Initialize logs from file
function initLogs() {
  const dataDir = join(__dirname, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  if (existsSync(LOGS_FILE)) {
    try {
      const content = readFileSync(LOGS_FILE, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      // Load last MAX_LOGS_IN_MEMORY logs
      const startIdx = Math.max(0, lines.length - MAX_LOGS_IN_MEMORY);
      for (let i = startIdx; i < lines.length; i++) {
        try {
          logs.push(JSON.parse(lines[i]));
        } catch (e) {
          // Skip malformed lines
        }
      }
      console.log(`Loaded ${logs.length} logs from file`);
    } catch (e) {
      console.error('Failed to load logs:', e.message);
    }
  }
}

// Add log entry
function addLog(entry) {
  const log = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };
  logs.push(log);

  // Trim memory if exceeded
  while (logs.length > MAX_LOGS_IN_MEMORY) {
    logs.shift();
  }

  // Append to file
  try {
    appendFileSync(LOGS_FILE, JSON.stringify(log) + '\n');
  } catch (e) {
    // Silent fail on file write
  }

  return log;
}

// Clear logs
function clearLogs() {
  logs.length = 0;
  try {
    writeFileSync(LOGS_FILE, '');
  } catch (e) {
    // Silent fail
  }
}

// Get unique values for filtering
function getLogFilters() {
  const levels = new Set();
  const tools = new Set();
  for (const log of logs) {
    if (log.level) levels.add(log.level);
    if (log.tool) tools.add(log.tool);
  }
  return {
    levels: Array.from(levels).sort(),
    tools: Array.from(tools).sort()
  };
}

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

// HTML Templates
const VERSION = '2.2.0';

function getMenuHTML() {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Browser Automation Toolkit</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    header {
      text-align: center;
      margin-bottom: 40px;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .version {
      color: #666;
      font-size: 14px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #e8f5e9;
      color: #2e7d32;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      margin-top: 16px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #4caf50;
      border-radius: 50%;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s, box-shadow 0.2s;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .card h2 {
      font-size: 18px;
      margin-bottom: 8px;
      color: #2563eb;
    }
    .card p {
      color: #666;
      font-size: 14px;
      line-height: 1.5;
    }
    .card .count {
      margin-top: 12px;
      font-size: 24px;
      font-weight: 600;
      color: #333;
    }
    footer {
      text-align: center;
      margin-top: 40px;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Browser Automation Toolkit</h1>
      <div class="version">v${VERSION}</div>
      <div class="status">
        <span class="status-dot"></span>
        Server running - Uptime: ${uptimeStr}
      </div>
    </header>
    <div class="cards">
      <a href="/logs" class="card">
        <h2>Logs</h2>
        <p>View extension logs, errors, and debug information with filtering and search.</p>
        <div class="count">${logs.length} entries</div>
      </a>
      <a href="/tools" class="card">
        <h2>Tools</h2>
        <p>Browse all available automation tools with arguments and descriptions.</p>
        <div class="count">${Object.keys(TOOLS).length} tools</div>
      </a>
      <a href="/api/status" class="card">
        <h2>API Status</h2>
        <p>Server health check and configuration details in JSON format.</p>
        <div class="count">JSON</div>
      </a>
    </div>
    <footer>
      Listening on http://${HOST}:${PORT}
    </footer>
  </div>
</body>
</html>`;
}

function getLogsHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logs - Browser Automation Toolkit</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      min-height: 100vh;
    }
    .header {
      background: white;
      border-bottom: 1px solid #e0e0e0;
      padding: 16px 24px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-content {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 600;
    }
    .header h1 a {
      color: #666;
      text-decoration: none;
      font-weight: 400;
    }
    .header h1 a:hover { color: #2563eb; }
    .filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    select, input[type="text"] {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      background: white;
    }
    select:focus, input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
    }
    input[type="text"] { width: 200px; }
    .actions {
      display: flex;
      gap: 8px;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary {
      background: #2563eb;
      color: white;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-danger {
      background: #dc2626;
      color: white;
    }
    .btn-danger:hover { background: #b91c1c; }
    .auto-refresh {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: #666;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }
    .stats {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #666;
    }
    .stats span { display: flex; align-items: center; gap: 6px; }
    .log-list {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .log-entry {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
      display: grid;
      grid-template-columns: 100px 80px 120px 1fr;
      gap: 16px;
      align-items: start;
      font-size: 13px;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-entry:hover { background: #fafafa; }
    .log-time {
      color: #999;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 11px;
    }
    .log-level {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      text-align: center;
    }
    .level-error { background: #fee2e2; color: #dc2626; }
    .level-warn { background: #fef3c7; color: #d97706; }
    .level-info { background: #dbeafe; color: #2563eb; }
    .level-debug { background: #f3f4f6; color: #6b7280; }
    .log-tool {
      color: #6b7280;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
    }
    .log-message {
      color: #333;
      word-break: break-word;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      white-space: pre-wrap;
    }
    .empty {
      padding: 60px 20px;
      text-align: center;
      color: #999;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    @media (max-width: 768px) {
      .log-entry {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .header-content { flex-direction: column; align-items: stretch; }
      .filters { flex-direction: column; }
      input[type="text"] { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-content">
      <h1><a href="/">BAT</a> / Logs</h1>
      <div class="filters">
        <select id="level-filter">
          <option value="">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
        <select id="tool-filter">
          <option value="">All Tools</option>
        </select>
        <input type="text" id="search" placeholder="Search logs...">
      </div>
      <div class="actions">
        <label class="auto-refresh">
          <input type="checkbox" id="auto-refresh" checked>
          Auto-refresh
        </label>
        <button class="btn-secondary" onclick="exportLogs()">Export</button>
        <button class="btn-danger" onclick="clearLogs()">Clear</button>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="stats">
      <span>Total: <strong id="total-count">0</strong></span>
      <span>Showing: <strong id="showing-count">0</strong></span>
      <span>Last updated: <strong id="last-updated">-</strong></span>
    </div>
    <div class="log-list" id="log-list">
      <div class="empty">
        <div class="empty-icon">&#128196;</div>
        <div>No logs yet</div>
      </div>
    </div>
  </div>
  <script>
    let allLogs = [];
    let autoRefresh = true;
    let refreshInterval = null;

    async function fetchLogs() {
      try {
        const level = document.getElementById('level-filter').value;
        const tool = document.getElementById('tool-filter').value;
        const search = document.getElementById('search').value;
        const params = new URLSearchParams();
        if (level) params.set('level', level);
        if (tool) params.set('tool', tool);
        if (search) params.set('search', search);
        params.set('limit', '500');

        const res = await fetch('/api/logs?' + params);
        const data = await res.json();
        allLogs = data.logs || [];

        // Update tool filter options
        const toolFilter = document.getElementById('tool-filter');
        const currentTool = toolFilter.value;
        toolFilter.innerHTML = '<option value="">All Tools</option>';
        (data.tools || []).forEach(t => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          if (t === currentTool) opt.selected = true;
          toolFilter.appendChild(opt);
        });

        renderLogs(allLogs);
        document.getElementById('total-count').textContent = data.total || 0;
        document.getElementById('showing-count').textContent = allLogs.length;
        document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
      } catch (e) {
        console.error('Failed to fetch logs:', e);
      }
    }

    function renderLogs(logs) {
      const list = document.getElementById('log-list');
      if (logs.length === 0) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">&#128196;</div><div>No logs match your filters</div></div>';
        return;
      }
      list.innerHTML = logs.slice().reverse().map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level || 'info';
        const tool = log.tool || '-';
        const message = escapeHtml(log.message || '');
        return \`<div class="log-entry">
          <div class="log-time">\${time}</div>
          <div class="log-level level-\${level}">\${level}</div>
          <div class="log-tool">\${tool}</div>
          <div class="log-message">\${message}</div>
        </div>\`;
      }).join('');
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function clearLogs() {
      if (!confirm('Clear all logs? This cannot be undone.')) return;
      await fetch('/api/logs', { method: 'DELETE' });
      fetchLogs();
    }

    function exportLogs() {
      const blob = new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bat-logs-' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    document.getElementById('auto-refresh').addEventListener('change', (e) => {
      autoRefresh = e.target.checked;
      if (autoRefresh) {
        refreshInterval = setInterval(fetchLogs, 2000);
      } else {
        clearInterval(refreshInterval);
      }
    });

    document.getElementById('level-filter').addEventListener('change', fetchLogs);
    document.getElementById('tool-filter').addEventListener('change', fetchLogs);
    document.getElementById('search').addEventListener('input', debounce(fetchLogs, 300));

    function debounce(fn, ms) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
      };
    }

    // Initial load
    fetchLogs();
    refreshInterval = setInterval(fetchLogs, 2000);
  </script>
</body>
</html>`;
}

function getToolsHTML() {
  const categories = {};
  for (const [name, tool] of Object.entries(TOOLS)) {
    // Categorize by naming convention
    let category = 'Other';
    if (name.includes('navigate') || name === 'reload') category = 'Navigation';
    else if (name.includes('screenshot') || name.includes('read_page') || name.includes('get_html') || name.includes('get_text') || name === 'save_pdf') category = 'Screenshots & Content';
    else if (name.includes('click') || name === 'type' || name === 'fill' || name === 'select' || name === 'check' || name === 'focus' || name === 'blur' || name === 'hover') category = 'Interaction';
    else if (name.includes('scroll')) category = 'Scrolling';
    else if (name.includes('tab')) category = 'Tabs';
    else if (name.includes('window')) category = 'Windows';
    else if (name.includes('wait') || name === 'poll_until') category = 'Wait';
    else if (name.includes('cookie') || name.includes('session')) category = 'Cookies & Session';
    else if (name.includes('storage')) category = 'Storage';
    else if (name.includes('find') || name.includes('element') || name === 'count_elements' || name === 'get_all_text') category = 'Element Queries';
    else if (name.includes('form') || name.includes('table')) category = 'Forms & Tables';
    else if (name.includes('frame')) category = 'Frames';
    else if (name.includes('network') || name.includes('url') || name === 'mock_response' || name === 'clear_mocks') category = 'Network';
    else if (name.includes('dialog')) category = 'Dialogs';
    else if (name.includes('console') || name.includes('error')) category = 'Console';
    else if (name.includes('assert')) category = 'Assertions';
    else if (name === 'ping' || name === 'get_tools' || name === 'retry') category = 'Utility';
    else if (name.includes('keyboard') || name === 'press') category = 'Keyboard';
    else if (name.includes('mouse') || name === 'drag') category = 'Mouse';
    else if (name.includes('download') || name === 'set_file') category = 'Files';
    else if (name.includes('user_agent') || name.includes('geolocation') || name === 'emulate_device') category = 'Device';
    else if (name.includes('clipboard')) category = 'Clipboard';
    else if (name.includes('cache') || name.includes('browsing_data')) category = 'Browser';
    else if (name.includes('script') || name === 'evaluate') category = 'Scripts';
    else if (name.includes('attribute') || name.includes('style') || name.includes('element') || name.includes('html')) category = 'DOM';

    if (!categories[category]) categories[category] = [];
    categories[category].push({ name, ...tool });
  }

  const sortedCategories = Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]));
  const toolsHtml = sortedCategories.map(([cat, catTools]) => {
    const toolsList = catTools.map(t => {
      const args = t.args.map(a => a.endsWith('?') ? '<span class="optional">' + a.slice(0,-1) + '</span>' : a).join(', ');
      return '<div class="tool">' +
        '<div class="tool-name">' + t.name + '</div>' +
        '<div class="tool-args">' + (args || '<span class="none">none</span>') + '</div>' +
        '<div class="tool-desc">' + t.desc + '</div>' +
      '</div>';
    }).join('');
    return '<div class="category">' +
      '<h2>' + cat + ' <span class="count">(' + catTools.length + ')</span></h2>' +
      toolsList +
    '</div>';
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tools - Browser Automation Toolkit</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      padding: 24px;
    }
    .header {
      max-width: 1200px;
      margin: 0 auto 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      font-size: 20px;
    }
    .header h1 a {
      color: #666;
      text-decoration: none;
    }
    .header h1 a:hover { color: #2563eb; }
    .header .total {
      color: #666;
      font-size: 14px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
    }
    .category {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .category h2 {
      font-size: 16px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
      color: #2563eb;
    }
    .category h2 .count {
      color: #999;
      font-weight: 400;
      font-size: 14px;
    }
    .tool {
      padding: 12px 0;
      border-bottom: 1px solid #f5f5f5;
    }
    .tool:last-child { border-bottom: none; }
    .tool-name {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }
    .tool-args {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    .tool-args .optional { color: #999; }
    .tool-args .none { color: #ccc; font-style: italic; }
    .tool-desc {
      font-size: 13px;
      color: #666;
      margin-top: 6px;
      line-height: 1.4;
    }
    @media (max-width: 500px) {
      .container { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1><a href="/">BAT</a> / Tools</h1>
    <div class="total">${Object.keys(TOOLS).length} tools available</div>
  </div>
  <div class="container">
    ${toolsHtml}
  </div>
</body>
</html>`;
}

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

  // Root - HTML menu page
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getMenuHTML());
    return;
  }

  // Logs viewer - HTML page
  if (req.method === 'GET' && url.pathname === '/logs') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getLogsHTML());
    return;
  }

  // Tools reference - HTML page
  if (req.method === 'GET' && url.pathname === '/tools') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getToolsHTML());
    return;
  }

  // API: Status (JSON)
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      name: 'browser-automation-toolkit',
      version: VERSION,
      uptime,
      tools: Object.keys(TOOLS).length,
      logs: logs.length
    }));
    return;
  }

  // API: List tools (JSON)
  if (req.method === 'GET' && url.pathname === '/api/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: TOOLS, count: Object.keys(TOOLS).length }));
    return;
  }

  // API: Get logs (JSON)
  if (req.method === 'GET' && url.pathname === '/api/logs') {
    const level = url.searchParams.get('level');
    const tool = url.searchParams.get('tool');
    const search = url.searchParams.get('search');
    const since = url.searchParams.get('since');
    const limit = parseInt(url.searchParams.get('limit')) || 100;

    let filtered = logs;

    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }
    if (tool) {
      filtered = filtered.filter(log => log.tool === tool);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(log =>
        (log.message && log.message.toLowerCase().includes(searchLower)) ||
        (log.tool && log.tool.toLowerCase().includes(searchLower))
      );
    }
    if (since) {
      const sinceDate = new Date(since);
      filtered = filtered.filter(log => new Date(log.timestamp) >= sinceDate);
    }

    // Get last N logs
    const result = filtered.slice(-limit);
    const filters = getLogFilters();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      logs: result,
      count: result.length,
      total: logs.length,
      levels: filters.levels,
      tools: filters.tools
    }));
    return;
  }

  // API: Delete logs
  if (req.method === 'DELETE' && url.pathname === '/api/logs') {
    clearLogs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Logs cleared' }));
    return;
  }

  // API: Receive log from extension
  if (req.method === 'POST' && url.pathname === '/log') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        const log = addLog(entry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: log.id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
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
        const commandId = command.id || `cmd_${Date.now()}`;
        pendingCommand = {
          id: commandId,
          tool: command.tool,
          args: command.args || {},
          tabId: command.tabId,
          subtaskId: command.subtaskId || null
        };

        // Store subtaskId -> tabId mapping for future multi-browser routing
        if (command.subtaskId && command.tabId) {
          subtaskBrowserMap.set(command.subtaskId, command.tabId);
        }

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

  // Batch commands endpoint - execute multiple commands sequentially
  if (req.method === 'POST' && url.pathname === '/commands') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const batch = JSON.parse(body);
        const { commands, subtaskId } = batch;

        if (!Array.isArray(commands) || commands.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Commands must be a non-empty array' }));
          return;
        }

        const results = [];
        let lastRef = null;
        let hasError = false;

        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i];

          if (!cmd.tool) {
            results.push({
              success: false,
              index: i,
              error: 'Missing tool parameter'
            });
            hasError = true;
            break;
          }

          // Resolve $prev reference
          const args = { ...cmd.args };
          if (args.ref === '$prev' && lastRef) {
            args.ref = lastRef;
          }

          // Queue command for extension
          const commandId = cmd.id || `batch_${Date.now()}_${i}`;
          pendingCommand = {
            id: commandId,
            tool: cmd.tool,
            args,
            tabId: cmd.tabId,
            subtaskId: subtaskId || null
          };

          // Wait for result
          const resultPromise = new Promise(resolve => {
            resultResolve = resolve;
          });

          const timeoutPromise = new Promise(resolve => {
            setTimeout(() => {
              pendingCommand = null;
              resolve({ error: 'timeout', message: `Command ${i} timed out after ${TIMEOUT_MS}ms` });
            }, TIMEOUT_MS);
          });

          const result = await Promise.race([resultPromise, timeoutPromise]);
          resultResolve = null;

          // Track ref for next command
          if (result.success !== false && !result.error && result.result?.ref) {
            lastRef = result.result.ref;
          }

          results.push({
            success: result.success !== false && !result.error,
            index: i,
            tool: cmd.tool,
            description: cmd.description || '',
            result: result.result || null,
            error: result.error || null
          });

          // Stop on error
          if (result.error || result.success === false) {
            hasError = true;
            break;
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: !hasError,
          subtaskId: subtaskId || null,
          commandsExecuted: results.length,
          commandsTotal: commands.length,
          results
        }));
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
  // Initialize logs from file
  initLogs();

  server.listen(PORT, HOST, () => {
    console.log(`Browser Automation Toolkit v${VERSION} - Command Server`);
    console.log(`Listening on http://${HOST}:${PORT}`);
    console.log(`Tools available: ${Object.keys(TOOLS).length}`);
    console.log(`Command timeout: ${TIMEOUT_MS}ms`);
    console.log('');
    console.log('Web UI:');
    console.log(`  http://${HOST}:${PORT}/        - Dashboard`);
    console.log(`  http://${HOST}:${PORT}/logs    - Logs viewer`);
    console.log(`  http://${HOST}:${PORT}/tools   - Tools reference`);
    console.log('');
    console.log('API Endpoints:');
    console.log(`  GET  /api/status  - Server status (JSON)`);
    console.log(`  GET  /api/tools   - List all tools (JSON)`);
    console.log(`  GET  /api/logs    - Get logs with filtering (JSON)`);
    console.log(`  POST /log         - Submit log from extension`);
    console.log(`  POST /command     - Send single command`);
    console.log(`  POST /commands    - Send batch commands`);
  });
}

export { server, TOOLS, addLog, logs };
