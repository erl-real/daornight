import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArcadeVehicle } from './ArcadeVehicle.js';
import { CONFIG } from './Config.js';



const ARROWS = ['Up', 'UpRight', 'Right', 'DownRight', 'Down', 'DownLeft', 'Left', 'UpLeft'];
const ARROW_ANGLES = [90, 45, 0, 315, 270, 225, 180, 135];
const SECTOR_HALF = 22.5;
const ARROWS_4 = ['Up', 'Right', 'Down', 'Left'];
const ARROW_ANGLES_4 = [90, 0, 270, 180];
const SECTOR_HALF_4 = 45;
const GROUPS = { GROUND: 1, OBSTACLE: 2, PLAYER: 8 };

const HIT_WINDOW = 0.25;
const HOLD_THRESHOLD = 2.0;
const RECORD_DEBOUNCE_MS = 80;
const PL_KEY = 'roadknight_pl_charts';
const TRACK_SCROLL_SPEED = 300;
const BOUNCE_RHYTHM_WINDOW = 0.3;
const JUMP_LANDING_WINDOW = 0.2;
const MAX_BOUNCE_STACK = 10;
const MAX_JUMP_STACK = 5;

const ARROW_COLORS = {
    Up: '#00ff4f',
    UpRight: '#72afff',
    Right: '#5170ff',
    DownRight: '#cb6ce6',
    Down: '#db3781',
    DownLeft: '#ff2f2f',
    Left: '#ff9f1f',
    UpLeft: '#fffd19'
};

const KB_MAP = {
    'ArrowUp': 'Up', 'KeyW': 'Up',
    'ArrowRight': 'Right', 'KeyD': 'Right',
    'ArrowDown': 'Down', 'KeyS': 'Down',
    'ArrowLeft': 'Left', 'KeyA': 'Left'
};

function arrowFromAngle(deg, arrows, angles, sectorHalf) {
    arrows = arrows || ARROWS;
    angles = angles || ARROW_ANGLES;
    sectorHalf = sectorHalf || SECTOR_HALF;
    for (let i = 0; i < angles.length; i++) {
        let diff = Math.abs(deg - angles[i]);
        if (diff > 180) diff = 360 - diff;
        if (diff <= sectorHalf) return arrows[i];
    }
    return arrows[0];
}

function angleForArrow(arrow, arrows, angles) {
    arrows = arrows || ARROWS;
    angles = angles || ARROW_ANGLES;
    const idx = arrows.indexOf(arrow);
    return idx >= 0 ? angles[idx] : 0;
}

function loadCharts() {
    try { return JSON.parse(localStorage.getItem(PL_KEY) || '{}'); } catch { return {}; }
}

function saveCharts(charts) {
    localStorage.setItem(PL_KEY, JSON.stringify(charts));
}

function downloadJSON(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}

export class ParkingLot {
    constructor(config = {}) {
        this.isDisposed = false;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        this.slickMat = new CANNON.Material('slick');

        this.selectedCarType = config.car || '35-impala';
        this.songFile = config.song || null;
        this.difficulty = config.difficulty || 'medium';
        this.isDevMode = config.devMode === true;
        this.chartName = config.chartName || 'untitled';
        this.customUrl = config.customUrl || null;
        this.customUrlType = config.customUrlType || null;
        this.ytVideoId = config.ytVideoId || null;
        this.videoElement = null;
        this._ytPlayIframe = null;
        this._fourDir = this.difficulty === 'easy';
        this.arrowNames = this._fourDir ? ARROWS_4 : ARROWS;
        this.arrowAngles = this._fourDir ? ARROW_ANGLES_4 : ARROW_ANGLES;
        this.sectorHalf = this._fourDir ? SECTOR_HALF_4 : SECTOR_HALF;

        this.notes = [];
        this.recording = [];
        this._lastRecordTime = 0;
        this._autoMissedTap = false;
        this.songStartTime = 0;
        this.isPlaying = false;
        this.isFinished = false;
        this.hitNotes = 0;
        this.missedNotes = 0;
        this.totalNotes = 0;
        this.currentNoteIndex = 0;
        this.currentArrow = null;
        this.lastArrow = null;
        this.stickDeadzone = 0.3;
        this.lastStickAngle = null;
        this.fadeIn = 0;
        this._keys = {};

        this._pressTime = 0;
        this._pressArrow = null;
        this._pressIsGamepad = false;
        this._firstPressArrow = null;
        this._firstPressTime = 0;

        this.bounceStack = 0;
        this._lastBounceTime = 0;
        this._lastBounceArrow = null;
        this._bounceDecayTimer = null;

        this.jumpStack = 0;
        this._inAir = false;
        this._landingTime = 0;
        this._lastJumpTime = 0;
        this._jumpCooldown = false;
        this._jumpHold = false;
        this._r3Held = false;

        this._keydownRef = (e) => {
            if (e.repeat) return;
            if (e.code === 'Escape') { this.togglePause(); return; }
            if (e.code === 'Space') {
                if (!this._jumpHold) {
                    this.doJump();
                    if (this.isDevMode && this.isPlaying) this.recordJump();
                    if (!this.isDevMode && this.isPlaying && !this.isFinished) this.checkJump(performance.now());
                    this._jumpHold = true;
                }
                return;
            }
            this._keys[e.code] = true;
            this.handleKeyboardArrow(e.code, true);
        };
        this._keyupRef = (e) => {
            if (e.code === 'Space') { this._jumpHold = false; return; }
            this._keys[e.code] = false;
            this.handleKeyboardArrow(e.code, false);
        };
        window.addEventListener('keydown', this._keydownRef);
        window.addEventListener('keyup', this._keyupRef);

        this.initPhysics();
        this.initGraphics();
        this.initCar();
        this.createHUD();
        this.startSong();
        this.animate();
    }

