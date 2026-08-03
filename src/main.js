import * as THREE from "three";
import "./styles.css";

const FIELD_WIDTH = 68;
const FIELD_LENGTH = 112;
const POST_HALF_WIDTH = 2.75;
const GOAL_Z = -1.1;
const CROSSBAR_HEIGHT = 3;
const BLACK_DOT_HALF_WIDTH = 0.35;
const BALL_GROUND_Y = 0.58;
const BALL_TEE_Y = 1.23;
const BALL_TEE_PITCH = -0.55;
const BALL_TEE_LEAN = 1.05;
const BALL_TEE_Z_OFFSET = -0.36;
const BALL_POST_RADIUS = 0.56;
const POST_RADIUS = 0.075;
const POST_GOAL_INSIDE_SHARE = 0.75;
const CELEBRATION_SECONDS = 6.5;
const TWO_PI = Math.PI * 2;
const SOUND_MUTED_STORAGE_KEY = "invincibleGoalSoundMuted";

const kicks = [
  { name: "Centre 22m", x: 0, z: 22 },
  { name: "Centre left 24m", x: -4, z: 24 },
  { name: "Centre right 27m", x: 8, z: 27 },
  { name: "Left edge 30m", x: -14, z: 30 },
  { name: "Right edge 32m", x: 17, z: 32 },
  { name: "Left channel 35m", x: -22, z: 35 },
  { name: "Right channel 38m", x: 24, z: 38 },
  { name: "Left touchline 41m", x: -29, z: 41 },
  { name: "Right touchline 44m", x: 31, z: 44 },
  { name: "Corner 46m", x: -33, z: 46 },
];

const ui = {
  app: document.querySelector("#app"),
  kickNumber: document.querySelector("#kick-number"),
  streak: document.querySelector("#streak"),
  position: document.querySelector("#kick-position"),
  wind: document.querySelector("#wind"),
  windVane: document.querySelector("#wind-vane"),
  powerReadout: document.querySelector("#power-readout"),
  powerTarget: document.querySelector("#power-target"),
  powerMarker: document.querySelector("#power-marker"),
  directionReadout: document.querySelector("#direction-readout"),
  directionSweet: document.querySelector("#direction-sweet"),
  directionMarker: document.querySelector("#direction-marker"),
  windCue: document.querySelector("#wind-cue"),
  phaseLabel: document.querySelector("#phase-label"),
  resultLabel: document.querySelector("#result-label"),
  coachLine: document.querySelector("#coach-line"),
  actionButton: document.querySelector("#action-button"),
  mainMenu: document.querySelector("#main-menu"),
  newGameButton: document.querySelector("#new-game-button"),
  backgroundButtons: Array.from(document.querySelectorAll("[data-background]")),
  bestScore: document.querySelector("#best-score"),
  menuSummary: document.querySelector("#menu-summary"),
  fanfare: document.querySelector("#fanfare"),
  fanfareSmall: document.querySelector("#fanfare-small"),
  fanfareLarge: document.querySelector("#fanfare-large"),
  soundButtons: Array.from(document.querySelectorAll("[data-sound-toggle]")),
};

ui.app.className = "phase-menu";

const canvas = document.querySelector("#game-canvas");
let renderer = null;
let scene = null;
let camera = null;
let clock = null;
let goalGroup = null;
let ballGroup = null;
let teeGroup = null;
let shadow = null;
let kickMarker = null;
let celebrationGroup = null;
const backgroundGroups = {};
const ambientFlyers = {
  stadium: [],
  lava: [],
  space: [],
};
const ambientFlightState = {
  stadium: { nextSpawn: 1.2 },
  lava: { nextSpawn: 2.4 },
  space: { nextSpawn: 3.2 },
};
let menuReturnTimer = null;
let audioContext = null;
let audioUnlocked = false;
let gameReady = false;
let startupError = "";
let celebrationTimer = 0;
let nextFireworkBurst = 0;
const fireworks = [];

const state = {
  phase: "menu",
  kickIndex: 0,
  streak: 0,
  bestScore: 0,
  phaseStarted: performance.now(),
  livePower: 0.5,
  liveDirection: 0,
  lockedPower: 0,
  lockedDirection: 0,
  result: "",
  flight: null,
  goalFlash: 0,
  fanfareKind: "",
  goalCall: "",
  soundMuted: loadSoundMuted(),
  selectedBackground: "stadium",
  menuSummary: "Kick 10 straight. Time the power, hold your nerve on direction, and watch the wind.",
  windSequence: createWindSequence(),
};

const missCalls = ["Bad luck", "No goal", "Maybe next time", "Just wide"];
const fireworkColors = [0xffd766, 0x80c8f8, 0x78d47e, 0xff8b6b, 0xf7fff3];

const materials = {
  field: new THREE.MeshStandardMaterial({ color: 0x28743c, roughness: 0.88 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0x348748, roughness: 0.9 }),
  line: new THREE.MeshBasicMaterial({ color: 0xf1f7ed }),
  post: new THREE.MeshStandardMaterial({
    color: 0xf7f5e9,
    roughness: 0.42,
    metalness: 0.05,
    emissive: 0x000000,
  }),
  blackDot: new THREE.MeshStandardMaterial({ color: 0x020303, roughness: 0.5 }),
  leftPad: new THREE.MeshStandardMaterial({
    map: createPadTexture("BRENT", "CLARK GAMES"),
    roughness: 0.56,
  }),
  rightPad: new THREE.MeshStandardMaterial({
    map: createPadTexture("INVINCIBLE", "GOAL"),
    roughness: 0.56,
  }),
  ball: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createBallSkinTexture(),
    roughness: 0.52,
    metalness: 0.02,
  }),
  ballPebble: new THREE.MeshBasicMaterial({
    map: createPebbleTexture(),
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  }),
  tee: new THREE.MeshStandardMaterial({ color: 0x101416, roughness: 0.62 }),
  teeCup: new THREE.MeshStandardMaterial({ color: 0xf5ce38, roughness: 0.46 }),
  shadow: new THREE.MeshBasicMaterial({
    color: 0x071012,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  }),
  marker: new THREE.MeshBasicMaterial({
    color: 0xf3c14f,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  }),
  stadiumShell: new THREE.MeshStandardMaterial({ color: 0x28343a, roughness: 0.82 }),
  stadiumStep: new THREE.MeshStandardMaterial({ color: 0x46565c, roughness: 0.86 }),
  stadiumRoof: new THREE.MeshStandardMaterial({ color: 0x202a2f, roughness: 0.7 }),
  bird: new THREE.MeshBasicMaterial({ color: 0x101619, side: THREE.DoubleSide }),
  lavaRock: new THREE.MeshStandardMaterial({ color: 0x271713, roughness: 0.9 }),
  lavaRidge: new THREE.MeshStandardMaterial({
    color: 0x4c1b14,
    emissive: 0x8c210e,
    emissiveIntensity: 0.16,
    roughness: 0.86,
  }),
  lavaGlow: new THREE.MeshBasicMaterial({
    color: 0xff7a18,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }),
  lavaChannel: new THREE.MeshBasicMaterial({
    color: 0xcf3512,
    transparent: true,
    opacity: 0.76,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }),
  lavaFlow: new THREE.MeshBasicMaterial({
    map: createLavaFlowTexture(),
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  pterodactyl: new THREE.MeshBasicMaterial({ color: 0x160b0a, side: THREE.DoubleSide }),
  spaceWall: new THREE.MeshStandardMaterial({
    color: 0x0c1021,
    emissive: 0x101d3f,
    emissiveIntensity: 0.18,
    roughness: 0.72,
  }),
  spaceRock: new THREE.MeshStandardMaterial({ color: 0x22283d, roughness: 0.88 }),
  shipHull: new THREE.MeshStandardMaterial({
    color: 0xd9edf6,
    emissive: 0x2a4f7a,
    emissiveIntensity: 0.26,
    roughness: 0.42,
    metalness: 0.18,
  }),
  shipTrim: new THREE.MeshBasicMaterial({ color: 0x241d34 }),
  shipUnderside: new THREE.MeshStandardMaterial({
    color: 0x7b4d98,
    emissive: 0x321847,
    emissiveIntensity: 0.32,
    roughness: 0.48,
    metalness: 0.08,
  }),
  shipDome: new THREE.MeshStandardMaterial({
    color: 0x8fe4ff,
    emissive: 0x2a7da9,
    emissiveIntensity: 0.46,
    transparent: true,
    opacity: 0.58,
    roughness: 0.08,
    metalness: 0.03,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  alienSkin: new THREE.MeshStandardMaterial({
    color: 0xb9ef63,
    emissive: 0x3f761a,
    emissiveIntensity: 0.28,
    roughness: 0.44,
  }),
  alienEye: new THREE.MeshBasicMaterial({ color: 0x33244d }),
  shipGlow: new THREE.MeshBasicMaterial({
    color: 0x87d8ff,
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
  runoff: new THREE.MeshStandardMaterial({ color: 0x2d7949, roughness: 0.93 }),
  retainingWall: new THREE.MeshStandardMaterial({ color: 0x1d292d, roughness: 0.78 }),
  fenceRail: new THREE.MeshStandardMaterial({ color: 0xe5e9dc, roughness: 0.48 }),
  railing: new THREE.MeshStandardMaterial({ color: 0xc9d5d2, roughness: 0.45 }),
  lightRig: new THREE.MeshStandardMaterial({
    color: 0xf6f1d7,
    emissive: 0xffe6a5,
    emissiveIntensity: 1.45,
    roughness: 0.32,
  }),
  lightBeam: new THREE.MeshBasicMaterial({
    color: 0xfff1bc,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
  lightPatch: new THREE.MeshBasicMaterial({
    color: 0xfff1be,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }),
};

bindInputHandlers();
initializeGame();

function initializeGame() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = createSkyTexture();
    scene.fog = new THREE.Fog(0xb7dce8, 95, 205);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 240);
    clock = new THREE.Clock();

    setupLights();
    buildField();
    Object.assign(backgroundGroups, buildBackgrounds());
    Object.values(backgroundGroups).forEach((group) => scene.add(group));
    goalGroup = buildGoal();
    ({ ballGroup, teeGroup, shadow, kickMarker } = buildBall());
    celebrationGroup = new THREE.Group();
    celebrationGroup.name = "perfect-run-fireworks";
    scene.add(ballGroup, teeGroup, shadow, kickMarker, celebrationGroup);

    gameReady = true;
    startupError = "";
    placeKick(0);
    setBackground(state.selectedBackground);
    syncUi();

    window.addEventListener("resize", resizeRenderer);
    resizeRenderer();
    requestAnimationFrame(tick);
  } catch (error) {
    console.error("Unable to start the 3D field.", error);
    startupError =
      "The 3D field did not start. Try refreshing, or use a browser with WebGL enabled.";
    state.menuSummary = startupError;
    syncUi();
  }
}

function bindInputHandlers() {
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && state.phase !== "menu") {
      event.preventDefault();
      unlockAudio();
      handleAction();
    }

    if (event.key.toLowerCase() === "r" && isFinalPhase()) {
      showMainMenu();
    }
  });

  ui.actionButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    unlockAudio();
    handleAction();
  });

  ui.newGameButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    unlockAudio();
    startNewGame();
  });

  ui.backgroundButtons.forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setBackground(button.dataset.background);
      syncUi();
    });
  });

  ui.soundButtons.forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      toggleSound();
    });
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (state.phase === "menu") {
      return;
    }

    event.preventDefault();
    unlockAudio();
    handleAction();
  });
}

function setupLights() {
  const ambient = new THREE.HemisphereLight(0xeef8ff, 0x1f4c2d, 1.18);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff8e8, 1.55);
  sun.position.set(-28, 44, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -45;
  scene.add(sun);
}

