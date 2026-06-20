import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { ArcadeVehicle } from './ArcadeVehicle.js';
import { Projectiles } from './Projectiles.js';
import { Barrels } from './Barrels.js';
import { AudioManager } from './AudioManager.js';
import { Ults } from './Ults.js';
import { WEAPON_TYPES } from './Weps.js';
import { Pickups } from './Pickups.js';
import { AIController2 } from './AIController2.js';
import { AI_PROFILES_2 } from './AIProfiles2.js';
import { UPGRADE_DEFS, BULLET_TYPES, CREWS, getCarProgress, setCarProgress, getUpgradeLevel, getUpgradeCost, getMissionDefs, getCarCrew, isBossUnlocked, setCrewMissionProgress, addCrewScrap, deductCrewScrap, getCrewScrap } from './StoryData.js';

const GROUPS = { GROUND: 1, OBSTACLE: 2, BALL: 4, PLAYER: 8 };

// STORY MODE FORK - currently mirrors ArcadeTestGame architecture.
// TODO: Add wave management, scrap/credit economy, meta-progression shop,
//       boss encounters, checkpoint system, narrative sequences.
export class Game {
    constructor(storyConfig = {}) {
        this.isDisposed = false;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        this.audio = new AudioManager();
        this.slickMat = new CANNON.Material('slick');

        // Story mode state (placeholders for future progression)
        this.story = {
            phase: storyConfig.phase || 0,
            wave: 0,
            scrap: 0,
            credits: parseInt(localStorage.getItem('roadknight_credits') || '0'),
            difficulty: storyConfig.difficulty || 1,
            completed: false
        };

        this.weaponInventory = ['ult'];
        this.currentWeaponIndex = 0;
        this.selectedCarType = storyConfig.carType || '35-impala';

        this.mapConfig = storyConfig.mapConfig || {
            name: "Proving Grounds",
            grass: true,
            groundColor: 0x5d4037,
            skybox: 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_21-512x512.png',
            pickups: [
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
                { x: 180, z: -180, type: 'buff_hover' }
            ]
        };

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
        this.vehicle = new ArcadeVehicle(this.scene, this.world, {
            position: new CANNON.Vec3((Math.random() - 0.5) * 20, 5, (Math.random() - 0.5) * 20),
            collisionFilterGroup: GROUPS.PLAYER,
            collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER,
            material: this.slickMat,
            carType: this.selectedCarType
        });

        this.player = this.vehicle;
        this.cars = [this.player];
        this.aiControllers = [];
        this.arenaHalfSize = 400;

        this.missionIndex = storyConfig.missionIndex;
        this.missionComplete = false;
        this.showingShop = false;
        this.enemiesSpawned = false;
        this.prestige = storyConfig.prestige || 0;
        this.difficulty = storyConfig.difficulty || 'hard';
        this.bulletType = storyConfig.bulletType || 'machinegun';

        if (this.missionIndex !== undefined) {
            const missions = getMissionDefs(this.selectedCarType, this.prestige);
            if (missions && this.missionIndex < missions.length) {
                this.currentMission = missions[this.missionIndex];
                console.log('[Story] Mission', this.missionIndex, 'enemies:', this.currentMission.enemyCount, 'boss:', this.currentMission.hasBoss, 'prestige:', this.prestige);
                this.story.scrap = storyConfig.scrap || 0;
                const carProgress = getCarProgress(this.selectedCarType);
                this.upgradeLevels = carProgress.upgrades || {};
                this.moneyPickups = 0;
                this.missionEnemyCount = this.currentMission.enemyCount + (this.currentMission.hasBoss ? 1 : 0);
            }
        }

        this.ults.initVehicleUlt(this.vehicle);
        this.ults.addAmmo(this.vehicle, 3, 'ult');

        if (this.difficulty === 'onehit') {
            this.vehicle.healthMax = 1;
            this.vehicle.health = 1;
        }

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

        this._v3 = new THREE.Vector3();
        this._v3b = new THREE.Vector3();
        this._q = new THREE.Quaternion();
        this._q2 = new THREE.Quaternion();

        this.lastFireTime = 0;
        this.fireStartTime = 0;
        this.isFiring = false;
        this.currentBPS = 0;
        this.deathCountdown = 0;
        this.zeroSpeedTimer = 0;

        this.lastMineTime = 0;
        this.mineCooldown = 3000;
        this.shieldActive = false;
        this.shieldTimer = 0;
        this._prevR1 = false;

        this.pauseMenuEl = document.getElementById('pause-menu');
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        if (this.gameOverOverlay) this.gameOverOverlay.style.display = 'none';
        const deathOverlay = document.getElementById('death-overlay');
        if (deathOverlay) deathOverlay.style.display = 'none';
        const storyOverlay = document.getElementById('story-mission-complete');
        if (storyOverlay) storyOverlay.style.display = 'none';
        const storyVictory = document.getElementById('story-victory');
        if (storyVictory) storyVictory.style.display = 'none';

        this.lives = 3;
        this.kills = 0;
        this.startTime = Date.now();
        this.matchEnded = false;

        this.poolGeo = new THREE.CircleGeometry(4, 16);
        this.poolMats = {
            toxic: new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6, shininess: 100 }),
            oil: new THREE.MeshPhongMaterial({ color: 0x111111, transparent: true, opacity: 0.6, shininess: 100 }),
            fire: new THREE.MeshPhongMaterial({ color: 0xff4400, transparent: true, opacity: 0.7, emissive: 0xff2200, emissiveIntensity: 0.5 })
        };

        this._warmupFrames = 8;

        if (this.currentMission && !this.enemiesSpawned) {
            console.log('[Story] Constructor spawning mission', this.missionIndex);
            this.spawnMissionEnemies();
        } else if (!this.currentMission) {
            console.log('[Story] No mission set — missionIndex:', this.missionIndex, 'carType:', this.selectedCarType);
        }

        this.updateWeaponUI();
        this.animate();
    }

    // ===== STORY MODE HOOKS =====
    // TODO: Implement wave spawning:
    // spawnStoryWave() - create enemies for current wave
    // completeWave() - grant scrap rewards, show upgrade selection
    // endRun() - convert scrap to credits, save to localStorage
    // ============================

    initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.slickMat, this.slickMat, { friction: 0.0, restitution: 0.0 }));
        const groundBody = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
    }

    initGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111118);

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
                const grassGeo = new THREE.PlaneGeometry(2000, 2000);
                const color = this.mapConfig.groundColor || 0x1a4a1a;
                const grassMat = new THREE.MeshPhongMaterial({ color });
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
            const container = document.getElementById('game-layer') || document.body;
            container.appendChild(window._sharedRenderer.domElement);
        }
        this.renderer = window._sharedRenderer;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(50, 100, 50);
        this.scene.add(sun);
    }

    initMap() {
        // TODO: Story-specific map generation (arenas, obstacle layouts)
        const config = this.mapConfig;
        if (config.randomBoxes) {
            for (let i = 0; i < config.randomBoxes; i++) {
                const w = 5 + Math.random() * 15, h = 2 + Math.random() * 20, d = 5 + Math.random() * 15;
                const px = (Math.random() - 0.5) * 600, pz = (Math.random() - 0.5) * 600;
                if (Math.abs(px) < 20 && Math.abs(pz) < 20) continue;
                this.addBuilding(px, h / 2, pz, w, h, d, 0x00ffff);
            }
        }
        if (config.buildings) {
            config.buildings.forEach(b => this.addBuilding(b.position.x, b.position.y, b.position.z, b.size.x, b.size.y, b.size.z, b.color));
        }
        if (config.ramps) {
            config.ramps.forEach(r => this.addRamp(r.x, r.y, r.z, r.w, r.h, r.d, r.rotX, r.rotY, r.rotZ));
        }
    }

    addBuilding(x, y, z, w, h, d, color = 0x444444) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color }));
        mesh.position.set(x, y, z);
        this.scene.add(mesh);
        const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.OBSTACLE, material: this.slickMat, position: new CANNON.Vec3(x, y, z) });
        body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
        this.world.addBody(body);
        return { mesh, body };
    }

    addRamp(x, y, z, w, h, d, rotX, rotY, rotZ) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: 0x666666 }));
        mesh.position.set(x, y, z);
        if (rotX) mesh.rotation.x = rotX;
        if (rotY) mesh.rotation.y = rotY;
        if (rotZ) mesh.rotation.z = rotZ;
        this.scene.add(mesh);
        const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat, position: new CANNON.Vec3(x, y, z) });
        body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
        if (rotX || rotY || rotZ) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX || 0, rotY || 0, rotZ || 0));
            body.quaternion.set(q.x, q.y, q.z, q.w);
        }
        this.world.addBody(body);
        return { mesh, body };
    }

    initInput() {
        this.keys = {};
        this.gearStickReset = true;
        this.dpadReset = true;
        this.dpadUpReset = true;
        this.dpadDownReset = true;
        this._keydownRef = (e) => {
            if (e.repeat) return;
            if (this.audio && !this.audio.initialized) this.audio.init();
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

        if (isSuperCombo && l3Held && rsUp && this.energy >= 80) {
            this.vehicle.jump(65);
            this.energy = 0;
            this.input.inputBuffer = [];
            this.lastJumpTime = now;
            return;
        }

        const isHydraulicSuper = l3Held && rsUp && this.energy >= 40;
        const isSuper = (isSuperCombo && this.energy >= 40) || isHydraulicSuper;

        if (isSuper && this.energy >= 40) {
            this.vehicle.jump(36);
            this.energy -= 40;
            this.input.inputBuffer = [];
            this.lastJumpTime = now;
        } else {
            this.vehicle.jump(24);
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
                if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = true;
            }
        }
    }

    updateInput(dt) {
        const gp = this.getGamepad(); const keys = this.keys;

        if (this.matchEnded && gp) {
            if (gp.buttons[0]?.pressed || gp.buttons[9]?.pressed) {
                window.returnToMenu();
            }
        }

        const shootingPressed = keys['KeyF'] || (gp && gp.buttons[2]?.pressed);
        if (shootingPressed) { if (!this.isFiring) { this.fireStartTime = Date.now(); this.isFiring = true; } this.fireBullet(); } else { this.isFiring = false; this.currentBPS = 0; }

        if (keys['KeyE'] || (gp && gp.buttons[1]?.pressed)) this.fireMine();

        if (keys['KeyQ'] || (gp && gp.buttons[0]?.pressed)) this.fireWeapon();

        this.toggleShield(keys['KeyY'] || (gp && gp.buttons[3]?.pressed));

        let steerDir = (keys['KeyA']||keys['ArrowLeft']?1:0)-(keys['KeyD']||keys['ArrowRight']?1:0);
        if (gp && Math.abs(gp.axes[0]) > 0.1) steerDir = -gp.axes[0];

        const leanHeld = keys['KeyL'] || (gp && gp.buttons[10]?.pressed), isGrounded = this.vehicle.isTrulyGrounded;

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
                if (boostHeld && Math.abs(steerDir) > 0.6 && this.leanCooldown <= 0) {
                    this.isLeaningState = true;
                    this.currentLeanSide = Math.sign(steerDir);
                }
            }
            else {
                if (Math.sign(steerDir) === -this.currentLeanSide && Math.abs(steerDir) > 0.6) {
                    this.isLeaningState = false;
                    this.currentLeanSide = 0;
                    this.leanCooldown = 5.0;
                }

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

            if (gp.buttons[12]?.pressed) { if (this.dpadUpReset) { this.input.pushCombo('up'); this.dpadUpReset = false; } } else this.dpadUpReset = true;
            if (gp.buttons[13]?.pressed) { if (this.dpadDownReset) { this.input.pushCombo('down'); this.dpadDownReset = false; } } else this.dpadDownReset = true;

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

        const boostHeld = (keys['KeyB'] || (gp && gp.buttons[4]?.pressed));
        if (boostHeld && this.nitro > 5) {
            this.vehicle.boostFactor = 2.0;
            this.nitro = Math.max(0, this.nitro - 25 * dt);
        } else {
            this.vehicle.boostFactor = 1.0;
        }

        if (gp && gp.buttons[10]?.pressed && !this.vehicle.hoverMode && !this.isLeaningState) {
            const hPitch = gp.axes[3];
            const hRoll = gp.axes[2];
            this.vehicle.hydraulics.targetPitch = -hPitch;
            this.vehicle.hydraulics.targetRoll = hRoll;
            this.vehicle.hydraulics.targetLift = Math.max(0, -hPitch);
        } else {
            this.vehicle.hydraulics.targetPitch = 0;
            this.vehicle.hydraulics.targetRoll = 0;
            this.vehicle.hydraulics.targetLift = 0;
        }

        this.vehicle.applyInputs(throttle, !this.vehicle.isDrifting && (keys['Space']||(gp&&gp.buttons[5]?.pressed)) && canAct);
        this.vehicle.airPitchInput = airPitch;
        return { steerDir: this.isLeaningState ? this.currentLeanSide : steerDir, leanActive: this.isLeaningState };
    }

    fireBullet() {
        const now = Date.now();
        const dur = (now - this.fireStartTime) / 1000;
        const cfg = BULLET_TYPES[this.bulletType] || BULLET_TYPES.machinegun;
        const bps = cfg.bpsBase + cfg.bpsRamp * Math.exp(-0.4 * dur);
        this.currentBPS = bps;
        if (now - this.lastFireTime < 1000 / bps) return;
        this.lastFireTime = now;
        const yaw = this.vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const upg = this.upgradeLevels || {};
        const dmgUpg = upg.bulletDmg || 0;
        const spdUpg = upg.bulletSpeed || 0;
        const dmgMult = 1 + (dmgUpg > 0 ? UPGRADE_DEFS.find(d => d.id === 'bulletDmg').values[dmgUpg - 1] : 0);
        const spdMult = 1 + (spdUpg > 0 ? UPGRADE_DEFS.find(d => d.id === 'bulletSpeed').values[spdUpg - 1] : 0);
        this.projectiles.fireBullet(this.vehicle.chassisBody.position, forward, dur, this.vehicle, this.bulletType, dmgMult, spdMult);
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

    rotateWeapon(dir) {
        this.currentWeaponIndex = (this.currentWeaponIndex + dir + this.weaponInventory.length) % this.weaponInventory.length;
        this.updateWeaponUI();
    }

    performCarUlt() {
        this.ults.performCarUlt(this.vehicle);
        this.updateWeaponUI();
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

    handlePickup(type, vehicle = this.vehicle) {
        if (type === 'health') {
            vehicle.health = Math.min(vehicle.healthMax, vehicle.health + 25);
        } else if (type === 'charge' || type === 'energy') {
            if (vehicle === this.vehicle) this.energy = Math.min(100, this.energy + 50);
            else if (vehicle.energy !== undefined) vehicle.energy = Math.min(100, vehicle.energy + 50);
        } else if (type === 'ammo') {
            const pool = ['ult', 'ult', 'missile', 'shotgun', 'cannon', 'turret', 'energy', 'melee', 'mortar', 'c4'];
            const randWep = pool[Math.floor(Math.random() * pool.length)];
            if (!this.weaponInventory.includes(randWep) && randWep !== 'ult') this.weaponInventory.push(randWep);
            this.ults.addAmmo(vehicle, 5, randWep);
            if (randWep !== 'ult') this.currentWeaponIndex = this.weaponInventory.indexOf(randWep);
        } else if (type === 'ult') {
            this.ults.addAmmo(vehicle, 1, 'ult');
        } else if (WEAPON_TYPES[type]) {
            if (!this.weaponInventory.includes(type)) this.weaponInventory.push(type);
            this.ults.addAmmo(vehicle, 5, type);
            this.currentWeaponIndex = this.weaponInventory.indexOf(type);
        } else if (type === 'buff_hover' || type === 'hover') {
            vehicle.hoverMode = true;
        }
        this.updateWeaponUI();
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.pauseMenuEl) this.pauseMenuEl.style.display = this.isPaused ? 'flex' : 'none';
    }

    applyVehicleControlsAI(vehicle, throttle, steerVal, brakeForce, isBoosting = false) {
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

    spawnAICar(carTypeOverride) {
        const carKeys = ['beachbug', 'foodtruck', 'beachpartyvan', 'hovercar', 'rover', 'rv', 'sidecarbike', 'ratrod', 'amrtruck', 'sprintracer', 'bladecybercar', '12-servervan', 'aicop', 'policecar', 'grappler', 'f2', 'rally', 'livsuper', 'bowcar', 'muscle', 'willys', 'mini', 'sportssuper', 'van', 'rougeai', 'scorp', 'nado', '4door', '61lowrider', 'tourbus', 'forklift', 'flagtruck', 'mixer', 'miramar', 'democharger', 'semi', 'voidbike', 'voidcar', 'tractor', 'oldrace', 'spycar', 'redrum', 'planecar', 'humher', 'schoolbus', 'yellowelstang', 'rocketcar', 'wolfstreet', 'bumsboss', 'z2-ufo', 'ratsboss', 'hackerboss', 'policeboss', 'jammonsterboss', 'junkboss', 'cuteboss', 'finaltank', 'bigboss', 'cranetruck', 'demoboss', 'voidboss', 'radioboss', 'armyboss', 'prostreetboss', '35-impala'];
        const bossKeys = ['bumsboss', 'z2-ufo', 'ratsboss', 'hackerboss', 'policeboss', 'jammonsterboss', 'junkboss', 'cuteboss', 'finaltank', 'bigboss', 'cranetruck', 'demoboss', 'voidboss', 'radioboss', 'armyboss', 'prostreetboss'];
        const randomType = carTypeOverride || carKeys[Math.floor(Math.random() * carKeys.length)];

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
        const aiController = new AIController2(this, aiCar, profile, profile.color);
        this.aiControllers.push(aiController);
    }

    spawnMissionEnemies() {
        if (!this.currentMission) { console.log('[Story] spawn skipped — no currentMission'); return; }
        const mission = this.currentMission;
        console.log('[Story] Spawning', mission.enemyCount, 'enemies +', mission.hasBoss ? 'boss' : 'no boss');
        const bossKeys = ['bumsboss', 'z2-ufo', 'ratsboss', 'hackerboss', 'policeboss', 'jammonsterboss', 'junkboss', 'cuteboss', 'finaltank', 'bigboss', 'cranetruck', 'demoboss', 'voidboss', 'radioboss', 'armyboss', 'prostreetboss'];
        const playableKeys = ['beachbug', 'foodtruck', 'beachpartyvan', 'hovercar', 'rover', 'rv', 'sidecarbike', 'ratrod', 'amrtruck', 'sprintracer', 'bladecybercar', '12-servervan', 'aicop', 'policecar', 'grappler', 'f2', 'rally', 'livsuper', 'bowcar', 'muscle', 'willys', 'mini', 'sportssuper', 'van', 'rougeai', 'scorp', 'nado', '4door', '61lowrider', 'tourbus', 'forklift', 'flagtruck', 'mixer', 'miramar', 'democharger', 'semi', 'voidbike', 'voidcar', 'tractor', 'oldrace', 'spycar', 'redrum', 'planecar', 'humher', 'schoolbus', 'yellowelstang', 'rocketcar', 'wolfstreet'];

        for (let i = 0; i < mission.enemyCount; i++) {
            const type = playableKeys[Math.floor(Math.random() * playableKeys.length)];
            this.spawnAICar(type);
        }

        if (mission.hasBoss) {
            const bossType = bossKeys[Math.floor(Math.random() * bossKeys.length)];
            this.spawnAICar(bossType);
        }

        this.enemiesSpawned = true;
    }

    showPanel(panel) {
        ['controls-panel', 'audio-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = (panel === id.replace('-panel', '') || (panel === 'controls' && id === 'controls-panel')) ? 'block' : 'none';
        });
    }

    onMissionComplete() {
        this.matchEnded = true;
        this.isPaused = true;
        const scrapEarned = this.currentMission.scrapReward;
        this.story.scrap += scrapEarned;

        const carProgress = getCarProgress(this.selectedCarType);
        carProgress.upgrades = this.upgradeLevels;
        carProgress.bulletType = this.bulletType;
        setCarProgress(this.selectedCarType, carProgress);

        const crewId = getCarCrew(this.selectedCarType);
        setCrewMissionProgress(crewId, this.missionIndex);
        addCrewScrap(crewId, scrapEarned);

        const bossUnlockMsg = document.getElementById('smc-boss-unlock');
        if (bossUnlockMsg) {
            const crew = CREWS[crewId];
            if (crew && isBossUnlocked(crewId)) {
                const bossName = crew.boss ? (CONFIG.CARS[crew.boss]?.name || crew.boss) : '';
                bossUnlockMsg.textContent = `BOSS UNLOCKED: ${bossName} now playable in arcade!`;
                bossUnlockMsg.style.display = 'block';
            } else {
                bossUnlockMsg.style.display = 'none';
            }
        }

        const overlay = document.getElementById('story-mission-complete');
        if (overlay) {
            overlay.style.display = 'flex';
            document.getElementById('smc-scrap').textContent = scrapEarned;
            document.getElementById('smc-total').textContent = this.story.scrap;
            const pStr = this.prestige > 0 ? ` [+${this.prestige}]` : '';
            document.getElementById('smc-mission').textContent = `MISSION ${this.missionIndex + 1} COMPLETE${pStr}`;
        }
        this.showingShop = true;
        this.renderShop();
    }

    renderShop() {
        const container = document.getElementById('story-shop-items');
        if (!container) return;
        container.innerHTML = '';

        for (const def of UPGRADE_DEFS) {
            const level = this.upgradeLevels[def.id] || 0;
            const cost = level < 5 ? getUpgradeCost(def, level) : null;
            const row = document.createElement('div');
            row.className = 'shop-row';
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);';
            row.innerHTML = `
                <div style="flex:1;font-weight:bold;">${def.name}</div>
                <div style="width:50px;color:#0af;">LV ${level}/5</div>
                <div style="flex:2;font-size:0.8em;color:#888;">${def.desc}</div>
                <div style="width:100px;text-align:right;color:#ff0;">${cost !== null ? cost + ' scrap' : 'MAX'}</div>
                <button style="padding:5px 15px;${cost === null || this.story.scrap < cost ? 'opacity:0.4;' : 'cursor:pointer;'}" ${cost === null || this.story.scrap < cost ? 'disabled' : ''} data-id="${def.id}" data-cost="${cost || 0}">BUY</button>
            `;
            container.appendChild(row);
        }

        container.querySelectorAll('button:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                this.buyUpgrade(btn.dataset.id, parseInt(btn.dataset.cost));
            });
        });

        document.getElementById('shop-scrap-display').textContent = this.story.scrap;
        document.getElementById('shop-continue-btn').style.display = 'inline-block';
    }

    buyUpgrade(upgradeId, cost) {
        if (this.story.scrap < cost) return;
        this.story.scrap -= cost;
        const level = (this.upgradeLevels[upgradeId] || 0) + 1;
        this.upgradeLevels[upgradeId] = level;
        this.renderShop();
        const crewId = getCarCrew(this.selectedCarType);
        deductCrewScrap(crewId, cost);
        const progress = getCarProgress(this.selectedCarType);
        progress.upgrades = this.upgradeLevels;
        setCarProgress(this.selectedCarType, progress);
    }

    continueToNextMission() {
        const missions = getMissionDefs(this.selectedCarType, this.prestige);
        if (!missions) { this.returnToMenu(); return; }

        const nextIdx = this.missionIndex + 1;
        if (nextIdx >= missions.length) {
            const overlay = document.getElementById('story-mission-complete');
            if (overlay) overlay.style.display = 'none';
            const carProgress = getCarProgress(this.selectedCarType);
            carProgress.prestige = (carProgress.prestige || 0) + 1;
            carProgress.upgrades = this.upgradeLevels;
            carProgress.bulletType = this.bulletType;
            setCarProgress(this.selectedCarType, carProgress);
            const victory = document.getElementById('story-victory');
            if (victory) {
                victory.style.display = 'flex';
                const vText = document.getElementById('story-victory-text');
                if (vText) vText.textContent = `Playthrough ${carProgress.prestige} complete!`;
                const ngBtn = document.getElementById('story-ng-plus');
                if (ngBtn) ngBtn.style.display = 'inline-block';
            }
            return;
        }

        const overlay = document.getElementById('story-mission-complete');
        if (overlay) overlay.style.display = 'none';
        this.dispose();
        window.game = null;
        import('./Game.js').then(mod => {
            window.game = new mod.Game({
                carType: this.selectedCarType,
                missionIndex: nextIdx,
                scrap: this.story.scrap,
                prestige: this.prestige,
                difficulty: this.difficulty,
                bulletType: this.bulletType
            });
            window.applySharedAudioSettingsToGame();
        });
    }

    returnToMenu() {
        window.returnToMenu();
    }

    animate() {
        if (this.isDisposed) return;
        requestAnimationFrame(() => this.animate());

        if (this._warmupFrames > 0) {
            this.world.step(1/60, 1/60, 3);
            const steer = this._warmupFrames % 2 === 0 ? 1 : -1;
            this.vehicle.update(1/60, 0, steer, false);
            if (this._warmupFrames === 8 && this.barrels.models?.oil) {
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
        const overlay = document.getElementById('death-overlay');
        const respawnText = document.getElementById('respawn-text');

        if (this.isPaused) { this.renderer.render(this.scene, this.camera); return; }
        dt = Math.min(dt, 0.1);
        this.world.step(1 / 60, dt, 3);

        // Fallback spawn if missed during constructor
        if (this.currentMission && !this.enemiesSpawned) {
            console.log('[Story] Fallback spawn in animate');
            this.spawnMissionEnemies();
        }

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
                if (this.shieldActive) {
                    this.shieldTimer -= dt;
                    if (this.shieldTimer <= 0) {
                        this.shieldActive = false;
                        if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = false;
                    }
                }
                if (!isNitroActive) this.energy = Math.min(100, this.energy + 10 * dt);
                if (!isNitroActive) this.nitro = Math.min(100, this.nitro + 5 * dt);
                if (this.audio && this.audio.initialized) {
                    this.audio.update({
                        speed: this.vehicle.chassisBody.velocity.length() * 3.6,
                        throttle: (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0),
                        boost: isNitroActive ? 100 : 0,
                        steerVal: input.steerDir,
                        isHandbrake: this.keys['Space'] || false
                    });
                }
                this.vehicle.update(dt, this.virtualHeading, input.steerDir, input.leanActive);
            }
        });

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
                if (car.chassisBody.position.y < -10) {
                    car.chassisBody.position.set(car.chassisBody.position.x, 5, car.chassisBody.position.z);
                    car.chassisBody.velocity.set(0, 5, 0);
                    if (car === this.vehicle) { const s = this.ults.activeUlts.get(this.vehicle); if (s) s.lowriderSlamState = false; }
                }
            }
        });

        this.checkCollisions();
        this.ults.update(dt);
        this.projectiles.update(now);
        this.barrels.update();
        this.pickups.update(now, this.cars, (type, v) => this.handlePickup(type, v));
        this.handlePools(dt);

        if (this.currentMission && !this.missionComplete && !this.vehicle.isDead) {
            const allDead = this.aiControllers.length > 0 && this.aiControllers.every(ai => ai.vehicle.isDead);
            if (allDead) {
                this.missionComplete = true;
                this.onMissionComplete();
            }
        }

        if (this.leanCooldown > 0) this.leanCooldown -= dt;
        this.updateCamera(dt);
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }

    handleDeath() {
        this.lives--;
        if (this.lives <= 0) { this.showGameOver(); return; }
        this.vehicle.health = this.vehicle.healthMax;
        this.vehicle.isDead = false;
        this.vehicle.isDying = false;
        this.vehicle.deathDelayTimer = 0;
        this.vehicle.fireTimer = 0;
        this.vehicle.slowTimer = 0;
        this.vehicle.toxicTimer = 0;
        this.vehicle.oilTimer = 0;
        this.vehicle.slowFactor = 1.0;
        this.vehicle.isFrozen = false;
        this.vehicle.chassisBody.type = CANNON.Body.DYNAMIC;
        this.vehicle.chassisBody.linearDamping = 0.1;
        this.vehicle.chassisBody.angularDamping = 0.99;
        this.vehicle.chassisBody.fixedRotation = true;
        this.vehicle.chassisBody.updateMassProperties();
        this.vehicle.chassisBody.quaternion.set(0, 0, 0, 1);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.position.set(0, 5, 0);
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.deathCountdown = 0;
        this.vehicle.carMesh.traverse(c => { if (c.isMesh && c.userData.origMat) c.material = c.userData.origMat; });
        this.vehicle.smokeParticles.forEach(p => this.scene.remove(p.mesh));
        this.vehicle.smokeParticles = [];
        this.vehicle.whiteSmokeParticles.forEach(p => this.scene.remove(p.mesh));
        this.vehicle.whiteSmokeParticles = [];
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
        }
    }

    checkCollisions() {
        const now = Date.now();
        for (let i = this.projectiles.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles.projectiles[i];
            const pPos = p.mesh.position;
            let hit = false;
            for (const car of this.cars) {
                if (car.isDead || p.source === car) continue;
                const localP = pPos.clone().sub(car.carMesh.position);
                localP.applyQuaternion(car.carMesh.quaternion.clone().invert());
                if (Math.abs(localP.x) < 1.1 && Math.abs(localP.y) < 1.2 && Math.abs(localP.z) < 3.6) {
                    car.applyDamage(p.damage || 5);
                    hit = true;
                    break;
                }
            }
            if (hit) { this.scene.remove(p.mesh); this.projectiles.projectiles.splice(i, 1); continue; }
        }
        for (let i = this.projectiles.activeMines.length - 1; i >= 0; i--) {
            const m = this.projectiles.activeMines[i];
            if (now - m.spawnedAt < 3500) continue;
            const mPos = m.body.position;
            for (const car of this.cars) {
                if (car.isDead) continue;
                if (mPos.distanceTo(car.chassisBody.position) < 5.0) {
                    this.handleMineExplosion(i);
                    break;
                }
            }
        }
    }

    handleMineExplosion(index) {
        const m = this.projectiles.activeMines[index];
        const flash = new THREE.PointLight(m.isSuper ? 0x89CFF0 : 0xffaa00, 25, 20);
        flash.position.copy(m.body.position);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 150);
        this.cars.forEach(car => {
            if (car.isDead) return;
            const dist = car.chassisBody.position.distanceTo(m.body.position);
            if (dist < 10) {
                const dmg = m.isSuper ? 60 : 30;
                const dmgScale = 1 - (dist / 10);
                car.applyDamage(dmg * dmgScale);
            }
        });
        this.scene.remove(m.mesh);
        this.world.removeBody(m.body);
        this.projectiles.activeMines.splice(index, 1);
    }

    handlePools(dt) {
        for (let i = this.pools.length - 1; i >= 0; i--) {
            const pool = this.pools[i];
            pool.life -= dt;
            pool.mesh.material.opacity = Math.max(0, pool.life / 10) * 0.6;
            if (pool.life <= 0) { this.scene.remove(pool.mesh); this.pools.splice(i, 1); continue; }
            this.cars.forEach(car => {
                if (car.isDead) return;
                const dist = car.chassisBody.position.distanceTo(new CANNON.Vec3(pool.x, 0, pool.z));
                if (dist < 4) {
                    if (pool.type === 'toxic' && car.toxicTimer <= 0) { car.toxicTimer = 3; }
                    if (pool.type === 'oil') car.oilFactor = 0.3;
                } else {
                    if (pool.type === 'oil') car.oilFactor = 1.0;
                }
                if (pool.type === 'quicksand' && car !== pool.owner) {
                    const qDist = car.chassisBody.position.distanceTo(new CANNON.Vec3(pool.x, 0, pool.z));
                    if (qDist < 6) car.slowTimer = 1.5;
                }
                if (pool.type === 'fire' && car !== pool.owner) {
                    if (car.chassisBody.position.y > 4) return;
                    const dx = car.chassisBody.position.x - pool.x;
                    const dz = car.chassisBody.position.z - pool.z;
                    if (dx * dx + dz * dz < 9) car.fireTimer = 2;
                }
                if (pool.type === 'smoke' && car !== pool.owner) {
                    const sDist = car.chassisBody.position.distanceTo(new CANNON.Vec3(pool.x, 0, pool.z));
                    if (sDist < 4) car.slowTimer = 6;
                }
            });
        }
    }

    spawnPool(x, z, type) {
        const mat = this.poolMats[type];
        if (!mat) return;
        const mesh = new THREE.Mesh(this.poolGeo, mat.clone());
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0.1, z);
        this.scene.add(mesh);
        this.pools.push({ mesh, x, z, type, life: 10 });
    }

    updateCamera(dt) {
        const pos = this.vehicle.getStableCenter();
        const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(new THREE.Vector3(0, this.camHeight, this.camDist).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.virtualHeading)));
        this.camera.position.copy(targetCamPos); this.camera.lookAt(new THREE.Vector3(pos.x, pos.y + 1, pos.z));
    }

    updateUI() {
        let speed = Math.abs(this.vehicle.chassisBody.velocity.length() * 3.6);
        const speedEl = document.getElementById('speed-val');
        const gearEl = document.getElementById('gear-val');
        const boostBar = document.getElementById('boost-bar');
        const rpmBar = document.getElementById('rpm-bar');
        const energyBar = document.getElementById('energy-bar');
        const healthBar = document.getElementById('health-bar');
        const mineEl = document.getElementById('mine-ammo');
        const bpsEl = document.getElementById('bps-val');
        const livesEl = document.getElementById('lives-display');
        if (speedEl) speedEl.innerText = speed.toFixed(0);
        if (gearEl) gearEl.innerText = this.currentGear + 1;
        if (boostBar) boostBar.style.width = `${this.nitro}%`;
        if (rpmBar) rpmBar.style.width = `${Math.min(100, (speed / 280) * 100)}%`;
        if (energyBar) energyBar.style.width = `${this.energy}%`;
        if (healthBar) healthBar.style.width = `${(this.vehicle.health / this.vehicle.healthMax) * 100}%`;
        if (mineEl) mineEl.innerText = `MINES: ${this.mineAmmo} / 7`;
        if (bpsEl) bpsEl.innerText = `BPS: ${this.currentBPS.toFixed(1)}`;
        if (livesEl) livesEl.innerText = `LIVES: ${this.lives}`;
        const aliveEl = document.getElementById('enemy-count');
        if (aliveEl) aliveEl.innerText = `ENEMIES: ${this.aiControllers.filter(a => !a.vehicle.isDead).length} | M:${this.missionIndex} P:${this.prestige} S:${this.enemiesSpawned?'Y':'N'}`;
    }

    dispose() {
        this.isDisposed = true;
        window.removeEventListener('keydown', this._keydownRef);
        window.removeEventListener('keyup', this._keyupRef);
        window.removeEventListener('mousedown', this._mousedownRef);
        window.removeEventListener('mouseup', this._mouseupRef);
        window.removeEventListener('wheel', this._wheelRef);
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
}
