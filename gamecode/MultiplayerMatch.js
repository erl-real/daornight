import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArcadeVehicle } from './ArcadeVehicle.js';
import { Projectiles } from './Projectiles.js';
import { Barrels } from './Barrels.js';
import { Ults } from './Ults.js';
import { Pickups } from './Pickups.js';
import { WEAPON_TYPES } from './Weps.js';
import { CONFIG } from './Config.js';

const MAPS = [
  { name: 'ball', label: 'Ball Proving Grounds', ball: true, grass: true, groundColor: 0x1a4a1a, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_21-512x512.png',
    pickups: [
      { x: 180, z: 0, type: 'health' }, { x: -180, z: 0, type: 'charge' }, { x: 0, z: 180, type: 'energy' },
      { x: 0, z: -180, type: 'ammo' }, { x: 127, z: 127, type: 'ult' }, { x: -127, z: 127, type: 'missile' },
      { x: 127, z: -127, type: 'shotgun' }, { x: -127, z: -127, type: 'turret' }, { x: 240, z: 0, type: 'cannon' },
      { x: 0, z: 240, type: 'melee' }, { x: -240, z: 0, type: 'mortar' }, { x: 0, z: -240, type: 'c4' },
      { x: 160, z: -160, type: 'buff_hover' }, { x: -160, z: 160, type: 'energywep' }
    ] },
  { name: 'greyhills', label: 'Greyhills', grass: true, groundColor: 0x5d4037, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_10-512x512.png',
    pickups: [{ x: 200, z: 0, type: 'health' }, { x: -200, z: 0, type: 'charge' }, { x: 0, z: 200, type: 'energy' }, { x: 0, z: -200, type: 'ammo' }, { x: 141, z: 141, type: 'ult' }, { x: -141, z: 141, type: 'missile' }, { x: 141, z: -141, type: 'shotgun' }, { x: -141, z: -141, type: 'cannon' }, { x: 260, z: 0, type: 'turret' }, { x: 0, z: 260, type: 'melee' }, { x: -260, z: 0, type: 'mortar' }, { x: 0, z: -260, type: 'c4' }, { x: 180, z: -180, type: 'buff_hover' }] },
  { name: 'riverbanks', label: 'Riverbanks', grass: true, groundColor: 0xd2b48c, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_19-512x512.png', pickups: 'default' },
  { name: 'area51', label: 'Area 51', grass: true, groundColor: 0xd2b48c, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_19-512x512.png', pickups: 'default' },
  { name: 'antarctica', label: 'Antarctica', grass: true, groundColor: 0xffffff, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_04-512x512.png', pickups: 'default' },
  { name: 'canyon', label: 'Canyon', grass: true, groundColor: 0x8b4513, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_09-512x512.png', pickups: 'default' },
  { name: 'prison', label: 'Prison', grass: true, groundColor: 0x808080, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_01-512x512.png', pickups: 'default' },
  { name: 'trailerpark', label: 'Trailer Park', grass: true, groundColor: 0x1a4a1a, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_15-512x512.png', pickups: 'default' },
  { name: 'castle', label: 'Castle', grass: true, groundColor: 0x1a4a1a, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_16-512x512.png', pickups: 'default' },
  { name: 'raceden', label: 'Race Den', grass: true, groundColor: 0x111111, skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_15-512x512.png', pickups: 'default' }
];
const DefaultPickups = [
  { x: 200, z: 0, type: 'health' }, { x: -200, z: 0, type: 'charge' }, { x: 0, z: 200, type: 'energy' }, { x: 0, z: -200, type: 'ammo' },
  { x: 141, z: 141, type: 'ult' }, { x: -141, z: 141, type: 'missile' }, { x: 141, z: -141, type: 'shotgun' }, { x: -141, z: -141, type: 'cannon' },
  { x: 260, z: 0, type: 'turret' }, { x: 0, z: 260, type: 'melee' }, { x: -260, z: 0, type: 'mortar' }, { x: 0, z: -260, type: 'c4' },
  { x: 180, z: -180, type: 'buff_hover' }
];
const GROUPS = { GROUND: 1, OBSTACLE: 2, BALL: 4, PLAYER: 8 };

function randomMap() { return MAPS[Math.floor(Math.random() * MAPS.length)]; }

export class MultiplayerMatch {
  constructor(networkManager, role) {
    this.net = networkManager;
    this.role = role;
    this._active = false;
    this.isDisposed = false;
    this.isPaused = false;

    this.container = document.getElementById('game-layer');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.world = null;
    this.vehicles = new Map();
    this.localVehicle = null;
    this.keys = {};
    this.snapshotInterval = null;
    this.hostInputs = new Map();

    this.slickMat = new CANNON.Material('slick');
    this.projectiles = null;
    this.barrels = null;
    this.ults = null;
    this.pickups = null;
    this.ballBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(0, -1000, 0) });
    this.ballMesh = new THREE.Mesh();

    // Player state
    this.energy = 100;
    this.nitro = 100;
    this.mineAmmo = 7;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.lastMineTime = 0;
    this.mineCooldown = 3000;
    this.deathCountdown = 0;
    this.matchEnded = false;
    this.lives = 3;
    this.kills = 0;
    this.weaponInventory = ['ult'];
    this.currentWeaponIndex = 0;
    this.virtualHeading = 0;
    this.camDist = 12;
    this.camHeight = 5;
    this.lookAtTarget = new THREE.Vector3();
    this.lastJumpTime = 0;
    this.isLeaningState = false;
    this.currentLeanSide = 0;
    this.leanCooldown = 0;
    this.zeroSpeedTimer = 0;
    this.driftToggled = false;
    this.currentGear = 0;
    this.fireStartTime = 0;
    this.isFiring = false;
    this.currentBPS = 0;
    this.lastFireTime = 0;
    this.pools = [];
    this._l3Prev = false;
    this.mapConfig = null;

    this.clock = new THREE.Clock();

    this._keydownRef = null;
    this._keyupRef = null;
    this._resizeRef = null;
  }

  init(mapName) {
    this.mapConfig = mapName ? MAPS.find(m => m.name === mapName) || randomMap() : randomMap();
    const pickups = this.mapConfig.pickups === 'default' ? DefaultPickups : this.mapConfig.pickups;

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), broadphase: new CANNON.NaiveBroadphase() });
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.slickMat, this.slickMat, { friction: 0.0, restitution: 0.0 }));
    const groundBody = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    this.loadSkybox();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(50, 100, 50);
    this.scene.add(sun);

    this.projectiles = new Projectiles(this.scene, this.world);
    this.barrels = new Barrels(this.scene, this.world, null, null);
    this.graphics = { scene: this.scene };
    this.physics = { world: this.world };
    this.ults = new Ults(this);
    this.pickups = new Pickups(this.scene, pickups);

    this._active = true;
    this.bindInput();
    this.startNet();

    this._resizeRef = () => {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (w > 0 && h > 0) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); }
    };
    window.addEventListener('resize', this._resizeRef);
    this.loop();
  }

  loadSkybox() {
    const sc = this.mapConfig;
    if (sc.skybox) {
      const loader = new THREE.TextureLoader();
      loader.load(sc.skybox, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = texture;
        this.scene.environment = texture;
      });
    } else {
      this.scene.background = new THREE.Color(0x111118);
    }
    if (sc.grass) {
      const color = sc.groundColor || 0x1a4a1a;
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color }));
      grass.rotation.x = -Math.PI / 2;
      grass.position.y = 0.01;
      this.scene.add(grass);
    } else {
      this.scene.add(new THREE.GridHelper(1000, 50, 0x444444, 0x222222));
    }
  }

  startNet() {
    if (this.role === 'host') {
      this.net.onDataChannelMessage = (fromId, raw) => this.handleClientInput(fromId, raw);
      this.snapshotInterval = setInterval(() => this.broadcastSnapshot(), 50);
    } else {
      this.net.onDataChannelMessage = (fromId, raw) => this.handleSnapshot(raw);
    }
  }

  addVehicle(playerId, carType, position) {
    const pos = position || new CANNON.Vec3(0, 3, 0);
    const vehicle = new ArcadeVehicle(this.scene, this.world, {
      carType: carType || '35-impala',
      position: pos,
      collisionFilterGroup: GROUPS.PLAYER,
      collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER,
      material: this.slickMat
    });
    vehicle.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI);
    vehicle.energy = 100;
    vehicle.nitro = 100;
    vehicle.shieldActive = false;
    vehicle.shieldTimer = 0;
    vehicle.isLeaningState = false;
    vehicle.currentLeanSide = 0;
    vehicle.mineAmmo = 7;
    vehicle.ammo = { ult: 5 };
    vehicle.weaponInventory = ['ult'];
    this.ults.initVehicleUlt(vehicle);
    this.ults.addAmmo(vehicle, 3, 'ult');
    this.vehicles.set(playerId, vehicle);
    return vehicle;
  }

  removeVehicle(playerId) {
    const v = this.vehicles.get(playerId);
    if (!v) return;
    if (v.carMesh) this.scene.remove(v.carMesh);
    if (v.hitboxHelper) this.scene.remove(v.hitboxHelper);
    (v.visualDots || []).forEach(d => this.scene.remove(d));
    if (v.chassisBody && this.world) this.world.removeBody(v.chassisBody);
    this.vehicles.delete(playerId);
  }

  startMatch(players) {
    const positions = [new CANNON.Vec3(0, 3, 0), new CANNON.Vec3(8, 3, 0)];
    players.forEach((p, i) => {
      const v = this.addVehicle(p.id, p.car, positions[i % positions.length]);
      if (p.id === this.net.playerId) this.localVehicle = v;
    });
    // On client, set remote vehicles as kinematic/interpolated
    if (this.role === 'client') {
      for (const [id, v] of this.vehicles) {
        if (id !== this.net.playerId) {
          if (this.world && v.chassisBody) this.world.removeBody(v.chassisBody);
          const pos = v.chassisBody.position;
          v._interpPos = new THREE.Vector3(pos.x, pos.y, pos.z);
          v._interpQuat = new THREE.Quaternion(v.chassisBody.quaternion.x, v.chassisBody.quaternion.y, v.chassisBody.quaternion.z, v.chassisBody.quaternion.w);
          v._snapTarget = null;
        }
      }
    }
    this.updateWeaponUI();
  }

  bindInput() {
    this._keydownRef = (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyJ' && Date.now() - this.lastJumpTime > 2000) this.handleJump();
      if (e.code === 'BracketRight' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        this.input.pushCombo('up');
        if (e.code === 'BracketRight') { /* gear handled elsewhere if needed */ }
      }
      if (e.code === 'BracketLeft' || e.code === 'ArrowDown' || e.code === 'KeyS') {
        this.input.pushCombo('down');
        if (e.code === 'BracketLeft') { }
      }
      if (e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyQ') this.fireWeapon();
      if (e.code === 'KeyE') this.fireMine();
      if (e.code === 'KeyY') this.toggleShield(true);
    };
    this._keyupRef = (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyY') this.toggleShield(false);
    };
    this._mousedownRef = (e) => { if (e.button === 0) this.keys['Mouse0'] = true; };
    this._mouseupRef = (e) => { if (e.button === 0) this.keys['Mouse0'] = false; };
    this._wheelRef = (e) => { if (e.deltaY > 0) this.rotateWeapon(1); else this.rotateWeapon(-1); };
    window.addEventListener('keydown', this._keydownRef);
    window.addEventListener('keyup', this._keyupRef);
    window.addEventListener('mousedown', this._mousedownRef);
    window.addEventListener('mouseup', this._mouseupRef);
    window.addEventListener('wheel', this._wheelRef);
    this.input = { inputBuffer: [], lastInputTime: 0, pushCombo(dir) { this.inputBuffer.push(dir); if (this.inputBuffer.length > 3) this.inputBuffer.shift(); this.lastInputTime = Date.now(); } };
  }

  unbindInput() {
    if (this._keydownRef) window.removeEventListener('keydown', this._keydownRef);
    if (this._keyupRef) window.removeEventListener('keyup', this._keyupRef);
    if (this._mousedownRef) window.removeEventListener('mousedown', this._mousedownRef);
    if (this._mouseupRef) window.removeEventListener('mouseup', this._mouseupRef);
    if (this._wheelRef) window.removeEventListener('wheel', this._wheelRef);
    this._keydownRef = null;
    this._keyupRef = null;
    this._mousedownRef = null;
    this._mouseupRef = null;
    this._wheelRef = null;
    if (this._resizeRef) window.removeEventListener('resize', this._resizeRef);
  }

  getGamepad() { return Array.from(navigator.getGamepads()).find(g => g !== null); }

  updateInput(dt) {
    const keys = this.keys;
    const gp = this.getGamepad();
    const vehicle = this.localVehicle;
    if (!vehicle) return { steerDir: 0, leanActive: false };

    // Mine
    if (keys['KeyE'] || (gp && gp.buttons[1]?.pressed)) this.fireMine();
    // Ult/Weapon
    if (keys['KeyQ'] || (gp && gp.buttons[0]?.pressed)) this.fireWeapon();
    // Shield
    this.toggleShield(!!(keys['KeyY'] || (gp && gp.buttons[3]?.pressed)));

    let steerDir = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
    if (gp && Math.abs(gp.axes[0]) > 0.1) steerDir = -gp.axes[0];

    const isGrounded = vehicle.isTrulyGrounded;
    const leanHeld = keys['KeyL'] || (gp && gp.buttons[10]?.pressed);

    // L3 while hovering toggles low hover
    if (gp && vehicle.hoverMode && gp.buttons[10]?.pressed && !this._l3Prev) vehicle.toggleHover();
    this._l3Prev = gp ? !!gp.buttons[10]?.pressed : false;

    let throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    let airPitch = throttle;
    if (gp && Math.abs(gp.axes[1]) > 0.1) airPitch = -gp.axes[1];

    // Air flips
    if (!isGrounded && !vehicle.hoverMode && leanHeld && !vehicle.isAirFlipping) {
      if (Math.abs(steerDir) > 0.5 && this.energy >= 20) { this.energy -= 20; vehicle.performAirFlip(Math.sign(steerDir), 'roll'); }
      else if (Math.abs(airPitch) > 0.5 && this.energy >= 40) { this.energy -= 40; vehicle.performAirFlip(Math.sign(airPitch), 'pitch'); }
    }

    // Lean state management
    if (leanHeld && !vehicle.hoverMode && isGrounded) {
      const speedMPH = vehicle.chassisBody.velocity.length() * 2.237;
      const boostHeld = (keys['KeyB'] || (gp && gp.buttons[4]?.pressed));
      if (!this.isLeaningState) {
        if (boostHeld && Math.abs(steerDir) > 0.6 && this.leanCooldown <= 0) { this.isLeaningState = true; this.currentLeanSide = Math.sign(steerDir); }
      } else {
        if (Math.sign(steerDir) === -this.currentLeanSide && Math.abs(steerDir) > 0.6) { this.isLeaningState = false; this.currentLeanSide = 0; this.leanCooldown = 5.0; }
        if (speedMPH < 1.0) { this.zeroSpeedTimer = (this.zeroSpeedTimer || 0) + dt; if (this.zeroSpeedTimer > 3.0) { this.isLeaningState = false; this.currentLeanSide = 0; this.leanCooldown = 5.0; } }
        else this.zeroSpeedTimer = 0;
      }
    } else if (this.isLeaningState) { this.isLeaningState = false; this.currentLeanSide = 0; this.leanCooldown = 5.0; }

    // STEERING - THIS IS THE CRITICAL LINE THAT MAKES THE CAR TURN
    this.virtualHeading += steerDir * (this.isLeaningState ? 0.6 : 2.5) * dt;

    // Gamepad throttle override
    if (gp) {
      const f = gp.buttons[7]?.value || 0, r = gp.buttons[6]?.value || 0;
      if (Math.abs(f) > 0.05 || Math.abs(r) > 0.05) throttle = f - r;
      // Gears
      if (this.gearStickReset === undefined) this.gearStickReset = true;
      const rsY = gp.axes[3];
      const l3Held = gp.buttons[10]?.pressed;
      if (this.gearStickReset) {
        if (rsY < -0.5) { this.currentGear = Math.min(5, (this.currentGear || 0) + 1); if (!l3Held) this.input.pushCombo('up'); this.gearStickReset = false; }
        else if (rsY > 0.5) { this.currentGear = Math.max(0, (this.currentGear || 0) - 1); if (!l3Held) this.input.pushCombo('down'); this.gearStickReset = false; }
      } else if (Math.abs(rsY) < 0.2) this.gearStickReset = true;
      // D-Pad combos
      if (this.dpadUpReset === undefined) { this.dpadUpReset = true; this.dpadDownReset = true; }
      if (gp.buttons[12]?.pressed) { if (this.dpadUpReset) { this.input.pushCombo('up'); this.dpadUpReset = false; } } else this.dpadUpReset = true;
      if (gp.buttons[13]?.pressed) { if (this.dpadDownReset) { this.input.pushCombo('down'); this.dpadDownReset = false; } } else this.dpadDownReset = true;
      // D-Pad weapon switch
      if (this.dpadReset === undefined) this.dpadReset = true;
      if (this.dpadReset) {
        if (gp.buttons[14]?.pressed) { this.rotateWeapon(-1); this.dpadReset = false; }
        else if (gp.buttons[15]?.pressed) { this.rotateWeapon(1); this.dpadReset = false; }
      } else if (!gp.buttons[14]?.pressed && !gp.buttons[15]?.pressed) this.dpadReset = true;
    }

    if (gp && gp.buttons[11]?.pressed && Date.now() - this.lastJumpTime > 1000) this.handleJump();

    // Drifting
    const canAct = vehicle.hoverMode || isGrounded;
    const r1Pressed = gp && gp.buttons[5]?.pressed;
    if (r1Pressed && !this._prevR1) this.driftToggled = !this.driftToggled;
    this._prevR1 = r1Pressed;
    vehicle.isDrifting = (keys['ShiftLeft'] || keys['Space'] || r1Pressed || this.driftToggled) && canAct && Math.abs(steerDir) > 0.01;
    if (vehicle.isDrifting) vehicle.driftAngle += (steerDir * Math.PI / 4 - vehicle.driftAngle) * 0.1;
    else vehicle.driftAngle *= 0.9;
    if (this.driftToggled && (Math.abs(steerDir) <= 0.01 || vehicle.chassisBody.velocity.length() * 2.237 < 30)) this.driftToggled = false;

    // Nitro
    const boostHeld = keys['KeyB'] || (gp && gp.buttons[4]?.pressed);
    if (boostHeld && this.nitro > 5) { vehicle.boostFactor = 2.0; this.nitro = Math.max(0, this.nitro - 25 * dt); }
    else vehicle.boostFactor = 1.0;

    // Hydraulics
    if (gp && gp.buttons[10]?.pressed && !vehicle.hoverMode && !this.isLeaningState) {
      const hPitch = gp.axes[3], hRoll = gp.axes[2];
      vehicle.hydraulics.targetPitch = -hPitch;
      vehicle.hydraulics.targetRoll = hRoll;
      vehicle.hydraulics.targetLift = Math.max(0, -hPitch);
    } else {
      vehicle.hydraulics.targetPitch = 0;
      vehicle.hydraulics.targetRoll = 0;
      vehicle.hydraulics.targetLift = 0;
    }

    vehicle.applyInputs(throttle, !vehicle.isDrifting && (keys['Space'] || (gp && gp.buttons[5]?.pressed)) && canAct);
    vehicle.airPitchInput = airPitch;
    return { steerDir: this.isLeaningState ? this.currentLeanSide : steerDir, leanActive: this.isLeaningState };
  }

  handleJump() {
    if (!this.localVehicle || !this.localVehicle.isReadyToJump()) return;
    const now = Date.now();
    const combo = this.input.inputBuffer.join('-');
    const isSuperCombo = (combo === 'down-down-up' && (now - this.input.lastInputTime < 2000));
    const gp = this.getGamepad();
    const rsUp = gp ? gp.axes[3] < -0.7 : false;
    const l3Held = gp ? gp.buttons[10]?.pressed : false;
    if (isSuperCombo && l3Held && rsUp && this.energy >= 80) {
      this.localVehicle.jump(65);
      this.energy = 0;
      this.input.inputBuffer = [];
      this.lastJumpTime = now;
      return;
    }
    const isHydraulicSuper = l3Held && rsUp && this.energy >= 40;
    const isSuper = (isSuperCombo && this.energy >= 40) || isHydraulicSuper;
    if (isSuper && this.energy >= 40) {
      this.energy -= 40;
      this.input.inputBuffer = [];
      this.localVehicle.jump(36);
      this.lastJumpTime = now;
    } else {
      this.localVehicle.jump(24);
      this.lastJumpTime = now;
    }
  }

  toggleShield(active) {
    if (active) {
      if (this.shieldActive) return;
      if (this.energy > 5) {
        this.shieldActive = true;
        this.shieldTimer = 4.0;
        this.energy = 0;
        if (this.localVehicle?.shieldMesh) this.localVehicle.shieldMesh.visible = true;
      }
    }
  }

  fireWeapon() {
    if (!this.localVehicle) return;
    const type = this.weaponInventory[this.currentWeaponIndex];
    if (type === 'ult') this.performUlt();
    else {
      const gp = this.getGamepad();
      const backfire = this.keys['KeyS'] || this.keys['ArrowDown'] || (gp && gp.axes[1] > 0.5);
      this.ults.fire(this.localVehicle, backfire);
    }
    this.updateWeaponUI();
  }

  performUlt() {
    if (!this.localVehicle) return;
    const state = this.ults.activeUlts.get(this.localVehicle);
    const wState = state ? state.weapons.get('ult') : null;
    if (!wState || wState.ammo <= 0) return;
    const now = Date.now();
    if (now - (wState ? wState.lastFireTime : 0) < (wState ? wState.cooldown : 3000)) return;
    const type = this.localVehicle.carType || window.currentCar || '35-impala';
    if (!(type === 'semi' && state && state.semiTrailer)) wState.ammo--;
    wState.lastFireTime = now;
    if (type === '35-impala') this.impalaUlt();
    else if (type === '12-servervan') this.serverVanUlt();
    else if (type === 'f2') this.f2Ult();
    else if (type === 'humher') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performHumherUlt(this.localVehicle, s); }
    else if (type === 'mini') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performMiniUlt(this.localVehicle, s); }
    else if (type === 'schoolbus') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performSchoolBusUlt(this.localVehicle, s); }
    else if (type === 'rv') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performRvUlt(this.localVehicle, s); }
    else if (type === 'yellowelstang') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performElstangUlt(this.localVehicle, s); }
    else if (type === 'sportssuper') this.sportsSuperUlt();
    else if (type === 'rocketcar') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performRocketCarUlt(this.localVehicle, s); }
    else if (type === 'z2-ufo') this.ufoUlt();
    else if (type === 'policecar') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performPoliceCarUlt(this.localVehicle, s); }
    else if (type === '61lowrider') this.lowriderUlt();
    else if (type === 'grappler') this.grapplerUlt();
    else if (type === 'bladecybercar') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performBladeUlt(this.localVehicle, s); }
    else if (type === '4door') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.perform4DoorUlt(this.localVehicle, s); }
    else if (type === 'finaltank') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performFinalTankUlt(this.localVehicle, s); }
    else if (type === 'semi') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performSemiUlt(this.localVehicle, s); }
    else if (type === 'sidecarbike') { const s = this.ults.activeUlts.get(this.localVehicle); if (s) this.ults.performSidecarUlt(this.localVehicle, s); }
    else this.ults.fire(this.localVehicle);
    this.updateWeaponUI();
  }

  impalaUlt() {
    if (!this.localVehicle) return;
    this.localVehicle.chassisBody.applyImpulse(new CANNON.Vec3(0, 15000, 0), new CANNON.Vec3(0, 0, -2));
    const pos = this.localVehicle.chassisBody.position;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 15, 32), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(pos); this.scene.add(ring);
    let life = 0.5;
    const expand = () => { life -= 0.02; ring.scale.addScalar(0.2); ring.material.opacity = life; if (life <= 0) this.scene.remove(ring); else requestAnimationFrame(expand); };
    expand();
  }
  serverVanUlt() {
    if (!this.localVehicle) return;
    const pos = this.localVehicle.chassisBody.position;
    const flash = new THREE.PointLight(0x00ffff, 50, 40); flash.position.copy(pos); this.scene.add(flash);
    setTimeout(() => this.scene.remove(flash), 200);
    this.cars().forEach(c => {
      if (c === this.localVehicle || c.isDead) return;
      c.applyDamage(30);
    });
  }
  f2Ult() {
    const target = this.ults.getTarget(this.localVehicle, this.barrels, this.ballBody, 60);
    if (!target) { this.ults.addAmmo(this.localVehicle, 1, 'ult'); return; }
    const tPos = target.body.position;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.cars().forEach(c => {
          if (c === this.localVehicle || c.isDead) return;
          if (c.chassisBody.position.distanceTo(tPos) < 8) c.applyDamage(15);
        });
      }, i * 200);
    }
  }
  humherUlt() {
    const start = Date.now();
    const interval = setInterval(() => {
      if (!this._active || Date.now() - start > 2000) { clearInterval(interval); return; }
      const target = this.ults.getTarget(this.localVehicle, this.barrels, this.ballBody, 40, Math.PI / 2);
      if (target) {
        const dir = target.body.position.vsub(this.localVehicle.chassisBody.position); dir.normalize();
        this.ults.spawnProjectile(this.localVehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 1, 0)), new THREE.Vector3(dir.x, dir.y, dir.z), 'bullet', this.localVehicle);
      }
    }, 100);
  }
  miniUlt() {
    const target = this.ults.getTarget(this.localVehicle, this.barrels, this.ballBody, 80);
    if (!target) { this.ults.addAmmo(this.localVehicle, 1, 'ult'); return; }
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.ults.spawnProjectile(this.localVehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 2, 0)), new THREE.Vector3(0, 1, 0), 'missile', this.localVehicle);
        const p = this.ults.projectiles[this.ults.projectiles.length - 1];
        if (p) {
          p.damage = 60; p.life = 4.0;
          setTimeout(() => {
            const newDir = target.body.position.vsub(p.mesh.position); newDir.normalize();
            p.velocity.set(newDir.x * 40, newDir.y * 40, newDir.z * 40);
            p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(newDir.x, newDir.y, newDir.z));
          }, 500);
        }
      }, i * 300);
    }
  }
  schoolBusUlt() {
    const target = this.ults.getTarget(this.localVehicle, this.barrels, this.ballBody, 100);
    if (!target) return;
    const start = this.localVehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 2, 0)); const end = target.body.position;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)]), new THREE.LineBasicMaterial({ color: 0xff0000 }));
    this.scene.add(line); setTimeout(() => this.scene.remove(line), 50);
    if (!target.isBall) { target.applyDamage(5); }
  }
  elstangUlt() {
    const yaw = this.localVehicle.carMesh.rotation.y;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.ults.spawnProjectile(this.localVehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 1, 0)), forward, 'sniper', this.localVehicle);
    const p = this.ults.projectiles[this.ults.projectiles.length - 1];
    if (p) { p.damage = 100; p.velocity.multiplyScalar(3.0); }
  }
  sportsSuperUlt() {
    const start = Date.now();
    const interval = setInterval(() => {
      if (!this._active || Date.now() - start > 1500) { clearInterval(interval); return; }
      const yaw = this.localVehicle.carMesh.rotation.y;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      this.cars().forEach(c => {
        if (c === this.localVehicle || c.isDead) return;
        if (c.chassisBody.position.distanceTo(this.localVehicle.chassisBody.position) < 12) c.applyDamage(4);
      });
    }, 50);
  }
  rocketCarUlt() {
    const yaw = this.localVehicle.carMesh.rotation.y;
    const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.localVehicle.chassisBody.velocity.vadd(forward.scale(60), this.localVehicle.chassisBody.velocity);
  }
  ufoUlt() {
    this.cars().forEach(c => {
      if (c === this.localVehicle || c.isDead) return;
      c.chassisBody.velocity.y = -100;
      c.applyDamage(40);
    });
  }
  policeCarUlt() {
    this.cars().forEach(c => {
      if (c === this.localVehicle || c.isDead) return;
      c.chassisBody.velocity.y = -50;
      c.applyDamage(25);
    });
  }
  lowriderUlt() {
    if (!this.localVehicle) return;
    this.localVehicle.chassisBody.velocity.y = 35;
    const yaw = this.localVehicle.carMesh.rotation.y;
    const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.localVehicle.chassisBody.velocity.vadd(forward.scale(40), this.localVehicle.chassisBody.velocity);
  }
  grapplerUlt() {
    this.cars().forEach(c => {
      if (c === this.localVehicle || c.isDead) return;
      const dir = c.chassisBody.position.vsub(this.localVehicle.chassisBody.position); dir.normalize();
      c.chassisBody.applyImpulse(dir.scale(15000), new CANNON.Vec3());
      c.applyDamage(10);
    });
  }

  fireMine() {
    if (!this.localVehicle) return;
    const now = Date.now();
    if (now - this.lastMineTime < this.mineCooldown || this.mineAmmo <= 0) return;
    this.lastMineTime = now;
    this.mineAmmo--;
    const yaw = this.localVehicle.carMesh.rotation.y;
    const backward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.projectiles.dropMine(this.localVehicle.chassisBody.position, backward, 'standard', this.localVehicle, false);
  }

  fireBullet() {
    if (!this.localVehicle) return;
    const now = Date.now();
    const dur = (now - this.fireStartTime) / 1000;
    const bps = 7 + 13 * Math.exp(-0.4 * dur);
    this.currentBPS = bps;
    if (now - this.lastFireTime < 1000 / bps) return;
    this.lastFireTime = now;
    const yaw = this.localVehicle.carMesh.rotation.y;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.projectiles.fireBullet(this.localVehicle.chassisBody.position, forward, dur, this.localVehicle);
  }

  rotateWeapon(dir) {
    this.currentWeaponIndex = (this.currentWeaponIndex + dir + this.weaponInventory.length) % this.weaponInventory.length;
    this.updateWeaponUI();
  }

  updateWeaponUI() {
    const type = this.weaponInventory[this.currentWeaponIndex];
    const state = this.ults.activeUlts.get(this.localVehicle);
    if (!state) return;
    const wState = state.weapons.get(type);
    const nameEl = document.getElementById('wep-name');
    const ammoEl = document.getElementById('wep-ammo');
    if (nameEl) nameEl.innerText = type === 'ult' ? 'ULTIMATE' : type.toUpperCase();
    if (ammoEl) ammoEl.innerText = wState ? `AMMO: ${wState.ammo}` : 'AMMO: 0';
  }

  handlePickup(type, vehicle) {
    if (type === 'health') { vehicle.health = Math.min(100, vehicle.health + 25); }
    else if (type === 'charge' || type === 'energy') { vehicle.energy = Math.min(100, (vehicle.energy || 100) + 50); if (vehicle === this.localVehicle) this.energy = Math.min(100, this.energy + 50); }
    else if (type === 'ammo') {
      const pool = ['ult', 'ult', 'missile', 'shotgun', 'cannon', 'turret', 'energy', 'melee', 'mortar', 'c4'];
      const randWep = pool[Math.floor(Math.random() * pool.length)];
      const inv = vehicle.weaponInventory || this.weaponInventory;
      if (!inv.includes(randWep) && randWep !== 'ult') inv.push(randWep);
      this.ults.addAmmo(vehicle, 5, randWep);
      if (vehicle === this.localVehicle && randWep !== 'ult') this.currentWeaponIndex = inv.indexOf(randWep);
    }
    else if (type === 'ult') { this.ults.addAmmo(vehicle, 1, 'ult'); }
    else if (type === 'energywep') {
      const inv = vehicle.weaponInventory || this.weaponInventory;
      if (!inv.includes('energy')) inv.push('energy');
      this.ults.addAmmo(vehicle, 20, 'energy');
      if (vehicle === this.localVehicle) this.currentWeaponIndex = inv.indexOf('energy');
    }
    else if (WEAPON_TYPES[type]) {
      const inv = vehicle.weaponInventory || this.weaponInventory;
      if (!inv.includes(type)) inv.push(type);
      this.ults.addAmmo(vehicle, 5, type);
      if (vehicle === this.localVehicle) this.currentWeaponIndex = inv.indexOf(type);
    }
    else if (type === 'buff_hover' || type === 'hover') { vehicle.hoverMode = true; }
    if (vehicle === this.localVehicle) this.updateWeaponUI();
  }

  cars() { return Array.from(this.vehicles.values()); }

  handleClientInput(fromId, raw) {
    let inputs;
    try { inputs = JSON.parse(raw); } catch { return; }
    if (inputs.type !== 'input') return;
    this.hostInputs.set(fromId, inputs);
  }

  broadcastSnapshot() {
    if (!this._active) return;
    const players = [];
    for (const [id, v] of this.vehicles) {
      if (v.isDead) continue;
      players.push({
        id,
        position: [v.chassisBody.position.x, v.chassisBody.position.y, v.chassisBody.position.z],
        rotation: [v.chassisBody.quaternion.x, v.chassisBody.quaternion.y, v.chassisBody.quaternion.z, v.chassisBody.quaternion.w],
        velocity: [v.chassisBody.velocity.x, v.chassisBody.velocity.y, v.chassisBody.velocity.z],
        health: v.health, isDead: v.isDead
      });
    }
    this.net.broadcastData(JSON.stringify({ type: 'snapshot', players }));
  }

  handleSnapshot(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'snapshot' || !msg.players) return;
    for (const p of msg.players) {
      if (p.id === this.net.playerId) continue; // skip local vehicle, client simulates it
      let v = this.vehicles.get(p.id);
      if (!v) {
        v = this.addVehicle(p.id, null, new CANNON.Vec3(p.position[0], p.position[1], p.position[2]));
        if (!v) continue;
        this._setupRemoteVehicle(v, p.id);
      }
      if (v.isDead) continue;
      // Store interpolation targets (used by clientTick)
      v._snapTarget = {
        position: new THREE.Vector3(p.position[0], p.position[1], p.position[2]),
        quaternion: new THREE.Quaternion(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3]),
        velocity: new THREE.Vector3(p.velocity[0], p.velocity[1], p.velocity[2])
      };
      v.health = p.health;
    }
  }

  _setupRemoteVehicle(v, id) {
    // Remove from physics world on client; interpolate from snapshots instead
    if (this.role === 'client' && this.world && v.chassisBody) {
      this.world.removeBody(v.chassisBody);
    }
    // Init interpolation state
    const pos = v.chassisBody.position;
    v._interpPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    v._interpQuat = new THREE.Quaternion(v.chassisBody.quaternion.x, v.chassisBody.quaternion.y, v.chassisBody.quaternion.z, v.chassisBody.quaternion.w);
    v._snapTarget = null;
  }

  sendInput() {
    if (this.role !== 'client') return;
    const keys = this.keys;
    const gp = this.getGamepad();
    this.net.sendData(JSON.stringify({ type: 'input',
      throttle: (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0),
      steer: (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0),
      brake: !!(keys['Space'] || (gp && gp.buttons[5]?.pressed)),
      jump: !!(keys['KeyJ'] || (gp && gp.buttons[0]?.pressed)),
      boost: !!(keys['KeyB'] || keys['ShiftLeft'] || (gp && gp.buttons[4]?.pressed))
    }));
  }

  togglePause() {
    this.isPaused = !this.isPaused;
  }

  loop() {
    if (!this._active) return;
    requestAnimationFrame(() => this.loop());
    if (this.isDisposed) return;

    let dt = this.clock.getDelta();
    const now = Date.now();

    if (this.isPaused) { this.renderer.render(this.scene, this.camera); return; }

    // Cap dt to prevent physics explosions
    dt = Math.min(dt, 0.1);

    // Death overlay
    const overlay = document.getElementById('death-overlay');
    const respawnText = document.getElementById('respawn-text');
    const localDead = this.localVehicle?.isDead;
    const localDying = this.localVehicle?.isDying;
    if (overlay) {
      if (localDead) {
        overlay.style.display = 'flex';
        if (respawnText) respawnText.innerText = `Respawning in ${Math.ceil(5 - this.deathCountdown)}...`;
      } else if (localDying) {
        overlay.style.display = 'flex';
        if (respawnText) respawnText.innerText = 'ENGINE FAILURE...';
      } else {
        overlay.style.display = 'none';
      }
    }

    // Role-specific simulation
    if (this.role === 'host') {
      this.hostTick(dt, now);
    } else {
      this.clientTick(dt, now);
    }

    // Shared systems (visual updates on both sides)
    this.updateCamera(dt);
    this.updateUI();
    this.renderer.render(this.scene, this.camera);
  }

  hostTick(dt, now) {
    // Process remote inputs
    for (const [id, v] of this.vehicles) {
      if (v.isDead) continue;
      if (id !== this.net.playerId) {
        const inputs = this.hostInputs.get(id);
        if (inputs) {
          v.throttle = inputs.throttle || 0;
          v.isBraking = !!inputs.brake;
          v.boostFactor = inputs.boost ? 2.0 : 1.0;
          v.steerDir = inputs.steer || 0;
          if (inputs.jump && v.isReadyToJump()) v.jump(8);
        }
      }
    }

    // Local vehicle input
    let isNitroActive = false;
    if (this.localVehicle && !this.localVehicle.isDead) {
      const input = this.updateInput(dt);
      isNitroActive = this.localVehicle.boostFactor > 1.1;

      const shootingPressed = !!(this.keys['Mouse0'] || this.keys['KeyF'] || (this.getGamepad() && this.getGamepad().buttons[2]?.pressed));
      if (shootingPressed) { if (!this.isFiring) { this.fireStartTime = Date.now(); this.isFiring = true; } this.fireBullet(); } else { this.isFiring = false; this.currentBPS = 0; }

      if (this.shieldActive) {
        this.shieldTimer -= dt;
        if (this.shieldTimer <= 0) { this.shieldActive = false; if (this.localVehicle.shieldMesh) this.localVehicle.shieldMesh.visible = false; }
      }

      if (!isNitroActive) { this.energy = Math.min(100, this.energy + 10 * dt); this.nitro = Math.min(100, this.nitro + 5 * dt); }

      this.localVehicle.update(dt, this.virtualHeading, input.steerDir, input.leanActive);
    }

    // Remote vehicle shield/nitro regen
    for (const [id, v] of this.vehicles) {
      if (v.isDead || id === this.net.playerId) continue;
      if (v.shieldActive) {
        v.shieldTimer -= dt;
        if (v.shieldTimer <= 0) { v.shieldActive = false; if (v.shieldMesh) v.shieldMesh.visible = false; }
      }
      if (!(v.boostFactor > 1.1)) { v.nitro = Math.min(100, (v.nitro || 100) + 5 * dt); v.energy = Math.min(100, (v.energy || 100) + 10 * dt); }
    }

    // Death countdown (local)
    if (this.localVehicle?.isDead) {
      this.deathCountdown += dt;
      if (this.deathCountdown >= 5.0) this.handleDeath();
    }

    // Dead vehicle updates
    for (const [id, v] of this.vehicles) {
      if (v.isDead) {
        v.update(dt, v === this.localVehicle ? this.virtualHeading : (v.aiHeading || 0), 0, false);
      }
    }

    // Apply inputs to all vehicles
    for (const [id, v] of this.vehicles) {
      if (v.isDead) continue;
      v.applyInputs(v.throttle || 0, v.isBraking);
      v.chassisBody.fixedRotation = true;
    }

    // Physics step
    this.world.step(1 / 60, dt, 3);

    // Update headings after physics
    for (const [id, v] of this.vehicles) {
      if (v.isDead) continue;
      const heading = Math.atan2(-v.chassisBody.velocity.x, -v.chassisBody.velocity.z);
      const steer = id === this.net.playerId ? 0 : (v.steerDir || 0);
      if (!isNaN(heading)) v.update(dt, heading, steer, false);
    }

    // Fall recovery
    for (const [id, v] of this.vehicles) {
      if (!v.isDead && v.chassisBody.position.y < -10) {
        v.chassisBody.position.set(v.chassisBody.position.x, 5, v.chassisBody.position.z);
        v.chassisBody.velocity.set(0, 5, 0);
        if (v === this.localVehicle) { /* reset lowrider state if needed */ }
      }
    }

    // Game systems
    this.checkCollisions();
    this.ults.update(dt);
    this.projectiles.update(now);
    this.barrels.update();
    this.pickups.update(now, this.cars(), (type, v) => this.handlePickup(type, v));
    this.handlePools(dt);

    // Ball mesh sync
    this.ballMesh.position.copy(this.ballBody.position);
    this.ballMesh.quaternion.copy(this.ballBody.quaternion);

    if (this.leanCooldown > 0) this.leanCooldown -= dt;
  }

  clientTick(dt, now) {
    this.sendInput();

    // Local vehicle input
    let isNitroActive = false;
    if (this.localVehicle && !this.localVehicle.isDead) {
      const input = this.updateInput(dt);
      isNitroActive = this.localVehicle.boostFactor > 1.1;

      const shootingPressed = !!(this.keys['Mouse0'] || this.keys['KeyF'] || (this.getGamepad() && this.getGamepad().buttons[2]?.pressed));
      if (shootingPressed) { if (!this.isFiring) { this.fireStartTime = Date.now(); this.isFiring = true; } this.fireBullet(); } else { this.isFiring = false; this.currentBPS = 0; }

      if (this.shieldActive) {
        this.shieldTimer -= dt;
        if (this.shieldTimer <= 0) { this.shieldActive = false; if (this.localVehicle.shieldMesh) this.localVehicle.shieldMesh.visible = false; }
      }

      if (!isNitroActive) { this.energy = Math.min(100, this.energy + 10 * dt); this.nitro = Math.min(100, this.nitro + 5 * dt); }

      this.localVehicle.update(dt, this.virtualHeading, input.steerDir, input.leanActive);
    }

    // Death countdown (local)
    if (this.localVehicle?.isDead) {
      this.deathCountdown += dt;
      if (this.deathCountdown >= 5.0) this.handleDeath();
    }

    // Dead vehicle updates
    for (const [id, v] of this.vehicles) {
      if (v.isDead) {
        v.update(dt, v === this.localVehicle ? this.virtualHeading : 0, 0, false);
      }
    }

    // Apply inputs to local vehicle only (remote vehicles removed from physics world on client)
    if (this.localVehicle && !this.localVehicle.isDead) {
      this.localVehicle.applyInputs(this.localVehicle.throttle || 0, this.localVehicle.isBraking);
      this.localVehicle.chassisBody.fixedRotation = true;
    }

    // Physics step (only local vehicle body in world on client)
    this.world.step(1 / 60, dt, 3);

    // Fall recovery (local only)
    if (this.localVehicle && !this.localVehicle.isDead && this.localVehicle.chassisBody.position.y < -10) {
      this.localVehicle.chassisBody.position.set(this.localVehicle.chassisBody.position.x, 5, this.localVehicle.chassisBody.position.z);
      this.localVehicle.chassisBody.velocity.set(0, 5, 0);
    }

    // Interpolate remote vehicles toward snapshot targets
    for (const [id, v] of this.vehicles) {
      if (v.isDead || id === this.net.playerId) continue;
      if (!v._interpPos) continue;
      if (v._snapTarget) {
        const lerpFactor = 1 - Math.exp(-12 * dt);
        v._interpPos.lerp(v._snapTarget.position, lerpFactor);
        v._interpQuat.slerp(v._snapTarget.quaternion, lerpFactor);
      }
    }

    // Recalculate heading from velocity (local only)
    if (this.localVehicle && !this.localVehicle.isDead) {
      const heading = Math.atan2(-this.localVehicle.chassisBody.velocity.x, -this.localVehicle.chassisBody.velocity.z);
      if (!isNaN(heading)) this.localVehicle.update(dt, heading, 0, false);
    }

    // Client-side game systems (visual/optional)
    this.ults.update(dt);
    this.projectiles.update(now);
    this.barrels.update();
    this.handlePools(dt);

    // Ball mesh sync
    this.ballMesh.position.copy(this.ballBody.position);
    this.ballMesh.quaternion.copy(this.ballBody.quaternion);

    if (this.leanCooldown > 0) this.leanCooldown -= dt;

    // Sync meshes
    for (const [id, v] of this.vehicles) {
      if (v.isDead) continue;
      if (id === this.net.playerId || !v._interpPos) {
        // Local vehicle or remote without interpolation: sync from physics body
        v.carMesh.position.copy(v.chassisBody.position);
        v.carMesh.position.y += 0.4;
        v.carMesh.quaternion.copy(v.chassisBody.quaternion);
      } else {
        // Remote vehicle: use interpolated position
        v.carMesh.position.copy(v._interpPos);
        v.carMesh.position.y += 0.4;
        v.carMesh.quaternion.copy(v._interpQuat);
      }
    }
  }

  checkCollisions(dt) {
    // Projectiles vs vehicles
    for (let i = this.projectiles.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles.projectiles[i];
      const pPos = p.mesh.position;
      let hit = false;
      for (const car of this.cars()) {
        if (car.isDead || p.source === car) continue;
        const localP = pPos.clone().sub(car.carMesh.position);
        localP.applyQuaternion(car.carMesh.quaternion.clone().invert());
        if (Math.abs(localP.x) < 1.1 && Math.abs(localP.y) < 1.2 && Math.abs(localP.z) < 3.6) {
          car.applyDamage(5);
          hit = true; break;
        }
      }
      if (hit) { this.scene.remove(p.mesh); this.projectiles.projectiles.splice(i, 1); continue; }
    }

    // Ult projectiles vs vehicles
    for (let i = this.ults.projectiles.length - 1; i >= 0; i--) {
      const p = this.ults.projectiles[i];
      const pPos = p.mesh.position;
      let hit = false;
      for (const car of this.cars()) {
        if (car.isDead || p.owner === car) continue;
        const localP = pPos.clone().sub(car.carMesh.position);
        localP.applyQuaternion(car.carMesh.quaternion.clone().invert());
        if (Math.abs(localP.x) < 1.1 && Math.abs(localP.y) < 1.2 && Math.abs(localP.z) < 3.6) {
          car.applyDamage(p.damage || 20);
          hit = true; break;
        }
      }
      if (hit) { this.scene.remove(p.mesh); this.ults.projectiles.splice(i, 1); continue; }
    }

    // Mines
    const now = Date.now();
    for (let i = this.projectiles.activeMines.length - 1; i >= 0; i--) {
      const m = this.projectiles.activeMines[i];
      if (now - m.spawnedAt < 3500) continue;
      const mPos = m.body.position;
      for (const car of this.cars()) {
        if (car.isDead) continue;
        if (mPos.distanceTo(car.chassisBody.position) < 5.0) {
          this.handleMineExplosion(i);
          break;
        }
      }
    }

    // Vehicle overlap with barrels
    this.cars().forEach(car => {
      if (car.isDead) return;
      const vPos = car.chassisBody.position;
      const speed = car.chassisBody.velocity.length();
      this.barrels.barrels.forEach(b => {
        if (b.isDead) return;
        if (vPos.distanceTo(b.body.position) < 4.0 && speed > 5) {
          this.barrels.applyDamage(b, speed, (brl) => this.handleBarrelExplosion(brl));
        }
      });
    });
  }

  handleMineExplosion(index) {
    const m = this.projectiles.activeMines[index];
    if (!m) return;
    const mPos = m.body.position;
    const radius = m.isSuper ? 12 : 6;
    const damageBase = m.isSuper ? 32 : 40;
    this.cars().forEach(car => {
      if (car.isDead) return;
      const dist = mPos.distanceTo(car.chassisBody.position);
      if (dist < radius) {
        const ratio = 1 - (dist / radius);
        const dir = car.chassisBody.position.vsub(mPos); dir.normalize();
        car.chassisBody.applyImpulse(dir.scale((m.isSuper ? 6000 : 3500) * ratio), new CANNON.Vec3());
        car.applyDamage(damageBase * ratio);
        car.fireTimer = 2.0;
      }
    });
    this.projectiles.explodeMine(index);
  }

  handleBarrelExplosion(b) {
    const bPos = b.body.position;
    this.cars().forEach(car => {
      if (car.isDead) return;
      const dist = car.chassisBody.position.distanceTo(bPos);
      if (dist < 8) {
        const dir = car.chassisBody.position.vsub(bPos); dir.normalize();
        car.chassisBody.applyImpulse(dir.scale(3000 * (1 - dist / 8)), new CANNON.Vec3());
        const dmg = (1 - dist / 8) * 40;
        car.applyDamage(dmg);
        car.fireTimer = 3.0;
      }
    });
  }

  updateCamera(dt) {
    const target = this.localVehicle || (this.vehicles.size > 0 ? this.vehicles.values().next().value : null);
    if (!target) return;
    const pos = target.getStableCenter();
    const camOffset = new THREE.Vector3(0, this.camHeight, this.camDist).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.virtualHeading));
    this.camera.position.set(pos.x + camOffset.x, pos.y + camOffset.y, pos.z + camOffset.z);
    this.camera.lookAt(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z));
  }

  updateUI() {
    const target = this.localVehicle;
    if (!target) return;

    const speedMPH = target.chassisBody.velocity.length() * 2.237;
    const speedValEl = document.getElementById('speed-val');
    if (speedValEl) speedValEl.innerText = speedMPH.toFixed(0);

    const boostBarEl = document.getElementById('boost-bar');
    if (boostBarEl) boostBarEl.style.width = `${this.nitro}%`;

    const energyBarEl = document.getElementById('energy-bar');
    if (energyBarEl) energyBarEl.style.width = `${this.energy}%`;

    const healthBarEl = document.getElementById('health-bar');
    if (healthBarEl) healthBarEl.style.width = `${target.health}%`;

    const mineAmmoEl = document.getElementById('mine-ammo');
    if (mineAmmoEl) mineAmmoEl.innerText = `MINES: ${this.mineAmmo} / 7`;

    const bpsEl = document.getElementById('bps-val');
    if (bpsEl) bpsEl.innerText = `BPS: ${this.currentBPS.toFixed(1)}`;

    const livesEl = document.getElementById('lives-display');
    if (livesEl) livesEl.innerText = `LIVES: ${this.lives}`;

    let status = `MODE: ${target.hoverMode ? 'FLIGHT' : 'GROUND'}`;
    if (this.isLeaningState) status = 'MODE: TWO-WHEELS';
    if (this.leanCooldown > 0 && !this.isLeaningState) status += ` (COOLDOWN: ${this.leanCooldown.toFixed(1)}s)`;
    const hoverStatusEl = document.getElementById('hover-status');
    if (hoverStatusEl) hoverStatusEl.innerText = status;
  }

  handlePools(dt) {
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pool = this.pools[i];
      pool.life -= dt;
      pool.mesh.material.opacity = Math.max(0, pool.life / 10) * 0.6;
      if (pool.life <= 0) { this.scene.remove(pool.mesh); this.pools.splice(i, 1); continue; }
      for (const [id, v] of this.vehicles) {
        if (v.isDead) continue;
        const dist = v.chassisBody.position.distanceTo(new CANNON.Vec3(pool.x, 0, pool.z));
        if (dist < 4) {
          if (pool.type === 'toxic' && v.toxicTimer <= 0) v.toxicTimer = 3;
          if (pool.type === 'oil') v.oilFactor = 0.3;
        } else {
          if (pool.type === 'oil') v.oilFactor = 1.0;
        }
        if (pool.type === 'quicksand' && v !== pool.owner) {
          const qDist = v.chassisBody.position.distanceTo(new CANNON.Vec3(pool.x, 0, pool.z));
          if (qDist < 6) v.slowTimer = 1.5;
        }
        if (pool.type === 'fire' && v !== pool.owner) {
          if (v.chassisBody.position.y > 4) continue;
          const dx = v.chassisBody.position.x - pool.x;
          const dz = v.chassisBody.position.z - pool.z;
          if (dx * dx + dz * dz < 9) v.fireTimer = 2;
        }
        if (pool.type === 'smoke' && v !== pool.owner) {
          const sDist = v.chassisBody.position.distanceTo(new CANNON.Vec3(pool.x, 0, pool.z));
          if (sDist < 4) v.slowTimer = 6;
        }
      }
    }
  }

  handleDeath() {
    this.lives--;
    if (this.lives <= 0) { this.showGameOver(); return; }
    const v = this.localVehicle;
    if (!v) return;
    v.health = 100;
    v.isDead = false;
    v.isDying = false;
    v.deathDelayTimer = 0;
    v.fireTimer = 0;
    v.slowTimer = 0;
    v.toxicTimer = 0;
    v.oilTimer = 0;
    v.slowFactor = 1.0;
    v.isFrozen = false;
    v.chassisBody.type = CANNON.Body.DYNAMIC;
    v.chassisBody.linearDamping = 0.1;
    v.chassisBody.angularDamping = 0.99;
    v.chassisBody.fixedRotation = true;
    v.chassisBody.updateMassProperties();
    v.chassisBody.quaternion.set(0, 0, 0, 1);
    v.chassisBody.angularVelocity.set(0, 0, 0);
    v.chassisBody.position.set(0, 5, 0);
    v.chassisBody.velocity.set(0, 0, 0);
    this.deathCountdown = 0;
    v.carMesh.traverse(c => { if (c.isMesh && c.userData.origMat) c.material = c.userData.origMat; });
    v.smokeParticles.forEach(p => this.scene.remove(p.mesh));
    v.smokeParticles = [];
    v.whiteSmokeParticles.forEach(p => this.scene.remove(p.mesh));
    v.whiteSmokeParticles = [];
  }

  showGameOver() {
    if (this.matchEnded) return;
    this.matchEnded = true;
    const overlay = document.getElementById('game-over-overlay');
    const label = document.getElementById('game-over-label');
    const statsEl = document.getElementById('game-over-stats');
    if (label) { label.textContent = 'GAME OVER'; label.style.color = '#f00'; label.style.textShadow = '0 0 30px #f00'; }
    if (statsEl) statsEl.innerHTML = `KILLS: <span style="color:#0f0;">${this.kills}</span>`;
    if (overlay) overlay.style.display = 'flex';
  }

  endMatch(reason) {
    if (this.matchEnded) return;
    this.matchEnded = true;
    this._active = false;

    const overlay = document.getElementById('game-over-overlay');
    const label = document.getElementById('game-over-label');
    const statsEl = document.getElementById('game-over-stats');

    if (label) {
      if (reason === 'won') { label.textContent = 'YOU WIN!'; label.style.color = '#0f0'; label.style.textShadow = '0 0 30px #0f0'; }
      else if (reason === 'lost') { label.textContent = 'GAME OVER'; label.style.color = '#f00'; label.style.textShadow = '0 0 30px #f00'; }
      else { label.textContent = 'MATCH ENDED'; label.style.color = '#fff'; label.style.textShadow = '0 0 30px #fff'; }
    }
    if (statsEl) {
      statsEl.innerHTML = `KILLS: <span style="color:#0f0;">${this.kills}</span>`;
    }
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }

  dispose() {
    this._active = false;
    this.isDisposed = true;
    this.unbindInput();
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    for (const [id] of this.vehicles) this.removeVehicle(id);
    this.vehicles.clear();
    this.localVehicle = null;
    this.hostInputs.clear();
    if (this.ults) this.ults.projectiles = [];
    if (this.projectiles) {
      this.projectiles.projectiles.forEach(p => this.scene.remove(p.mesh));
      this.projectiles.activeMines.forEach(m => { if (m.mesh) this.scene.remove(m.mesh); this.scene.remove(m.body); });
      this.projectiles.projectiles = [];
      this.projectiles.activeMines = [];
    }
    if (this.world) {
      while (this.world.bodies.length) this.world.removeBody(this.world.bodies[0]);
      this.world = null;
    }
    if (this.pickups) this.pickups.dispose && this.pickups.dispose();
    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
