import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { Graphics } from './Graphics.js';
import { Physics } from './Physics.js';
import { Vehicle } from './Vehicle.js';
import { Projectiles } from './Projectiles.js';
import { Pickups } from './Pickups.js';
import { Input } from './Input.js';
import { AIController2 } from './AIController2.js';
import { WEAPON_TYPES } from './Weps.js';
import { AI_PROFILES_2 } from './AIProfiles2.js';

export class AITestMap2Game {
    constructor() {
        this.clock = new THREE.Clock();
        this.arenaHalfSize = 360;
        this.controllers = [];
        this.cars = [];
        this.scores = {};
        this.isPaused = false;

        this.freeCamYaw = 0;
        this.freeCamPitch = -0.95;
        this.freeCamMoveSpeed = 1.8;

        this.graphics = new Graphics();
        this.input = new Input();
        this.physics = new Physics();
        this.projectiles = new Projectiles(this.graphics.scene, this.physics.world);

        this.stripDefaultEnvironment();
        this.buildArena();
        this.createPickups();
        this.spawnBots();
        this.initUI();

        this.graphics.camera.position.set(0, 300, 280);
        this.graphics.camera.lookAt(0, 0, 0);

        window.aiTestMap2 = this;
        this.animate();
    }

    stripDefaultEnvironment() {
        const toRemove = [];
        this.graphics.scene.traverse((child) => {
            if (child.isGridHelper || (child.isMesh && child.geometry && child.geometry.type === 'PlaneGeometry')) {
                toRemove.push(child);
            }
        });
        toRemove.forEach((child) => this.graphics.scene.remove(child));

        const bodies = [...this.physics.world.bodies];
        for (const body of bodies) {
            if (body.mass !== 0 || body.shapes.length === 0) {
                continue;
            }
            const shape = body.shapes[0];
            if (shape instanceof CANNON.Plane || shape instanceof CANNON.Box) {
                this.physics.world.removeBody(body);
            }
        }
    }

