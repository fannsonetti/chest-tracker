const http = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { OpeningStreaks, POINTS_VERSION } = require('../match');
const { signResult, loadSigningKey } = require('../proof');

function createRelay({ signingKey = loadSigningKey() } = {}) {
  const rooms = new Map();
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({ ok:req.url === '/health' }));
  });
  const wss = new WebSocketServer({ server, maxPayload:8192 });
  const send = (c, data) => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); };
  const fail = (c, error) => send(c, { t:'error', error });
  const lobbyList = () => ({ t:'lobbies', rooms:[...rooms.values()].map(room => ({
    id:room.code, name:([...room.members.values()][0]?.name || 'Player') + '’s room',
    players:room.members.size
  })) });
  function broadcastLobbies() {
    const list = lobbyList();
    for (const client of wss.clients) if (client.browsing) send(client, list);
  }
  const count = v => Math.max(0, Math.min(99999, Math.floor(Number(v) || 0)));
  function clean(p = {}) {
    if (!p || typeof p !== 'object') p = {};
    return { id:String(p.id || '').slice(0,32), name:String(p.name || 'Player').slice(0,20),
      chests:count(p.chests), teamChests:Math.max(count(p.chests), count(p.teamChests)),
      matchStart:Math.max(0, Number(p.matchStart) || 0), streak:count(p.streak), bestStreak:count(p.bestStreak) };
  }
  function broadcast(room) {
    room.streaks.setPlayers(room.members.size);
    const now = Date.now();
    const players = room.streaks.live([...room.members.values()], now);
    for (const c of room.members.keys()) send(c, { t:'roster', role:c === room.host ? 'host':'client', code:room.code, ended:!!room.ended, players });
    // Streaks run out on their own; tell everyone the moment one does, since
    // that can hand the lead to someone else.
    clearTimeout(room.expiry);
    const next = room.ended ? Infinity : room.streaks.nextExpiry(now);
    if (Number.isFinite(next)) {
      room.expiry = setTimeout(() => { if (rooms.get(room.code) === room) broadcast(room); }, Math.max(0, next - now) + 25);
      room.expiry.unref?.();
    }
  }
  // Clients from 1.1.8 on (v >= 2) understand a frozen finished match. Older
  // clients reset as soon as a match ends, so a room with any of them keeps
  // the old behaviour: the next match starts immediately.
  const canFreeze = room => [...room.members.keys()].every(c => c.v >= 2);
  function startMatch(room, now) {
    room.ended = false; room.start = now; room.lastEnd = now;
    room.streaks.reset();
    for (const [peer, p] of room.members) {
      room.members.set(peer, { ...p, chests:0, teamChests:0, matchStart:now });
      room.streaks.observe(p.id, 0);
    }
    for (const peer of room.members.keys()) send(peer, { t:'matchStart', start:now });
    broadcast(room);
  }
  function detach(c) {
    const room = c.room;
    if (!room) return;
    c.room = null; room.members.delete(c);
    if (room.host === c) {
      rooms.delete(room.code); clearTimeout(room.expiry);
      for (const peer of room.members.keys()) { peer.room = null; peer.close(1000, 'Host left'); }
    } else broadcast(room);
    broadcastLobbies();
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
      if (m.t === 'browse') {
        c.browsing = true; send(c, lobbyList());
      } else if (m.t === 'leave') {
        detach(c); send(c, { t:'left' });
      } else if (m.t === 'create' || m.t === 'join') {
        if (c.room) return fail(c, 'Already in a party');
        const p = clean(m.p);
        if (!p.id) return fail(c, 'Player ID required');
        let room;
        if (m.t === 'create') {
          if (rooms.size >= 1000) return fail(c, 'Relay is full');
          let code;
          do { code = randomBytes(5).toString('hex').toUpperCase(); } while (rooms.has(code));
          room = { code, host:c, members:new Map(), lastEnd:0, start:now, streaks:new OpeningStreaks() };
          rooms.set(code, room);
        } else {
          room = rooms.get(String(m.code || '').trim().toUpperCase());
          if (!room) return fail(c, 'Party not found');
          if (room.members.size >= 16) return fail(c, 'Party is full');
          if ([...room.members.values()].some(q => q.id === p.id)) return fail(c, 'This player is already connected');
        }
        c.v = Math.max(0, Math.floor(Number(m.v) || 0));
        c.room = room; room.members.set(c, p); room.streaks.observe(p.id, p.chests); broadcast(room);
        broadcastLobbies();
        // An older client cannot wait out a frozen match, so start the next one.
        if (room.ended && !canFreeze(room)) startMatch(room, now);
      } else if (m.t === 'state' && c.room) {
        const p = clean(m.p), old = c.room.members.get(c);
        p.id = old.id;
        // Match timestamps need their full precision (not a bounded count).
        p.matchStart = Math.max(0, Number(m.p?.matchStart) || 0);
        if (c.room.lastEnd && p.matchStart < c.room.lastEnd) return;
        c.room.streaks.setPlayers(c.room.members.size);
        c.room.streaks.observe(p.id, p.chests);
        c.room.members.set(c, p); broadcast(c.room);
        if (old.name !== p.name) broadcastLobbies();
      } else if (m.t === 'endMatch' && c.room) {
        const room = c.room;
        if (room.host !== c) return fail(c, 'Only the host can end a match');
        if (room.ended) return;
        room.lastEnd = now; room.ended = true;
        const id = randomUUID(), players = room.streaks.recap([...room.members.values()]);
        // Points are scored here from the relay's own receipt log and signed,
        // so the app can trust them on its leaderboards.
        const proof = signResult({ v:POINTS_VERSION, id, start:room.start, end:now, size:room.members.size,
          players:players.map(({ id, name, chests, bestStreak, points, first, last }) => ({ id, name, chests, bestStreak, points, first, last })) }, signingKey);
        const message = { t:'matchEnd', id, start:room.start, end:now, timeline:room.streaks.timeline(), players, proof };
        for (const peer of room.members.keys()) send(peer, message);
        // The finished match stays frozen until the host starts a new one or
        // anyone opens a chest; rooms with older clients move on immediately.
        if (canFreeze(room)) broadcast(room);
        else startMatch(room, now);
      } else if (m.t === 'share' && c.room) {
        // Members hand each other relay-signed match results, so everyone's
        // leaderboards hold the same matches. Receivers check every signature.
        const proofs = (Array.isArray(m.proofs) ? m.proofs : []).slice(0, 12)
          .filter(p => p && typeof p.data === 'string' && typeof p.sig === 'string' && p.data.length <= 4000 && p.sig.length <= 200)
          .map(p => ({ data:p.data, sig:p.sig }));
        if (!proofs.length) return;
        const from = c.room.members.get(c).id;
        for (const peer of c.room.members.keys()) if (peer !== c) send(peer, { t:'shared', from, proofs });
      } else if (m.t === 'newMatch' && c.room) {
        const room = c.room;
        // The host can start the next match; anyone can by opening a chest.
        if (room.host !== c && !m.opened) return fail(c, 'Only the host can start a new match');
        if (!room.ended) return;
        startMatch(room, now);
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
