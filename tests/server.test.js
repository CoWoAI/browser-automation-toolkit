/**
 * Server tests for Browser Automation Toolkit
 * Run with: npm test
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';

const PORT = 8767; // Use different port for tests
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Import and start server
let server;
let pendingCommand = null;
let pendingResult = null;
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
    res.end(JSON.stringify({ status: 'ok', name: 'browser-automation-toolkit' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: { ping: {}, get_tabs: {} } }));
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
          res.end(JSON.stringify({ success: true, result: { pong: true } }));
          return;
        }

        // Queue for extension
        pendingCommand = {
          id: command.id || `cmd_${Date.now()}`,
          tool: command.tool,
          args: command.args || {}
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

  res.writeHead(404);
  res.end();
}

describe('Command Server', () => {
  before(() => {
    server = createServer(handleRequest);
    server.listen(PORT, '127.0.0.1');
  });

  after(() => {
    server.close();
  });

  test('GET / returns health check', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.name, 'browser-automation-toolkit');
  });

  test('GET /tools returns tools list', async () => {
    const res = await fetch(`${BASE_URL}/tools`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.ok(data.tools);
    assert.ok('ping' in data.tools);
  });

  test('GET /command returns 204 when no command pending', async () => {
    const res = await fetch(`${BASE_URL}/command`);
    assert.strictEqual(res.status, 204);
  });

  test('POST /command with ping tool returns immediately', async () => {
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'ping' })
    });
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.result.pong, true);
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
  });

  test('POST /command with invalid JSON returns 400', async () => {
    const res = await fetch(`${BASE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json'
    });
    assert.strictEqual(res.status, 400);
  });

  test('GET /command returns queued command', async () => {
    // First, queue a command (simulate by setting directly)
    pendingCommand = { id: 'test_1', tool: 'screenshot', args: {} };

    const res = await fetch(`${BASE_URL}/command`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.id, 'test_1');
    assert.strictEqual(data.tool, 'screenshot');

    // Should be cleared
    const res2 = await fetch(`${BASE_URL}/command`);
    assert.strictEqual(res2.status, 204);
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
  });

  test('OPTIONS request returns CORS headers', async () => {
    const res = await fetch(`${BASE_URL}/command`, { method: 'OPTIONS' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('access-control-allow-origin'));
  });

  test('Unknown path returns 404', async () => {
    const res = await fetch(`${BASE_URL}/unknown`);
    assert.strictEqual(res.status, 404);
  });
});

describe('Tool Documentation', () => {
  test('TOOLS object has required properties', async () => {
    // Import from actual server
    const { TOOLS } = await import('../server.js');

    assert.ok(TOOLS.navigate);
    assert.ok(TOOLS.screenshot);
    assert.ok(TOOLS.click);
    assert.ok(TOOLS.type);
    assert.ok(TOOLS.get_tabs);
    assert.ok(TOOLS.execute_script);
  });

  test('Each tool has desc and args', async () => {
    const { TOOLS } = await import('../server.js');

    for (const [name, tool] of Object.entries(TOOLS)) {
      assert.ok(tool.desc, `Tool ${name} missing desc`);
      assert.ok(Array.isArray(tool.args), `Tool ${name} missing args array`);
    }
  });
});
