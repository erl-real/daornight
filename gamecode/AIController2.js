import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { WEAPON_TYPES } from './Weps.js';

const FORWARD = 1;
const REVERSE = -1;

export class AIController2 {
    constructor(game, vehicle, profile, color) {
        this.game = game;
        this.vehicle = vehicle;
        this.profile = profile;
        this.color = color;

        this.target = null;
        this.state = 'patrol';
        this.stateTimer = 0;
        this.lastFireTime = 0;
        this.lastMineTime = 0;
        this.lastHealth = vehicle.health;
        this.healthDropTimer = 0;
        this.stuckTimer = 0;
        this.lastProgressPos = this.getPosition();
        this.unstuckPhase = 0;
        this.unstuckTurnDir = Math.random() > 0.5 ? 1 : -1;
        this.controls = { throttle: 0, steer: 0, brake: 0, boost: false, leanActive: false };
        this.patrolTarget = this.randomPatrolPoint();
        this.lastWeaponType = 'missile';
        this.aimSway = Math.random() * 1000;
        this.evadeSerpentine = Math.random() > 0.5 ? 1 : -1;
        this.dodgeTimer = 0;
        this.lastJumpTime = 0;
        this.lastDriftTime = 0;
        this.lastShieldTime = 0;
        this.lastAirFlipTime = 0;
        this.leanTimer = 0;
        this.hydraulicsTimer = 0;
    }

    update(dt) {
        if (this.vehicle.isDead) {
            this.resetControls();
            return;
        }

        this.acquireTarget();
        const position = this.getPosition();
        const speed = this.vehicle.chassisBody.velocity.length();
        const targetPos = this.target ? this.getVehiclePosition(this.target) : position.clone();
        const distToTarget = position.distanceTo(targetPos);
        const sensors = this.sampleSensors();
        const now = Date.now();
        const isGrounded = this.vehicle.isTrulyGrounded;
        const inHover = this.vehicle.hoverMode;

        this.trackDamage(dt);
        this.updateState(dt, distToTarget, sensors, speed, isGrounded, inHover);

        this.controls.leanActive = false;
        this.vehicle.isDrifting = false;
        this.vehicle.hydraulics.targetPitch = 0;
        this.vehicle.hydraulics.targetRoll = 0;
        this.vehicle.hydraulics.targetLift = 0;

        if (this.state === 'recover') {
            this.runRecovery(dt, sensors);
        } else if (this.state === 'evade') {
            this.runEvade(dt, position, targetPos, distToTarget, sensors, speed, now, isGrounded, inHover);
        } else if (this.state === 'collect') {
            this.runCollect(dt, position, targetPos, sensors, speed, now, isGrounded, inHover);
        } else {
            this.runCombat(dt, position, targetPos, distToTarget, sensors, speed, now, isGrounded, inHover);
        }

        this.applyMineLogic(position, sensors);
        this.applyWeaponLogic(position, targetPos, distToTarget, sensors, now);
        this.game.applyVehicleControlsAI(
            this.vehicle, this.controls.throttle, this.controls.steer,
            this.controls.brake, this.controls.boost
        );
    }

    trackDamage(dt) {
        if (this.vehicle.health < this.lastHealth) {
            this.healthDropTimer = 2.5;
            this.evadeSerpentine = Math.random() > 0.5 ? 1 : -1;
        }
        this.lastHealth = this.vehicle.health;
        if (this.healthDropTimer > 0) this.healthDropTimer -= dt;
    }

    acquireTarget() {
        const pos = this.getPosition();
        const forward = this.getForward();
        let best = null;
        let bestScore = -1e9;

        for (const candidate of this.game.cars) {
            if (candidate === this.vehicle || candidate.isDead) continue;
            const cPos = this.getVehiclePosition(candidate);
            const toC = cPos.clone().sub(pos);
            const dist = Math.max(1, toC.length());
            const toCNorm = toC.clone().normalize();
            let score = forward.dot(toCNorm) * 40 + 300 / dist + (100 - candidate.health) * 0.3;
            if (candidate === this.game.player) {
                score += 200;
                if (dist < 80) score += 120;
                if (this.vehicle.health < 50) score -= 80;
            } else {
                score -= 50;
            }
            if (score > bestScore) { bestScore = score; best = candidate; }
        }
        this.target = best;
    }

