const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Store rooms: { roomCode: { clients: Set, history: [] } }
const rooms = {};

function getRoomCode(ws) {
  for (const [code, room] of Object.entries(rooms)) {
    if (room.clients.has(ws)) return code;
  }
  return null;
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'join') {
      const code = msg.room?.toUpperCase().trim();
      if (!code) return;

      if (!rooms[code]) rooms[code] = { clients: new Set(), history: [] };
      rooms[code].clients.add(ws);
      ws.roomCode = code;

      // Send existing drawing history to new joiner
      ws.send(JSON.stringify({ type: 'history', strokes: rooms[code].history }));

      // Notify room count
      broadcast(code, { type: 'users', count: rooms[code].clients.size }, null);
      console.log(`Client joined room: ${code} (${rooms[code].clients.size} users)`);
    }

    else if (msg.type === 'draw') {
      const code = ws.roomCode;
      if (!code || !rooms[code]) return;
      rooms[code].history.push(msg);
      broadcast(code, msg, ws);
    }

    else if (msg.type === 'clear') {
      const code = ws.roomCode;
      if (!code || !rooms[code]) return;
      rooms[code].history = [];
      broadcast(code, { type: 'clear' }, ws);
    }

    else if (msg.type === 'cursor') {
      const code = ws.roomCode;
      if (!code || !rooms[code]) return;
      broadcast(code, msg, ws);
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if (code && rooms[code]) {
      rooms[code].clients.delete(ws);
      if (rooms[code].clients.size === 0) {
        delete rooms[code];
        console.log(`Room ${code} deleted (empty)`);
      } else {
        broadcast(code, { type: 'users', count: rooms[code].clients.size }, null);
      }
    }
  });
});

function broadcast(roomCode, msg, exclude) {
  if (!rooms[roomCode]) return;
  const data = JSON.stringify(msg);
  for (const client of rooms[roomCode].clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(data);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
