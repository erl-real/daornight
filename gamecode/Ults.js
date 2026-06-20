import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { CONFIG } from './Config.js';
import { WEAPON_TYPES } from './Weps.js';
import { getCarModel } from './ArcadeVehicle.js';

export class Ults {
    constructor(game) {
        this.game = game;
        this.scene = game.graphics.scene;
        this.world = game.physics.world;
        this.projectiles = [];
        this.weaponClasses = WEAPON_TYPES;
        this.activeUlts = new Map(); // Vehicle -> UltState
    }

    initVehicleUlt(vehicle) {
        const state = {
            weapons: new Map(),
            // Ult specific states
            policeStickyBomb: null,
            lowriderSlamState: false,
            lastGroundedState: true,
            grapplerTarget: null,
            grapplerDuration: 0,
            redrumNextBarrelType: ['explosive', 'toxic', 'cryo'][Math.floor(Math.random() * 3)],
            redrumBarrelIndicator: null,
            redrumBarrels: [],
            ufoTractorTarget: null,
            ufoTractorTime: 0,
            ufoBeam: null,
            semiTrailer: null,
            semiDetachPhase: null,
            semiDetachTime: 0,
            rvSat: null,
            rocketOrb: null,
            policeSpikes: null,
            bladePhase: null,
            bladeMiniHits: 0,
            bladeTarget: null,
            bladeChargeTimer: 0,
            bladeFireTimer: 0,
            bladeMainLaser: null,
            bladeCooldownTimer: 0,
            bladeRecastTimer: 0,
            sedanTurrets: null,
            sidecarDisc: null,
            deployedTurrets: [],
            placedC4: null,
            meleeBall: null,
            forkliftTarget: null,
            forkliftDuration: 0,
            wheelieTimer: 0,
            tractorTarget: null,
            tractorDuration: 0,
            transformed: false,
            bowArrow: null,
            scorpTarget: null,
            scorpPhase: 0,
            scorpTimer: 0,
            scorpClawMesh: null,
            wolfTornado: false,
            wolfSpinAngle: 0,
            wolfFireTimer: 0,
            wolfLiftTimer: 0,
            wolfModelRef: null,
            willysOrbs: null,
            willysCage: null,
            planeActive: false,
            planeDropTimer: 0,
            planeMineGroups: [],
            planeGlideTimer: 0,
            ratrodAA: null
        };

        Object.keys(this.weaponClasses).forEach(type => {
            const base = this.weaponClasses[type];
            let ammoCap = base.ammoCap;
            let cooldown = base.cooldown || 3000;
            if (vehicle.carType === 'mini' && type === 'ult') { ammoCap = 40; cooldown = 80; }
            state.weapons.set(type, {
                type: type,
                ammo: 0,
                ammoCap: ammoCap,
                lastFireTime: 0,
                cooldown: cooldown
            });
        });

        this.activeUlts.set(vehicle, state);
    }

    addAmmo(vehicle, amount, type = 'ult') {
        const state = this.activeUlts.get(vehicle);
        if (!state) return;
        const wState = state.weapons.get(type);
        if (wState) wState.ammo = Math.min(wState.ammoCap, wState.ammo + amount);
        if (type === 'ult' && vehicle.carType === 'semi' && !state.semiTrailer && wState && wState.ammo > 0) {
            this.spawnSemiTrailer(vehicle, state);
        }
    }

    update(dt) {
        const now = Date.now();
        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];

            // Homing missile tracking (jukable, no 360, ~60% hit)
            if (p.homing) {
                const base = this.weaponClasses[p.type];
                const maxTurn = (base && base.homingMaxTurn) || 2.5;
                const loseTime = (base && base.homingLoseTime) || 5.0;
                if (p.life < (base && base.life || 5.0) - loseTime) p.homing = false;
                if (p.homing) {
                    const target = this.findNearestEnemy(p.mesh.position, p.owner);
                    if (target) {
                        const tPos = new THREE.Vector3(target.chassisBody.position.x, target.chassisBody.position.y, target.chassisBody.position.z);
                        const toTarget = tPos.clone().sub(p.mesh.position);
                        const dist = toTarget.length();
                        const speed = p.velocity.length();
                        toTarget.normalize();
                        const dot = p.velocity.clone().normalize().dot(toTarget);
                        if (dot < -0.3 || dist > 60) p.homing = false;
                        else {
                            const idealDir = toTarget.clone().multiplyScalar(speed);
                            const maxAngle = maxTurn * dt * Math.PI;
                            const angleBetween = Math.acos(Math.max(-1, Math.min(1, dot)));
                            if (angleBetween > maxAngle) {
                                const cross = new THREE.Vector3().crossVectors(p.velocity, idealDir).normalize();
                                const rot = new THREE.Quaternion().setFromAxisAngle(cross, maxAngle);
                                p.velocity.applyQuaternion(rot);
                            } else {
                                p.velocity.lerp(idealDir, 0.1);
                            }
                            p.velocity.normalize().multiplyScalar(speed);
                        }
                    }
                }
            }

            // Cannon gravity (reduced)
            if (p.gravity) {
                p.velocity.y -= 12 * dt;
            }

            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
            p.life -= dt;

            // Mortar splash on ground contact
            if (p.splashRadius && p.mesh.position.y < 0.5) {
                this.mortarSplash(p);
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }

