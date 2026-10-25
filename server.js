const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

const rooms = new Map(); // RoomID -> Set(ws)
const clients = new Map(); // ws -> { roomId, id, name }

wss.on('connection', (ws) => {
    const myId = 'p_' + Math.random().toString(36).slice(2, 8);
    clients.set(ws, { id: myId });
    ws.send(JSON.stringify({ t: 'hello', id: myId }));

    ws.on('message', (data) => {
        const m = JSON.parse(data);
        const client = clients.get(ws);

        if (m.t === 'create') {
            const roomId = Math.random().toString(36).slice(2, 8);
            client.roomId = roomId;
            client.name = m.n;
            if (!rooms.has(roomId)) rooms.set(roomId, new Set());
            rooms.get(roomId).add(ws);
            ws.send(JSON.stringify({ t: 'joined', id: roomId, n: m.n, p: m.p, f: m.f }));
        } 
        else if (m.t === 'join') {
            if (rooms.has(m.id)) {
                client.roomId = m.id;
                rooms.get(m.id).add(ws);
                const hostWs = [...rooms.get(m.id)][0];
                ws.send(JSON.stringify({ t: 'joined', id: m.id, n: 'Игра', p: 8, f: 20 }));
            } else {
                ws.send(JSON.stringify({ t: 'err', m: 'Комната не найдена' }));
            }
        }
        else if (m.t === 'leave') {
            if (client.roomId) {
                const room = rooms.get(client.roomId);
                room.delete(ws);
                broadcastToRoom(client.roomId, { t: 'x', d: client.id }, ws);
                if (room.size === 0) rooms.delete(client.roomId);
                client.roomId = null;
            }
        }
        else if (m.t === 'p' || m.t === 'e') {
            if (client.roomId) broadcastToRoom(client.roomId, m, ws);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        if (client && client.roomId) {
            const room = rooms.get(client.roomId);
            room.delete(ws);
            broadcastToRoom(client.roomId, { t: 'x', d: client.id }, ws);
            if (room.size === 0) rooms.delete(client.roomId);
        }
        clients.delete(ws);
    });
});

function broadcastToRoom(roomId, data, senderWs) {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = JSON.stringify({ ...data, f: clients.get(senderWs).id });
    for (const ws of room) {
        if (ws !== senderWs && ws.readyState === 1) ws.send(msg);
    }
}
