import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { WEAPON_TYPES } from './Weps.js';

export class AIController {
    constructor(game, vehicle, targetVehicle, color = 0xffffff) {
        this.game = game;
        this.vehicle = vehicle;
        this.target = targetVehicle;
        this.color = color;

        this.state = 'CHASE'; // CHASE, ATTACK, FLEE, SEEK_HEALTH, SEEK_AMMO, WANDER
        this.lastStateChange = 0;

        this.throttle = 0;
        this.steer = 0;
        this.brake = 0;
        this.navSteer = 0;

        this.rayLength = 40;
        this.feelerAngles = [-Math.PI / 2, -Math.PI / 4, -Math.PI / 8, 0, Math.PI / 8, Math.PI / 4, Math.PI / 2]; 

        this.lastFireTime = 0;
        this.stuckTimer = 0;
        this.isReversing = false;
        this.reverseTimer = 0;

        this.evadeTimer = 0;
        this.evadeDir = Math.random() > 0.5 ? 1 : -1;

        this.boostAmount = 100;
        this.isBoosting = false;
        this.lastJumpTime = 0;

        this.detourTimer = 0;
        this.detourAngle = 0;
        this.currentFinalTarget = new THREE.Vector3();
        this.bloodlust = 0; 

        this.obstacles = [];
        this.updateObstacleCache();
        this.initDebug();
    }

    updateObstacleCache() {
        this.obstacles = this.game.physics.world.bodies.filter(b => b.mass === 0 && b !== this.game.physics.world.groundBody);
    }

