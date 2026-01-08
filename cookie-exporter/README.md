# Cookie Exporter

A minimal Chrome extension for exporting and importing cookies between browsers.

## Features

- **Export cookies** from any domain in JSON or Netscape (curl-compatible) format
- **Import cookies** from JSON or Netscape format files
- **Copy to clipboard** for quick transfer
- **Download as file** for backup or sharing
- **Clear domain cookies** with one click
- **Cross-browser compatible** - export from Chrome, import into Firefox/Edge/etc.

## Installation

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `cookie-exporter` folder

**Note:** You'll need to add icons (16x16, 48x48, 128x128 PNG files) to the `icons/` folder, or remove the icon references from `manifest.json`.

## Usage

### Exporting Cookies

1. Click the extension icon
2. Optionally enter a domain to filter (or check "Current tab domain only")
3. Select format (JSON or Netscape)
4. Click "Export"
5. Copy to clipboard or download as file

### Importing Cookies

1. Click the extension icon
2. Switch to "Import" tab
3. Paste cookies or load from file
4. Enter target URL (or check "Use current tab URL")
5. Click "Import Cookies"

### Netscape Format

The Netscape format is compatible with curl's `-b` and `-c` flags:

```bash
# Use exported cookies with curl
curl -b cookies.txt https://example.com

# Save cookies from curl
curl -c cookies.txt https://example.com
```

### JSON Format

JSON format preserves all cookie attributes:

```json
[
  {
    "domain": ".example.com",
    "name": "session",
    "value": "abc123",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "lax",
    "expirationDate": 1735689600
  }
]
```

## Security Note

Cookies contain sensitive authentication data. Never share exported cookies publicly or with untrusted parties. Treat cookie files like passwords.

## License

MIT
