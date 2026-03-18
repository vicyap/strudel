#!/usr/bin/env node
// Strudel Relay — bridges Claude Code (HTTP) to the Strudel REPL (WebSocket)
//
// Setup:
//   mkdir -p /tmp/strudel-relay && cd /tmp/strudel-relay
//   curl -sO <SITE_URL>/relay.mjs
//   npm init -y 2>/dev/null && npm i ws 2>/dev/null
//   node relay.mjs
//
// The browser at /claude connects via WebSocket.
// Claude Code controls the REPL via HTTP:
//
//   GET  /api/status              — playback state + current code
//   GET  /api/code                — read editor code
//   POST /api/set-and-evaluate    — replace code and play (JSON or plain text body)
//   POST /api/evaluate            — play current editor code
//   POST /api/stop                — silence everything
//   POST /api/cps                 — set tempo (JSON body: {"cps": 0.5})

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

let WebSocketServer;
try {
  ({ WebSocketServer } = await import('ws'));
} catch {
  console.error('[strudel-relay] Missing dependency: ws');
  console.error('  Run: npm init -y && npm i ws');
  process.exit(1);
}

const PORT = Number(process.env.STRUDEL_RELAY_PORT ?? 9001);
const REQUEST_TIMEOUT_MS = 8000;

// --- WebSocket (browser bridge) ---

let browserSocket = null;
const pendingRequests = new Map();

function sendToBrowser(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!browserSocket || browserSocket.readyState !== 1) {
      reject(new Error('No browser connected. Open the /claude page first.'));
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(id, { resolve, reject, timer });
    browserSocket.send(JSON.stringify({ id, method, params }));
  });
}

// --- HTTP API ---

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function parseCode(req) {
  const raw = await readBody(req);
  const isJson = (req.headers['content-type'] || '').includes('application/json');
  if (isJson) {
    return JSON.parse(raw).code;
  }
  return raw;
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleHttp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = new URL(req.url, `http://localhost:${PORT}`).pathname;

  try {
    let result;
    if (req.method === 'GET' && path === '/api/status') {
      result = await sendToBrowser('getStatus');
    } else if (req.method === 'GET' && path === '/api/code') {
      result = await sendToBrowser('getCode');
    } else if (req.method === 'POST' && path === '/api/set-and-evaluate') {
      const code = await parseCode(req);
      result = await sendToBrowser('setAndEvaluate', { code });
    } else if (req.method === 'POST' && path === '/api/evaluate') {
      result = await sendToBrowser('evaluate');
    } else if (req.method === 'POST' && path === '/api/stop') {
      result = await sendToBrowser('stop');
    } else if (req.method === 'POST' && path === '/api/cps') {
      const body = JSON.parse(await readBody(req));
      result = await sendToBrowser('setCps', { cps: body.cps });
    } else {
      return json(res, 404, { error: 'Not found' });
    }
    json(res, 200, result);
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

// --- Start ---

const server = createServer(handleHttp);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  if (browserSocket) {
    browserSocket.close(1000, 'replaced by new connection');
  }
  browserSocket = ws;
  console.error('[strudel-relay] browser connected');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const pending = pendingRequests.get(msg.id);
      if (pending) {
        pendingRequests.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
    } catch (err) {
      console.error('[strudel-relay] bad message:', err.message);
    }
  });

  ws.on('close', () => {
    if (browserSocket === ws) {
      browserSocket = null;
      console.error('[strudel-relay] browser disconnected');
    }
  });
});

server.listen(PORT, () => {
  console.error(`[strudel-relay] listening on http://localhost:${PORT}`);
  console.error(`[strudel-relay] HTTP API:   http://localhost:${PORT}/api/*`);
  console.error(`[strudel-relay] WebSocket:  ws://localhost:${PORT}`);
});
