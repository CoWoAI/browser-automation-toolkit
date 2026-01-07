#!/usr/bin/env python3
"""
Simple command server for Browser Task Executor extension.
Extension polls GET /command for new commands.
Extension posts results to POST /result.
External tools post commands to POST /command.
"""

import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle requests in separate threads."""
    daemon_threads = True

# Shared state
pending_command = None
pending_result = None
result_event = threading.Event()
lock = threading.Lock()


class CommandHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[Server] {args[0]}")

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        global pending_command

        if self.path == '/command':
            # Extension polling for command
            with lock:
                if pending_command:
                    cmd = pending_command
                    pending_command = None
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self._cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps(cmd).encode())
                else:
                    self.send_response(204)  # No content
                    self._cors_headers()
                    self.end_headers()
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "name": "command-server"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        global pending_command, pending_result, result_event

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            return

        if self.path == '/command':
            # External tool sending command
            with lock:
                pending_command = data
                result_event.clear()

            # Wait for result (timeout 30s)
            result_event.wait(timeout=30)

            with lock:
                result = pending_result
                pending_result = None

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(result or {"error": "timeout"}).encode())

        elif self.path == '/result':
            # Extension sending result
            with lock:
                pending_result = data
                result_event.set()

            self.send_response(200)
            self._cors_headers()
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()


def main():
    port = 8766
    server = ThreadedHTTPServer(('127.0.0.1', port), CommandHandler)
    print(f"Command server running on http://127.0.0.1:{port}")
    print(f"  POST /command - Send command (waits for result)")
    print(f"  GET  /command - Extension polls for command")
    print(f"  POST /result  - Extension posts result")
    print()
    print("Example:")
    print(f'  curl -X POST http://127.0.0.1:{port}/command -H "Content-Type: application/json" -d \'{{"tool": "screenshot", "args": {{}}}}\'')
    server.serve_forever()


if __name__ == '__main__':
    main()
