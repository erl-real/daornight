import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArcadeVehicle } from './ArcadeVehicle.js';

const GROUPS = {
    GROUND: 1,
    OBSTACLE: 2,
    BALL: 4,
    PLAYER: 8
};

export class ArcadeTestGame {
    constructor() {
        this.clock = new THREE.Clock();
        this.slickMat = new CANNON.Material('slick');
        this.initPhysics();
        this.initGraphics();
        this.initInput();
        this.vehicle = new ArcadeVehicle(this.scene, this.world, {
            position: new CANNON.Vec3(0, 5, 0),
            collisionFilterGroup: GROUPS.PLAYER,
            collisionFilterMask: GROUPS.OBSTACLE | GROUPS.BALL, 
            material: this.slickMat
        });
        this.energy = 100;
        this.currentGear = 0;
        this.lastJumpTime = 0;
        this.lastDriftPressTime = 0;
        this.isLeaningState = false;
        this.currentLeanSide = 0; 
        this.leanCooldown = 0; 
        this.virtualHeading = 0; 
        this.camDist = 12;
        this.camHeight = 5;
        this.lookAtTarget = new THREE.Vector3(); 
        this.animate();
    }

    initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); 
        const slickContact = new CANNON.ContactMaterial(this.slickMat, this.slickMat, {
            friction: 0.0,
            restitution: 0.0
        });
        this.world.addContactMaterial(slickContact);
        const groundBody = new CANNON.Body({ 
            mass: 0,
            collisionFilterGroup: GROUPS.GROUND,
            material: this.slickMat
        });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
    }

    initGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111118);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(50, 100, 50);
        this.scene.add(sun);
        this.scene.add(new THREE.GridHelper(1000, 50, 0x444444, 0x222222));
        for (let i = 0; i < 30; i++) {
            const w = 5 + Math.random() * 15;
            const h = 2 + Math.random() * 20;
            const d = 5 + Math.random() * 15;
            const px = (Math.random() - 0.5) * 600;
            const pz = (Math.random() - 0.5) * 600;
            if (Math.abs(px) < 20 && Math.abs(pz) < 20) continue; 
            const helper = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 }));
            helper.position.set(px, h/2, pz);
            this.scene.add(helper);
            const body = new CANNON.Body({ 
                mass: 0,
                collisionFilterGroup: GROUPS.OBSTACLE,
                material: this.slickMat,
                position: new CANNON.Vec3(px, h/2, pz)
            });
            body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
            this.world.addBody(body);
        }
        const ballRadius = 4;
        this.ballBody = new CANNON.Body({
            mass: 50,
            shape: new CANNON.Sphere(ballRadius),
            position: new CANNON.Vec3(0, 10, -50),
            collisionFilterGroup: GROUPS.BALL,
            material: this.slickMat
        });
        this.world.addBody(this.ballBody);
        this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(ballRadius, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.3 }));
        this.scene.add(this.ballMesh);
    }

    initInput() {
        this.keys = {};
        this.gearStickReset = true;
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'KeyH') this.vehicle.toggleHover();
            if (e.code === 'KeyJ' && Date.now() - this.lastJumpTime > 1000) this.handleJump();
            if (e.code === 'BracketRight') { this.currentGear = Math.min(5, this.currentGear + 1); this.input.pushCombo('up'); }
            if (e.code === 'BracketLeft') { this.currentGear = Math.max(0, this.currentGear - 1); this.input.pushCombo('down'); }
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        this.input = {
            inputBuffer: [],
            lastInputTime: 0,
            pushCombo(dir) {
                this.inputBuffer.push(dir);
                if (this.inputBuffer.length > 3) this.inputBuffer.shift();
                this.lastInputTime = Date.now();
            }
        };
    }

    getGamepad() {
        const gamepads = navigator.getGamepads();
        return Array.from(gamepads).find(g => g !== null);
    }

    handleJump() {
        if (this.isLeaningState) return; 
        const now = Date.now();
        const combo = this.input.inputBuffer.join('-');
        const isSuper = (combo === 'down-down-up' && (now - this.input.lastInputTime < 2000) && this.energy >= 40);
        let jumpPower = 24;
        if (isSuper) { jumpPower = 36; this.energy -= 40; this.input.inputBuffer = []; }
        this.vehicle.jump(jumpPower);
        this.lastJumpTime = now;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = this.clock.getDelta();
        const input = this.updateInput(dt);
        this.world.step(1/60, Math.min(dt, 0.1));
        this.vehicle.update(dt, this.virtualHeading, input.steerDir, input.leanActive);
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);
        this.energy = Math.min(100, this.energy + 10 * dt);
        if (this.leanCooldown > 0) this.leanCooldown -= dt;
        this.updateCamera(dt);
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }

    updateInput(dt) {
        const gp = this.getGamepad();
        const keys = this.keys;
        let steerDir = 0;
        if (keys['KeyA'] || keys['ArrowLeft']) steerDir = 1;
        if (keys['KeyD'] || keys['ArrowRight']) steerDir = -1;
        if (gp && Math.abs(gp.axes[0]) > 0.1) steerDir = -gp.axes[0]; 

        const leanHeld = keys['KeyL'] || (gp && gp.buttons[10]?.pressed); 
        if (leanHeld && !this.vehicle.hoverMode) {
            if (!this.isLeaningState) {
                if (Math.abs(steerDir) > 0.3 && this.leanCooldown <= 0) { this.isLeaningState = true; this.currentLeanSide = Math.sign(steerDir); }
            } else {
                if (Math.sign(steerDir) === -this.currentLeanSide && Math.abs(steerDir) > 0.6) { this.isLeaningState = false; this.currentLeanSide = 0; this.leanCooldown = 5.0; }
            }
        } else if (this.isLeaningState) { this.isLeaningState = false; this.currentLeanSide = 0; this.leanCooldown = 5.0; }

        let steerSpeed = 2.5;
        if (this.isLeaningState) steerSpeed = 0.6;
        this.virtualHeading += steerDir * steerSpeed * dt;

        let throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
        if (gp) {
            const forward = gp.buttons[7]?.value || 0; 
            const reverse = gp.buttons[6]?.value || 0; 
            if (Math.abs(forward) > 0.05 || Math.abs(reverse) > 0.05) throttle = forward - reverse;
        }
        if (gp) {
            const dUp = gp.buttons[12]?.pressed;
            const dDown = gp.buttons[13]?.pressed;
            if (this.gearStickReset) {
                if (dUp) { this.currentGear = Math.min(5, this.currentGear + 1); this.input.pushCombo('up'); this.gearStickReset = false; }
                else if (dDown) { this.currentGear = Math.max(0, this.currentGear - 1); this.input.pushCombo('down'); this.gearStickReset = false; }
            } else if (!dUp && !dDown) this.gearStickReset = true;
        }
        if (gp && gp.buttons[11]?.pressed && Date.now() - this.lastJumpTime > 1000) this.handleJump();
        const isGrounded = this.vehicle.groundHits.some(h => h === true);
        const canAct = this.vehicle.hoverMode || isGrounded;
        const driftPressed = (keys['ShiftLeft'] || keys['Space'] || (gp && gp.buttons[5]?.pressed)) && canAct; 
        this.vehicle.isDrifting = driftPressed && Math.abs(steerDir) > 0.01;
        if (this.vehicle.isDrifting) {
            const targetDriftAngle = steerDir * Math.PI / 4;
            this.vehicle.driftAngle += (targetDriftAngle - this.vehicle.driftAngle) * 0.1;
        } else this.vehicle.driftAngle *= 0.9;
        const isBraking = (keys['Space'] || (gp && gp.buttons[5]?.pressed)) && canAct; 
        this.vehicle.boostFactor = (keys['KeyB'] || (gp && gp.buttons[4]?.pressed)) ? 2.0 : 1.0; 
        this.vehicle.applyInputs(throttle, isBraking);
        return { steerDir: this.isLeaningState ? this.currentLeanSide : steerDir, leanActive: this.isLeaningState };
    }

    updateCamera(dt) {
        const pos = this.vehicle.getStableCenter();
        const targetLookAt = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
        
        const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.virtualHeading);
        const camOffset = new THREE.Vector3(0, this.camHeight, this.camDist).applyQuaternion(quat);
        const targetCamPos = new THREE.Vector3(pos.x, pos.y, pos.z).add(camOffset);
        
        this.camera.position.copy(targetCamPos);
        this.camera.lookAt(targetLookAt);
    }

    updateUI() {
        const speed = this.vehicle.chassisBody.velocity.length() * 2.237; 
        document.getElementById('speed-val').innerText = speed.toFixed(0);
        let status = `MODE: ${this.vehicle.hoverMode ? 'FLIGHT' : 'GROUND'}`;
        if (this.isLeaningState) status = "MODE: TWO-WHEELS";
        if (this.leanCooldown > 0 && !this.isLeaningState) status += ` (COOLDOWN: ${this.leanCooldown.toFixed(1)}s)`;
        document.getElementById('hover-status').innerText = `${status} | GEAR: ${this.currentGear + 1} | ENERGY: ${Math.floor(this.energy)}%`;
    }
}