    initDebug() {
        this.debugGroup = new THREE.Group();
        this.game.graphics.scene.add(this.debugGroup);
        this.feelerLines = [];
        this.feelerAngles.forEach(() => {
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 10)]), new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0.3 }));
            this.debugGroup.add(line);
            this.feelerLines.push(line);
        });
        this.sightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 10)]), new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 }));
        this.debugGroup.add(this.sightLine);
        this.dirLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 5)]), new THREE.LineBasicMaterial({ color: 0x00ff00 }));
        this.debugGroup.add(this.dirLine);
        this.targetMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 10, 8), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.5 }));
        this.game.graphics.scene.add(this.targetMarker);
        this.pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0.8 }));
        this.game.graphics.scene.add(this.pathLine);
    }

    update(dt) {
        if (this.vehicle.isDead) { this.resetControls(); this.debugGroup.visible = false; if (this.targetMarker) this.targetMarker.visible = false; if (this.pathLine) this.pathLine.visible = false; this.bloodlust = 0; return; }
        this.bloodlust += dt * 3.0;
        this.findBestAggressiveTarget();
        this.debugGroup.visible = true; if (this.targetMarker) this.targetMarker.visible = true; if (this.pathLine) this.pathLine.visible = true;

        const pos = new THREE.Vector3(this.vehicle.chassisBody.position.x, this.vehicle.chassisBody.position.y, this.vehicle.chassisBody.position.z);
        let targetPos = this.target ? new THREE.Vector3(this.target.chassisBody.position.x, this.target.chassisBody.position.y, this.target.chassisBody.position.z) : new THREE.Vector3(0, 0, 0);
        const dist = this.target ? pos.distanceTo(targetPos) : 999;
        
        this.updateDefensiveEvasion(dt, dist);

        const speed = this.vehicle.chassisBody.velocity.length();
        if (Math.abs(this.throttle) > 0.1 && speed < 3.0) this.stuckTimer += dt;
        else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);

        if (this.stuckTimer > 0.6 && !this.isReversing) { this.isReversing = true; this.reverseTimer = 1.8; this.evadeDir = Math.random() > 0.5 ? 1 : -1; }

        if (this.isReversing) {
            this.reverseTimer -= dt; this.throttle = 1.0; this.steer = 1.0 * this.evadeDir; 
            if (this.reverseTimer <= 0) { this.isReversing = false; this.stuckTimer = 0; }
            this.applyControls(dt, false); this.updateDebugVisuals(); return;
        }

        this.updateFSM(dist);
        let currentTarget = targetPos;
        const killNeed = Math.min(100, this.bloodlust);
        const hpThreshold = 40 - (killNeed * 0.35);

        if (this.state === 'SEEK_HEALTH' && this.vehicle.health < hpThreshold) {
            const nearestHP = this.findNearestPickup('health'); if (nearestHP) currentTarget = nearestHP.mesh.position; else this.state = 'WANDER';
        } else if (this.state === 'SEEK_AMMO' && this.getTotalAmmo() < 3) {
            const nearestAmmo = this.findNearestPickup('ammo') || this.findNearestPickup('missile'); if (nearestAmmo) currentTarget = nearestAmmo.mesh.position; else this.state = 'WANDER';
        }
        if (this.state === 'WANDER') currentTarget = new THREE.Vector3(0, 0, 0);

        this.navigate(currentTarget, dist, dt);
        this.tacticalAvoidance(targetPos, dist);
        this.applyAbsoluteAvoidance();
        this.updateCombat(dist);
        
        // Burnout detection for AI (simultaneous gas + brake)
        const isBurnout = (Math.abs(this.throttle) > 0.5 && this.brake > 5 && speed < 8);
        
        this.applyControls(dt, isBurnout);
        this.updateDebugVisuals();
    }

    updateDefensiveEvasion(dt, dist) {
        if (this.lastHealth === undefined) this.lastHealth = this.vehicle.health;
        if (this.vehicle.health < this.lastHealth) { this.evadeTimer = 2.5; this.evadeDir = Math.random() > 0.5 ? 1 : -1; }
        this.lastHealth = this.vehicle.health;
        if (this.evadeTimer > 0) { this.evadeTimer -= dt; this.steer += Math.sin(Date.now() * 0.015) * 1.0 * this.evadeDir; if (this.boostAmount > 10) this.isBoosting = true; }
    }

    findBestAggressiveTarget() {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
        let bestTarget = null, bestScore = -Infinity;
        this.game.cars.forEach(car => {
            if (car === this.vehicle || car.isDead) return;
            const toCar = new THREE.Vector3(car.chassisBody.position.x - pos.x, 0, car.chassisBody.position.z - pos.z), dist = toCar.length(), dot = fwd.dot(toCar.normalize());
            const score = (dot * 3.0) + (200 / Math.max(10, dist)); if (score > bestScore) { bestScore = score; bestTarget = car; }
        });
        if (bestTarget) this.target = bestTarget;
    }

    updateFSM(dist) {
        const ammoCount = this.getTotalAmmo(), killNeed = Math.min(100, this.bloodlust), lowHealth = this.vehicle.health < (40 - killNeed * 0.35), lowAmmo = ammoCount < (5 - killNeed * 0.04);
        if (lowHealth) this.state = 'SEEK_HEALTH'; else if (lowAmmo) this.state = 'SEEK_AMMO'; else if (dist < 150 + (killNeed * 0.8)) this.state = 'ATTACK'; else this.state = 'CHASE';
    }

    findNearestPickup(type) {
        let nearest = null, minDist = Infinity;
        const pos = new THREE.Vector3(this.vehicle.chassisBody.position.x, this.vehicle.chassisBody.position.y, this.vehicle.chassisBody.position.z);
        this.game.pickups.pickups.forEach(p => { if (p.type === type || (type === 'ammo' && Object.keys(WEAPON_TYPES).includes(p.type))) { const d = pos.distanceTo(p.mesh.position); if (d < minDist) { minDist = d; nearest = p; } } });
        return nearest;
    }

    applyAbsoluteAvoidance() {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
        let repulsionSteer = 0, dangerFound = false;
        const wallBuffer = 55; 
        if (pos.x > 400 - wallBuffer) { repulsionSteer -= 6.0; dangerFound = true; if (fwd.x > 0) this.throttle = 0.8; }
        if (pos.x < -400 + wallBuffer) { repulsionSteer += 6.0; dangerFound = true; if (fwd.x < 0) this.throttle = 0.8; }
        if (pos.z > 400 - wallBuffer) { repulsionSteer += 6.0 * (fwd.x > 0 ? 1 : -1); dangerFound = true; if (fwd.z > 0) this.throttle = 0.8; }
        if (pos.z < -400 + wallBuffer) { repulsionSteer += 6.0 * (fwd.x > 0 ? -1 : 1); dangerFound = true; if (fwd.z < 0) this.throttle = 0.8; }
        this.obstacles.forEach(obs => {
            const toObs = new THREE.Vector3(obs.position.x - pos.x, 0, obs.position.z - pos.z), dist = toObs.length(), radius = 45; 
            if (dist < radius) {
                dangerFound = true; const dot = fwd.dot(toObs.normalize());
                if (dot > 0) { const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat); repulsionSteer += (toObs.dot(right) > 0 ? -1 : 1) * 8.0 * (1.0 - dist/radius); this.throttle = 0.8; if (dist < 15) this.isReversing = true; }
            }
        });
        if (dangerFound) { this.steer = repulsionSteer; this.steer = THREE.MathUtils.clamp(this.steer, -CONFIG.maxSteerVal * 4.5, CONFIG.maxSteerVal * 4.5); }
    }

    navigate(targetPos, dist, dt) {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
        const isBlocked = this.checkLineOfSight(targetPos); let finalTargetPos = targetPos;
        if (isBlocked || this.detourTimer > 0) {
            if (isBlocked && (this.detourTimer <= 0 || isBlocked)) { this.detourTimer = 2.0; this.detourAngle = this.findClearestPathAngle(); }
            else { this.detourTimer -= dt; }
            const detourDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.detourAngle).applyQuaternion(quat);
            finalTargetPos = new THREE.Vector3(pos.x + detourDir.x * 50, pos.y, pos.z + detourDir.z * 50);
        }
        this.currentFinalTarget.copy(finalTargetPos);
        const toTarget = new THREE.Vector3(finalTargetPos.x - pos.x, 0, finalTargetPos.z - pos.z).normalize(), right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd);
        this.navSteer = THREE.MathUtils.clamp(toTarget.dot(right) * 5, -1, 1) * CONFIG.maxSteerVal; this.steer = this.navSteer;
        this.throttle = -1.0;
        const killNeed = Math.min(100, this.bloodlust);
        this.isBoosting = (dist > 80 && this.boostAmount > 20 && !isBlocked && this.detourTimer <= 0) || (killNeed > 70 && dist < 120);
        if (this.state === 'ATTACK') { if (dist < 15) { this.throttle = 0.5; this.steer *= -1; } else if (dist < 30) this.throttle = -0.3; }
        if (this.isBoosting) this.boostAmount -= 1.2; else this.boostAmount = Math.min(100, this.boostAmount + 0.4);
    }

    checkLineOfSight(targetPos) {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w), right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat), offsets = [0, -2.5, 2.5]; 
        for (let offset of offsets) {
            const start = new CANNON.Vec3(pos.x + right.x * offset, pos.y + 1, pos.z + right.z * offset), toPos = new CANNON.Vec3(targetPos.x + right.x * offset, targetPos.y + 1, targetPos.z + right.z * offset), res = new CANNON.RaycastResult();
            this.game.physics.world.raycastClosest(start, toPos, { collisionFilterMask: ~0, skipBackfaces: true }, res);
            if (res.hasHit && res.body !== this.vehicle.chassisBody && (!this.target || res.body !== this.target.chassisBody)) return true;
        }
        return false;
    }

    findClearestPathAngle() {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
        let clearestAngle = 0, maxDist = 0; const scanAngles = [-Math.PI/1.5, -Math.PI/2, -Math.PI/3, -Math.PI/6, 0, Math.PI/6, Math.PI/3, Math.PI/2, Math.PI/1.5];
        scanAngles.forEach(angle => {
            const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).applyQuaternion(quat);
            const from = new CANNON.Vec3(pos.x, pos.y + 0.5, pos.z), to = new CANNON.Vec3(pos.x + dir.x * 70, pos.y + dir.y * 70, pos.z + dir.z * 70), res = new CANNON.RaycastResult();
            this.game.physics.world.raycastClosest(from, to, { collisionFilterMask: ~0, skipBackfaces: true }, res);
            const d = res.hasHit ? res.distance : 70; if (d > maxDist) { maxDist = d; clearestAngle = angle; }
        });
        return clearestAngle;
    }

    tacticalAvoidance(targetPos, dist) {
        if (!this.target) return;
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
        if (dist < 60) this.steer += Math.sin(Date.now() * 0.01) * 0.3;
        const now = Date.now();
        if (now - this.lastJumpTime > 1000) {
            this.game.projectiles.activeMines.forEach(mine => {
                const mPos = new THREE.Vector3(mine.body.position.x, 0, mine.body.position.z), toMine = mPos.clone().sub(new THREE.Vector3(pos.x, 0, pos.z));
                if (toMine.length() < 22 && fwd.dot(toMine.normalize()) > 0.85) { this.jump(); this.lastJumpTime = now; }
            });
        }
    }

    avoidObstacles() {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w), speed = this.vehicle.chassisBody.velocity.length(), dynamicRay = Math.max(35, speed * 3.5);
        this.feelerAngles.forEach((angle, i) => {
            const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).applyQuaternion(quat);
            const from = new CANNON.Vec3(pos.x, pos.y + 0.5, pos.z), to = new CANNON.Vec3(pos.x + dir.x * dynamicRay, pos.y + dir.y * dynamicRay, pos.z + dir.z * dynamicRay), res = new CANNON.RaycastResult();
            this.game.physics.world.raycastClosest(from, to, { collisionFilterMask: ~0, skipBackfaces: true }, res);
            if (res.hasHit && res.body !== this.vehicle.chassisBody) {
                const weight = Math.pow(1.1 - (res.distance / dynamicRay), 3) * 5.0;
                if (Math.abs(angle) < Math.PI / 4 && res.distance < 20) { this.throttle = 0.8; if (res.distance < 10) this.isReversing = true; }
                if (angle === 0) this.steer += (this.evadeDir * 5.0 * weight); else if (angle < 0) this.steer -= 4.0 * weight; else if (angle > 0) this.steer += 4.0 * weight;
            }
        });
        this.steer = THREE.MathUtils.clamp(this.steer, -CONFIG.maxSteerVal * 5, CONFIG.maxSteerVal * 5);
    }

    updateCombat(dist) {
        if (!this.target || dist > 250) return;
        const killNeed = Math.min(100, this.bloodlust), weapons = this.vehicle.weaponInventory, priority = ['melee', 'missile', 'turret', 'shotgun', 'cannon', 'ult'];
        let bestWep = 'missile'; for (let type of priority) { if (this.vehicle.ammo[type] > 0) bestWep = type; }
        this.vehicle.currentWeaponIndex = weapons.indexOf(bestWep); if (this.vehicle.currentWeaponIndex === -1) { this.vehicle.currentWeaponIndex = 0; bestWep = 'missile'; }
        const pos = this.vehicle.chassisBody.position, targetPos = this.target.chassisBody.position, q = this.vehicle.chassisBody.quaternion, fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)), toTarget = new THREE.Vector3(targetPos.x - pos.x, targetPos.y - pos.y, targetPos.z - pos.z).normalize();
        const ranges = { 'melee': 15, 'shotgun': 40, 'turret': 100, 'missile': 250, 'cannon': 150, 'ult': 130 };
        if (dist < (ranges[bestWep] || 150) && fwd.dot(toTarget) > (0.9 - killNeed * 0.001)) {
            const from = new CANNON.Vec3(pos.x, pos.y + 1, pos.z), to = new CANNON.Vec3(targetPos.x, targetPos.y + 1, targetPos.z), res = new CANNON.RaycastResult();
            this.game.physics.world.raycastClosest(from, to, { collisionFilterMask: ~0, skipBackfaces: true }, res);
            if (!res.hasHit || res.body === this.target.chassisBody) this.fire(bestWep);
        }
    }

    fire(weaponType) {
        const now = Date.now(), killNeed = Math.min(100, this.bloodlust), rates = { 'melee': 100, 'turret': 100, 'missile': 250, 'shotgun': 600, 'cannon': 800, 'ult': 1200 }, rate = (rates[weaponType] || 300) * (1.0 - killNeed * 0.003);
        if (now - this.lastFireTime > rate) {
            const q = this.vehicle.chassisBody.quaternion, forward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
            if (weaponType !== 'missile' || this.vehicle.ammo['missile'] > 0) this.vehicle.ammo[weaponType]--;
            this.game.projectiles.fireBullet(this.vehicle.chassisBody.position, forward, 0, this.vehicle); this.lastFireTime = now;
        }
    }

    dropMine() {
        const now = Date.now(); if (now - (this.lastMineTime || 0) > 3000) {
            const q = this.vehicle.chassisBody.quaternion, backward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
            this.game.projectiles.dropMine(this.vehicle.chassisBody.position, backward, 'standard'); this.vehicle.mineAmmo--; this.lastMineTime = now;
        }
    }

    jump() { this.vehicle.chassisBody.velocity.y = 8; }

    updateDebugVisuals() {
        const pos = this.vehicle.chassisBody.position, q = this.vehicle.chassisBody.quaternion, quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
        this.debugGroup.position.copy(pos); this.debugGroup.position.y += 0.5;
        this.feelerLines.forEach((line, i) => { const dir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.feelerAngles[i]).applyQuaternion(quat); line.geometry.setFromPoints([new THREE.Vector3(), dir.multiplyScalar(this.rayLength)]); });
        if (this.target) { const tPos = this.target.chassisBody.position; this.sightLine.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3(tPos.x - pos.x, tPos.y - pos.y, tPos.z - pos.z)]); this.sightLine.visible = true; } else this.sightLine.visible = false;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat); this.dirLine.geometry.setFromPoints([new THREE.Vector3(), fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.steer * 2).multiplyScalar(6)]);
        if (this.targetMarker) { this.targetMarker.position.copy(this.currentFinalTarget); this.targetMarker.position.y = 5.0; }
        if (this.pathLine) this.pathLine.geometry.setFromPoints([pos, this.currentFinalTarget]);
    }

    applyControls(dt, isBurnout) { this.game.applyVehicleControlsAI(this.vehicle, this.throttle, this.steer, isBurnout ? 50 : 0, this.isBoosting); }
    resetControls() { this.throttle = 0; this.steer = 0; this.brake = 10; }
    getTotalAmmo() { return this.vehicle.ammo ? Object.values(this.vehicle.ammo).reduce((a, b) => a + b, 0) : 0; }
    getTelemetry() {
        const pos = new THREE.Vector3(this.vehicle.chassisBody.position.x, this.vehicle.chassisBody.position.y, this.vehicle.chassisBody.position.z), targetPos = this.target ? new THREE.Vector3(this.target.chassisBody.position.x, this.target.chassisBody.position.y, this.target.chassisBody.position.z) : pos;
        let action = "Idle"; if (this.isReversing) action = "Emergency Reverse"; else if (this.state === 'SEEK_HEALTH') action = "Hunting Health"; else if (this.state === 'SEEK_AMMO') action = "Hunting Ammo"; else if (this.detourTimer > 0) action = "Wall Detour"; else if (this.state === 'ATTACK') action = "KILLING (" + Math.floor(this.bloodlust) + ")"; else if (this.state === 'CHASE') action = "Chasing Target"; else if (this.state === 'WANDER') action = "Wandering";
        return { state: this.state, action: action, health: Math.floor(this.vehicle.health), boost: Math.floor(this.boostAmount), speed: Math.floor(this.vehicle.chassisBody.velocity.length() * 3.6), distToTarget: Math.floor(pos.distanceTo(targetPos)), stuck: this.stuckTimer.toFixed(1), isReversing: this.isReversing, isBoosting: this.isBoosting, ammo: this.getTotalAmmo(), bloodlust: Math.floor(this.bloodlust) };
    }
}