    handleKeyboardArrow(code, pressed) {
        if (this.isPaused) return;
        const arrow = KB_MAP[code];
        if (!arrow) return;
        if (this._fourDir && !this.arrowNames.includes(arrow)) return;

        if (pressed) {
            this._pressArrow = arrow;
            this._pressTime = performance.now();
            this._pressIsGamepad = false;
            this.currentArrow = arrow;
            this.applyHydraulics(arrow);
            if (!this.isDevMode && this.isPlaying && !this.isFinished) {
                if (!this._fourDir) this.checkHoldStart(arrow, performance.now());
            }
        } else {
            if (this._pressArrow === arrow && this._pressTime > 0) {
                const held = (performance.now() - this._pressTime) / 1000;
                const now = performance.now();
                if (this.isDevMode && this.isPlaying) {
                    if (this._fourDir) {
                        this.recordNote(arrow);
                    } else if (held < HOLD_THRESHOLD) {
                        this.recordNote(arrow);
                    } else {
                        this.recordNoteEnd(arrow, arrow, this._pressTime);
                    }
                }
                if (!this.isDevMode && this.isPlaying && !this.isFinished) {
                    if (!this._fourDir && this._pendingHoldNote) {
                        this.checkHoldEnd(arrow, now);
                    } else {
                        this.checkHit(arrow, now);
                    }
                }
                this._pressArrow = null;
                this._pressTime = 0;
            }
            const anyPressed = Object.keys(KB_MAP).some(k => this._keys[k]);
            if (!anyPressed) {
                this.currentArrow = null;
                this.vehicle.hydraulics.targetPitch = 0;
                this.vehicle.hydraulics.targetRoll = 0;
                this.vehicle.hydraulics.targetLift = 0;
                this.dirLabelEl.textContent = '--';
            }
        }
    }

    doJump() {
        if (!this.vehicle || !this.vehicle.chassisBody) return;
        const body = this.vehicle.chassisBody;
        const now = performance.now();

        let jumpMult = 1;
        const sinceLanding = (now - this._landingTime) / 1000;
        if (sinceLanding < JUMP_LANDING_WINDOW && !this._inAir && this.jumpStack > 0) {
            this.jumpStack = Math.min(this.jumpStack + 1, MAX_JUMP_STACK);
            jumpMult = 1 + this.jumpStack * 0.4;
        } else if (!this._inAir) {
            this.jumpStack = 1;
            jumpMult = 1.4;
        } else {
            return;
        }

        const baseImpulse = 3;
        body.velocity.y = Math.min(body.velocity.y + baseImpulse * jumpMult, 12);
        this._inAir = true;
        this._lastJumpTime = now;
    }

    getGamepad() {
        return Array.from(navigator.getGamepads()).find(g => g !== null);
    }

    getStickArrow(gp) {
        if (!gp) return null;
        const x = gp.axes[2] || 0;
        const y = gp.axes[3] || 0;
        const mag = Math.sqrt(x * x + y * y);
        if (mag < this.stickDeadzone) return null;

        let deg = Math.atan2(-y, x) * (180 / Math.PI);
        if (deg < 0) deg += 360;

        return { arrow: arrowFromAngle(deg, this.arrowNames, this.arrowAngles, this.sectorHalf), angle: deg, mag, rawX: x, rawY: y };
    }

    recordNote(arrow) {
        const now = performance.now();
        if (now - this._lastRecordTime < RECORD_DEBOUNCE_MS) return;
        this._lastRecordTime = now;
        const elapsed = (now - this.songStartTime) / 1000;
        this.recording.push({
            type: 'tap',
            time: parseFloat(elapsed.toFixed(3)),
            arrow: arrow
        });
    }

    recordJump() {
        const now = performance.now();
        if (now - this._lastRecordTime < RECORD_DEBOUNCE_MS) return;
        this._lastRecordTime = now;
        const elapsed = (now - this.songStartTime) / 1000;
        this.recording.push({
            type: 'jump',
            time: parseFloat(elapsed.toFixed(3))
        });
    }

    recordNoteEnd(arrow, endArrow, startTime) {
        const elapsed = (startTime - this.songStartTime) / 1000;
        const endElapsed = (performance.now() - this.songStartTime) / 1000;
        this.recording.push({
            type: 'hold',
            time: parseFloat(elapsed.toFixed(3)),
            arrow: arrow,
            endTime: parseFloat(endElapsed.toFixed(3)),
            endArrow: endArrow
        });
    }

    tryBounceStack(arrow, now) {
        const sinceLast = (now - this._lastBounceTime) / 1000;
        if (arrow === this._lastBounceArrow && sinceLast < BOUNCE_RHYTHM_WINDOW * 2 && sinceLast > BOUNCE_RHYTHM_WINDOW * 0.5) {
            this.bounceStack = Math.min(this.bounceStack + 1, MAX_BOUNCE_STACK);
        } else {
            this.bounceStack = 0;
        }
        this._lastBounceTime = now;
        this._lastBounceArrow = arrow;

        if (this._bounceDecayTimer) clearTimeout(this._bounceDecayTimer);
        this._bounceDecayTimer = setTimeout(() => {
            this.bounceStack = Math.max(0, this.bounceStack - 2);
        }, 2000);
    }

