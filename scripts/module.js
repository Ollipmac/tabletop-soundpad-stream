const MODULE_ID = "tabletop-soundpad-stream";
const SOCKET_NAME = `module.${MODULE_ID}`;
const PROTOCOL_VERSION = 1;
const TABLETOP_AUDIO_BASE = "https://tabletopaudio.com/";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SOUNDPADS = [
  ["custom_sp.html", "Custom SoundPad"],
  ["dm_tools_sp.html", "DM Tools"],
  ["combat_sp.html", "Combat"],
  ["combat_siege_sp.html", "Combat: Siege"],
  ["dungeon_sp.html", "The Dungeon"],
  ["darkforest_sp.html", "Dark Forest"],
  ["tavern_sp.html", "The Tavern"],
  ["olde_towne_sp.html", "Olde Towne"],
  ["castle_raven_sp.html", "Castle Raven"],
  ["monsters_sp.html", "Monster Pack"],
  ["sanctum_sp.html", "Sanctum"],
  ["bleakwater_docks_sp.html", "Bleakwater Docks"],
  ["ancient_greece_sp.html", "Ancient Greece"],
  ["vikings_sp.html", "Vikings"],
  ["atlantis_sp.html", "Atlantis"],
  ["cthulhu_sp.html", "Cthulhu"],
  ["wuxia_sp.html", "Wuxia"],
  ["vampire_sp.html", "Vampire"],
  ["secret_agent_sp.html", "Secret Agent"],
  ["film_noir_sp.html", "Film Noir"],
  ["steampunk_sp.html", "Steampunk"],
  ["true_west_sp.html", "True West"],
  ["age_of_sail_sp.html", "Age of Sail"],
  ["house_on_the_hill_sp.html", "House on the Hill"],
  ["jungle_planet_sp.html", "Jungle Planet"],
  ["desert_planet_sp.html", "Desert Planet"],
  ["ice_planet_sp.html", "Ice Planet"],
  ["hell_planet_sp.html", "Hell Planet"],
  ["wasteland_sp.html", "Wasteland"],
  ["weirder_things_sp.html", "Weirder Things"],
  ["future_city_sp.html", "Future City"],
  ["combat_future_sp.html", "Combat: Future"],
  ["deep_six_sp.html", "Deep Six"],
  ["starship_sp.html", "Starship"],
  ["alien_starship_sp.html", "Alien Starship"]
].map(([path, label]) => ({ path, label, url: new URL(path, TABLETOP_AUDIO_BASE).href }));

const ICE_CONFIGURATION = {
  iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
  bundlePolicy: "max-bundle"
};

function i18n(key, data) {
  return data ? game.i18n.format(`${MODULE_ID}.${key}`, data) : game.i18n.localize(`${MODULE_ID}.${key}`);
}

function isActiveUser(user) {
  return Boolean(user?.active);
}

function isTrustedGM(userId) {
  return Boolean(game.users?.get(userId)?.isGM);
}

function socketEmit(message) {
  game.socket.emit(SOCKET_NAME, {
    protocol: PROTOCOL_VERSION,
    senderId: game.user.id,
    ...message
  });
}

function serializeDescription(description) {
  return description?.toJSON ? description.toJSON() : { type: description.type, sdp: description.sdp };
}

function serializeCandidate(candidate) {
  return candidate?.toJSON ? candidate.toJSON() : candidate;
}

class SoundPadHub extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-hub`,
    classes: [MODULE_ID, "soundpad-hub"],
    tag: "section",
    window: {
      title: `${MODULE_ID}.hub.title`,
      icon: "fa-solid fa-tower-broadcast",
      minimizable: true,
      resizable: true
    },
    position: {
      width: 560,
      height: 690
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/hub.hbs`
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selectedPad = game.settings.get(MODULE_ID, "selectedPad");
    const users = Array.from(game.users ?? [])
      .filter((user) => !user.isGM)
      .map((user) => ({
        id: user.id,
        name: user.name,
        active: user.active,
        status: streamService.peerStatus(user.id),
        statusLabel: i18n(`status.${streamService.peerStatus(user.id)}`)
      }));

    return foundry.utils.mergeObject(context, {
      pads: SOUNDPADS.map((pad) => ({ ...pad, selected: pad.path === selectedPad })),
      active: streamService.isBroadcasting,
      captureState: streamService.captureState,
      captureStateLabel: i18n(`status.${streamService.captureState}`),
      connectedCount: streamService.connectedPeerCount,
      activePlayerCount: users.filter((user) => user.active).length,
      users,
      supportsCapture: Boolean(navigator.mediaDevices?.getDisplayMedia),
      version: game.modules.get(MODULE_ID)?.version ?? "0.1.0"
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element.querySelector("[data-role='pad-select']")?.addEventListener("change", async (event) => {
      await game.settings.set(MODULE_ID, "selectedPad", event.currentTarget.value);
    });

    this.element.querySelector("[data-action='open-pad']")?.addEventListener("click", (event) => {
      event.preventDefault();
      streamService.openSelectedPad();
    });

    this.element.querySelector("[data-action='start-stream']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.currentTarget.disabled = true;
      try {
        await streamService.startBroadcast();
      } catch (error) {
        console.error(`${MODULE_ID} | Unable to start capture`, error);
        ui.notifications.error(error?.message || i18n("errors.captureFailed"));
      } finally {
        if (this.rendered) this.render();
      }
    });

    this.element.querySelector("[data-action='stop-stream']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await streamService.stopBroadcast({ announce: true });
    });
  }
}

