const http = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { OpeningStreaks } = require('../match');

function createRelay() {
  const rooms = new Map();
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ ok:req.url === '/health' }));
  });
  const wss = new WebSocketServer({ server, maxPayload:8192 });
  const send = (c, data) => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); };
  const fail = (c, error) => send(c, { t:'error', error });
  const count = v => Math.max(0, Math.min(99999, Math.floor(Number(v) || 0)));
  function clean(p = {}) {
    if (!p || typeof p !== 'object') p = {};
    return { id:String(p.id || '').slice(0,32), name:String(p.name || 'Player').slice(0,20),
      chests:count(p.chests), teamChests:Math.max(count(p.chests), count(p.teamChests)),
      matchStart:Math.max(0, Number(p.matchStart) || 0), streak:count(p.streak), bestStreak:count(p.bestStreak) };
  }
  function broadcast(room) {
    const players = room.streaks.live([...room.members.values()]);
    for (const c of room.members.keys()) send(c, { t:'roster', role:c === room.host ? 'host':'client', code:room.code, players });
  }
  function detach(c) {
    const room = c.room;
    if (!room) return;
    c.room = null; room.members.delete(c);
    if (room.host === c) {
      rooms.delete(room.code);
      for (const peer of room.members.keys()) { peer.room = null; peer.close(1000, 'Host left'); }
    } else broadcast(room);
  }
  wss.on('connection', c => {
    c.alive = true;
    c.on('pong', () => { c.alive = true; });
    c.on('error', () => {});
    c.on('close', () => detach(c));
    c.on('message', data => {
      // Bound traffic per connection, including attempts before joining a room.
      const now = Date.now();
      if (!c.bucket || now - c.bucket.start > 1000) c.bucket = { start:now, n:0 };
      if (++c.bucket.n > 60) return c.close(1008, 'Rate limit');
      let m;
      try { m = JSON.parse(data); } catch { return fail(c, 'Invalid message'); }
      if (!m || typeof m !== 'object') return fail(c, 'Invalid message');
      if (m.t === 'create' || m.t === 'join') {
        if (c.room) return fail(c, 'Already in a party');
        const p = clean(m.p);
        if (!p.id) return fail(c, 'Player ID required');
        let room;
        if (m.t === 'create') {
          if (rooms.size >= 1000) return fail(c, 'Relay is full');
          let code;
          do { code = randomBytes(5).toString('hex').toUpperCase(); } while (rooms.has(code));
          room = { code, host:c, members:new Map(), lastEnd:0, streaks:new OpeningStreaks() };
          rooms.set(code, room);
        } else {
          room = rooms.get(String(m.code || '').trim().toUpperCase());
          if (!room) return fail(c, 'Party not found');
          if (room.members.size >= 16) return fail(c, 'Party is full');
          if ([...room.members.values()].some(q => q.id === p.id)) return fail(c, 'This player is already connected');
        }
        c.room = room; room.members.set(c, p); room.streaks.observe(p.id, p.chests); broadcast(room);
      } else if (m.t === 'state' && c.room) {
        const p = clean(m.p), old = c.room.members.get(c);
        p.id = old.id;
        // Match timestamps need their full precision (not a bounded count).
        p.matchStart = Math.max(0, Number(m.p?.matchStart) || 0);
        if (c.room.lastEnd && p.matchStart < c.room.lastEnd) return;
        c.room.streaks.observe(p.id, p.chests);
        c.room.members.set(c, p); broadcast(c.room);
      } else if (m.t === 'endMatch' && c.room) {
        const room = c.room;
        if (room.host !== c) return fail(c, 'Only the host can end a match');
        if (now - room.lastEnd < 1500) return;
        room.lastEnd = now;
        const message = { t:'matchEnd', id:randomUUID(), end:now, players:room.streaks.recap([...room.members.values()]) };
        for (const peer of room.members.keys()) send(peer, message);
        room.streaks.reset();
        for (const [peer, p] of room.members) {
          room.members.set(peer, { ...p, chests:0, teamChests:0, matchStart:now });
          room.streaks.observe(p.id, 0);
        }
        broadcast(room);
      }
    });
  });
  const heartbeat = setInterval(() => {
    for (const c of wss.clients) {
      if (!c.alive) { c.terminate(); continue; }
      c.alive = false; c.ping();
    }
  }, 30000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));
  return { server, wss, rooms };
}
if (require.main === module) {
  const { server } = createRelay();
  server.listen(Number(process.env.PORT || 47801), process.env.HOST || '127.0.0.1', () => console.log('Chest Tracker relay listening'));
}
module.exports = { createRelay };