function buildField() {
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH),
    materials.field,
  );
  field.rotation.x = -Math.PI / 2;
  field.position.z = FIELD_LENGTH / 2 - 10;
  field.receiveShadow = true;
  scene.add(field);

  for (let z = -6; z <= 100; z += 12) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_WIDTH, 6),
      materials.stripe,
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.012, z + 3);
    stripe.receiveShadow = true;
    scene.add(stripe);
  }

  for (let z = 0; z <= 90; z += 10) {
    addFieldLine(0, z, FIELD_WIDTH, 0.16);
  }

  addFieldLine(-FIELD_WIDTH / 2, 45, 0.16, 104);
  addFieldLine(FIELD_WIDTH / 2, 45, 0.16, 104);
  addFieldLine(0, -6, FIELD_WIDTH, 0.16);

  const inGoal = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_WIDTH, 10),
    new THREE.MeshStandardMaterial({ color: 0x235d37, roughness: 0.88 }),
  );
  inGoal.rotation.x = -Math.PI / 2;
  inGoal.position.set(0, 0.006, -5);
  scene.add(inGoal);

  const deadBallArea = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_WIDTH, 34),
    new THREE.MeshStandardMaterial({ color: 0x266f3f, roughness: 0.9 }),
  );
  deadBallArea.rotation.x = -Math.PI / 2;
  deadBallArea.position.set(0, 0.004, -27);
  scene.add(deadBallArea);
}

function addFieldLine(x, z, width, depth) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), materials.line);
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.02, z);
  scene.add(line);
  return line;
}

function buildBackgrounds() {
  return {
    stadium: buildStadiumBackground(),
    lava: buildLavaBackground(),
    space: buildSpaceBackground(),
  };
}

function buildStadiumBackground() {
  const group = new THREE.Group();
  group.add(buildStands(-45));
  group.add(buildStands(45));
  group.add(buildEndStadium());
  group.add(buildPerimeterRunoff());
  addLightPatch(0, 18, 19, 50, 0.085, group);
  addLightPatch(-22, 12, 12, 34, 0.06, group);
  addLightPatch(22, 12, 12, 34, 0.06, group);
  group.add(createAmbientLayer("stadium"));
  return group;
}

function buildLavaBackground() {
  const group = new THREE.Group();
  group.add(buildPerimeterRunoff());

  [-1, 1].forEach((sign) => {
    const lowWall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.15, 128), materials.lavaRidge);
    lowWall.position.set(sign * 35.2, 0.58, 35);
    lowWall.castShadow = true;
    lowWall.receiveShadow = true;
    group.add(lowWall);

    addSponsorFence(
      group,
      new THREE.Vector3(sign * 34.7, 1.28, 35),
      128,
      1.36,
      sign > 0 ? -Math.PI / 2 : Math.PI / 2,
      6.5,
    );

    addLavaMountainRange(group, sign);
  });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(94, 1.2, 0.7), materials.lavaRidge);
  backWall.position.set(0, 0.6, -38.1);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);
  addSponsorFence(group, new THREE.Vector3(0, 1.3, -37.65), 92, 1.36, 0, 5);
  addBackLavaMountains(group);

  [-42, 42].forEach((x) => {
    addFloodlightRig(group, x, -34, x * 0.18, 18, 18, 7.2);
    addFloodlightRig(group, x, 70, x * 0.14, 42, 16.5, 6.4);
  });

  addLightPatch(0, 18, 22, 54, 0.11, group);
  addLightPatch(-24, 2, 14, 36, 0.075, group);
  addLightPatch(24, 2, 14, 36, 0.075, group);
  group.add(createAmbientLayer("lava"));

  return group;
}

function addLavaMountainRange(group, sign) {
  const rand = seededRandom(sign > 0 ? 7201 : 7117);

  for (let z = -42; z <= 104; z += 11) {
    const isTower = rand() > 0.68 || z === -20 || z === 68;
    const height = isTower ? 14 + rand() * 12 : 4.2 + rand() * 7.2;
    const radius = isTower ? 4.2 + rand() * 4.2 : 2.4 + rand() * 3.2;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 6 + Math.floor(rand() * 4)),
      rand() > 0.56 ? materials.lavaRidge : materials.lavaRock,
    );
    mountain.position.set(sign * (43 + rand() * 16), height / 2 - 0.08, z + (rand() - 0.5) * 6);
    mountain.rotation.y = rand() * Math.PI;
    mountain.scale.x = 0.82 + rand() * 0.55;
    mountain.scale.z = 0.92 + rand() * 0.7;
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    group.add(mountain);

    if (isTower || rand() > 0.74) {
      const streamSide = rand() > 0.5 ? 1 : -1;
      addLavaFlow(group, {
        x: mountain.position.x,
        y: mountain.position.y,
        z: mountain.position.z,
        radius,
        radiusX: radius * mountain.scale.x,
        radiusZ: radius * mountain.scale.z,
        height,
        face: "side",
        sign,
        streamSide,
        twist: (rand() - 0.5) * 0.32,
      });
    }
  }
}

function addBackLavaMountains(group) {
  const rand = seededRandom(7331);

  for (let x = -54; x <= 54; x += 9) {
    const isTower = Math.abs(x) === 36 || rand() > 0.66;
    const height = isTower ? 15 + rand() * 13 : 4.8 + rand() * 8.2;
    const radius = isTower ? 4.5 + rand() * 4.8 : 3 + rand() * 4.2;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(radius, height, 7),
      rand() > 0.5 ? materials.lavaRidge : materials.lavaRock,
    );
    mountain.position.set(x + (rand() - 0.5) * 3, height / 2 - 0.1, -49 - rand() * 8);
    mountain.rotation.y = rand() * Math.PI;
    mountain.scale.x = 0.9 + rand() * 0.55;
    mountain.scale.z = 0.8 + rand() * 0.5;
    mountain.castShadow = true;
    mountain.receiveShadow = true;
    group.add(mountain);

    if (isTower || rand() > 0.78) {
      const streamSide = rand() > 0.5 ? 1 : -1;
      addLavaFlow(group, {
        x: mountain.position.x,
        y: mountain.position.y,
        z: mountain.position.z,
        radius,
        radiusX: radius * mountain.scale.x,
        radiusZ: radius * mountain.scale.z,
        height,
        face: "front",
        streamSide,
        twist: (rand() - 0.5) * 0.28,
      });
    }
  }
}

function addLavaFlow(group, { x, y, z, radius, radiusX = radius, radiusZ = radius, height, face, sign = 1, streamSide = 1, twist = 0 }) {
  const apexY = y + height / 2 - height * 0.035;
  const baseY = y - height / 2 + height * THREE.MathUtils.lerp(0.15, 0.22, Math.abs(twist));
  const baseReach = THREE.MathUtils.clamp(0.7 + Math.abs(twist) * 0.36, 0.7, 0.9);
  const slopeOffset = THREE.MathUtils.clamp(0.34 + Math.abs(twist) * 0.22, 0.34, 0.54) * streamSide;
  const surfaceOffset = 0.1;
  const apex = new THREE.Vector3(x, apexY, z);
  const base = face === "side"
    ? new THREE.Vector3(
        x - sign * radiusX * baseReach,
        baseY,
        z + radiusZ * (slopeOffset * 0.45 + twist),
      )
    : new THREE.Vector3(
        x + radiusX * (slopeOffset + twist),
        baseY,
        z + radiusZ * baseReach,
      );
  const outward = face === "side"
    ? new THREE.Vector3(-sign, 0, 0)
    : new THREE.Vector3(0, 0, 1);
  apex.addScaledVector(outward, surfaceOffset);
  base.addScaledVector(outward, surfaceOffset);

  const channelGeometry = createLavaFlowGeometry(apex, base, radius, twist, 1.45);
  const coreGeometry = createLavaFlowGeometry(apex, base, radius, twist, 0.72);
  const channel = new THREE.Mesh(channelGeometry, materials.lavaChannel.clone());
  channel.renderOrder = 1;
  group.add(channel);

  const flow = new THREE.Mesh(coreGeometry, materials.lavaFlow.clone());
  flow.renderOrder = 2;
  group.add(flow);
}

function createLavaFlowGeometry(apex, base, radius, twist, widthScale) {
  const horizontalDirection = new THREE.Vector3(base.x - apex.x, 0, base.z - apex.z);
  if (horizontalDirection.lengthSq() < 0.0001) {
    horizontalDirection.set(1, 0, 0);
  }
  horizontalDirection.normalize();
  const widthDirection = new THREE.Vector3(-horizontalDirection.z, 0, horizontalDirection.x);
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 9;

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const center = apex.clone().lerp(base, t);
    const meander = Math.sin(t * Math.PI * 1.4) * radius * 0.036 * Math.sign(twist || 1);
    center.addScaledVector(widthDirection, meander);
    const width = THREE.MathUtils.lerp(radius * 0.07, radius * 0.33, Math.pow(t, 0.72)) * widthScale;
    const left = center.clone().addScaledVector(widthDirection, -width / 2);
    const right = center.clone().addScaledVector(widthDirection, width / 2);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, 1 - t, 1, 1 - t);

    if (index < segments) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildSpaceBackground() {
  const group = new THREE.Group();
  group.add(buildPerimeterRunoff());

  [-1, 1].forEach((sign) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.2, 128), materials.spaceWall);
    wall.position.set(sign * 35.2, 0.6, 35);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    addSponsorFence(
      group,
      new THREE.Vector3(sign * 34.7, 1.3, 35),
      128,
      1.36,
      sign > 0 ? -Math.PI / 2 : Math.PI / 2,
      6.5,
    );

    for (let z = -26; z <= 94; z += 24) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.4 + Math.abs(z % 5) * 0.18, 0),
        materials.spaceRock,
      );
      rock.position.set(sign * (43 + Math.abs(z % 7)), 1.4 + Math.abs(z % 4) * 0.18, z);
      rock.rotation.set(z * 0.02, z * 0.03, sign * 0.35);
      rock.castShadow = true;
      group.add(rock);
    }
  });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(94, 1.2, 0.68), materials.spaceWall);
  backWall.position.set(0, 0.6, -38.1);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);
  addSponsorFence(group, new THREE.Vector3(0, 1.3, -37.65), 92, 1.36, 0, 5);

  addStarField(group);
  addPlanet(group, -46, 34, -76, 6.4, 0xd28c5a, 0x6a382a, true);
  addPlanet(group, 42, 38, -58, 4.6, 0x74b8d9, 0x233b62, false);
  addPlanet(group, 18, 28, 86, 3.2, 0xcab56b, 0x76612d, true);

  [-42, 42].forEach((x) => {
    addFloodlightRig(group, x, -34, x * 0.18, 18, 18, 7.2);
    addFloodlightRig(group, x, 70, x * 0.14, 42, 16.5, 6.4);
  });

  addLightPatch(0, 18, 22, 54, 0.12, group);
  addLightPatch(-24, 2, 14, 36, 0.075, group);
  addLightPatch(24, 2, 14, 36, 0.075, group);
  group.add(createAmbientLayer("space"));

  return group;
}

function createAmbientLayer(backgroundId) {
  const layer = new THREE.Group();
  layer.name = `${backgroundId}-ambient-layer`;
  layer.userData.backgroundId = backgroundId;
  return layer;
}

function activeAmbientLayer(backgroundId) {
  return backgroundGroups[backgroundId]?.getObjectByName(`${backgroundId}-ambient-layer`);
}

function createBird() {
  const group = new THREE.Group();
  const wingGeometry = new THREE.PlaneGeometry(1.25, 0.22);

  const leftWing = new THREE.Mesh(wingGeometry, materials.bird);
  leftWing.position.set(-0.58, 0, 0);
  leftWing.rotation.z = 0.38;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeometry, materials.bird);
  rightWing.position.set(0.58, 0, 0);
  rightWing.rotation.z = -0.38;
  group.add(rightWing);

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.62, 8), materials.bird);
  body.rotation.z = Math.PI / 2;
  group.add(body);

  group.userData.leftWing = leftWing;
  group.userData.rightWing = rightWing;
  return group;
}