class SoundPadReceiver extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-receiver`,
    classes: [MODULE_ID, "soundpad-receiver"],
    tag: "section",
    window: {
      title: `${MODULE_ID}.receiver.title`,
      icon: "fa-solid fa-headphones",
      minimizable: true,
      resizable: false
    },
    position: {
      width: 410,
      height: "auto"
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/receiver.hbs`
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const volume = Number(game.settings.get(MODULE_ID, "receiverVolume") ?? 0.8);
    return foundry.utils.mergeObject(context, {
      remoteActive: streamService.remoteActive,
      listening: streamService.listeningEnabled,
      connectionState: streamService.receiverState,
      connectionStateLabel: i18n(`status.${streamService.receiverState}`),
      volume,
      volumePercent: Math.round(volume * 100),
      gmName: streamService.remoteGMName || i18n("receiver.theGM")
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    this.element.querySelector("[data-action='enable-listening']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await streamService.enableListening();
      } catch (error) {
        console.error(`${MODULE_ID} | Unable to enable listening`, error);
        ui.notifications.error(i18n("errors.audioContext"));
      }
    });

    this.element.querySelector("[data-action='disable-listening']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await streamService.disableListening();
    });

    this.element.querySelector("[data-role='receiver-volume']")?.addEventListener("input", async (event) => {
      const volume = Math.max(0, Math.min(1, Number(event.currentTarget.value)));
      streamService.setReceiverVolume(volume);
      this.element.querySelector("[data-role='volume-value']").textContent = `${Math.round(volume * 100)}%`;
    });

    this.element.querySelector("[data-role='receiver-volume']")?.addEventListener("change", async (event) => {
      await game.settings.set(MODULE_ID, "receiverVolume", Number(event.currentTarget.value));
    });
  }
}

class SoundPadStreamService {
  constructor() {
    this.captureStream = null;
    this.streamId = null;
    this.captureState = "idle";
    this.remoteActive = false;
    this.remoteStreamId = null;
    this.remoteGMId = null;
    this.remoteGMName = "";
    this.listeningEnabled = false;
    this.receiverState = "disabled";
    this.audioContext = null;
    this.gainNode = null;
    this.sourceNode = null;
    this.remoteMediaStream = null;
    this.peers = new Map();
    this.orphanCandidates = new Map();
    this.retryTimers = new Map();
  }

  get isBroadcasting() {
    return Boolean(this.captureStream && this.streamId && this.captureState === "broadcasting");
  }

  get connectedPeerCount() {
    return Array.from(this.peers.values()).filter((peer) => peer.role === "sender" && peer.state === "connected").length;
  }

  peerStatus(userId) {
    if (!isActiveUser(game.users?.get(userId))) return "offline";
    if (!this.isBroadcasting) return "waiting";
    return this.peers.get(userId)?.state ?? "waiting";
  }

  refreshApps() {
    const hub = foundry.applications.instances.get(`${MODULE_ID}-hub`);
    if (hub?.rendered) hub.render();
    const receiver = foundry.applications.instances.get(`${MODULE_ID}-receiver`);
    if (receiver?.rendered) receiver.render();
  }

  openSelectedPad() {
    const selected = game.settings.get(MODULE_ID, "selectedPad");
    const pad = SOUNDPADS.find((entry) => entry.path === selected) ?? SOUNDPADS[0];
    window.open(pad.url, "tabletop-audio-soundpad", "noopener,noreferrer");
  }

