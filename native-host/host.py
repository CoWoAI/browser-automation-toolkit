#!/usr/bin/env python3
"""
Native Messaging Host for Browser Task Executor

This script acts as a bridge between external tools and the Chrome extension.
It reads/writes JSON messages using Chrome's native messaging protocol:
- Messages are prefixed with a 4-byte unsigned integer (little-endian) indicating message length
- Message body is UTF-8 encoded JSON

Usage as a server (for external tools to connect):
  python3 host.py --server --port 8765

Usage as stdin/stdout bridge (for Chrome extension):
  python3 host.py
"""

import sys
import json
import struct
import argparse
import threading
import queue
from http.server import HTTPServer, BaseHTTPRequestHandler


def read_native_message():
    """Read a message from stdin using Chrome's native messaging protocol."""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    length = struct.unpack('<I', raw_length)[0]
    message = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(message)


def write_native_message(message):
    """Write a message to stdout using Chrome's native messaging protocol."""
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def send_to_extension(message):
    """Send a message to the extension and wait for response."""
    write_native_message(message)
    return read_native_message()


class NativeHostHandler(BaseHTTPRequestHandler):
    """HTTP handler that forwards requests to the Chrome extension."""

    # Queue for pending requests
    pending_requests = {}
    request_id_counter = 0
    lock = threading.Lock()

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass

    def _send_cors_headers(self):
        """Send CORS headers to allow cross-origin requests."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Health check endpoint."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps({
            'status': 'ok',
            'name': 'browser-task-executor'
        }).encode())

    def do_POST(self):
        """Handle tool execution requests."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            request = json.loads(body)

            # Generate request ID if not provided
            with self.lock:
                self.request_id_counter += 1
                request_id = request.get('id', f'http_{self.request_id_counter}')
                request['id'] = request_id

            # Send to extension via native messaging
            response = send_to_extension(request)

            # Send response back to HTTP client
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        except json.JSONDecodeError as e:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': f'Invalid JSON: {str(e)}'
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                'success': False,
                'error': str(e)
            }).encode())


def run_server(port):
    """Run HTTP server for external tools."""
    server = HTTPServer(('127.0.0.1', port), NativeHostHandler)
    print(f'Native host server running on http://127.0.0.1:{port}', file=sys.stderr)
    print('Endpoints:', file=sys.stderr)
    print(f'  GET  http://127.0.0.1:{port}/         - Health check', file=sys.stderr)
    print(f'  POST http://127.0.0.1:{port}/execute  - Execute tool', file=sys.stderr)
    server.serve_forever()


def run_native_host():
    """Run as Chrome native messaging host (stdin/stdout)."""
    while True:
        try:
            message = read_native_message()
            if message is None:
                break

            # Echo back for now (extension will handle the actual logic)
            # In a real implementation, this would coordinate with extension responses
            write_native_message(message)

        except Exception as e:
            write_native_message({
                'success': False,
                'error': str(e)
            })


def main():
    parser = argparse.ArgumentParser(description='Browser Task Executor Native Host')
    parser.add_argument('--server', action='store_true', help='Run as HTTP server')
    parser.add_argument('--port', type=int, default=8765, help='HTTP server port (default: 8765)')
    args = parser.parse_args()

    if args.server:
        run_server(args.port)
    else:
        run_native_host()


if __name__ == '__main__':
    main()