    buildArena() {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(this.arenaHalfSize * 2, this.arenaHalfSize * 2),
            new THREE.MeshPhongMaterial({ color: 0x13181d, shininess: 10 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.graphics.scene.add(floor);

        const grid = new THREE.GridHelper(this.arenaHalfSize * 2, 18, 0x35505f, 0x1d2932);
        this.graphics.scene.add(grid);

        const wallMat = new THREE.MeshPhongMaterial({ color: 0x28313a });
        const wallHeight = 22;
        const wallThickness = 6;
        const wallDefs = [
            { x: 0, y: wallHeight / 2, z: this.arenaHalfSize, sx: this.arenaHalfSize * 2, sy: wallHeight, sz: wallThickness },
            { x: 0, y: wallHeight / 2, z: -this.arenaHalfSize, sx: this.arenaHalfSize * 2, sy: wallHeight, sz: wallThickness },
            { x: this.arenaHalfSize, y: wallHeight / 2, z: 0, sx: wallThickness, sy: wallHeight, sz: this.arenaHalfSize * 2 },
            { x: -this.arenaHalfSize, y: wallHeight / 2, z: 0, sx: wallThickness, sy: wallHeight, sz: this.arenaHalfSize * 2 }
        ];

        for (const wall of wallDefs) {
            this.addStaticBox(wall.x, wall.y, wall.z, wall.sx, wall.sy, wall.sz, wallMat);
        }

        const obstacleMat = new THREE.MeshPhongMaterial({ color: 0x3f4952 });
        const obstacleDefs = [
            { x: 0, y: 20, z: 0, sx: 38, sy: 40, sz: 110 },
            { x: 0, y: 20, z: 0, sx: 110, sy: 40, sz: 38 },
            { x: -170, y: 14, z: 170, sx: 44, sy: 28, sz: 44 },
            { x: 170, y: 14, z: 170, sx: 44, sy: 28, sz: 44 },
            { x: -170, y: 14, z: -170, sx: 44, sy: 28, sz: 44 },
            { x: 170, y: 14, z: -170, sx: 44, sy: 28, sz: 44 },
            { x: -260, y: 10, z: 0, sx: 32, sy: 20, sz: 90 },
            { x: 260, y: 10, z: 0, sx: 32, sy: 20, sz: 90 },
            { x: 0, y: 10, z: -260, sx: 90, sy: 20, sz: 32 },
            { x: 0, y: 10, z: 260, sx: 90, sy: 20, sz: 32 }
        ];

        for (const obstacle of obstacleDefs) {
            this.addStaticBox(obstacle.x, obstacle.y, obstacle.z, obstacle.sx, obstacle.sy, obstacle.sz, obstacleMat);
        }

        const groundBody = new CANNON.Body({ mass: 0, material: CONFIG.materials?.ground || new CANNON.Material('ground') });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.physics.world.addBody(groundBody);
    }

    addStaticBox(x, y, z, sx, sy, sz, material) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.graphics.scene.add(mesh);

        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
        body.position.set(x, y, z);
        this.physics.world.addBody(body);
    }

    createPickups() {
        const pickupLocs = [
            { x: 150, z: 0, type: 'health' },
            { x: -150, z: 0, type: 'ammo' },
            { x: 0, z: -150, type: 'health' },
            { x: 0, z: 150, type: 'health' },
            { x: -230, z: -230, type: 'missile' },
            { x: 230, z: 230, type: 'shotgun' },
            { x: -230, z: 230, type: 'turret' },
            { x: 230, z: -230, type: 'cannon' },
            { x: -300, z: 0, type: 'melee' },
            { x: 300, z: 0, type: 'energy' },
            { x: 0, z: -300, type: 'ult' },
            { x: 0, z: 300, type: 'ammo' },
            { x: -300, z: 300, type: 'health' },
            { x: 300, z: -300, type: 'health' }
        ];
        this.pickups = new Pickups(this.graphics.scene, pickupLocs);
    }

    spawnBots() {
        const spawnRing = 235;
        AI_PROFILES_2.forEach((profile, index) => {
            const angle = (Math.PI * 2 * index) / AI_PROFILES_2.length;
            const pos = new CANNON.Vec3(Math.cos(angle) * spawnRing, 4, Math.sin(angle) * spawnRing);
            const car = new Vehicle(this.graphics.scene, this.physics.world, false, pos, 'concept', profile.color);
            car.name = profile.label.toUpperCase();
            car.weaponInventory = ['missile'];
            car.currentWeaponIndex = 0;
            car.ammo = {
                missile: 18,
                shotgun: 0,
                turret: 0,
                cannon: 0,
                energy: 0,
                melee: 0,
                ult: 0
            };
            car.mineAmmo = 3;

            const yaw = angle + Math.PI;
            car.chassisBody.quaternion.setFromEuler(0, yaw, 0);

            this.cars.push(car);
            this.controllers.push(new AIController2(this, car, profile, profile.color));
            this.scores[car.name] = 0;
        });
    }

    initUI() {
        this.bannerEl = document.createElement('div');
        this.bannerEl.style.cssText = 'position:absolute;top:14px;left:14px;color:#dce8f2;background:rgba(7,10,14,0.82);padding:10px 12px;font:14px monospace;pointer-events:none;border-left:4px solid #57c7ff;';
        this.bannerEl.innerHTML = 'AI TEST MAP 2<br>8 profiles, wall recovery, orbit combat';
        document.body.appendChild(this.bannerEl);

        this.logEl = document.createElement('div');
        this.logEl.style.cssText = 'position:absolute;top:14px;right:14px;max-width:360px;color:#f2f7fb;background:rgba(7,10,14,0.82);padding:12px;font:13px monospace;line-height:1.45;pointer-events:none;border-right:4px solid #57c7ff;';
        document.body.appendChild(this.logEl);

        this.scoreEl = document.createElement('div');
        this.scoreEl.style.cssText = 'position:absolute;bottom:14px;left:14px;color:#dce8f2;background:rgba(7,10,14,0.82);padding:10px 12px;font:13px monospace;pointer-events:none;';
        document.body.appendChild(this.scoreEl);
        this.updateUI();
    }

    updateUI() {
        let logHtml = '<b>ACTIVE BOTS</b><br>';
        for (const controller of this.controllers) {
            const data = controller.getTelemetry();
            const color = `#${controller.color.toString(16).padStart(6, '0')}`;
            logHtml += `<span style="color:${color}">${data.profile}</span> ${data.state} hp:${data.health} ammo:${data.ammo} speed:${data.speed} target:${data.distToTarget}<br>`;
        }
        this.logEl.innerHTML = logHtml;

        const standings = Object.entries(this.scores).sort((a, b) => b[1] - a[1]);
        this.scoreEl.innerHTML = standings.map(([name, score]) => `${name}: ${score}`).join('<br>');
    }

    checkCollisions() {
        for (let i = this.projectiles.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles.projectiles[i];
            for (const car of this.cars) {
                if (projectile.source === car || car.isDead) {
                    continue;
                }

                const dist = projectile.mesh.position.distanceTo(car.chassisBody.position);
                if (dist >= 3.8) {
                    continue;
                }

                car.applyDamage(10);
                this.graphics.scene.remove(projectile.mesh);
                this.projectiles.projectiles.splice(i, 1);

                if (car.health <= 0) {
                    if (projectile.source && projectile.source.name) {
                        this.scores[projectile.source.name] = (this.scores[projectile.source.name] || 0) + 1;
                    }
                    car.die();
                    setTimeout(() => this.respawnCar(car), 2500);
                }
                break;
            }
        }

        const now = Date.now();
        for (const car of this.cars) {
            this.pickups.update(now, car.chassisBody.position, (type) => {
                if (type === 'health') {
                    car.health = Math.min(100, car.health + 35);
                    car.updateHealthBar();
                } else if (type === 'ammo') {
                    for (const key of Object.keys(car.ammo)) {
                        car.ammo[key] += 4;
                    }
                } else if (Object.keys(WEAPON_TYPES).includes(type)) {
                    if (!car.weaponInventory.includes(type)) {
                        car.weaponInventory.push(type);
                    }
                    car.ammo[type] = (car.ammo[type] || 0) + 5;
                    car.currentWeaponIndex = car.weaponInventory.indexOf(type);
                }
                return true;
            });
        }
    }

    respawnCar(car) {
        const living = this.cars.filter((candidate) => candidate !== car && !candidate.isDead);
        let spawnAngle = Math.random() * Math.PI * 2;
        if (living.length > 0) {
            const farthest = living[Math.floor(Math.random() * living.length)];
            const pos = farthest.chassisBody.position;
            spawnAngle = Math.atan2(-pos.z, -pos.x);
        }
        const radius = 270;
        car.reset(new CANNON.Vec3(Math.cos(spawnAngle) * radius, 4, Math.sin(spawnAngle) * radius));
        car.chassisBody.quaternion.setFromEuler(0, spawnAngle + Math.PI, 0);
        car.weaponInventory = ['missile'];
        car.currentWeaponIndex = 0;
        car.ammo = {
            missile: 18,
            shotgun: 0,
            turret: 0,
            cannon: 0,
            energy: 0,
            melee: 0,
            ult: 0
        };
        car.mineAmmo = 3;
    }

    applyVehicleControlsAI(vehicle, throttle, steerVal, brakeForce, isBoosting = false) {
        const speedKmH = Math.abs(vehicle.chassisBody.velocity.length() * 3.6);
        const engineMult = vehicle.carConfig.engineMultiplier || 1.0;
        const torqueMult = vehicle.carConfig.torqueMultiplier || 1.0;

        const wheelCount = vehicle.wheelMeshes.length;
        const rearWheels = wheelCount > 2 ? [2, 3] : [1];
        const frontWheels = wheelCount > 2 ? [0, 1] : [0];

        let finalSteer = steerVal;
        if (speedKmH < 45) {
            finalSteer *= 1.0 + (45 - speedKmH) / 38;
        }

        let force = throttle * CONFIG.engineForce * (isBoosting ? 2.2 : 1.15) * engineMult * torqueMult;
        if (throttle > 0) {
            force *= 2.15;
        }

        if (!vehicle.vehicle) {
            return;
        }

        for (const index of rearWheels) {
            if (vehicle.vehicle.wheelInfos[index]) {
                vehicle.vehicle.wheelInfos[index].frictionSlip = vehicle.carConfig.frictionSlip || 5;
                vehicle.vehicle.applyEngineForce(force, index);
            }
        }
        for (const index of frontWheels) {
            if (vehicle.vehicle.wheelInfos[index]) {
                vehicle.vehicle.setSteeringValue(finalSteer, index);
            }
        }
        for (let i = 0; i < wheelCount; i++) {
            vehicle.vehicle.setBrake(brakeForce || (throttle === 0 ? 12 : 0), i);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.1);
        if (this.isPaused) {
            return;
        }

        this.updateCamera(dt);
        this.physics.step(dt);
        this.projectiles.update(Date.now());
        this.cars.forEach((car) => car.update(dt));
        this.controllers.forEach((controller) => controller.update(dt));
        this.checkCollisions();
        this.updateUI();
        this.graphics.render(this.graphics.scene, this.graphics.camera);
    }

    updateCamera() {
        const keys = this.input.keys;
        const turnSpeed = 0.032;

        if (keys['ArrowLeft']) this.freeCamYaw += turnSpeed;
        if (keys['ArrowRight']) this.freeCamYaw -= turnSpeed;
        if (keys['ArrowUp']) this.freeCamPitch = Math.max(-1.5, this.freeCamPitch + turnSpeed);
        if (keys['ArrowDown']) this.freeCamPitch = Math.min(1.4, this.freeCamPitch - turnSpeed);

        this.graphics.camera.rotation.order = 'YXZ';
        this.graphics.camera.rotation.y = this.freeCamYaw;
        this.graphics.camera.rotation.x = this.freeCamPitch;
        this.graphics.camera.rotation.z = 0;

        const move = new THREE.Vector3(
            (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0),
            (keys['KeyE'] ? 1 : 0) - (keys['KeyQ'] ? 1 : 0),
            (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0)
        );

        if (move.lengthSq() > 0) {
            move.normalize().applyQuaternion(this.graphics.camera.quaternion).multiplyScalar(this.freeCamMoveSpeed);
            this.graphics.camera.position.add(move);
        }
    }
}
