const http = require('http');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const srv = http.createServer((q, r) => { r.writeHead(200); r.end('Dive Sparrow server'); });
const wss = new WebSocketServer({ server: srv, maxPayload: 4096 });
const rooms = new Map();
const send = (c, o) => c.readyState === 1 && c.send(JSON.stringify(o));
const list = () => [...rooms.values()].map(r => ({ id: r.id, n: r.n, m: r.p, f: r.f, c: r.players.size }));
const lobby = () => { const l = list(); for (const c of wss.clients) if (!c.room) send(c, { t: 'srv', list: l }); };
const clean = s => String(s || '').replace(/[^\w\u0400-\u04FF ]/g, '').slice(0, 24);
function leave(c) {
  const r = c.room; if (!r) return;
  c.room = null; r.players.delete(c);
  for (const o of r.players) send(o, { t: 'x', d: c.id });
  if (!r.players.size) rooms.delete(r.id);
  lobby();
}
wss.on('connection', c => {
  c.id = Math.random().toString(36).slice(2, 10); c.room = null; c.alive = true; c.t0 = 0; c.cnt = 0;
  send(c, { t: 'hello', id: c.id }); send(c, { t: 'srv', list: list() });
  c.on('pong', () => { c.alive = true; });
  c.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'list') return send(c, { t: 'srv', list: list() });
    if (m.t === 'create') {
      if (rooms.size >= 200) return send(c, { t: 'err', m: 'Слишком много серверов' });
      leave(c);
      const id = Math.random().toString(36).slice(2, 8);
      const r = { id, n: clean(m.n) || 'Dive Sparrow', p: Math.max(2, Math.min(16, +m.p || 8)), f: Math.max(5, Math.min(100, +m.f || 20)), players: new Set([c]) };
      rooms.set(id, r); c.room = r;
      send(c, { t: 'joined', id, n: r.n, p: r.p, f: r.f }); lobby(); return;
    }
    if (m.t === 'join') {
      const r = rooms.get(String(m.id));
      if (!r) return send(c, { t: 'err', m: 'Сервер не найден' });
      if (c.room === r) return;
      if (r.players.size >= r.p) return send(c, { t: 'err', m: 'Сервер заполнен' });
      leave(c); r.players.add(c); c.room = r;
      send(c, { t: 'joined', id: r.id, n: r.n, p: r.p, f: r.f }); lobby(); return;
    }
    if (m.t === 'leave') return leave(c);
    if (m.t.length === 1 && 'pfgak'.includes(m.t) && c.room && m.d && typeof m.d === 'object') {
      const n = Date.now(); if (n - c.t0 > 1000) { c.t0 = n; c.cnt = 0; }
      if (++c.cnt > 120) return;
      const out = JSON.stringify({ t: m.t, d: m.d, f: c.id });
      for (const p of c.room.players) if (p !== c && p.readyState === 1) p.send(out);
    }
  });
  c.on('close', () => leave(c));
});
setInterval(() => { for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; c.ping(); } }, 15000);
srv.listen(PORT, () => console.log('Dive Sparrow server on :' + PORT));
