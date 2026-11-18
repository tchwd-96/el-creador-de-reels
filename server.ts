import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, type ChildProcess} from 'node:child_process';
import {createServer as createViteServer} from 'vite';

const PORT = Number(process.env.PORT || 3000);
const FASTAPI_HOST = '127.0.0.1';
const FASTAPI_PORT = 8770;

let pythonProcess: ChildProcess | null = null;

function startFastApiBackend(): void {
  const venvPython = path.resolve(process.cwd(), '.venv', 'bin', 'python');
  const pythonBin = fs.existsSync(venvPython) ? venvPython : 'python3';

  pythonProcess = spawn(
    pythonBin,
    ['-m', 'uvicorn', 'backend.main:app', '--host', FASTAPI_HOST, '--port', String(FASTAPI_PORT)],
    {
      cwd: process.cwd(),
      env: {...process.env},
      stdio: 'inherit',
    },
  );

  pythonProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`FastAPI backend exited with code ${code}`);
    }
  });
}

function stopFastApiBackend(): void {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
}

process.on('SIGINT', () => {
  stopFastApiBackend();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopFastApiBackend();
  process.exit(0);
});

function proxyToFastApi(req: express.Request, res: express.Response): void {
  const options: http.RequestOptions = {
    hostname: FASTAPI_HOST,
    port: FASTAPI_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${FASTAPI_HOST}:${FASTAPI_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, {end: true});
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        detail: `El motor de renderizado FastAPI aún está iniciando o no respondió (${err.message}).`,
      });
    }
  });

  req.pipe(proxyReq, {end: true});
}

async function bootstrap() {
  startFastApiBackend();

  const app = express();

  // Stream /api/* directly to Python FastAPI (handles multipart uploads, video/zip streams, and range requests)
  app.use('/api', (req, res) => {
    proxyToFastApi(req, res);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jewelry Promo Studio preview proxy running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