    applyHydraulics(arrow) {
        const a = angleForArrow(arrow, this.arrowNames, this.arrowAngles) * Math.PI / 180;
        const rawR = Math.cos(a);
        const rawP = Math.sin(a);
        const bounceMult = 1 + this.bounceStack * 0.15;

        this.vehicle.hydraulics.targetRoll = rawR * 0.8 * bounceMult;
        this.vehicle.hydraulics.targetPitch = rawP * 0.8 * bounceMult;
        this.vehicle.hydraulics.targetLift = Math.max(0, -rawP * 0.8 * bounceMult);
        this.dirLabelEl.textContent = arrow;
    }

    updateInput() {
        if (this.currentArrow) return;
        const gp = this.getGamepad();
        const stick = this.getStickArrow(gp);

        if (stick) {
            this.applyHydraulics(stick.arrow);

            if (stick.arrow !== this.lastArrow) {
                const now = performance.now();

                if (this.lastArrow === null) {
                    // Fresh press from neutral
                    this._firstPressArrow = stick.arrow;
                    this._firstPressTime = now;
                    this._pressArrow = stick.arrow;
                    this._pressTime = now;
                    this._pressIsGamepad = true;
                    if (!this.isDevMode && this.isPlaying && !this.isFinished) {
                        if (!this._fourDir) this.checkHoldStart(stick.arrow, now);
                    }
                } else {
                    // Direction slide
                    if (this._pressIsGamepad) {
                        if (!this.isDevMode && this.isPlaying && !this.isFinished) {
                            if (!this._fourDir) {
                                if (this._pendingHoldNote) this.checkHoldEnd(stick.arrow, now);
                                this.checkHoldStart(stick.arrow, now);
                            }
                        }
                    }
                    this._pressArrow = stick.arrow;
                    this._pressTime = now;
                    this._pressIsGamepad = true;
                }
                this.lastArrow = stick.arrow;
            }
        } else {
            // Stick released to neutral
            if (this._pressArrow && this._pressIsGamepad) {
                const now = performance.now();
                if (this.isDevMode && this.isPlaying) {
                    if (this._fourDir) {
                        this.recordNote(this._firstPressArrow);
                    } else {
                        const totalHeld = (now - this._firstPressTime) / 1000;
                        if (totalHeld < HOLD_THRESHOLD) {
                            this.recordNote(this._firstPressArrow);
                        } else {
                            this.recordNoteEnd(this._firstPressArrow, this._pressArrow, this._firstPressTime);
                        }
                    }
                }
                if (!this.isDevMode && this.isPlaying && !this.isFinished) {
                    if (!this._fourDir && this._pendingHoldNote) {
                        this.checkHoldEnd(this._pressArrow, now);
                    } else {
                        this.checkHit(this._pressArrow, now);
                    }
                }
                this._pressArrow = null;
                this._pressTime = 0;
                this._firstPressArrow = null;
                this._firstPressTime = 0;
            }
            this.lastArrow = null;
            const anyKey = Object.keys(this._keys).some(k => this._keys[k]);
            if (!anyKey && !this._jumpHold) {
                this.vehicle.hydraulics.targetPitch = 0;
                this.vehicle.hydraulics.targetRoll = 0;
                this.vehicle.hydraulics.targetLift = 0;
                this.dirLabelEl.textContent = '--';
            }
        }
    }

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
        this.scene.background = new THREE.Color(0x222233);

        const gridHelper = new THREE.GridHelper(200, 40, 0x444466, 0x333355);
        gridHelper.position.y = 0.01;
        this.scene.add(gridHelper);

