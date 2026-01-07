#!/usr/bin/env python3
"""
Browser Task Executor - Client Server

Serves the test webpage for communicating with the extension.

Usage:
    python3 server.py [--port 8080]
"""

import argparse
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[Server] {args[0]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('127.0.0.1', args.port), Handler)
    print(f"Client server: http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == '__main__':
    main()
