import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};

  constructor() {
    this.rendered = false;
    this.element = { querySelector: () => null };
  }

  render() {
    this.rendered = true;
    return this;
  }

  close() {
    this.rendered = false;
  }

  async _prepareContext() {
    return {};
  }

  async _onRender() {}
}

class UserCollection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }
}

class FakeTrack {
  constructor(kind) {
    this.kind = kind;
    this.stopped = false;
    this.listeners = new Map();
  }

  stop() {
    this.stopped = true;
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }
}

class FakeMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

class FakePeerConnection {
  static instances = [];

  constructor() {
    this.listeners = new Map();
    this.connectionState = "new";
    this.remoteDescription = null;
    this.remoteDescriptionCalls = 0;
    this.localDescription = null;
    FakePeerConnection.instances.push(this);
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  addTrack() {
    return {
      getParameters: () => ({ encodings: [{}] }),
      setParameters: async (parameters) => {
        this.senderParameters = parameters;
      }
    };
  }

  async createOffer() {
    return { type: "offer", sdp: "fake-offer" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "fake-answer" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.remoteDescriptionCalls += 1;
  }

  async addIceCandidate() {}

  close() {
    this.connectionState = "closed";
  }
}

class FakeAudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
  }

  createGain() {
    return {
      gain: { setTargetAtTime() {} },
      connect() {}
    };
  }

  createMediaStreamSource() {
    return {
      connect() {},
      disconnect() {}
    };
  }

  async resume() {
    this.state = "running";
  }

  async suspend() {
    this.state = "suspended";
  }
}

function createRuntime({ currentUserId, displayStream }) {
  const onceHooks = new Map();
  const onHooks = new Map();
  const emitted = [];
  const settingValues = new Map();
  const moduleRecord = { version: "0.1.0" };
  let socketHandler;

  globalThis.Hooks = {
    once: (name, callback) => onceHooks.set(name, callback),
    on: (name, callback) => onHooks.set(name, callback)
  };

  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getDisplayMedia: async () => displayStream } },
    configurable: true
  });

  globalThis.MediaStream = FakeMediaStream;
  globalThis.RTCPeerConnection = FakePeerConnection;
  globalThis.window = {
    AudioContext: FakeAudioContext,
    open() {},
    addEventListener() {},
    clearTimeout,
    setTimeout
  };
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2, HandlebarsApplicationMixin: (Base) => Base },
      instances: new Map()
    },
    utils: {
      mergeObject: (_left, right) => right,
      randomID: () => "stream-test-id"
    }
  };

  const users = new UserCollection([
    ["gm", { id: "gm", name: "MJ", isGM: true, active: true }],
    ["player", { id: "player", name: "Joueuse", isGM: false, active: true }]
  ]);

  globalThis.game = {
    user: users.get(currentUserId),
    users,
    i18n: { localize: (key) => key, format: (key) => key },
    modules: new Map([["tabletop-soundpad-stream", moduleRecord]]),
    settings: {
      register: (moduleId, key, data) => settingValues.set(`${moduleId}.${key}`, data.default),
      get: (moduleId, key) => settingValues.get(`${moduleId}.${key}`),
      set: async (moduleId, key, value) => settingValues.set(`${moduleId}.${key}`, value)
    },
    socket: {
      on: (_name, callback) => {
        socketHandler = callback;
      },
      emit: (_name, message) => emitted.push(message)
    }
  };
  globalThis.ui = { notifications: { info() {}, error() {} } };

  return {
    emitted,
    moduleRecord,
    onceHooks,
    getSocketHandler: () => socketHandler
  };
}

async function loadModule(testName) {
  await import(`../scripts/module.js?smoke=${testName}-${Date.now()}`);
}

async function testGM() {
  FakePeerConnection.instances = [];
  const audioTrack = new FakeTrack("audio");
  const videoTrack = new FakeTrack("video");
  const displayStream = new FakeMediaStream([audioTrack, videoTrack]);
  const runtime = createRuntime({ currentUserId: "gm", displayStream });

  await loadModule("gm");
  await runtime.onceHooks.get("init")();
  await runtime.onceHooks.get("ready")();
  await runtime.moduleRecord.api.start();

  assert.equal(videoTrack.stopped, true, "video capture must stop immediately");
  assert.equal(audioTrack.stopped, false, "audio capture must remain active");
  assert.ok(runtime.emitted.some((message) => message.type === "announce-start"));

  await runtime.getSocketHandler()({
    protocol: 1,
    type: "receiver-ready",
    senderId: "player",
    target: "gm",
    streamId: "stream-test-id"
  });
  assert.ok(runtime.emitted.some((message) => message.type === "offer" && message.target === "player"));
  assert.equal(FakePeerConnection.instances.at(-1).senderParameters.encodings[0].maxBitrate, 96000);

  await runtime.moduleRecord.api.stop();
  assert.equal(audioTrack.stopped, true, "audio capture must stop with broadcast");
  assert.ok(runtime.emitted.some((message) => message.type === "announce-stop"));
}

async function testPlayer() {
  FakePeerConnection.instances = [];
  const runtime = createRuntime({ currentUserId: "player", displayStream: new FakeMediaStream() });

  await loadModule("player");
  await runtime.onceHooks.get("init")();
  await runtime.onceHooks.get("ready")();
  assert.ok(runtime.emitted.some((message) => message.type === "hello"));

  await runtime.getSocketHandler()({
    protocol: 1,
    type: "announce-start",
    senderId: "gm",
    streamId: "stream-test-id"
  });
  await runtime.moduleRecord.api.service.enableListening();
  assert.ok(runtime.emitted.some((message) => message.type === "receiver-ready" && message.target === "gm"));

  await runtime.getSocketHandler()({
    protocol: 1,
    type: "offer",
    senderId: "gm",
    target: "player",
    streamId: "stream-test-id",
    description: { type: "offer", sdp: "fake-offer" }
  });
  const peer = FakePeerConnection.instances.at(-1);
  assert.equal(peer.remoteDescriptionCalls, 1);
  assert.ok(runtime.emitted.some((message) => message.type === "answer" && message.target === "gm"));

  const remoteTrack = new FakeTrack("audio");
  peer.listeners.get("track")({ streams: [new FakeMediaStream([remoteTrack])], track: remoteTrack });
  assert.equal(runtime.moduleRecord.api.service.receiverState, "connected");

  await runtime.moduleRecord.api.service.disableListening();
  assert.equal(remoteTrack.stopped, true, "remote audio must stop when listening is disabled");
}

const role = process.argv[2];
if (role === "gm") {
  await testGM();
} else if (role === "player") {
  await testPlayer();
} else {
  const testPath = fileURLToPath(import.meta.url);
  for (const childRole of ["gm", "player"]) {
    const result = spawnSync(process.execPath, [testPath, childRole], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
  }
  console.log("GM and player WebRTC smoke tests OK");
}
