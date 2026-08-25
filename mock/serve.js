// Minimal zero-dependency static server for the mock ERP page.
// Serves mock/index.html at http://127.0.0.1:4321 (override with MOCK_PORT).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_PORT || 4321);

const server = createServer(async (req, res) => {
  try {
    // everything serves the single-page mock (login reveals the AP form)
    const html = await readFile(join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    res.writeHead(500);
    res.end('mock server error: ' + err.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock JobBOSS2 running at http://127.0.0.1:${PORT}`);
});
