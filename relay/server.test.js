const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createRelay } = require('./server');
function messages(socket) {
  const backlog = [], waiting = [];
  socket.on('message', raw => {
    const msg = JSON.parse(raw);
    const i = waiting.findIndex(w => w.t === msg.t);
    if (i >= 0) { const w = waiting.splice(i,1)[0]; clearTimeout(w.timer); w.resolve(msg); }
    else backlog.push(msg);
  });
  return t => {
    const i = backlog.findIndex(m => m.t === t);
    if (i >= 0) return Promise.resolve(backlog.splice(i,1)[0]);
    return new Promise((resolve,reject) => {
      const w = { t, resolve, timer:setTimeout(() => reject(new Error('Timed out: '+t)),3000) }; waiting.push(w);
    });
  };
}
test('host controls match endings; everyone receives the same recap; host departure closes room', async () => {
  const { server, wss, rooms } = createRelay();
  server.listen(0, '127.0.0.1'); await once(server,'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = new WebSocket(url), client = new WebSocket(url);
  const hostMsg = messages(host), clientMsg = messages(client);
  try {
    await Promise.all([once(host,'open'),once(client,'open')]);
    const send = (c,m) => c.send(JSON.stringify(m));
    send(host,{ t:'create', v:2, p:{ id:'host',name:'Host',chests:3,matchStart:123456789,streak:2 } });
    const created = await hostMsg('roster');
    assert.match(created.code,/^[A-F0-9]{10}$/);
    assert.equal(created.players[0].matchStart,123456789);
    send(host,{t:'state',p:{id:'host',name:'Host',chests:6,matchStart:123456789}});
    const alone = await hostMsg('roster');
    assert.equal(alone.players[0].streak,0);
    assert.equal(alone.players[0].bestStreak,0);
    send(host,{t:'state',p:{id:'host',name:'Host',chests:3,matchStart:123456789}});
    await hostMsg('roster');
    send(client,{ t:'join',v:2,code:created.code,p:{ id:'friend',name:'Friend',chests:5 } });
    assert.equal((await clientMsg('roster')).role,'client'); await hostMsg('roster');
    send(host,{ t:'state',p:{ id:'host',name:'Host',chests:6,matchStart:123456789 } });
    await hostMsg('roster'); await clientMsg('roster');
    send(client,{ t:'state',p:{ id:'friend',name:'Friend',chests:6,matchStart:123456789 } });
    await hostMsg('roster'); await clientMsg('roster');
    send(host,{ t:'state',p:{ id:'host',name:'Host',chests:8,matchStart:123456789 } });
    await hostMsg('roster'); await clientMsg('roster');
    send(client,{t:'endMatch'});
    assert.equal((await clientMsg('error')).error,'Only the host can end a match');
    send(host,{t:'endMatch'});
    const [a,b] = await Promise.all([hostMsg('matchEnd'),clientMsg('matchEnd')]);
    assert.deepEqual(a,b); assert.deepEqual(a.players.map(p=>p.chests),[8,6]);
    assert.equal(a.players.find(p=>p.id==='host').bestStreak,5); // one opening by Friend does not break the host's streak
    const frozen = await clientMsg('roster');
    assert.equal(frozen.ended,true); assert.deepEqual(frozen.players.map(p=>p.chests),[8,6]);
    await hostMsg('roster');
    send(client,{t:'newMatch'});
    assert.equal((await clientMsg('error')).error,'Only the host can start a new match');
    send(host,{t:'newMatch'});
    const [started] = await Promise.all([clientMsg('matchStart'),hostMsg('matchStart')]);
    const reset = await clientMsg('roster');
    assert.equal(reset.ended,false);
    assert.deepEqual(reset.players.map(p=>p.chests),[0,0]);
    assert.equal(reset.players[0].matchStart,started.start);
    // Any member's chest opening starts the next frozen match.
    send(host,{t:'endMatch'});
    await Promise.all([hostMsg('matchEnd'),clientMsg('matchEnd')]);
    assert.equal((await clientMsg('roster')).ended,true); await hostMsg('roster');
    send(client,{t:'newMatch',opened:true});
    await Promise.all([clientMsg('matchStart'),hostMsg('matchStart')]);
    assert.equal((await clientMsg('roster')).ended,false); await hostMsg('roster');
    const closed = once(client,'close'); host.close(); await closed;
    assert.equal(rooms.size,0);
  } finally {
    host.terminate(); client.terminate(); wss.close(); server.close();
  }
});

test('rooms with clients older than 1.1.8 start the next match immediately', async () => {
  const { server, wss } = createRelay();
  server.listen(0, '127.0.0.1'); await once(server,'listening');
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = new WebSocket(url), old = new WebSocket(url), late = new WebSocket(url);
  const hostMsg = messages(host), oldMsg = messages(old), lateMsg = messages(late);
  try {
    await Promise.all([once(host,'open'),once(old,'open'),once(late,'open')]);
    const send = (c,m) => c.send(JSON.stringify(m));
    send(host,{t:'create',v:2,p:{id:'host',name:'Host',chests:0,matchStart:1}});
    const created = await hostMsg('roster');
    send(old,{t:'join',code:created.code,p:{id:'old',name:'Old',chests:0,matchStart:1}});
    await oldMsg('roster'); await hostMsg('roster');
    send(host,{t:'endMatch'});
    await Promise.all([hostMsg('matchEnd'),oldMsg('matchEnd'),hostMsg('matchStart')]);
    const next = await hostMsg('roster');
    assert.equal(next.ended,false);
    // An older client sends states stamped after the end; they count again.
    send(old,{t:'state',p:{id:'old',name:'Old',chests:1,matchStart:Date.now()}});
    assert.equal((await hostMsg('roster')).players.find(p=>p.id==='old').chests,1);
    // A frozen room unfreezes when an older client joins it.
    old.close(); await hostMsg('roster');
    send(host,{t:'endMatch'});
    await hostMsg('matchEnd');
    assert.equal((await hostMsg('roster')).ended,true);
    send(late,{t:'join',code:created.code,p:{id:'late',name:'Late',chests:4}});
    await hostMsg('roster'); await hostMsg('matchStart');
    assert.equal((await hostMsg('roster')).ended,false);
  } finally {
    host.terminate(); old.terminate(); late.terminate(); wss.close(); server.close();
  }
});
