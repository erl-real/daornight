const SIGNAL_URL = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') +
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'localhost:3001'
    : 'signal.neverendever.com');

export class NetworkManager {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.lobbyId = null;
    this.role = null;
    this.peerConn = null;
    this.dataChannel = null;
    this.peers = new Map();

    this.onConnected = null;
    this.onLobbyList = null;
    this.onJoinedLobby = null;
    this.onLobbyUpdate = null;
    this.onLobbyClosed = null;
    this.onMatchStart = null;
    this.onError = null;
    this.onSignal = null;
  }

  connect(url) {
    if (this.ws) this.disconnect();
    this.ws = new WebSocket(url || SIGNAL_URL);

    this.ws.onopen = () => {
      console.log('[Net] Connected to signal server');
    };

    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'connected':
          this.playerId = msg.data.playerId;
          if (this.onConnected) this.onConnected(msg.data);
          break;
        case 'lobby_list':
          if (this.onLobbyList) this.onLobbyList(msg.data);
          break;
        case 'joined_lobby':
          this.lobbyId = msg.data.lobbyId;
          this.role = msg.data.role;
          if (this.onJoinedLobby) this.onJoinedLobby(msg.data);
          break;
        case 'lobby_update':
          if (this.onLobbyUpdate) this.onLobbyUpdate(msg.data);
          break;
        case 'lobby_closed':
          this.lobbyId = null;
          this.role = null;
          if (this.onLobbyClosed) this.onLobbyClosed(msg.data);
          break;
        case 'match_start':
          if (this.onMatchStart) this.onMatchStart(msg.data);
          break;
        case 'signal':
          this.handleSignal(msg.data);
          if (this.onSignal) this.onSignal(msg.data);
          break;
        case 'error':
          if (this.onError) this.onError(msg.data);
          break;
      }
    };

    this.ws.onclose = () => {
      console.log('[Net] Disconnected');
      this.playerId = null;
      this.lobbyId = null;
    };

    this.ws.onerror = (err) => {
      console.error('[Net] WS error', err);
    };
  }

  disconnect() {
    this.closeAllPeers();
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.playerId = null;
    this.lobbyId = null;
    this.role = null;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  findMatches() {
    this.send({ type: 'find_match' });
  }

  hostLobby(data = {}) {
    this.send({ type: 'host_lobby', data });
  }

  joinLobby(lobbyId, data = {}) {
    this.send({ type: 'join_lobby', data: { ...data, lobbyId } });
  }

  leaveLobby() {
    this.closeAllPeers();
    this.send({ type: 'leave_lobby', data: { lobbyId: this.lobbyId } });
    this.lobbyId = null;
    this.role = null;
  }

  closeLobby() {
    this.send({ type: 'close_lobby', data: { lobbyId: this.lobbyId } });
    this.closeAllPeers();
    this.lobbyId = null;
    this.role = null;
  }

  setReady(ready) {
    this.send({ type: 'set_ready', data: { lobbyId: this.lobbyId, ready } });
  }

  startMatch() {
    this.send({ type: 'start_match', data: { lobbyId: this.lobbyId } });
  }

  initWebRTC(targetId, isPolite = true) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
    dc.onopen = () => console.log(`[Net] DataChannel open to ${targetId}`);
    dc.onclose = () => console.log(`[Net] DataChannel closed to ${targetId}`);
    dc.onmessage = (e) => {
      if (this.onDataChannelMessage) this.onDataChannelMessage(targetId, e.data);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ type: 'signal', data: { to: targetId, ice: e.candidate } });
      }
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => console.log(`[Net] DataChannel from ${targetId} open`);
      channel.onclose = () => console.log(`[Net] DataChannel from ${targetId} closed`);
      channel.onmessage = (e) => {
        if (this.onDataChannelMessage) this.onDataChannelMessage(targetId, e.data);
      };
      this.dataChannel = channel;
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.peers.delete(targetId);
      }
    };

    this.peers.set(targetId, { pc, dc, isPolite });
    return { pc, dc };
  }

  async createOffer(targetId) {
    const { pc, dc } = this.initWebRTC(targetId, false);
    this.dataChannel = dc;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ type: 'signal', data: { to: targetId, sdp: pc.localDescription } });
  }

  async handleSignal(data) {
    const fromId = data.from;
    let peer = this.peers.get(fromId);
    if (!peer && data.sdp?.type === 'offer') {
      peer = this.initWebRTC(fromId, true);
    }
    if (!peer) return;

    const { pc } = peer;

    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ type: 'signal', data: { to: fromId, sdp: pc.localDescription } });
      } else if (data.sdp.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    }

    if (data.ice) {
      try { await pc.addIceCandidate(new RTCIceCandidate(data.ice)); } catch {}
    }
  }

  sendData(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  broadcastData(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    for (const [id, { dc }] of this.peers) {
      if (dc.readyState === 'open') {
        try { dc.send(msg); } catch {}
      }
    }
  }

  closeAllPeers() {
    for (const [id, { pc }] of this.peers) {
      pc.close();
    }
    this.peers.clear();
    this.dataChannel = null;
  }
}
