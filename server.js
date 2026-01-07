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

// Available tools documentation
const TOOLS = {
  // Navigation
  navigate: { args: ['url?', 'direction?'], desc: 'Navigate to URL or back/forward/reload' },
  reload: { args: ['ignoreCache?'], desc: 'Reload current page' },

  // Screenshots & Page Content
  screenshot: { args: ['fullPage?', 'quality?', 'format?'], desc: 'Capture screenshot (viewport or full page)' },
  read_page: { args: ['filter?', 'depth?', 'ref_id?'], desc: 'Get accessibility tree' },
  get_html: { args: ['selector?', 'outer?'], desc: 'Get page HTML or element HTML' },
  get_text: { args: ['selector?'], desc: 'Get text content of page or element' },

  // Element Interaction
  click: { args: ['ref?', 'coordinate?', 'button?', 'clickCount?', 'modifiers?'], desc: 'Click element by ref or coordinates' },
  type: { args: ['text', 'ref?', 'delay?', 'clear?'], desc: 'Type text into element' },
  fill: { args: ['ref', 'value'], desc: 'Fill input/textarea with value (clears first)' },
  select: { args: ['ref', 'value'], desc: 'Select option in dropdown' },
  check: { args: ['ref', 'checked?'], desc: 'Check/uncheck checkbox or radio' },
  focus: { args: ['ref'], desc: 'Focus element' },
  blur: { args: ['ref'], desc: 'Blur (unfocus) element' },
  hover: { args: ['ref?', 'coordinate?'], desc: 'Hover over element' },

  // Keyboard
  press: { args: ['key', 'modifiers?'], desc: 'Press key (Enter, Tab, Escape, etc.)' },
  keyboard: { args: ['action', 'key?', 'text?'], desc: 'Low-level keyboard: down/up/press/type' },

  // Mouse
  mouse: { args: ['action', 'x?', 'y?', 'button?'], desc: 'Low-level mouse: move/down/up/click' },
  drag: { args: ['from', 'to'], desc: 'Drag from one point to another' },

  // Scrolling
  scroll: { args: ['direction?', 'amount?', 'ref?', 'coordinate?'], desc: 'Scroll page or to element' },
  scroll_to: { args: ['ref'], desc: 'Scroll element into view' },

  // Tabs
  get_tabs: { args: [], desc: 'List all browser tabs' },
  create_tab: { args: ['url?', 'active?'], desc: 'Create new tab' },
  close_tab: { args: ['tabId?'], desc: 'Close tab' },
  switch_tab: { args: ['tabId'], desc: 'Switch to tab' },

  // Wait
  wait: { args: ['ms'], desc: 'Wait for milliseconds' },
  wait_for: { args: ['ref?', 'selector?', 'state?', 'timeout?'], desc: 'Wait for element state' },
  wait_for_navigation: { args: ['timeout?'], desc: 'Wait for navigation to complete' },

  // Execute Script
  execute_script: { args: ['code', 'args?'], desc: 'Execute JavaScript in page context' },
  evaluate: { args: ['code', 'args?'], desc: 'Alias for execute_script' },

  // Cookies & Storage
  get_cookies: { args: ['url?', 'name?'], desc: 'Get cookies' },
  set_cookie: { args: ['cookie'], desc: 'Set cookie' },
  delete_cookies: { args: ['url?', 'name?'], desc: 'Delete cookies' },
  get_storage: { args: ['type', 'key?'], desc: 'Get localStorage/sessionStorage' },
  set_storage: { args: ['type', 'key', 'value'], desc: 'Set localStorage/sessionStorage item' },
  clear_storage: { args: ['type'], desc: 'Clear localStorage/sessionStorage' },

  // Page Info
  get_url: { args: [], desc: 'Get current page URL' },
  get_title: { args: [], desc: 'Get current page title' },
  get_viewport: { args: [], desc: 'Get viewport dimensions' },
  set_viewport: { args: ['width', 'height'], desc: 'Set viewport dimensions' },

  // Element Queries
  find: { args: ['selector'], desc: 'Find element by CSS selector, return ref' },
  find_all: { args: ['selector', 'limit?'], desc: 'Find all elements by CSS selector' },
  find_by_text: { args: ['text', 'exact?'], desc: 'Find element by text content' },
  get_element_info: { args: ['ref'], desc: 'Get element properties and attributes' },
  get_bounding_box: { args: ['ref'], desc: 'Get element position and size' },

  // Files & Downloads
  set_file: { args: ['ref', 'files'], desc: 'Set files on file input' },

  // Dialogs
  handle_dialog: { args: ['action', 'text?'], desc: 'Accept/dismiss dialog with optional text' },

  // PDF
  save_pdf: { args: ['options?'], desc: 'Save page as PDF (returns base64)' },

  // Network (limited from extension)
  get_network_requests: { args: ['filter?'], desc: 'Get captured network requests' },

  // Utility
  ping: { args: [], desc: 'Health check' },
  get_tools: { args: [], desc: 'List available tools' },
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
    res.end(JSON.stringify({ status: 'ok', name: 'browser-automation-toolkit', version: '1.0.0' }));
    return;
  }

  // List tools
  if (req.method === 'GET' && url.pathname === '/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: TOOLS }));
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
          res.end(JSON.stringify({ success: true, result: { tools: TOOLS } }));
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
  console.log(`Browser Automation Toolkit - Command Server`);
  console.log(`Listening on http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /          - Health check`);
  console.log(`  GET  /tools     - List available tools`);
  console.log(`  POST /command   - Send command (waits for result)`);
  console.log(`  GET  /command   - Extension polls for command`);
  console.log(`  POST /result    - Extension posts result`);
  console.log('');
  console.log('Example:');
  console.log(`  curl -X POST http://127.0.0.1:${PORT}/command -H "Content-Type: application/json" -d '{"tool": "screenshot"}'`);
  });
}

export { server, TOOLS };
