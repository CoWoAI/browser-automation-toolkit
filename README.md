# Browser Automation Toolkit

Control Chrome via HTTP API through a browser extension. Simple, fast, no WebDriver required.

**v2.1.0** - Now with 117 tools, Docker support, batch commands, and subtaskId for multi-browser routing.

## Quick Start

```bash
# 1. Start the server
node server.js              # Local
docker-compose up -d        # Docker

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
Your App → HTTP POST → Server (8766) → Extension polls (100ms) → Chrome → Result
```

- Extension polls every 100ms for commands
- No WebSocket, no complex setup
- 30 second command timeout (configurable)
- Element refs use WeakRef for memory safety

## Installation

### Node.js Server
```bash
npm install   # No dependencies!
node server.js
```

### Chrome Extension
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` directory

### Cookie Exporter (Optional)
A separate minimal extension for exporting/importing cookies between browsers:
1. Go to `chrome://extensions`
2. Load unpacked → select `cookie-exporter/` directory

## Available Tools (80+)

### Navigation
| Tool | Description |
|------|-------------|
| `navigate` | Navigate to URL or use direction: "back", "forward", "reload" |
| `reload` | Reload current page. Set ignoreCache=true to bypass cache |

### Screenshots & Page Content
| Tool | Description |
|------|-------------|
| `screenshot` | Capture viewport screenshot (png/jpeg) |
| `screenshot_element` | Capture screenshot of specific element |
| `screenshot_full_page` | Capture full scrollable page |
| `read_page` | Get accessibility tree (all/interactive elements) |
| `get_html` | Get HTML of page or element |
| `get_text` | Get text content of page or element |
| `save_pdf` | Save page as PDF (requires debugger API) |

### Element Interaction
| Tool | Description |
|------|-------------|
| `click` | Click element by ref or coordinates |
| `type` | Type text into element |
| `fill` | Fill input (clears existing content first) |
| `select` | Select dropdown option by value or text |
| `check` | Check/uncheck checkbox or radio |
| `focus` | Focus element |
| `blur` | Blur (unfocus) element |
| `hover` | Hover over element (triggers mouseenter/mouseover) |
| `set_attribute` | Set attribute on element |
| `remove_attribute` | Remove attribute from element |
| `set_style` | Set CSS style property |

### DOM Manipulation
| Tool | Description |
|------|-------------|
| `remove_element` | Remove element from DOM |
| `hide_element` | Hide element (display:none) |
| `show_element` | Show hidden element |
| `highlight_element` | Temporarily highlight element with colored border |
| `insert_html` | Insert HTML relative to element |

### Keyboard
| Tool | Description |
|------|-------------|
| `press` | Press key (Enter, Tab, Escape, ArrowDown, etc.) |
| `keyboard` | Low-level keyboard: down, up, press, type |

### Mouse
| Tool | Description |
|------|-------------|
| `mouse` | Low-level mouse: move, down, up, click |
| `drag` | Drag from [x,y] to [x,y] |

### Scrolling
| Tool | Description |
|------|-------------|
| `scroll` | Scroll page (up/down/left/right) |
| `scroll_to` | Scroll element into view |
| `scroll_to_bottom` | Scroll to page bottom |
| `scroll_to_top` | Scroll to page top |
| `infinite_scroll` | Keep scrolling until no new content |

### Tabs
| Tool | Description |
|------|-------------|
| `get_tabs` | List all browser tabs |
| `create_tab` | Create new tab |
| `close_tab` | Close tab |
| `switch_tab` | Switch to tab and focus window |
| `duplicate_tab` | Duplicate tab |

### Windows
| Tool | Description |
|------|-------------|
| `get_windows` | List all browser windows |
| `create_window` | Create new window (normal/popup/panel) |
| `close_window` | Close window |
| `resize_window` | Resize window |
| `move_window` | Move window |
| `maximize_window` | Maximize window |
| `minimize_window` | Minimize window |
| `fullscreen_window` | Fullscreen window |

### Wait
| Tool | Description |
|------|-------------|
| `wait` | Wait for milliseconds |
| `wait_for` | Wait for element (visible/hidden/attached) |
| `wait_for_navigation` | Wait for page navigation |
| `wait_for_network_idle` | Wait until no network requests |
| `poll_until` | Poll until JavaScript returns truthy |

### Execute Script
| Tool | Description |
|------|-------------|
| `execute_script` | Run JavaScript in page context |
| `evaluate` | Alias for execute_script |

### Session & Authentication
| Tool | Description |
|------|-------------|
| `save_session` | Save cookies + localStorage + sessionStorage |
| `restore_session` | Restore saved session |
| `import_cookies` | Import cookies (JSON or Netscape format) |
| `export_cookies` | Export cookies (JSON or Netscape format) |

### Cookies
| Tool | Description |
|------|-------------|
| `get_cookies` | Get cookies (filter by url/name) |
| `set_cookie` | Set cookie |
| `delete_cookies` | Delete cookies |

### Storage
| Tool | Description |
|------|-------------|
| `get_storage` | Get localStorage or sessionStorage |
| `set_storage` | Set storage item |
| `clear_storage` | Clear storage |

### Page Info
| Tool | Description |
|------|-------------|
| `get_url` | Get current URL |
| `get_title` | Get page title |
| `get_viewport` | Get viewport dimensions |

