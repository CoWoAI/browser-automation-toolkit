# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser automation toolkit that controls Chrome via HTTP API through a browser extension. No WebDriver required.

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
```

## Project Structure

```
browser-automation-toolkit/
├── server.js                 # Node.js HTTP command server
├── package.json              # Node.js project config
├── tests/
│   └── server.test.js        # Server tests
├── extension/
│   ├── manifest.json         # Manifest V3, broad permissions
│   ├── service-worker.js     # Tool handlers + HTTP polling
│   ├── content/
│   │   └── accessibility-tree.js  # DOM interaction + ref system
│   └── popup/                # Extension popup UI
└── client/
    ├── index.html            # Test UI
    └── server.py             # Simple HTTP server for UI
```

## Key Implementation Details

- **Polling interval**: 100ms (configurable in service-worker.js)
- **Command timeout**: 30 seconds (configurable in server.js)
- **Element refs**: WeakRef-based (`ref_1`, `ref_2`, etc.) to avoid memory leaks
- **Permissions**: broad (`scripting`, `tabs`, `cookies`, `storage`, `debugger`, `webNavigation`, `webRequest`)

## Adding New Tools

1. Add to `TOOLS` object in `server.js` (documentation)
2. Add handler in `tools` object in `extension/service-worker.js`
3. If tool needs DOM access, use `await ensureContentScript(tabId)` first
4. If tool needs active tab, add to `tabRequiredTools` array

## API

```bash
# Health check
curl http://127.0.0.1:8766/

# List tools
curl http://127.0.0.1:8766/tools

# Send command
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot"}'
```

## Tool Categories

| Category | Tools |
|----------|-------|
| Navigation | `navigate`, `reload` |
| Screenshots | `screenshot`, `read_page`, `get_html`, `get_text` |
| Interaction | `click`, `type`, `fill`, `select`, `check`, `focus`, `blur`, `hover` |
| Keyboard/Mouse | `press`, `keyboard`, `mouse`, `drag`, `scroll`, `scroll_to` |
| Tabs | `get_tabs`, `create_tab`, `close_tab`, `switch_tab` |
| Wait | `wait`, `wait_for`, `wait_for_navigation` |
| Script | `execute_script`, `evaluate` |
| Cookies/Storage | `get_cookies`, `set_cookie`, `delete_cookies`, `get_storage`, `set_storage`, `clear_storage` |
| Element Queries | `find`, `find_all`, `find_by_text`, `get_element_info`, `get_bounding_box` |
| Page Info | `get_url`, `get_title`, `get_viewport` |