function createPterodactyl() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.65, 7), materials.pterodactyl);
  body.rotation.z = Math.PI / 2;
  group.add(body);

  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0,
        -2.35, -0.35, 0,
        -1.05, 0.62, 0,
        0, 0, 0,
        2.35, -0.35, 0,
        1.05, 0.62, 0,
      ],
      3,
    ),
  );
  wingGeometry.setIndex([0, 1, 2, 3, 4, 5]);
  wingGeometry.computeVertexNormals();

  const wings = new THREE.Mesh(wingGeometry, materials.pterodactyl);
  group.add(wings);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.64, 6), materials.pterodactyl);
  head.position.x = 0.9;
  head.rotation.z = -Math.PI / 2;
  group.add(head);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 5), materials.pterodactyl);
  tail.position.x = -0.9;
  tail.rotation.z = Math.PI / 2;
  group.add(tail);

  group.userData.wings = wings;
  return group;
}

function createSpaceship() {
  const group = new THREE.Group();

  const underside = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    materials.shipUnderside,
  );
  underside.position.y = -0.1;
  underside.scale.set(1.12, 0.48, 0.62);
  group.add(underside);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.16, 0.2, 48), materials.shipHull);
  rim.position.y = 0.02;
  rim.scale.z = 0.56;
  group.add(rim);

  const topTrim = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.045, 8, 64), materials.shipTrim);
  topTrim.position.y = 0.14;
  topTrim.rotation.x = Math.PI / 2;
  topTrim.scale.y = 0.56;
  group.add(topTrim);

  const cabinBase = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.08, 36), materials.shipTrim);
  cabinBase.position.y = 0.16;
  cabinBase.scale.z = 0.58;
  group.add(cabinBase);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.shipDome,
  );
  dome.position.y = 0.16;
  dome.scale.set(0.98, 0.84, 0.62);
  dome.renderOrder = 3;
  group.add(dome);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), materials.alienSkin);
  head.position.set(0, 0.56, 0.1);
  head.scale.set(0.76, 1.04, 0.66);
  group.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  [-0.1, 0.1].forEach((x) => {
    const eye = new THREE.Mesh(eyeGeometry, materials.alienEye);
    eye.position.set(x, 0.6, 0.34);
    eye.scale.set(1.16, 1.35, 0.55);
    group.add(eye);
  });

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 6, 16, Math.PI), materials.shipTrim);
  mouth.position.set(0, 0.47, 0.36);
  mouth.rotation.z = Math.PI;
  group.add(mouth);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), materials.shipTrim);
  antenna.position.y = 1.02;
  group.add(antenna);

  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), materials.shipGlow.clone());
  antennaTip.position.y = 1.17;
  group.add(antennaTip);

  const lightGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  [
    [-0.72, 0.1, 0.58, 0xbbeeff],
    [0, 0.08, 0.65, 0xece5ff],
    [0.72, 0.1, 0.58, 0xbbeeff],
  ].forEach(([x, y, z, color]) => {
    const light = new THREE.Mesh(
      lightGeometry,
      new THREE.MeshBasicMaterial({ color }),
    );
    light.position.set(x, y, z);
    group.add(light);
  });

  [
    [-0.62, -0.28, 0.22],
    [0.62, -0.28, 0.22],
    [0, -0.31, -0.36],
  ].forEach(([x, y, z]) => {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), materials.shipUnderside);
    foot.position.set(x, y, z);
    foot.scale.set(1.08, 0.58, 0.8);
    group.add(foot);
  });

  const hoverGlow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 36), materials.shipGlow.clone());
  hoverGlow.position.y = -0.42;
  hoverGlow.rotation.x = -Math.PI / 2;
  hoverGlow.scale.y = 0.48;
  group.add(hoverGlow);

  group.userData.hoverGlow = hoverGlow;
  group.userData.antennaTip = antennaTip;
  return group;
}

function addStarField(group) {
  const rand = seededRandom(9104);
  const starCount = 620;
  const positions = new Float32Array(starCount * 3);

  for (let index = 0; index < starCount; index += 1) {
    positions[index * 3] = (rand() - 0.5) * 210;
    positions[index * 3 + 1] = 18 + rand() * 110;
    positions[index * 3 + 2] = -112 + rand() * 230;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xf8fbff,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    }),
  );
  group.add(stars);
}

function addPlanet(group, x, y, z, radius, color, accent, hasRing) {
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 18),
    new THREE.MeshStandardMaterial({
      color,
      emissive: accent,
      emissiveIntensity: 0.12,
      roughness: 0.72,
    }),
  );
  planet.position.set(x, y, z);
  planet.castShadow = true;
  group.add(planet);

  if (hasRing) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.45, radius * 0.055, 10, 72),
      new THREE.MeshBasicMaterial({
        color: 0xf6e3a8,
        transparent: true,
        opacity: 0.54,
      }),
    );
    ring.position.copy(planet.position);
    ring.rotation.set(Math.PI * 0.42, 0.18, -0.35);
    group.add(ring);
  }
}

function setBackground(backgroundId) {
  const hasMenuOption = ui.backgroundButtons.some(
    (button) => button.dataset.background === backgroundId,
  );
  const nextBackground = (backgroundGroups[backgroundId] || hasMenuOption)
    ? backgroundId
    : "stadium";
  state.selectedBackground = nextBackground;
  syncBackgroundButtons();

  if (!gameReady || !scene || !renderer) {
    ui.app.dataset.scene = nextBackground;
    return;
  }

  Object.entries(backgroundGroups).forEach(([id, group]) => {
    group.visible = id === nextBackground;
  });

  if (nextBackground === "lava") {
    scene.background = createLavaSkyTexture();
    scene.fog = new THREE.Fog(0xb74218, 76, 190);
    renderer.toneMappingExposure = 1.12;
  } else if (nextBackground === "space") {
    scene.background = createSpaceSkyTexture();
    scene.fog = new THREE.Fog(0x050814, 118, 270);
    renderer.toneMappingExposure = 1.18;
    ambientFlightState.space.nextSpawn = Math.min(ambientFlightState.space.nextSpawn, 1.4);
  } else {
    scene.background = createSkyTexture();
    scene.fog = new THREE.Fog(0xb7dce8, 95, 205);
    renderer.toneMappingExposure = 1.08;
  }

  ui.app.dataset.scene = nextBackground;
}

function syncBackgroundButtons() {
  ui.backgroundButtons.forEach((button) => {
    const isSelected = button.dataset.background === state.selectedBackground;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
}

function syncSoundButtons() {
  const label = state.soundMuted ? "Unmute" : "Mute";
  const ariaLabel = state.soundMuted ? "Unmute sound" : "Mute sound";
  ui.soundButtons.forEach((button) => {
    button.textContent = label;
    button.classList.toggle("is-muted", state.soundMuted);
    button.setAttribute("aria-pressed", state.soundMuted ? "true" : "false");
    button.setAttribute("aria-label", ariaLabel);
  });
}

function buildStands(x) {
  const stand = new THREE.Group();
  const sign = Math.sign(x);
  const tiers = [
    { y: 1.45, z: 35, h: 2.9, depth: 118, xOffset: 0, color: 0x324149 },
    { y: 3.9, z: 37, h: 3.9, depth: 112, xOffset: 3.4, color: 0x3d4e56 },
    { y: 6.9, z: 40, h: 5.2, depth: 104, xOffset: 7.1, color: 0x2b373e },
  ];

  tiers.forEach((tier, index) => {
    const blockX = x + sign * tier.xOffset;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, tier.h, tier.depth),
      new THREE.MeshStandardMaterial({
        color: tier.color,
        roughness: 0.8,
      }),
    );
    block.position.set(blockX, tier.y, tier.z);
    block.castShadow = true;
    block.receiveShadow = true;
    stand.add(block);

    const crowd = new THREE.Mesh(
      new THREE.PlaneGeometry(tier.depth, tier.h * 0.84),
      createCrowdMaterial(100 + index + (sign > 0 ? 20 : 0), 2.4, 1),
    );
    crowd.position.set(blockX - sign * 3.24, tier.y + tier.h * 0.05, tier.z);
    crowd.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    stand.add(crowd);

    const railCount = 3 + index;
    for (let railIndex = 0; railIndex < railCount; railIndex += 1) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.07, tier.depth * 0.96),
        materials.railing,
      );
      rail.position.set(
        blockX - sign * 3.34,
        tier.y - tier.h * 0.34 + railIndex * (tier.h / railCount),
        tier.z,
      );
      stand.add(rail);
    }
  });

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.55, 122),
    materials.stadiumRoof,
  );
  roof.position.set(x + sign * 9.6, 11.15, 40);
  roof.rotation.z = -sign * 0.16;
  roof.castShadow = true;
  stand.add(roof);

  for (let z = -12; z <= 92; z += 26) {
    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.13, 10.8, 10),
      materials.railing,
    );
    support.position.set(x + sign * 4.4, 5.35, z);
    support.rotation.z = sign * 0.11;
    support.castShadow = true;
    stand.add(support);
  }

  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.78, 116), materials.retainingWall);
  wall.position.set(sign * 35.3, 0.39, 41);
  wall.castShadow = true;
  wall.receiveShadow = true;
  stand.add(wall);

  addSponsorFence(
    stand,
    new THREE.Vector3(sign * 34.72, 1.08, 41),
    116,
    1.42,
    sign > 0 ? -Math.PI / 2 : Math.PI / 2,
    6,
  );

  [-18, 54].forEach((z) => {
    addFloodlightRig(stand, x + sign * 2.6, z, sign * 7, 20, 17.5, 6.8);
  });

  return stand;
}

function buildEndStadium() {
  const group = new THREE.Group();
  const seatColors = [0x22323a, 0x2f4850, 0x3e6068, 0x2a3d45];

  for (let row = 0; row < 10; row += 1) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(124 - row * 5, 1.15, 3.3),
      new THREE.MeshStandardMaterial({
        color: seatColors[row % seatColors.length],
        roughness: 0.78,
      }),
    );
    block.position.set(0, 1.08 + row * 1.05, -41.5 - row * 2.2);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);

    const crowd = new THREE.Mesh(
      new THREE.PlaneGeometry(119 - row * 5, 0.9),
      createCrowdMaterial(220 + row, 2.8, 1),
    );
    crowd.position.set(0, 1.22 + row * 1.05, -39.82 - row * 2.2);
    group.add(crowd);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(132, 0.75, 15),
    materials.stadiumRoof,
  );
  roof.position.set(0, 13.25, -58.5);
  roof.rotation.x = -0.1;
  roof.castShadow = true;
  group.add(roof);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(84, 0.82, 0.56), materials.retainingWall);
  wall.position.set(0, 0.41, -37.8);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  addSponsorFence(group, new THREE.Vector3(0, 1.08, -37.42), 82, 1.42, 0, 4.5);
  addCornerStadiumInfill(group);

  [-46, 46].forEach((x) => {
    addFloodlightRig(group, x, -54, x * 0.26, 18, 19.2, 8.4);
  });

  return group;
}

function addCornerStadiumInfill(parent) {
  [-1, 1].forEach((sign) => {
    const cornerWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.86, 25),
      materials.retainingWall,
    );
    cornerWall.position.set(sign * 35.3, 0.43, -27.2);
    cornerWall.castShadow = true;
    cornerWall.receiveShadow = true;
    parent.add(cornerWall);

    addSponsorFence(
      parent,
      new THREE.Vector3(sign * 34.72, 1.08, -27.2),
      25,
      1.42,
      sign > 0 ? -Math.PI / 2 : Math.PI / 2,
      1.8,
    );

    const lowerBowl = new THREE.Mesh(
      new THREE.BoxGeometry(12.5, 3.2, 28),
      materials.stadiumShell,
    );
    lowerBowl.position.set(sign * 42.3, 1.6, -28.4);
    lowerBowl.castShadow = true;
    lowerBowl.receiveShadow = true;
    parent.add(lowerBowl);

    const cornerSeats = new THREE.Mesh(
      new THREE.BoxGeometry(16, 3.8, 28),
      materials.stadiumStep,
    );
    cornerSeats.position.set(sign * 47.8, 3.8, -30.8);
    cornerSeats.rotation.z = -sign * 0.06;
    cornerSeats.castShadow = true;
    cornerSeats.receiveShadow = true;
    parent.add(cornerSeats);

    const crowd = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 2.65),
      createCrowdMaterial(320 + (sign > 0 ? 40 : 0), 2.2, 1),
    );
    crowd.position.set(sign * 36.9, 3.05, -27.2);
    crowd.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    parent.add(crowd);
  });
}

