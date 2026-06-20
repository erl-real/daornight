import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { Graphics } from './Graphics.js';
import { Physics } from './Physics.js';
import { Vehicle } from './Vehicle.js';
import { Projectiles } from './Projectiles.js';
import { Pickups } from './Pickups.js';
import { WEAPON_TYPES } from './Weps.js';
import { AIController } from './AIController.js';
import { Input } from './Input.js';

export class AIGame {
    constructor() {
        this.CONFIG = CONFIG;
        this.isPaused = false;
        this.clock = new THREE.Clock();
        
        this.isFreeCam = true;
        this.freeCamYaw = 0;
        this.freeCamPitch = -0.8;
        this.freeCamMoveSpeed = 1.2;
        
        try {
            this.graphics = new Graphics();
            this.input = new Input();
            // Remove the infinite floor and grid from Graphics.js
            const toRemove = [];
            this.graphics.scene.traverse(c => {
                if (c.isGridHelper || (c.isMesh && c.geometry.type === 'PlaneGeometry')) {
                    toRemove.push(c);
                }
            });
            toRemove.forEach(c => this.graphics.scene.remove(c));

            // Create a precise 800x800 arena floor
            const arenaFloor = new THREE.Mesh(
                new THREE.PlaneGeometry(800, 800),
                new THREE.MeshPhongMaterial({ color: 0x151515 })
            );
            arenaFloor.rotation.x = -Math.PI / 2;
            arenaFloor.receiveShadow = true;
            this.graphics.scene.add(arenaFloor);

            // Add a simplified grid (20 divisions = lines every 40 units)
            this.graphics.scene.add(new THREE.GridHelper(800, 20, 0x444444, 0x222222));

            this.physics = new Physics();
            // Remove default walls from Physics.js
            this.physics.world.bodies.forEach(b => {
                if (b.mass === 0 && b.shapes[0] instanceof CANNON.Box) {
                    this.physics.world.removeBody(b);
                }
            });

            // Add new boundaries for 800x800
            const h = 20;
            const wallShapeHoriz = new CANNON.Box(new CANNON.Vec3(400, h/2, 2));
            const wallShapeVert = new CANNON.Box(new CANNON.Vec3(2, h/2, 400));
            [[0, h/2, 400, wallShapeHoriz], [0, h/2, -400, wallShapeHoriz], [400, h/2, 0, wallShapeVert], [-400, h/2, 0, wallShapeVert]].forEach(p => {
                const b = new CANNON.Body({ mass: 0 });
                b.addShape(p[3]);
                b.position.set(p[0], p[1], p[2]);
                this.physics.world.addBody(b);

                const wallMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(p[3].halfExtents.x*2, h, p[3].halfExtents.z*2), wallMat);
                mesh.position.set(p[0], p[1], p[2]);
                this.graphics.scene.add(mesh);
            });
            
            this.projectiles = new Projectiles(this.graphics.scene, this.physics.world);
            
            const pickupLocs = [
                { x: 150, z: 150, type: 'health' },
                { x: -150, z: -150, type: 'ammo' },
                { x: 150, z: -150, type: 'charge' },
                { x: -150, z: 150, type: 'health' },
                { x: 200, z: 0, type: 'ammo' },
                // Weapons ring 1
                { x: 160, z: 0, type: 'shotgun' },
                { x: -160, z: 0, type: 'turret' },
                { x: 0, z: 160, type: 'cannon' },
                { x: 0, z: -160, type: 'energy' },
                // Weapons ring 2
                { x: 240, z: 240, type: 'missile' },
                { x: -240, z: -240, type: 'ult' },
                { x: 260, z: 80, type: 'melee' },
                { x: -260, z: -80, type: 'mortar' },
                // Survival depots far out
                { x: 300, z: 0, type: 'health' }, { x: -300, z: 0, type: 'health' },
                { x: 0, z: 300, type: 'health' }, { x: 0, z: -300, type: 'health' },
                { x: 300, z: 300, type: 'ammo' }, { x: -300, z: -300, type: 'ammo' }
            ];
            this.pickups = new Pickups(this.graphics.scene, pickupLocs);

            this.cars = [];
            this.controllers = [];

            const spawnPoints = [
                { pos: new CANNON.Vec3(-100, 4, -100), color: 0xff0000, name: 'RED' },
                { pos: new CANNON.Vec3(100, 4, 100), color: 0x0000ff, name: 'BLUE' },
                { pos: new CANNON.Vec3(-100, 4, 100), color: 0x00ff00, name: 'GREEN' },
                { pos: new CANNON.Vec3(100, 4, -100), color: 0xffff00, name: 'YELLOW' },
                { pos: new CANNON.Vec3(-200, 4, 0), color: 0xff00ff, name: 'PURPLE' },
                { pos: new CANNON.Vec3(200, 4, 0), color: 0x00ffff, name: 'CYAN' },
                { pos: new CANNON.Vec3(0, 4, -200), color: 0xffffff, name: 'WHITE' },
                { pos: new CANNON.Vec3(0, 4, 200), color: 0xffa500, name: 'ORANGE' }
            ];

            spawnPoints.forEach(sp => {
                const car = new Vehicle(this.graphics.scene, this.physics.world, false, sp.pos, 'concept', sp.color);
                car.weaponInventory = ['missile'];
                car.currentWeaponIndex = 0;
                const wepKeys = Object.keys(WEAPON_TYPES).filter(k => k !== 'ult');
                const ammoInit = {};
                wepKeys.forEach(k => ammoInit[k] = 0);
                ammoInit.missile = 15;
                ammoInit.ult = 0;
                car.ammo = ammoInit;
                car.mineAmmo = 5;
                car.name = sp.name;
                this.cars.push(car);
            });

            // Target cycle
            for(let i=0; i<this.cars.length; i++) {
                this.controllers.push(new AIController(this, this.cars[i], this.cars[(i+1)%this.cars.length], spawnPoints[i].color));
            }

            this.scores = {};
            spawnPoints.forEach(sp => this.scores[sp.name.toLowerCase()] = 0);
            
            this.initUI();
            this.initArena();
            this.animate();

            this.graphics.camera.position.set(0, 250, 250);
            this.graphics.camera.lookAt(0, 0, 0);

            window.game = this;
        } catch (e) {
            console.error(e);
        }
    }

    initUI() {
        // Scoreboard (Right)
        this.scoreEl = document.createElement('div');
        this.scoreEl.style.cssText = 'position: absolute; top: 20px; right: 20px; color: white; font-family: monospace; font-size: 16px; text-align: right; text-shadow: 2px 2px 2px black; pointer-events: none; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px;';
        this.updateScoreUI();
        document.body.appendChild(this.scoreEl);

        // Action Log (Left)
        this.logEl = document.createElement('div');
        this.logEl.style.cssText = 'position: absolute; top: 20px; left: 20px; color: #0f0; font-family: monospace; font-size: 14px; text-align: left; text-shadow: 2px 2px 2px black; pointer-events: none; background: rgba(0,0,0,0.6); padding: 10px; border-radius: 5px; max-width: 300px; line-height: 1.4; border-left: 3px solid #0f0;';
        document.body.appendChild(this.logEl);
    }

    updateLogUI() {
        let html = '<div style="font-weight: bold; border-bottom: 1px solid #0f0; margin-bottom: 5px; padding-bottom: 5px;">ACTIVE AI ACTIONS</div>';
        this.controllers.forEach(ctrl => {
            const data = ctrl.getTelemetry();
            const color = '#' + ctrl.color.toString(16).padStart(6, '0');
            html += `<div><span style="color: ${color}; width: 60px; display: inline-block;">${ctrl.vehicle.name}:</span> <b>${data.action}</b></div>`;
        });
        this.logEl.innerHTML = html;
    }

    updateScoreUI() {
        let html = '';
        const colors = { red:'#ff0000', blue:'#0000ff', green:'#00ff00', yellow:'#ffff00', purple:'#ff00ff', cyan:'#00ffff', white:'#ffffff', orange:'#ffa500' };
        for (let name in this.scores) {
            html += `<span style="color: ${colors[name]};">${name.toUpperCase()}: ${this.scores[name]}</span><br>`;
        }
        this.scoreEl.innerHTML = html;
    }

    initArena() {
        const boxGeo = new THREE.BoxGeometry(30, 60, 30);
        const boxMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        
        const positions = [
            [300, 30, 300], [300, 30, 250], [250, 30, 300],
            [-300, 30, 300], [-300, 30, 250], [-250, 30, 300],
            [300, 30, -300], [300, 30, -250], [250, 30, -300],
            [-300, 30, -300], [-300, 30, -250], [-250, 30, -300],
            [0, 30, 350], [0, 30, -350], [350, 30, 0], [-350, 30, 0],
            // Mid scattering
            [150, 30, 150], [-150, 30, 150], [150, 30, -150], [-150, 30, -150]
        ];

        positions.forEach(pos => {
            const mesh = new THREE.Mesh(boxGeo, boxMat);
            mesh.position.set(pos[0], pos[1], pos[2]);
            this.graphics.scene.add(mesh);
            
            // Physics body is much taller and goes deep under ground
            const body = new CANNON.Body({ mass: 0 });
            body.addShape(new CANNON.Box(new CANNON.Vec3(15, 60, 15))); // 120m total height
            body.position.set(pos[0], 0, pos[2]); // Centered at Y=0 so it goes 60m up and 60m down
            this.physics.world.addBody(body);
        });

        // Hard Ground Body
        const groundBody = new CANNON.Body({ mass: 0, material: CONFIG.materials?.ground || new CANNON.Material('ground') });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.physics.world.addBody(groundBody);
    }

    checkCollisions() {
        const now = Date.now();
        for (let i = this.projectiles.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles.projectiles[i];
            for (let j = 0; j < this.cars.length; j++) {
                const car = this.cars[j];
                if (p.source === car) continue;
                const dist = p.mesh.position.distanceTo(car.chassisBody.position);
                if (dist < 3.5 && !car.isDead) {
                    car.applyDamage(10);
                    this.graphics.scene.remove(p.mesh);
                    this.projectiles.projectiles.splice(i, 1);
                    if (car.health <= 0) {
                        if (p.source && p.source.name) {
                            this.scores[p.source.name.toLowerCase()]++;
                            this.updateScoreUI();
                        }
                        car.die();
                        setTimeout(() => car.reset(new CANNON.Vec3((Math.random()-0.5)*600, 4, (Math.random()-0.5)*600)), 3000);
                    }
                    break;
                }
            }
        }

        // Pickups
        this.cars.forEach(car => {
            this.pickups.update(now, car.chassisBody.position, (type) => {
                if (type === 'health') { 
                    car.health = Math.min(100, car.health + 30); 
                    car.updateHealthBar(); 
                } else if (type === 'ammo') {
                    // Give ammo to all weapons
                    for (let w in car.ammo) {
                        car.ammo[w] += 5;
                    }
                } else if (Object.keys(WEAPON_TYPES).includes(type)) {
                    if (!car.weaponInventory.includes(type)) {
                        car.weaponInventory.push(type);
                    }
                    car.ammo[type] = (car.ammo[type] || 0) + 5;
                    // Auto-switch to the new weapon
                    car.currentWeaponIndex = car.weaponInventory.indexOf(type);
                }
                return true; 
            });
        });
    }

    applyVehicleControlsAI(vehicle, throttle, steerVal, brakeForce, isBoosting = false) {
        const speedKmH = Math.abs(vehicle.chassisBody.velocity.length() * 3.6);
        const engineMult = vehicle.carConfig.engineMultiplier || 1.0;
        const torqueMult = vehicle.carConfig.torqueMultiplier || 1.0;

        const wheelCount = vehicle.wheelMeshes.length;
        const rearWheels = wheelCount > 2 ? [2, 3] : [1];
        const frontWheels = wheelCount > 2 ? [0, 1] : [0];

        // --- BURNOUT / TURN-IN-PLACE ---
        // AI triggers burnout if throttle is high and brake is active
        const isBraking = brakeForce > 5;
        const isBurnout = (Math.abs(throttle) > 0.3 && isBraking && speedKmH < 30);

        // --- DYNAMIC STEERING ---
        let finalSteer = steerVal;
        if (speedKmH < 40) {
            finalSteer *= (1.0 + (40 - speedKmH) / 30); 
        }

        // --- ENGINE FORCE ---
        let force = throttle * CONFIG.engineForce * (isBoosting ? 2.5 : 1.3) * engineMult * torqueMult;
        if (throttle > 0) force *= 2.2; 

        if (vehicle.vehicle) {
            if (isBurnout) {
                // Kill rear friction and apply massive pivot torque
                rearWheels.forEach(i => {
                    if (vehicle.vehicle.wheelInfos[i]) vehicle.vehicle.wheelInfos[i].frictionSlip = 0.05;
                    vehicle.vehicle.applyEngineForce(-CONFIG.engineForce * 5.0, i);
                });
                const torque = new CANNON.Vec3(0, -steerVal * vehicle.chassisBody.mass * 120.0, 0);
                vehicle.chassisBody.torque.vadd(torque, vehicle.chassisBody.torque);

                // Front lock
                frontWheels.forEach(i => vehicle.vehicle.setBrake(40, i));
            } else {
                rearWheels.forEach(i => {
                    if (vehicle.vehicle.wheelInfos[i]) vehicle.vehicle.wheelInfos[i].frictionSlip = vehicle.carConfig.frictionSlip || 5;
                    vehicle.vehicle.applyEngineForce(force, i);
                });
                frontWheels.forEach(i => vehicle.vehicle.setSteeringValue(finalSteer, i));
                for (let i = 0; i < wheelCount; i++) vehicle.vehicle.setBrake(brakeForce || (throttle === 0 ? 15 : 0), i);
            }
        }
    }
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.1);
        if (this.isPaused) return;
        this.updateCamera(dt);
        this.physics.step(dt);
        this.projectiles.update(Date.now());
        this.cars.forEach(car => car.update(dt));
        this.controllers.forEach(ctrl => ctrl.update(dt));

        this.updateLogUI();
        this.checkCollisions();
        this.graphics.render(this.graphics.scene, this.graphics.camera);
    }

    updateCamera(dt) {
        const keys = this.input.keys;
        const turnSpeed = 0.035;
        if (keys['ArrowLeft']) this.freeCamYaw += turnSpeed;
        if (keys['ArrowRight']) this.freeCamYaw -= turnSpeed;
        if (keys['ArrowUp']) this.freeCamPitch = Math.max(-1.45, this.freeCamPitch + turnSpeed);
        if (keys['ArrowDown']) this.freeCamPitch = Math.min(1.45, this.freeCamPitch - turnSpeed);
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
