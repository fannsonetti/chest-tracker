const WebSocket = require('ws');
const DEFAULT_SERVER = 'ws://85.220.66.209:47800';

class HostedConnection {
  constructor({ onNet, onLobbies, onMatchEnd, onMatchStart = () => {}, socketFactory = () => new WebSocket(DEFAULT_SERVER, {handshakeTimeout:8000,maxPayload:16*1024*1024}) }) {
    Object.assign(this, {onNet,onLobbies,onMatchEnd,onMatchStart,socketFactory});
    this.player = {}; this.socket = null; this.role = null; this.pending = null; this.roster = [];
  }
  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  requestLobbies() {
    this.send({t:'browse'});
    clearTimeout(this.lobbyTimer);
    this.lobbyTimer = setTimeout(() => this.onLobbies({rooms:[],error:'The hosted server needs the public lobby update. Please update the server and refresh.'}),5000);
    this.lobbyTimer.unref?.();
  }
  browse() {
    if (this.socket) { if (this.socket.readyState === WebSocket.OPEN) this.requestLobbies(); return; }
    this.onLobbies({rooms:[],error:'',loading:true});
    const socket = this.socket = this.socketFactory();
    socket.on('open', () => {
      if (this.socket !== socket) return;
      this.requestLobbies();
      if (this.pending) this.send({...this.pending,p:this.player});
    });
    socket.on('message', raw => {
      if (this.socket !== socket) return;
      try {
        const m = JSON.parse(raw);
        if (m.t === 'lobbies' && Array.isArray(m.rooms)) {
          clearTimeout(this.lobbyTimer); this.onLobbies({rooms:m.rooms,error:''});
        }
        else if (m.t === 'roster' && ['host','client'].includes(m.role) && Array.isArray(m.players)) {
          this.pending = null; this.role = m.role; this.roster = m.players;
          this.onNet({status:m.role,players:m.players,hosted:true,code:m.code,ended:!!m.ended});
        } else if (m.t === 'matchEnd') this.onMatchEnd(m);
        else if (m.t === 'matchStart' && Number.isFinite(m.start)) this.onMatchStart(m);
        else if (m.t === 'error') {
          this.pending = null;
          this.onNet({status:this.role || 'off',players:this.roster,error:m.error});
        }
      } catch {}
    });
    const disconnected = reason => {
      if (this.socket !== socket) return;
      clearTimeout(this.lobbyTimer);
      const wasInRoom = this.role || this.pending;
      this.socket = null; this.role = null; this.pending = null;
      this.onLobbies({rooms:[],error:reason});
      if (wasInRoom) this.onNet({status:'off',players:[],error:reason});
      socket.terminate();
    };
    socket.on('error', () => disconnected('Could not connect to the default hosted server.'));
    socket.on('close', () => disconnected('Connection closed. Refresh the lobby browser to reconnect.'));
  }
  enter(action) {
    if (this.role || this.pending) return;
    this.pending = action;
    this.onNet({status:'connecting',players:[]});
    if (this.socket?.readyState === WebSocket.OPEN) this.send({...action,p:this.player});
    else this.browse();
  }
  create() { this.enter({t:'create'}); }
  join(id) { this.enter({t:'join',code:String(id || '')}); }
  state(player) { this.player = player; if (this.role) this.send({t:'state',p:player}); }
  endMatch() { if (this.role === 'host') this.send({t:'endMatch'}); }
  newMatch() { if (this.role === 'host') this.send({t:'newMatch'}); }
  leave() {
    this.close();
    this.onNet({status:'off',players:[]});
    this.onLobbies({rooms:[],error:''});
    this.browse();
  }
  close() {
    clearTimeout(this.lobbyTimer);
    const old = this.socket; this.socket = null; this.role = null; this.pending = null;
    if (old) { old.close(); }
  }
}
module.exports = { HostedConnection, DEFAULT_SERVER };
