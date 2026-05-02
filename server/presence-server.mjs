#!/usr/bin/env node
/**
 * Presence relay — minimal WebSocket fan-out keyed by channel.
 *
 * Clients connect to ws(s)://HOST:PORT/?c=<channelId>. Every frame received
 * from one client is forwarded verbatim to all OTHER clients in the same
 * channel. The server holds no application state — payload semantics
 * (cursor/hello/bye) live entirely in the client.
 *
 * Also serves a tiny HTTP surface so docker healthchecks (and `curl`) can
 * verify the process is alive without speaking the WebSocket protocol.
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PRESENCE_PORT
  ? Number(process.env.PRESENCE_PORT)
  : 3001;

const rooms = new Map(); // channelId -> Set<ws>

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('upgrade required\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const channel = url.searchParams.get('c') || 'default';

  let peers = rooms.get(channel);
  if (!peers) {
    peers = new Set();
    rooms.set(channel, peers);
  }
  peers.add(ws);

  ws.on('message', (data, isBinary) => {
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === 1) {
        peer.send(data, { binary: isBinary });
      }
    }
  });

  const cleanup = () => {
    peers.delete(ws);
    if (peers.size === 0) rooms.delete(channel);
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

httpServer.listen(PORT, () => {
  console.log(`[presence] listening on :${PORT} (ws + http /healthz)`);
});
