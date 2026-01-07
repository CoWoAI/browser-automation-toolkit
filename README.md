# Browser Automation Toolkit

A Chrome extension and client tools for browser automation via native messaging.

## Components

| Directory | Description |
|-----------|-------------|
| `extension/` | Chrome extension (Manifest V3) |
| `client/` | Web UI for sending commands |
| `native-host/` | Native messaging host for external tool integration |
| `command-server.py` | HTTP command server for tool coordination |

## Quick Start

### 1. Install the Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension/` directory

### 2. Start the Command Server

```bash
python3 command-server.py
```

### 3. Open the Client UI

```bash
cd client && python3 server.py
# Open http://127.0.0.1:8080
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_tabs` | List all browser tabs |
| `read_page` | Get accessibility tree of current page |
| `screenshot` | Capture viewport screenshot |
| `navigate` | Navigate to URL |
| `click` | Click element by reference |
| `type` | Type text into element |
| `scroll` | Scroll the page |
| `execute_script` | Run JavaScript in page context |
| `create_tab` | Open a new tab |

## API

### Command Server (port 8766)

```bash
# Send a command (waits for result)
curl -X POST http://127.0.0.1:8766/command \
  -H "Content-Type: application/json" \
  -d '{"tool": "screenshot", "args": {}}'
```

## License

MIT