        const asphaltMat = new THREE.MeshPhongMaterial({ color: 0x333344 });
        const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), asphaltMat);
        asphalt.rotation.x = -Math.PI / 2;
        asphalt.position.y = 0;
        this.scene.add(asphalt);

        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.5 });
        for (let i = -8; i <= 8; i++) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 180), lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(i * 10 + 5, 0.02, 0);
            this.scene.add(line);
        }
        for (let i = -8; i <= 8; i++) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(180, 0.3), lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(0, 0.02, i * 10 + 5);
            this.scene.add(line);
        }

        for (let i = 0; i < 8; i++) {
            const poleGeo = new THREE.CylinderGeometry(0.15, 0.2, 4);
            const poleMat = new THREE.MeshBasicMaterial({ color: 0x888899 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            const angle = (i / 8) * Math.PI * 2;
            pole.position.set(Math.cos(angle) * 60, 2, Math.sin(angle) * 60);
            this.scene.add(pole);

            const lightMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.4), lightMat);
            light.position.set(Math.cos(angle) * 60, 4, Math.sin(angle) * 60);
            this.scene.add(light);

            const pl = new THREE.PointLight(0xffdd88, 0.5, 30);
            pl.position.copy(light.position);
            this.scene.add(pl);
        }

        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
        this.camera.position.set(8, 5, 8);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const container = document.getElementById('game-layer') || document.body;
        container.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0x8888ff, 0x444466, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 0.6);
        sun.position.set(10, 20, 10);
        this.scene.add(sun);

        if (this.customUrl) {
            if (this.customUrlType === 'direct') {
                const video = document.createElement('video');
                video.src = this.customUrl;
                video.crossOrigin = 'anonymous';
                video.playsInline = true;
                video.preload = 'auto';
                video.loop = false;
                video.muted = false;
                video.volume = 1.0;
                video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';
                document.body.appendChild(video);
                this.videoElement = video;
                video.load();
            } else if (this.customUrlType === 'youtube' && this.ytVideoId) {
                const iframe = document.createElement('iframe');
                iframe.src = 'https://www.youtube-nocookie.com/embed/' + this.ytVideoId
                    + '?autoplay=0&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&enablejsapi=1&loop=1';
                iframe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;border:none;';
                iframe.allow = 'autoplay; encrypted-media';
                iframe.title = 'YouTube';
                document.body.appendChild(iframe);
                this._ytPlayIframe = iframe;
            }
        }
    }

    initCar() {
        this.vehicle = new ArcadeVehicle(this.scene, this.world, {
            position: new CANNON.Vec3(0, 3, 0),
            collisionFilterGroup: GROUPS.PLAYER,
            collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE,
            material: this.slickMat,
            carType: this.selectedCarType
        });

        this.vehicle.chassisBody.fixedRotation = true;
        this.vehicle.chassisBody.updateMassProperties();
        this.vehicle.chassisBody.velocity.set(0, 0, 0);

        const box = new THREE.Box3().setFromObject(this.vehicle.carMesh);
        const size = box.getSize(new THREE.Vector3());
        this.vehicle.carMesh.position.y += size.y * 0.3;
    }

    createHUD() {
        const existing = document.getElementById('pl-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'pl-hud';
        hud.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;font-family:monospace;';

        hud.innerHTML = `
            <div id="pl-score" style="position:absolute;top:20px;left:20px;color:#0ff;font-size:1.2em;">SCORE: 0%</div>
            <div id="pl-mode-label" style="position:absolute;top:20px;right:20px;color:#ff0;font-size:0.8em;opacity:0.6;">DEV MODE</div>
            <div id="pl-timer" style="position:absolute;top:45px;left:20px;color:#888;font-size:0.7em;">0.00s</div>
            <div id="pl-combo" style="position:absolute;bottom:90px;left:50%;transform:translateX(-50%);color:#0f0;font-size:2em;font-weight:bold;text-shadow:0 0 10px rgba(0,255,0,0.5);opacity:0;transition:opacity 0.1s;"></div>
            <div id="pl-info" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:#666;font-size:0.7em;text-align:center;">
                ARROWS/STICK TO BOUNCE | SPACE TO JUMP | ESC PAUSE
            </div>
            <div id="pl-next-dir" style="position:absolute;top:80px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center;opacity:0.5;">
                <span style="color:#888;font-size:0.6em;">NEXT:</span>
                <span id="pl-next-label" style="color:#0af;font-size:1em;font-weight:bold;">--</span>
                <span id="pl-next-count" style="color:#555;font-size:0.6em;">0/0</span>
            </div>
            <div id="pl-notes-bar" style="position:absolute;bottom:270px;left:50%;transform:translateX(-50%);width:400px;height:20px;background:rgba(0,0,0,0.4);border-radius:3px;border:1px solid rgba(0,170,255,0.15);overflow:hidden;">
                <div id="pl-notes-progress" style="height:100%;width:0%;background:linear-gradient(to right,#0af,#0ff);transition:width 0.05s;border-radius:2px;"></div>
            </div>
            <canvas id="pl-track" style="position:absolute;bottom:300px;left:5%;width:90%;height:160px;border-radius:4px;"></canvas>
            <div id="pl-dir-label" style="position:absolute;bottom:130px;left:calc(50% - 60px);color:#0ff;font-size:1.2em;font-weight:bold;text-shadow:0 0 10px rgba(0,170,255,0.3);">--</div>
            <div id="pl-stack-display" style="position:absolute;bottom:130px;left:calc(50% + 30px);font-size:0.8em;display:flex;gap:12px;">
                <span id="pl-bounce-stack" style="color:#0ff;">BOUNCE: 0</span>
                <span id="pl-jump-stack" style="color:#f0f;">JUMP: 0</span>
            </div>
            <div id="pl-countdown" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:8em;font-weight:bold;color:#0af;text-shadow:0 0 40px rgba(0,170,255,0.5);display:none;">3</div>
            <div id="pl-countdown-label" style="position:absolute;top:calc(50% + 70px);left:50%;transform:translateX(-50%);color:#888;font-size:0.8em;display:none;">GET READY</div>
        `;

        document.getElementById('game-layer').appendChild(hud);

        this.scoreEl = document.getElementById('pl-score');
        this.modeLabelEl = document.getElementById('pl-mode-label');
        this.timerEl = document.getElementById('pl-timer');
        this.dirLabelEl = document.getElementById('pl-dir-label');
        this.comboEl = document.getElementById('pl-combo');
        this.nextLabelEl = document.getElementById('pl-next-label');
        this.nextCountEl = document.getElementById('pl-next-count');
        this.notesProgressEl = document.getElementById('pl-notes-progress');
        this.countdownEl = document.getElementById('pl-countdown');
        this.countdownLabelEl = document.getElementById('pl-countdown-label');
        this.bounceStackEl = document.getElementById('pl-bounce-stack');
        this.jumpStackEl = document.getElementById('pl-jump-stack');

        this.trackCanvas = document.getElementById('pl-track');
        this.trackCtx = this.trackCanvas.getContext('2d');
        this.resizeTrack();

        window.addEventListener('resize', () => this.resizeTrack());

        if (this.isDevMode) {
            this.modeLabelEl.textContent = 'DEV MODE';
            this.modeLabelEl.style.color = '#ff0';
            document.getElementById('pl-info').innerHTML = 'GET READY FOR COUNTDOWN';
        } else {
            this.modeLabelEl.textContent = 'PLAY MODE';
            this.modeLabelEl.style.color = '#0f0';
            document.getElementById('pl-info').innerHTML = 'MATCH THE ARROWS! STACK BOUNCES & JUMPS!';
        }
    }

    resizeTrack() {
        const rect = this.trackCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.trackCanvas.width = rect.width * dpr;
        this.trackCanvas.height = rect.height * dpr;
        this.trackCtx.scale(dpr, dpr);
        this._trackW = rect.width;
        this._trackH = rect.height;
    }

    async startSong() {
        if (!this.songFile) {
            this.isPlaying = true;
            this.songStartTime = performance.now();
            return;
        }

        if (!this.isDevMode) {
            const charts = loadCharts();
            const key = this.songFile + '#' + this.difficulty;
            let chart = charts[key];
            if (!chart) {
                const songBase = this.songFile.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
                const mapUrl = 'sound/songmaps/' + encodeURIComponent(songBase) + '.json';
                try {
                    const res = await fetch(mapUrl);
                    if (res.ok) {
                        const fileChart = await res.json();
                        const fileKey = fileChart.song + '#' + (fileChart.difficulty || 'medium');
                        charts[fileKey] = fileChart;
                        saveCharts(charts);
                        if (fileKey === key) chart = fileChart;
                    }
                } catch {}
            }
            if (chart && chart.notes && chart.notes.length > 0) {
                this.notes = chart.notes;
                this.totalNotes = this.notes.length;
                this.modeLabelEl.textContent = `PLAYING: ${chart.name || key}`;
            } else {
                this.modeLabelEl.textContent = 'NO CHART! RECORD IN DEV MODE FIRST';
                this.modeLabelEl.style.color = '#f44';
                this.totalNotes = 0;
            }
            this.currentNoteIndex = 0;
            this.hitNotes = 0;
            this.missedNotes = 0;
        }

        if (this.customUrl) {
            const video = this.videoElement;
            if (video) {
                this.songAudio = video;
                video.addEventListener('canplaythrough', () => {
                    this.beginCountdown(video);
                }, { once: true });
                video.addEventListener('error', () => {
                    this.beginCountdown(video);
                }, { once: true });
                if (video.readyState >= 2) {
                    this.beginCountdown(video);
                }
            } else if (this._ytPlayIframe) {
                this._initYTPlayback();
            }
            return;
        }

        const audio = new Audio();
        audio.src = 'sound/music/' + encodeURIComponent(this.songFile);
        audio.volume = 1.0;
        this.songAudio = audio;

        audio.addEventListener('canplaythrough', () => {
            this.beginCountdown(audio);
        }, { once: true });
        audio.addEventListener('error', () => {
            this.beginCountdown(audio);
        }, { once: true });
        audio.load();
        if (audio.readyState >= 2) {
            this.beginCountdown(audio);
        }
    }

    _initYTPlayback() {
        const iframe = this._ytPlayIframe;
        if (!iframe) { this.beginCountdown(() => {}); return; }

        const onIframeReady = () => {
            this.beginCountdown(() => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage(JSON.stringify({
                        event: 'command', func: 'playVideo', args: []
                    }), '*');
                }
            });
        };

        if (iframe.contentWindow && iframe.src) {
            onIframeReady();
        } else {
            iframe.addEventListener('load', onIframeReady, { once: true });
            setTimeout(() => { if (!this.isPlaying) this.beginCountdown(() => {}); }, 8000);
        }
    }

    beginCountdown(audioOrFn) {
        this.countdownEl.style.display = 'block';
        this.countdownLabelEl.style.display = 'block';
        let count = 3;
        this.countdownEl.textContent = count;
        this.countdownLabelEl.textContent = 'GET READY';

        this._countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.countdownEl.textContent = count;
            } else if (count === 0) {
                this.countdownEl.textContent = 'GO!';
                this.countdownEl.style.color = '#0f0';
                this.countdownLabelEl.textContent = '';
            } else {
                clearInterval(this._countdownInterval);
                this.countdownEl.style.display = 'none';
                this.countdownLabelEl.style.display = 'none';
                this.countdownEl.style.color = '#0af';

                if (typeof audioOrFn === 'function') {
                    audioOrFn();
                } else {
                    audioOrFn.currentTime = 0;
                    const playPromise = audioOrFn.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            this.countdownEl.style.display = 'block';
                            this.countdownEl.textContent = 'PRESS ANY KEY';
                            this.countdownEl.style.fontSize = '2em';
                            this.countdownEl.style.color = '#ff0';
                            const startOnInput = () => {
                                audioOrFn.play().catch(() => {});
                                this.countdownEl.style.display = 'none';
                                this.countdownEl.style.fontSize = '8em';
                                this.countdownEl.style.color = '#0af';
                                window.removeEventListener('keydown', startOnInput);
                                window.removeEventListener('click', startOnInput);
                            };
                            window.addEventListener('keydown', startOnInput);
                            window.addEventListener('click', startOnInput);
                        });
                    }
                }
                this.isPlaying = true;
                this.songStartTime = performance.now();
            }
        }, 1000);
    }

    renderTrack() {
        const ctx = this.trackCtx;
        const w = this._trackW;
        const h = this._trackH;
        if (!w || !h) return;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, w, h);

        const lineX = w * 0.12;
        const centerY = h / 2;
        const noteSize = 22;
        const elapsed = this.isPlaying ? (performance.now() - this.songStartTime) / 1000 : 0;

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(lineX, 6);
        ctx.lineTo(lineX, h - 6);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lineX + 1, centerY);
        ctx.lineTo(w - 6, centerY);
        ctx.stroke();

        for (let i = this.currentNoteIndex; i < this.notes.length; i++) {
            const note = this.notes[i];
            const startX = lineX + (note.time - elapsed) * TRACK_SCROLL_SPEED;
            if (startX < -60 || startX > w + 60) continue;

            if (!this._fourDir && note.type === 'hold' && note.endTime) {
                const endX = lineX + (note.endTime - elapsed) * TRACK_SCROLL_SPEED;
                const startColor = ARROW_COLORS[note.arrow] || '#fff';
                const endColor = ARROW_COLORS[note.endArrow] || '#fff';

                ctx.save();
                ctx.strokeStyle = startColor;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(startX, centerY);
                ctx.lineTo(endX, centerY);
                ctx.stroke();

                ctx.globalAlpha = 1;
                this.drawArrowIcon(ctx, endX, centerY, note.endArrow, noteSize - 4);
                ctx.restore();
            }

            if (note.type === 'jump') {
                ctx.save();
                ctx.fillStyle = '#ff0';
                ctx.strokeStyle = '#ff0';
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                const jSize = noteSize * 0.7;
                ctx.moveTo(startX, centerY - jSize);
                ctx.lineTo(startX + jSize, centerY + jSize);
                ctx.lineTo(startX - jSize, centerY + jSize);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else {
                this.drawArrowIcon(ctx, startX, centerY, note.arrow, noteSize);
            }
        }

        for (let i = this.currentNoteIndex - 1; i >= 0; i--) {
            const note = this.notes[i];
            const nX = lineX + (note.time - elapsed) * TRACK_SCROLL_SPEED;
            if (nX > lineX + 5 || nX < -60) continue;
            ctx.save();
            ctx.globalAlpha = 0.2;
            this.drawArrowIcon(ctx, nX, centerY, note.arrow, noteSize);
            ctx.restore();
        }

        this.drawReceptor(ctx, lineX, centerY, noteSize);

        this.drawBounceMeter(ctx, w - 12, h);

        const cur = this.currentArrow || this.lastArrow || null;
        if (cur) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(cur, lineX, centerY - noteSize - 12);
            ctx.restore();
        }
    }

    drawArrowIcon(ctx, x, y, arrow, size) {
        const color = ARROW_COLORS[arrow] || '#fff';
        const deg = angleForArrow(arrow, this.arrowNames, this.arrowAngles);
        const rad = -deg * Math.PI / 180;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rad);

        ctx.fillStyle = color + '33';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const hl = size * 0.5;
        const hw = size * 0.35;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(hl, 0);
        ctx.lineTo(-hw, -hw);
        ctx.lineTo(-hw * 0.3, 0);
        ctx.lineTo(-hw, hw);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawReceptor(ctx, x, y, size) {
        const curArrow = this.currentArrow || this.lastArrow || null;
        const color = curArrow ? (ARROW_COLORS[curArrow] || '#0af') : 'rgba(255,255,255,0.2)';
        const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.06;
        const s = (size + 6) * pulse;

        ctx.save();
        ctx.shadowColor = curArrow ? color : 'transparent';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (curArrow) {
            const deg = angleForArrow(curArrow, this.arrowNames, this.arrowAngles);
            const rad = -deg * Math.PI / 180;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rad);
            ctx.fillStyle = color;
            const hl = (size - 2) * 0.45;
            const hw = (size - 2) * 0.3;
            ctx.beginPath();
            ctx.moveTo(hl, 0);
            ctx.lineTo(-hw, -hw);
            ctx.lineTo(-hw * 0.3, 0);
            ctx.lineTo(-hw, hw);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    drawBounceMeter(ctx, x, h) {
        const barH = h - 20;
        const barW = 8;
        const barX = x;
        const barY = 10;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX, barY, barW, barH);

        const pct = this.bounceStack / MAX_BOUNCE_STACK;
        const fillH = barH * Math.min(pct, 1);
        const grad = ctx.createLinearGradient(barX, barY + barH, barX, barY);
        grad.addColorStop(0, '#0ff');
        grad.addColorStop(1, '#0af');
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.bounceStack + 'x', barX + barW / 2, barY + barH + 10);

        ctx.restore();
    }

    checkHit(arrow, now) {
        if (this.currentNoteIndex >= this.totalNotes) return;
        const note = this.notes[this.currentNoteIndex];
        const elapsed = (now - this.songStartTime) / 1000;
        const diff = Math.abs(elapsed - note.time);

        if (note.type === 'tap' || note.type === 'jump') {
            if (diff <= HIT_WINDOW && (note.type === 'jump' || note.arrow === arrow)) {
                this.hitNotes++;
                this.currentNoteIndex++;
                if (note.type === 'tap') this.tryBounceStack(arrow, now);
                this.showCombo(true);
                this.updateUI();
            } else if (elapsed > note.time + HIT_WINDOW) {
                if (!this._autoMissedTap) {
                    this._autoMissedTap = true;
                    this.missedNotes++;
                    this.currentNoteIndex++;
                    this.bounceStack = 0;
                    this.showCombo(false);
                    this.updateUI();
                }
            } else {
                this._autoMissedTap = false;
            }
        }
    }

    checkJump(now) {
        this.checkHit(null, now);
    }

    checkHoldStart(arrow, now) {
        if (this.currentNoteIndex >= this.totalNotes) return;
        const note = this.notes[this.currentNoteIndex];
        if (note.type !== 'hold') return;
        const elapsed = (now - this.songStartTime) / 1000;
        const diff = Math.abs(elapsed - note.time);

        if (diff <= HIT_WINDOW && note.arrow === arrow) {
            this._pendingHoldNote = note;
            this._holdCheckedStart = true;
        } else if (elapsed > note.time + HIT_WINDOW && !this._holdCheckedStart) {
            this.missedNotes++;
            this.currentNoteIndex++;
            this.bounceStack = 0;
            this.showCombo(false);
            this.updateUI();
        }
    }

    checkHoldEnd(arrow, now) {
        if (!this._pendingHoldNote) return;
        const note = this._pendingHoldNote;
        const elapsed = (now - this.songStartTime) / 1000;
        const endDiff = Math.abs(elapsed - note.endTime);

        if (endDiff <= HIT_WINDOW && arrow === note.endArrow) {
            this.hitNotes++;
            this.currentNoteIndex++;
            this.tryBounceStack(arrow, now);
            this.showCombo(true);
            this.updateUI();
        } else if (elapsed > note.endTime + HIT_WINDOW) {
            this.missedNotes++;
            this.currentNoteIndex++;
            this.bounceStack = 0;
            this.showCombo(false);
            this.updateUI();
        }
        this._holdCheckedStart = false;
        this._pendingHoldNote = null;
    }

    showCombo(hit) {
        this.comboEl.textContent = hit ? 'HIT!' : 'MISS';
        this.comboEl.style.color = hit ? '#0f0' : '#f44';
        this.comboEl.style.opacity = '1';
        clearTimeout(this._comboTimer);
        this._comboTimer = setTimeout(() => {
            this.comboEl.style.opacity = '0';
        }, 300);
    }

    updateUI() {
        const elapsed = (performance.now() - this.songStartTime) / 1000;
        this.timerEl.textContent = elapsed.toFixed(2) + 's';

        if (this.bounceStackEl) {
            this.bounceStackEl.textContent = `BOUNCE: ${this.bounceStack}x`;
            this.bounceStackEl.style.color = this.bounceStack > 0 ? '#0ff' : '#666';
        }
        if (this.jumpStackEl) {
            this.jumpStackEl.textContent = `JUMP: ${this.jumpStack}x`;
            this.jumpStackEl.style.color = this.jumpStack > 0 ? '#f0f' : '#666';
        }

        if (this.isDevMode) {
            this.scoreEl.textContent = `RECORDED: ${this.recording.length} NOTES | MODE: DEV`;
            return;
        }

        if (this.totalNotes === 0) {
            this.scoreEl.textContent = 'NO CHART LOADED';
            this.nextLabelEl.textContent = '--';
            return;
        }

        const pct = ((this.hitNotes / this.totalNotes) * 100).toFixed(1);
        this.scoreEl.textContent = `SCORE: ${pct}%`;

        const next = this.notes[this.currentNoteIndex];
        if (next) {
            const timeLeft = next.time - elapsed;
            let label;
            if (next.type === 'hold') label = `${next.arrow}→${next.endArrow}`;
            else if (next.type === 'jump') label = 'JUMP';
            else label = next.arrow;
            this.nextLabelEl.textContent = label + (timeLeft > 0 ? ` (${timeLeft.toFixed(1)}s)` : ' NOW!');
            if (timeLeft < 0.3 && timeLeft > -0.1) {
                this.nextLabelEl.style.color = '#ff0';
            } else if (timeLeft < 0) {
                this.nextLabelEl.style.color = '#f44';
            } else {
                this.nextLabelEl.style.color = '#0af';
            }
            this.nextCountEl.textContent = `${this.currentNoteIndex}/${this.totalNotes}`;
            this.notesProgressEl.style.width = `${(this.currentNoteIndex / this.totalNotes) * 100}%`;
        } else {
            this.nextLabelEl.textContent = 'DONE!';
        }

        if (this.currentNoteIndex >= this.totalNotes && !this.isFinished) {
            this.isFinished = true;
            setTimeout(() => {
                const pct = ((this.hitNotes / this.totalNotes) * 100).toFixed(1);
                this.comboEl.textContent = `FINAL SCORE: ${pct}%`;
                this.comboEl.style.color = pct >= 80 ? '#0f0' : (pct >= 50 ? '#ff0' : '#f44');
                this.comboEl.style.opacity = '1';
                this.comboEl.style.fontSize = '1.5em';
            }, 500);
        }
    }

    processAutoMiss() {
        if (!this.isPlaying || this.isFinished || !this.notes.length) return;
        const elapsed = (performance.now() - this.songStartTime) / 1000;

        if (!this._fourDir && this._pendingHoldNote) {
            if (elapsed > this._pendingHoldNote.endTime + HIT_WINDOW) {
                this.missedNotes++;
                this.currentNoteIndex++;
                this._holdCheckedStart = false;
                this._pendingHoldNote = null;
                this.bounceStack = 0;
                this.showCombo(false);
                this.updateUI();
            }
            return;
        }

        if (this.currentNoteIndex >= this.totalNotes) return;
        const note = this.notes[this.currentNoteIndex];
        if (elapsed > note.time + HIT_WINDOW && !this.currentArrow && !this._pressArrow) {
            if (note.type === 'tap' || note.type === 'jump') {
                this.missedNotes++;
                this.currentNoteIndex++;
                this.bounceStack = 0;
                this.showCombo(false);
                this.updateUI();
            } else if (!this._fourDir && note.type === 'hold') {
                this.missedNotes++;
                this.currentNoteIndex++;
                this.bounceStack = 0;
                this.showCombo(false);
                this.updateUI();
            }
        }
    }

    checkGamepadJump() {
        let gp;
        try { gp = navigator.getGamepads(); if (gp) gp = Array.from(gp).find(g => g && g.buttons); } catch { return; }
        if (!gp) return;

        const isDown = (i) => {
            const b = gp.buttons[i];
            return b && (b.pressed === true || (typeof b.value === 'number' && b.value > 0.5));
        };

        const r3Down = isDown(11);
        if (r3Down && !this._r3Held) {
            this.doJump();
            if (this.isDevMode && this.isPlaying) this.recordJump();
            if (!this.isDevMode && this.isPlaying && !this.isFinished) this.checkJump(performance.now());
            this._r3Held = true;
            this._jumpHold = true;
        } else if (!r3Down && this._r3Held) {
            this._r3Held = false;
            this._jumpHold = false;
        }
    }

    updateJumpPhysics(dt) {
        if (!this.vehicle || !this.vehicle.chassisBody) return;
        const body = this.vehicle.chassisBody;

        if (this._jumpHold) {
            const hoverY = 2.5;
            const speed = 6;
            const diff = hoverY - body.position.y;
            body.velocity.y = Math.sign(diff) * Math.min(Math.abs(diff) * 4, speed);
            this._inAir = true;
            return;
        }

        if (body.position.y <= 0.8 && this._inAir) {
            this._inAir = false;
            this._landingTime = performance.now();
        }
        if (body.position.y > 1.2) {
            this._inAir = true;
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const pm = document.getElementById('pause-menu');
        if (!pm) return;
        if (this.isPaused) {
            if (!this._plPauseOverlay) {
                const overlay = document.createElement('div');
                overlay.id = 'pl-pause-overlay';
                overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:1001;color:#fff;font-family:monospace;';
                overlay.innerHTML = `
                    <h1 style="color:#0af;margin:0 0 30px;font-size:2.5em;">PARKING LOT</h1>
                    <div style="display:flex;flex-direction:column;gap:16px;align-items:center;">
                        <div class="menu-item" onclick="window.game.togglePause()" style="font-size:1.5em;">RESUME</div>
                        <div class="menu-item" onclick="window.game.exportChart()" id="pl-export-btn" style="font-size:1.2em;${this.isDevMode ? '' : 'display:none;'}">EXPORT CHART</div>
                        <div class="menu-item" onclick="window.game.saveChartToStorage()" id="pl-save-btn" style="font-size:1.2em;${this.isDevMode ? '' : 'display:none;'}">SAVE CHART</div>
                        <div class="menu-item" style="margin-top:30px;color:#f44;font-size:1.5em;" onclick="window.returnToMenu()">LEAVE</div>
                    </div>
                `;
                pm.parentNode.appendChild(overlay);
                this._plPauseOverlay = overlay;
            }
            pm.style.display = 'none';
            this._plPauseOverlay.style.display = 'flex';
        } else {
            pm.style.display = 'none';
            if (this._plPauseOverlay) this._plPauseOverlay.style.display = 'none';
        }
    }

    showPanel(type) {}

    exportChart() {
        const key = this.songFile + '#' + this.difficulty;
        const data = {
            song: this.songFile,
            difficulty: this.difficulty,
            name: this.chartName,
            recorded: new Date().toISOString(),
            notes: this.recording
        };
        const name = (this.chartName || 'pl_chart').replace(/[^a-zA-Z0-9]/g, '_') + '.json';
        downloadJSON(data, name);
    }

    saveChartToStorage() {
        if (this.recording.length === 0) return;
        const key = this.songFile + '#' + this.difficulty;
        const charts = loadCharts();
        charts[key] = {
            song: this.songFile,
            difficulty: this.difficulty,
            name: this.chartName,
            notes: this.recording
        };
        saveCharts(charts);
        const el = document.getElementById('pl-export-btn');
        if (el) el.textContent = 'CHART SAVED!';
        setTimeout(() => {
            if (el) el.textContent = 'EXPORT CHART';
        }, 2000);
    }

    updateCamera(dt) {
        const gp = this.getGamepad();
        const lx = gp ? gp.axes[0] : 0;
        const ly = gp ? gp.axes[1] : 0;

        if (!this._camAngle) this._camAngle = Math.PI / 4;
        if (!this._camDist) this._camDist = 10;
        if (!this._camHeight) this._camHeight = 4;

        this._camAngle += lx * 1.5 * dt;
        this._camDist = Math.max(4, Math.min(20, this._camDist + -ly * 3 * dt));

        const target = new THREE.Vector3(0, 0.5, 0);
        this.camera.position.set(
            target.x + Math.cos(this._camAngle) * this._camDist,
            target.y + this._camHeight,
            target.z + Math.sin(this._camAngle) * this._camDist
        );
        this.camera.lookAt(target);
    }

    animate() {
        if (this.isDisposed) return;
        requestAnimationFrame(() => this.animate());

        if (this.isPaused) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const dt = Math.min(this.clock.getDelta(), 0.1);
        this.world.step(1 / 60, dt, 3);

        this.fadeIn = Math.min(1, this.fadeIn + dt * 0.5);

        this.updateInput();
        this.checkGamepadJump();
        this.vehicle.update(dt, 0, 0, false);
        this.updateJumpPhysics(dt);

        if (this.vehicle.chassisBody.position.y < -5) {
            this.vehicle.chassisBody.position.set(0, 3, 0);
            this.vehicle.chassisBody.velocity.set(0, 0, 0);
        }

        this.updateCamera(dt);
        this.updateUI();
        this.renderTrack();
        this.processAutoMiss();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.isDisposed = true;
        window.removeEventListener('keydown', this._keydownRef);
        window.removeEventListener('keyup', this._keyupRef);
        if (this._countdownInterval) clearInterval(this._countdownInterval);
        if (this.songAudio) {
            this.songAudio.pause();
            this.songAudio = null;
        }
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.remove();
            this.videoElement = null;
        }
        if (this._ytPlayIframe) {
            if (this._ytPlayIframe.parentNode) this._ytPlayIframe.parentNode.removeChild(this._ytPlayIframe);
            this._ytPlayIframe = null;
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
        const hud = document.getElementById('pl-hud');
        if (hud) hud.remove();
        const plOverlay = document.getElementById('pl-pause-overlay');
        if (plOverlay) plOverlay.remove();
        window.game = null;
    }
}
