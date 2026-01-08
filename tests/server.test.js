/**
 * Browser Automation Toolkit - Comprehensive Server Tests
 * Run with: npm test
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';

const PORT = 8767; // Use different port for tests
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Test server implementation (mirrors server.js behavior)
let server;
let pendingCommand = null;
let resultResolve = null;

function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, BASE_URL);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', name: 'browser-automation-toolkit', version: '2.1.0' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: { ping: { args: [], desc: 'Health check' }, get_tabs: { args: [], desc: 'List tabs' } }, count: 2 }));
    return;
  }

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

  if (req.method === 'POST' && url.pathname === '/command') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const command = JSON.parse(body);

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
          res.end(JSON.stringify({ success: true, result: { tools: {}, count: 0 } }));
          return;
        }

        // Queue for extension
        pendingCommand = {
          id: command.id || `cmd_${Date.now()}`,
          tool: command.tool,
          args: command.args || {},
          tabId: command.tabId
        };

        // Wait for result (short timeout for tests)
        const resultPromise = new Promise(resolve => {
          resultResolve = resolve;
        });

        const timeoutPromise = new Promise(resolve => {
          setTimeout(() => resolve({ error: 'timeout' }), 1000);
        });

        const result = await Promise.race([resultPromise, timeoutPromise]);
        resultResolve = null;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

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

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ============ TEST SUITES ============

describe('Server HTTP Endpoints', () => {
  before(() => {
    server = createServer(handleRequest);
    server.listen(PORT, '127.0.0.1');
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    pendingCommand = null;
    resultResolve = null;
  });

  test('GET / returns health check with version', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.name, 'browser-automation-toolkit');
    assert.strictEqual(data.version, '2.1.0');
  });

  test('GET /tools returns tools list with count', async () => {
    const res = await fetch(`${BASE_URL}/tools`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.ok(data.tools);
    assert.ok(typeof data.count === 'number');
    assert.ok('ping' in data.tools);
  });

  test('GET /command returns 204 when no command pending', async () => {
    const res = await fetch(`${BASE_URL}/command`);
    assert.strictEqual(res.status, 204);
  });

  test('GET /command returns queued command', async () => {
    pendingCommand = { id: 'test_1', tool: 'screenshot', args: {} };

    const res = await fetch(`${BASE_URL}/command`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.id, 'test_1');
    assert.strictEqual(data.tool, 'screenshot');

    // Should be cleared after retrieval
    const res2 = await fetch(`${BASE_URL}/command`);
    assert.strictEqual(res2.status, 204);
  });

  test('POST /command with ping returns immediately', async () => {
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'ping' })
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.result.pong, true);
    assert.ok(data.result.timestamp);
  });

  test('POST /command with get_tools returns immediately', async () => {
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_tools' })
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.result.tools !== undefined);
  });

  test('POST /command without tool returns 400', async () => {
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.includes('Missing tool'));
  });

  test('POST /command with invalid JSON returns 400', async () => {
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json'
    });
    assert.strictEqual(res.status, 400);

    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.includes('Invalid JSON'));
  });

  test('POST /result resolves pending command', async () => {
    // Start a command that will wait
    const commandPromise = fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_tabs' })
    });

    // Wait a bit for the command to be queued
    await new Promise(r => setTimeout(r, 50));

    // Simulate extension polling and returning result
    const pollRes = await fetch(`${BASE_URL}/command`);
    if (pollRes.status === 200) {
      const cmd = await pollRes.json();

      // Post result
      await fetch(`${BASE_URL}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cmd.id, success: true, result: { tabs: [] } })
      });
    }

    // Original command should resolve
    const res = await commandPromise;
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.deepStrictEqual(data.result.tabs, []);
  });

  test('POST /command times out without extension response', async () => {
    const start = Date.now();
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'screenshot' })
    });
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.error, 'timeout');
    assert.ok(elapsed >= 900 && elapsed < 2000, `Expected ~1000ms timeout, got ${elapsed}ms`);
  });

  test('OPTIONS request returns CORS headers', async () => {
    const res = await fetch(`${BASE_URL}/command`, { method: 'OPTIONS' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('access-control-allow-origin'));
    assert.ok(res.headers.get('access-control-allow-methods'));
    assert.ok(res.headers.get('access-control-allow-headers'));
  });

  test('Unknown path returns 404', async () => {
    const res = await fetch(`${BASE_URL}/unknown`);
    assert.strictEqual(res.status, 404);
  });
});

describe('Tool Documentation', () => {
  test('TOOLS object has comprehensive tool definitions', async () => {
    const { TOOLS } = await import('../server.js');

    // Navigation
    assert.ok(TOOLS.navigate, 'navigate tool exists');
    assert.ok(TOOLS.reload, 'reload tool exists');

    // Screenshots
    assert.ok(TOOLS.screenshot, 'screenshot tool exists');
    assert.ok(TOOLS.screenshot_element, 'screenshot_element tool exists');
    assert.ok(TOOLS.screenshot_full_page, 'screenshot_full_page tool exists');
    assert.ok(TOOLS.read_page, 'read_page tool exists');
    assert.ok(TOOLS.get_html, 'get_html tool exists');
    assert.ok(TOOLS.get_text, 'get_text tool exists');

    // Interaction
    assert.ok(TOOLS.click, 'click tool exists');
    assert.ok(TOOLS.type, 'type tool exists');
    assert.ok(TOOLS.fill, 'fill tool exists');
    assert.ok(TOOLS.select, 'select tool exists');
    assert.ok(TOOLS.check, 'check tool exists');
    assert.ok(TOOLS.hover, 'hover tool exists');

    // DOM
    assert.ok(TOOLS.remove_element, 'remove_element tool exists');
    assert.ok(TOOLS.hide_element, 'hide_element tool exists');
    assert.ok(TOOLS.show_element, 'show_element tool exists');
    assert.ok(TOOLS.highlight_element, 'highlight_element tool exists');

    // Keyboard/Mouse
    assert.ok(TOOLS.press, 'press tool exists');
    assert.ok(TOOLS.keyboard, 'keyboard tool exists');
    assert.ok(TOOLS.mouse, 'mouse tool exists');
    assert.ok(TOOLS.drag, 'drag tool exists');

    // Scrolling
    assert.ok(TOOLS.scroll, 'scroll tool exists');
    assert.ok(TOOLS.scroll_to, 'scroll_to tool exists');
    assert.ok(TOOLS.scroll_to_bottom, 'scroll_to_bottom tool exists');
    assert.ok(TOOLS.infinite_scroll, 'infinite_scroll tool exists');

    // Tabs/Windows
    assert.ok(TOOLS.get_tabs, 'get_tabs tool exists');
    assert.ok(TOOLS.create_tab, 'create_tab tool exists');
    assert.ok(TOOLS.close_tab, 'close_tab tool exists');
    assert.ok(TOOLS.get_windows, 'get_windows tool exists');
    assert.ok(TOOLS.create_window, 'create_window tool exists');

    // Wait
    assert.ok(TOOLS.wait, 'wait tool exists');
    assert.ok(TOOLS.wait_for, 'wait_for tool exists');
    assert.ok(TOOLS.wait_for_navigation, 'wait_for_navigation tool exists');
    assert.ok(TOOLS.poll_until, 'poll_until tool exists');

    // Execute
    assert.ok(TOOLS.execute_script, 'execute_script tool exists');
    assert.ok(TOOLS.evaluate, 'evaluate tool exists');

    // Session & Cookies
    assert.ok(TOOLS.save_session, 'save_session tool exists');
    assert.ok(TOOLS.restore_session, 'restore_session tool exists');
    assert.ok(TOOLS.import_cookies, 'import_cookies tool exists');
    assert.ok(TOOLS.export_cookies, 'export_cookies tool exists');
    assert.ok(TOOLS.get_cookies, 'get_cookies tool exists');
    assert.ok(TOOLS.set_cookie, 'set_cookie tool exists');
    assert.ok(TOOLS.delete_cookies, 'delete_cookies tool exists');

    // Storage
    assert.ok(TOOLS.get_storage, 'get_storage tool exists');
    assert.ok(TOOLS.set_storage, 'set_storage tool exists');
    assert.ok(TOOLS.clear_storage, 'clear_storage tool exists');

    // Page Info
    assert.ok(TOOLS.get_url, 'get_url tool exists');
    assert.ok(TOOLS.get_title, 'get_title tool exists');
    assert.ok(TOOLS.get_viewport, 'get_viewport tool exists');

    // Element Queries
    assert.ok(TOOLS.find, 'find tool exists');
    assert.ok(TOOLS.find_all, 'find_all tool exists');
    assert.ok(TOOLS.find_by_text, 'find_by_text tool exists');
    assert.ok(TOOLS.get_element_info, 'get_element_info tool exists');
    assert.ok(TOOLS.count_elements, 'count_elements tool exists');

    // Forms
    assert.ok(TOOLS.fill_form, 'fill_form tool exists');
    assert.ok(TOOLS.submit_form, 'submit_form tool exists');
    assert.ok(TOOLS.get_form_data, 'get_form_data tool exists');

    // Tables
    assert.ok(TOOLS.get_table_data, 'get_table_data tool exists');

    // Frames
    assert.ok(TOOLS.get_frames, 'get_frames tool exists');
    assert.ok(TOOLS.switch_frame, 'switch_frame tool exists');
    assert.ok(TOOLS.switch_to_main, 'switch_to_main tool exists');

    // Files
    assert.ok(TOOLS.download, 'download tool exists');
    assert.ok(TOOLS.wait_for_download, 'wait_for_download tool exists');

    // Dialogs
    assert.ok(TOOLS.handle_dialog, 'handle_dialog tool exists');

    // Console/Errors
    assert.ok(TOOLS.get_console_logs, 'get_console_logs tool exists');
    assert.ok(TOOLS.get_page_errors, 'get_page_errors tool exists');

    // Network
    assert.ok(TOOLS.get_network_requests, 'get_network_requests tool exists');
    assert.ok(TOOLS.block_urls, 'block_urls tool exists');
    assert.ok(TOOLS.unblock_urls, 'unblock_urls tool exists');
    assert.ok(TOOLS.mock_response, 'mock_response tool exists');
    assert.ok(TOOLS.wait_for_request, 'wait_for_request tool exists');

    // Device
    assert.ok(TOOLS.set_user_agent, 'set_user_agent tool exists');
    assert.ok(TOOLS.set_geolocation, 'set_geolocation tool exists');
    assert.ok(TOOLS.emulate_device, 'emulate_device tool exists');

    // Clipboard
    assert.ok(TOOLS.get_clipboard, 'get_clipboard tool exists');
    assert.ok(TOOLS.set_clipboard, 'set_clipboard tool exists');

    // Browser State
    assert.ok(TOOLS.clear_cache, 'clear_cache tool exists');
    assert.ok(TOOLS.clear_browsing_data, 'clear_browsing_data tool exists');

    // Assertions
    assert.ok(TOOLS.assert_text, 'assert_text tool exists');
    assert.ok(TOOLS.assert_visible, 'assert_visible tool exists');
    assert.ok(TOOLS.assert_hidden, 'assert_hidden tool exists');
    assert.ok(TOOLS.assert_url, 'assert_url tool exists');
    assert.ok(TOOLS.assert_title, 'assert_title tool exists');
    assert.ok(TOOLS.assert_element_count, 'assert_element_count tool exists');

    // Utility
    assert.ok(TOOLS.ping, 'ping tool exists');
    assert.ok(TOOLS.get_tools, 'get_tools tool exists');
    assert.ok(TOOLS.retry, 'retry tool exists');
  });

  test('Each tool has desc and args properties', async () => {
    const { TOOLS } = await import('../server.js');

    for (const [name, tool] of Object.entries(TOOLS)) {
      assert.ok(typeof tool.desc === 'string', `Tool ${name} has string desc`);
      assert.ok(tool.desc.length > 0, `Tool ${name} has non-empty desc`);
      assert.ok(Array.isArray(tool.args), `Tool ${name} has args array`);
    }
  });

  test('Tool count is at least 80', async () => {
    const { TOOLS } = await import('../server.js');
    const toolCount = Object.keys(TOOLS).length;
    assert.ok(toolCount >= 80, `Expected at least 80 tools, got ${toolCount}`);
  });
});

describe('Command Flow', () => {
  before(() => {
    server = createServer(handleRequest);
    server.listen(PORT + 1, '127.0.0.1');
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    pendingCommand = null;
    resultResolve = null;
  });

  test('Command includes all fields', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 1}`;

    // Queue a command
    const commandPromise = fetch(`${testUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'navigate',
        args: { url: 'https://example.com' },
        tabId: 123
      })
    });

    await new Promise(r => setTimeout(r, 50));

    // Poll for command
    const pollRes = await fetch(`${testUrl}/command`);
    assert.strictEqual(pollRes.status, 200);

    const cmd = await pollRes.json();
    assert.ok(cmd.id, 'Command has id');
    assert.strictEqual(cmd.tool, 'navigate');
    assert.deepStrictEqual(cmd.args, { url: 'https://example.com' });
    assert.strictEqual(cmd.tabId, 123);

    // Return result
    await fetch(`${testUrl}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cmd.id, success: true, result: {} })
    });

    await commandPromise;
  });

  test('Custom command ID is preserved', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 1}`;

    const commandPromise = fetch(`${testUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'custom_id_123',
        tool: 'get_url'
      })
    });

    await new Promise(r => setTimeout(r, 50));

    const pollRes = await fetch(`${testUrl}/command`);
    const cmd = await pollRes.json();
    assert.strictEqual(cmd.id, 'custom_id_123');

    await fetch(`${testUrl}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cmd.id, success: true, result: {} })
    });

    await commandPromise;
  });
});

describe('Error Handling', () => {
  before(() => {
    server = createServer(handleRequest);
    server.listen(PORT + 2, '127.0.0.1');
  });

  after(() => {
    server.close();
  });

  test('POST /result with invalid JSON returns 400', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 2}`;
    const res = await fetch(`${testUrl}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json'
    });
    assert.strictEqual(res.status, 400);
  });

  test('POST /result without pending command succeeds', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 2}`;
    const res = await fetch(`${testUrl}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'unknown', success: true })
    });
    assert.strictEqual(res.status, 200);
  });
});

describe('CORS Support', () => {
  before(() => {
    server = createServer(handleRequest);
    server.listen(PORT + 3, '127.0.0.1');
  });

  after(() => {
    server.close();
  });

  test('All responses have CORS headers', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 3}`;
    const endpoints = ['/', '/tools', '/command'];

    for (const endpoint of endpoints) {
      const res = await fetch(`${testUrl}${endpoint}`);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), '*', `${endpoint} has CORS origin`);
    }
  });

  test('Preflight request is handled correctly', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 3}`;
    const res = await fetch(`${testUrl}/command`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:8080',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('access-control-allow-origin'));
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
    assert.ok(res.headers.get('access-control-allow-headers').includes('Content-Type'));
  });
});

// ============ BATCH COMMANDS TESTS ============

describe('Batch Commands Endpoint', () => {
  let batchServer;
  let batchPendingCommand = null;
  let batchResultResolve = null;

  function handleBatchRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORT + 4}`);

    // Extension polls for command
    if (req.method === 'GET' && url.pathname === '/command') {
      if (batchPendingCommand) {
        const cmd = batchPendingCommand;
        batchPendingCommand = null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cmd));
      } else {
        res.writeHead(204);
        res.end();
      }
      return;
    }

    // Result from extension
    if (req.method === 'POST' && url.pathname === '/result') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (batchResultResolve) {
            batchResultResolve(result);
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

    // Batch commands endpoint
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
              results.push({ success: false, index: i, error: 'Missing tool parameter' });
              hasError = true;
              break;
            }

            // Handle server-side tools
            if (cmd.tool === 'ping') {
              results.push({
                success: true,
                index: i,
                tool: 'ping',
                result: { pong: true }
              });
              continue;
            }

            // Resolve $prev reference
            const args = { ...cmd.args };
            if (args.ref === '$prev' && lastRef) {
              args.ref = lastRef;
            }

            // Queue for extension
            batchPendingCommand = {
              id: `batch_${Date.now()}_${i}`,
              tool: cmd.tool,
              args,
              subtaskId
            };

            // Wait for result (short timeout for tests)
            const resultPromise = new Promise(resolve => {
              batchResultResolve = resolve;
            });

            const timeoutPromise = new Promise(resolve => {
              setTimeout(() => resolve({ error: 'timeout' }), 500);
            });

            const result = await Promise.race([resultPromise, timeoutPromise]);
            batchResultResolve = null;

            if (result.result?.ref) {
              lastRef = result.result.ref;
            }

            results.push({
              success: result.success !== false && !result.error,
              index: i,
              tool: cmd.tool,
              result: result.result || null,
              error: result.error || null
            });

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
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  }

  before(() => {
    batchServer = createServer(handleBatchRequest);
    batchServer.listen(PORT + 4, '127.0.0.1');
  });

  after(() => {
    batchServer.close();
  });

  beforeEach(() => {
    batchPendingCommand = null;
    batchResultResolve = null;
  });

  test('POST /commands with empty array returns 400', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 4}`;
    const res = await fetch(`${testUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [] })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('non-empty'));
  });

  test('POST /commands handles server-side ping tool', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 4}`;
    const res = await fetch(`${testUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [{ tool: 'ping' }],
        subtaskId: 'task1.1'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.subtaskId, 'task1.1');
    assert.strictEqual(data.commandsExecuted, 1);
    assert.strictEqual(data.results[0].tool, 'ping');
    assert.strictEqual(data.results[0].result.pong, true);
  });

  test('POST /commands includes subtaskId in response', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 4}`;
    const res = await fetch(`${testUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [{ tool: 'ping' }],
        subtaskId: 'task123.2'
      })
    });
    const data = await res.json();
    assert.strictEqual(data.subtaskId, 'task123.2');
  });

  test('POST /commands handles missing tool parameter', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 4}`;
    const res = await fetch(`${testUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [{ args: { url: 'test' } }]
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.results[0].error.includes('Missing tool'));
  });

  test('POST /commands with invalid JSON returns 400', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 4}`;
    const res = await fetch(`${testUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json'
    });
    assert.strictEqual(res.status, 400);
  });

  test('POST /commands returns correct counts', async () => {
    const testUrl = `http://127.0.0.1:${PORT + 4}`;
    const res = await fetch(`${testUrl}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { tool: 'ping' },
          { tool: 'ping' },
          { tool: 'ping' }
        ]
      })
    });
    const data = await res.json();
    assert.strictEqual(data.commandsTotal, 3);
    assert.strictEqual(data.commandsExecuted, 3);
    assert.strictEqual(data.results.length, 3);
  });
});