            // Ground despawn for any projectile that falls below the map
            if (p.mesh.position.y < -2) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }

            if (p.life <= 0) {
                if (p.isLastVolcano) {
                    const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
                    if (carsArr) {
                        for (const car of carsArr) {
                            if (car.isDead) continue;
                            const dx = p.mesh.position.x - car.chassisBody.position.x, dy = p.mesh.position.y - car.chassisBody.position.y, dz = p.mesh.position.z - car.chassisBody.position.z;
                            if (dx * dx + dy * dy + dz * dz < 25) { car.fireTimer = 3.0; break; }
                        }
                    }
                }
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            } else {
                this.checkProjectileCollision(p);
            }
        }

        // Update active Ults
        for (const [vehicle, state] of this.activeUlts) {
            if (vehicle.isDead) continue;
            
            if (vehicle.carType === 'policecar') this.handlePoliceStickyBomb(vehicle, state, dt);
            if (vehicle.carType === 'grappler') this.handleGrapplerGrab(vehicle, state, dt);
            if (vehicle.carType === 'forklift') this.handleForkliftGrab(vehicle, state, dt);
            if (vehicle.carType === 'ratrod') this.handleRatrodAA(vehicle, state, dt);
            if (vehicle.carType === '25-redrum') this.handleRedrumUpdate(vehicle, state, dt);
            if (vehicle.carType === 'semi') this.handleSemiTrailer(vehicle, state, dt);
            if (vehicle.carType === 'sidecarbike') this.handleSidecarDisc(vehicle, state, dt);
            if (vehicle.carType === 'rv') this.handleRvSat(vehicle, state, dt);
            if (vehicle.carType === 'rocketcar') this.handleRocketOrb(vehicle, state, dt);
            if (vehicle.carType === 'policecar') this.handlePoliceSpikes(vehicle, state, dt);
            if (vehicle.carType === 'bladecybercar') this.handleBladeLaser(vehicle, state, dt);
            if (vehicle.carType === 'beachpartyvan') this.handleBeachPartyPulse(vehicle, state, dt);
            if (vehicle.carType === '4door') this.handle4DoorTurrets(vehicle, state, dt);
            if (vehicle.carType === '61lowrider') {
                if (state.lowriderSlamState) {
                    if (state.lastGroundedState === false && vehicle.isTrulyGrounded) {
                        this.triggerLowriderSlamShockwave(vehicle, state);
                        state.lowriderSlamState = false;
                    }
                }
                state.lastGroundedState = vehicle.isTrulyGrounded;
            }
            if (vehicle.carType === 'muscle') this.handleMuscleWheelie(vehicle, state, dt);
            if (vehicle.carType === 'bowcar') this.handleBowCarArrow(vehicle, state, dt);
            if (vehicle.carType === 'scorp') this.handleScorpClaw(vehicle, state, dt);
            if (vehicle.carType === 'wolfstreet') this.handleWolfTornado(vehicle, state, dt);
            if (vehicle.carType === 'willys') this.handleWillysOrbs(vehicle, state, dt);
            if (vehicle.carType === 'planecar') this.handlePlaneGlide(vehicle, state, dt);
            if (vehicle.carType === 'tractor') this.handleTractorGrab(vehicle, state, dt);

            // Turret and C4 weapon state updates
            if (state.deployedTurrets) {
                for (let t = state.deployedTurrets.length - 1; t >= 0; t--) {
                    const turret = state.deployedTurrets[t];
                    turret.life -= dt;
                    if (turret.life <= 0) {
                        this.scene.remove(turret.mesh);
                        if (turret.body) this.world.removeBody(turret.body);
                        state.deployedTurrets.splice(t, 1);
                        continue;
                    }
                    this.updateTurretAI(turret, vehicle, dt);
                }
            }

            // Melee ball proximity check
            if (state.meleeBall && state.meleeBall.active) {
                this.checkMeleeBall(vehicle, state);
            }

            // C4 throw animation
            if (state.placedC4 && state.placedC4.velocity) {
                state.placedC4.mesh.position.add(state.placedC4.velocity.clone().multiplyScalar(dt));
                state.placedC4.velocity.y -= 15 * dt;
                if (state.placedC4.mesh.position.y < 0.5) {
                    state.placedC4.mesh.position.y = 0.5;
                    state.placedC4.velocity = null;
                }
                state.placedC4.life -= dt;
                if (state.placedC4.life <= 0) {
                    this.scene.remove(state.placedC4.mesh);
                    state.placedC4 = null;
                }
            }
        }
    }

    checkProjectileCollision(p) {
        const pPos = p.mesh.position;

        // vs Cars
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            const thresholdSq = 16.0;
            for (const car of carsArr) {
                if (car.isDead || p.owner === car) continue;
                const dx = pPos.x - car.chassisBody.position.x, dy = pPos.y - car.chassisBody.position.y, dz = pPos.z - car.chassisBody.position.z;
                if (dx*dx + dy*dy + dz*dz < thresholdSq) {
                    car.applyDamage(p.damage || 20);
                    p.life = 0; return;
                }
            }
        }

        // vs Barrels (grid)
        if (this.game.barrels) {
            const nearby = this.game.barrels.getNearby(pPos, 2.0);
            for (const b of nearby) {
                const dx = pPos.x - b.body.position.x, dy = pPos.y - b.body.position.y, dz = pPos.z - b.body.position.z;
                if (dx*dx + dy*dy + dz*dz < 4.0) {
                    this.game.barrels.applyDamage(b, p.damage || 20, (brl) => this.game.handleBarrelExplosion(brl));
                    p.life = 0;
                }
            }
        }
    }

    findNearestEnemy(pos, owner) {
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (!carsArr) return null;
        let best = null, bestDistSq = 6400;
        const px = pos.x, py = pos.y, pz = pos.z;
        for (const car of carsArr) {
            if (car === owner || car.isDead) continue;
            const dx = px - car.chassisBody.position.x, dy = py - car.chassisBody.position.y, dz = pz - car.chassisBody.position.z;
            const dSq = dx*dx + dy*dy + dz*dz;
            if (dSq < bestDistSq) { bestDistSq = dSq; best = car; }
        }
        return best;
    }

    fire(vehicle, backfire = false) {
        const type = (vehicle === this.game.player) ? (this.game.weaponInventory[this.game.currentWeaponIndex] || 'ult') : (vehicle.currentWeapon || 'ult');
        if (type === 'ult') {
            this.performCarUlt(vehicle);
            return;
        }
        const state = this.activeUlts.get(vehicle);
        if (!state) return;
        const wState = state.weapons.get(type);
        if (!wState || wState.ammo <= 0) return;

        const now = Date.now();
        if (now - wState.lastFireTime < wState.cooldown) return;
        wState.ammo--;
        wState.lastFireTime = now;

        const yaw = vehicle.carMesh.rotation.y;
        let forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        if (backfire) forward.negate();
        const spawnPos = new THREE.Vector3(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y + 1, vehicle.chassisBody.position.z);

        switch (type) {
            case 'energy':
                this.fireEnergy(vehicle, spawnPos, forward, type);
                break;
            case 'shotgun':
                this.fireShotgun(vehicle, spawnPos, forward, type);
                break;
            case 'turret':
                this.fireTurret(vehicle, spawnPos, forward);
                break;
            case 'melee':
                this.fireMelee(vehicle, spawnPos, forward, type);
                break;
            case 'c4':
                this.fireC4(vehicle, state, spawnPos, forward);
                break;
            default:
                this.spawnProjectile(spawnPos, forward, type, vehicle);
        }
        if (wState.ammo <= 0 && vehicle === this.game.player && this.game.autoSwitchWeapon) {
            this.game.autoSwitchWeapon();
        }
    }

    spawnProjectile(pos, dir, type, owner) {
        const base = this.weaponClasses[type];
        if (!base) return;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshPhongMaterial({ color: base.color, emissive: base.color }));
        mesh.position.copy(pos);
        this.scene.add(mesh);
        const p = {
            mesh, owner, type,
            damage: base.damage || 20,
            life: 5.0,
            velocity: dir.clone().multiplyScalar(base.speed || 40)
        };
        if (base.homing) p.homing = true;
        if (base.gravity) p.gravity = true;
        if (base.arc) {
            p.splashRadius = base.splashRadius || 6;
            p.velocity.y += 15;
        }
        this.projectiles.push(p);
    }

    fireEnergy(vehicle, pos, dir, type) {
        const base = this.weaponClasses[type];
        const range = (base && base.hitscanRange) || 60;
        const damage = (base && base.damage) || 6;
        const coneAngle = (base && base.coneAngle) || 0.15;
        const fwd = dir.clone().normalize();
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        let target = null, targetDist = range;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position;
                const toCar = new THREE.Vector3(cPos.x - pos.x, cPos.y - pos.y, cPos.z - pos.z);
                const dist = toCar.length();
                if (dist > range || dist > targetDist) continue;
                toCar.normalize();
                if (fwd.dot(toCar) > Math.cos(coneAngle)) {
                    target = car; targetDist = dist;
                }
            }
        }
        let end;
        if (target) {
            const cPos = target.chassisBody.position;
            end = new THREE.Vector3(cPos.x, cPos.y, cPos.z);
            const hitPct = 1 - (targetDist / range) * 0.5;
            target.applyDamage(damage * hitPct);
        } else {
            end = pos.clone().add(fwd.clone().multiplyScalar(range));
        }
        const beamLen = pos.distanceTo(end);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, beamLen, 4), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 }));
        const mid = pos.clone().add(end).multiplyScalar(0.5);
        beam.position.copy(mid);
        beam.lookAt(end);
        beam.rotateX(Math.PI / 2);
        this.scene.add(beam);
        setTimeout(() => this.scene.remove(beam), 80);
    }

    fireShotgun(vehicle, pos, dir, type) {
        const base = this.weaponClasses[type];
        const count = (base && base.projectiles) || 3;
        const spread = (base && base.spread) || 0.15;
        const offsetYaw = -(count - 1) * spread / 2;
        for (let i = 0; i < count; i++) {
            const angle = offsetYaw + i * spread;
            const spreadDir = new THREE.Vector3(
                dir.x * Math.cos(angle) - dir.z * Math.sin(angle),
                0,
                dir.x * Math.sin(angle) + dir.z * Math.cos(angle)
            );
            const p = this.spawnProjectile(pos, spreadDir, type, vehicle);
        }
    }

    fireTurret(vehicle, pos, dir) {
        const base = this.weaponClasses['turret'] || {};
        const state = this.activeUlts.get(vehicle);
        if (!state) return;
        if (!state.deployedTurrets) state.deployedTurrets = [];
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.0, 0.8, 8), new THREE.MeshPhongMaterial({ color: 0x0044ff, emissive: 0x0044ff }));
        mesh.position.copy(pos);
        this.scene.add(mesh);
        state.deployedTurrets.push({
            mesh, life: (base.duration || 5),
            cooldown: 0, lastTarget: null
        });
    }

    updateTurretAI(turret, vehicle, dt) {
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (!carsArr) return;
        turret.cooldown -= dt;
        let nearest = null, bestDistSq = (this.weaponClasses['turret'] && this.weaponClasses['turret'].deployRange) || 30;
        bestDistSq *= bestDistSq;
        const tPos = turret.mesh.position;
        for (const car of carsArr) {
            if (car === vehicle || car.isDead) continue;
            const cPos = car.chassisBody.position;
            const dx = tPos.x - cPos.x, dy = tPos.y - cPos.y, dz = tPos.z - cPos.z;
            const dSq = dx*dx + dy*dy + dz*dz;
            if (dSq < bestDistSq) { bestDistSq = dSq; nearest = car; }
        }
        if (nearest && turret.cooldown <= 0) {
            const nPos = nearest.chassisBody.position;
            const dir = new THREE.Vector3(nPos.x - tPos.x, 0, nPos.z - tPos.z).normalize();
            const projMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), new THREE.MeshBasicMaterial({ color: 0x88ccff }));
            projMesh.position.copy(tPos);
            this.scene.add(projMesh);
            this.projectiles.push({
                mesh: projMesh, owner: vehicle, type: 'turret_bullet',
                damage: 8, life: 1.0,
                velocity: dir.clone().multiplyScalar(40)
            });
            turret.cooldown = 0.5;
        }
    }

    updateTurrets(dt) {
        for (const [vehicle, state] of this.activeUlts) {
            if (!state.deployedTurrets) continue;
            for (let t = state.deployedTurrets.length - 1; t >= 0; t--) {
                const turret = state.deployedTurrets[t];
                if (turret.life <= 0) {
                    this.scene.remove(turret.mesh);
                    state.deployedTurrets.splice(t, 1);
                    continue;
                }
                turret.life -= dt;
                this.updateTurretAI(turret, vehicle, dt);
            }
        }
    }

    fireMelee(vehicle, pos, dir, type) {
        const state = this.activeUlts.get(vehicle);
        if (!state) return;
        if (state.meleeBall && state.meleeBall.active) return;
        const base = this.weaponClasses[type] || {};
        const range = (base && base.meleeRange) || 8;
        const ballPos = pos.clone().add(dir.clone().multiplyScalar(range / 2));
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8), new THREE.MeshPhongMaterial({ color: 0xff0088, emissive: 0xff0088, transparent: true, opacity: 0.6 }));
        mesh.position.copy(ballPos);
        this.scene.add(mesh);
        state.meleeBall = { mesh, active: true, life: 0.3, range, dir: dir.clone() };
        setTimeout(() => {
            if (state.meleeBall) { this.scene.remove(state.meleeBall.mesh); state.meleeBall = null; }
        }, 300);
    }

    checkMeleeBall(vehicle, state) {
        if (!state.meleeBall || !state.meleeBall.active) return;
        const ballPos = state.meleeBall.mesh.position;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                if (ballPos.distanceTo(car.chassisBody.position) < 4.0) {
                    car.applyDamage(30);
                    const dir = car.chassisBody.position.vsub(new CANNON.Vec3(ballPos.x, ballPos.y, ballPos.z));
                    dir.normalize();
                    car.chassisBody.applyImpulse(dir.scale(6000), new CANNON.Vec3());
                    const flash = new THREE.PointLight(0xff0088, 80, 10);
                    flash.position.copy(ballPos);
                    this.scene.add(flash);
                    setTimeout(() => this.scene.remove(flash), 120);
                    state.meleeBall.active = false;
                    break;
                }
            }
        }
    }

    mortarSplash(p) {
        const pos = p.mesh.position;
        const radius = p.splashRadius || 6;
        const flash = new THREE.PointLight(0xff8800, 100, radius * 2);
        flash.position.copy(pos);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 200);
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === p.owner || car.isDead) continue;
                const dist = car.chassisBody.position.distanceTo(new CANNON.Vec3(pos.x, pos.y, pos.z));
                if (dist < radius) {
                    const dmg = p.damage * (1 - dist / radius);
                    car.applyDamage(dmg);
                    const pushDir = car.chassisBody.position.vsub(new CANNON.Vec3(pos.x, pos.y, pos.z));
                    pushDir.normalize();
                    car.chassisBody.applyImpulse(pushDir.scale(4000 * (1 - dist / radius)), new CANNON.Vec3());
                }
            }
        }
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(b => {
                if (b.isDead) return;
                if (b.body.position.distanceTo(new CANNON.Vec3(pos.x, pos.y, pos.z)) < radius) {
                    this.game.barrels.applyDamage(b, p.damage, (brl) => this.game.handleBarrelExplosion(brl));
                }
            });
        }
    }

    fireC4(vehicle, state, pos, dir) {
        if (state.placedC4 && state.placedC4.active) {
            const wState = state.weapons.get('c4');
            if (wState) wState.ammo = Math.min(wState.ammoCap, wState.ammo + 1);
            const c4 = state.placedC4;
            const c4Pos = c4.mesh.position;
            const splashRadius = 8;
            const flash = new THREE.PointLight(0xff0000, 150, splashRadius * 2);
            flash.position.copy(c4Pos);
            this.scene.add(flash);
            setTimeout(() => this.scene.remove(flash), 250);
            const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
            if (carsArr) {
                for (const car of carsArr) {
                    if (car === vehicle || car.isDead) continue;
                    const dist = car.chassisBody.position.distanceTo(new CANNON.Vec3(c4Pos.x, c4Pos.y, c4Pos.z));
                    if (dist < splashRadius) {
                        const dmg = 60 * (1 - dist / splashRadius);
                        car.applyDamage(dmg);
                        const pushDir = car.chassisBody.position.vsub(new CANNON.Vec3(c4Pos.x, c4Pos.y, c4Pos.z));
                        pushDir.normalize();
                        car.chassisBody.applyImpulse(pushDir.scale(8000 * (1 - dist / splashRadius)), new CANNON.Vec3());
                    }
                }
            }
            this.scene.remove(c4.mesh);
            state.placedC4 = null;
            return;
        }
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshPhongMaterial({ color: 0xcc0000 }));
        mesh.position.copy(pos);
        this.scene.add(mesh);
        const vel = dir.clone().multiplyScalar(15);
        vel.y += 8;
        state.placedC4 = { mesh, velocity: vel, life: 10.0, active: true };
    }

    spawnSemiTrailer(vehicle, state) {
        const trailerBody = new CANNON.Body({ mass: 1500 });
        trailerBody.addShape(new CANNON.Box(new CANNON.Vec3(1.5, 0.8, 3)));
        trailerBody.collisionFilterMask = 2;
        const yaw = vehicle.carMesh.rotation.y;
        const behind = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).scale(-7);
        trailerBody.position.set(
            vehicle.chassisBody.position.x + behind.x,
            vehicle.chassisBody.position.y + 0.5,
            vehicle.chassisBody.position.z + behind.z
        );
        this.world.addBody(trailerBody);
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(3, 1.6, 6),
            new THREE.MeshPhongMaterial({ color: 0x555555 })
        );
        this.scene.add(mesh);
        state.semiTrailer = { body: trailerBody, mesh };
    }

    destroySemiTrailer(vehicle, state) {
        if (!state.semiTrailer) return;
        const { body, mesh } = state.semiTrailer;
        const flash = new THREE.PointLight(0xff4400, 100, 20);
        flash.position.copy(mesh.position);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 200);
        this.scene.remove(mesh);
        this.world.removeBody(body);
        state.semiTrailer = null;
        state.semiDetachPhase = null;
        state.semiDetachTime = 0;
    }

    handleSemiTrailer(vehicle, state, dt) {
        if (vehicle.isDead) {
            if (state.semiTrailer) this.destroySemiTrailer(vehicle, state);
            return;
        }
        if (!state.semiTrailer) return;
        const trailer = state.semiTrailer;

        if (state.semiDetachPhase === 'pending') {
            const keys = this.game.keys;
            const fireHeld = !!(keys['KeyF'] || keys['KeyQ']);
            const elapsed = Date.now() - state.semiDetachTime;
            if (fireHeld && elapsed > 200) {
                state.semiDetachPhase = null;
                state.semiDetachTime = 0;
                this.semiExplode(trailer);
                state.semiTrailer = null;
                return;
            } else if (!fireHeld && elapsed > 100) {
                state.semiDetachPhase = 'parked';
            }
            trailer.mesh.position.copy(trailer.body.position);
            trailer.mesh.quaternion.copy(trailer.body.quaternion);
            return;
        }

        if (state.semiDetachPhase === 'parked') {
            trailer.mesh.position.copy(trailer.body.position);
            trailer.mesh.quaternion.copy(trailer.body.quaternion);
            return;
        }

        // Attached: lock trailer to car kinematically
        const yaw = vehicle.carMesh.rotation.y;
        const behind = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).scale(-7);
        trailer.body.position.set(
            vehicle.chassisBody.position.x + behind.x,
            vehicle.chassisBody.position.y + 0.5,
            vehicle.chassisBody.position.z + behind.z
        );
        trailer.body.quaternion.copy(vehicle.chassisBody.quaternion);
        trailer.body.velocity.copy(vehicle.chassisBody.velocity);
        trailer.body.angularVelocity.set(0, 0, 0);
        trailer.mesh.position.copy(trailer.body.position);
        trailer.mesh.quaternion.copy(trailer.body.quaternion);

        const wState = state.weapons.get('ult');
        if (!wState || wState.ammo <= 0) {
            this.destroySemiTrailer(vehicle, state);
            return;
        }
        const tPos = trailer.body.position;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (!carsArr) return;
        for (const car of carsArr) {
            if (car === vehicle || car.isDead) continue;
            const cPos = car.chassisBody.position;
            const dx = cPos.x - tPos.x, dy = cPos.y - tPos.y, dz = cPos.z - tPos.z;
            if (dx*dx + dy*dy + dz*dz < 16.0) {
                wState.ammo--;
                car.applyDamage(20);
                const dir = cPos.vsub(tPos);
                dir.normalize();
                car.chassisBody.applyImpulse(dir.scale(5000), new CANNON.Vec3());
                if (wState.ammo <= 0) this.destroySemiTrailer(vehicle, state);
                break;
            }
        }
    }

    semiExplode(trailer) {
        const tPos = trailer.body.position;
        const splashRadius = 10;
        const maxHits = 3;
        let hits = 0;
        const flash = new THREE.PointLight(0xff8800, 200, splashRadius * 2);
        flash.position.set(tPos.x, tPos.y + 1, tPos.z);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 300);
        this.scene.remove(trailer.mesh);
        this.world.removeBody(trailer.body);
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car.isDead) continue;
                const dist = car.chassisBody.position.distanceTo(new CANNON.Vec3(tPos.x, tPos.y, tPos.z));
                if (dist < splashRadius && hits < maxHits) {
                    const dmg = 25 * (1 - dist / splashRadius);
                    car.applyDamage(dmg);
                    hits++;
                    const pushDir = car.chassisBody.position.vsub(new CANNON.Vec3(tPos.x, tPos.y, tPos.z));
                    pushDir.normalize();
                    const pushForce = 12000 * (1 - dist / splashRadius);
                    car.chassisBody.applyImpulse(pushDir.scale(pushForce), new CANNON.Vec3());
                }
            }
        }
    }

    performSemiUlt(vehicle, state) {
        if (!state.semiTrailer) {
            this.spawnSemiTrailer(vehicle, state);
            state.semiDetachPhase = null;
            state.semiDetachTime = 0;
            return;
        }
        if (state.semiDetachPhase === 'parked') {
            this.semiExplode(state.semiTrailer);
            state.semiTrailer = null;
            state.semiDetachPhase = null;
            return;
        }
        state.semiDetachPhase = 'pending';
        state.semiDetachTime = Date.now();
    }

    performSidecarUlt(vehicle, state) {
        if (state.sidecarDisc && state.sidecarDisc.active) return;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const spawnPos = vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 1, 0));
        const radius = 1.4;
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 0.15, 24),
            new THREE.MeshPhongMaterial({ color: 0x888888, emissive: 0x444444 })
        );
        mesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
        mesh.rotation.x = Math.PI / 2;
        this.scene.add(mesh);
        state.sidecarDisc = {
            mesh,
            radius,
            velocity: forward.clone().multiplyScalar(100),
            phase: 'outgoing',
            life: 3.0,
            active: true,
            rotationSpeed: 15
        };
    }

    handleSidecarDisc(vehicle, state, dt) {
        if (!state.sidecarDisc || !state.sidecarDisc.active) return;
        const disc = state.sidecarDisc;
        disc.life -= dt;
        disc.mesh.rotation.y += disc.rotationSpeed * dt;
        const pos = disc.mesh.position;
        const carPos = vehicle.chassisBody.position;
        const hitRadius = (disc.radius || 0.5) + 2.5;
        if (disc.phase === 'outgoing') {
            pos.add(disc.velocity.clone().multiplyScalar(dt));
            const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
            if (carsArr) {
                for (const car of carsArr) {
                    if (car === vehicle || car.isDead) continue;
                    if (pos.distanceTo(car.chassisBody.position) < hitRadius) {
                        car.applyDamage(30);
                        disc.phase = 'returning';
                        break;
                    }
                }
            }
            const distFromCar = pos.distanceTo(new THREE.Vector3(carPos.x, carPos.y, carPos.z));
            if (distFromCar > 80 || disc.life < 1.0) disc.phase = 'returning';
        }
        if (disc.phase === 'returning') {
            const dir = new THREE.Vector3(carPos.x - pos.x, carPos.y - pos.y, carPos.z - pos.z);
            const dist = dir.length();
            dir.normalize();
            disc.velocity.copy(dir.multiplyScalar(50));
            pos.add(disc.velocity.clone().multiplyScalar(dt));
            const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
            if (carsArr) {
                for (const car of carsArr) {
                    if (car === vehicle || car.isDead) continue;
                    if (pos.distanceTo(car.chassisBody.position) < 4.0) {
                        car.applyDamage(20);
                        break;
                    }
                }
            }
            if (dist < 3.0 || disc.life <= 0) {
                this.scene.remove(disc.mesh);
                disc.active = false;
                state.sidecarDisc = null;
            }
        }
    }

    getTarget(vehicle, maxDist = 50, maxAngle = Math.PI / 4) {
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        let bestTarget = null;
        let bestDist = maxDist;
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(b => {
                if (b.isDead) return;
                const bPos = b.body.position;
                const dist = pos.distanceTo(bPos);
                if (dist < bestDist) {
                    const toTarget = bPos.vsub(pos);
                    toTarget.normalize();
                    const dot = forward.dot(new THREE.Vector3(toTarget.x, toTarget.y, toTarget.z));
                    if (dot > Math.cos(maxAngle)) { bestDist = dist; bestTarget = b; }
                }
            });
        }
        if (this.game.ballBody) {
            const ballDist = pos.distanceTo(this.game.ballBody.position);
            if (ballDist < bestDist) {
                const toBall = this.game.ballBody.position.vsub(pos);
                toBall.normalize();
                const dot = forward.dot(new THREE.Vector3(toBall.x, toBall.y, toBall.z));
                if (dot > Math.cos(maxAngle)) { bestDist = ballDist; bestTarget = { body: this.game.ballBody, isBall: true }; }
            }
        }
        return bestTarget;
    }

    performCarUlt(vehicle) {
        const state = this.activeUlts.get(vehicle);
        if (!state) return;
        const wState = state.weapons.get('ult');
        const now = Date.now();
        const cooldown = wState ? wState.cooldown : 3000;

        // Blade Cyber: ammo only consumed on sky laser hit, can always start charging
        if (vehicle.carType === 'bladecybercar') {
            this.performBladeUlt(vehicle, state);
            return;
        }

        if (!wState || wState.ammo <= 0) return;

        if (vehicle.carType === 'policecar' && state.policeStickyBomb && !state.policeStickyBomb.exploding) {
            this.explodePoliceStickyBomb(vehicle, state);
            return;
        }

        if (now - wState.lastFireTime < cooldown) return;

        wState.ammo--;
        wState.lastFireTime = now;

        const carType = vehicle.carType;

        if (carType === '35-impala') this.performImpalaUlt(vehicle, state);
        else if (carType === '12-servervan') this.performServerVanUlt(vehicle, state);
        else if (carType === 'f2') this.performF2Ult(vehicle, state);
        else if (carType === 'humher') this.performHumherUlt(vehicle, state);
        else if (carType === 'mini') this.performMiniUlt(vehicle, state);
        else if (carType === 'schoolbus') this.performSchoolBusUlt(vehicle, state);
        else if (carType === 'mixer') this.performMixerUlt(vehicle, state);
        else if (carType === 'beachbug') this.performBeachbugUlt(vehicle, state);
        else if (carType === 'foodtruck') this.performFoodtruckUlt(vehicle, state);
        else if (carType === 'beachpartyvan') this.performBeachPartyVanUlt(vehicle, state);
        else if (carType === 'rv') this.performRvUlt(vehicle, state);
        else if (carType === 'amrtruck') this.performAmrtruckUlt(vehicle, state);
        else if (carType === 'yellowelstang') this.performElstangUlt(vehicle, state);
        else if (carType === 'sportssuper') this.performSportsSuperUlt(vehicle, state);
        else if (carType === 'rocketcar') this.performRocketCarUlt(vehicle, state);
        else if (carType === 'z2-ufo') this.performUFOUlt(vehicle, state);
        else if (carType === 'policecar') this.performPoliceCarUlt(vehicle, state);
        else if (carType === '61lowrider') this.performLowriderUlt(vehicle, state);
        else if (carType === 'grappler') this.performGrapplerUlt(vehicle, state);
        else if (carType === 'forklift') this.performForkliftUlt(vehicle, state);
        else if (carType === 'muscle') this.performMuscleUlt(vehicle, state);
        else if (carType === 'tractor') this.performTractorUlt(vehicle, state);
        else if (carType === 'van') this.performVanTransformUlt(vehicle, state);
        else if (carType === 'spycar') this.performSpycarUlt(vehicle, state);
        else if (carType === 'scorp') this.performScorpUlt(vehicle, state);
        else if (carType === 'sprintracer') this.performSprintRacerUlt(vehicle, state);
        else if (carType === 'wolfstreet') this.performWolfTornado(vehicle, state);
        else if (carType === 'willys') this.performWillysOrbs(vehicle, state);
        else if (carType === 'planecar') this.performPlaneUlt(vehicle, state);
        else if (carType === 'miramar') this.performMiramarUlt(vehicle, state);
        else if (carType === 'ratrod') this.performRatrodUlt(vehicle, state);
        else if (carType === '25-redrum') this.performRedrumUlt(vehicle, state);
        else if (carType === '4door') this.perform4DoorUlt(vehicle, state);
        else if (carType === 'finaltank') this.performFinalTankUlt(vehicle, state);
        else if (carType === 'semi') this.performSemiUlt(vehicle, state);
        else if (carType === 'sidecarbike') this.performSidecarUlt(vehicle, state);
        else if (carType === 'bowcar') this.performBowCarUlt(vehicle, state);
        else {
            // Fallback: standard projectile
            const yaw = vehicle.carMesh.rotation.y;
            const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const spawnPos = new THREE.Vector3(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y + 1, vehicle.chassisBody.position.z);
            this.spawnProjectile(spawnPos, forward, 'ult', vehicle);
        }
    }

    // ULT METHODS
    performImpalaUlt(vehicle, state) {
        vehicle.chassisBody.applyImpulse(new CANNON.Vec3(0, 15000, 0), new CANNON.Vec3(0, 0, -2));
        const pos = vehicle.chassisBody.position;
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(b => {
                if (b.isDead) return;
                const dist = b.body.position.distanceTo(pos);
                if (dist < 15) {
                    const dir = b.body.position.vsub(pos); dir.normalize();
                    b.body.applyImpulse(dir.scale((1 - dist / 15) * 8000), new CANNON.Vec3());
                    this.game.barrels.applyDamage(b, 20, (brl) => this.game.handleBarrelExplosion(brl));
                }
            });
        }
        const ring = new THREE.Mesh(new THREE.RingGeometry(1, 15, 32), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(pos); this.scene.add(ring);
        let life = 0.5; const expand = () => { life -= 0.02; ring.scale.addScalar(0.2); ring.material.opacity = life; if (life <= 0) this.scene.remove(ring); else requestAnimationFrame(expand); };
        expand();
    }

    performLowriderUlt(vehicle, state) {
        const isBoosting = vehicle.boostFactor > 1.1;
        vehicle.chassisBody.velocity.y = 35;
        if (isBoosting) {
            const yaw = vehicle.carMesh.rotation.y;
            const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
            vehicle.chassisBody.velocity.vadd(forward.scale(40), vehicle.chassisBody.velocity);
        }
        state.lowriderSlamState = true;
        setTimeout(() => { if (state.lowriderSlamState && !vehicle.isTrulyGrounded) vehicle.chassisBody.velocity.y = -45; }, 800);
    }

    triggerLowriderSlamShockwave(vehicle, state) {
        const pos = vehicle.chassisBody.position;
        const flash = new THREE.PointLight(0xff00ff, 100, 20);
        flash.position.set(pos.x, pos.y + 1, pos.z);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 150);
        const ringGeo = new THREE.RingGeometry(1, 12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.1, pos.z);
        this.scene.add(ring);
        let life = 0.4;
        const expand = () => {
            life -= 0.02; ring.scale.addScalar(0.25); ring.material.opacity = life;
            if (life <= 0) this.scene.remove(ring); else requestAnimationFrame(expand);
        };
        expand();
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(b => {
                if (b.isDead) return;
                const dist = b.body.position.distanceTo(pos);
                if (dist < 12) {
                    const dir = b.body.position.vsub(pos); dir.normalize(); dir.y = 0.5;
                    b.body.applyImpulse(dir.scale(12000 * (1 - dist / 12)), new CANNON.Vec3());
                    this.game.barrels.applyDamage(b, 40, (brl) => this.game.handleBarrelExplosion(brl));
                }
            });
        }
    }

    performGrapplerUlt(vehicle, state) {
        if (state.grapplerTarget) { state.grapplerTarget = null; return; }
        const target = this.getTarget(vehicle, 15, Math.PI / 3);
        if (!target) { this.addAmmo(vehicle, 1, 'ult'); return; }
        state.grapplerTarget = target;
        state.grapplerDuration = 5.0;
    }

    handleGrapplerGrab(vehicle, state, dt) {
        if (!state.grapplerTarget) return;
        state.grapplerDuration -= dt;
        if (state.grapplerDuration <= 0) { state.grapplerTarget = null; return; }
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const holdPos = pos.vadd(forward.scale(5));
        state.grapplerTarget.body.position.copy(holdPos);
        state.grapplerTarget.body.quaternion.copy(vehicle.chassisBody.quaternion);
        state.grapplerTarget.body.velocity.copy(vehicle.chassisBody.velocity);
        if (!state.grapplerTarget.isBall) {
            this.game.barrels.applyDamage(state.grapplerTarget, 20 * dt, (b) => this.game.handleBarrelExplosion(b));
            if (Math.random() > 0.7) {
                const fMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 }));
                fMesh.position.copy(holdPos); this.scene.add(fMesh);
                setTimeout(() => this.scene.remove(fMesh), 300);
            }
        }
    }

    performForkliftUlt(vehicle, state) {
        if (state.forkliftTarget) {
            this.slamForkliftTarget(vehicle, state);
            return;
        }
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        let best = null, bestDist = 25;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position;
                const dist = pos.distanceTo(cPos);
                if (dist < bestDist) {
                    const toTarget = cPos.vsub(pos); toTarget.normalize();
                    const dot = forward.dot(new THREE.Vector3(toTarget.x, 0, toTarget.z));
                    if (dot > Math.cos(Math.PI / 3)) { bestDist = dist; best = car; }
                }
            }
        }
        if (!best) { this.addAmmo(vehicle, 1, 'ult'); return; }
        state.forkliftTarget = best;
        state.forkliftDuration = 4.0;
    }

    slamForkliftTarget(vehicle, state) {
        const target = state.forkliftTarget;
        if (!target) return;
        const carPos = vehicle.chassisBody.position;
        const liftH = vehicle.hoverMode ? carPos.y : 4;
        const dir = new CANNON.Vec3(target.chassisBody.position.x - carPos.x, 0, target.chassisBody.position.z - carPos.z);
        if (dir.length() > 0.01) dir.normalize(); else dir.set(0, 0, 1);
        target.chassisBody.velocity.set(dir.x * 15, -20, dir.z * 15);
        target.applyDamage(30);
        if (vehicle.hoverMode) {
            const fallDist = Math.max(0, liftH - 0.5);
            const bonusDmg = Math.floor(fallDist * 10);
            target.chassisBody.velocity.y = -Math.abs(20 + fallDist * 5);
            target.applyDamage(bonusDmg);
        }
        vehicle.chassisBody.velocity.y = 25;
        state.forkliftTarget = null;
        state.forkliftDuration = 0;
    }

    performMuscleUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
        vehicle.chassisBody.applyImpulse(forward.scale(12000), new CANNON.Vec3());
        state.wheelieTimer = 1.5;
    }

    handleMuscleWheelie(vehicle, state, dt) {
        if (!state.wheelieTimer || state.wheelieTimer <= 0) return;
        state.wheelieTimer -= dt;
        if (state.wheelieTimer <= 0) return;

        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

        // Check collision with other cars (forward cone, 4m range)
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position;
                const dx = cPos.x - pos.x;
                const dz = cPos.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < 5) {
                    const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
                    if (forward.dot(toTarget) > Math.cos(Math.PI / 3)) {
                        this.triggerMuscleLaunch(vehicle, state);
                        car.applyDamage(25);
                        car.chassisBody.velocity.y = 25;
                        car.chassisBody.velocity.x += forward.x * 20;
                        car.chassisBody.velocity.z += forward.z * 20;
                        return;
                    }
                }
            }
        }

        // Check for wall collision (forward raycast, 4m)
        const start = new CANNON.Vec3(pos.x, pos.y + 0.5, pos.z);
        const end = new CANNON.Vec3(pos.x + forward.x * 4, pos.y + 0.5, pos.z + forward.z * 4);
        const result = new CANNON.RaycastResult();
        this.game.physics.world.raycastClosest(start, end, { collisionFilterMask: ~0, skipBackfaces: true }, result);
        if (result.hasHit && result.body !== vehicle.chassisBody && Math.abs(result.hitNormalWorld.y) < 0.5) {
            this.triggerMuscleLaunch(vehicle, state);
        }
    }

    triggerMuscleLaunch(vehicle, state) {
        vehicle.chassisBody.velocity.y = 65;
        state.wheelieTimer = 0;
    }

    handleForkliftGrab(vehicle, state, dt) {
        if (!state.forkliftTarget) return;
        state.forkliftDuration -= dt;
        if (state.forkliftDuration <= 0) {
            this.slamForkliftTarget(vehicle, state);
            return;
        }
        const pos = vehicle.chassisBody.position;
        const liftHeight = vehicle.hoverMode ? pos.y + 2 : 4;
        const grabPos = new CANNON.Vec3(pos.x, liftHeight, pos.z);
        const target = state.forkliftTarget;
        target.chassisBody.position.copy(grabPos);
        target.chassisBody.quaternion.copy(vehicle.chassisBody.quaternion);
        target.chassisBody.velocity.copy(vehicle.chassisBody.velocity);
    }

    performTractorUlt(vehicle, state) {
        if (state.tractorTarget) {
            this.throwTractorTarget(vehicle, state);
            return;
        }
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        let best = null, bestDist = 15;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position;
                const dist = pos.distanceTo(cPos);
                if (dist < bestDist) {
                    const toTarget = new CANNON.Vec3(cPos.x - pos.x, 0, cPos.z - pos.z);
                    toTarget.normalize();
                    const dot = forward.dot(new THREE.Vector3(toTarget.x, 0, toTarget.z));
                    if (dot > Math.cos(Math.PI / 3)) { bestDist = dist; best = car; }
                }
            }
        }
        if (!best) { this.addAmmo(vehicle, 1, 'ult'); return; }
        state.tractorTarget = best;
        state.tractorDuration = 3.0;
    }

    handleTractorGrab(vehicle, state, dt) {
        if (!state.tractorTarget) return;
        state.tractorDuration -= dt;
        if (state.tractorDuration <= 0) {
            this.throwTractorTarget(vehicle, state);
            return;
        }
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const holdPos = pos.vadd(forward.scale(4));
        state.tractorTarget.chassisBody.position.copy(holdPos);
        state.tractorTarget.chassisBody.quaternion.copy(vehicle.chassisBody.quaternion);
        state.tractorTarget.chassisBody.velocity.copy(vehicle.chassisBody.velocity);
        // Grind damage while held
        state.tractorTarget.applyDamage(25 * dt);
        // Grind sparks
        if (Math.random() > 0.6) {
            const spark = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 }));
            spark.position.copy(holdPos);
            spark.position.x += (Math.random() - 0.5) * 1.5;
            spark.position.z += (Math.random() - 0.5) * 1.5;
            this.scene.add(spark);
            setTimeout(() => this.scene.remove(spark), 200);
        }
    }

    throwTractorTarget(vehicle, state) {
        const target = state.tractorTarget;
        if (!target) return;
        target.chassisBody.velocity.y = 65;
        target.chassisBody.velocity.x += (Math.random() - 0.5) * 20;
        target.chassisBody.velocity.z += (Math.random() - 0.5) * 20;
        target.applyDamage(20);
        state.tractorTarget = null;
        state.tractorDuration = 0;
    }

    performVanTransformUlt(vehicle, state) {
        state.transformed = !state.transformed;
        const newConfig = state.transformed
            ? { gltfFile: 'sportbike.glb', gltfPath: 'objects/cars/', scale: 2.0, rotationOffset: 0, offset: { x: 0, y: -0.5, z: 0 } }
            : CONFIG.CARS['van'];
        this.swapVehicleModel(vehicle, newConfig);
    }

    performSpycarUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const pos = vehicle.chassisBody.position;
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                const row = Math.floor(i / 5);
                const col = i % 5;
                const lx = -2 + col;
                const ly = 0.6 + row * 0.3;
                const lz = 1.5 + row * 0.5;
                const cos = Math.cos(yaw), sin = Math.sin(yaw);
                const wx = pos.x + lx * cos + lz * sin;
                const wz = pos.z - lx * sin + lz * cos;
                const wy = pos.y + ly;
                const fwd = new THREE.Vector3(-sin, 0, -cos);
                this.spawnProjectile(new CANNON.Vec3(wx, wy, wz), fwd, 'missile', vehicle);
                const p = this.projectiles[this.projectiles.length - 1];
                if (p) {
                    p.damage = 12; p.life = 4.0;
                    p.velocity.set(fwd.x * 15, fwd.y * 15, fwd.z * 15);
                    setTimeout(() => {
                        const target = this.getTarget(vehicle, 80);
                        if (!target) { p.homing = false; return; }
                        const newDir = target.body.position.vsub(p.mesh.position); newDir.normalize();
                        p.velocity.set(newDir.x * 40, newDir.y * 40, newDir.z * 40);
                        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(newDir.x, newDir.y, newDir.z));
                    }, 200);
                }
            }, i * 150);
        }
    }

    swapVehicleModel(vehicle, config) {
        const toRemove = [];
        vehicle.carMesh.children.forEach(child => {
            if (child.type === 'Group') {
                toRemove.push(child);
            }
        });
        toRemove.forEach(child => vehicle.carMesh.remove(child));
        getCarModel(config, (model) => {
            if (!model) return;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const scaleVal = (4 / Math.max(size.x, size.y, size.z)) * (config.scale || 1.5);
            model.scale.set(scaleVal, scaleVal, scaleVal);
            model.rotation.y = config.rotationOffset !== undefined ? config.rotationOffset : Math.PI;
            model.position.y = config.offset ? config.offset.y : -0.4;
            vehicle.carMesh.add(model);
        });
    }

    performScorpUlt(vehicle, state) {
        if (state.scorpTarget) {
            this.flingScorpTarget(vehicle, state);
            return;
        }
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const pos = vehicle.chassisBody.position;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        let best = null, bestDist = 18;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const dx = car.chassisBody.position.x - pos.x, dz = car.chassisBody.position.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < bestDist) {
                    const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
                    if (forward.dot(toTarget) > Math.cos(Math.PI / 3)) { bestDist = dist; best = car; }
                }
            }
        }
        if (!best) { this.addAmmo(vehicle, 1, 'ult'); return; }
        state.scorpTarget = best;
        state.scorpPhase = 0;
        state.scorpTimer = 0.3;
        const claw = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), new THREE.MeshPhongMaterial({ color: 0x888888, emissive: 0x444444 }));
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 4), new THREE.MeshBasicMaterial({ color: 0x666666 }));
        const clawGroup = new THREE.Group();
        clawGroup.add(claw); clawGroup.add(cable);
        this.scene.add(clawGroup);
        state.scorpClawMesh = clawGroup;
    }

    handleScorpClaw(vehicle, state, dt) {
        if (!state.scorpTarget) return;
        const target = state.scorpTarget;
        const pos = vehicle.chassisBody.position;
        if (state.scorpPhase === 0) {
            state.scorpTimer -= dt;
            const t = 1 - state.scorpTimer / 0.3;
            const liftY = pos.y + 1 + t * 5;
            target.chassisBody.position.set(pos.x, liftY, pos.z);
            target.chassisBody.velocity.set(0, 0, 0);
            if (state.scorpTimer <= 0) { state.scorpPhase = 1; state.scorpTimer = 2.0; }
        } else if (state.scorpPhase === 1) {
            state.scorpTimer -= dt;
            target.chassisBody.position.set(pos.x, pos.y + 6, pos.z);
            target.chassisBody.velocity.set(0, 0, 0);
            target.applyDamage(8 * dt);
            if (state.scorpTimer <= 0) this.flingScorpTarget(vehicle, state);
        }
        if (state.scorpClawMesh) {
            const tPos = target.chassisBody.position;
            state.scorpClawMesh.position.copy(tPos);
            const mid = new THREE.Vector3((pos.x + tPos.x) / 2, (pos.y + tPos.y) / 2, (pos.z + tPos.z) / 2);
            const dist = Math.sqrt((tPos.x - pos.x) ** 2 + (tPos.y - pos.y) ** 2 + (tPos.z - pos.z) ** 2);
            const cable = state.scorpClawMesh.children[1];
            cable.scale.y = dist;
            cable.position.set(0, -dist / 2, 0);
        }
    }

    flingScorpTarget(vehicle, state) {
        const target = state.scorpTarget;
        if (!target) return;
        const dir = new CANNON.Vec3(target.chassisBody.position.x - vehicle.chassisBody.position.x, 3, target.chassisBody.position.z - vehicle.chassisBody.position.z);
        if (dir.length() > 0.01) dir.normalize(); else dir.set(0, 1, 0);
        target.chassisBody.velocity.set(dir.x * 25, 35, dir.z * 25);
        target.chassisBody.angularVelocity.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        target.applyDamage(40);
        if (state.scorpClawMesh) { this.scene.remove(state.scorpClawMesh); state.scorpClawMesh = null; }
        state.scorpTarget = null;
        state.scorpPhase = 0;
        state.scorpTimer = 0;
    }

    performSprintRacerUlt(vehicle, state) {
        const target = this.getTarget(vehicle, 80);
        if (!target) { this.addAmmo(vehicle, 1, 'ult'); return; }
        const pos = vehicle.chassisBody.position;
        const count = 10;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const tPos = target.body.position;
                const spawnPos = new CANNON.Vec3(pos.x + (Math.random() - 0.5) * 4, pos.y + 2, pos.z + (Math.random() - 0.5) * 4);
                const dir = new THREE.Vector3(tPos.x - spawnPos.x, tPos.y - spawnPos.y + 8, tPos.z - spawnPos.z).normalize();
                this.spawnProjectile(spawnPos, dir, 'cannon', vehicle);
                const p = this.projectiles[this.projectiles.length - 1];
                if (p) {
                    p.damage = 6;
                    p.life = 3.0;
                    p.velocity.set(dir.x * 35, dir.y * 35, dir.z * 35);
                    const isLast = i === count - 1;
                    if (isLast) p.isLastVolcano = true;
                }
            }, i * 60);
        }
    }

    performWolfTornado(vehicle, state) {
        if (state.wolfTornado) return;
        state.wolfTornado = true;
        state.wolfTimer = 8;
        vehicle.hoverMode = true;
        vehicle.targetHeight = 1.2;
        state.wolfSpinAngle = 0;
        state.wolfFireTimer = 0;
        state.wolfLiftTimer = 0;
        state.wolfModelRef = null;
        vehicle.carMesh.children.forEach(child => {
            if (child.type === 'Group') state.wolfModelRef = child;
        });
    }

    handleWolfTornado(vehicle, state, dt) {
        if (!state.wolfTornado) return;
        state.wolfTimer -= dt;
        if (state.wolfTimer <= 0) {
            state.wolfTornado = false;
            vehicle.hoverMode = false;
            vehicle.hoverLow = false;
            state.wolfModelRef = null;
            return;
        }
        state.wolfSpinAngle += dt * 12;
        if (state.wolfModelRef) {
            state.wolfModelRef.rotation.y = (vehicle.carConfig.rotationOffset || Math.PI) + state.wolfSpinAngle;
        }
        const pos = vehicle.chassisBody.position;
        state.wolfFireTimer -= dt;
        state.wolfLiftTimer -= dt;
        if (state.wolfFireTimer <= 0) {
            state.wolfFireTimer = 0.3;
            const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
            if (carsArr) {
                for (const car of carsArr) {
                    if (car === vehicle || car.isDead) continue;
                    const dx = pos.x - car.chassisBody.position.x, dz = pos.z - car.chassisBody.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < 10) {
                        car.applyDamage(5);
                        car.fireTimer = 0.5;
                    }
                }
            }
        }
        if (state.wolfLiftTimer <= 0) {
            state.wolfLiftTimer = 1.0;
            const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
            if (carsArr) {
                for (const car of carsArr) {
                    if (car === vehicle || car.isDead) continue;
                    const dx = pos.x - car.chassisBody.position.x, dz = pos.z - car.chassisBody.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < 10) {
                        car.chassisBody.velocity.y = 12;
                        const slingDir = new CANNON.Vec3(dx, 0, dz);
                        if (slingDir.length() > 0.01) slingDir.normalize();
                        car.chassisBody.velocity.x += slingDir.x * 8;
                        car.chassisBody.velocity.z += slingDir.z * 8;
                        car.applyDamage(8);
                    }
                }
            }
        }
    }

    performWillysOrbs(vehicle, state) {
        if (state.willysOrbs) {
            state.willysOrbs.forEach(o => { this.scene.remove(o.mesh); if (o.cage) this.scene.remove(o.cage); });
            state.willysOrbs = null;
            if (state.willysCage) { this.scene.remove(state.willysCage); state.willysCage = null; }
            return;
        }
        const orbs = [];
        for (let i = 0; i < 6; i++) {
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshPhongMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.6 }));
            this.scene.add(orb);
            const cage = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.45, 16), new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
            this.scene.add(cage);
            orbs.push({ mesh: orb, cage, angle: (i / 6) * Math.PI * 2, cooldown: 0, index: i });
        }
        state.willysOrbs = orbs;
        const cageBox = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 16), new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.15 }));
        this.scene.add(cageBox);
        state.willysCage = cageBox;
    }

    handleWillysOrbs(vehicle, state, dt) {
        if (!state.willysOrbs) return;
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const rad = 3;
        state.willysOrbs.forEach((o, i) => {
            o.angle += dt * 0.8;
            const ox = pos.x + Math.cos(o.angle) * rad;
            const oz = pos.z + Math.sin(o.angle) * rad;
            const oy = pos.y + 1.5 + Math.sin(o.angle * 0.5 + i) * 0.5;
            o.mesh.position.set(ox, oy, oz);
            o.cage.position.copy(o.mesh.position);
            o.cage.lookAt(pos.x, oy, pos.z);
            o.cooldown -= dt;
            if (o.cooldown <= 0) {
                const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
                if (carsArr) {
                    let best = null, bestDist = 8;
                    for (const car of carsArr) {
                        if (car === vehicle || car.isDead) continue;
                        const dx = pos.x - car.chassisBody.position.x, dz = pos.z - car.chassisBody.position.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist < bestDist) { bestDist = dist; best = car; }
                    }
                    if (best) {
                        o.cooldown = 1.0;
                        const dir = new CANNON.Vec3(best.chassisBody.position.x - ox, 0, best.chassisBody.position.z - oz);
                        if (dir.length() > 0.01) dir.normalize();
                        best.chassisBody.velocity.y += 5;
                        best.chassisBody.velocity.x += dir.x * 3;
                        best.chassisBody.velocity.z += dir.z * 3;
                        best.applyDamage(4);
                    }
                }
            }
        });
        if (state.willysCage) {
            state.willysCage.position.set(pos.x, pos.y, pos.z);
        }
    }

    performPlaneUlt(vehicle, state) {
        if (state.planeActive) { state.planeActive = false; vehicle.hoverMode = false; return; }
        state.planeActive = true;
        state.planeDropTimer = 0;
        state.planeGlideTimer = 5.0;
        vehicle.chassisBody.velocity.y = 25;
        vehicle.hoverMode = true;
        vehicle.targetHeight = 12;
    }

    handlePlaneGlide(vehicle, state, dt) {
        if (state.planeActive) {
            state.planeGlideTimer -= dt;
            if (state.planeGlideTimer <= 0) {
                state.planeActive = false;
                vehicle.hoverMode = false;
            } else {
                const pos = vehicle.chassisBody.position;
                state.planeDropTimer -= dt;
                if (state.planeDropTimer <= 0) {
                    state.planeDropTimer = 0.4;
                    const spawnPos = new THREE.Vector3(pos.x + (Math.random() - 0.5) * 3, pos.y - 0.5, pos.z + (Math.random() - 0.5) * 3);
                    const sphereBody = new CANNON.Body({ mass: 20, shape: new CANNON.Sphere(0.5), position: new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z), linearDamping: 0.1, angularDamping: 0.1 });
                    this.world.addBody(sphereBody);
                    const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), new THREE.MeshPhongMaterial({ color: 0x444444, emissive: 0x222222 }));
                    sphereMesh.position.copy(spawnPos);
                    this.scene.add(sphereMesh);
                    const mine = { body: sphereBody, mesh: sphereMesh, age: 0, settled: false };
                    if (!state.planeMineGroups.length || state.planeMineGroups[state.planeMineGroups.length - 1].length >= 5) {
                        if (state.planeMineGroups.length >= 2) {
                            state.planeMineGroups[0].forEach(m => { this.world.removeBody(m.body); this.scene.remove(m.mesh); });
                            state.planeMineGroups.shift();
                        }
                        state.planeMineGroups.push([]);
                    }
                    state.planeMineGroups[state.planeMineGroups.length - 1].push(mine);
                }
            }
        }
        // Process all plane mines (even when not actively gliding)
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        for (const group of state.planeMineGroups) {
            for (let i = group.length - 1; i >= 0; i--) {
                const m = group[i];
                m.age += dt;
                if (!m.settled && m.age >= 3) {
                    m.settled = true;
                    m.body.type = CANNON.Body.STATIC;
                    m.body.updateMassProperties();
                }
                let exploded = false;
                if (carsArr) {
                    for (const car of carsArr) {
                        if (car.isDead) continue;
                        const dx = m.body.position.x - car.chassisBody.position.x, dz = m.body.position.z - car.chassisBody.position.z;
                        if (!m.settled && Math.sqrt(dx * dx + dz * dz) < 1.5) {
                            car.chassisBody.velocity.y += 15;
                            car.chassisBody.velocity.x += (m.body.position.x - car.chassisBody.position.x) * 2;
                            car.chassisBody.velocity.z += (m.body.position.z - car.chassisBody.position.z) * 2;
                            car.applyDamage(25);
                            exploded = true;
                            break;
                        }
                        if (m.settled && Math.sqrt(dx * dx + dz * dz) < 1.5) {
                            car.applyDamage(25);
                            car.chassisBody.velocity.y += 10;
                            exploded = true;
                            break;
                        }
                    }
                }
                if (m.body.position.y < -5) exploded = true;
                if (exploded) {
                    const flash = new THREE.PointLight(0xff4400, 80, 10);
                    flash.position.copy(m.body.position);
                    this.scene.add(flash);
                    setTimeout(() => this.scene.remove(flash), 150);
                    this.world.removeBody(m.body);
                    this.scene.remove(m.mesh);
                    group.splice(i, 1);
                }
            }
        }
        // Clean empty groups
        for (let g = state.planeMineGroups.length - 1; g >= 0; g--) {
            if (state.planeMineGroups[g].length === 0) state.planeMineGroups.splice(g, 1);
        }
    }

    performMiramarUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const pos = vehicle.chassisBody.position;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (!carsArr) return;
        let primary = null, primaryDist = 30;
        for (const car of carsArr) {
            if (car === vehicle || car.isDead) continue;
            const dx = car.chassisBody.position.x - pos.x, dz = car.chassisBody.position.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < primaryDist) {
                const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
                if (fwd.dot(toTarget) > Math.cos(Math.PI / 6)) { primaryDist = dist; primary = car; }
            }
        }
        if (!primary) { this.addAmmo(vehicle, 1, 'ult'); return; }
        this.empZap(vehicle, primary, carsArr);
    }

    empZap(owner, target, carsArr) {
        const hit = new Set();
        const srcPos = owner.chassisBody.position;
        this.doEmpZap(owner, target, carsArr, hit, new THREE.Vector3(srcPos.x, srcPos.y + 1, srcPos.z), 0);
    }

    doEmpZap(owner, target, carsArr, hit, fromPos, depth) {
        if (!target || hit.has(target) || depth > 1) return;
        hit.add(target);
        const tPos = target.chassisBody.position;
        target.chassisBody.velocity.set(0, 0, 0);
        target.slowTimer = 2.0;
        target.applyDamage(20);
        const dstPos = new THREE.Vector3(tPos.x, tPos.y + 1, tPos.z);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 4), new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.8 }));
        const mid = fromPos.clone().add(dstPos).multiplyScalar(0.5);
        const len = fromPos.distanceTo(dstPos);
        beam.scale.y = len;
        beam.position.copy(mid);
        beam.lookAt(dstPos);
        this.scene.add(beam);
        setTimeout(() => this.scene.remove(beam), 200);
        const carsArr2 = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        let next = null, nextDist = 12;
        for (const car of (carsArr2 || carsArr)) {
            if (car === owner || car.isDead || hit.has(car)) continue;
            const dx = tPos.x - car.chassisBody.position.x, dz = tPos.z - car.chassisBody.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < nextDist) { nextDist = dist; next = car; }
        }
        if (next) {
            setTimeout(() => this.doEmpZap(owner, next, carsArr2 || carsArr, hit, dstPos, depth + 1), 150);
        }
    }

    performBowCarUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const pos = vehicle.chassisBody.position;
        const spawnPos = new THREE.Vector3(pos.x, pos.y + 1.5, pos.z);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 4), new THREE.MeshPhongMaterial({ color: 0x8B4513 }));
        shaft.rotation.z = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), new THREE.MeshPhongMaterial({ color: 0x444444 }));
        tip.position.x = 1.45;
        const c4 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 }));
        c4.position.x = -0.6;
        const arrow = new THREE.Group();
        arrow.add(shaft); arrow.add(tip); arrow.add(c4);
        arrow.position.copy(spawnPos);
        arrow.lookAt(spawnPos.clone().add(fwd));
        this.scene.add(arrow);
        state.bowArrow = { mesh: arrow, velocity: fwd.clone().multiplyScalar(55), stuckTo: null, explodeTimer: 0, spawned: true };
    }

    handleBowCarArrow(vehicle, state, dt) {
        const ba = state.bowArrow;
        if (!ba || !ba.spawned) return;
        if (ba.stuckTo) {
            ba.explodeTimer -= dt;
            if (ba.explodeTimer <= 0) {
                this.explodeBowArrow(ba);
                state.bowArrow = null;
            } else {
                ba.mesh.position.copy(ba.stuckTo.chassisBody.position);
                ba.mesh.position.y += 1.2;
            }
            return;
        }
        ba.mesh.position.add(ba.velocity.clone().multiplyScalar(dt));
        ba.velocity.y -= 15 * dt;
        if (ba.mesh.position.y < 0.5) {
            this.scene.remove(ba.mesh);
            state.bowArrow = null;
            return;
        }
        const pPos = ba.mesh.position;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const dx = pPos.x - car.chassisBody.position.x, dy = pPos.y - car.chassisBody.position.y, dz = pPos.z - car.chassisBody.position.z;
                if (dx * dx + dy * dy + dz * dz < 16) {
                    ba.stuckTo = car;
                    ba.velocity.set(0, 0, 0);
                    const pushDir = new CANNON.Vec3(dx, dy, dz);
                    if (pushDir.length() > 0.01) pushDir.normalize(); else pushDir.set(0, 0, 1);
                    car.chassisBody.applyImpulse(pushDir.scale(15000), new CANNON.Vec3());
                    car.applyDamage(5);
                    ba.explodeTimer = 2.5;
                    break;
                }
            }
        }
    }

    explodeBowArrow(ba) {
        if (!ba.mesh) return;
        const c4Pos = ba.mesh.position;
        this.scene.remove(ba.mesh);
        const splashRadius = 8;
        const flash = new THREE.PointLight(0xff0000, 150, splashRadius * 2);
        flash.position.copy(c4Pos);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 200);
        const explosion = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7 }));
        explosion.position.copy(c4Pos);
        this.scene.add(explosion);
        setTimeout(() => this.scene.remove(explosion), 300);
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car.isDead) continue;
                const dist = car.chassisBody.position.distanceTo(new CANNON.Vec3(c4Pos.x, c4Pos.y, c4Pos.z));
                if (dist < splashRadius) {
                    const dmg = 50 * (1 - dist / splashRadius);
                    car.applyDamage(dmg);
                    const pushDir = car.chassisBody.position.vsub(new CANNON.Vec3(c4Pos.x, c4Pos.y, c4Pos.z));
                    pushDir.y += 2;
                    if (pushDir.length() > 0.01) pushDir.normalize();
                    car.chassisBody.applyImpulse(pushDir.scale(12000 * (1 - dist / splashRadius)), new CANNON.Vec3());
                }
            }
        }
    }

    performRatrodUlt(vehicle, state) {
        if (state.ratrodAA) {
            state.ratrodAA = null;
            return;
        }
        state.ratrodAA = { timer: 0.3, nextDelay: 1.5 };
    }

    handleRatrodAA(vehicle, state, dt) {
        if (!state.ratrodAA) return;
        state.ratrodAA.timer -= dt;
        if (state.ratrodAA.timer > 0) return;

        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        let bestTarget = null, bestDist = 80;

        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                if (car.isTrulyGrounded && car.chassisBody.position.y < 2) continue;
                const cPos = car.chassisBody.position;
                const dist = pos.distanceTo(cPos);
                if (dist < bestDist) {
                    const toTarget = new THREE.Vector3(cPos.x - pos.x, 0, cPos.z - pos.z);
                    toTarget.normalize();
                    const dot = forward.dot(toTarget);
                    if (dot > Math.cos(Math.PI / 2)) { bestDist = dist; bestTarget = car; }
                }
            }
        }

        if (bestTarget) {
            bestTarget.applyDamage(18);
            const start = new THREE.Vector3(pos.x, pos.y + 1.5, pos.z);
            const end = new THREE.Vector3(bestTarget.chassisBody.position.x, bestTarget.chassisBody.position.y + 1, bestTarget.chassisBody.position.z);
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([start, end]),
                new THREE.LineBasicMaterial({ color: 0xff4400 })
            );
            this.scene.add(line);
            setTimeout(() => this.scene.remove(line), 80);
        }

        state.ratrodAA.timer = state.ratrodAA.nextDelay;
        state.ratrodAA.nextDelay = state.ratrodAA.nextDelay === 1.5 ? 1.4 : 1.5;
    }

    performRedrumUlt(vehicle, state) {
        const type = state.redrumNextBarrelType;
        if (state.redrumBarrels.length >= 4) {
            const old = state.redrumBarrels.shift();
            if (old && !old.isDead) this.game.barrels.applyDamage(old, 999, (b) => this.game.handleBarrelExplosion(b));
        }
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const pos = vehicle.chassisBody.position;
        const gp = this.game.getGamepad ? this.game.getGamepad() : null;
        const dropBehind = this.game.keys['KeyS'] || this.game.keys['ArrowDown'] || (gp && gp.axes[1] > 0.5);
        let spawnPos, velocity;
        if (dropBehind) { spawnPos = pos.vadd(forward.scale(-4)); velocity = vehicle.chassisBody.velocity.clone(); }
        else { spawnPos = pos.vadd(forward.scale(4)).vadd(new CANNON.Vec3(0, 1.5, 0)); velocity = forward.scale(30).vadd(new CANNON.Vec3(0, 5, 0)); }
        const b = this.game.barrels.spawnBarrel(spawnPos.x, spawnPos.z, type);
        b.body.velocity.copy(velocity); b.isRedrumBarrel = true;
        if (!dropBehind) {
            const checkImpact = setInterval(() => {
                if (b.isDead) { clearInterval(checkImpact); return; }
                if (b.body.velocity.length() < 2 || b.body.position.y < 0.6) {
                    this.game.barrels.applyDamage(b, 999, (brl) => this.game.handleBarrelExplosion(brl)); clearInterval(checkImpact);
                }
            }, 50);
        }
        state.redrumBarrels.push(b);
        const types = ['explosive', 'toxic', 'cryo'];
        state.redrumNextBarrelType = types[Math.floor(Math.random() * types.length)];
    }

    handleRedrumUpdate(vehicle, state, dt) {
        if (!state.redrumBarrelIndicator) {
            state.redrumBarrelIndicator = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8), new THREE.MeshPhongMaterial({ color: 0xff0000 }));
            state.redrumBarrelIndicator.rotation.z = Math.PI / 2; this.scene.add(state.redrumBarrelIndicator);
        }
        const colors = { 'explosive': 0xff0000, 'toxic': 0x00ff00, 'cryo': 0x00ffff };
        state.redrumBarrelIndicator.material.color.setHex(colors[state.redrumNextBarrelType]);
        const pos = vehicle.chassisBody.position; const q = vehicle.chassisBody.quaternion;
        const offset = new THREE.Vector3(0, 1.2, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
        state.redrumBarrelIndicator.position.set(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z);
        state.redrumBarrelIndicator.quaternion.copy(vehicle.carMesh.quaternion); state.redrumBarrelIndicator.rotateZ(Math.PI / 2);
        state.redrumBarrels = state.redrumBarrels.filter(b => !b.isDead);
    }

    performPoliceCarUlt(vehicle, state) {
        if (state.policeStickyBomb) { this.explodePoliceStickyBomb(vehicle, state); return; }
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const spawnPos = vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 1, 0));
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshPhongMaterial({ color: 0x0000ff, emissive: 0x0000ff }));
        mesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z); this.scene.add(mesh);
        state.policeStickyBomb = { mesh, velocity: forward.multiplyScalar(40), life: 10.0, stuckTo: null, localOffset: null, exploding: false };
    }

    explodePoliceStickyBomb(vehicle, state) {
        if (!state.policeStickyBomb || state.policeStickyBomb.exploding) return;
        state.policeStickyBomb.exploding = true;
        const pos = state.policeStickyBomb.mesh.position.clone();
        const flash = new THREE.PointLight(0x0000ff, 100, 30); flash.position.copy(pos); this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 200);
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(b => {
                if (b.isDead) return;
                const dist = b.body.position.distanceTo(pos);
                if (dist < 12) {
                    const dir = b.body.position.vsub(new CANNON.Vec3(pos.x, pos.y, pos.z)); dir.normalize();
                    b.body.applyImpulse(dir.scale(10000 * (1 - dist / 12)), new CANNON.Vec3());
                    this.game.barrels.applyDamage(b, 50, (brl) => this.game.handleBarrelExplosion(brl));
                }
            });
        }
        this.scene.remove(state.policeStickyBomb.mesh); state.policeStickyBomb = null;
    }

    handlePoliceStickyBomb(vehicle, state, dt) {
        if (!state.policeStickyBomb) return;
        const b = state.policeStickyBomb;
        if (b.stuckTo) {
            if (b.stuckTo.body) {
                const p = b.stuckTo.body.position; const q = b.stuckTo.body.quaternion;
                const offset = b.localOffset.clone().applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
                b.mesh.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
            }
            return;
        }
        b.mesh.position.add(b.velocity.clone().multiplyScalar(dt)); b.life -= dt;
        if (b.life <= 0) { this.scene.remove(b.mesh); state.policeStickyBomb = null; return; }
        const pos = b.mesh.position;
        if (pos.y < 0.2) { b.stuckTo = 'ground'; b.mesh.position.y = 0.1; return; }
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(brl => {
                if (!brl.isDead && brl.body.position.distanceTo(pos) < 1.5) {
                    b.stuckTo = brl; const p = brl.body.position; const q = brl.body.quaternion;
                    const invQ = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
                    b.localOffset = new THREE.Vector3(pos.x - p.x, pos.y - p.y, pos.z - p.z).applyQuaternion(invQ);
                }
            });
        }
        if (this.game.ballBody && this.game.ballBody.position.distanceTo(pos) < 4.2) {
            b.stuckTo = { body: this.game.ballBody }; const p = this.game.ballBody.position; const q = this.game.ballBody.quaternion;
            const invQ = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
            b.localOffset = new THREE.Vector3(pos.x - p.x, pos.y - p.y, pos.z - p.z).applyQuaternion(invQ);
        }
    }

    performServerVanUlt(vehicle, state) {
        const pos = vehicle.chassisBody.position;
        const flash = new THREE.PointLight(0x00ffff, 50, 40); flash.position.copy(pos); this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 200);
        if (this.game.barrels) {
            this.game.barrels.barrels.forEach(b => {
                if (!b.isDead && b.body.position.distanceTo(pos) < 25) this.game.handleBarrelExplosion({ ...b, type: 'cryo' });
            });
        }
    }

    performF2Ult(vehicle, state) {
        const target = this.getTarget(vehicle, 60); if (!target) { this.addAmmo(vehicle, 1, 'ult'); return; }
        const tPos = target.body.position;
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const off = new THREE.Vector3((Math.random()-0.5)*8, 0, (Math.random()-0.5)*8);
                const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(tPos.x + off.x, 30, tPos.z + off.z), new THREE.Vector3(tPos.x + off.x, 0, tPos.z + off.z)]), new THREE.LineBasicMaterial({ color: 0x00ffff }));
                this.scene.add(line); setTimeout(() => this.scene.remove(line), 100);
                if (target.isBall) target.body.applyImpulse(new CANNON.Vec3(0, 5000, 0), new CANNON.Vec3());
                else if (this.game.barrels) this.game.barrels.applyDamage(target, 40, (b) => this.game.handleBarrelExplosion(b));
            }, i * 200);
        }
    }

    performHumherUlt(vehicle, state) {
        const start = Date.now();
        const interval = setInterval(() => {
            if (Date.now() - start > 2000) { clearInterval(interval); return; }
            const target = this.getTarget(vehicle, 40, Math.PI / 2);
            if (target) {
                const dir = target.body.position.vsub(vehicle.chassisBody.position); dir.normalize();
                this.spawnProjectile(vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 1, 0)), new THREE.Vector3(dir.x, dir.y, dir.z), 'bullet', vehicle);
            }
        }, 100);
    }

    performMiniUlt(vehicle, state) {
        const target = this.getTarget(vehicle, 80); if (!target) { this.addAmmo(vehicle, 1, 'ult'); return; }
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.spawnProjectile(vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 2, 0)), new THREE.Vector3(0, 1, 0), 'missile', vehicle);
                const p = this.projectiles[this.projectiles.length - 1];
                if (p) {
                    p.damage = 60; p.life = 4.0;
                    setTimeout(() => {
                        const newDir = target.body.position.vsub(p.mesh.position); newDir.normalize();
                        p.velocity.set(newDir.x * 40, newDir.y * 40, newDir.z * 40);
                        p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(newDir.x, newDir.y, newDir.z));
                    }, 500);
                }
            }, i * 300);
        }
    }

    performSchoolBusUlt(vehicle, state) {
        const target = this.getTarget(vehicle, 100); if (!target) return;
        const start = vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 2, 0)); const end = target.body.position;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)]), new THREE.LineBasicMaterial({ color: 0xff0000 }));
        this.scene.add(line); setTimeout(() => this.scene.remove(line), 50);
        if (!target.isBall && this.game.barrels) this.game.barrels.applyDamage(target, 5, (b) => this.game.handleBarrelExplosion(b));
    }

    performMixerUlt(vehicle, state) {
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const backDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const poolGeo = this.game.poolGeo || new THREE.CircleGeometry(4, 16);
        const poolMat = this.game.poolMats?.toxic ? this.game.poolMats.toxic.clone() : new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.6 });

        for (let i = 0; i < 5; i++) {
            const offset = (i + 1) * 3.5;
            const x = pos.x + backDir.x * offset;
            const z = pos.z + backDir.z * offset;
            const mesh = new THREE.Mesh(poolGeo, poolMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, 0.05, z);
            this.scene.add(mesh);
            if (this.game.pools) {
                this.game.pools.push({ mesh, x, z, type: 'toxic', life: 10 });
            }
        }
    }

    performAmrtruckUlt(vehicle, state) {
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const rightDir = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
        const poolGeo = this.game.poolGeo || new THREE.CircleGeometry(3, 16);
        const poolMat = new THREE.MeshPhongMaterial({ color: 0xff4400, transparent: true, opacity: 0.7, emissive: 0xff2200, emissiveIntensity: 0.5 });

        for (let i = -4; i <= 4; i++) {
            const offset = i * 6;
            const x = pos.x + rightDir.x * offset;
            const z = pos.z + rightDir.z * offset;
            const mesh = new THREE.Mesh(poolGeo, poolMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, 0.05, z);
            this.scene.add(mesh);
            if (this.game.pools) {
                this.game.pools.push({ mesh, x, z, type: 'fire', life: 8, owner: vehicle });
            }
        }
    }

    performBeachbugUlt(vehicle, state) {
        const pos = vehicle.chassisBody.position;
        const poolGeo = new THREE.CircleGeometry(7, 24);
        const poolMat = new THREE.MeshPhongMaterial({ color: 0xccbb77, transparent: true, opacity: 0.65, shininess: 10 });
        const mesh = new THREE.Mesh(poolGeo, poolMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(pos.x, 0.05, pos.z);
        this.scene.add(mesh);
        if (this.game.pools) {
            this.game.pools.push({ mesh, x: pos.x, z: pos.z, type: 'quicksand', life: 10, owner: vehicle });
        }
    }

    performFoodtruckUlt(vehicle, state) {
        const pos = vehicle.chassisBody.position;
        const yaw = vehicle.carMesh.rotation.y;
        const backDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const poolGeo = new THREE.CircleGeometry(3.5, 16);
        const poolMat = new THREE.MeshPhongMaterial({ color: 0x888888, transparent: true, opacity: 0.5, shininess: 5 });

        for (let i = 0; i < 6; i++) {
            const offset = (i + 1) * 3;
            const x = pos.x + backDir.x * offset;
            const z = pos.z + backDir.z * offset;
            const mesh = new THREE.Mesh(poolGeo, poolMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, 0.05 + Math.random() * 0.1, z);
            mesh.scale.setScalar(0.6 + Math.random() * 0.8);
            this.scene.add(mesh);
            if (this.game.pools) {
                this.game.pools.push({ mesh, x, z, type: 'smoke', life: 8, owner: vehicle });
            }
        }
    }

    performBeachPartyVanUlt(vehicle, state) {
        state.beachPartyPulse = { count: 0, timer: 0.3, active: true };
    }

    performRvUlt(vehicle, state) {
        if (state.rvSat) return;
        const target = this.getTarget(vehicle, 100);
        const aimPos = target ? target.body.position : vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 0, -10));
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.6, 0.6),
            new THREE.MeshPhongMaterial({ color: 0x88ccff, emissive: 0x4488ff })
        );
        const spawnPos = new THREE.Vector3(aimPos.x, 50, aimPos.z);
        mesh.position.copy(spawnPos);
        this.scene.add(mesh);
        const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 50, 4),
            new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3 })
        );
        beam.position.set(aimPos.x, 25, aimPos.z);
        this.scene.add(beam);
        state.rvSat = { mesh, beam, velocity: new THREE.Vector3(0, -120, 0), groundPos: null, life: 5.0, hitCount: 0, shockTimer: 0 };
    }

    handleRvSat(vehicle, state, dt) {
        if (!state.rvSat) return;
        const sat = state.rvSat;
        if (!sat.groundPos) {
            sat.mesh.position.add(sat.velocity.clone().multiplyScalar(dt));
            if (sat.mesh.position.y <= 0.5) {
                sat.groundPos = sat.mesh.position.clone();
                sat.groundPos.y = 0.3;
                sat.mesh.position.copy(sat.groundPos);
                sat.mesh.scale.set(1.5, 0.3, 1.5);
                this.scene.remove(sat.beam);
                const flash = new THREE.PointLight(0x88ccff, 200, 15);
                flash.position.copy(sat.groundPos);
                this.scene.add(flash);
                setTimeout(() => this.scene.remove(flash), 300);
                sat.mesh.material.color.setHex(0x4488ff);
                sat.mesh.material.emissive.setHex(0x88ccff);
                const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
                if (carsArr) {
                    for (const car of carsArr) {
                        if (car.isDead || sat.hitCount >= 2) continue;
                        const cPos = car.chassisBody.position;
                        const dx = cPos.x - sat.groundPos.x, dy = cPos.y - sat.groundPos.y, dz = cPos.z - sat.groundPos.z;
                        if (dx*dx + dy*dy + dz*dz < 144) {
                            car.applyDamage(30);
                            sat.hitCount++;
                            car.chassisBody.velocity.y = 35;
                        }
                    }
                }
            }
        } else {
            sat.life -= dt;
            sat.shockTimer -= dt;
            if (sat.shockTimer <= 0) {
                sat.shockTimer = 1.0;
                const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
                if (carsArr) {
                    for (const car of carsArr) {
                        if (car.isDead) continue;
                        const cPos = car.chassisBody.position;
                        const dx = cPos.x - sat.groundPos.x, dy = cPos.y - sat.groundPos.y, dz = cPos.z - sat.groundPos.z;
                        if (dx*dx + dy*dy + dz*dz < 100) {
                            car.applyDamage(5);
                            car.chassisBody.velocity.y = 30;
                            const arc = new THREE.Mesh(
                                new THREE.RingGeometry(0.5, 2, 16),
                                new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
                            );
                            arc.position.copy(sat.groundPos);
                            arc.rotation.x = -Math.PI / 2;
                            this.scene.add(arc);
                            setTimeout(() => this.scene.remove(arc), 200);
                        }
                    }
                }
            }
            if (sat.life <= 0) {
                this.scene.remove(sat.mesh);
                state.rvSat = null;
            }
        }
    }

    performSportsSuperUlt(vehicle, state) {
        const start = Date.now();
        const interval = setInterval(() => {
            if (Date.now() - start > 1500) { clearInterval(interval); return; }
            const yaw = vehicle.carMesh.rotation.y; const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const pMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 }));
            pMesh.position.copy(vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 0.8, 0))); this.scene.add(pMesh);
            const flame = { mesh: pMesh, velocity: forward.clone().multiplyScalar(45).add(new THREE.Vector3((Math.random()-0.5)*3, 1 + Math.random()*2, (Math.random()-0.5)*3)), life: 2.0 };
            const updateFlame = () => {
                flame.life -= 0.02; flame.mesh.position.add(flame.velocity.clone().multiplyScalar(0.016)); flame.mesh.scale.addScalar(0.08); flame.mesh.material.opacity = flame.life * 0.5;
                if (this.game.barrels) {
                    this.game.barrels.barrels.forEach(b => { if (!b.isDead && b.body.position.distanceTo(flame.mesh.position) < 2) this.game.barrels.applyDamage(b, 2, (brl) => this.game.handleBarrelExplosion(brl)); });
                }
                if (this.game.cars) {
                    const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
                    if (carsArr) {
                        for (const car of carsArr) {
                            if (car === vehicle || car.isDead) continue;
                            if (car.chassisBody.position.distanceTo(new CANNON.Vec3(flame.mesh.position.x, flame.mesh.position.y, flame.mesh.position.z)) < 2) {
                                car.applyDamage(3);
                            }
                        }
                    }
                }
                if (flame.life <= 0) this.scene.remove(pMesh); else requestAnimationFrame(updateFlame);
            };
            updateFlame();
        }, 50);
    }

    performUFOUlt(vehicle, state) {
        if (state.ufoTractorTarget) { this.ufoSlamTarget(vehicle, state); return; }
        const target = this.getTarget(vehicle, 30); if (!target) { this.addAmmo(vehicle, 1, 'ult'); return; }
        state.ufoTractorTarget = target; state.ufoTractorTime = Date.now();
        state.ufoBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 5, 20, 16), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.2 }));
        this.scene.add(state.ufoBeam);
        const tractorLoop = setInterval(() => {
            if (!state.ufoTractorTarget || Date.now() - state.ufoTractorTime > 4000) { if (state.ufoTractorTarget) this.ufoSlamTarget(vehicle, state); clearInterval(tractorLoop); return; }
            const ufoPos = vehicle.chassisBody.position; const tPos = state.ufoTractorTarget.body.position;
            state.ufoBeam.position.set(ufoPos.x, ufoPos.y - 10, ufoPos.z);
            const pullDir = ufoPos.vsub(tPos); pullDir.y += 5; state.ufoTractorTarget.body.velocity.copy(pullDir.scale(2));
        }, 16);
    }

    ufoSlamTarget(vehicle, state) {
        if (!state.ufoTractorTarget) return;
        state.ufoTractorTarget.body.velocity.set(0, -100, 0); this.scene.remove(state.ufoBeam);
        const target = state.ufoTractorTarget; state.ufoTractorTarget = null;
        const checkImpact = setInterval(() => { if (target.body.position.y < 2) { this.game.handleBarrelExplosion({ body: target.body, type: 'explosive' }); clearInterval(checkImpact); } }, 16);
    }

    performElstangUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const range = 120;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position;
                const toCar = new THREE.Vector3(cPos.x - vehicle.chassisBody.position.x, cPos.y - vehicle.chassisBody.position.y, cPos.z - vehicle.chassisBody.position.z);
                const dist = toCar.length();
                if (dist > range) continue;
                toCar.normalize();
                if (forward.dot(toCar) > 0.7) {
                    car.applyDamage(40);
                    car.chassisBody.velocity.y = 25;
                    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, dist, 4), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 }));
                    const mid = new THREE.Vector3(vehicle.chassisBody.position.x + cPos.x, vehicle.chassisBody.position.y + cPos.y, vehicle.chassisBody.position.z + cPos.z).multiplyScalar(0.5);
                    mid.y += 0.5;
                    beam.position.copy(mid);
                    beam.lookAt(new THREE.Vector3(cPos.x, cPos.y, cPos.z));
                    beam.rotateX(Math.PI / 2);
                    this.scene.add(beam);
                    setTimeout(() => this.scene.remove(beam), 100);
                    break;
                }
            }
        }
    }

    performSchoolBusUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new CANNON.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
        vehicle.chassisBody.velocity.vadd(forward.scale(60), vehicle.chassisBody.velocity);
        const origFilter = vehicle.chassisBody.collisionFilterMask;
        vehicle.chassisBody.collisionFilterMask = 1;
        const trailMesh = vehicle.carMesh.clone();
        trailMesh.traverse(c => { if (c.isMesh) c.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }); });
        this.scene.add(trailMesh);
        let duration = 1.0;
        const tick = () => {
            duration -= 0.016;
            const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
            if (carsArr) {
                for (const car of carsArr) {
                    if (car === vehicle || car.isDead) continue;
                    if (car.chassisBody.position.distanceTo(vehicle.chassisBody.position) < 4) {
                        car.applyDamage(50);
                        const dir = car.chassisBody.position.vsub(vehicle.chassisBody.position);
                        dir.normalize();
                        car.chassisBody.applyImpulse(dir.scale(15000), new CANNON.Vec3());
                    }
                }
            }
            if (duration <= 0) { vehicle.chassisBody.collisionFilterMask = origFilter; this.scene.remove(trailMesh); }
            else { trailMesh.position.copy(vehicle.carMesh.position); trailMesh.quaternion.copy(vehicle.carMesh.quaternion); requestAnimationFrame(tick); }
        };
        tick();
    }

    performRocketCarUlt(vehicle, state) {
        if (state.rocketOrb) return;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const carSpeed = vehicle.chassisBody.velocity.length() * 2.237;
        const minSpeed = 30;
        const maxProjSpeed = 110;
        let projSpeed;
        if (carSpeed < minSpeed) projSpeed = 15;
        else projSpeed = 15 + (Math.min(carSpeed, 120) / 120) * (maxProjSpeed - 15);
        const spawnPos = new THREE.Vector3(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y + 1, vehicle.chassisBody.position.z);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0xff4400, emissive: 0xff2200 }));
        mesh.position.copy(spawnPos);
        this.scene.add(mesh);
        state.rocketOrb = { mesh, velocity: forward.clone().multiplyScalar(projSpeed), life: 6.0, carried: [] };
    }

    handleRocketOrb(vehicle, state, dt) {
        if (!state.rocketOrb) return;
        const orb = state.rocketOrb;
        orb.life -= dt;
        orb.mesh.position.add(orb.velocity.clone().multiplyScalar(dt));
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                if (orb.carried.includes(car)) continue;
                if (orb.carried.length >= 3) break;
                const cPos = car.chassisBody.position, oPos = orb.mesh.position;
                const dx = cPos.x - oPos.x, dy = cPos.y - oPos.y, dz = cPos.z - oPos.z;
                if (dx*dx + dy*dy + dz*dz < 25) {
                    orb.carried.push(car);
                    car.chassisBody.velocity.copy(new CANNON.Vec3(orb.velocity.x, orb.velocity.y, orb.velocity.z));
                    car.chassisBody.position.set(orb.mesh.position.x + (Math.random() - 0.5) * 2, orb.mesh.position.y, orb.mesh.position.z + (Math.random() - 0.5) * 2);
                }
            }
        }
        if (orb.carried.length > 0) {
            for (const car of orb.carried) {
                car.chassisBody.velocity.copy(new CANNON.Vec3(orb.velocity.x, orb.velocity.y, orb.velocity.z));
                const offset = new CANNON.Vec3(car.chassisBody.position.x - orb.mesh.position.x, 0, car.chassisBody.position.z - orb.mesh.position.z);
                const dist = offset.length(); if (dist > 3) { offset.normalize(); offset.scale(3); }
                car.chassisBody.position.set(orb.mesh.position.x + offset.x, orb.mesh.position.y, orb.mesh.position.z + offset.z);
            }
        }
        if (orb.life <= 0) {
            this.scene.remove(orb.mesh);
            state.rocketOrb = null;
        }
    }

    handleBeachPartyPulse(vehicle, state, dt) {
        if (!state.beachPartyPulse || !state.beachPartyPulse.active) return;
        const pulse = state.beachPartyPulse;
        pulse.timer -= dt;
        if (pulse.timer > 0) return;
        pulse.count++;
        const pos = vehicle.chassisBody.position;
        const radius = 20;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position;
                const dx = cPos.x - pos.x, dz = cPos.z - pos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < radius) {
                    const strength = (1 - dist / radius) * 4000;
                    const dir = new CANNON.Vec3(dx, 0, dz);
                    if (dir.length() > 0.01) dir.normalize();
                    else dir.set(0, 0, 1);
                    car.chassisBody.applyImpulse(new CANNON.Vec3(dir.x * strength, strength * 3, dir.z * strength), new CANNON.Vec3());
                }
            }
        }
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(1, radius, 48),
            new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(pos);
        this.scene.add(ring);
        let life = 0.6;
        const expand = () => {
            life -= 0.02;
            ring.scale.addScalar(0.05);
            ring.material.opacity = life * 0.4;
            if (life <= 0) { this.scene.remove(ring); return; }
            requestAnimationFrame(expand);
        };
        expand();
        if (pulse.count >= 4) pulse.active = false;
        else pulse.timer = 0.7;
    }

    performMiniUlt(vehicle, state) {
        const laserRange = 120;
        const coneAngle = Math.PI;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (!carsArr) return;
        for (const car of carsArr) {
            if (car === vehicle || car.isDead) continue;
            const yaw = vehicle.carMesh.rotation.y;
            const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const cPos = car.chassisBody.position;
            const toCar = new THREE.Vector3(cPos.x - vehicle.chassisBody.position.x, cPos.y - vehicle.chassisBody.position.y, cPos.z - vehicle.chassisBody.position.z);
            const dist = toCar.length();
            if (dist > laserRange) continue;
            toCar.normalize();
            if (forward.dot(toCar) > Math.cos(coneAngle / 2)) {
                car.applyDamage(2);
                const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, dist, 4), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 }));
                const mid = new THREE.Vector3(vehicle.chassisBody.position.x + cPos.x, vehicle.chassisBody.position.y + cPos.y, vehicle.chassisBody.position.z + cPos.z).multiplyScalar(0.5);
                beam.position.copy(mid);
                beam.lookAt(new THREE.Vector3(cPos.x, cPos.y, cPos.z));
                beam.rotateX(Math.PI / 2);
                this.scene.add(beam);
                setTimeout(() => this.scene.remove(beam), 50);
                break;
            }
        }
    }

    performHumherUlt(vehicle, state) {
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const p = this.spawnProjectile(vehicle.chassisBody.position.vadd(new CANNON.Vec3(0, 1, 0)), forward, 'cannon', vehicle);
        if (p) { p.damage = 60; p.velocity.multiplyScalar(2.5); }
    }

    performPoliceCarUlt(vehicle, state) {
        if (state.policeSpikes) { this.scene.remove(state.policeSpikes.mesh); state.policeSpikes = null; return; }
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const spawnPos = new THREE.Vector3(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y + 0.1, vehicle.chassisBody.position.z);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 1.5), new THREE.MeshPhongMaterial({ color: 0x888888 }));
        mesh.position.copy(spawnPos);
        mesh.lookAt(new THREE.Vector3(spawnPos.x + forward.x, spawnPos.y, spawnPos.z + forward.z));
        this.scene.add(mesh);
        state.policeSpikes = { mesh, hits: 0, life: 15.0 };
    }

    handlePoliceSpikes(vehicle, state, dt) {
        if (!state.policeSpikes) return;
        const spikes = state.policeSpikes;
        spikes.life -= dt;
        if (spikes.life <= 0 || spikes.hits >= 3) { this.scene.remove(spikes.mesh); state.policeSpikes = null; return; }
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (carsArr) {
            for (const car of carsArr) {
                if (car === vehicle || car.isDead) continue;
                const cPos = car.chassisBody.position, sPos = spikes.mesh.position;
                const dx = cPos.x - sPos.x, dy = cPos.y - sPos.y, dz = cPos.z - sPos.z;
                if (dx*dx + dy*dy + dz*dz < 25) {
                    if (!spikes.hitCars) spikes.hitCars = new Set();
                    if (spikes.hitCars.has(car)) continue;
                    spikes.hitCars.add(car);
                    spikes.hits++;
                    car.chassisBody.velocity.x *= 0.5;
                    car.chassisBody.velocity.z *= 0.5;
                }
            }
        }
    }

    performBladeUlt(vehicle, state) {
        if (state.bladePhase) return;
        if (state.bladeRecastTimer > 0) return;
        state.bladePhase = 'charging';
        state.bladeMiniHits = 0;
        state.bladeTarget = null;
        state.bladeChargeTimer = 0;
        state.bladeFireTimer = 0;
        state.bladeMainLaser = null;
        state.bladeCooldownTimer = 0;
    }

    handleBladeLaser(vehicle, state, dt) {
        if (!state.bladePhase) {
            if (state.bladeRecastTimer > 0) state.bladeRecastTimer -= dt;
            return;
        }

        if (state.bladePhase === 'charging') {
            state.bladeChargeTimer += dt;
            state.bladeFireTimer -= dt;

            // Fire hitscan mini laser on timer
            if (state.bladeFireTimer <= 0 && state.bladeChargeTimer < 3.0) {
                const yaw = vehicle.carMesh.rotation.y;
                const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
                const pos = new THREE.Vector3(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y + 0.8, vehicle.chassisBody.position.z);
                const range = 60;
                const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
                let target = null, bestDist = range;
                if (carsArr) {
                    for (const car of carsArr) {
                        if (car === vehicle || car.isDead) continue;
                        const toCar = new THREE.Vector3(car.chassisBody.position.x - pos.x, 0, car.chassisBody.position.z - pos.z);
                        const dist = toCar.length();
                        if (dist > bestDist) continue;
                        toCar.normalize();
                        if (forward.dot(toCar) > 0.3) {
                            target = car; bestDist = dist;
                        }
                    }
                }
                if (target) {
                    const tPos = target.chassisBody.position;
                    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, bestDist, 4), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 }));
                    const mid = new THREE.Vector3(pos.x + tPos.x, pos.y + tPos.y + 0.5, pos.z + tPos.z).multiplyScalar(0.5);
                    beam.position.copy(mid);
                    beam.lookAt(new THREE.Vector3(tPos.x, tPos.y + 0.5, tPos.z));
                    beam.rotateX(Math.PI / 2);
                    this.scene.add(beam);
                    setTimeout(() => this.scene.remove(beam), 80);
                    target.applyDamage(1);
                    if (target === state.bladeTarget) {
                        state.bladeMiniHits++;
                    } else {
                        state.bladeTarget = target;
                        state.bladeMiniHits = 1;
                    }
                    if (state.bladeMiniHits >= 3) {
                        this.spawnBladeMainLaser(vehicle, state, target);
                    }
                }
                state.bladeFireTimer = 0.8;
            }

            // Timeout: 3s without 3 hits
            if (state.bladeChargeTimer >= 3.0 && state.bladePhase === 'charging') {
                state.bladePhase = 'cooldown';
                state.bladeCooldownTimer = 5.0;
            }
        }

        else if (state.bladePhase === 'main') {
            const ml = state.bladeMainLaser;
            if (!ml) return;
            ml.life -= dt;

            if (ml.target && !ml.target.isDead) {
                const tPos = ml.target.chassisBody.position;
                const current = new THREE.Vector3(ml.mesh.position.x, 15, ml.mesh.position.z);
                const targetPos = new THREE.Vector3(tPos.x, 15, tPos.z);
                const diff = targetPos.clone().sub(current);
                const dist = diff.length();
                if (dist > 0.5) {
                    const maxMove = 2.24 * dt; // 5 mph
                    const move = Math.min(dist, maxMove);
                    diff.normalize().multiplyScalar(move);
                    current.add(diff);
                    ml.mesh.position.copy(current);
                }

                ml.damageTimer -= dt;
                if (ml.damageTimer <= 0) {
                    // Consume ammo on first damage tick only
                    if (!ml.ammoConsumed) {
                        const wState = state.weapons.get('ult');
                        if (wState && wState.ammo > 0) {
                            wState.ammo--;
                            wState.lastFireTime = Date.now();
                            ml.ammoConsumed = true;
                        } else {
                            // No ammo, can't deal damage
                            ml.damageTimer = 0.8;
                            return;
                        }
                    }
                    ml.target.applyDamage(6);
                    ml.target.chassisBody.velocity.y = 8;
                    ml.damageTimer = 0.8;

                    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.5, 25, 8), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 }));
                    col.position.set(current.x, 12, current.z);
                    this.scene.add(col);
                    setTimeout(() => this.scene.remove(col), 100);
                }
            }

            if (ml.beamMesh) {
                const beamPos = ml.target && !ml.target.isDead ? ml.target.chassisBody.position : ml.mesh.position;
                ml.beamMesh.position.set(beamPos.x, 15, beamPos.z);
                ml.beamMesh.scale.y = Math.max(0.1, ml.life / ml.maxLife);
            }

            if (ml.life <= 0) {
                this.scene.remove(ml.mesh);
                if (ml.beamMesh) this.scene.remove(ml.beamMesh);
                state.bladeMainLaser = null;
                state.bladePhase = null;
                state.bladeRecastTimer = 2.0;
            }
        }

        else if (state.bladePhase === 'cooldown') {
            state.bladeCooldownTimer -= dt;
            if (state.bladeCooldownTimer <= 0) {
                state.bladePhase = null;
                state.bladeRecastTimer = 2.0;
            }
        }
    }

    spawnBladeMainLaser(vehicle, state, target) {
        const tPos = target.chassisBody.position;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2, 30, 8), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4 }));
        beam.position.set(tPos.x, 15, tPos.z);
        this.scene.add(beam);

        const life = Math.min(state.bladeMiniHits * 1.5, 8);
        state.bladeMainLaser = {
            mesh: beam,
            beamMesh: beam,
            target,
            life,
            maxLife: life,
            damageTimer: 0.8
        };
        state.bladePhase = 'main';
    }

    perform4DoorUlt(vehicle, state) {
        if (state.sedanTurrets) return;
        state.sedanTurrets = {
            life: 5.0,
            fireTimer: 0,
            leftHitCount: 0,
            rightHitCount: 0
        };
    }

    handle4DoorTurrets(vehicle, state, dt) {
        if (!state.sedanTurrets) return;
        const turret = state.sedanTurrets;
        turret.life -= dt;
        turret.fireTimer -= dt;
        if (turret.life <= 0) { state.sedanTurrets = null; return; }
        if (turret.fireTimer > 0) return;
        turret.fireTimer = 0.5;
        const carsArr = typeof this.game.cars === 'function' ? this.game.cars() : this.game.cars;
        if (!carsArr) return;
        const yaw = vehicle.carMesh.rotation.y;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const range = 50;
        const leftCars = [], rightCars = [];
        for (const car of carsArr) {
            if (car === vehicle || car.isDead) continue;
            const cPos = car.chassisBody.position;
            const toCar = new THREE.Vector3(cPos.x - vehicle.chassisBody.position.x, 0, cPos.z - vehicle.chassisBody.position.z);
            const dist = toCar.length();
            if (dist > range) continue;
            toCar.normalize();
            if (right.dot(toCar) > 0) rightCars.push(car);
            else leftCars.push(car);
        }
        const fireBullet = (targets, side) => {
            if (targets.length === 0) return;
            const hitCount = side === 'left' ? turret.leftHitCount : turret.rightHitCount;
            if (hitCount >= 4) return;
            const target = targets[Math.floor(Math.random() * targets.length)];
            if (side === 'left') turret.leftHitCount++;
            else turret.rightHitCount++;
            const tPos = target.chassisBody.position;
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 30, 4), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 }));
            beam.position.set(vehicle.chassisBody.position.x, vehicle.chassisBody.position.y + 0.5, vehicle.chassisBody.position.z);
            beam.lookAt(new THREE.Vector3(tPos.x, tPos.y, tPos.z));
            beam.rotateX(Math.PI / 2);
            this.scene.add(beam);
            setTimeout(() => this.scene.remove(beam), 100);
            target.applyDamage(12);
        };
        if (leftCars.length > 0) fireBullet(leftCars, 'left');
        if (rightCars.length > 0) fireBullet(rightCars, 'right');
    }

    performFinalTankUlt(vehicle, state) {
        const ults = ['performImpalaUlt', 'performServerVanUlt', 'performF2Ult', 'performHumherUlt', 'performMiniUlt', 'performSchoolBusUlt', 'performElstangUlt', 'performRocketCarUlt', 'performLowriderUlt', 'performGrapplerUlt', 'performRedrumUlt', 'performPoliceCarUlt', 'performSemiUlt'];
        const pick = ults[Math.floor(Math.random() * ults.length)];
        this[pick](vehicle, state);
    }
}
