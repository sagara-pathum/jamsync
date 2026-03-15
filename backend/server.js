const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3001;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// rooms[roomId] = Set of WebSocket clients in that room
const rooms = {};

wss.on("connection", ws => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

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
            ws._color = data.color;
            ws._room = roomId;

            if (!rooms[roomId]) rooms[roomId] = new Set();
            
            // Get existing peers in this room
            const existingPeers = [];
            rooms[roomId].forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    existingPeers.push({
                        id: client._peerId,
                        username: client._username,
                        color: client._color
                    });
                }
            });

            rooms[roomId].add(ws);

            // Send existing peers to the new joiner
            ws.send(JSON.stringify({
                type: 'existing-peers',
                peers: existingPeers
            }));

            // Notify others that a new peer joined
            rooms[roomId].forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'peer-joined',
                        peerId: ws._peerId,
                        username: ws._username,
                        color: ws._color
                    }));
                }
            });
            return;
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
            // Otherwise broadcast to all OTHER clients in the room
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

// Keep-alive heartbeat
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
