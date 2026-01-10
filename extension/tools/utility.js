/**
 * Utility tools
 */

// Import will be circular - tools object will be passed from index.js
let toolsRegistry = null;

/**
 * Set the tools registry for retry to access
 * @param {Object} tools - The tools registry object
 */
export function setToolsRegistry(tools) {
  toolsRegistry = tools;
}

/**
 * Ping - health check
 */
export async function ping() {
  return { success: true, pong: true, timestamp: Date.now() };
}

/**
 * Get list of available tools
 */
export async function get_tools() {
  const toolNames = toolsRegistry ? Object.keys(toolsRegistry) : [];
  return { success: true, tools: toolNames, count: toolNames.length };
}

/**
 * Retry a tool multiple times
 */
export async function retry({ tool, args, maxAttempts = 3, delay = 1000 }, tabId) {
  if (!toolsRegistry) {
    return { success: false, error: 'Tools registry not initialized' };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const handler = toolsRegistry[tool];
    if (!handler) {
      return { success: false, error: `Unknown tool: ${tool}` };
    }

    const result = await handler(args, tabId);
    if (result?.success) {
      return { ...result, attempt };
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { success: false, error: `Failed after ${maxAttempts} attempts` };
}
