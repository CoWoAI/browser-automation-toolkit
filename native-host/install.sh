#!/bin/bash
#
# Install Native Messaging Host for Browser Task Executor
#
# Usage:
#   ./install.sh <extension-id>
#
# The extension ID can be found in chrome://extensions after loading the extension
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.anthropic.browser_task_executor"
HOST_PATH="$SCRIPT_DIR/host.py"

# Check for extension ID argument
if [ -z "$1" ]; then
    echo "Usage: $0 <extension-id>"
    echo ""
    echo "To find your extension ID:"
    echo "  1. Go to chrome://extensions"
    echo "  2. Enable Developer mode"
    echo "  3. Load unpacked extension from: $(dirname "$SCRIPT_DIR")"
    echo "  4. Copy the extension ID shown"
    exit 1
fi

EXTENSION_ID="$1"

# Determine target directory based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Create manifest with correct paths and extension ID
MANIFEST_FILE="$TARGET_DIR/$HOST_NAME.json"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "$HOST_NAME",
  "description": "Browser Task Executor Native Messaging Host",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo "Native messaging host installed successfully!"
echo ""
echo "Manifest location: $MANIFEST_FILE"
echo "Host script: $HOST_PATH"
echo "Extension ID: $EXTENSION_ID"
echo ""
echo "To test, restart Chrome and check the extension's service worker console."
