import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArcadeVehicle } from './ArcadeVehicle.js';
import { Projectiles } from './Projectiles.js';
import { Barrels } from './Barrels.js';
import { AudioManager } from './AudioManager.js';
import { Ults } from './Ults.js';
import { Pickups } from './Pickups.js';
import { CityBasicMap } from '../maps/CityBasic.js';
import { DevMap } from '../maps/DevMap.js';
import { AIController2 } from './AIController2.js';
import { AI_PROFILES_2 } from './AIProfiles2.js';
import { CONFIG } from './Config.js';
import { WEAPON_TYPES } from './Weps.js';
import { BULLET_TYPES, UPGRADE_DEFS } from './StoryData.js';

const BallMap = {
    name: "Ball Proving Grounds",
    ball: true,
    grass: true,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_21-512x512.png',
    randomBoxes: 0,
    pickups: [
        { x: 180, z: 0, type: 'health' },
        { x: -180, z: 0, type: 'charge' },
        { x: 0, z: 180, type: 'energy' },
        { x: 0, z: -180, type: 'ammo' },
        { x: 127, z: 127, type: 'ult' },
        { x: -127, z: 127, type: 'missile' },
        { x: 127, z: -127, type: 'shotgun' },
        { x: -127, z: -127, type: 'turret' },
        { x: 240, z: 0, type: 'cannon' },
        { x: 0, z: 240, type: 'melee' },
        { x: -240, z: 0, type: 'mortar' },
        { x: 0, z: -240, type: 'c4' },
        { x: 160, z: -160, type: 'buff_hover' },
        { x: -160, z: 160, type: 'energywep' }
    ]
};

const DefaultPickups = [
    { x: 200, z: 0, type: 'health' },
    { x: -200, z: 0, type: 'charge' },
    { x: 0, z: 200, type: 'energy' },
    { x: 0, z: -200, type: 'ammo' },
    { x: 141, z: 141, type: 'ult' },
    { x: -141, z: 141, type: 'missile' },
    { x: 141, z: -141, type: 'shotgun' },
    { x: -141, z: -141, type: 'cannon' },
    { x: 260, z: 0, type: 'turret' },
    { x: 0, z: 260, type: 'melee' },
    { x: -260, z: 0, type: 'mortar' },
    { x: 0, z: -260, type: 'c4' },
    { x: 180, z: -180, type: 'buff_hover' },
    { x: -180, z: 180, type: 'energywep' }
];

const GreyhillsMap = {
    name: "Greyhills",
    grass: true,
    groundColor: 0x5d4037, // Dirt brown
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_10-512x512.png',
    pickups: DefaultPickups
};

const RiverbanksMap = {
    name: "Riverbanks",
    grass: true,
    groundColor: 0xd2b48c, // Sand tan
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_19-512x512.png',
    pickups: DefaultPickups
};

const DeportMap = {
    name: "Deport",
    grass: true,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_11-512x512.png',
    pickups: DefaultPickups
};

const RedBalloonsMap = {
    name: "Red Balloons",
    grass: true,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_06-512x512.png',
    pickups: DefaultPickups
};

const Area51Map = {
    name: "Area 51",
    grass: true,
    groundColor: 0xd2b48c, // Sandy tan
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_19-512x512.png',
    pickups: DefaultPickups
};

const AntarcticaMap = {
    name: "Antarctica",
    grass: true,
    groundColor: 0xffffff, // Snow white
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_04-512x512.png',
    pickups: DefaultPickups
};

const CanyonMap = {
    name: "Canyon",
    grass: true,
    groundColor: 0x8b4513, // Saddle brown
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_09-512x512.png',
    pickups: DefaultPickups
};

const PrisonMap = {
    name: "Prison",
    grass: true,
    groundColor: 0x808080, // Grey
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_01-512x512.png',
    pickups: DefaultPickups
};

const TrailerParkMap = {
    name: "Trailer Park",
    grass: true,
    groundColor: 0x1a4a1a, // Green
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_15-512x512.png',
    pickups: DefaultPickups
};

const CastleMap = {
    name: "Castle",
    grass: true,
    groundColor: 0x1a4a1a,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_16-512x512.png',
    pickups: DefaultPickups
};

const AirportMap = {
    name: "Airport",
    grass: true,
    groundColor: 0x444444,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_17-512x512.png',
    pickups: DefaultPickups,
    airport: true
};

const RaceDenMap = {
    name: "Underground Race Den",
    grass: true,
    groundColor: 0x111111,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_15-512x512.png',
    pickups: DefaultPickups
};

const DragTrackMap = {
    name: "Drag Race Track",
    grass: true,
    groundColor: 0x222222,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_21-512x512.png',
    pickups: DefaultPickups,
    drag: true
};

const NascarMap = {
    name: "Nascar Oval",
    grass: true,
    groundColor: 0x1a4a1a,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_21-512x512.png',
    pickups: DefaultPickups,
    nascar: true
};

const DriveInMap = {
    name: "Drive-In",
    grass: true,
    groundColor: 0x222222,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_15-512x512.png',
    pickups: DefaultPickups,
    drivein: true
};

const UnderwaterMap = {
    name: "Underwater City",
    grass: true,
    groundColor: 0x004488,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_11-512x512.png',
    pickups: DefaultPickups,
    underwater: true
};

const DishMap = {
    name: "Arecibo Dish",
    grass: true,
    groundColor: 0x1a4a1a,
    skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_10-512x512.png',
    pickups: DefaultPickups,
    dish: true
};

const GROUPS = {
    GROUND: 1,
    OBSTACLE: 2,
    BALL: 4,
    PLAYER: 8
};