function buildPerimeterRunoff() {
  const group = new THREE.Group();

  [-1, 1].forEach((sign) => {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 118), materials.runoff);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(sign * (FIELD_WIDTH / 2 + 4.4), 0.007, 41);
    apron.receiveShadow = true;
    group.add(apron);

    const trackEdge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 118),
      new THREE.MeshBasicMaterial({ color: 0xdcead5 }),
    );
    trackEdge.rotation.x = -Math.PI / 2;
    trackEdge.position.set(sign * (FIELD_WIDTH / 2 + 0.18), 0.032, 41);
    group.add(trackEdge);
  });

  const endApron = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_WIDTH + 18, 9.4), materials.runoff);
  endApron.rotation.x = -Math.PI / 2;
  endApron.position.set(0, 0.008, -39.1);
  endApron.receiveShadow = true;
  group.add(endApron);

  return group;
}

function addSponsorFence(parent, position, width, height, rotationY, repeatX) {
  const fence = new THREE.Group();
  fence.position.copy(position);
  fence.rotation.y = rotationY;

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    createSponsorFenceMaterial(repeatX),
  );
  panel.castShadow = true;
  panel.receiveShadow = true;
  fence.add(panel);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, 0.1, 0.12), materials.fenceRail);
  topRail.position.set(0, height / 2 + 0.08, -0.04);
  topRail.castShadow = true;
  fence.add(topRail);

  const bottomRail = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.24, 0.13, 0.16),
    materials.retainingWall,
  );
  bottomRail.position.set(0, -height / 2 - 0.06, -0.05);
  bottomRail.castShadow = true;
  fence.add(bottomRail);

  const postCount = Math.max(6, Math.floor(width / 9));
  for (let index = 0; index <= postCount; index += 1) {
    const x = THREE.MathUtils.lerp(-width / 2, width / 2, index / postCount);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, height + 0.28, 0.16), materials.fenceRail);
    post.position.set(x, 0, -0.07);
    post.castShadow = true;
    fence.add(post);
  }

  parent.add(fence);
}

function buildGoal() {
  const group = new THREE.Group();
  const postHeight = 14.5;
  const postGeometry = new THREE.CylinderGeometry(0.075, 0.075, postHeight, 18);
  const crossbarGeometry = new THREE.CylinderGeometry(0.065, 0.065, POST_HALF_WIDTH * 2, 18);

  [-POST_HALF_WIDTH, POST_HALF_WIDTH].forEach((x, index) => {
    const post = new THREE.Mesh(postGeometry, materials.post);
    post.position.set(x, postHeight / 2, GOAL_Z);
    post.castShadow = true;
    group.add(post);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 1.9, 0.56),
      index === 0 ? materials.leftPad : materials.rightPad,
    );
    pad.position.set(x, 0.95, GOAL_Z);
    pad.castShadow = true;
    group.add(pad);
  });

  const crossbar = new THREE.Mesh(crossbarGeometry, materials.post);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, CROSSBAR_HEIGHT, GOAL_Z);
  crossbar.castShadow = true;
  group.add(crossbar);

  const blackDot = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.18, 0.18),
    materials.blackDot,
  );
  blackDot.position.set(0, CROSSBAR_HEIGHT, GOAL_Z);
  blackDot.castShadow = true;
  group.add(blackDot);

  scene.add(group);
  return group;
}

function addFloodlightRig(group, x, z, targetX, targetZ, height, spread) {
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.27, height, 14),
    materials.railing,
  );
  mast.position.set(x, height / 2, z);
  mast.castShadow = true;
  group.add(mast);

  const rig = new THREE.Mesh(new THREE.BoxGeometry(spread, 2.2, 0.58), materials.lightRig);
  rig.position.set(x, height + 0.15, z);
  rig.lookAt(new THREE.Vector3(targetX, height - 0.4, targetZ));
  group.add(rig);

  const target = new THREE.Object3D();
  target.position.set(targetX, 0.15, targetZ);
  scene.add(target);

  const spot = new THREE.SpotLight(0xfff0c6, 2.35, 130, 0.34, 0.62, 1.15);
  spot.position.set(x, height + 0.1, z);
  spot.target = target;
  group.add(spot);

  addLightBeam(
    group,
    new THREE.Vector3(x, height - 0.1, z),
    new THREE.Vector3(targetX, 0.2, targetZ),
    spread * 0.96,
    0.042,
  );
}

function addLightBeam(group, start, end, radius, opacity) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(radius, length, 36, 1, true),
    materials.lightBeam.clone(),
  );
  beam.material.opacity = opacity;
  beam.renderOrder = 6;
  beam.position.copy(start).addScaledVector(direction, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
  group.add(beam);
}

function addLightPatch(x, z, width, depth, opacity, parent = scene) {
  const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 64), materials.lightPatch.clone());
  patch.material.opacity = opacity;
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(x, 0.034, z);
  patch.scale.set(width, depth, 1);
  parent.add(patch);
}

function createCrowdMaterial(seed, repeatX, repeatY) {
  const texture = createCrowdTexture(seed);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

function createCrowdTexture(seed) {
  const rand = seededRandom(seed);
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 1024;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext("2d");
  const rowHeight = 23;
  const palette = [
    "#18252b",
    "#253942",
    "#38545f",
    "#f2f0df",
    "#f0c05b",
    "#d04a44",
    "#4c91a4",
    "#6fb36f",
    "#202022",
  ];

  const base = context.createLinearGradient(0, 0, 0, textureCanvas.height);
  base.addColorStop(0, "#1c2a31");
  base.addColorStop(1, "#111a1f");
  context.fillStyle = base;
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  for (let y = 18; y < textureCanvas.height; y += rowHeight) {
    context.fillStyle = y % (rowHeight * 2) === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.12)";
    context.fillRect(0, y, textureCanvas.width, 5);
  }

  for (let row = 0; row < 19; row += 1) {
    const baseY = 26 + row * rowHeight;
    const seatCount = 56 + Math.floor(rand() * 34);
    for (let seat = 0; seat < seatCount; seat += 1) {
      const x = ((seat + rand() * 0.62) / seatCount) * textureCanvas.width;
      const y = baseY + (rand() - 0.5) * 10;
      const radius = 2.2 + rand() * 3.9;
      context.fillStyle = palette[Math.floor(rand() * palette.length)];
      context.globalAlpha = 0.72 + rand() * 0.25;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();

      if (rand() > 0.62) {
        context.fillStyle = palette[Math.floor(rand() * palette.length)];
        context.fillRect(x - radius * 1.1, y + radius * 0.8, radius * 2.2, radius * 2.2);
      }
    }
  }

  context.globalAlpha = 1;
  const shade = context.createLinearGradient(0, 0, 0, textureCanvas.height);
  shade.addColorStop(0, "rgba(255,255,255,0.08)");
  shade.addColorStop(0.58, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.18)");
  context.fillStyle = shade;
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSkyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 32;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, textureCanvas.height);
  gradient.addColorStop(0, "#8fccec");
  gradient.addColorStop(0.52, "#c9e9f5");
  gradient.addColorStop(0.82, "#f1e8d5");
  gradient.addColorStop(1, "#b8d7d7");
  context.fillStyle = gradient;
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLavaSkyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, textureCanvas.height);
  gradient.addColorStop(0, "#4c0915");
  gradient.addColorStop(0.35, "#b82716");
  gradient.addColorStop(0.68, "#ff8a1e");
  gradient.addColorStop(1, "#ffd35a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  context.globalAlpha = 0.22;
  for (let y = 58; y < textureCanvas.height; y += 82) {
    context.fillStyle = y % 164 === 58 ? "#30040d" : "#ffcc54";
    context.beginPath();
    context.ellipse(64, y, 74, 18, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSpaceSkyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(256, 280, 10, 256, 280, 360);
  gradient.addColorStop(0, "#192a52");
  gradient.addColorStop(0.44, "#071226");
  gradient.addColorStop(1, "#02040b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  const rand = seededRandom(1188);
  for (let index = 0; index < 360; index += 1) {
    const x = rand() * textureCanvas.width;
    const y = rand() * textureCanvas.height;
    const size = rand() > 0.9 ? 1.8 : 0.8;
    context.globalAlpha = 0.42 + rand() * 0.58;
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, size, size);
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLavaFlowTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 512;
  const context = textureCanvas.getContext("2d");

  context.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  const glow = context.createLinearGradient(0, 0, textureCanvas.width, 0);
  glow.addColorStop(0, "rgba(255, 58, 8, 0)");
  glow.addColorStop(0.18, "rgba(255, 70, 10, 0.7)");
  glow.addColorStop(0.5, "rgba(255, 236, 93, 1)");
  glow.addColorStop(0.82, "rgba(255, 70, 10, 0.7)");
  glow.addColorStop(1, "rgba(255, 58, 8, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.moveTo(52, 0);
  context.bezierCurveTo(72, 80, 39, 150, 66, 230);
  context.bezierCurveTo(88, 296, 52, 386, 72, 512);
  context.lineTo(30, 512);
  context.bezierCurveTo(46, 392, 18, 314, 40, 228);
  context.bezierCurveTo(58, 158, 30, 76, 52, 0);
  context.fill();

  context.globalAlpha = 0.7;
  context.strokeStyle = "#fff7a8";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(58, 0);
  context.bezierCurveTo(69, 96, 44, 172, 60, 258);
  context.bezierCurveTo(72, 330, 48, 420, 58, 512);
  context.stroke();
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildBall() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.56, 36, 18), materials.ball);
  body.scale.set(0.92, 1.5, 0.88);
  body.castShadow = true;
  group.add(body);

  const grain = new THREE.Mesh(new THREE.SphereGeometry(0.565, 36, 18), materials.ballPebble);
  grain.scale.set(0.924, 1.504, 0.884);
  group.add(grain);

  const tee = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.16, 36), materials.tee);
  base.position.y = 0.08;
  base.castShadow = true;
  tee.add(base);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.28, 28), materials.tee);
  stem.position.y = 0.27;
  stem.castShadow = true;
  tee.add(stem);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.12, 28), materials.teeCup);
  cup.position.y = 0.47;
  cup.castShadow = true;
  tee.add(cup);

  const shadowMesh = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), materials.shadow);
  shadowMesh.rotation.x = -Math.PI / 2;

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.08, 48),
    materials.marker,
  );
  marker.rotation.x = -Math.PI / 2;

  return { ballGroup: group, teeGroup: tee, shadow: shadowMesh, kickMarker: marker };
}

function createBallSkinTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 2048;
  textureCanvas.height = 1024;
  const context = textureCanvas.getContext("2d");

  context.fillStyle = "#f8faf4";
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  drawBallFace(context, 512);
  drawBallFace(context, 1536);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function drawBallFace(context, centerX) {
  drawPanelSeam(context, centerX - 88, 86, centerX - 126, 512, centerX - 82, 938, false);
  drawPanelSeam(context, centerX + 88, 86, centerX + 126, 512, centerX + 82, 938, true);

  context.strokeStyle = "#43ed99";
  context.lineWidth = 30;
  context.beginPath();
  context.moveTo(centerX - 164, 166);
  context.bezierCurveTo(centerX - 230, 342, centerX - 220, 672, centerX - 156, 860);
  context.stroke();

  context.strokeStyle = "#1d2429";
  context.lineWidth = 15;
  context.beginPath();
  context.moveTo(centerX - 126, 138);
  context.bezierCurveTo(centerX - 190, 338, centerX - 178, 654, centerX - 114, 892);
  context.stroke();

  context.strokeStyle = "#43ed99";
  context.lineWidth = 30;
  context.beginPath();
  context.moveTo(centerX + 164, 166);
  context.bezierCurveTo(centerX + 230, 342, centerX + 220, 672, centerX + 156, 860);
  context.stroke();

  context.strokeStyle = "#1d2429";
  context.lineWidth = 15;
  context.beginPath();
  context.moveTo(centerX + 126, 138);
  context.bezierCurveTo(centerX + 190, 338, centerX + 178, 654, centerX + 114, 892);
  context.stroke();

  drawRedFlash(context, centerX - 122, 846, -0.3);
  drawRedFlash(context, centerX + 122, 866, 0.3);

  context.fillStyle = "#1d2429";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.save();
  context.translate(centerX, 444);
  context.rotate(-Math.PI / 2);
  context.font = "900 108px Arial Black, Arial, sans-serif";
  context.fillText("INVINCIBLE", 0, 0);
  context.restore();

  context.font = "800 46px Arial Black, Arial, sans-serif";
  context.fillText("IG", centerX, 574);
  context.font = "700 26px Arial, sans-serif";
  context.fillText("PREMIERSHIP", centerX, 626);
}

function drawRedFlash(context, x, y, rotation) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillStyle = "#e53b2e";
  context.fillRect(-32, -96, 64, 192);
  context.restore();
}

function drawPanelSeam(context, startX, startY, controlX, controlY, endX, endY, flip) {
  context.strokeStyle = "#aeb5ad";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(startX, startY);
  context.quadraticCurveTo(controlX, controlY, endX, endY);
  context.stroke();

  context.strokeStyle = "#6f776f";
  context.lineWidth = 3;
  context.setLineDash([10, 13]);
  context.beginPath();
  context.moveTo(startX + (flip ? -10 : 10), startY + 30);
  context.quadraticCurveTo(controlX + (flip ? -14 : 14), controlY, endX + (flip ? -10 : 10), endY - 30);
  context.stroke();
  context.setLineDash([]);

  for (let i = 0; i < 18; i += 1) {
    const t = i / 17;
    const inv = 1 - t;
    const x = inv * inv * startX + 2 * inv * t * controlX + t * t * endX;
    const y = inv * inv * startY + 2 * inv * t * controlY + t * t * endY;
    const stitch = flip ? -1 : 1;
    context.strokeStyle = "#70786f";
    context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(x - stitch * 8, y - 3);
    context.lineTo(x + stitch * 8, y + 3);
    context.stroke();
  }
}

function createSponsorFenceMaterial(repeatX) {
  const texture = createSponsorFenceTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(repeatX, 1);

  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.48,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

function createSponsorFenceTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 1024;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");

  drawSponsorPanel(context, 0, "#113e8a", "#f3c14f", "BRENT CLARK", "GAMES");
  drawSponsorPanel(context, 512, "#102d23", "#80c8f8", "INVINCIBLE", "GOAL");

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function drawSponsorPanel(context, x, background, accent, lineOne, lineTwo) {
  const width = 512;
  const gradient = context.createLinearGradient(x, 0, x + width, 0);
  gradient.addColorStop(0, background);
  gradient.addColorStop(0.5, shadeColor(background, 18));
  gradient.addColorStop(1, background);
  context.fillStyle = gradient;
  context.fillRect(x, 0, width, 256);

  context.fillStyle = "rgba(255, 255, 255, 0.12)";
  context.fillRect(x, 0, width, 20);
  context.fillRect(x, 236, width, 20);
  context.fillStyle = accent;
  context.fillRect(x + 22, 28, width - 44, 10);
  context.fillRect(x + 22, 218, width - 44, 10);

  context.strokeStyle = "rgba(255, 255, 255, 0.24)";
  context.lineWidth = 3;
  context.strokeRect(x + 8, 8, width - 16, 240);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f7fbff";
  context.font = lineOne.length > 10
    ? "900 56px Arial Black, Arial, sans-serif"
    : "900 72px Arial Black, Arial, sans-serif";
  context.fillText(lineOne, x + width / 2, 106);
  context.font = "900 58px Arial Black, Arial, sans-serif";
  context.fillText(lineTwo, x + width / 2, 164);

  context.fillStyle = "rgba(255, 255, 255, 0.5)";
  context.font = "800 22px Arial, sans-serif";
  context.fillText("SIDELINE PARTNER", x + width / 2, 54);
}

function shadeColor(hexColor, amount) {
  const color = Number.parseInt(hexColor.slice(1), 16);
  const red = THREE.MathUtils.clamp((color >> 16) + amount, 0, 255);
  const green = THREE.MathUtils.clamp(((color >> 8) & 255) + amount, 0, 255);
  const blue = THREE.MathUtils.clamp((color & 255) + amount, 0, 255);
  return `rgb(${red}, ${green}, ${blue})`;
}

function createPadTexture(title, subtitle) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 1024;
  const context = textureCanvas.getContext("2d");
  context.fillStyle = "#113e8a";
  context.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
  context.fillStyle = "#0f2f69";
  context.fillRect(0, 0, 54, textureCanvas.height);
  context.fillRect(textureCanvas.width - 54, 0, 54, textureCanvas.height);
  context.fillStyle = "#f7fbff";
  context.font = "900 96px Arial Black, Arial, sans-serif";
  context.textAlign = "center";
  context.save();
  context.translate(256, 540);
  context.rotate(-Math.PI / 2);
  context.fillText(title, 0, -20);
  context.font = "900 84px Arial Black, Arial, sans-serif";
  context.fillText(subtitle, 0, 62);
  context.restore();
  context.fillStyle = "#f3c14f";
  context.fillRect(92, 52, 328, 18);
  context.fillRect(92, textureCanvas.height - 70, 328, 18);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createPebbleTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");
  context.clearRect(0, 0, 256, 256);
  context.fillStyle = "#000000";

  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const radius = 0.35 + Math.random() * 0.75;
    context.globalAlpha = 0.18 + Math.random() * 0.22;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 6);
  return texture;
}