### Element Queries
| Tool | Description |
|------|-------------|
| `find` | Find first element by CSS selector |
| `find_all` | Find all elements matching selector |
| `find_by_text` | Find element containing text |
| `get_element_info` | Get element properties and attributes |
| `get_bounding_box` | Get element position and size |
| `count_elements` | Count elements matching selector |
| `get_all_text` | Get text from all matching elements |
| `click_all` | Click all elements matching selector |

### Forms
| Tool | Description |
|------|-------------|
| `fill_form` | Fill multiple form fields at once |
| `submit_form` | Submit form |
| `get_form_data` | Get all form field values |
| `clear_form` | Reset form |

### Tables
| Tool | Description |
|------|-------------|
| `get_table_data` | Extract table as array of objects |

### Frames
| Tool | Description |
|------|-------------|
| `get_frames` | List all iframes |
| `switch_frame` | Switch to frame |
| `switch_to_main` | Switch back to main frame |

### Files
| Tool | Description |
|------|-------------|
| `set_file` | Set files on file input |
| `download` | Download file from URL |
| `wait_for_download` | Wait for download to complete |

### Dialogs
| Tool | Description |
|------|-------------|
| `handle_dialog` | Handle alert/confirm/prompt |
| `get_dialog` | Get current dialog info |

### Console & Errors
| Tool | Description |
|------|-------------|
| `get_console_logs` | Get captured console logs |
| `get_page_errors` | Get captured JavaScript errors |
| `clear_console_logs` | Clear captured logs |

### Network
| Tool | Description |
|------|-------------|
| `get_network_requests` | Get captured network requests |
| `clear_network_requests` | Clear captured requests |
| `block_urls` | Block requests matching patterns |
| `unblock_urls` | Unblock URL patterns |
| `mock_response` | Mock response for URL pattern |
| `clear_mocks` | Clear response mocks |
| `wait_for_request` | Wait for request matching pattern |
| `wait_for_response` | Wait for response matching pattern |

### Device Emulation
| Tool | Description |
|------|-------------|
| `set_user_agent` | Set user agent string |
| `set_geolocation` | Set mock geolocation |
| `clear_geolocation` | Clear mock geolocation |
| `emulate_device` | Emulate device (iPhone, Pixel, iPad) |

### Clipboard
| Tool | Description |
|------|-------------|
| `get_clipboard` | Get clipboard text |
| `set_clipboard` | Set clipboard text |

### Browser State
| Tool | Description |
|------|-------------|
| `clear_cache` | Clear browser cache |
| `clear_browsing_data` | Clear cache/cookies/history/localStorage |

### Assertions (Testing)
| Tool | Description |
|------|-------------|
| `assert_text` | Assert element text equals/contains value |
| `assert_visible` | Assert element is visible |
| `assert_hidden` | Assert element is hidden |
| `assert_url` | Assert URL equals/contains value |
| `assert_title` | Assert title equals/contains value |
| `assert_element_count` | Assert number of matching elements |

### Utility
| Tool | Description |
|------|-------------|
| `ping` | Health check |
| `get_tools` | List all available tools |
| `retry` | Retry tool on failure |

## Examples

### Basic Navigation
```bash
# Navigate to a page
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "navigate", "args": {"url": "https://example.com"}}'

# Go back
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "navigate", "args": {"direction": "back"}}'
```

### Screenshots
```bash
# Take screenshot and save to file
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot"}' | jq -r '.result.image' | cut -d',' -f2 | base64 -d > screenshot.png

# JPEG with quality
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot", "args": {"format": "jpeg", "quality": 80}}'
```

### Element Interaction
```bash
# Find and click
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "find", "args": {"selector": "button.submit"}}'
# Returns: {"success": true, "result": {"ref": "ref_1"}}

curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "click", "args": {"ref": "ref_1"}}'

# Click at coordinates
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "click", "args": {"coordinate": [100, 200]}}'

# Fill form
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "fill_form", "args": {"fields": {"#email": "test@example.com", "#password": "secret123"}}}'
```

### Session Management
```bash
# Save session (cookies + storage)
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "save_session", "args": {"name": "my-session"}}' > session.json

# Restore session later
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "restore_session", "args": {"session": '"$(cat session.json | jq '.result.session')"'}}'

# Export cookies in Netscape format (curl compatible)
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "export_cookies", "args": {"format": "netscape"}}' | jq -r '.result.cookies' > cookies.txt

# Use with curl
curl -b cookies.txt https://example.com/api
```

### Wait and Poll
```bash
# Wait for element to appear
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "wait_for", "args": {"selector": ".loaded", "timeout": 5000}}'

# Poll until condition
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "poll_until", "args": {"code": "window.dataLoaded === true", "timeout": 10000}}'
```

### Execute JavaScript
```bash
# Get page title
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "execute_script", "args": {"code": "return document.title"}}'

# Complex script
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "execute_script", "args": {"code": "return Array.from(document.querySelectorAll(\"a\")).map(a => a.href)"}}'
```

### Network Blocking
```bash
# Block ads and tracking
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "block_urls", "args": {"patterns": ["google-analytics", "facebook.com/tr", "ads"]}}'

# Unblock all
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "unblock_urls"}'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check - returns version info |
| GET | `/tools` | List all 80+ available tools |
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

## Security Notes

- Server only listens on 127.0.0.1 (localhost)
- Extension has broad permissions for full automation capability
- Cookie/session exports contain sensitive data - handle securely
- Not recommended for production use without additional security measures

## License

MIT
