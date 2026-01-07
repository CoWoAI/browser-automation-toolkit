# Browser Automation Toolkit

Control Chrome via HTTP API through a browser extension. Simple, fast, no WebDriver required.

## Quick Start

```bash
# 1. Start the server
node server.js

# 2. Load extension in Chrome
#    - Go to chrome://extensions
#    - Enable Developer mode
#    - Load unpacked → select extension/ directory

# 3. Send commands
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot"}'
```

## Architecture

```
Your App → HTTP POST → Server (8766) → Extension polls → Chrome → Result
```

Extension polls every 100ms. No WebSocket, no complex setup.

## Available Tools

### Navigation
| Tool | Args | Description |
|------|------|-------------|
| `navigate` | `url`, `direction` | Navigate to URL or back/forward/reload |
| `reload` | `ignoreCache` | Reload page |

### Screenshots & Content
| Tool | Args | Description |
|------|------|-------------|
| `screenshot` | `fullPage`, `format`, `quality` | Capture viewport |
| `read_page` | `filter`, `depth`, `ref_id` | Get accessibility tree |
| `get_html` | `selector`, `outer` | Get page/element HTML |
| `get_text` | `selector` | Get text content |

### Element Interaction
| Tool | Args | Description |
|------|------|-------------|
| `click` | `ref`, `coordinate`, `button`, `clickCount` | Click element |
| `type` | `text`, `ref`, `clear` | Type into element |
| `fill` | `ref`, `value` | Fill input (clears first) |
| `select` | `ref`, `value` | Select dropdown option |
| `check` | `ref`, `checked` | Check/uncheck checkbox |
| `focus` | `ref` | Focus element |
| `blur` | `ref` | Blur element |
| `hover` | `ref`, `coordinate` | Hover over element |

### Keyboard & Mouse
| Tool | Args | Description |
|------|------|-------------|
| `press` | `key`, `modifiers` | Press key (Enter, Tab, etc.) |
| `keyboard` | `action`, `key`, `text` | Low-level keyboard control |
| `mouse` | `action`, `x`, `y`, `button` | Low-level mouse control |
| `drag` | `from`, `to` | Drag between points |
| `scroll` | `direction`, `amount`, `ref` | Scroll page |
| `scroll_to` | `ref` | Scroll element into view |

### Tabs
| Tool | Args | Description |
|------|------|-------------|
| `get_tabs` | | List all tabs |
| `create_tab` | `url`, `active` | Create new tab |
| `close_tab` | `tabId` | Close tab |
| `switch_tab` | `tabId` | Switch to tab |

### Wait
| Tool | Args | Description |
|------|------|-------------|
| `wait` | `ms` | Wait milliseconds |
| `wait_for` | `selector`, `ref`, `state`, `timeout` | Wait for element |
| `wait_for_navigation` | `timeout` | Wait for navigation |

### Execute Script
| Tool | Args | Description |
|------|------|-------------|
| `execute_script` | `code`, `args` | Run JavaScript |
| `evaluate` | `code`, `args` | Alias for execute_script |

### Cookies & Storage
| Tool | Args | Description |
|------|------|-------------|
| `get_cookies` | `url`, `name` | Get cookies |
| `set_cookie` | `cookie` | Set cookie |
| `delete_cookies` | `url`, `name` | Delete cookies |
| `get_storage` | `type`, `key` | Get localStorage/sessionStorage |
| `set_storage` | `type`, `key`, `value` | Set storage item |
| `clear_storage` | `type` | Clear storage |

### Element Queries
| Tool | Args | Description |
|------|------|-------------|
| `find` | `selector` | Find element, return ref |
| `find_all` | `selector`, `limit` | Find all matching elements |
| `find_by_text` | `text`, `exact` | Find by text content |
| `get_element_info` | `ref` | Get element properties |
| `get_bounding_box` | `ref` | Get element position/size |

### Page Info
| Tool | Args | Description |
|------|------|-------------|
| `get_url` | | Get current URL |
| `get_title` | | Get page title |
| `get_viewport` | | Get viewport dimensions |

## Examples

```bash
# Navigate to a page
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "navigate", "args": {"url": "https://example.com"}}'

# Take screenshot
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot"}' | jq -r '.result.image' | base64 -d > screenshot.png

# Find element and click
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "find", "args": {"selector": "button.submit"}}'
# Returns: {"success": true, "result": {"ref": "ref_1"}}

curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "click", "args": {"ref": "ref_1"}}'

# Type into input
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "find", "args": {"selector": "input[name=email]"}}'

curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "fill", "args": {"ref": "ref_2", "value": "test@example.com"}}'

# Execute JavaScript
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "execute_script", "args": {"code": "return document.title"}}'

# Wait for element
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "wait_for", "args": {"selector": ".loaded", "timeout": 5000}}'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/tools` | List available tools |
| POST | `/command` | Send command (waits for result) |
| GET | `/command` | Extension polls for commands |
| POST | `/result` | Extension posts results |

## Testing

```bash
npm test
```

## Client UI

A test UI is available:

```bash
cd client && python3 server.py
# Open http://127.0.0.1:8080
```

## License

MIT
