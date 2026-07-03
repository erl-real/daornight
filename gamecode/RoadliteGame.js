import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArcadeVehicle } from './ArcadeVehicle.js';
import { AudioManager } from './AudioManager.js';
import { RoadliteEnemy } from './RoadliteEnemy.js';
import { Projectiles } from './Projectiles.js';
import { BULLET_TYPES } from './StoryData.js';

const GROUPS = { GROUND: 1, OBSTACLE: 2, BALL: 4, PLAYER: 8 };
const MAP_SIZE = 300;
const MATCH_DURATION = 20 * 60;
const SPAWN_INTERVAL_BASE = 2;

export class RoadliteGame {
    constructor(carType) {
        this.isDisposed = false;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        this.audio = new AudioManager();
        this.slickMat = new CANNON.Material('slick');

        this.selectedCarType = carType || '35-impala';

        this.initPhysics();
        this.initGraphics();
        this.initMap();
        this.initInput();

        this.vehicle = new ArcadeVehicle(this.scene, this.world, {
            position: new CANNON.Vec3(0, 5, 0),
            collisionFilterGroup: GROUPS.PLAYER,
            collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER,
            material: this.slickMat,
            carType: this.selectedCarType
        });
        this.player = this.vehicle;

        this.projectiles = new Projectiles(this.scene, this.world);

        this.energy = 100;
        this.nitro = 100;
        this.mineAmmo = 7;
        this.currentGear = 0;
        this.lastJumpTime = 0;
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
        this.shieldActive = false;
        this.shieldTimer = 0;

        this.lastFireTime = 0;
        this.fireStartTime = 0;
        this.isFiring = false;
        this.currentBPS = 0;
        this.lastMineTime = 0;
        this.mineCooldown = 3000;
        this.zeroSpeedTimer = 0;
        this.lastDriftPressTime = 0;

        this.weaponInventory = ['ult'];
        this.currentWeaponIndex = 0;

        this.keys = {};
        this.input = { inputBuffer: [], lastInputTime: 0, pushCombo(dir) { this.inputBuffer.push(dir); if (this.inputBuffer.length > 3) this.inputBuffer.shift(); this.lastInputTime = Date.now(); } };
        this.gearStickReset = true;
        this.dpadReset = true;
        this.dpadUpReset = true;
        this.dpadDownReset = true;
        this._l3Prev = false;
        this._prevR1 = false;

        this.pauseMenuEl = document.getElementById('pause-menu');
        this.deathOverlay = document.getElementById('death-overlay');
        this.gameOverOverlay = document.getElementById('game-over-overlay');
        if (this.deathOverlay) this.deathOverlay.style.display = 'none';
        if (this.gameOverOverlay) this.gameOverOverlay.style.display = 'none';

        this.matchTime = 0;
        this.matchEnded = false;
        this.kills = 0;
        this.xp = 0;
        this.xpToNext = 50;
        this.level = 0;
        this.speedBonus = 0;
        this.spawnTimer = 0;
        this.spawnInterval = SPAWN_INTERVAL_BASE;
        this.enemies = [];
        this.enemiesPerWave = 2;
        this.waveTimer = 0;
        this.waveMinute = 0;
        this.levelUpPending = false;
        this.levelUpChoices = [];

        this._warmupFrames = 4;

        this.animate();
    }

    initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.solver.iterations = 3;
        this.world.addContactMaterial(new CANNON.ContactMaterial(this.slickMat, this.slickMat, { friction: 0.0, restitution: 0.0 }));
        const groundBody = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.GROUND, material: this.slickMat });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
    }

    initGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111118);

        const grassGeo = new THREE.PlaneGeometry(MAP_SIZE * 4, MAP_SIZE * 4);
        const grassMat = new THREE.MeshPhongMaterial({ color: 0x1a3a1a });
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = 0.01;
        this.scene.add(grass);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        if (!window._sharedRenderer) {
            window._sharedRenderer = new THREE.WebGLRenderer({ antialias: true });
            window._sharedRenderer.setSize(window.innerWidth, window.innerHeight);
        }
        this.renderer = window._sharedRenderer;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const container = document.getElementById('game-layer') || document.body;
        container.appendChild(this.renderer.domElement);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(50, 100, 50);
        this.scene.add(sun);

        const skyboxPath = 'art/skys/SBS - Cloudy Skyboxes - Panorama/Panorama/Panorama_Sky_21-512x512.png';
        const loader = new THREE.TextureLoader();
        loader.load(skyboxPath, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            this.scene.background = texture;
            this.scene.environment = texture;
        });
    }

    initMap() {
        const half = MAP_SIZE;
        for (let i = 0; i < 30; i++) {
            const px = (Math.random() - 0.5) * half * 2;
            const pz = (Math.random() - 0.5) * half * 2;
            if (Math.abs(px) < 30 && Math.abs(pz) < 30) continue;
            const w = 4 + Math.random() * 10;
            const h = 2 + Math.random() * 6;
            const d = 4 + Math.random() * 10;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: 0x333355 }));
            mesh.position.set(px, h / 2, pz);
            this.scene.add(mesh);
            const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.OBSTACLE, material: this.slickMat, position: new CANNON.Vec3(px, h / 2, pz) });
            body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
            this.world.addBody(body);
        }
    }

    initInput() {
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
            this.energy -= 40;
            this.input.inputBuffer = [];
            this.vehicle.jump(36);
            this.lastJumpTime = now;
        } else {
            this.vehicle.jump(24);
            this.lastJumpTime = now;
        }
    }

    toggleShield(active) {
        if (active && !this.shieldActive && this.energy > 5) {
            this.shieldActive = true;
            this.shieldTimer = 4.0;
            this.energy = 0;
            if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = true;
        }
        if (!active) this.shieldActive = false;
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.pauseMenuEl) this.pauseMenuEl.style.display = this.isPaused ? 'flex' : 'none';
    }

    rotateWeapon(dir) {
        this.currentWeaponIndex = (this.currentWeaponIndex + dir + this.weaponInventory.length) % this.weaponInventory.length;
        this.updateWeaponUI();
    }

    updateWeaponUI() {
        const type = this.weaponInventory[this.currentWeaponIndex];
        const nameEl = document.getElementById('wep-name');
        if (nameEl) nameEl.innerText = type === 'ult' ? 'ULTIMATE' : type.toUpperCase();
    }

    updateInput(dt) {
        if (this.levelUpPending) return 0;
        const gp = this.getGamepad();
        const keys = this.keys;
        const isGrounded = this.vehicle.isTrulyGrounded;

        if (this.matchEnded && gp) {
            if (gp.buttons[0]?.pressed || gp.buttons[9]?.pressed) {
                window.returnToMenu();
            }
        }

        if (!this.levelUpPending) {
            const shootingPressed = keys['KeyF'] || (gp && gp.buttons[2]?.pressed);
            if (shootingPressed) { if (!this.isFiring) { this.fireStartTime = Date.now(); this.isFiring = true; } this.fireBullet(); } else { this.isFiring = false; this.currentBPS = 0; }

            if (keys['KeyE'] || (gp && gp.buttons[1]?.pressed)) this.fireMine();

            if (keys['KeyQ'] || (gp && gp.buttons[0]?.pressed)) this.fireWeapon();

            this.toggleShield(keys['KeyY'] || (gp && gp.buttons[3]?.pressed));
        }

        let steerDir = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
        if (gp && Math.abs(gp.axes[0]) > 0.1) steerDir = -gp.axes[0];

        const leanHeld = keys['KeyL'] || (gp && gp.buttons[10]?.pressed);

        if (gp && this.vehicle.hoverMode && gp.buttons[10]?.pressed && !this._l3Prev) {
            this.vehicle.toggleHover();
        }
        this._l3Prev = gp ? !!gp.buttons[10]?.pressed : false;

        let throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
        let airPitch = throttle;
        let spinDir = 0;
        if (gp && Math.abs(gp.axes[1]) > 0.1) airPitch = -gp.axes[1];
        if (gp && Math.abs(gp.axes[2]) > 0.1) spinDir = -gp.axes[2];

        if (!isGrounded && !this.vehicle.hoverMode && leanHeld && !this.vehicle.isAirFlipping) {
            const flipX = Math.abs(steerDir) > 0.5 ? Math.sign(steerDir) : 0;
            const flipY = Math.abs(airPitch) > 0.5 ? Math.sign(airPitch) : 0;
            const flipZ = Math.abs(spinDir) > 0.3 ? spinDir : 0;
            const energyCost = (flipX !== 0 ? 20 : 0) + (flipY !== 0 ? 20 : 0) + (flipZ !== 0 ? 10 : 0);
            if ((flipX !== 0 || flipY !== 0 || flipZ !== 0) && this.energy >= energyCost) {
                this.energy -= energyCost;
                this.vehicle.performAirFlip(flipX, flipY, flipZ);
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
            if (gp.buttons[11]?.pressed && Date.now() - this.lastJumpTime > 1000) this.handleJump();

            const f = gp.buttons[7]?.value || 0, r = gp.buttons[6]?.value || 0;
            if (Math.abs(f) > 0.05 || Math.abs(r) > 0.05) throttle = f - r;

            const rsY = gp.axes[3];
            const l3Held = gp.buttons[10]?.pressed;
            if (this.gearStickReset) {
                if (rsY < -0.5) {
                    this.currentGear = Math.min(5, this.currentGear + 1);
                    if (!l3Held) this.input.pushCombo('up');
                    this.gearStickReset = false;
                }
                else if (rsY > 0.5) {
                    this.currentGear = Math.max(0, this.currentGear - 1);
                    if (!l3Held) this.input.pushCombo('down');
                    this.gearStickReset = false;
                }
            } else if (Math.abs(rsY) < 0.2) this.gearStickReset = true;

            if (gp.buttons[12]?.pressed) { if (this.dpadUpReset) { this.input.pushCombo('up'); this.dpadUpReset = false; } } else this.dpadUpReset = true;
            if (gp.buttons[13]?.pressed) { if (this.dpadDownReset) { this.input.pushCombo('down'); this.dpadDownReset = false; } } else this.dpadDownReset = true;

            if (this.dpadReset) {
                if (gp.buttons[14]?.pressed) { this.rotateWeapon(-1); this.dpadReset = false; }
                else if (gp.buttons[15]?.pressed) { this.rotateWeapon(1); this.dpadReset = false; }
            } else if (!gp.buttons[14]?.pressed && !gp.buttons[15]?.pressed) this.dpadReset = true;
        }

        const canAct = this.vehicle.hoverMode || isGrounded;
        const r1Pressed = gp && gp.buttons[5]?.pressed;
        if (r1Pressed && !this._prevR1) this.driftToggled = !this.driftToggled;
        this._prevR1 = r1Pressed;
        this.vehicle.isDrifting = (keys['ShiftLeft'] || keys['Space'] || r1Pressed || this.driftToggled) && canAct && Math.abs(steerDir) > 0.01;
        if (this.vehicle.isDrifting) this.vehicle.driftAngle += (steerDir * Math.PI / 4 - this.vehicle.driftAngle) * 0.1; else this.vehicle.driftAngle *= 0.9;
        if (this.driftToggled && (Math.abs(steerDir) <= 0.01 || this.vehicle.chassisBody.velocity.length() * 2.237 < 30)) this.driftToggled = false;

        this.vehicle.airPitchInput = airPitch;

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

        this.vehicle.applyInputs(throttle, keys['Space'] || (gp && gp.buttons[5]?.pressed));
        return steerDir;
    }

    fireBullet() {
        const now = Date.now(); const dur = (now - this.fireStartTime) / 1000;
        const cfg = BULLET_TYPES.machinegun;
        const bps = cfg.bpsBase + cfg.bpsRamp * Math.exp(-0.4 * dur); this.currentBPS = bps;
        if (now - this.lastFireTime < 1000 / bps) return; this.lastFireTime = now;
        const yaw = this.vehicle.carMesh.rotation.y; const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        this.projectiles.fireBullet(this.vehicle.chassisBody.position, forward, dur, this.vehicle, 'machinegun', 1, 1);
    }

    fireWeapon() {
        const gp = this.getGamepad();
        const backfire = this.keys['KeyS'] || (gp && gp.axes[1] > 0.5);
        const yaw = this.vehicle.carMesh.rotation.y;
        const dir = backfire
            ? new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
            : new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        this.projectiles.fireBullet(this.vehicle.chassisBody.position, dir, 0, this.vehicle, 'shotgun', 2, 1);
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

    checkCollisions() {
        for (let i = this.projectiles.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles.projectiles[i];
            const pPos = p.mesh.position;
            let hit = false;

            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                const ePos = enemy.getPosition();
                const dx = pPos.x - ePos.x;
                const dy = pPos.y - ePos.y;
                const dz = pPos.z - ePos.z;
                if (Math.abs(dx) < 1.1 && Math.abs(dy) < 1.2 && Math.abs(dz) < 3.6) {
                    enemy.takeDamage(p.damage || 10);
                    hit = true;
                    if (enemy.isDead) this.onEnemyKilled(enemy);
                    break;
                }
            }

            if (hit) { this.scene.remove(p.mesh); this.projectiles.projectiles.splice(i, 1); continue; }

            if (p.mesh.position.y < -10) {
                this.scene.remove(p.mesh);
                this.projectiles.projectiles.splice(i, 1);
            }
        }
    }

    onEnemyKilled(enemy) {
        this.kills++;
        const xpGain = 10 + this.waveMinute * 2;
        this.xp += xpGain;
        this.energy = Math.min(100, this.energy + 20);
        this.nitro = Math.min(100, this.nitro + 10);

        if (this.xp >= this.xpToNext && !this.levelUpPending) {
            this.levelUp();
        }
    }

    levelUp() {
        this.levelUpPending = true;
        this.isPaused = true;
        this.xp -= this.xpToNext;
        this.xpToNext = Math.floor(this.xpToNext * 1.5);

        this.levelUpChoices = ['SPEED BOOST', 'SPEED BOOST', 'SPEED BOOST'];
        this.showLevelUpUI();
    }

    showLevelUpUI() {
        this.selectedUpgradeIndex = 0;
        const overlay = document.getElementById('level-up-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        const container = document.getElementById('level-up-choices');
        if (!container) return;
        container.innerHTML = '';
        this.levelUpCards = [];
        this.levelUpChoices.forEach((label, i) => {
            const card = document.createElement('div');
            card.style.cssText = 'padding:20px 30px;margin:8px;background:rgba(0,170,255,0.1);border:2px solid #0af;border-radius:8px;cursor:pointer;font-size:1.2em;color:#fff;text-align:center;transition:all 0.2s;';
            card.textContent = label;
            card.onmouseenter = () => { this.selectedUpgradeIndex = i; this.renderLevelUpSelection(); };
            card.onclick = () => this.applyUpgrade(i);
            container.appendChild(card);
            this.levelUpCards.push(card);
        });
        this.renderLevelUpSelection();
    }

    renderLevelUpSelection() {
        if (!this.levelUpCards) return;
        this.levelUpCards.forEach((card, i) => {
            if (i === this.selectedUpgradeIndex) {
                card.style.background = 'rgba(0,170,255,0.4)';
                card.style.borderColor = '#fff';
                card.style.transform = 'scale(1.05)';
            } else {
                card.style.background = 'rgba(0,170,255,0.1)';
                card.style.borderColor = '#0af';
                card.style.transform = 'none';
            }
        });
    }

    applyUpgrade(index) {
        this.level++;
        this.speedBonus += 0.1;
        if (this.vehicle.carConfig && this.vehicle.carConfig.stats) {
            this.vehicle.carConfig.stats.topSpeed = 1.0 + this.speedBonus;
            this.vehicle.carConfig.stats.accel = 1.0 + this.speedBonus;
        }
        this.vehicle.boostFactor = 1.0 + this.speedBonus * 0.5;
        this.vehicle.health = Math.min(this.vehicle.healthMax, this.vehicle.health + 20);
        this.energy = Math.min(100, this.energy + 30);
        this.nitro = Math.min(100, this.nitro + 30);

        const overlay = document.getElementById('level-up-overlay');
        if (overlay) overlay.style.display = 'none';
        this.levelUpPending = false;
        this.isPaused = false;
    }

    spawnEnemy() {
        const angle = Math.random() * Math.PI * 2;
        const radius = MAP_SIZE * 0.85;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const pos = new CANNON.Vec3(x, 5, z);

        let enemy;
        if (this.waveMinute >= 5) {
            enemy = new RoadliteEnemy(this.scene, this.world, pos, this.slickMat, 'big');
        } else if (this.waveMinute >= 2 && Math.random() < 0.3) {
            enemy = new RoadliteEnemy(this.scene, this.world, pos, this.slickMat, 'big');
        } else {
            enemy = new RoadliteEnemy(this.scene, this.world, pos, this.slickMat, 'normal');
        }

        const waveMult = 1 + this.waveMinute * 0.15;
        enemy.hp = Math.round(enemy.hp * waveMult);
        enemy.hpMax = enemy.hp;
        if (enemy.type === 'normal') {
            enemy.speedMult = (0.8 + Math.random() * 0.4) * (1 + this.waveMinute * 0.05);
        }
        this.enemies.push(enemy);
    }

    animate() {
        if (this.isDisposed) return;
        requestAnimationFrame(() => this.animate());

        if (this._warmupFrames > 0) {
            this.world.step(1 / 60, 1 / 60, 3);
            this.vehicle.update(1 / 60, 0, 0, false);
            this.renderer.render(this.scene, this.camera);
            this._warmupFrames--;
            return;
        }

        let dt = this.clock.getDelta();
        if (this.isPaused) {
            if (this.levelUpPending) {
                const gp = this.getGamepad();
                if (gp) {
                    if (gp.buttons[14]?.pressed && this.selectedUpgradeIndex > 0) { this.selectedUpgradeIndex--; this.renderLevelUpSelection(); }
                    if (gp.buttons[15]?.pressed && this.selectedUpgradeIndex < this.levelUpCards.length - 1) { this.selectedUpgradeIndex++; this.renderLevelUpSelection(); }
                    if (gp.buttons[0]?.pressed) { this.applyUpgrade(this.selectedUpgradeIndex); }
                }
                if (this.keys['ArrowLeft'] && this.selectedUpgradeIndex > 0) { this.selectedUpgradeIndex--; this.renderLevelUpSelection(); this.keys['ArrowLeft'] = false; }
                if (this.keys['ArrowRight'] && this.selectedUpgradeIndex < this.levelUpCards.length - 1) { this.selectedUpgradeIndex++; this.renderLevelUpSelection(); this.keys['ArrowRight'] = false; }
                if (this.keys['Enter']) { this.applyUpgrade(this.selectedUpgradeIndex); this.keys['Enter'] = false; }
            }
            this.renderer.render(this.scene, this.camera);
            return;
        }
        dt = Math.min(dt, 0.1);
        this.world.step(1 / 60, dt, 3);

        this.projectiles.update(Date.now());
        this.checkCollisions();

        if (this.matchEnded) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        this.matchTime += dt;

        if (this.matchTime >= MATCH_DURATION) {
            this.showMatchWon();
            return;
        }

        this.waveTimer += dt;
        const newMinute = Math.floor(this.matchTime / 60);
        if (newMinute > this.waveMinute) {
            this.waveMinute = newMinute;
            const extra = Math.floor(this.waveMinute / 2);
            this.enemiesPerWave = 2 + extra;
            this.spawnInterval = Math.max(0.4, SPAWN_INTERVAL_BASE - this.waveMinute * 0.08);
        }

        this.spawnTimer += dt;
        const maxEnemies = this.waveMinute >= 5 ? 15 : 40 + this.waveMinute * 5;
        if (this.spawnTimer >= this.spawnInterval && this.enemies.length < maxEnemies) {
            this.spawnTimer = 0;
            const count = this.waveMinute >= 5 ? 1 : Math.min(this.enemiesPerWave, 3);
            for (let i = 0; i < count; i++) {
                if (this.enemies.length < maxEnemies) this.spawnEnemy();
            }
        }

        const steerDir = this.updateInput(dt);
        if (!this.vehicle.isDead && !this.levelUpPending) {
            if (this.shieldActive) {
                this.shieldTimer -= dt;
                if (this.shieldTimer <= 0) {
                    this.shieldActive = false;
                    if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = false;
                }
            }
            this.energy = Math.min(100, this.energy + 10 * dt);
            this.nitro = Math.min(100, this.nitro + 5 * dt);
            this.vehicle.update(dt, this.virtualHeading, steerDir, this.isLeaningState);
        }

        const playerPos = this.vehicle.chassisBody.position;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.isDead) { this.enemies.splice(i, 1); continue; }
            e.update(dt, playerPos);

            const ePos = e.getPosition();
            const dx = playerPos.x - ePos.x;
            const dz = playerPos.z - ePos.z;
            const touchDist = e.type === 'big' ? 60 : 45;
            if (dx * dx + dz * dz < touchDist && !this.vehicle.isDead && e.canDamagePlayer()) {
                const dmg = e.type === 'big' ? 15 + this.waveMinute * 2 : 8 + this.waveMinute;
                this.vehicle.applyDamage(dmg);
                if (this.vehicle.isDead) this.showGameOver();
            }
        }

        if (this.deathOverlay) {
            const respawnText = document.getElementById('respawn-text');
            if (this.vehicle.isDead) {
                this.deathOverlay.style.display = 'flex';
                if (respawnText) respawnText.innerText = `GAME OVER`;
            } else {
                this.deathOverlay.style.display = 'none';
            }
        }

        if (!this.vehicle.isDead && this.vehicle.chassisBody.position.y < -10) {
            this.vehicle.chassisBody.position.set(this.vehicle.chassisBody.position.x, 5, this.vehicle.chassisBody.position.z);
            this.vehicle.chassisBody.velocity.set(0, 5, 0);
        }

        if (this.leanCooldown > 0) this.leanCooldown -= dt;
        this.updateCamera(dt);
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }

    updateCamera(dt) {
        const pos = this.vehicle.getStableCenter();
        const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(
            new THREE.Vector3(0, this.camHeight, this.camDist).applyQuaternion(
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.virtualHeading)
            )
        );
        this.camera.position.copy(targetCamPos);
        this.camera.lookAt(new THREE.Vector3(pos.x, pos.y + 1, pos.z));
    }

    updateUI() {
        const timerEl = document.getElementById('roadlite-timer');
        const killsEl = document.getElementById('roadlite-kills');
        const levelEl = document.getElementById('roadlite-level');
        const xpBar = document.getElementById('roadlite-xp-bar');
        const xpLabel = document.getElementById('roadlite-xp-label');
        const healthBarEl = document.getElementById('health-bar');
        const mineAmmoEl = document.getElementById('mine-ammo');

        if (timerEl) {
            const remaining = Math.max(0, MATCH_DURATION - this.matchTime);
            const mins = Math.floor(remaining / 60);
            const secs = Math.floor(remaining % 60);
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        if (killsEl) killsEl.textContent = `KILLS: ${this.kills}`;
        if (levelEl) levelEl.textContent = `LV ${this.level}`;
        if (xpBar) xpBar.style.width = `${(this.xp / this.xpToNext) * 100}%`;
        if (xpLabel) xpLabel.textContent = `${this.xp} / ${this.xpToNext} XP`;
        if (healthBarEl) healthBarEl.style.width = `${this.vehicle.health}%`;
        if (mineAmmoEl) mineAmmoEl.textContent = `MINES: ${this.mineAmmo} / 7`;
    }

    showMatchWon() {
        this.matchEnded = true;
        this.isPaused = true;
        if (this.gameOverOverlay) {
            this.gameOverOverlay.style.display = 'flex';
            const labelEl = document.getElementById('game-over-label');
            if (labelEl) labelEl.innerText = 'ROADLITE COMPLETE!';
            document.getElementById('stat-time').innerText = '20:00';
            document.getElementById('stat-kills').innerText = this.kills;
        }
    }

    showGameOver() {
        this.matchEnded = true;
        this.isPaused = true;
        if (this.gameOverOverlay) {
            this.gameOverOverlay.style.display = 'flex';
            const labelEl = document.getElementById('game-over-label');
            if (labelEl) labelEl.innerText = 'GAME OVER';
            const mins = Math.floor(this.matchTime / 60);
            const secs = Math.floor(this.matchTime % 60);
            document.getElementById('stat-time').innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            document.getElementById('stat-kills').innerText = this.kills;
        }
    }

    dispose() {
        this.isDisposed = true;
        window.removeEventListener('keydown', this._keydownRef);
        window.removeEventListener('keyup', this._keyupRef);
        window.removeEventListener('mousedown', this._mousedownRef);
        window.removeEventListener('mouseup', this._mouseupRef);
        window.removeEventListener('wheel', this._wheelRef);
        if (this.audio) this.audio.dispose();
        for (const e of this.enemies) {
            if (!e.isDead) e.die();
        }
        this.enemies = [];
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