export class ArcadeTestGame {
    constructor() {
        this.isDisposed = false;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        this.audio = new AudioManager();
        this.slickMat = new CANNON.Material('slick');
        
        this.weaponInventory = ['ult'];
        this.currentWeaponIndex = 0;
        this.selectedCarType = window.currentCar || '35-impala';
        
        const mapKey = window.currentMap || 'ball';
        if (mapKey === 'city') this.mapConfig = CityBasicMap;
        else if (mapKey === 'dev') this.mapConfig = DevMap;
        else if (mapKey === 'greyhills') this.mapConfig = GreyhillsMap;
        else if (mapKey === 'riverbanks') this.mapConfig = RiverbanksMap;
        else if (mapKey === 'deport') this.mapConfig = DeportMap;
        else if (mapKey === 'redballoons') this.mapConfig = RedBalloonsMap;
        else if (mapKey === 'area51') this.mapConfig = Area51Map;
        else if (mapKey === 'antarctica') this.mapConfig = AntarcticaMap;
        else if (mapKey === 'canyon') this.mapConfig = CanyonMap;
        else if (mapKey === 'prison') this.mapConfig = PrisonMap;
        else if (mapKey === 'trailerpark') this.mapConfig = TrailerParkMap;
        else if (mapKey === 'castle') this.mapConfig = CastleMap;
        else if (mapKey === 'airport') this.mapConfig = AirportMap;
        else if (mapKey === 'raceden') this.mapConfig = RaceDenMap;
        else if (mapKey === 'dragtrack') this.mapConfig = DragTrackMap;
        else if (mapKey === 'nascar') this.mapConfig = NascarMap;
        else if (mapKey === 'drivein') this.mapConfig = DriveInMap;
        else if (mapKey === 'underwater') this.mapConfig = UnderwaterMap;
        else if (mapKey === 'dish') this.mapConfig = DishMap;
        else this.mapConfig = BallMap;

        this.initPhysics();
        this.initGraphics();
        this.initMap();
        
        this.graphics = { scene: this.scene };
        this.physics = { world: this.world };
        
        this.ults = new Ults(this);
        this.pickups = new Pickups(this.scene, this.mapConfig.pickups);
        
        this.initInput();
        this.projectiles = new Projectiles(this.scene, this.world);
        this.barrels = new Barrels(this.scene, this.world, null, this.mapConfig.barrels);
        this.pools = [];
        const spawnAngle = Math.random() * Math.PI * 2;
        this.vehicle = new ArcadeVehicle(this.scene, this.world, {
            position: new CANNON.Vec3(Math.cos(spawnAngle) * 15, 5, Math.sin(spawnAngle) * 15),
            collisionFilterGroup: GROUPS.PLAYER,
            collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER, 
            material: this.slickMat,
            carType: this.selectedCarType
        });
        
        this.player = this.vehicle;
        this.cars = [this.player];
        this.aiControllers = [];
        this.arenaHalfSize = 400;

        this.difficulty = window.aiDifficulty || 'none';
        const aiCount = Math.min(10, Math.max(0, parseInt(window.aiCount) || 0));
        if (this.difficulty !== 'none' && aiCount > 0) {
            for (let i = 0; i < aiCount; i++) this.spawnAICar();
        }

        this.ults.initVehicleUlt(this.vehicle);
        this.ults.addAmmo(this.vehicle, 3, 'ult');

        this.energy = 100;
        this.nitro = 100;
        this.mineAmmo = 7;
        this.currentGear = 0;
        this.lastJumpTime = 0;
        this.lastDriftPressTime = 0;
        this.isLeaningState = false;
        this.currentLeanSide = 0; 
        this.leanCooldown = 0; 
        this.driftToggled = false;
        this.virtualHeading = 0; 
        this.camDist = 12;
        this.camHeight = 5;
        this.lookAtTarget = new THREE.Vector3();

        // Scratch objects (zero-allocation hot paths)
        this._v3 = new THREE.Vector3();
        this._v3b = new THREE.Vector3();
        this._q = new THREE.Quaternion();
        this._q2 = new THREE.Quaternion();
        
        this.lastFireTime = 0;
        this.fireStartTime = 0;
        this.isFiring = false;
        this.currentBPS = 0;
        this.deathCountdown = 0;
        this.zeroSpeedTimer = 0; // Track time spent at zero speed for 2-wheel cancel

        // Combat Timers
        this.lastMineTime = 0;
        this.mineCooldown = 3000;
        this.shieldActive = false;
        this.shieldTimer = 0;

        this.pauseMenuEl = document.getElementById('pause-menu');
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        if (this.gameOverOverlay) this.gameOverOverlay.style.display = 'none';
        const deathOverlay = document.getElementById('death-overlay');
        if (deathOverlay) deathOverlay.style.display = 'none';
        if (window.applySharedAudioSettingsToGame) window.applySharedAudioSettingsToGame();
        
        // Match Stats
        this.lives = 3;
        this.kills = 0;
        this.startTime = Date.now();
        this.matchEnded = false;

        // Shared Pool Resources
        this.poolGeo = new THREE.CircleGeometry(4, 16);
        this.poolMats = {
            toxic: new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6, shininess: 100 }),
            oil: new THREE.MeshPhongMaterial({ color: 0x111111, transparent: true, opacity: 0.6, shininess: 100 }),
            fire: new THREE.MeshPhongMaterial({ color: 0xff4400, transparent: true, opacity: 0.7, emissive: 0xff2200, emissiveIntensity: 0.5 })
        };

        this.updateWeaponUI();
        // Force init + warmup render (no lazy loading during gameplay)
        if (this.audio) this.audio.init();
        this._warmupFrames = 8;
        this.animate();
    }

    spawnAICar() {
        const carKeys = ['beachbug', 'foodtruck', 'beachpartyvan', 'hovercar', 'rover', 'rv', 'sidecarbike', 'ratrod', 'amrtruck', 'sprintracer', 'bladecybercar', '12-servervan', 'aicop', 'policecar', 'grappler', 'f2', 'rally', 'livsuper', 'bowcar', 'muscle', 'willys', 'mini', 'sportssuper', 'van', 'rougeai', 'scorp', 'nado', '4door', '61lowrider', 'tourbus', 'forklift', 'flagtruck', 'mixer', 'miramar', 'democharger', 'semi', 'voidbike', 'voidcar', 'tractor', 'oldrace', 'spycar', 'redrum', 'planecar', 'humher', 'schoolbus', 'yellowelstang', 'rocketcar', 'wolfstreet', 'bumsboss', 'z2-ufo', 'ratsboss', 'hackerboss', 'policeboss', 'jammonsterboss', 'junkboss', 'cuteboss', 'finaltank', 'bigboss', 'cranetruck', 'demoboss', 'voidboss', 'radioboss', 'armyboss', 'prostreetboss', '35-impala'];
        const randomType = carKeys[Math.floor(Math.random() * carKeys.length)];

        const aiAngle = (Math.PI * 2 * this.aiControllers.length) / 8;
        const aiRadius = 40 + this.aiControllers.length * 15;
        const aiCar = new ArcadeVehicle(this.scene, this.world, {
            position: new CANNON.Vec3(
                Math.cos(aiAngle) * aiRadius,
                5,
                Math.sin(aiAngle) * aiRadius
            ),
            collisionFilterGroup: GROUPS.PLAYER,
            collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER,
            material: this.slickMat,
            carType: randomType
        });
        aiCar.aiHeading = 0;
        aiCar.energy = 100;
        aiCar.nitro = 100;
        aiCar.shieldActive = false;
        aiCar.shieldTimer = 0;
        aiCar.isLeaningState = false;
        aiCar.currentLeanSide = 0;
        aiCar.zeroSpeedTimer = 0;
        aiCar.mineAmmo = 7;

        const loadouts = [
            { ammo: { 'ult': 10, 'missile': 40, 'turret': 200 }, weapons: ['ult', 'missile', 'turret'] },
            { ammo: { 'ult': 8, 'shotgun': 16, 'missile': 20 }, weapons: ['ult', 'shotgun', 'missile'] },
            { ammo: { 'ult': 6, 'cannon': 12, 'energy': 30 }, weapons: ['ult', 'cannon', 'energy'] },
            { ammo: { 'ult': 12, 'missile': 30, 'melee': 50 }, weapons: ['ult', 'missile', 'melee'] },
            { ammo: { 'ult': 10, 'turret': 150, 'shotgun': 12 }, weapons: ['ult', 'turret', 'shotgun'] }
        ];
        const loadout = loadouts[Math.floor(Math.random() * loadouts.length)];
        aiCar.ammo = { ...loadout.ammo };
        aiCar.weaponInventory = [...loadout.weapons];

        this.ults.initVehicleUlt(aiCar);
        this.ults.addAmmo(aiCar, 5, 'ult');

        this.cars.push(aiCar);
        const profile = { ...AI_PROFILES_2[Math.floor(Math.random() * AI_PROFILES_2.length)] };
        // Difficulty scaling
        if (this.difficulty === 'easy') {
            profile.aggression *= 0.7; profile.aimThreshold *= 1.1; profile.fireCooldownScale *= 1.15;
            profile.dodge *= 0.6; profile.wallFear *= 1.2;
        } else if (this.difficulty === 'hard') {
            profile.aggression *= 1.35; profile.aimThreshold *= 0.9; profile.fireCooldownScale *= 0.8;
            profile.dodge *= 1.3; profile.preferredRange *= 0.85; profile.wallFear *= 0.8;
        }
        const aiController = new AIController2(this, aiCar, profile, profile.color);
        this.aiControllers.push(aiController);
    }

    applyVehicleControlsAI(vehicle, throttle, steerVal, brakeForce, isBoosting = false, steerOverride = null) {
        if (vehicle.isDead) return;
        vehicle.applyInputs(throttle, brakeForce > 5);
        vehicle.boostFactor = isBoosting ? 2.0 : 1.0;
        if (vehicle !== this.player) {
            const dt = 1/60;
            if (vehicle.aiHeading === undefined) vehicle.aiHeading = 0;
            vehicle.aiHeading += steerVal * 2.5 * dt;
            if (isBoosting && vehicle.nitro > 5) {
                vehicle.nitro = Math.max(0, vehicle.nitro - 25 * dt);
            }
        }
    }

    rotateWeapon(dir) {
        this.currentWeaponIndex = (this.currentWeaponIndex + dir + this.weaponInventory.length) % this.weaponInventory.length;
        this.updateWeaponUI();
    }

    handlePickup(type, vehicle = this.vehicle) {
        if (type === 'health') {
            vehicle.health = Math.min(100, vehicle.health + 25);
        } else if (type === 'charge' || type === 'energy') {
            if (vehicle === this.vehicle) this.energy = Math.min(100, this.energy + 50);
            else if (vehicle.energy !== undefined) vehicle.energy = Math.min(100, vehicle.energy + 50);
        } else if (type === 'ammo') {
            const pool = ['ult', 'ult', 'missile', 'shotgun', 'cannon', 'turret', 'energy', 'melee', 'mortar', 'c4'];
            const randWep = pool[Math.floor(Math.random() * pool.length)];
            const inventory = vehicle.weaponInventory || this.weaponInventory;
            if (!inventory.includes(randWep) && randWep !== 'ult') inventory.push(randWep);
            this.ults.addAmmo(vehicle, 5, randWep);
            if (vehicle === this.vehicle && randWep !== 'ult') this.currentWeaponIndex = inventory.indexOf(randWep);
        } else if (type === 'ult') {
            this.ults.addAmmo(vehicle, 1, 'ult');
        } else if (type === 'energywep') {
            const inventory = vehicle.weaponInventory || this.weaponInventory;
            if (!inventory.includes('energy')) inventory.push('energy');
            this.ults.addAmmo(vehicle, 20, 'energy');
            if (vehicle === this.vehicle) this.currentWeaponIndex = inventory.indexOf('energy');
        } else if (WEAPON_TYPES[type]) {
            const inventory = vehicle.weaponInventory || this.weaponInventory;
            if (!inventory.includes(type)) inventory.push(type);
            this.ults.addAmmo(vehicle, 5, type);
            if (vehicle === this.vehicle) this.currentWeaponIndex = inventory.indexOf(type);
        } else if (type === 'buff_hover' || type === 'hover') {
            vehicle.hoverMode = true;
        }
        if (vehicle === this.vehicle) this.updateWeaponUI();
    }

    updateWeaponUI() {
        const type = this.weaponInventory[this.currentWeaponIndex];
        const state = this.ults.activeUlts.get(this.vehicle);
        if (!state) return;
        const wState = state.weapons.get(type);
        const nameEl = document.getElementById('wep-name');
        const ammoEl = document.getElementById('wep-ammo');
        if (nameEl) nameEl.innerText = type === 'ult' ? 'ULTIMATE' : type.toUpperCase();
        if (ammoEl) ammoEl.innerText = wState ? `AMMO: ${wState.ammo}` : 'AMMO: 0';
    }

    fireWeapon() {
        const type = this.weaponInventory[this.currentWeaponIndex];
        if (type === 'ult') this.performCarUlt();
        else {
            const gp = this.getGamepad();
            const backfire = this.keys['KeyS'] || this.keys['ArrowDown'] || (gp && gp.axes[1] > 0.5);
            this.ults.fire(this.vehicle, backfire);
        }
        this.updateWeaponUI();
    }

    fireMine() {
        const now = Date.now();
        if (now - this.lastMineTime < this.mineCooldown || this.mineAmmo <= 0) return;
        
        const combo = this.input.inputBuffer.join('-');
        const isSuper = (combo === 'up-up-down' && (now - this.input.lastInputTime < 2000) && this.energy >= 30);
        
        if (isSuper) {
            this.energy -= 30;
            this.input.inputBuffer = [];
        }
        
        this.lastMineTime = now;
        this.mineAmmo--;
        
        const yaw = this.vehicle.carMesh.rotation.y;
        const backward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        this.projectiles.dropMine(this.vehicle.chassisBody.position, backward, 'standard', this.vehicle, isSuper);
    }
    
    performCarUlt() {
        this.ults.performCarUlt(this.vehicle);
        this.updateWeaponUI();
    }
    
    togglePause() {
        this.isPaused = !this.isPaused; 
        if (this.pauseMenuEl) {
            this.pauseMenuEl.style.display = this.isPaused ? 'flex' : 'none';
            // Always show main nav when menu opens
            if (this.isPaused) {
                this.showPanel('none');
                this.updatePauseSongName();
            }
        }
        if (window.updateVisibleSunStates) window.updateVisibleSunStates();
    }

    showPanel(id) {
        document.querySelectorAll('.pause-panel').forEach(p => p.style.display = 'none');
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('selected'));
        
        const container = document.querySelector('.pause-panel-container');

        if (id === 'none') {
            if (container) container.style.display = 'none';
            return;
        }

        const target = document.getElementById(`${id}-panel`);
        if (target) {
            if (container) container.style.display = 'flex';
            target.style.display = 'block';
        }
        
        const mi = document.getElementById(`mi-${id}`);
        if (mi) mi.classList.add('selected');
    }

    updatePauseSongName() {
        if (!this.audio) return;
        const trackName = this.audio.queue[this.audio.queueIdx] || 'NONE';
        const cleanName = trackName.replace('.mp3', '').replace('.ogg', '').replace('.wav', '').toUpperCase();
        if (window.updateSharedTrackName) window.updateSharedTrackName(cleanName);
    }

    dispose() {
        this.isDisposed = true; if (this.audio) this.audio.dispose();
        if (this.scene) {
            this.scene.traverse(obj => {
                if (obj.isMesh) {
                    obj.geometry?.dispose();
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material?.dispose();
                }
            });
        }
        this.renderer = null;
        this.scene = null;
    }

    initPhysics() {
        this.world = new CANNON.World(); this.world.gravity.set(0, -9.82, 0); 
        this.world.solver.iterations = 5;
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.slickMat, this.slickMat, { friction: 0.0, restitution: 0.0 }));
        const groundBody = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat });
        groundBody.addShape(new CANNON.Plane()); groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); this.world.addBody(groundBody);
    }

    initGraphics() {
        this.scene = new THREE.Scene(); 
        this.scene.background = new THREE.Color(0x111118);
        
        // Load Panoramic Skybox from mapConfig
        const skyboxPath = this.mapConfig.skybox;
        if (skyboxPath) {
            const loader = new THREE.TextureLoader();
            loader.load(skyboxPath, (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.colorSpace = THREE.SRGBColorSpace;
                this.scene.background = texture;
                this.scene.environment = texture;
            });

            if (this.mapConfig.grass) {
                // Ground Floor
                const grassGeo = new THREE.PlaneGeometry(2000, 2000);
                const color = this.mapConfig.groundColor || 0x1a4a1a;
                const grassMat = new THREE.MeshPhongMaterial({ color: color });
                const grass = new THREE.Mesh(grassGeo, grassMat);
                grass.rotation.x = -Math.PI / 2;
                grass.position.y = 0.01;
                this.scene.add(grass);
            }
        } else {
            this.scene.add(new THREE.GridHelper(1000, 50, 0x444444, 0x222222));
        }

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        if (!window._sharedRenderer) {
            window._sharedRenderer = new THREE.WebGLRenderer({ antialias: true });
            window._sharedRenderer.setSize(window.innerWidth, window.innerHeight);
        }
        this.renderer = window._sharedRenderer;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const container = document.getElementById('game-layer') || document.body; container.appendChild(this.renderer.domElement);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1); sun.position.set(50, 100, 50); this.scene.add(sun);
    }

    initMap() {
        const config = this.mapConfig;
        
        // Random Boxes (The "Ball" map logic)
        if (config.randomBoxes) {
            for (let i = 0; i < config.randomBoxes; i++) {
                const w = 5+Math.random()*15, h = 2+Math.random()*20, d = 5+Math.random()*15;
                const px = (Math.random()-0.5)*600, pz = (Math.random()-0.5)*600;
                if (Math.abs(px) < 20 && Math.abs(pz) < 20) continue; 
                this.addBuilding(px, h/2, pz, w, h, d, 0x00ffff);
            }
        }

        // Goals for Ball Map
        if (config.ball) {
            const createGoal = (z, color) => {
                const goalWidth = 40, goalHeight = 15, postThickness = 2;
                const mat = new THREE.MeshPhongMaterial({ color: color });
                
                // Left Post
                const lpMesh = new THREE.Mesh(new THREE.BoxGeometry(postThickness, goalHeight, postThickness), mat);
                lpMesh.position.set(-goalWidth/2, goalHeight/2, z); this.scene.add(lpMesh);
                const lpBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(-goalWidth/2, goalHeight/2, z) });
                lpBody.addShape(new CANNON.Box(new CANNON.Vec3(postThickness/2, goalHeight/2, postThickness/2))); this.world.addBody(lpBody);
                
                // Right Post
                const rpMesh = new THREE.Mesh(new THREE.BoxGeometry(postThickness, goalHeight, postThickness), mat);
                rpMesh.position.set(goalWidth/2, goalHeight/2, z); this.scene.add(rpMesh);
                const rpBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(goalWidth/2, goalHeight/2, z) });
                rpBody.addShape(new CANNON.Box(new CANNON.Vec3(postThickness/2, goalHeight/2, postThickness/2))); this.world.addBody(rpBody);
                
                // Crossbar
                const cbMesh = new THREE.Mesh(new THREE.BoxGeometry(goalWidth + postThickness, postThickness, postThickness), mat);
                cbMesh.position.set(0, goalHeight, z); this.scene.add(cbMesh);
                const cbBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(0, goalHeight, z) });
                cbBody.addShape(new CANNON.Box(new CANNON.Vec3((goalWidth + postThickness)/2, postThickness/2, postThickness/2))); this.world.addBody(cbBody);
            };
            createGoal(250, 0x00aaff); // Blue team goal
            createGoal(-250, 0xffaa00); // Orange team goal
        }

        // Static Buildings
        if (config.buildings) {
            config.buildings.forEach(b => {
                this.addBuilding(b.position.x, b.position.y, b.position.z, b.size.x, b.size.y, b.size.z, b.color);
            });
        }

        // Airport Logic
        if (config.airport) {
            // Y-Runway
            this.addAsphaltStrip(0, 0, 1000, 60, 0); 
            this.addAsphaltStrip(150, 300, 500, 60, Math.PI/4);
            this.addAsphaltStrip(-150, 300, 500, 60, -Math.PI/4);
            // Garages
            this.addBuilding(-250, 20, 0, 100, 40, 150, 0x555555);
            this.addBuilding(250, 20, 0, 100, 40, 150, 0x555555);
        }

        // Drag Track Logic
        if (config.drag) {
            this.addAsphaltStrip(-35, 0, 3000, 50, 0);
            this.addAsphaltStrip(35, 0, 3000, 50, 0);
        }

        // Nascar Oval Logic
        if (config.nascar) {
            const trackWidth = 80, trackLength = 1000, trackRadius = 400;
            // Straights
            this.addAsphaltStrip(trackRadius, 0, trackLength, trackWidth, 0);
            this.addAsphaltStrip(-trackRadius, 0, trackLength, trackWidth, 0);
            // Approximate Turns with Banked Ramps
            for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI;
                const turnX = Math.cos(angle) * trackRadius;
                const turnZ = 500 + Math.sin(angle) * 200;
                this.addRamp(turnX, 5, turnZ, 80, 10, 100, 0, angle + Math.PI/2, 0.2);
                this.addRamp(-turnX, 5, -turnZ, 80, 10, 100, 0, angle - Math.PI/2, 0.2);
            }
        }

        // Drive-In Logic
        if (config.drivein) {
            this.addBuilding(0, 50, -350, 180, 100, 15, 0x111111);
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshBasicMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 }));
            screen.position.set(0, 55, -342); this.scene.add(screen);
        }

        // Underwater City Logic
        if (config.underwater) {
            const domeGeo = new THREE.SphereGeometry(450, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
            const domeMat = new THREE.MeshPhongMaterial({ color: 0x00aaff, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
            const dome = new THREE.Mesh(domeGeo, domeMat); this.scene.add(dome);
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const light = new THREE.PointLight(new THREE.Color().setHSL(i/12, 1, 0.5), 20, 150);
                light.position.set(Math.cos(angle)*420, 15, Math.sin(angle)*420); this.scene.add(light);
            }
        }

        // Arecibo Dish Logic
        if (config.dish) {
            const dishGeo = new THREE.SphereGeometry(800, 32, 16, 0, Math.PI*2, Math.PI/2, Math.PI/2);
            const dishMat = new THREE.MeshPhongMaterial({ color: 0x999999, side: THREE.DoubleSide });
            const dish = new THREE.Mesh(dishGeo, dishMat); dish.position.y = 750; this.scene.add(dish);
        }

        // Ramps
        if (config.ramps) {
            config.ramps.forEach(r => {
                this.addRamp(r.x, r.y, r.z, r.w, r.h, r.d, r.rotX, r.rotY, r.rotZ);
            });
        }

        // Ball
        if (config.ball) {
            this.ballBody = new CANNON.Body({ mass: 50, shape: new CANNON.Sphere(4), position: new CANNON.Vec3(0, 10, -50), collisionFilterGroup: GROUPS.BALL, material: this.slickMat });
            this.world.addBody(this.ballBody);
            this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3 }));
            this.scene.add(this.ballMesh);
        } else {
            this.ballBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(0, -1000, 0) });
            this.ballMesh = new THREE.Mesh();
        }
    }

    addBuilding(x, y, z, w, h, d, color = 0x444444) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: color || 0x444444 }));
        mesh.position.set(x, y, z); this.scene.add(mesh);
        const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.OBSTACLE, material: this.slickMat, position: new CANNON.Vec3(x, y, z) });
        body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2))); this.world.addBody(body);
        return { mesh, body };
    }

    addRamp(x, y, z, w, h, d, rotX, rotY, rotZ) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: 0x666666 }));
        mesh.position.set(x, y, z); 
        if (rotX) mesh.rotation.x = rotX; if (rotY) mesh.rotation.y = rotY; if (rotZ) mesh.rotation.z = rotZ;
        this.scene.add(mesh);
        const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat, position: new CANNON.Vec3(x, y, z) });
        body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2))); 
        if (rotX || rotY || rotZ) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX||0, rotY||0, rotZ||0));
            body.quaternion.set(q.x, q.y, q.z, q.w);
        }
        this.world.addBody(body);
        return { mesh, body };
    }

    addAsphaltStrip(x, z, length, width, rotation = 0) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, length), new THREE.MeshPhongMaterial({ color: 0x222222 }));
        mesh.position.set(x, 0.1, z); mesh.rotation.y = rotation; this.scene.add(mesh);
        const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat, position: new CANNON.Vec3(x, 0.05, z) });
        body.addShape(new CANNON.Box(new CANNON.Vec3(width/2, 0.1, length/2)));
        if (rotation !== 0) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
        this.world.addBody(body);
    }

    initInput() {
        this.keys = {}; this.gearStickReset = true; this.dpadReset = true;
        this.dpadUpReset = true; this.dpadDownReset = true;
        this._keydownRef = (e) => {
            if (e.repeat) return;
            this.keys[e.code] = true;
            if (e.code === 'KeyJ' && Date.now() - this.lastJumpTime > 2000) this.handleJump();
            if (e.code === 'BracketRight' || e.code === 'ArrowUp' || e.code === 'KeyW') { 
                if (e.code === 'BracketRight') this.currentGear = Math.min(5, this.currentGear + 1); 
                this.input.pushCombo('up'); 
            }
            if (e.code === 'BracketLeft' || e.code === 'ArrowDown' || e.code === 'KeyS') { 
                if (e.code === 'BracketLeft') this.currentGear = Math.max(0, this.currentGear - 1); 
                this.input.pushCombo('down'); 
            }
            if (e.code === 'Escape') this.togglePause();
            if (e.code === 'KeyQ') this.fireWeapon(); // SQUARE - FIRE SELECTED
            if (e.code === 'KeyE') this.fireMine(); // CIRCLE - MINE
            if (e.code === 'KeyY') this.toggleShield(true); // TRIANGLE - SHIELD
        };
        this._keyupRef = (e) => {
            this.keys[e.code] = false;
            if (e.code === 'KeyY') this.toggleShield(false);
        };
        this._mousedownRef = (e) => { if (e.button === 0) this.keys['Mouse0'] = true; };
        this._mouseupRef = (e) => { if (e.button === 0) this.keys['Mouse0'] = false; };
        this._wheelRef = (e) => { if (e.deltaY > 0) this.rotateWeapon(1); else this.rotateWeapon(-1); };

        window.addEventListener('keydown', this._keydownRef); window.addEventListener('keyup', this._keyupRef);
        window.addEventListener('mousedown', this._mousedownRef); window.addEventListener('mouseup', this._mouseupRef);
        window.addEventListener('wheel', this._wheelRef);

        this.input = { inputBuffer: [], lastInputTime: 0, pushCombo(dir) { this.inputBuffer.push(dir); if (this.inputBuffer.length > 3) this.inputBuffer.shift(); this.lastInputTime = Date.now(); } };
        this._l3Prev = false;
    }

    getGamepad() { return Array.from(navigator.getGamepads()).find(g => g !== null); }

    handleJump() {
        if (this.isLeaningState || !this.vehicle.isReadyToJump()) return; 
        const now = Date.now(); 
        const combo = this.input.inputBuffer.join('-');
        const isSuperCombo = (combo === 'down-down-up' && (now - this.input.lastInputTime < 2000));
        
        const gp = this.getGamepad();
        const rsUp = gp ? gp.axes[3] < -0.7 : false;
        const l3Held = gp ? gp.buttons[10]?.pressed : false;
        
        // HYPER JUMP: combo + hydraulics + r3
        if (isSuperCombo && l3Held && rsUp && this.energy >= 80) {
            this.vehicle.jump(65); // Massive jump
            this.energy = 0; // Consumes ALL energy
            this.input.inputBuffer = [];
            this.lastJumpTime = now;
            return;
        }
        
        // HYDRAULIC SUPER JUMP: hydraulics + r3
        const isHydraulicSuper = l3Held && rsUp && this.energy >= 40;
        const isSuper = (isSuperCombo && this.energy >= 40) || isHydraulicSuper;
        
        if (isSuper && this.energy >= 40) {
            let jumpPower = 36;
            this.energy -= 40;
            this.input.inputBuffer = [];
            this.vehicle.jump(jumpPower);
            this.lastJumpTime = now;
        } else {
            this.vehicle.jump(24);
            this.lastJumpTime = now;
        }
    }

    toggleShield(active) {
        if (active) {
            if (this.shieldActive) return; // Already on
            if (this.energy > 5) {
                this.shieldActive = true;
                this.shieldTimer = 4.0; // Lasts 4 seconds
                this.energy = 0; // Consumes ALL energy
                if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = true;
            }
        } else {
            // Note: Shield now stays on until timer runs out
        }
    }

    animate() {
        if (this.isDisposed) return; requestAnimationFrame(() => this.animate());
        
        if (this._warmupFrames > 0) {
            this.world.step(1/60, 1/60, 3);
            const steer = this._warmupFrames % 2 === 0 ? 1 : -1;
            this.vehicle.update(1/60, 0, steer, false);
            // Prime barrels on first warmup frame
            if (this._warmupFrames === 8 && this.barrels.models.oil) {
                for (const type of ['explosive', 'toxic', 'oil', 'cryo']) {
                    const b = this.barrels.spawnBarrel(0, -1000, type);
                    if (b) this.barrels.applyDamage(b, 999, (brl) => {});
                }
            }
            this.renderer.render(this.scene, this.camera);
            this._warmupFrames--;
            return;
        }
        
        let dt = this.clock.getDelta(); 
        const now = Date.now();
        const overlay = document.getElementById('death-overlay'); const respawnText = document.getElementById('respawn-text');
        
        if (this.isPaused) { this.renderer.render(this.scene, this.camera); return; }

        // CAP DT TO PREVENT AFK BUGS (Logic jumps)
        dt = Math.min(dt, 0.1);

        // STEP PHYSICS
        this.world.step(1/60, dt, 3);

        // UI Overlay State
        if (overlay) {
            if (this.vehicle.isDead) {
                overlay.style.display = 'flex';
                if (respawnText) respawnText.innerText = `Respawning in ${Math.ceil(5 - this.deathCountdown)}...`;
            } else if (this.vehicle.isDying) {
                overlay.style.display = 'flex';
                if (respawnText) respawnText.innerText = "ENGINE FAILURE...";
            } else {
                overlay.style.display = 'none';
            }
        }

        // CAR LOGIC
        let isNitroActive = false;
        this.cars.forEach(car => {
            if (car.isDead) {
                if (car === this.vehicle) {
                    this.deathCountdown += dt;
                    if (this.deathCountdown >= 5.0) this.handleDeath();
                }
                car.update(dt, car === this.vehicle ? this.virtualHeading : (car.aiHeading || 0), 0, false);
                return;
            }

            if (car === this.vehicle) {
                const input = this.updateInput(dt);
                isNitroActive = this.vehicle.boostFactor > 1.1;

                // SHIELD TIMER
                if (this.shieldActive) {
                    this.shieldTimer -= dt;
                    if (this.shieldTimer <= 0) {
                        this.shieldActive = false;
                        if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = false;
                    }
                }

                // ENERGY REGEN (Stopped during Nitro)
                if (!isNitroActive) {
                    this.energy = Math.min(100, this.energy + 10 * dt);
                }

                // NITRO REGEN
                if (!isNitroActive) {
                    this.nitro = Math.min(100, this.nitro + 5 * dt);
                }

                if (this.audio && this.audio.initialized) {
                    this.audio.update({ speed: this.vehicle.chassisBody.velocity.length()*3.6, throttle: (this.keys['KeyW']||this.keys['ArrowUp']?1:0)-(this.keys['KeyS']||this.keys['ArrowDown']?1:0), boost: isNitroActive?100:0, steerVal: input.steerDir, isHandbrake: this.keys['Space']||false });
                }
                this.vehicle.update(dt, this.virtualHeading, input.steerDir, input.leanActive);
            }
        });

        // Update AI Controllers
        this.aiControllers.forEach(ai => {
            const v = ai.vehicle;
            if (!v.isDead) {
                if (v.shieldActive) {
                    v.shieldTimer -= dt;
                    if (v.shieldTimer <= 0) {
                        v.shieldActive = false;
                        if (v.shieldMesh) v.shieldMesh.visible = false;
                    }
                }
                if (!(ai.controls.boost && v.nitro > 5)) {
                    v.nitro = Math.min(100, v.nitro + 5 * dt);
                    v.energy = Math.min(100, v.energy + 10 * dt);
                }
                ai.update(dt);
                const lean = ai.controls.leanActive || false;
                v.update(dt, v.aiHeading || 0, ai.controls.steer, lean);
            }
        });

        this.cars.forEach(car => {
            if (!car.isDead) {
                if (car.chassisBody.position.y < -10) { car.chassisBody.position.set(car.chassisBody.position.x, 5, car.chassisBody.position.z); car.chassisBody.velocity.set(0, 5, 0); if (car === this.vehicle) { const s = this.ults.activeUlts.get(this.vehicle); if (s) s.lowriderSlamState = false; } }
            }
        });

        this.checkCollisions(); 

        // WORLD SYSTEMS (Always update)
        this.ults.update(dt);
        this.projectiles.update(now); 
        this.barrels.update(); 
        this.pickups.update(now, this.cars, (type, v) => this.handlePickup(type, v)); 

        this.handlePools(dt);
        
        if (!this.matchEnded && this.aiControllers.length > 0) {
            const allAiDead = this.aiControllers.every(ai => ai.vehicle.isDead);
            if (allAiDead && !this.vehicle.isDead) {
                this.showMatchWon();
            }
        }
        
        this.ballMesh.position.copy(this.ballBody.position); 
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);
        
        if (this.leanCooldown > 0) this.leanCooldown -= dt;
        this.updateCamera(dt); this.updateUI(); this.renderer.render(this.scene, this.camera);
    }

    handleDeath() {
        this.lives--;
        if (this.lives <= 0) {
            this.showGameOver();
            return;
        }

        this.vehicle.health = 100; this.vehicle.isDead = false; this.vehicle.isDying = false; this.vehicle.deathDelayTimer = 0;
        this.vehicle.fireTimer = 0; this.vehicle.slowTimer = 0; this.vehicle.toxicTimer = 0; this.vehicle.oilTimer = 0;
        this.vehicle.slowFactor = 1.0; this.vehicle.isFrozen = false;
        
        this.vehicle.chassisBody.type = CANNON.Body.DYNAMIC;
        this.vehicle.chassisBody.linearDamping = 0.1;
        this.vehicle.chassisBody.angularDamping = 0.99;
        
        this.vehicle.chassisBody.fixedRotation = true; this.vehicle.chassisBody.updateMassProperties(); this.vehicle.chassisBody.quaternion.set(0, 0, 0, 1);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0); this.vehicle.chassisBody.position.set(0, 5, 0); this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.deathCountdown = 0; this.vehicle.carMesh.traverse(c => { if (c.isMesh && c.userData.origMat) c.material = c.userData.origMat; });
        this.vehicle.smokeParticles.forEach(p => this.scene.remove(p.mesh)); this.vehicle.smokeParticles = [];
        this.vehicle.whiteSmokeParticles.forEach(p => this.scene.remove(p.mesh)); this.vehicle.whiteSmokeParticles = [];
    }

    showGameOver() {
        this.matchEnded = true;
        this.isPaused = true;
        if (this.gameOverOverlay) {
            this.gameOverOverlay.style.display = 'flex';
            const duration = (Date.now() - this.startTime) / 1000;
            const mins = Math.floor(duration / 60);
            const secs = Math.floor(duration % 60);
            document.getElementById('stat-time').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            document.getElementById('stat-kills').innerText = this.kills;
            const labelEl = document.getElementById('game-over-label');
            if (labelEl) labelEl.innerText = 'GAME OVER';
        }
    }

    showMatchWon() {
        this.matchEnded = true;
        this.isPaused = true;
        if (this.gameOverOverlay) {
            this.gameOverOverlay.style.display = 'flex';
            const duration = (Date.now() - this.startTime) / 1000;
            const mins = Math.floor(duration / 60);
            const secs = Math.floor(duration % 60);
            document.getElementById('stat-time').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            document.getElementById('stat-kills').innerText = this.kills;
            const labelEl = document.getElementById('game-over-label');
            if (labelEl) labelEl.innerText = 'MATCH WON!';
        }
    }

    fireBullet() {
        const now = Date.now(); const dur = (now - this.fireStartTime) / 1000;
        const cfg = BULLET_TYPES.machinegun;
        const bps = cfg.bpsBase + cfg.bpsRamp * Math.exp(-0.4 * dur); this.currentBPS = bps;
        if (now - this.lastFireTime < 1000 / bps) return; this.lastFireTime = now;
        const yaw = this.vehicle.carMesh.rotation.y; const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        let dmgMult = 1, spdMult = 1;
        try {
            const save = JSON.parse(localStorage.getItem('roadknight_story'));
            const car = window.currentCar || '35-impala';
            const upg = save?.[car]?.upgrades || {};
            const dmgLvl = upg.bulletDmg || 0;
            const spdLvl = upg.bulletSpeed || 0;
            if (dmgLvl > 0) dmgMult = 1 + UPGRADE_DEFS.find(d => d.id === 'bulletDmg').values[dmgLvl - 1];
            if (spdLvl > 0) spdMult = 1 + UPGRADE_DEFS.find(d => d.id === 'bulletSpeed').values[spdLvl - 1];
        } catch {}
        this.projectiles.fireBullet(this.vehicle.chassisBody.position, forward, dur, this.vehicle, 'machinegun', dmgMult, spdMult);
    }

    checkCollisions() {
        const now = Date.now();

        // 1. PROJECTILES (from this.projectiles)
        for (let i = this.projectiles.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles.projectiles[i];
            const pPos = p.mesh.position;
            let hit = false;

            // vs Cars (Local-space Bounding Box Check)
            for (const car of this.cars) {
                if (car.isDead || p.source === car) continue;
                
                const localP = this._v3.copy(pPos).sub(car.carMesh.position);
                localP.applyQuaternion(this._q.copy(car.carMesh.quaternion).invert());
                
                if (Math.abs(localP.x) < 1.1 && 
                    Math.abs(localP.y) < 1.2 && 
                    Math.abs(localP.z) < 3.6) { 
                    car.applyDamage(p.damage || 5); 
                    hit = true; break;
                }
            }
            if (hit) { this.scene.remove(p.mesh); this.projectiles.projectiles.splice(i, 1); continue; }

            // vs Barrels (grid)
            const nearbyB = this.barrels.getNearby(pPos, 2.0);
            for (const b of nearbyB) {
                const dx = pPos.x - b.body.position.x, dy = pPos.y - b.body.position.y, dz = pPos.z - b.body.position.z;
                if (dx*dx + dy*dy + dz*dz < 4.0) {
                    this.barrels.applyDamage(b, 5, (brl) => this.handleBarrelExplosion(brl));
                    hit = true; break;
                }
            }
            if (hit) { this.scene.remove(p.mesh); this.projectiles.projectiles.splice(i, 1); continue; }
        }

        // 1.5 ULTS PROJECTILES (from this.ults)
        for (let i = this.ults.projectiles.length - 1; i >= 0; i--) {
            const p = this.ults.projectiles[i];
            const pPos = p.mesh.position;
            let hit = false;
            for (const car of this.cars) {
                if (car.isDead || p.owner === car) continue;
                const localP = this._v3b.copy(pPos).sub(car.carMesh.position);
                localP.applyQuaternion(this._q2.copy(car.carMesh.quaternion).invert());
                if (Math.abs(localP.x) < 1.1 && Math.abs(localP.y) < 1.2 && Math.abs(localP.z) < 3.6) {
                    car.applyDamage(p.damage || 20);
                    hit = true; break;
                }
            }
            if (hit) { this.scene.remove(p.mesh); this.ults.projectiles.splice(i, 1); continue; }
            const nearbyU = this.barrels.getNearby(pPos, 2.0);
            for (const b of nearbyU) {
                const dx = pPos.x - b.body.position.x, dy = pPos.y - b.body.position.y, dz = pPos.z - b.body.position.z;
                if (dx*dx + dy*dy + dz*dz < 4.0) {
                    this.barrels.applyDamage(b, p.damage || 20, (brl) => this.handleBarrelExplosion(brl));
                    hit = true; break;
                }
            }
            if (hit) { this.scene.remove(p.mesh); this.ults.projectiles.splice(i, 1); }
        }

        // 2. MINES (from this.projectiles)
        for (let i = this.projectiles.activeMines.length - 1; i >= 0; i--) {
            const m = this.projectiles.activeMines[i];
            if (now - m.spawnedAt < 3500) continue;
            
            const mPos = m.body.position;
            for (const car of this.cars) {
                if (car.isDead) continue;
                const dx = mPos.x - car.chassisBody.position.x, dy = mPos.y - car.chassisBody.position.y, dz = mPos.z - car.chassisBody.position.z;
                if (dx*dx + dy*dy + dz*dz < 25.0) {
                    this.handleMineExplosion(i);
                    break; 
                }
            }
        }

        // 3. VEHICLE OVERLAPS & SHIELD (grid)
        for (const car of this.cars) {
            if (car.isDead) continue;
            const vPos = car.chassisBody.position;
            const speed = car.chassisBody.velocity.length();
            const nearbyV = this.barrels.getNearby(vPos, 6.0);
            for (const b of nearbyV) {
                const dx = vPos.x - b.body.position.x, dy = vPos.y - b.body.position.y, dz = vPos.z - b.body.position.z;
                const distSq = dx*dx + dy*dy + dz*dz;
                if (distSq < 16.0 && speed > 5) {
                    this.barrels.applyDamage(b, speed, (brl) => this.handleBarrelExplosion(brl));
                }
                if (car === this.vehicle && this.shieldActive && distSq < 36.0) {
                    this.barrels.applyDamage(b, 999, (brl) => this.handleBarrelExplosion(brl));
                }
            }
        }
    }

    handleBarrelExplosion(b) {
        const bPos = b.body.position; if (b.type === 'toxic' || b.type === 'oil') this.spawnPool(bPos.x, bPos.z, b.type);
        this.cars.forEach(car => {
            if (car.isDead) return;
            const vPos = car.chassisBody.position;
            const distSq = (vPos.x - bPos.x)**2 + (vPos.y - bPos.y)**2 + (vPos.z - bPos.z)**2;
            if (distSq < 64) {
                const dist = Math.sqrt(distSq);
                const dir = new CANNON.Vec3(vPos.x - bPos.x, vPos.y - bPos.y, vPos.z - bPos.z);
                dir.normalize();
                car.chassisBody.applyImpulse(dir.scale(3000 * (1 - dist / 8)), new CANNON.Vec3());
                if (car === this.vehicle && this.shieldActive) return;
                
                if (b.type === 'explosive') { car.applyDamage((1 - dist / 8) * 40); car.fireTimer = 3.0; }
                else if (b.type === 'cryo') car.slowTimer = 4.0;
                else if (b.type === 'toxic') { car.applyDamage((1 - dist / 8) * 45); car.toxicTimer = 5.0; }
                else if (b.type === 'oil') car.oilTimer = 6.0;
            }
        });
    }

    handleMineExplosion(index) {
        const m = this.projectiles.activeMines[index];
        if (!m) return;
        const mPos = m.body.position;
        const radius = m.isSuper ? 12 : 6;
        const damageBase = m.isSuper ? 32 : 40;

        this.cars.forEach(car => {
            if (car.isDead) return;
            const vPos = car.chassisBody.position;
            const dx = mPos.x - vPos.x, dy = mPos.y - vPos.y, dz = mPos.z - vPos.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            if (distSq < radius * radius) {
                const dist = Math.sqrt(distSq);
                const ratio = 1 - (dist / radius);
                const dir = new CANNON.Vec3(dx, dy, dz); dir.normalize();
                const force = m.isSuper ? 6000 : 3500;
                car.chassisBody.applyImpulse(dir.scale(force * ratio), new CANNON.Vec3());
                car.applyDamage(damageBase * ratio);
                car.fireTimer = 2.0;

                if (m.isSuper) {
                    car.chassisBody.velocity.y += 25; // LAUNCH EFFECT
                    car.chassisBody.angularVelocity.set((Math.random()-0.5)*5, (Math.random()-0.5)*10, (Math.random()-0.5)*5);
                }
            }
        });
        this.projectiles.explodeMine(index);
    }

    spawnPool(x, z, type) {
        const mat = this.poolMats[type] || this.poolMats.oil;
        const mesh = new THREE.Mesh(this.poolGeo, mat);
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.05, z); this.scene.add(mesh);
        this.pools.push({ mesh, type, life: 10.0 });
    }

    handlePools(dt) {
        for (let i = this.pools.length - 1; i >= 0; i--) {
            const p = this.pools[i]; p.life -= dt; if (p.life <= 0) { this.scene.remove(p.mesh); this.pools.splice(i, 1); continue; }
            if (p.type === 'fire' && p.x !== undefined && p.z !== undefined) {
                p.mesh.material.opacity = Math.max(0, p.life / 8) * 0.7;
                this.cars.forEach(car => {
                    if (car.isDead || car === p.owner) return;
                    if (car.chassisBody.position.y > 4) return;
                    const dx = car.chassisBody.position.x - p.x;
                    const dz = car.chassisBody.position.z - p.z;
                    if (dx * dx + dz * dz < 9) car.fireTimer = 2;
                });
            }
            if (p.type === 'quicksand' && p.x !== undefined && p.z !== undefined) {
                p.mesh.material.opacity = Math.max(0, p.life / 10) * 0.65;
                this.cars.forEach(car => {
                    if (car.isDead || car === p.owner) return;
                    const d = car.chassisBody.position.distanceTo(new CANNON.Vec3(p.x, 0, p.z));
                    if (d < 6) car.slowTimer = 1.5;
                });
            }
            if (p.type === 'smoke' && p.x !== undefined && p.z !== undefined) {
                p.mesh.material.opacity = Math.max(0, p.life / 8) * 0.5;
                this.cars.forEach(car => {
                    if (car.isDead || car === p.owner) return;
                    const d = car.chassisBody.position.distanceTo(new CANNON.Vec3(p.x, 0, p.z));
                    if (d < 4) car.slowTimer = 6;
                });
            }
        }
    }

    updateInput(dt) {
        const gp = this.getGamepad(); const keys = this.keys;
        
        // Handle Game Over Input
        if (this.matchEnded && gp) {
            if (gp.buttons[0]?.pressed || gp.buttons[9]?.pressed) { // X or START
                window.returnToMenu();
            }
        }

        // F-Key / X-Button: BULLETS (X is button 0 or 2 depending on map, usually 2 for PS)
        const shootingPressed = keys['KeyF'] || (gp && gp.buttons[2]?.pressed);
        if (shootingPressed) { if (!this.isFiring) { this.fireStartTime = Date.now(); this.isFiring = true; } this.fireBullet(); } else { this.isFiring = false; this.currentBPS = 0; }
        
        // E-Key / Circle-Button: MINES
        if (keys['KeyE'] || (gp && gp.buttons[1]?.pressed)) this.fireMine();
        
        // Q-Key / Square-Button: SELECTED WEAPON / ULT
        if (keys['KeyQ'] || (gp && gp.buttons[0]?.pressed)) this.fireWeapon();

        // Y-Key / Triangle-Button: SHIELD
        this.toggleShield(keys['KeyY'] || (gp && gp.buttons[3]?.pressed));

        let steerDir = (keys['KeyA']||keys['ArrowLeft']?1:0)-(keys['KeyD']||keys['ArrowRight']?1:0);
        if (gp && Math.abs(gp.axes[0]) > 0.1) steerDir = -gp.axes[0]; 
        
        const leanHeld = keys['KeyL'] || (gp && gp.buttons[10]?.pressed), isGrounded = this.vehicle.isTrulyGrounded;
        
        // L3 while hovering toggles low hover (aim-level shooting)
        if (gp && this.vehicle.hoverMode && gp.buttons[10]?.pressed && !this._l3Prev) {
            this.vehicle.toggleHover();
        }
        this._l3Prev = gp ? !!gp.buttons[10]?.pressed : false;
        
        let throttle = (keys['KeyW']||keys['ArrowUp']?1:0)-(keys['KeyS']||keys['ArrowDown']?1:0);
        let airPitch = throttle; if (gp && Math.abs(gp.axes[1]) > 0.1) airPitch = -gp.axes[1];
        
        if (!isGrounded && !this.vehicle.hoverMode && leanHeld && !this.vehicle.isAirFlipping) {
            if (Math.abs(steerDir) > 0.5 && this.energy >= 20) { 
                this.energy -= 20;
                this.vehicle.performAirFlip(Math.sign(steerDir), 'roll'); 
            }
            else if (Math.abs(airPitch) > 0.5 && this.energy >= 40) { 
                this.energy -= 40;
                this.vehicle.performAirFlip(Math.sign(airPitch), 'pitch'); 
            }
        }
        
        if (leanHeld && !this.vehicle.hoverMode && isGrounded) {
            const speedMPH = this.vehicle.chassisBody.velocity.length() * 2.237;
            const boostHeld = (keys['KeyB'] || (gp && gp.buttons[4]?.pressed));
            
            if (!this.isLeaningState) { 
                // ACTIVATION: Must hold L3 + Boost + Turn sharply
                if (boostHeld && Math.abs(steerDir) > 0.6 && this.leanCooldown <= 0) { 
                    this.isLeaningState = true; 
                    this.currentLeanSide = Math.sign(steerDir); 
                } 
            }
            else { 
                // MANUAL DEACTIVATION: Counter-steer sharply
                if (Math.sign(steerDir) === -this.currentLeanSide && Math.abs(steerDir) > 0.6) { 
                    this.isLeaningState = false; 
                    this.currentLeanSide = 0; 
                    this.leanCooldown = 5.0; 
                } 
                
                // AUTO DEACTIVATION: 0mph for 3 seconds
                if (speedMPH < 1.0) {
                    this.zeroSpeedTimer += dt;
                    if (this.zeroSpeedTimer > 3.0) {
                        this.isLeaningState = false;
                        this.currentLeanSide = 0;
                        this.leanCooldown = 5.0;
                    }
                } else {
                    this.zeroSpeedTimer = 0;
                }
            }
        } else if (this.isLeaningState) { 
            this.isLeaningState = false; 
            this.currentLeanSide = 0; 
            this.leanCooldown = 5.0; 
        }
        
        this.virtualHeading += steerDir * (this.isLeaningState ? 0.6 : 2.5) * dt;
        
        if (gp) {
            const f = gp.buttons[7]?.value||0, r = gp.buttons[6]?.value||0; if (Math.abs(f)>0.05||Math.abs(r)>0.05) throttle = f-r;
            
            // GEARS: Right Stick Up/Down (Axis 3) - Only if NOT holding L3 (Hydraulics)
            const rsY = gp.axes[3]; 
            const l3Held = gp.buttons[10]?.pressed;
            if (this.gearStickReset) {
                if (rsY < -0.5) { 
                    this.currentGear=Math.min(5, this.currentGear+1); 
                    if (!l3Held) this.input.pushCombo('up'); 
                    this.gearStickReset=false; 
                }
                else if (rsY > 0.5) { 
                    this.currentGear=Math.max(0, this.currentGear-1); 
                    if (!l3Held) this.input.pushCombo('down'); 
                    this.gearStickReset=false; 
                }
            } else if (Math.abs(rsY) < 0.2) this.gearStickReset = true;
            
            // D-Pad for combos
            if (gp.buttons[12]?.pressed) { if (this.dpadUpReset) { this.input.pushCombo('up'); this.dpadUpReset = false; } } else this.dpadUpReset = true;
            if (gp.buttons[13]?.pressed) { if (this.dpadDownReset) { this.input.pushCombo('down'); this.dpadDownReset = false; } } else this.dpadDownReset = true;

            // D-Pad Left/Right for weapon switching
            if (this.dpadReset) {
                if (gp.buttons[14]?.pressed) { this.rotateWeapon(-1); this.dpadReset = false; }
                else if (gp.buttons[15]?.pressed) { this.rotateWeapon(1); this.dpadReset = false; }
            } else if (!gp.buttons[14]?.pressed && !gp.buttons[15]?.pressed) this.dpadReset = true;
        }
        
        if (gp && gp.buttons[11]?.pressed && Date.now() - this.lastJumpTime > 1000) this.handleJump();
        
        const canAct = this.vehicle.hoverMode || isGrounded;
        const r1Pressed = gp && gp.buttons[5]?.pressed;
        if (r1Pressed && !this._prevR1) this.driftToggled = !this.driftToggled;
        this._prevR1 = r1Pressed;
        this.vehicle.isDrifting = (keys['ShiftLeft']||keys['Space']||r1Pressed||this.driftToggled) && canAct && Math.abs(steerDir) > 0.01;
        if (this.vehicle.isDrifting) this.vehicle.driftAngle += (steerDir*Math.PI/4 - this.vehicle.driftAngle) * 0.1; else this.vehicle.driftAngle *= 0.9;
        if (this.driftToggled && (Math.abs(steerDir) <= 0.01 || this.vehicle.chassisBody.velocity.length() * 2.237 < 30)) this.driftToggled = false;
        
        // NITRO LOGIC
        const boostHeld = (keys['KeyB'] || (gp && gp.buttons[4]?.pressed));
        if (boostHeld && this.nitro > 5) {
            this.vehicle.boostFactor = 2.0;
            this.nitro = Math.max(0, this.nitro - 25 * dt);
        } else {
            this.vehicle.boostFactor = 1.0;
        }

        // HYDRAULICS: Hold L3 (Button 10) + Right Stick
        if (gp && gp.buttons[10]?.pressed && !this.vehicle.hoverMode && !this.isLeaningState) {
            const hPitch = gp.axes[3]; // RS Y
            const hRoll = gp.axes[2];  // RS X
            this.vehicle.hydraulics.targetPitch = -hPitch;
            this.vehicle.hydraulics.targetRoll = hRoll;
            this.vehicle.hydraulics.targetLift = Math.max(0, -hPitch); // Lift when pulling back
        } else {
            this.vehicle.hydraulics.targetPitch = 0;
            this.vehicle.hydraulics.targetRoll = 0;
            this.vehicle.hydraulics.targetLift = 0;
        }

        this.vehicle.applyInputs(throttle, !this.vehicle.isDrifting && (keys['Space']||(gp&&gp.buttons[5]?.pressed)) && canAct);
        this.vehicle.airPitchInput = airPitch;
        return { steerDir: this.isLeaningState ? this.currentLeanSide : steerDir, leanActive: this.isLeaningState };
    }

    updateCamera(dt) {
        const pos = this.vehicle.getStableCenter();
        const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(new THREE.Vector3(0, this.camHeight, this.camDist).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.virtualHeading)));
        this.camera.position.copy(targetCamPos); this.camera.lookAt(new THREE.Vector3(pos.x, pos.y + 1, pos.z));
    }

    updateUI() {
        const speedMPH = this.vehicle.chassisBody.velocity.length() * 2.237;
        const speedValEl = document.getElementById('speed-val');
        if (speedValEl) speedValEl.innerText = speedMPH.toFixed(0);
        
        const gearValEl = document.getElementById('gear-val');
        if (gearValEl) gearValEl.innerText = `${this.currentGear + 1}`;

        const rpmBarEl = document.getElementById('rpm-bar');
        if (rpmBarEl) {
            // Fake RPM based on speed within current gear range
            const gearMax = (this.currentGear + 1) * 30;
            const gearMin = this.currentGear * 20;
            const rpmRatio = Math.min(1.0, (speedMPH - gearMin) / (gearMax - gearMin));
            const displayRPM = 1000 + Math.max(0, rpmRatio * 7000);
            rpmBarEl.style.width = `${(displayRPM / 8000) * 100}%`;
        }

        const boostBarEl = document.getElementById('boost-bar');
        if (boostBarEl) boostBarEl.style.width = `${this.nitro}%`;

        const energyBarEl = document.getElementById('energy-bar');
        if (energyBarEl) energyBarEl.style.width = `${this.energy}%`;

        const healthBarEl = document.getElementById('health-bar');
        if (healthBarEl) healthBarEl.style.width = `${this.vehicle.health}%`;

        const mineAmmoEl = document.getElementById('mine-ammo');
        if (mineAmmoEl) mineAmmoEl.innerText = `MINES: ${this.mineAmmo} / 7`;

        const bpsEl = document.getElementById('bps-val');
        if (bpsEl) bpsEl.innerText = `BPS: ${this.currentBPS.toFixed(1)}`;
        
        const livesEl = document.getElementById('lives-display');
        if (livesEl) livesEl.innerText = `LIVES: ${this.lives}`;

        let status = `MODE: ${this.vehicle.hoverMode ? 'FLIGHT' : 'GROUND'}`;
        if (this.isLeaningState) status = "MODE: TWO-WHEELS";
        if (this.leanCooldown > 0 && !this.isLeaningState) status += ` (COOLDOWN: ${this.leanCooldown.toFixed(1)}s)`;
        const hoverStatusEl = document.getElementById('hover-status');
        if (hoverStatusEl) hoverStatusEl.innerText = status;
    }
}