  async startBroadcast() {
    if (!game.user.isGM) throw new Error(i18n("errors.gmOnly"));
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error(i18n("errors.captureUnsupported"));

    await this.stopBroadcast({ announce: false });
    this.captureState = "requesting";
    this.refreshApps();

    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser"
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2
        },
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: "include"
      });
    } catch (error) {
      this.captureState = "idle";
      this.refreshApps();
      if (error?.name === "NotAllowedError") throw new Error(i18n("errors.captureCancelled"));
      throw error;
    }

    const audioTrack = displayStream.getAudioTracks()[0];
    if (!audioTrack) {
      displayStream.getTracks().forEach((track) => track.stop());
      this.captureState = "idle";
      this.refreshApps();
      throw new Error(i18n("errors.noAudioTrack"));
    }

    displayStream.getVideoTracks().forEach((track) => track.stop());
    this.captureStream = new MediaStream([audioTrack]);
    this.streamId = foundry.utils.randomID(24);
    this.captureState = "broadcasting";

    audioTrack.addEventListener("ended", () => {
      if (this.isBroadcasting) this.stopBroadcast({ announce: true });
    }, { once: true });

    socketEmit({ type: "announce-start", streamId: this.streamId });
    ui.notifications.info(i18n("notifications.broadcastStarted"));
    this.refreshApps();
  }

  async stopBroadcast({ announce = true } = {}) {
    const previousStreamId = this.streamId;
    this.captureState = "stopping";

    for (const [userId] of this.peers) this.closePeer(userId);
    this.captureStream?.getTracks().forEach((track) => track.stop());
    this.captureStream = null;
    this.streamId = null;
    this.captureState = "idle";

    if (announce && game.user?.isGM && previousStreamId) {
      socketEmit({ type: "announce-stop", streamId: previousStreamId });
      ui.notifications.info(i18n("notifications.broadcastStopped"));
    }
    this.refreshApps();
  }

  async enableListening() {
    if (game.user.isGM) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("AudioContext unavailable");

    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContextClass();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    await this.audioContext.resume();
    this.listeningEnabled = true;
    this.receiverState = this.remoteActive ? "connecting" : "waiting";
    this.setReceiverVolume(Number(game.settings.get(MODULE_ID, "receiverVolume") ?? 0.8));

    if (this.remoteActive && this.remoteStreamId && this.remoteGMId) {
      socketEmit({
        type: "receiver-ready",
        target: this.remoteGMId,
        streamId: this.remoteStreamId
      });
    } else {
      socketEmit({ type: "hello" });
    }
    this.refreshApps();
  }

  async disableListening() {
    this.listeningEnabled = false;
    this.receiverState = "disabled";
    this.disconnectRemoteAudio();
    if (this.remoteGMId) this.closePeer(this.remoteGMId);
    if (this.audioContext?.state === "running") await this.audioContext.suspend();
    this.refreshApps();
  }

  setReceiverVolume(volume) {
    const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setTargetAtTime(safeVolume, this.audioContext.currentTime, 0.015);
    }
  }

  connectRemoteAudio(stream) {
    this.disconnectRemoteAudio({ stopTracks: false });
    this.remoteMediaStream = stream;
    if (!this.audioContext || !this.gainNode) return;
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.gainNode);
    this.receiverState = "connected";
    this.refreshApps();
  }

  disconnectRemoteAudio({ stopTracks = true } = {}) {
    try {
      this.sourceNode?.disconnect();
    } catch (_error) {
      // Already disconnected.
    }
    this.sourceNode = null;
    if (stopTracks) this.remoteMediaStream?.getTracks().forEach((track) => track.stop());
    this.remoteMediaStream = null;
  }

  createPeer(userId, role) {
    this.closePeer(userId);

    const pc = new RTCPeerConnection(ICE_CONFIGURATION);
    const peer = {
      pc,
      role,
      state: "connecting",
      pendingCandidates: [],
      streamId: role === "sender" ? this.streamId : this.remoteStreamId
    };
    const orphanKey = `${userId}:${peer.streamId}`;
    peer.pendingCandidates.push(...(this.orphanCandidates.get(orphanKey) ?? []));
    this.orphanCandidates.delete(orphanKey);
    this.peers.set(userId, peer);

    pc.addEventListener("icecandidate", (event) => {
      if (!event.candidate) return;
      socketEmit({
        type: "ice-candidate",
        target: userId,
        streamId: peer.streamId,
        candidate: serializeCandidate(event.candidate)
      });
    });

    pc.addEventListener("connectionstatechange", () => {
      peer.state = pc.connectionState || "connecting";
      if (peer.state === "connected") this.clearRetry(userId);
      if (["failed", "disconnected"].includes(peer.state) && role === "receiver") {
        this.receiverState = peer.state;
        this.scheduleReceiverRetry(userId, peer.streamId);
      }
      if (peer.state === "closed" && role === "receiver") this.receiverState = this.listeningEnabled ? "waiting" : "disabled";
      this.refreshApps();
    });

    if (role === "receiver") {
      pc.addEventListener("track", (event) => {
        const stream = event.streams?.[0] ?? new MediaStream([event.track]);
        this.connectRemoteAudio(stream);
      });
    }

    return peer;
  }

  closePeer(userId) {
    this.clearRetry(userId);
    const peer = this.peers.get(userId);
    if (!peer) return;
    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.close();
    } catch (_error) {
      // Peer was already closed.
    }
    this.peers.delete(userId);
  }

  clearRetry(userId) {
    const timer = this.retryTimers.get(userId);
    if (timer) window.clearTimeout(timer);
    this.retryTimers.delete(userId);
  }

  scheduleReceiverRetry(gmId, streamId) {
    if (!this.listeningEnabled || !this.remoteActive || this.retryTimers.has(gmId)) return;
    const timer = window.setTimeout(() => {
      this.retryTimers.delete(gmId);
      this.closePeer(gmId);
      if (this.listeningEnabled && this.remoteActive && this.remoteStreamId === streamId) {
        this.receiverState = "connecting";
        socketEmit({ type: "receiver-ready", target: gmId, streamId });
        this.refreshApps();
      }
    }, 3000);
    this.retryTimers.set(gmId, timer);
  }

  async createOfferFor(userId) {
    if (!this.isBroadcasting || !isActiveUser(game.users?.get(userId))) return;
    const peer = this.createPeer(userId, "sender");
    const audioTrack = this.captureStream.getAudioTracks()[0];
    const sender = peer.pc.addTrack(audioTrack, this.captureStream);

    try {
      const parameters = sender.getParameters();
      if (parameters.encodings?.length) {
        parameters.encodings[0].maxBitrate = Number(game.settings.get(MODULE_ID, "maxBitrate")) || 96000;
        await sender.setParameters(parameters);
      }
    } catch (error) {
      console.debug(`${MODULE_ID} | Browser did not accept the requested bitrate`, error);
    }

    const offer = await peer.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await peer.pc.setLocalDescription(offer);
    socketEmit({
      type: "offer",
      target: userId,
      streamId: this.streamId,
      description: serializeDescription(peer.pc.localDescription)
    });
    this.refreshApps();
  }

  async acceptOffer(message) {
    if (!this.listeningEnabled || !this.remoteActive || message.streamId !== this.remoteStreamId) return;
    const peer = this.createPeer(message.senderId, "receiver");
    await peer.pc.setRemoteDescription(message.description);
    await this.flushCandidates(peer);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    socketEmit({
      type: "answer",
      target: message.senderId,
      streamId: message.streamId,
      description: serializeDescription(peer.pc.localDescription)
    });
    this.receiverState = "connecting";
    this.refreshApps();
  }

  async acceptAnswer(message) {
    const peer = this.peers.get(message.senderId);
    if (!peer || peer.role !== "sender" || message.streamId !== this.streamId) return;
    await peer.pc.setRemoteDescription(message.description);
    await this.flushCandidates(peer);
  }

  async acceptIceCandidate(message) {
    const peer = this.peers.get(message.senderId);
    if (!peer) {
      const orphanKey = `${message.senderId}:${message.streamId}`;
      const queued = this.orphanCandidates.get(orphanKey) ?? [];
      queued.push(message.candidate);
      this.orphanCandidates.set(orphanKey, queued.slice(-32));
      return;
    }
    if (message.streamId !== peer.streamId) return;
    if (!peer.pc.remoteDescription) {
      peer.pendingCandidates.push(message.candidate);
      return;
    }
    await peer.pc.addIceCandidate(message.candidate);
  }

  async flushCandidates(peer) {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) await peer.pc.addIceCandidate(candidate);
  }

  async handleSocket(message) {
    if (!message || message.protocol !== PROTOCOL_VERSION || !message.senderId || message.senderId === game.user.id) return;
    if (message.target && message.target !== game.user.id) return;

    const sender = game.users?.get(message.senderId);
    if (!sender) return;

    try {
      switch (message.type) {
        case "announce-start": {
          if (!sender.isGM || game.user.isGM) return;
          if (this.remoteStreamId && this.remoteStreamId !== message.streamId && this.remoteGMId) this.closePeer(this.remoteGMId);
          this.remoteActive = true;
          this.remoteStreamId = message.streamId;
          this.remoteGMId = message.senderId;
          this.remoteGMName = sender.name;
          this.receiverState = this.listeningEnabled ? "connecting" : "disabled";

          if (game.settings.get(MODULE_ID, "autoOpenReceiver")) {
            getReceiverApp().render({ force: true });
          }
          if (game.settings.get(MODULE_ID, "showNotifications")) {
            ui.notifications.info(i18n("notifications.streamAvailable", { gm: sender.name }));
          }
          if (this.listeningEnabled) {
            socketEmit({ type: "receiver-ready", target: message.senderId, streamId: message.streamId });
          }
          this.refreshApps();
          break;
        }
        case "announce-stop": {
          if (!sender.isGM || game.user.isGM || message.streamId !== this.remoteStreamId) return;
          if (this.remoteGMId) this.closePeer(this.remoteGMId);
          this.disconnectRemoteAudio();
          this.remoteActive = false;
          this.remoteStreamId = null;
          this.remoteGMId = null;
          this.receiverState = this.listeningEnabled ? "waiting" : "disabled";
          if (game.settings.get(MODULE_ID, "showNotifications")) ui.notifications.info(i18n("notifications.streamEnded"));
          this.refreshApps();
          break;
        }
        case "hello": {
          if (!game.user.isGM || !this.isBroadcasting || sender.isGM) return;
          socketEmit({ type: "announce-start", target: message.senderId, streamId: this.streamId });
          break;
        }
        case "receiver-ready": {
          if (!game.user.isGM || !this.isBroadcasting || sender.isGM || message.streamId !== this.streamId) return;
          await this.createOfferFor(message.senderId);
          break;
        }
        case "offer": {
          if (!isTrustedGM(message.senderId) || game.user.isGM) return;
          await this.acceptOffer(message);
          break;
        }
        case "answer": {
          if (!game.user.isGM || sender.isGM) return;
          await this.acceptAnswer(message);
          break;
        }
        case "ice-candidate": {
          if (game.user.isGM === sender.isGM) return;
          await this.acceptIceCandidate(message);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Socket message failed`, message.type, error);
      if (!game.user.isGM) {
        this.receiverState = "failed";
        this.refreshApps();
      }
    }
  }
}

const streamService = new SoundPadStreamService();

function getHubApp() {
  return foundry.applications.instances.get(`${MODULE_ID}-hub`) ?? new SoundPadHub();
}

function getReceiverApp() {
  return foundry.applications.instances.get(`${MODULE_ID}-receiver`) ?? new SoundPadReceiver();
}

function registerSettings() {
  game.settings.register(MODULE_ID, "selectedPad", {
    scope: "client",
    config: false,
    type: String,
    default: "custom_sp.html"
  });

  game.settings.register(MODULE_ID, "receiverVolume", {
    scope: "client",
    config: false,
    type: Number,
    default: 0.8
  });

  game.settings.register(MODULE_ID, "autoOpenReceiver", {
    name: `${MODULE_ID}.settings.autoOpen.name`,
    hint: `${MODULE_ID}.settings.autoOpen.hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "showNotifications", {
    name: `${MODULE_ID}.settings.notifications.name`,
    hint: `${MODULE_ID}.settings.notifications.hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "maxBitrate", {
    name: `${MODULE_ID}.settings.bitrate.name`,
    hint: `${MODULE_ID}.settings.bitrate.hint`,
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 96000,
    range: {
      min: 48000,
      max: 160000,
      step: 16000
    }
  });
}

Hooks.once("init", () => {
  registerSettings();
  console.info(`${MODULE_ID} | Initialised`);
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, (message) => streamService.handleSocket(message));

  game.modules.get(MODULE_ID).api = {
    open: () => (game.user.isGM ? getHubApp() : getReceiverApp()).render({ force: true }),
    start: () => streamService.startBroadcast(),
    stop: () => streamService.stopBroadcast({ announce: true }),
    service: streamService
  };

  if (!game.user.isGM) socketEmit({ type: "hello" });

  window.addEventListener("beforeunload", () => {
    if (game.user?.isGM) streamService.stopBroadcast({ announce: false });
    else streamService.disableListening();
  }, { once: true });
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens?.tools) return;
  controls.tokens.tools[`${MODULE_ID}-open`] = {
    name: `${MODULE_ID}-open`,
    title: `${MODULE_ID}.controls.open`,
    icon: game.user.isGM ? "fa-solid fa-tower-broadcast" : "fa-solid fa-headphones",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      const app = game.user.isGM ? getHubApp() : getReceiverApp();
      if (app.rendered) app.close();
      else app.render({ force: true });
    }
  };
});

Hooks.on("updateUser", (user, changes) => {
  if (!("active" in changes)) return;
  if (game.user.isGM && !user.active) streamService.closePeer(user.id);
  streamService.refreshApps();
});