    updateState(dt, distToTarget, sensors, speed, isGrounded, inHover) {
        this.stateTimer += dt;

        const progress = this.getPosition().distanceTo(this.lastProgressPos);
        this.lastProgressPos.copy(this.getPosition());
        const tryingToDrive = this.controls.throttle === FORWARD || this.controls.throttle === REVERSE
            || (this.state !== 'recover' && this.state !== 'evade');

        if (tryingToDrive && progress < 0.5 && speed < 12) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = Math.max(0, this.stuckTimer - dt * 1.5);
        }

        if (this.stuckTimer > 1.2 || (sensors.front < 5 && sensors.centerDanger > 0.9)) {
            this.state = 'recover';
            this.stateTimer = 0;
            this.unstuckPhase = 0;
            this.unstuckTurnDir = sensors.left > sensors.right ? 1 : -1;
            return;
        }

        const beingHit = this.healthDropTimer > 0;
        const lowHp = this.vehicle.health < 35;
        const lowAmmo = this.getTotalAmmo() < 6;

        if (lowHp) {
            this.state = 'collect'; this.stateTimer = 0; return;
        }
        if (beingHit && distToTarget > 25 && lowHp) {
            this.state = 'evade'; this.stateTimer = 0; return;
        }
        if (this.state === 'evade' && this.stateTimer > 2.0) {
            this.state = 'engage'; this.stateTimer = 0; return;
        }
        if (lowAmmo && this.state !== 'collect') {
            this.state = 'collect'; this.stateTimer = 0; return;
        }
        if (!this.target) { this.state = 'patrol'; return; }
        this.state = 'engage';
    }

    // ========== STATE HANDLERS ==========

    runRecovery(dt, sensors) {
        this.controls.boost = false; this.controls.brake = 0;
        if (this.unstuckPhase === 0) {
            this.controls.throttle = REVERSE;
            this.controls.steer = CONFIG.maxSteerVal * this.unstuckTurnDir * 1.2;
            if (this.stateTimer > 0.6) { this.unstuckPhase = 1; this.stateTimer = 0; }
            return;
        }
        this.controls.throttle = FORWARD;
        this.controls.steer = CONFIG.maxSteerVal * -this.unstuckTurnDir * 0.8;
        if (this.stateTimer > 0.8 || sensors.front > 18) {
            this.state = 'engage'; this.stateTimer = 0; this.stuckTimer = 0;
        }
    }

    runEvade(dt, position, targetPos, distToTarget, sensors, speed, now, isGrounded, inHover) {
        const awayDir = targetPos.clone().sub(position).normalize().multiplyScalar(-1);
        const evadeTarget = this.clampInsideArena(position.clone().add(awayDir.multiplyScalar(80)));
        this.driveToward(dt, evadeTarget, sensors, speed, true, now, isGrounded, inHover);

        this.controls.boost = true;
        if (sensors.rear < 20 && this.vehicle.mineAmmo > 0 && now - this.lastMineTime > 2000) {
            this.dropMine();
        }
        if (isGrounded && now - this.lastJumpTime > 2000 && this.vehicle.energy >= 20) {
            this.doJump(36);
        }
        if (isGrounded && Math.random() < 0.03) {
            this.doDrift(sensors);
        }
    }

    runCollect(dt, position, targetPos, sensors, speed, now, isGrounded, inHover) {
        const pickup = this.findBestPickup(position);
        if (pickup) {
            const pPos = pickup.mesh.position.clone();
            if (pPos.distanceTo(position) > 8) {
                this.driveToward(dt, pPos, sensors, speed, false, now, isGrounded, inHover);
                if (this.vehicle.health < 60 && isGrounded && now - this.lastJumpTime > 2000 && this.vehicle.energy >= 20) {
                    this.doJump(24);
                }
                return;
            }
        }
        if (this.vehicle.health >= 70 && this.getTotalAmmo() >= 16) {
            this.state = 'engage'; this.stateTimer = 0; return;
        }
        this.driveToward(dt, this.randomPatrolPoint(), sensors, speed, false, now, isGrounded, inHover);
    }

    runCombat(dt, position, targetPos, distToTarget, sensors, speed, now, isGrounded, inHover) {
        const moveTarget = this.chooseCombatPosition(position, targetPos, distToTarget);
        this.driveToward(dt, moveTarget, sensors, speed, false, now, isGrounded, inHover);

        if (distToTarget > this.profile.preferredRange + 20) {
            this.controls.boost = true;
        }

        if (distToTarget < 20 && sensors.front < 10) {
            this.controls.throttle = REVERSE;
            this.controls.steer *= -1.2;
        }

        if (this.healthDropTimer > 0 && distToTarget < 50 && this.vehicle.energy > 5) {
            this.doShield(now);
        }

        if (this.vehicle.health < 45 && distToTarget > 60 && isGrounded && now - this.lastJumpTime > 2000) {
            this.doJump(24);
        }
    }

    // ========== DRIVING ==========

    driveToward(dt, target, sensors, speed, isEvade, now, isGrounded, inHover) {
        const position = this.getPosition();
        const desiredDir = target.clone().sub(position);
        desiredDir.y = 0;
        if (desiredDir.lengthSq() < 0.001) desiredDir.set(0, 0, 1);
        desiredDir.normalize();

        const forward = this.getForward();
        const right = this.getRight();
        const alignment = forward.dot(desiredDir);

        let steer = THREE.MathUtils.clamp(desiredDir.dot(right) * 2.0, -1, 1);
        const wallSteer = THREE.MathUtils.clamp((sensors.leftDanger - sensors.rightDanger) * 1.5, -1, 1);
        const separation = this.computeSeparationSteer(position, right);
        steer = (steer + wallSteer + separation) * 0.6;
        steer = THREE.MathUtils.clamp(steer, -1, 1) * CONFIG.maxSteerVal;

        let throttle = FORWARD;
        let brake = 0;

        if (sensors.front < 8 && alignment < 0.3) {
            throttle = REVERSE; steer *= -1;
        } else if (alignment < -0.3 && speed < 5) {
            throttle = REVERSE;
        } else if (isEvade) {
            throttle = FORWARD;
        }

        if (sensors.centerDanger > 0.92) {
            throttle = REVERSE; brake = 0;
        }

        this.controls.throttle = throttle;
        this.controls.steer = steer;
        this.controls.brake = brake;

        this.useAbilities(dt, sensors, speed, now, isGrounded, inHover, alignment);
    }

    // ========== ABILITY SUITE ==========

    useAbilities(dt, sensors, speed, now, isGrounded, inHover, alignment) {
        const canAct = inHover || isGrounded;
        const speedMPH = speed * 2.237;
        const hasEnergy = this.vehicle.energy > 5;
        const hasNitro = this.vehicle.nitro > 5;

        // --- DRIFT ---
        if (canAct && speedMPH > 20 && Math.abs(this.controls.steer) > CONFIG.maxSteerVal * 0.6
            && now - this.lastDriftTime > 500 && Math.random() < 0.04) {
            this.doDrift(sensors);
        }

        // --- NITRO BOOST ---
        if (this.controls.throttle === FORWARD && hasNitro && sensors.front > 18 && alignment > 0.5) {
            this.controls.boost = true;
        }

        // --- JUMP ---
        if (canAct && now - this.lastJumpTime > 2000 && Math.random() < 0.008) {
            if (sensors.front < 12 && alignment > 0.3 && hasEnergy) {
                this.doJump(hasEnergy >= 40 ? 36 : 24);
            } else if (Math.random() < 0.003) {
                this.doJump(24);
            }
        }

        // --- AIR FLIP ---
        if (!isGrounded && !inHover && now - this.lastAirFlipTime > 2000) {
            if (this.vehicle.energy >= 20 && Math.random() < 0.02) {
                const flipDir = this.controls.steer > 0 ? 1 : -1;
                this.vehicle.performAirFlip(flipDir, 'roll');
                this.vehicle.energy = Math.max(0, this.vehicle.energy - 20);
                this.lastAirFlipTime = now;
            }
        }

        // --- TWO-WHEEL LEAN ---
        if (canAct && !inHover && speedMPH > 30 && Math.abs(this.controls.steer) > CONFIG.maxSteerVal * 0.7
            && this.leanTimer <= 0 && now - this.lastDriftTime > 1000 && Math.random() < 0.005) {
            this.controls.leanActive = true;
            this.leanTimer = 2.0 + Math.random() * 2.0;
        }
        if (this.leanTimer > 0) {
            this.leanTimer -= dt;
            if (this.leanTimer > 0) this.controls.leanActive = true;
        }

        // --- HYDRAULICS ---
        if (canAct && !inHover && Math.random() < 0.01 && this.hydraulicsTimer <= 0) {
            const hRoll = (Math.random() - 0.5) * 0.5;
            const hPitch = (Math.random() - 0.5) * 0.3;
            this.vehicle.hydraulics.targetRoll = hRoll;
            this.vehicle.hydraulics.targetPitch = hPitch;
            this.vehicle.hydraulics.targetLift = Math.max(0, -hPitch);
            this.hydraulicsTimer = 1.0 + Math.random();
        }
        if (this.hydraulicsTimer > 0) this.hydraulicsTimer -= dt;

        // --- SHIELD ---
        if (this.healthDropTimer > 0 && this.vehicle.energy > 5 && now - this.lastShieldTime > 6000) {
            this.doShield(now);
        }

        // --- MINE DROPPING (offensive) ---
        if (this.target && this.vehicle.mineAmmo > 0
            && sensors.rear < 15 && this.state === 'engage'
            && now - this.lastMineTime > 3000 && Math.random() < 0.02) {
            this.dropMine();
        }
    }

    doJump(power) {
        if (!this.vehicle.isReadyToJump()) return;
        const now = Date.now();
        this.vehicle.jump(power);
        if (power > 24) this.vehicle.energy = Math.max(0, this.vehicle.energy - 40);
        this.lastJumpTime = now;
    }

    doShield(now) {
        if (this.vehicle.energy <= 5) return;
        this.vehicle.shieldActive = true;
        this.vehicle.shieldTimer = 4.0;
        this.vehicle.energy = 0;
        if (this.vehicle.shieldMesh) this.vehicle.shieldMesh.visible = true;
        this.lastShieldTime = now;
    }

    doDrift(sensors) {
        this.vehicle.isDrifting = true;
        const steerDir = Math.sign(this.controls.steer || 1);
        this.vehicle.driftAngle = steerDir * Math.PI / 4;
        this.lastDriftTime = Date.now();
    }

    // ========== COMBAT POSITIONING ==========

    chooseCombatPosition(position, targetPos, distToTarget) {
        const toMe = position.clone().sub(targetPos);
        toMe.y = 0;
        if (toMe.lengthSq() < 0.001) toMe.set(1, 0, 0);
        toMe.normalize();

        const effectiveRange = Math.max(20, Math.min(this.profile.preferredRange, distToTarget * 0.6));
        const orbitSpeed = 0.0015 + (1 - this.profile.aggression) * 0.001;
        const side = new THREE.Vector3(-toMe.z, 0, toMe.x)
            .multiplyScalar(Math.sin(performance.now() * orbitSpeed + this.aimSway) * 18);
        const rangeOffset = toMe.clone().multiplyScalar(effectiveRange);
        return this.clampInsideArena(targetPos.clone().add(rangeOffset).add(side));
    }

    // ========== PICKUPS ==========

    findBestPickup(position) {
        let best = null;
        let bestScore = -1e9;
        for (const pickup of this.game.pickups.pickups) {
            const pPos = pickup.mesh.position;
            const dist = position.distanceTo(pPos);
            let score = -dist;
            if (pickup.type === 'health') {
                score += Math.max(0, 100 - this.vehicle.health) * 2.5;
            } else if (pickup.type === 'charge' || pickup.type === 'energy') {
                score += (100 - this.vehicle.energy) * 1.5;
            } else if (pickup.type === 'ammo') {
                score += this.getTotalAmmo() < 10 ? 200 : 30;
            } else if (pickup.type === 'buff_hover' || pickup.type === 'hover') {
                if (!this.vehicle.hoverMode) score += 120;
            } else if (Object.keys(WEAPON_TYPES).includes(pickup.type)) {
                score += this.getAmmo(pickup.type) < 5 ? 150 : 20;
            }
            score += this.isPlayerNearPickup(pPos) ? -80 : 0;
            if (score > bestScore) { bestScore = score; best = pickup; }
        }
        return best;
    }

    isPlayerNearPickup(pPos) {
        if (!this.game.player) return false;
        return this.getVehiclePosition(this.game.player).distanceTo(pPos) < 20;
    }

    // ========== WEAPONS ==========

    applyWeaponLogic(position, targetPos, distToTarget, sensors, now) {
        if (!this.target || distToTarget > 200) return;
        const weapon = this.pickWeapon(distToTarget);
        const forward = this.getForward();
        const predictedPos = this.predictTargetPosition(targetPos, distToTarget);
        const toPredicted = predictedPos.clone().sub(position).normalize();
        const aimDot = forward.dot(toPredicted);
        const clearShot = !this.raycastBlocks(position, predictedPos, [this.target.chassisBody]);
        if (clearShot && aimDot > this.profile.aimThreshold * 0.95) {
            this.fire(weapon);
        }
    }

    predictTargetPosition(targetPos, distToTarget) {
        const targetVel = this.target.chassisBody.velocity;
        const travelTime = distToTarget / Math.max(1, this.getProjectileSpeed());
        return new THREE.Vector3(
            targetPos.x + targetVel.x * travelTime * 0.5,
            targetPos.y,
            targetPos.z + targetVel.z * travelTime * 0.5
        );
    }

    getProjectileSpeed() {
        const speeds = { melee: 5, shotgun: 30, turret: 50, cannon: 20, ult: 15, missile: 100, energy: 100 };
        return speeds[this.lastWeaponType] || 50;
    }

    getAmmo(type) {
        if (this.game.ults) {
            const state = this.game.ults.activeUlts.get(this.vehicle);
            if (state) {
                const wState = state.weapons.get(type);
                if (wState) return wState.ammo;
            }
        }
        return this.vehicle.ammo ? (this.vehicle.ammo[type] || 0) : 0;
    }

    pickWeapon(distToTarget) {
        const priority = [
            { type: 'melee', max: 16 },
            { type: 'shotgun', max: 42 },
            { type: 'turret', max: 90 },
            { type: 'cannon', max: 135 },
            { type: 'ult', max: 140 },
            { type: 'missile', max: 220 },
            { type: 'energy', max: 120 }
        ];
        for (const option of priority) {
            if (this.getAmmo(option.type) > 0 && distToTarget <= option.max) {
                this.setCurrentWeapon(option.type);
                this.lastWeaponType = option.type;
                return option.type;
            }
        }
        if (this.getAmmo('missile') > 0) {
            this.setCurrentWeapon('missile');
            this.lastWeaponType = 'missile';
            return 'missile';
        }
        return 'missile';
    }

    setCurrentWeapon(type) {
        if (!this.vehicle.weaponInventory) return;
        const index = this.vehicle.weaponInventory.indexOf(type);
        if (index >= 0) this.vehicle.currentWeaponIndex = index;
    }

    fire(weaponType) {
        const now = Date.now();
        const baseRates = {
            melee: 100, shotgun: 550, turret: 110,
            cannon: 700, ult: 1000, missile: 220, energy: 150
        };
        const fireRate = (baseRates[weaponType] || 300) * this.profile.fireCooldownScale;
        if (now - this.lastFireTime < fireRate) return;
        this.vehicle.currentWeapon = weaponType;
        if (this.game.ults) {
            this.game.ults.fire(this.vehicle);
        } else {
            const forward = this.getForward();
            this.game.projectiles.fireBullet(this.vehicle.chassisBody.position, forward, 0, this.vehicle);
        }
        this.lastFireTime = now;
    }

    dropMine() {
        const backward = this.getForward().multiplyScalar(-1);
        this.game.projectiles.dropMine(this.vehicle.chassisBody.position, backward, 'standard');
        this.vehicle.mineAmmo = Math.max(0, this.vehicle.mineAmmo - 1);
        this.lastMineTime = Date.now();
    }

    // ========== SENSORS ==========

    sampleSensors() {
        const origin = this.vehicle.chassisBody.position;
        const heading = this.vehicle.aiHeading || 0;
        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0));
        const samples = [
            { key: 'frontLeft', angle: -0.6, length: 35 },
            { key: 'front', angle: 0, length: 40 },
            { key: 'frontRight', angle: 0.6, length: 35 },
            { key: 'left', angle: -1.15, length: 20 },
            { key: 'right', angle: 1.15, length: 20 },
            { key: 'rear', angle: Math.PI, length: 18 }
        ];
        const distances = {};
        for (const sample of samples) {
            const dir = new THREE.Vector3(0, 0, 1)
                .applyAxisAngle(new THREE.Vector3(0, 1, 0), sample.angle)
                .applyQuaternion(quat);
            const from = new CANNON.Vec3(origin.x, origin.y + 1.2, origin.z);
            const to = new CANNON.Vec3(origin.x + dir.x * sample.length, origin.y + 1.2, origin.z + dir.z * sample.length);
            const res = new CANNON.RaycastResult();
            this.game.physics.world.raycastClosest(from, to, { collisionFilterMask: ~0, skipBackfaces: true }, res);
            distances[sample.key] = res.hasHit && res.body !== this.vehicle.chassisBody ? res.distance : sample.length;
        }
        const arena = this.computeArenaDanger();
        return {
            ...distances,
            leftDanger: (1 - distances.frontLeft / 35) + arena.left,
            rightDanger: (1 - distances.frontRight / 35) + arena.right,
            centerDanger: (1 - distances.front / 40) + arena.front,
            arena
        };
    }

    computeArenaDanger() {
        const pos = this.vehicle.chassisBody.position;
        const forward = this.getForward();
        const margin = 30;
        const half = this.game.arenaHalfSize;
        let front = 0, left = 0, right = 0;
        if (half - pos.x < margin) {
            if (forward.x > 0.15) front += (margin - (half - pos.x)) / margin;
            right += 0.55;
        }
        if (half + pos.x < margin) {
            if (forward.x < -0.15) front += (margin - (half + pos.x)) / margin;
            left += 0.55;
        }
        if (half - pos.z < margin) {
            if (forward.z > 0.15) front += (margin - (half - pos.z)) / margin;
            if (forward.x > 0) left += 0.45; else right += 0.45;
        }
        if (half + pos.z < margin) {
            if (forward.z < -0.15) front += (margin - (half + pos.z)) / margin;
            if (forward.x > 0) right += 0.45; else left += 0.45;
        }
        return { front, left, right };
    }

    applyMineLogic(position, sensors) {
        for (const mine of this.game.projectiles.activeMines) {
            const minePos = new THREE.Vector3(mine.body.position.x, 0, mine.body.position.z);
            const dist = minePos.distanceTo(new THREE.Vector3(position.x, 0, position.z));
            if (dist < 20) {
                this.controls.steer += CONFIG.maxSteerVal * (minePos.x > position.x ? -0.6 : 0.6);
                if (sensors.front < 10) this.controls.throttle = REVERSE;
            }
        }
        this.controls.steer = THREE.MathUtils.clamp(this.controls.steer, -CONFIG.maxSteerVal, CONFIG.maxSteerVal);
    }

    computeSeparationSteer(position, right) {
        let steer = 0;
        for (const car of this.game.cars) {
            if (car === this.vehicle || car.isDead) continue;
            const otherPos = this.getVehiclePosition(car);
            const offset = otherPos.clone().sub(position);
            offset.y = 0;
            const dist = offset.length();
            if (dist > 0 && dist < 16) {
                steer -= right.dot(offset.normalize()) * (1 - dist / 16) * 0.6;
            }
        }
        return steer;
    }

    raycastBlocks(fromVec3, toVec3, allowedBodies = []) {
        const start = new CANNON.Vec3(fromVec3.x, fromVec3.y + 1, fromVec3.z);
        const end = new CANNON.Vec3(toVec3.x, toVec3.y + 1, toVec3.z);
        const result = new CANNON.RaycastResult();
        this.game.physics.world.raycastClosest(start, end, { collisionFilterMask: ~0, skipBackfaces: true }, result);
        return result.hasHit && result.body !== this.vehicle.chassisBody && !allowedBodies.includes(result.body);
    }

    clampInsideArena(position) {
        const margin = 22;
        const half = this.game.arenaHalfSize - margin;
        return new THREE.Vector3(
            THREE.MathUtils.clamp(position.x, -half, half), 0,
            THREE.MathUtils.clamp(position.z, -half, half)
        );
    }

    randomPatrolPoint() {
        const half = this.game.arenaHalfSize * 0.7;
        return new THREE.Vector3((Math.random() - 0.5) * half * 2, 0, (Math.random() - 0.5) * half * 2);
    }

    getPosition() { return this.getVehiclePosition(this.vehicle); }

    getVehiclePosition(vehicle) {
        return new THREE.Vector3(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y, vehicle.chassisBody.position.z);
    }

    getQuaternion() {
        const q = this.vehicle.chassisBody.quaternion;
        return new THREE.Quaternion(q.x, q.y, q.z, q.w);
    }

    getForward() {
        const heading = this.vehicle.aiHeading || 0;
        return new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)).normalize();
    }

    getRight() {
        return new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.getForward()).normalize();
    }

    getTotalAmmo() {
        return Object.values(this.vehicle.ammo || {}).reduce((sum, value) => sum + value, 0);
    }

    resetControls() {
        this.controls.throttle = 0; this.controls.steer = 0;
        this.controls.brake = 14; this.controls.boost = false;
        this.controls.leanActive = false;
        this.game.applyVehicleControlsAI(this.vehicle, 0, 0, 14, false);
    }

    getTelemetry() {
        const position = this.getPosition();
        const targetPos = this.target ? this.getVehiclePosition(this.target) : position;
        return {
            name: this.vehicle.name,
            profile: this.profile.label,
            state: this.state,
            health: Math.floor(this.vehicle.health),
            energy: Math.floor(this.vehicle.energy),
            nitro: Math.floor(this.vehicle.nitro),
            ammo: this.getTotalAmmo(),
            speed: Math.floor(this.vehicle.chassisBody.velocity.length() * 3.6),
            distToTarget: Math.floor(position.distanceTo(targetPos))
        };
    }
}
