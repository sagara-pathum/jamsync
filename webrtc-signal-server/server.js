const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

// rooms[roomId] = Set of WebSocket clients in that room
const rooms = {};

wss.on("connection", ws => {
  ws._room = null;
  ws._peerId = null;
  ws._username = null;

  ws.on("message", message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    const roomId = data.room;
    if (!roomId) return;

    // Track room joining and metadata
    if (data.type === 'join') {
      ws._peerId = data.peerId;
      ws._username = data.username;
    }

    // Always track which room this socket is in
    if (ws._room !== roomId) {
      // Leave previous room if any
      if (ws._room && rooms[ws._room]) {
        rooms[ws._room].delete(ws);
        if (rooms[ws._room].size === 0) delete rooms[ws._room];
      }
      ws._room = roomId;
      if (!rooms[roomId]) rooms[roomId] = new Set();
      rooms[roomId].add(ws);
    }

    const roomClients = rooms[roomId];
    if (!roomClients) return;

    // If message has a specific target, only route to that peer
    if (data.target) {
      roomClients.forEach(client => {
        if (client._peerId === data.target && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } else {
      // Otherwise broadcast to all OTHER clients in the room (e.g. for 'join' messages and chat broadcasts if needed)
      roomClients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    const roomId = ws._room;
    if (roomId && rooms[roomId]) {
      rooms[roomId].delete(ws);
      // Notify remaining peers in the room that this peer left
      rooms[roomId].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'leave', 
            peerId: ws._peerId,
            room: roomId 
          }));
        }
      });
      if (rooms[roomId].size === 0) delete rooms[roomId];
    }
  });
});

console.log("Signaling server running with room support");