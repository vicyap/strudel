#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const WS_PORT = Number(process.env.STRUDEL_MCP_PORT ?? 9001);
const REQUEST_TIMEOUT_MS = 8000;

// --- WebSocket server (browser bridge) ---

const wss = new WebSocketServer({ port: WS_PORT });
let browserSocket = null;
const pendingRequests = new Map();

wss.on('connection', (ws) => {
  if (browserSocket) {
    browserSocket.close(1000, 'replaced by new connection');
  }
  browserSocket = ws;
  process.stderr.write(`[strudel-mcp] browser connected\n`);

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
      process.stderr.write(`[strudel-mcp] bad message from browser: ${err.message}\n`);
    }
  });

  ws.on('close', () => {
    if (browserSocket === ws) {
      browserSocket = null;
      process.stderr.write(`[strudel-mcp] browser disconnected\n`);
    }
  });
});

function sendToBrowser(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!browserSocket || browserSocket.readyState !== 1) {
      reject(new Error('No Strudel instance connected. Open localhost:4321 and inject the bridge snippet.'));
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

function text(message) {
  return { content: [{ type: 'text', text: typeof message === 'string' ? message : JSON.stringify(message, null, 2) }] };
}

// --- MCP server ---

const server = new McpServer({
  name: 'strudel-mcp',
  version: '1.0.0',
});

server.registerTool(
  'strudel_set_and_evaluate',
  {
    description: 'Replace the entire Strudel editor content with new code and evaluate it (starts playback). This is the primary tool for live coding -- write complete Strudel patterns and hear them immediately.',
    inputSchema: {
      code: z.string().describe('Complete Strudel code to set in the editor and evaluate'),
    },
  },
  async ({ code }) => {
    const result = await sendToBrowser('setAndEvaluate', { code });
    return text(result);
  },
);

server.registerTool(
  'strudel_set_code',
  {
    description: 'Replace the editor content without evaluating. Useful for staging code before playing.',
    inputSchema: {
      code: z.string().describe('Strudel code to set in the editor'),
    },
  },
  async ({ code }) => {
    const result = await sendToBrowser('setCode', { code });
    return text(result);
  },
);

server.registerTool(
  'strudel_evaluate',
  {
    description: 'Evaluate the current editor content (starts playback).',
  },
  async () => {
    const result = await sendToBrowser('evaluate', {});
    return text(result);
  },
);

server.registerTool(
  'strudel_stop',
  {
    description: 'Stop all pattern playback.',
  },
  async () => {
    const result = await sendToBrowser('stop', {});
    return text(result);
  },
);

server.registerTool(
  'strudel_get_code',
  {
    description: 'Read the current code from the Strudel editor.',
    readOnlyHint: true,
  },
  async () => {
    const result = await sendToBrowser('getCode', {});
    return text(result);
  },
);

server.registerTool(
  'strudel_set_cps',
  {
    description: 'Set the tempo in cycles per second. 0.5 cps = 120 BPM (in 4/4), 1 cps = 240 BPM.',
    inputSchema: {
      cps: z.number().positive().describe('Cycles per second'),
    },
  },
  async ({ cps }) => {
    const result = await sendToBrowser('setCps', { cps });
    return text(result);
  },
);

server.registerTool(
  'strudel_get_status',
  {
    description: 'Get the current playback status (playing, tempo, current code).',
    readOnlyHint: true,
  },
  async () => {
    const result = await sendToBrowser('getStatus', {});
    return text(result);
  },
);

// --- Start ---

process.stderr.write(`[strudel-mcp] WebSocket server listening on ws://localhost:${WS_PORT}\n`);
const transport = new StdioServerTransport();
await server.connect(transport);
