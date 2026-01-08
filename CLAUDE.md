# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser Automation Toolkit v2.1.0 - Control Chrome via HTTP API through a browser extension. No WebDriver required.

```
Your App → POST /command → server.js (8766) → Extension polls (configurable) → Chrome → Result
```

**New in v2.1.0:**
- SubtaskID support for future multi-browser routing
- Batch commands endpoint (`POST /commands`)
- Docker deployment support
- Configurable command timeout via `COMMAND_TIMEOUT` env var

## Commands

```bash
# Start server
node server.js               # Port 8766

# Run tests
npm test                     # Node.js built-in test runner

# Start client UI (optional)
cd client && python3 server.py   # Port 8080

# Load extension
# chrome://extensions → Developer mode → Load unpacked → extension/
```

## Project Structure

```
browser-automation-toolkit/
├── server.js                 # Node.js HTTP command server (80+ tools)
├── package.json              # Node.js project config (no dependencies)
├── tests/
│   └── server.test.js        # Comprehensive server tests
├── extension/
│   ├── manifest.json         # Manifest V3, broad permissions
│   ├── service-worker.js     # Tool handlers + HTTP polling + settings
│   ├── content/
│   │   └── accessibility-tree.js  # DOM interaction + ref system
│   └── popup/                # Extension popup UI (tabbed)
│       ├── popup.html        # Tabs: Cookies, Tools, Settings
│       ├── popup.css         # Styles
│       └── popup.js          # Cookie manager + tool executor + settings
└── client/
    ├── index.html            # Web UI for sending commands
    └── server.py             # Simple HTTP server for UI
```

## Extension Popup UI

The extension popup has three tabs:

### Cookies Tab
- **Export**: Export cookies (all or by domain) to JSON or Netscape format
- **Import**: Import cookies from JSON/Netscape file with `__Host-` cookie support
- **Manage**: View domain cookies, clear domain cookies, clear ALL cookies

### Tools Tab
- Execute tools directly from the popup
- Supports common tools: read_page, screenshot, click, navigate, etc.

