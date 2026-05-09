import http from 'http';
import fs from 'fs';
import { AppPaths } from './state';

export function setupServer() {
  const PORT = 16889;

  const server = http.createServer((req, res) => {
    // 设置 CORS 头，允许 B 站页面发起的请求（由扩展代理）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/history') {
      if (req.method === 'GET') {
        try {
          if (fs.existsSync(AppPaths.historyPath)) {
            const content = fs.readFileSync(AppPaths.historyPath, 'utf-8');
            const bvids = content.split('\n').map(s => s.trim()).filter(Boolean);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: bvids }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: [] }));
          }
        } catch (error: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      } else if (req.method === 'DELETE') {
        try {
          if (fs.existsSync(AppPaths.historyPath)) {
            fs.writeFileSync(AppPaths.historyPath, '', 'utf-8');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'History cleared' }));
        } catch (error: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        }
      } else {
        res.writeHead(405);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Local history server is running at http://127.0.0.1:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server error:', err);
  });
}