function tick(now) {
  const delta = Math.min(clock.getDelta(), 0.033);
  updateMeters(now);
  updateFlight(delta);
  updateGoalFlash(delta);
  updateAmbientFlyers(delta);
  updateCelebration(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function startCelebration() {
  if (!celebrationGroup) {
    return;
  }

  clearCelebration();
  celebrationTimer = CELEBRATION_SECONDS;
  nextFireworkBurst = 0;

  for (let index = 0; index < 8; index += 1) {
    spawnFireworkBurst(index * 0.09);
  }
}

function updateCelebration(delta) {
  if (!celebrationGroup) {
    return;
  }

  if (celebrationTimer > 0) {
    celebrationTimer = Math.max(0, celebrationTimer - delta);
    nextFireworkBurst -= delta;

    if (nextFireworkBurst <= 0) {
      spawnFireworkBurst();

      if (Math.random() > 0.26) {
        spawnFireworkBurst(0.06);
      }

      if (Math.random() > 0.68) {
        spawnFireworkBurst(0.13);
      }

      nextFireworkBurst = THREE.MathUtils.lerp(0.12, 0.28, Math.random());
    }
  }

  for (let index = fireworks.length - 1; index >= 0; index -= 1) {
    const burst = fireworks[index];
    burst.age += delta;

    if (burst.age < 0) {
      continue;
    }

    if (burst.age >= burst.duration) {
      burst.points.removeFromParent();
      burst.points.geometry.dispose();
      burst.points.material.dispose();
      fireworks.splice(index, 1);
      continue;
    }

    const positions = burst.points.geometry.attributes.position.array;
    for (let particle = 0; particle < burst.count; particle += 1) {
      const offset = particle * 3;
      positions[offset] += burst.velocities[offset] * delta;
      positions[offset + 1] += burst.velocities[offset + 1] * delta;
      positions[offset + 2] += burst.velocities[offset + 2] * delta;
      burst.velocities[offset + 1] -= burst.gravity * delta;
    }

    const progress = burst.age / burst.duration;
    burst.points.geometry.attributes.position.needsUpdate = true;
    burst.points.material.opacity = Math.pow(1 - progress, 1.35);
    burst.points.material.size = burst.baseSize * (1 - progress * 0.38);
  }
}

function spawnFireworkBurst(delay = 0) {
  if (!celebrationGroup) {
    return;
  }

  const count = 96 + Math.floor(Math.random() * 80);
  const origin = new THREE.Vector3(
    THREE.MathUtils.lerp(-30, 30, Math.random()),
    THREE.MathUtils.lerp(12.5, 24, Math.random()),
    THREE.MathUtils.lerp(-38, -10, Math.random()),
  );
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const theta = Math.random() * Math.PI * 2;
    const lift = THREE.MathUtils.lerp(-0.28, 0.98, Math.random());
    const spread = Math.sqrt(Math.max(0.08, 1 - lift * lift));
    const speed = THREE.MathUtils.lerp(4.2, 10.8, Math.random());

    positions[offset] = origin.x;
    positions[offset + 1] = origin.y;
    positions[offset + 2] = origin.z;
    velocities[offset] = Math.cos(theta) * spread * speed;
    velocities[offset + 1] = lift * speed + 1.55;
    velocities[offset + 2] = Math.sin(theta) * spread * speed * 0.82;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: fireworkColors[Math.floor(Math.random() * fireworkColors.length)],
    size: THREE.MathUtils.lerp(0.54, 0.9, Math.random()),
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 14;
  celebrationGroup.add(points);
  fireworks.push({
    points,
    velocities,
    count,
    age: -delay,
    duration: THREE.MathUtils.lerp(1.35, 2.2, Math.random()) + delay,
    gravity: THREE.MathUtils.lerp(3.2, 4.8, Math.random()),
    baseSize: material.size,
  });
}

function clearCelebration() {
  celebrationTimer = 0;
  nextFireworkBurst = 0;

  for (const burst of fireworks) {
    burst.points.removeFromParent();
    burst.points.geometry.dispose();
    burst.points.material.dispose();
  }

  fireworks.length = 0;
}

function updateAmbientFlyers(delta) {
  const backgroundId = state.selectedBackground;
  const flightState = ambientFlightState[backgroundId];
  const flyers = ambientFlyers[backgroundId];
  const layer = activeAmbientLayer(backgroundId);

  if (!flightState || !flyers || !layer) {
    return;
  }

  flightState.nextSpawn -= delta;
  if (flightState.nextSpawn <= 0) {
    spawnAmbientFlyer(backgroundId, layer);
    flightState.nextSpawn = nextAmbientDelay(backgroundId);
  }

  for (let index = flyers.length - 1; index >= 0; index -= 1) {
    const flyer = flyers[index];
    flyer.age += delta;
    const progress = flyer.age / flyer.duration;

    if (progress >= 1) {
      flyer.group.removeFromParent();
      flyers.splice(index, 1);
      continue;
    }

    flyer.group.position.lerpVectors(flyer.start, flyer.end, progress);
    flyer.group.position.y += Math.sin((progress * Math.PI * 2 + flyer.phase) * flyer.bobRate) * flyer.bob;
    flyer.group.rotation.y = flyer.kind === "spaceship" ? 0 : flyer.yaw;
    flyer.group.rotation.z = flyer.roll + Math.sin(flyer.age * flyer.flapRate + flyer.phase) * flyer.flapAmount;

    if (flyer.kind === "bird") {
      const wingAngle = Math.sin(flyer.age * flyer.flapRate + flyer.phase) * 0.42;
      flyer.group.userData.leftWing.rotation.z = 0.38 + wingAngle;
      flyer.group.userData.rightWing.rotation.z = -0.38 - wingAngle;
    } else if (flyer.kind === "pterodactyl") {
      flyer.group.userData.wings.rotation.x =
        Math.sin(flyer.age * flyer.flapRate + flyer.phase) * 0.22;
    } else if (flyer.kind === "spaceship") {
      flyer.group.userData.hoverGlow.material.opacity =
        0.42 + Math.sin(flyer.age * 9.5 + flyer.phase) * 0.18;
      flyer.group.userData.antennaTip.material.opacity =
        0.72 + Math.sin(flyer.age * 8.5 + flyer.phase) * 0.18;
      flyer.group.rotation.x = Math.sin(flyer.age * 2.1 + flyer.phase) * 0.08;
    }
  }
}

function spawnAmbientFlyer(backgroundId, layer) {
  const flyers = ambientFlyers[backgroundId];
  const limit = backgroundId === "stadium" ? 2 : 1;

  if (flyers.length >= limit) {
    return;
  }

  if (backgroundId === "stadium") {
    const count = Math.random() > 0.62 ? 2 : 1;
    for (let index = 0; index < count && flyers.length < limit; index += 1) {
      addAmbientFlyer(backgroundId, layer, createAmbientFlight("bird"));
    }
    return;
  }

  addAmbientFlyer(
    backgroundId,
    layer,
    createAmbientFlight(backgroundId === "lava" ? "pterodactyl" : "spaceship"),
  );
}

function addAmbientFlyer(backgroundId, layer, flyer) {
  layer.add(flyer.group);
  flyer.group.position.copy(flyer.start);
  flyer.group.rotation.y = flyer.yaw;
  ambientFlyers[backgroundId].push(flyer);
}

function createAmbientFlight(kind) {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const z = kind === "spaceship"
    ? THREE.MathUtils.lerp(-58, -38, Math.random())
    : THREE.MathUtils.lerp(-32, 68, Math.random());
  const endZ = z + (kind === "spaceship"
    ? THREE.MathUtils.lerp(-4, 6, Math.random())
    : THREE.MathUtils.lerp(-18, 18, Math.random()));
  const startX = -direction * (kind === "spaceship"
    ? THREE.MathUtils.lerp(50, 64, Math.random())
    : THREE.MathUtils.lerp(64, 82, Math.random()));
  const endX = direction * (kind === "spaceship"
    ? THREE.MathUtils.lerp(50, 64, Math.random())
    : THREE.MathUtils.lerp(64, 82, Math.random()));
  const baseHeight = kind === "spaceship" ? 8.8 : kind === "pterodactyl" ? 22 : 19;
  const heightVariance = kind === "spaceship" ? 3.0 : kind === "bird" ? 9 : 7;
  const start = new THREE.Vector3(startX, baseHeight + Math.random() * heightVariance, z);
  const end = new THREE.Vector3(endX, start.y + THREE.MathUtils.lerp(-4, 4, Math.random()), endZ);
  const group =
    kind === "bird" ? createBird() : kind === "pterodactyl" ? createPterodactyl() : createSpaceship();
  const scale = kind === "bird"
    ? THREE.MathUtils.lerp(0.55, 0.95, Math.random())
    : kind === "pterodactyl"
    ? THREE.MathUtils.lerp(1.15, 1.7, Math.random())
    : THREE.MathUtils.lerp(1.65, 2.15, Math.random());

  group.scale.setScalar(scale);

  return {
    kind,
    group,
    start,
    end,
    age: 0,
    duration: kind === "bird"
      ? THREE.MathUtils.lerp(9.5, 14, Math.random())
      : kind === "pterodactyl"
      ? THREE.MathUtils.lerp(11, 16, Math.random())
      : THREE.MathUtils.lerp(9.5, 13.5, Math.random()),
    yaw: direction > 0 ? 0 : Math.PI,
    roll: THREE.MathUtils.lerp(-0.08, 0.08, Math.random()),
    flapRate: kind === "spaceship"
      ? THREE.MathUtils.lerp(7, 10, Math.random())
      : THREE.MathUtils.lerp(3.6, 6.8, Math.random()),
    flapAmount: kind === "spaceship" ? 0.04 : 0.08,
    bob: kind === "spaceship" ? 0.22 : 0.65,
    bobRate: kind === "bird" ? 1.7 : 1.15,
    phase: Math.random() * Math.PI * 2,
  };
}

function nextAmbientDelay(backgroundId) {
  if (backgroundId === "stadium") {
    return THREE.MathUtils.lerp(5.5, 13.5, Math.random());
  }

  if (backgroundId === "lava") {
    return THREE.MathUtils.lerp(8.5, 18, Math.random());
  }

  return THREE.MathUtils.lerp(7, 15, Math.random());
}

function updateMeters(now) {
  const kick = activeKick();
  const phaseSeconds = (now - state.phaseStarted) / 1000;

  if (state.phase === "power") {
    state.livePower = edgeEasedMeter(phaseSeconds * powerSpeed(kick));
  }

  if (state.phase === "direction") {
    state.liveDirection = edgeEasedMeter(phaseSeconds * directionSpeed(kick)) * 2 - 1;
  }

  syncMeters();
}

function edgeEasedMeter(phase) {
  const cycle = (((phase / TWO_PI) + 0.25) % 1 + 1) % 1;
  const pingPong = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  return smootherStep(pingPong);
}

function updateFlight(delta) {
  if (!state.flight) {
    return;
  }

  const flight = state.flight;
  flight.t = Math.min(1, flight.t + delta / flight.duration);
  const t = easeOutCubic(flight.t);

  const tGoal = flight.tGoal;
  const start = flight.start;

  let x;
  let y;
  let z;

  if (t <= tGoal) {
    const local = t / tGoal;
    x =
      THREE.MathUtils.lerp(start.x, flight.crossingX, local) +
      cosmeticCurveOffset(flight, local) +
      windVisualOffset(flight, local, 1);
    z = THREE.MathUtils.lerp(start.z, GOAL_Z, local);
    y =
      THREE.MathUtils.lerp(start.y, flight.heightAtGoal, local) +
      Math.sin(local * Math.PI) * flight.arcLift;
  } else {
    const local = (t - tGoal) / (1 - tGoal);

    if (!flight.groundSoundPlayed && local >= 0.58) {
      flight.groundSoundPlayed = true;
      playGroundHitSound(flight.bounceHeight);
    }

    if (local < 0.58) {
      const descend = local / 0.58;
      z = THREE.MathUtils.lerp(GOAL_Z, flight.landingZ, descend);
      x = flight.lockPath
        ? xOnFlightLine(flight, z)
        : THREE.MathUtils.lerp(flight.crossingX, flight.landingX, descend);
      const deflectionLift = flight.postHit
        ? Math.sin(descend * Math.PI) * flight.followLift
        : 0;
      y =
        THREE.MathUtils.lerp(flight.heightAtGoal, BALL_GROUND_Y, easeInQuad(descend)) +
        deflectionLift;
    } else {
      const bounce = (local - 0.58) / 0.42;
      z = THREE.MathUtils.lerp(flight.landingZ, flight.endZ, bounce);
      x = flight.lockPath
        ? xOnFlightLine(flight, z)
        : THREE.MathUtils.lerp(flight.landingX, flight.endX, bounce);
      y =
        BALL_GROUND_Y +
        Math.abs(Math.sin(bounce * Math.PI * 2.6)) *
          flight.bounceHeight *
          Math.pow(1 - bounce, 1.25);
    }
  }

  ballGroup.position.set(x, y, z);
  let directionYaw = Math.atan2(
    flight.crossingX - flight.start.x,
    flight.start.z - GOAL_Z,
  );
  if (flight.postHit && t > tGoal) {
    const targetX = t < (tGoal + 1) / 2 ? flight.landingX : flight.endX;
    const targetZ = t < (tGoal + 1) / 2 ? flight.landingZ : flight.endZ;
    directionYaw = Math.atan2(targetX - flight.crossingX, GOAL_Z - targetZ);
  }
  ballGroup.rotation.set(
    flight.basePitch + flight.t * Math.PI * flight.spinRate,
    directionYaw + Math.sin(flight.t * Math.PI * 1.8) * flight.driftLean,
    0,
  );
  shadow.position.set(x, 0.024, z);
  const shadowScale = THREE.MathUtils.clamp(1 - y * 0.055, 0.36, 0.92);
  shadow.scale.set(shadowScale, shadowScale, shadowScale);

  if (!flight.evaluated && t >= tGoal) {
    flight.evaluated = true;
    if (flight.postHit && !flight.postSoundPlayed) {
      flight.postSoundPlayed = true;
      playPostHitSound(flight.postSide);
    }
    state.goalFlash = flight.postHit ? 1.1 : flight.made ? 1 : 0.45;
  }

  if (flight.t >= 1) {
    finishFlight(flight);
  }
}

function cosmeticCurveForKick(kick) {
  const distanceFactor = THREE.MathUtils.clamp((kick.z - 22) / 24, 0, 1);
  return THREE.MathUtils.lerp(0.24, 1.45, distanceFactor);
}

function cosmeticCurveOffset(flight, local) {
  const smoothWindow = Math.sin(Math.PI * local);
  return flight.curveBend * smoothWindow * smoothWindow;
}

function windVisualOffset(flight, local, scale) {
  const smoothWindow = Math.sin(Math.PI * local);
  return (
    flight.windWobble *
    scale *
    smoothWindow *
    smoothWindow *
    Math.sin(Math.PI * local * 2)
  );
}

function xOnFlightLine(flight, z) {
  return flight.crossingX + flight.pathSlope * (z - GOAL_Z);
}

function updateGoalFlash(delta) {
  if (state.goalFlash <= 0) {
    materials.post.emissive.setHex(0x000000);
    materials.post.emissiveIntensity = 0;
    goalGroup.scale.setScalar(1);
    return;
  }

  state.goalFlash = Math.max(0, state.goalFlash - delta * 1.8);
  const glow = state.goalFlash;
  const color = state.flight?.made ? 0x345f20 : 0x612020;
  materials.post.emissive.setHex(color);
  materials.post.emissiveIntensity = glow * 0.8;
  goalGroup.scale.setScalar(1);
}

function handleAction() {
  if (!gameReady) {
    state.menuSummary = startupError || "The 3D field is still loading. Try again in a moment.";
    syncUi();
    return;
  }

  if (state.phase === "menu") {
    return;
  }

  if (state.phase === "flight") {
    return;
  }

  if (state.phase === "power") {
    state.lockedPower = state.livePower;
    state.phase = "direction";
    state.phaseStarted = performance.now();
    syncUi();
    return;
  }

  if (state.phase === "direction") {
    state.lockedDirection = state.liveDirection;
    launchKick();
    syncUi();
    return;
  }

  if (state.phase === "between") {
    state.kickIndex += 1;
    state.phase = "power";
    state.phaseStarted = performance.now();
    placeKick(state.kickIndex);
    syncUi();
    return;
  }

  if (isFinalPhase()) {
    showMainMenu();
  }
}

function launchKick() {
  const kick = activeKick();
  const wind = activeWind();
  const metrics = calculateKick(kick, wind, state.lockedPower, state.lockedDirection);
  const start = new THREE.Vector3(kick.x, BALL_TEE_Y, kick.z + BALL_TEE_Z_OFFSET);
  const tGoal = (start.z - GOAL_Z) / (start.z - GOAL_Z + 10);
  const drift = windDrift(kick, wind);
  const followThrough = metrics.postHit
    ? createPostDeflection(kick, metrics, drift)
    : createCleanFollowThrough(kick, metrics);

  state.flight = {
    start,
    crossingX: metrics.crossingX,
    landingX: followThrough.landingX,
    endX: followThrough.endX,
    landingZ: followThrough.landingZ,
    endZ: followThrough.endZ,
    lockPath: followThrough.lockPath,
    pathSlope: followThrough.pathSlope,
    heightAtGoal: metrics.heightAtGoal,
    arcLift: 3.6 + state.lockedPower * 3.2 + kick.z * 0.025,
    tGoal,
    t: 0,
    duration: followThrough.duration,
    bounceHeight: followThrough.bounceHeight,
    followLift: followThrough.followLift,
    basePitch: BALL_TEE_PITCH,
    spinRate: followThrough.spinRate,
    windWobble: drift * 0.12,
    curveBend: cosmeticCurveForKick(kick),
    driftLean: drift * 0.018,
    evaluated: false,
    postSoundPlayed: false,
    groundSoundPlayed: false,
    made: metrics.made,
    overBlackDot: metrics.overBlackDot,
    postHit: metrics.postHit,
    postSide: metrics.postSide,
    postOutcome: followThrough.outcome,
    reason: metrics.reason,
  };

  playKickSound(state.lockedPower);
  state.result = "";
  state.phase = "flight";
}

function finishFlight(flight) {
  state.flight = null;

  if (flight.made) {
    state.streak += 1;
    recordBestScore();
    state.fanfareKind = "goal";
    state.goalCall = flight.postHit
      ? "In off the upright!"
      : flight.overBlackDot
      ? "Straight over the black dot!"
      : "The flags are up";
    if (state.kickIndex === kicks.length - 1) {
      state.phase = "won";
      state.fanfareKind = "perfect";
      state.goalCall = "Perfect card";
      state.result = "10 from 10. Invincible.";
      state.menuSummary = `Last run: 10 / ${kicks.length}. Perfect card.`;
      startCelebration();
      playVictorySound();
      scheduleMenuReturn(state.menuSummary, CELEBRATION_SECONDS * 1000);
    } else {
      state.phase = "between";
      state.result = flight.postHit
        ? "Goal. It clipped the upright and carried through."
        : "Goal. The next one moves wider and the wind gets meaner.";
    }
  } else {
    state.fanfareKind = "miss";
    state.goalCall = "";
    state.phase = "game-over";
    state.result = flight.reason;
    recordBestScore();
    state.menuSummary = `Last run: ${state.streak} / ${kicks.length}. ${flight.reason}`;
    scheduleMenuReturn(state.menuSummary);
  }

  state.phaseStarted = performance.now();
  syncUi();
}

function startNewGame() {
  if (!gameReady) {
    state.phase = "menu";
    state.menuSummary = startupError || "The 3D field is still loading. Try again in a moment.";
    syncUi();
    return;
  }

  clearMenuReturnTimer();
  clearCelebration();
  state.phase = "power";
  state.kickIndex = 0;
  state.streak = 0;
  state.windSequence = createWindSequence();
  state.lockedPower = 0;
  state.lockedDirection = 0;
  state.result = "";
  state.flight = null;
  state.phaseStarted = performance.now();
  state.goalFlash = 0;
  state.fanfareKind = "";
  state.goalCall = "";
  goalGroup.scale.setScalar(1);
  placeKick(0);
  syncUi();
}

function showMainMenu(summary = state.menuSummary) {
  clearMenuReturnTimer();
  clearCelebration();
  state.phase = "menu";
  state.kickIndex = 0;
  state.streak = 0;
  state.lockedPower = 0;
  state.lockedDirection = 0;
  state.result = "";
  state.flight = null;
  state.phaseStarted = performance.now();
  state.goalFlash = 0;
  state.fanfareKind = "";
  state.goalCall = "";
  state.menuSummary =
    summary || "Kick 10 straight. Time the power, hold your nerve on direction, and watch the wind.";
  if (gameReady) {
    materials.post.emissive.setHex(0x000000);
    goalGroup.scale.setScalar(1);
    placeKick(0);
  }
  syncUi();
}

function scheduleMenuReturn(summary, delay = 1800) {
  clearMenuReturnTimer();
  menuReturnTimer = window.setTimeout(() => {
    showMainMenu(summary);
  }, delay);
}

function clearMenuReturnTimer() {
  if (menuReturnTimer) {
    window.clearTimeout(menuReturnTimer);
    menuReturnTimer = null;
  }
}

function toggleSound() {
  state.soundMuted = !state.soundMuted;
  saveSoundMuted();
  syncSoundButtons();

  if (state.soundMuted) {
    audioUnlocked = false;
    audioContext?.suspend?.().catch(() => {});
  } else {
    audioUnlocked = false;
    unlockAudio();
    playSoundToggleSound();
  }
}

function loadSoundMuted() {
  try {
    return window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveSoundMuted() {
  try {
    window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, state.soundMuted ? "true" : "false");
  } catch {}
}

function recordBestScore(score = state.streak) {
  state.bestScore = Math.max(state.bestScore, score);
}

function placeKick(index) {
  const kick = kicks[index];
  ballGroup.position.set(kick.x, BALL_TEE_Y, kick.z + BALL_TEE_Z_OFFSET);
  ballGroup.quaternion.copy(ballQuaternionTowardGoal(kick));
  teeGroup.position.set(kick.x, 0, kick.z);
  teeGroup.visible = true;
  shadow.position.set(kick.x, 0.024, kick.z);
  shadow.scale.setScalar(1);
  kickMarker.position.set(kick.x, 0.028, kick.z);

  const sideline = THREE.MathUtils.clamp(kick.x / (FIELD_WIDTH / 2), -1, 1);
  camera.position.set(kick.x + sideline * 4.8, 6.7 + Math.abs(kick.x) * 0.035, kick.z + 15.4);
  camera.lookAt(new THREE.Vector3(0, 3.1, -0.8));
}

function ballQuaternionTowardGoal(kick) {
  const ballZ = kick.z + BALL_TEE_Z_OFFSET;
  const toGoal = new THREE.Vector3(-kick.x, 0, GOAL_Z - ballZ).normalize();
  const highTipDirection = new THREE.Vector3(
    toGoal.x * Math.sin(BALL_TEE_LEAN),
    Math.cos(BALL_TEE_LEAN),
    toGoal.z * Math.sin(BALL_TEE_LEAN),
  ).normalize();

  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    highTipDirection,
  );
}

function calculateKick(kick, wind, power, direction) {
  const range = directionRange(kick);
  const drift = windDrift(kick, wind);
  const crossingX = direction * range + drift;
  const heightAtGoal =
    1.05 +
    power * 8.65 -
    kick.z * 0.069 -
    Math.abs(kick.x) * 0.018 +
    windCarry(kick, wind);

  const postContact = calculatePostContact(crossingX, heightAtGoal);
  const betweenPosts = Math.abs(crossingX) <= POST_HALF_WIDTH;
  const overBar = heightAtGoal >= CROSSBAR_HEIGHT;
  const overBlackDot = Math.abs(crossingX) <= BLACK_DOT_HALF_WIDTH;
  const postHit = overBar && postContact.hit;
  const made = overBar && (postHit ? postContact.insideShare >= POST_GOAL_INSIDE_SHARE : betweenPosts);

  let reason = "Missed left.";
  if (!overBar) {
    reason = "Short. It dipped under the crossbar.";
  } else if (postHit && !made) {
    reason =
      postContact.insideShare >= 0.5
        ? "Hit the upright and bounced away."
        : "Hit the outside of the upright.";
  } else if (crossingX > POST_HALF_WIDTH) {
    reason = "Missed right. The wind kept pushing it.";
  } else if (crossingX < -POST_HALF_WIDTH) {
    reason = "Missed left. The wind kept pushing it.";
  }

  return {
    crossingX,
    heightAtGoal,
    made,
    overBlackDot,
    postHit,
    postSide: postContact.side,
    insideShare: postContact.insideShare,
    reason,
  };
}

function createCleanFollowThrough(kick, metrics) {
  const startZ = kick.z + BALL_TEE_Z_OFFSET;
  const pathSlope = (metrics.crossingX - kick.x) / (GOAL_Z - startZ);
  const landingZ = -15;
  const endZ = -32;

  return {
    outcome: "clean",
    lockPath: true,
    pathSlope,
    landingX: metrics.crossingX + pathSlope * (landingZ - GOAL_Z),
    endX: metrics.crossingX + pathSlope * (endZ - GOAL_Z),
    landingZ,
    endZ,
    duration: 2.08 + kick.z * 0.022,
    bounceHeight: 0.82 + state.lockedPower * 0.5,
    followLift: 1.55,
    spinRate: 10.5,
  };
}

function createPostDeflection(kick, metrics, drift) {
  const side = metrics.postSide || Math.sign(metrics.crossingX) || 1;
  const impactSeed = Math.random();

  if (metrics.made) {
    const inwardDirection = -side;
    const inwardGlance = THREE.MathUtils.lerp(1.7, 3.05, impactSeed);
    const landingX = THREE.MathUtils.clamp(
      metrics.crossingX + inwardDirection * inwardGlance,
      -POST_HALF_WIDTH + BALL_POST_RADIUS,
      POST_HALF_WIDTH - BALL_POST_RADIUS,
    );
    return {
      outcome: "through",
      landingX,
      endX: THREE.MathUtils.clamp(
        landingX + inwardDirection * THREE.MathUtils.lerp(0.85, 2.05, Math.random()),
        -POST_HALF_WIDTH,
        POST_HALF_WIDTH,
      ),
      landingZ: THREE.MathUtils.lerp(-3.8, -5.8, impactSeed),
      endZ: -31,
      duration: 2.18 + kick.z * 0.021,
      bounceHeight: 0.72 + state.lockedPower * 0.42,
      followLift: 0.95,
      spinRate: 12.5,
    };
  }

  const backwardChance = THREE.MathUtils.clamp(
    0.7 - metrics.insideShare * 0.55 + Math.abs(drift) * 0.025,
    0.28,
    0.78,
  );

  if (impactSeed < backwardChance) {
    return {
      outcome: "back",
      landingX: metrics.crossingX + side * THREE.MathUtils.lerp(0.75, 2.4, Math.random()),
      endX: metrics.crossingX + side * THREE.MathUtils.lerp(1.6, 4.8, Math.random()),
      landingZ: THREE.MathUtils.lerp(6, 13, Math.random()),
      endZ: THREE.MathUtils.lerp(17, 28, Math.random()),
      duration: 1.92 + kick.z * 0.02,
      bounceHeight: 0.62 + state.lockedPower * 0.38,
      followLift: 0.55,
      spinRate: 14.5,
    };
  }

  return {
    outcome: "side",
    landingX: metrics.crossingX + side * THREE.MathUtils.lerp(5.5, 10.5, Math.random()),
    endX: metrics.crossingX + side * THREE.MathUtils.lerp(12, 19, Math.random()),
    landingZ: THREE.MathUtils.lerp(-5, 3, Math.random()),
    endZ: THREE.MathUtils.lerp(-10, 7, Math.random()),
    duration: 1.95 + kick.z * 0.018,
    bounceHeight: 0.55 + state.lockedPower * 0.34,
    followLift: 0.72,
    spinRate: 13.2,
  };
}

function calculatePostContact(crossingX, heightAtGoal) {
  const side = crossingX < 0 ? -1 : 1;
  const postX = side * POST_HALF_WIDTH;
  const contactDistance = Math.abs(crossingX - postX);
  const hit =
    heightAtGoal >= CROSSBAR_HEIGHT &&
    contactDistance <= BALL_POST_RADIUS + POST_RADIUS;
  const ballLeft = crossingX - BALL_POST_RADIUS;
  const ballRight = crossingX + BALL_POST_RADIUS;
  const insideWidth = Math.max(
    0,
    Math.min(POST_HALF_WIDTH, ballRight) - Math.max(-POST_HALF_WIDTH, ballLeft),
  );

  return {
    hit,
    side,
    insideShare: THREE.MathUtils.clamp(insideWidth / (BALL_POST_RADIUS * 2), 0, 1),
  };
}

function getAudioContext() {
  if (state.soundMuted) {
    return null;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function unlockAudio() {
  if (state.soundMuted) {
    return;
  }

  const context = getAudioContext();
  if (!context || audioUnlocked) {
    return;
  }

  const prime = () => {
    if (audioUnlocked) {
      return;
    }

    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
    oscillator.frequency.setValueAtTime(220, start);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.04);
    audioUnlocked = true;
  };

  if (context.state === "running") {
    prime();
    return;
  }

  context.resume().then(prime).catch(() => {});
}

function createSoundBus(context, start, volume, duration, pan = 0) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  if (context.createStereoPanner) {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pan, start);
    gain.connect(panner).connect(context.destination);
  } else {
    gain.connect(context.destination);
  }

  return gain;
}

function addTone(context, destination, { type, start, duration, from, to, volume }) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function addNoise(context, destination, { start, duration, volume, filterType, frequency }) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    const tail = 1 - index / frameCount;
    data[index] = (Math.random() * 2 - 1) * tail;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(destination);
  source.start(start);
  source.stop(start + duration);
}

