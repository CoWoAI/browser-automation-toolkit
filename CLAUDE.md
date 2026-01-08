# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser Automation Toolkit v2.0.0 - Control Chrome via HTTP API through a browser extension. No WebDriver required.

```
Your App → POST /command → server.js (8766) → Extension polls (100ms) → Chrome → Result
```

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

# Load cookie exporter (optional)
# chrome://extensions → Developer mode → Load unpacked → cookie-exporter/
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
│   ├── service-worker.js     # Tool handlers + HTTP polling
│   ├── content/
│   │   └── accessibility-tree.js  # DOM interaction + ref system
│   └── popup/                # Extension popup UI
├── cookie-exporter/          # Standalone cookie export extension
│   ├── manifest.json
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.js
│   └── README.md
└── client/
    ├── index.html            # Test UI
    └── server.py             # Simple HTTP server for UI
```

## Key Implementation Details

- **Polling interval**: 100ms (configurable in service-worker.js)
- **Command timeout**: 30 seconds (configurable in server.js)
- **Element refs**: WeakRef-based (`ref_1`, `ref_2`, etc.) to avoid memory leaks
- **Network capture**: Max 1000 requests stored in memory
- **Permissions**: `scripting`, `tabs`, `cookies`, `storage`, `downloads`, `debugger`, `webNavigation`, `webRequest`

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
```

## Testing

Tests use Node.js built-in test runner (requires Node 18+):

```bash
npm test
```

Tests cover:
- HTTP endpoints (/, /tools, /command, /result)
- Server-side tools (ping, get_tools)
- Command queuing and result handling
- Timeout behavior
- CORS headers
- Tool definitions validation (80+ tools)

## Security Notes

- Server listens only on 127.0.0.1 (localhost)
- Extension has broad permissions for full automation
- Session exports contain sensitive data (cookies, localStorage)
- Not recommended for production without additional security
- No authentication on HTTP API
