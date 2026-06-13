#!/usr/bin/env python3
"""本地预览服务器：模拟 Nginx clean URL 规则 (try_files $uri $uri.html $uri/)。

用法:  python3 serve-local.py
然后浏览器打开  http://localhost:8000
"""
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

class CleanURLHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        full = super().translate_path(path)
        # 规则 1: 路径本身存在（文件或目录）→ 原样返回
        if os.path.exists(full):
            return full
        # 规则 2: 去掉末尾斜杠后追加 .html 存在 → 返回 .html 文件
        candidate = full.rstrip('/') + '.html'
        if os.path.isfile(candidate):
            return candidate
        return full

if __name__ == '__main__':
    port = 8000
    print(f'CNPAF 本地预览: http://localhost:{port}')
    print(f'简体: http://localhost:{port}/zh/   繁体: http://localhost:{port}/tc/')
    print('按 Ctrl+C 停止')
    HTTPServer(('127.0.0.1', port), CleanURLHandler).serve_forever()