function playKickSound(power) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const start = context.currentTime;
  const volume = THREE.MathUtils.lerp(0.16, 0.25, power);
  const bus = createSoundBus(context, start, volume, 0.2);
  addTone(context, bus, {
    type: "triangle",
    start,
    duration: 0.17,
    from: THREE.MathUtils.lerp(74, 118, power),
    to: 42,
    volume: 0.95,
  });
  addNoise(context, bus, {
    start,
    duration: 0.08,
    volume: 0.54,
    filterType: "lowpass",
    frequency: 560,
  });
}

function playPostHitSound(side) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const start = context.currentTime;
  const bus = createSoundBus(context, start, 0.11, 0.42, THREE.MathUtils.clamp(side * 0.28, -0.28, 0.28));
  addTone(context, bus, {
    type: "sine",
    start,
    duration: 0.36,
    from: 940,
    to: 640,
    volume: 0.72,
  });
  addTone(context, bus, {
    type: "sine",
    start: start + 0.014,
    duration: 0.28,
    from: 1460,
    to: 910,
    volume: 0.28,
  });
  addNoise(context, bus, {
    start,
    duration: 0.045,
    volume: 0.38,
    filterType: "highpass",
    frequency: 1800,
  });
}

function playGroundHitSound(weight) {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const start = context.currentTime;
  const volume = THREE.MathUtils.clamp(0.08 + weight * 0.05, 0.08, 0.15);
  const bus = createSoundBus(context, start, volume, 0.18);
  addTone(context, bus, {
    type: "sine",
    start,
    duration: 0.14,
    from: 82,
    to: 38,
    volume: 0.42,
  });
  addNoise(context, bus, {
    start,
    duration: 0.12,
    volume: 0.72,
    filterType: "lowpass",
    frequency: 420,
  });
}

