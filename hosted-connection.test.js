const test = require('node:test');
const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { createRelay } = require('./relay/server');
const { HostedConnection, DEFAULT_SERVER } = require('./hosted-connection');

test('hosted public browser discovers rooms, joins, synchronizes timelines and removes closed rooms', {timeout:10000}, async t => {
  const {server,wss} = createRelay();
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const clients = [];
  t.after(() => { clients.forEach(c=>c.close()); for(const c of wss.clients) c.terminate(); wss.close(); server.close(); });
  function client(id) {
    const events = new EventEmitter(), received = [];
    const push = (type,data) => { received.push({type,data}); events.emit('message'); };
    const c = new HostedConnection({
      socketFactory:()=>new WebSocket('ws://127.0.0.1:'+server.address().port),
      onNet:d=>push('net',d),onLobbies:d=>push('lobbies',d),onMatchEnd:d=>push('match',d)
    });
    c.state({id,name:id,chests:0,matchStart:Date.now()}); clients.push(c);
    const wait = async (type,predicate=()=>true) => {
      for (;;) {
        const index = received.findIndex(e=>e.type===type && predicate(e.data));
        if(index>=0) return received.splice(index,1)[0].data;
        await once(events,'message');
      }
    };
    return {c,wait};
  }
  const host = client('Host'), guest = client('Guest'), browser = client('Browser');
  browser.c.browse(); assert.deepEqual((await browser.wait('lobbies',d=>!d.loading)).rooms,[]);
  host.c.create(); const room = await host.wait('net',d=>d.status==='host');
  const listed = await browser.wait('lobbies',d=>d.rooms.length===1);
  assert.equal(listed.rooms[0].id,room.code); assert.equal(listed.rooms[0].name,'Host’s room');
  guest.c.join(listed.rooms[0].id); await guest.wait('net',d=>d.status==='client');
  await browser.wait('lobbies',d=>d.rooms[0]?.players===2);
  host.c.state({id:'Host',name:'Host',chests:3,matchStart:Date.now()});
  await guest.wait('net',d=>d.players?.find(p=>p.id==='Host')?.chests===3);
  guest.c.state({id:'Guest',name:'Guest',chests:1,matchStart:Date.now()});
  await host.wait('net',d=>d.players?.find(p=>p.id==='Guest')?.chests===1);
  host.c.endMatch(); const a = await host.wait('match'), b = await guest.wait('match');
  assert.deepEqual(a,b); assert.deepEqual(a.timeline.map(e=>[e.id,e.n]),[['Host',3],['Guest',1]]);
  assert.ok(a.start<=a.end);
  host.c.close(); await browser.wait('lobbies',d=>d.rooms.length===0);
  await guest.wait('net',d=>d.status==='off');
  guest.c.create(); await guest.wait('net',d=>d.status==='host');
  await browser.wait('lobbies',d=>d.rooms.length===1 && d.rooms[0].name==='Guest’s room');
  guest.c.leave(); await browser.wait('lobbies',d=>d.rooms.length===0);
});

test('default connection always selects the hosted server and ignores stale socket events', () => {
  assert.equal(DEFAULT_SERVER,'ws://85.220.66.209:47800');
  const sockets=[],states=[];
  const c = new HostedConnection({onNet:d=>states.push(d),onLobbies(){},onMatchEnd(){},socketFactory:()=>{
    const s = new EventEmitter(); s.readyState=0; s.close=()=>{}; s.terminate=()=>{}; s.send=()=>{}; sockets.push(s); return s;
  }});
  c.create(); c.leave();
  sockets[0].emit('error',new Error('old connection'));
  assert.equal(states.at(-1).status,'off');
  c.close();
});