### Settings Tab
- **Browser Control**: Enable/disable HTTP polling (for multi-browser setups)
- **Server URL**: Configure command server URL (default: http://127.0.0.1:8766)
- **Poll Interval**: Configure polling interval in ms (default: 100)

## Multi-Browser Setup

For transferring sessions between browsers:
- **Browser A** (control): Enable "Browser Control" in Settings
- **Browser B** (cookies only): Disable "Browser Control", use only Cookies tab

## Key Implementation Details

- **Polling interval**: Configurable via Settings (default 100ms)
- **Command timeout**: 30 seconds (configurable in server.js)
- **Element refs**: WeakRef-based (`ref_1`, `ref_2`, etc.) to avoid memory leaks
- **Network capture**: Max 1000 requests stored in memory
- **Permissions**: `scripting`, `tabs`, `cookies`, `storage`, `downloads`, `debugger`, `webNavigation`, `webRequest`, `declarativeNetRequest`, `browsingData`
- **Cookie prefixes**: Special handling for `__Host-` and `__Secure-` cookies

## Adding New Tools

1. Add to `TOOLS` object in `server.js`:
   ```javascript
   my_tool: {
     args: ['param1', 'param2?'],  // ? = optional
     desc: 'Description of what the tool does'
   }
   ```

2. Add handler in `tools` object in `extension/service-worker.js`:
   ```javascript
   async my_tool({ param1, param2 = 'default' }, tabId) {
     // Implementation
     return { success: true, result: {...} };
   }
   ```

3. If tool needs DOM access:
   ```javascript
   await ensureContentScript(tabId);
   return await exec(tabId, (p1, p2) => {
     // Runs in page context
   }, [param1, param2]);
   ```

4. If tool needs active tab, add to `tabRequiredTools` array in service-worker.js

## Tool Categories (80+ tools)

| Category | Examples |
|----------|----------|
| Navigation | `navigate`, `reload` |
| Screenshots | `screenshot`, `screenshot_element`, `read_page`, `get_html`, `get_text` |
| Interaction | `click`, `type`, `fill`, `select`, `check`, `focus`, `blur`, `hover` |
| DOM | `remove_element`, `hide_element`, `show_element`, `highlight_element`, `insert_html` |
| Keyboard/Mouse | `press`, `keyboard`, `mouse`, `drag` |
| Scrolling | `scroll`, `scroll_to`, `scroll_to_bottom`, `infinite_scroll` |
| Tabs | `get_tabs`, `create_tab`, `close_tab`, `switch_tab`, `duplicate_tab` |
| Windows | `get_windows`, `create_window`, `resize_window`, `maximize_window` |
| Wait | `wait`, `wait_for`, `wait_for_navigation`, `poll_until` |
| Script | `execute_script`, `evaluate` |
| Session | `save_session`, `restore_session`, `import_cookies`, `export_cookies` |
| Cookies/Storage | `get_cookies`, `set_cookie`, `get_storage`, `set_storage` |
| Element Queries | `find`, `find_all`, `find_by_text`, `get_element_info`, `count_elements` |
| Forms | `fill_form`, `submit_form`, `get_form_data`, `get_table_data` |
| Frames | `get_frames`, `switch_frame`, `switch_to_main` |
| Network | `get_network_requests`, `block_urls`, `mock_response`, `wait_for_request` |
| Console | `get_console_logs`, `get_page_errors` |
| Device | `set_user_agent`, `set_geolocation`, `emulate_device` |
| Clipboard | `get_clipboard`, `set_clipboard` |
| Browser | `clear_cache`, `clear_browsing_data` |
| Assertions | `assert_text`, `assert_visible`, `assert_url`, `assert_title` |
| Utility | `ping`, `get_tools`, `retry` |

## API

```bash
# Health check
curl http://127.0.0.1:8766/

# List all tools
curl http://127.0.0.1:8766/tools

# Send command
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot"}'

# Send command with args
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "navigate", "args": {"url": "https://example.com"}}'

# Send command to specific tab
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot", "tabId": 123}'

# Import cookies
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "import_cookies", "args": {"cookies": [...]}}'

# Send command with subtaskId (for multi-browser routing)
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot", "subtaskId": "task123.1"}'

# Batch commands (sequential execution)
curl -X POST http://127.0.0.1:8766/commands \
  -H "Content-Type: application/json" \
  -d '{"commands": [{"tool": "navigate", "args": {"url": "https://example.com"}}, {"tool": "screenshot"}], "subtaskId": "task123.1"}'
```

### Batch Commands Response

```json
{
  "success": true,
  "subtaskId": "task123.1",
  "commandsExecuted": 2,
  "commandsTotal": 2,
  "results": [
    {"success": true, "index": 0, "tool": "navigate", "result": {...}},
    {"success": true, "index": 1, "tool": "screenshot", "result": {...}}
  ]
}
```

### Reference Chaining

Use `"ref": "$prev"` to reference the result of the previous command:

```json
{
  "commands": [
    {"tool": "find", "args": {"selector": "button.submit"}},
    {"tool": "click", "args": {"ref": "$prev"}}
  ]
}
```

## Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t browser-automation-toolkit .
docker run -p 8766:8766 browser-automation-toolkit
```

**Note:** The server runs in Docker, but the Chrome extension runs in your browser. Configure the extension's server URL to point to the Docker container.

**Environment Variables:**
- `PORT`: Server port (default: 8766)
- `COMMAND_TIMEOUT`: Command timeout in ms (default: 30000)

## Testing

Tests use Node.js built-in test runner (requires Node 18+):

```bash
npm test
```

Tests cover:
- HTTP endpoints (/, /tools, /command, /commands, /result)
- Server-side tools (ping, get_tools)
- Command queuing and result handling
- Batch commands execution and error handling
- SubtaskID propagation
- Timeout behavior
- CORS headers
- Tool definitions validation (80+ tools)

## Security Notes

- Server listens only on 127.0.0.1 (localhost)
- Extension has broad permissions for full automation
- Session exports contain sensitive data (cookies, localStorage)
- Not recommended for production without additional security
- No authentication on HTTP API
- Browser Control can be disabled per-browser via Settings
