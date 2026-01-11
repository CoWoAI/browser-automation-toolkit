/**
 * Logger utility for sending logs to server
 *
 * Sends logs to the server via POST /log endpoint.
 * Falls back silently if server is unreachable.
 */

// Get server URL from settings or use default
async function getServerUrl() {
  try {
    const stored = await chrome.storage.local.get(['serverUrl']);
    return stored.serverUrl || 'http://127.0.0.1:8766';
  } catch {
    return 'http://127.0.0.1:8766';
  }
}

/**
 * Send log entry to server
 * @param {string} level - Log level: 'error', 'warn', 'info', 'debug'
 * @param {string} message - Log message
 * @param {Object} [meta={}] - Additional metadata (tool, tabId, url, details)
 */
async function sendLog(level, message, meta = {}) {
  try {
    const serverUrl = await getServerUrl();
    const entry = {
      level,
      message,
      ...meta
    };

    // Fire and forget - don't wait for response
    fetch(`${serverUrl}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {
      // Silent fail - server might be down
    });
  } catch {
    // Silent fail
  }
}

/**
 * Logger object with methods for each log level
 */
export const logger = {
  /**
   * Log an error
   * @param {string} message - Error message
   * @param {Object} [meta={}] - Additional metadata
   */
  error(message, meta = {}) {
    sendLog('error', message, meta);
  },

  /**
   * Log a warning
   * @param {string} message - Warning message
   * @param {Object} [meta={}] - Additional metadata
   */
  warn(message, meta = {}) {
    sendLog('warn', message, meta);
  },

  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} [meta={}] - Additional metadata
   */
  info(message, meta = {}) {
    sendLog('info', message, meta);
  },

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} [meta={}] - Additional metadata
   */
  debug(message, meta = {}) {
    sendLog('debug', message, meta);
  },

  /**
   * Log a tool error with context
   * @param {string} tool - Tool name
   * @param {Error|string} error - Error object or message
   * @param {Object} [context={}] - Additional context (tabId, url, args)
   */
  toolError(tool, error, context = {}) {
    const message = error instanceof Error ? error.message : String(error);
    sendLog('error', `Tool error (${tool}): ${message}`, {
      tool,
      ...context,
      details: error instanceof Error ? { stack: error.stack } : undefined
    });
  },

  /**
   * Log a tool warning
   * @param {string} tool - Tool name
   * @param {string} message - Warning message
   * @param {Object} [context={}] - Additional context
   */
  toolWarn(tool, message, context = {}) {
    sendLog('warn', `${tool}: ${message}`, { tool, ...context });
  },

  /**
   * Log tool execution info
   * @param {string} tool - Tool name
   * @param {string} message - Info message
   * @param {Object} [context={}] - Additional context
   */
  toolInfo(tool, message, context = {}) {
    sendLog('info', `${tool}: ${message}`, { tool, ...context });
  }
};

export default logger;