function playVictorySound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const start = context.currentTime;
  const bus = createSoundBus(context, start, 0.08, 1.35);
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    addTone(context, bus, {
      type: "triangle",
      start: start + index * 0.15,
      duration: 0.22,
      from: frequency,
      to: frequency * 1.08,
      volume: 0.42,
    });
  });

  [0.12, 0.42, 0.72].forEach((offset, index) => {
    addNoise(context, bus, {
      start: start + offset,
      duration: 0.16,
      volume: 0.11 - index * 0.018,
      filterType: "highpass",
      frequency: 2200 + index * 580,
    });
  });
}

function playSoundToggleSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const start = context.currentTime;
  const bus = createSoundBus(context, start, 0.065, 0.26);
  addTone(context, bus, {
    type: "triangle",
    start,
    duration: 0.11,
    from: 520,
    to: 760,
    volume: 0.5,
  });
  addTone(context, bus, {
    type: "sine",
    start: start + 0.08,
    duration: 0.14,
    from: 760,
    to: 980,
    volume: 0.34,
  });
}

function activeKick() {
  return kicks[state.kickIndex];
}

function activeWind() {
  return state.windSequence[state.kickIndex] ?? createWindForKick(state.kickIndex);
}

function createWindSequence() {
  let previousSpeed = 0;

  return kicks.map((_, index) => {
    const wind = createWindForKick(index, previousSpeed);
    previousSpeed = wind.speed;
    return wind;
  });
}

function createWindForKick(index, previousSpeed = 0) {
  const progress = kicks.length <= 1 ? 0 : index / (kicks.length - 1);
  const minSpeed = Math.max(previousSpeed, Math.round(THREE.MathUtils.lerp(1, 15, progress)));
  const maxSpeed = Math.max(minSpeed, Math.round(THREE.MathUtils.lerp(5, 28, progress)));
  const speed = Math.round(THREE.MathUtils.lerp(minSpeed, maxSpeed, Math.random()));
  const angle = Math.floor(Math.random() * 360);
  const radians = THREE.MathUtils.degToRad(angle);

  return {
    speed,
    angle,
    cardinal: cardinalDirection(angle),
    cross: Math.sin(radians) * speed,
    tail: Math.cos(radians) * speed,
  };
}

function cardinalDirection(angle) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(angle / 45) % directions.length];
}

function powerNeeded(kick, wind = activeWind()) {
  return THREE.MathUtils.clamp(
    (CROSSBAR_HEIGHT -
      1.05 +
      kick.z * 0.069 +
      Math.abs(kick.x) * 0.018 -
      windCarry(kick, wind)) /
      8.65,
    0.38,
    0.88,
  );
}

function directionRange(kick) {
  const sidelineFactor = Math.abs(kick.x) / (FIELD_WIDTH / 2);
  const distanceFactor = THREE.MathUtils.clamp((kick.z - 22) / 24, 0, 1);
  return THREE.MathUtils.lerp(8.2, 22, Math.max(sidelineFactor, distanceFactor * 0.82));
}

function windDrift(kick, wind) {
  return wind.cross * 0.1 * (kick.z / 35);
}

function windCarry(kick, wind) {
  return wind.tail * 0.028 * (kick.z / 35);
}

function powerSpeed(kick) {
  return 4.85 + state.kickIndex * 0.35 + Math.abs(kick.x) * 0.02;
}

function directionSpeed(kick) {
  return 3.5 + state.kickIndex * 0.24 + Math.abs(kick.x) * 0.022;
}

function syncUi() {
  const kick = activeKick();
  const wind = activeWind();
  const phaseClass = `phase-${state.phase}`;
  const showCoachReminder =
    state.kickIndex === 3 && (state.phase === "power" || state.phase === "direction");
  ui.app.className = phaseClass;
  ui.kickNumber.textContent = String(Math.min(state.kickIndex + 1, kicks.length));
  ui.streak.textContent = String(state.streak);
  ui.position.textContent = kick.name;
  ui.wind.textContent = windLabel(wind);
  ui.bestScore.textContent = `${state.bestScore} / ${kicks.length}`;
  ui.menuSummary.textContent = state.menuSummary;
  ui.windVane.style.setProperty("--wind-angle", `${(wind.angle + 90) % 360}deg`);
  ui.windVane.style.setProperty("--wind-sway", `${Math.max(2, wind.speed * 0.42)}deg`);
  syncBackgroundButtons();
  syncSoundButtons();

  const need = powerNeeded(kick, wind);
  ui.powerTarget.style.bottom = `${need * 100}%`;

  const halfSweetPercent = (POST_HALF_WIDTH / directionRange(kick)) * 50;
  const sweetWidth = Math.max(8, halfSweetPercent * 2);
  ui.directionSweet.style.left = `${50 - sweetWidth / 2}%`;
  ui.directionSweet.style.width = `${sweetWidth}%`;

  const compensate = THREE.MathUtils.clamp(-windDrift(kick, wind) / directionRange(kick), -0.78, 0.78);
  ui.windCue.style.left = `calc(${50 + compensate * 50}% - 6px)`;
  ui.windCue.style.opacity = Math.abs(wind.cross) < 0.6 ? "0.38" : "1";

  if (state.phase === "menu") {
    state.fanfareKind = "";
    state.goalCall = "";
    ui.phaseLabel.textContent = "Main menu";
    ui.resultLabel.textContent = "Choose a background, then start a new run.";
    ui.actionButton.textContent = "New game";
  } else if (state.phase === "power") {
    state.fanfareKind = "";
    state.goalCall = "";
    ui.phaseLabel.textContent = "Set power";
    ui.resultLabel.textContent = "A higher strike carries the kick over the bar.";
    ui.actionButton.textContent = "Set power";
  } else if (state.phase === "direction") {
    ui.phaseLabel.textContent = "Set direction";
    ui.resultLabel.textContent = "Keep it through the middle, with a little allowance for wind.";
    ui.actionButton.textContent = "Kick";
  } else if (state.phase === "flight") {
    state.fanfareKind = "";
    state.goalCall = "";
    ui.phaseLabel.textContent = "In flight";
    ui.resultLabel.textContent = "Watch the posts.";
    ui.actionButton.textContent = "Kicking";
  } else if (state.phase === "between") {
    ui.phaseLabel.textContent = "Goal";
    ui.resultLabel.textContent = state.result;
    ui.actionButton.textContent = "Next kick";
  } else if (state.phase === "won") {
    ui.phaseLabel.textContent = "Invincible";
    ui.resultLabel.textContent = state.result;
    ui.actionButton.textContent = "Main menu";
  } else {
    ui.phaseLabel.textContent = "Game over";
    ui.resultLabel.textContent = state.result;
    ui.actionButton.textContent = "Main menu";
  }

  ui.coachLine.classList.toggle("is-visible", showCoachReminder);
  ui.coachLine.setAttribute("aria-hidden", showCoachReminder ? "false" : "true");

  syncFanfare();
  syncMeters();
}

function syncMeters() {
  const power = state.phase === "power" ? state.livePower : state.lockedPower;
  const direction = state.phase === "direction" ? state.liveDirection : state.lockedDirection;

  ui.powerReadout.textContent = `${Math.round(power * 100)}%`;
  ui.powerMarker.style.bottom = `calc(${power * 100}% - 3px)`;

  const left = 50 + direction * 50;
  ui.directionMarker.style.left = `calc(${left}% - 2px)`;
  ui.directionReadout.textContent = directionText(direction);
}

function windLabel(wind) {
  if (wind.speed === 0) {
    return "Calm";
  }

  return `${wind.speed} km/h ${wind.cardinal}`;
}

function syncFanfare() {
  const hasFanfare =
    state.fanfareKind === "goal" ||
    state.fanfareKind === "miss" ||
    state.fanfareKind === "perfect";
  ui.fanfare.classList.toggle("is-visible", hasFanfare);
  ui.fanfare.classList.toggle("is-miss", state.fanfareKind === "miss");
  ui.fanfare.classList.toggle("is-perfect", state.fanfareKind === "perfect");
  ui.fanfare.setAttribute("aria-hidden", hasFanfare ? "false" : "true");

  if (state.fanfareKind === "perfect") {
    ui.fanfareSmall.textContent = state.goalCall || "Perfect card";
    ui.fanfareLarge.textContent = "10/10!";
    return;
  }

  if (state.fanfareKind === "goal") {
    ui.fanfareSmall.textContent = state.goalCall || "The flags are up";
    ui.fanfareLarge.textContent = "GOAL!";
    return;
  }

  if (state.fanfareKind === "miss") {
    ui.fanfareSmall.textContent = "Waved away";
    ui.fanfareLarge.textContent =
      missCalls[(state.kickIndex + Math.round(state.lockedPower * 10)) % missCalls.length];
  }
}

function directionText(value) {
  if (Math.abs(value) < 0.08) {
    return "Centre";
  }

  return value < 0 ? "Left" : "Right";
}

function isFinalPhase() {
  return state.phase === "game-over" || state.phase === "won";
}

function easeInOut(value) {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function easeInQuad(value) {
  return value * value;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function smootherStep(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function resizeRenderer() {
  if (!renderer || !camera) {
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = width < 720 ? 54 : 45;
  camera.updateProjectionMatrix();
}
