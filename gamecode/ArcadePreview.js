import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { LoadingUI } from './LoadingUI.js';
import { ArcadeVehicle } from './ArcadeVehicle.js';
import { Ults } from './Ults.js';

export class ArcadePreview {
    constructor(containerId = 'preview-container') {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.camera.position.set(6, 4, 8);
        this.camera.lookAt(0, 0, 0);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);
        this.addBaseScene();

        this._active = false;
        this.vehicle = null;
        this.world = null;
        this.groundBody = null;
        this.previewProjectiles = [];
        this.weaponAmmo = {};
        this.orbitAngle = 0;
        this.orbitSpeed = 0.3;
        this._xHeld = false;
        this._ultCooldown = 0;
        this.ults = null;

        this.animate();

        window.addEventListener('resize', () => {
            if (this._active) {
                this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            }
        });
    }

    updateSize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (w > 0 && h > 0) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        }
    }

    setCar(type) {
        this.cleanup();
        if (!this._active) return;

        this.loadingCarType = type;
        const carConfig = CONFIG.CARS[type] || CONFIG.CARS['35-impala'];

        this.initPhysics();

        this.vehicle = new ArcadeVehicle(this.scene, this.world, {
            carType: type,
            position: new CANNON.Vec3(0, 3, 0),
            material: new CANNON.Material({ restitution: 0.0 })
        });
        this.vehicle.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI);
        if (this.containerId === 'story-preview-container') {
            (this.vehicle.visualDots || []).forEach(d => { this.scene.remove(d); });
            if (this.vehicle.hitboxHelper) this.vehicle.hitboxHelper.visible = false;
        }
        this.weaponAmmo['ult'] = 3;
        this.orbitAngle = 0;

        this._previewTargets = [];

        const targetBody = new CANNON.Body({ mass: 1200 });
        targetBody.addShape(new CANNON.Box(new CANNON.Vec3(1, 0.4, 2)));
        targetBody.position.set(0, 0.5, -10);
        targetBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI);
        this.world.addBody(targetBody);
        const targetCar = {
            chassisBody: targetBody,
            carMesh: { rotation: { y: Math.PI } },
            isDead: false,
            applyDamage: () => {}
        };
        this._previewTargets.push(targetCar);

        for (let i = 0; i < 3; i++) {
            const bBody = new CANNON.Body({ mass: 50 });
            bBody.addShape(new CANNON.Sphere(0.5));
            bBody.position.set(-4 + i * 4, 0.5, -12);
            this.world.addBody(bBody);
            const barrel = {
                body: bBody,
                mesh: null,
                type: 'explosive',
                health: 10,
                isDead: false
            };
            this._previewTargets.push(barrel);
        }

        const gameMock = {
            graphics: { scene: this.scene },
            physics: { world: this.world },
            scene: this.scene,
            world: this.world,
            player: this.vehicle,
            cars: [this.vehicle, targetCar],
            barrels: {
                barrels: this._previewTargets.filter(t => t.body && !t.chassisBody),
                getNearby: () => [],
                spawnBarrel: () => null,
                applyDamage: () => {},
                models: {}
            },
            projectiles: { projectiles: [] },
            pickups: { update: () => {} },
            pools: [],
            keys: {},
            getGamepad: () => null,
            handleBarrelExplosion: () => {},
            weaponInventory: ['ult'],
            currentWeaponIndex: 0
        };
        this.ults = new Ults(gameMock);
        this.ults.initVehicleUlt(this.vehicle);
        this.ults.addAmmo(this.vehicle, 99, 'ult');

        LoadingUI.hide();
    }

    cleanup() {
        this.ults = null;
        this.previewProjectiles.forEach(p => this.scene.remove(p.mesh));
        this.previewProjectiles = [];

        if (this.vehicle) {
            if (this.vehicle.carMesh) this.scene.remove(this.vehicle.carMesh);
            if (this.vehicle.hitboxHelper) this.scene.remove(this.vehicle.hitboxHelper);
            (this.vehicle.visualDots || []).forEach(d => this.scene.remove(d));
            if (this.vehicle.debugPoint) this.scene.remove(this.vehicle.debugPoint);
            this.vehicle = null;
        }

        if (this._previewTargets) {
            this._previewTargets.forEach(t => {
                if (t.body && this.world) this.world.removeBody(t.body);
                if (t.chassisBody && this.world) this.world.removeBody(t.chassisBody);
            });
            this._previewTargets = null;
        }

        // Remove all scene objects from ult system and previous previews
        while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
        this.addBaseScene();

        if (this.world) {
            while (this.world.bodies.length) this.world.removeBody(this.world.bodies[0]);
            this.world = null;
        }
        this.groundBody = null;
    }

    addBaseScene() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
        const dir = new THREE.DirectionalLight(0x00ffff, 2.0);
        dir.position.set(5, 10, 5);
        this.scene.add(dir);
        const fill = new THREE.DirectionalLight(0xff8800, 0.5);
        fill.position.set(-5, 2, -5);
        this.scene.add(fill);

    }

    initPhysics() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -9.82, 0),
            broadphase: new CANNON.NaiveBroadphase()
        });
        this.world.defaultContactMaterial.friction = 0.0;
        this.world.defaultContactMaterial.restitution = 0.0;

        this.groundBody = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, collisionFilterGroup: 2 });
        this.groundBody.addShape(new CANNON.Plane());
        this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(this.groundBody);
    }

    get active() { return this._active; }
    set active(val) {
        if (this._active === val) return;
        this._active = val;
        if (val) {
            this.animate();
        } else {
            this.cleanup();
        }
    }

    fireUlt() {
        if (!this.ults || !this.vehicle || this.vehicle.isDead) return;
        try { this.ults.performCarUlt(this.vehicle); } catch (e) {}
    }

    animate() {
        if (!this._active) return;
        requestAnimationFrame(() => this.animate());

        const dt = 1 / 60;
        const gp = Array.from(navigator.getGamepads()).find(g => g !== null);

        if (this.vehicle && this.world && this._active) {
            let steerInput = 0;

            if (gp) {
                const lx = gp.axes[0] || 0;
                if (Math.abs(lx) > 0.15) steerInput = lx;

                if (gp.buttons[0]?.pressed && !this._xHeld) { this.fireUlt(); this._xHeld = true; }
                else if (!gp.buttons[0]?.pressed) this._xHeld = false;
            }

            this.vehicle.applyInputs(0, false);
            this.vehicle.chassisBody.fixedRotation = true;
            this.world.step(1 / 60, dt, 3);

            const vel = this.vehicle.chassisBody.velocity;
            let heading = this.vehicle.carMesh.rotation.y;
            if (vel.length() > 1) heading = Math.atan2(-vel.x, -vel.z);

            this.vehicle.update(dt, heading, steerInput, false);

            const pos = this.vehicle.chassisBody.position;
            const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
            if (dist > 8) {
                const ratio = 8 / dist;
                pos.x *= ratio;
                pos.z *= ratio;
                const outward = (pos.x * this.vehicle.chassisBody.velocity.x + pos.z * this.vehicle.chassisBody.velocity.z) / 64;
                if (outward > 0) {
                    this.vehicle.chassisBody.velocity.x -= pos.x * outward;
                    this.vehicle.chassisBody.velocity.z -= pos.z * outward;
                }
            }

            if (this.ults) this.ults.update(dt);

            for (let i = this.previewProjectiles.length - 1; i >= 0; i--) {
                const p = this.previewProjectiles[i];
                p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
                p.life -= dt;
                if (p.life <= 0) { this.scene.remove(p.mesh); this.previewProjectiles.splice(i, 1); }
            }
        }

        const t = this.vehicle && this.vehicle.chassisBody ? this.vehicle.chassisBody.position : { x: 0, y: 0, z: 0 };
        this.orbitAngle += this.orbitSpeed * dt;
        this.camera.position.x = t.x + Math.sin(this.orbitAngle) * 11;
        this.camera.position.z = t.z + Math.cos(this.orbitAngle) * 11;
        this.camera.position.y = t.y + 2.2;
        this.camera.lookAt(t.x, t.y + 0.2, t.z);

        this.renderer.render(this.scene, this.camera);
    }
}
