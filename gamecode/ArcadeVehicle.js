import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CONFIG } from './Config.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

const _modelCache = new Map();

export function getCarModel(carConfig, onReady) {
    const key = (carConfig.gltfFile || carConfig.objFile || carConfig.fbxFile);
    if (!key) { onReady(null); return; }
    const cached = _modelCache.get(key);
    if (cached) { onReady(cached.clone()); return; }
    const file = carConfig.gltfFile || carConfig.objFile || carConfig.fbxFile;
    const path = carConfig.gltfPath || carConfig.objPath || carConfig.fbxPath;
    const modelPath = path + file;
    const ext = file.split('.').pop().toLowerCase();
    const onLoad = (object) => {
        const model = object.scene || object;
        _modelCache.set(key, model);
        onReady(model.clone());
    };
    if (ext === 'glb' || ext === 'gltf') { const l = new GLTFLoader(); l.setDRACOLoader(dracoLoader); l.load(modelPath, onLoad); }
    else if (ext === 'obj') {
        const loadObj = (materials) => {
            const l = new OBJLoader();
            if (materials) l.setMaterials(materials);
            l.load(modelPath, onLoad);
        };
        const mtlFile = carConfig.mtlFile;
        if (mtlFile) {
            const ml = new MTLLoader();
            ml.setPath(path);
            ml.load(mtlFile, (materials) => {
                materials.preload();
                loadObj(materials);
            }, undefined, () => loadObj(null));
        } else {
            loadObj(null);
        }
    }
    else if (ext === 'fbx') { new FBXLoader().load(modelPath, onLoad); }
}

export class ArcadeVehicle {
    constructor(scene, world, options = {}) {
        this.scene = scene;
        this.world = world;
        
        this.carType = options.carType || '35-impala';
        const carConfig = CONFIG.CARS[this.carType] || CONFIG.CARS['35-impala'];
        this.carConfig = carConfig; // EXPOSE CONFIG
        
        this.mass = options.mass || carConfig.mass || 1200;
        this.position = options.position || new CANNON.Vec3(0, 5, 0);
        this.collisionFilterGroup = options.collisionFilterGroup || 1;
        this.collisionFilterMask = options.collisionFilterMask || -1;
        this.material = options.material || new CANNON.Material();
        
        this.hoverMode = carConfig.alwaysHover || false;
        this.alwaysHover = carConfig.alwaysHover || false;
        this.hoverLow = false;
        this.hoverLowHeight = 1.4;
        this.targetHeight = 1.2; 
        this.hoverHeight = carConfig.hoverHeight || 4.0;
        this.springStrength = 150; 
        this.springDamping = 30;
        this.throttle = 0;
        this.currentGear = 0;
        this.isBraking = false;
        this.isDrifting = false;
        this.driftAngle = 0;
        this.boostFactor = 1.0;
        this.healthMax = carConfig.stats?.hp ?? 100;
        this.health = this.healthMax;
        this.isDead = false;
        this.isDying = false;
        this.deathDelayTimer = 0;
        this.fireTimer = 0;
        this.slowTimer = 0;
        this.toxicTimer = 0;
        this.oilTimer = 0;
        this.slowFactor = 1.0;
        this.isFrozen = false;
        this.fireParticles = [];
        this.toxicParticles = [];
        this.smokeParticles = [];
        this.whiteSmokeParticles = [];

        // Shared Particle Resources
        this.particleGeo = new THREE.SphereGeometry(0.5, 8, 8);
        this.particleMats = {
            smoke: new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6 }),
            whiteSmoke: new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.5 }),
            toxic: new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.8 }),
            fireA: new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 }),
            fireB: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 })
        };

        this.iceMaterial = new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.8, shininess: 100 });
        this.deadMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.8 });
        
        this.initPhysics();
        this.initGraphics(carConfig);
    }

    initPhysics() {
        // Match the purple box: 1.8w, 1.4h, 6.4l (Cannon Box uses half-extents)
        const boxShape = new CANNON.Box(new CANNON.Vec3(0.9, 0.7, 3.2)); 
        this.chassisBody = new CANNON.Body({
            mass: this.mass,
            position: this.position,
            linearDamping: 0.1,
            angularDamping: 0.99, 
            material: this.material,
            collisionFilterGroup: this.collisionFilterGroup,
            collisionFilterMask: this.collisionFilterMask
        });
        this.chassisBody.addShape(boxShape); 
        this.world.addBody(this.chassisBody);
        this.chassisBody.fixedRotation = true;
        this.chassisBody.updateMassProperties();
        this.visualRayOffsets = [
            new THREE.Vector3(1.1, 0, 1.8),  
            new THREE.Vector3(-1.1, 0, 1.8), 
            new THREE.Vector3(1.1, 0, -1.8), 
            new THREE.Vector3(-1.1, 0, -1.8) 
        ];
        this.visualHeights = [0, 0, 0, 0];
        this.groundHits = [false, false, false, false];
        this.steeringTilt = 0; 
        this.steeringYawOffset = 0;
        this.leanLerp = 0;
        this.leanDir = 0;
        this.isAirFlipping = false;
        this.airFlipTimer = 0;
        this.airFlipDir = 0;
        this.airFlipType = 'roll'; 
        this.visualAirPitch = 0; 
        
        this.hydraulics = {
            lift: 0,
            pitch: 0,
            roll: 0,
            targetLift: 0,
            targetPitch: 0,
            targetRoll: 0,
            velocity: { lift: 0, pitch: 0, roll: 0 }
        };
    }

    initGraphics(carConfig) {
        const geo = new THREE.BoxGeometry(2, 0.8, 4);
        const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
        this.carMesh = new THREE.Mesh(geo, mat);
        this.carMesh.rotation.order = 'YXZ'; 
        this.scene.add(this.carMesh);
        this.initVisuals();
        
        const file = carConfig.gltfFile || carConfig.objFile || carConfig.fbxFile;
        const path = carConfig.gltfPath || carConfig.objPath || carConfig.fbxPath;
        
        if (file && path) {
            getCarModel(carConfig, (model) => {
                if (!model) return;
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const scale = (4 / Math.max(size.x, size.y, size.z)) * (carConfig.scale || 1.5);
                model.scale.set(scale, scale, scale);
                model.rotation.y = carConfig.rotationOffset !== undefined ? carConfig.rotationOffset : Math.PI; 
                model.position.y = carConfig.offset ? carConfig.offset.y : -0.4;     
                this.carMesh.add(model);
                this.carMesh.material.visible = false; 
            });
        }
    }

    static preloadModels(carTypes) {
        const seen = new Set();
        for (const type of carTypes) {
            const cfg = CONFIG.CARS[type];
            if (!cfg || seen.has(type)) continue;
            seen.add(type);
            const file = cfg.gltfFile || cfg.objFile || cfg.fbxFile;
            const path = cfg.gltfPath || cfg.objPath || cfg.fbxPath;
            if (file && path) getCarModel(cfg, () => {});
        }
    }

    initVisuals() {
        const hitboxGeo = new THREE.BoxGeometry(1.8, 1.4, 6.4);
        const hitboxMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.3, wireframe: true });
        this.hitboxHelper = new THREE.Mesh(hitboxGeo, hitboxMat);
        this.scene.add(this.hitboxHelper);
        
        this.visualDots = [];
        for (let i = 0; i < 4; i++) {
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
            this.scene.add(dot);
            this.visualDots.push(dot);
        }
        this.debugPoint = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        this.scene.add(this.debugPoint);
    }

    applyInputs(throttle, isBraking) {
        this.throttle = throttle;
        this.isBraking = isBraking;
    }

    jump(power) {
        this.chassisBody.velocity.y = power;
    }

    toggleHover() {
        if (!this.hoverMode) return;
        this.hoverLow = !this.hoverLow;
    }

    performAirFlip(direction, type = 'roll') {
        if (this.isAirFlipping) return;
        this.isAirFlipping = true;
        this.airFlipTimer = 0;
        this.airFlipDir = direction;
        this.airFlipType = type;
        
        if (type === 'roll') {
            const right = new CANNON.Vec3().copy(this.chassisBody.quaternion.vmult(new CANNON.Vec3(1, 0, 0)));
            this.chassisBody.velocity.vadd(right.scale(direction * 25), this.chassisBody.velocity);
        } else {
            const forward = new CANNON.Vec3().copy(this.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 0, -1)));
            this.chassisBody.velocity.vadd(forward.scale(direction * 25), this.chassisBody.velocity);
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.health = 0;
        
        // Make it a heavy, high-friction object that can be pushed
        this.chassisBody.type = CANNON.Body.DYNAMIC; 
        this.chassisBody.fixedRotation = false; // Allow it to tumble if pushed
        this.chassisBody.updateMassProperties();
        
        // High damping prevents the "massive spinning" but allows external force (ramming)
        this.chassisBody.linearDamping = 0.95;
        this.chassisBody.angularDamping = 0.95;
        
        // Kill existing momentum so it starts from rest
        this.chassisBody.velocity.set(0, 0, 0);
        this.chassisBody.angularVelocity.set(0, 0, 0);
        
        this.carMesh.traverse(c => {
            if (c.isMesh && c !== this.carMesh) {
                c.userData.origMat = c.material;
                c.material = this.deadMaterial;
            }
        });
        
        const flash = new THREE.PointLight(0xffaa00, 100, 30);
        flash.position.copy(this.chassisBody.position);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 150);
    }

    applyDamage(amount) {
        if (this.isDead || this.isDying) return;
        this.health -= amount;

        // Force ground mode if taking damage while hovering (unless alwaysHover car like UFO)
        if (this.hoverMode && !this.alwaysHover) {
            this.hoverMode = false;
            this.hoverLow = false;
        }

        if (this.health <= 0) {
            this.health = 0;
            this.isDying = true;
            this.deathDelayTimer = 3.0;
        }
    }

    update(dt, virtualHeading, steerInput = 0, leanActive = false) {
        this.updateParticles(dt);

        if (this.isDead) {
            // Just sync visual to physics and return. 
            // Physics are handled by the high damping set in die().
            this.carMesh.position.copy(this.chassisBody.position);
            this.carMesh.quaternion.copy(this.chassisBody.quaternion);
            this.hitboxHelper.position.copy(this.carMesh.position);
            this.hitboxHelper.quaternion.copy(this.carMesh.quaternion);

            if (Math.random() > 0.3) {
                const p = new THREE.Mesh(this.particleGeo, this.particleMats.smoke);
                p.position.copy(this.chassisBody.position).add(new THREE.Vector3((Math.random()-0.5)*1.5, 0.5, (Math.random()-0.5)*1.5));
                p.scale.setScalar(0.6 + Math.random() * 0.8);
                this.scene.add(p);
                this.smokeParticles.push({ mesh: p, life: 1.5, vy: 0.1 + Math.random() * 0.1 });
            }
            return;
        }

        if (this.isDying) {
            this.deathDelayTimer -= dt;
            if (Math.random() > 0.2) {
                const p = new THREE.Mesh(this.particleGeo, this.particleMats.whiteSmoke);
                p.position.copy(this.chassisBody.position).add(new THREE.Vector3((Math.random()-0.5)*1.2, 0.4, (Math.random()-0.5)*1.2));
                p.scale.setScalar(0.4 + Math.random() * 0.6);
                this.scene.add(p);
                this.whiteSmokeParticles.push({ mesh: p, life: 1.0, vy: 0.08 + Math.random() * 0.08 });
            }
            if (this.deathDelayTimer <= 0) {
                this.isDying = false;
                this.die();
            }
        }

        if (this.slowTimer > 0) {
            this.slowTimer -= dt;
            this.slowFactor = 0.5;
            if (!this.isFrozen) {
                this.isFrozen = true;
                this.carMesh.traverse(c => { if (c.isMesh) { c.userData.orig = c.material; c.material = this.iceMaterial; } });
            }
        }
        
        if (this.slowTimer <= 0) {
            this.slowTimer = 0;
            if (this.isFrozen) {
                this.isFrozen = false;
                this.carMesh.traverse(c => { if (c.isMesh && c.userData.orig) c.material = c.userData.orig; });
            }
            if (this.oilTimer <= 0) this.slowFactor = 1.0; 
        }

        if (this.oilTimer > 0) {
            this.oilTimer -= dt;
            this.slowFactor = Math.min(this.slowFactor, 0.4);
            if (this.oilTimer <= 0) {
                this.oilTimer = 0;
                if (this.slowTimer <= 0) this.slowFactor = 1.0;
            }
        }

        if (this.toxicTimer > 0) {
            this.toxicTimer -= dt;
            this.applyDamage((3.33 / 5) * dt);
            if (Math.random() > 0.5) {
                const p = new THREE.Mesh(this.particleGeo, this.particleMats.toxic);
                p.position.copy(this.chassisBody.position).add(new THREE.Vector3((Math.random()-0.5)*2, 0.2, (Math.random()-0.5)*4));
                p.scale.setScalar(0.2 + Math.random() * 0.2);
                this.scene.add(p);
                this.toxicParticles.push({ mesh: p, life: 1.0, vy: 0.05 + Math.random() * 0.05 });
            }
            if (this.toxicTimer <= 0) this.toxicTimer = 0;
        }

        if (this.fireTimer > 0) {
            this.fireTimer -= dt;
            this.applyDamage(3.33 * dt);
            if (Math.random() > 0.4) {
                const mat = Math.random() > 0.3 ? this.particleMats.fireA : this.particleMats.fireB;
                const f = new THREE.Mesh(this.particleGeo, mat);
                f.position.copy(this.chassisBody.position).add(new THREE.Vector3((Math.random()-0.5)*1.5, 0.2, (Math.random()-0.5)*3.0));
                f.scale.setScalar(0.4 + Math.random() * 0.4);
                this.scene.add(f);
                this.fireParticles.push({ mesh: f, life: 1.0, vy: 0.1 + Math.random() * 0.1, vx: (Math.random() - 0.5) * 0.05 });
            }
            if (this.fireTimer <= 0) this.fireTimer = 0;
        }

        this.updateParticles(dt);

        if (this.isDead) {
            this.carMesh.position.copy(this.chassisBody.position);
            this.carMesh.quaternion.copy(this.chassisBody.quaternion);
            this.hitboxHelper.position.copy(this.carMesh.position);
            this.hitboxHelper.quaternion.copy(this.carMesh.quaternion);
            return;
        }

        const targetQuat = new CANNON.Quaternion();
        targetQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), virtualHeading);
        this.chassisBody.quaternion.slerp(targetQuat, Math.min(1.0, 15 * dt), this.chassisBody.quaternion);

        this.applySuspension();
        this.applyMovement(dt, virtualHeading);
        this.applyExtraGravity();
        this.updateVisualsAndHitbox(dt, virtualHeading, steerInput, leanActive);
        }
    updateParticles(dt) {
        for (let i = this.fireParticles.length - 1; i >= 0; i--) {
            const fp = this.fireParticles[i];
            fp.life -= 0.03;
            fp.mesh.position.y += fp.vy;
            fp.mesh.position.x += fp.vx;
            fp.mesh.scale.multiplyScalar(0.95);
            fp.mesh.material.opacity = fp.life;
            if (fp.life <= 0) { this.scene.remove(fp.mesh); this.fireParticles.splice(i, 1); }
        }
        for (let i = this.toxicParticles.length - 1; i >= 0; i--) {
            const tp = this.toxicParticles[i];
            tp.life -= 0.02;
            tp.mesh.position.y += tp.vy;
            tp.mesh.scale.multiplyScalar(0.97);
            tp.mesh.material.opacity = tp.life;
            if (tp.life <= 0) { this.scene.remove(tp.mesh); this.toxicParticles.splice(i, 1); }
        }
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const sp = this.smokeParticles[i];
            sp.life -= 0.015;
            sp.mesh.position.y += sp.vy;
            sp.mesh.scale.multiplyScalar(1.02);
            sp.mesh.material.opacity = sp.life;
            if (sp.life <= 0) { this.scene.remove(sp.mesh); this.smokeParticles.splice(i, 1); }
        }
        for (let i = this.whiteSmokeParticles.length - 1; i >= 0; i--) {
            const wsp = this.whiteSmokeParticles[i];
            wsp.life -= 0.02;
            wsp.mesh.position.y += wsp.vy;
            wsp.mesh.scale.multiplyScalar(1.01);
            wsp.mesh.material.opacity = wsp.life;
            if (wsp.life <= 0) { this.scene.remove(wsp.mesh); this.whiteSmokeParticles.splice(i, 1); }
        }
    }

    applySuspension() {
        const targetH = this.hoverMode ? (this.hoverLow ? this.hoverLowHeight : this.hoverHeight) : this.targetHeight;
        const start = this.chassisBody.position;
        const result = new CANNON.RaycastResult();
        this.world.raycastClosest(start, start.vadd(new CANNON.Vec3(0, -20, 0)), { collisionFilterMask: ~this.collisionFilterGroup }, result);
        this.lastGroundDist = result.hasHit ? result.distance : 999; 
        
        if (result.hasHit) {
            const distance = result.distance;
            const velocity = this.chassisBody.velocity.y;
            if (distance <= targetH || this.hoverMode) {
                const error = targetH - distance;
                const strength = this.hoverMode ? this.springStrength : 250;
                const damping = this.hoverMode ? this.springDamping : 15;
                const liftForce = (this.mass * 9.82) + (error * strength * this.mass) - (velocity * damping * this.mass);
                this.chassisBody.applyForce(new CANNON.Vec3(0, Math.max(0, liftForce), 0), start);
            }
        }
    }

    isReadyToJump() {
        // If in hover mode, must be at or below effective hover height (plus a tiny buffer)
        if (this.hoverMode) {
            const effH = this.hoverLow ? this.hoverLowHeight : this.hoverHeight;
            return this.lastGroundDist <= (effH + 0.5);
        }
        // If on ground, must be grounded
        return this.isTrulyGrounded;
    }

    applyMovement(dt, virtualHeading) {
        const driveForce = 25000 * this.boostFactor * this.slowFactor;
        const maxSpeed = 120 * this.boostFactor * this.slowFactor;
        const forward = new CANNON.Vec3(-Math.sin(virtualHeading), 0, -Math.cos(virtualHeading));
        if (Math.abs(this.throttle) > 0.01) {
            this.chassisBody.applyForce(forward.scale(this.throttle * driveForce), this.chassisBody.position);
        }
        const velocity = this.chassisBody.velocity;
        const forwardVelMag = velocity.dot(forward);
        const lateralVel = velocity.vsub(forward.scale(forwardVelMag));
        const grip = this.isDrifting ? 0.5 : 2.0;
        lateralVel.scale(-this.mass * grip, lateralVel);
        this.chassisBody.applyForce(lateralVel, this.chassisBody.position);
        if (this.isBraking) {
            this.chassisBody.applyForce(velocity.scale(-this.mass * 3), this.chassisBody.position);
        }
        if (Math.abs(this.throttle) < 0.01 && !this.isBraking && !this.hoverMode) {
            const damping = Math.pow(0.98, dt * 60); 
            this.chassisBody.velocity.x *= damping;
            this.chassisBody.velocity.z *= damping;
        }
        if (velocity.length() > maxSpeed) {
            velocity.scale(maxSpeed / velocity.length(), this.chassisBody.velocity);
        }
    }

    applyExtraGravity() {
        const extraGravityMag = this.hoverMode ? 5 : 40; 
        this.chassisBody.applyForce(new CANNON.Vec3(0, -this.mass * extraGravityMag, 0), this.chassisBody.position);
    }

    updateVisualsAndHitbox(dt, virtualHeading, steerInput, leanActive) {
        const pos = this.chassisBody.position;
        const baseYaw = virtualHeading + this.driftAngle;
        let targetYawOffset = 0;
        if (!this.isDrifting && !leanActive) targetYawOffset = steerInput * 0.25; 
        this.steeringYawOffset += (targetYawOffset - this.steeringYawOffset) * 8 * dt;
        this.carMesh.rotation.y = baseYaw + this.steeringYawOffset;

        const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.carMesh.rotation.y, 0));
        const rayMask = ~this.collisionFilterGroup;
        this.visualRayOffsets.forEach((offset, i) => {
            const worldOffset = offset.clone().applyQuaternion(quat);
            const start = new CANNON.Vec3(pos.x + worldOffset.x, pos.y + 5.0, pos.z + worldOffset.z);
            const end = new CANNON.Vec3(start.x, start.y - 15, start.z);
            const result = new CANNON.RaycastResult();
            this.world.raycastClosest(start, end, { skipBackfaces: true, collisionFilterMask: rayMask }, result);
            if (result.hasHit && result.hitNormalWorld.y > 0.7 && (!(!this.hoverMode && result.hitPointWorld.y > pos.y))) {
                const targetH = result.hitPointWorld.y;
                if (this.visualHeights[i] === 0) this.visualHeights[i] = targetH;
                this.visualHeights[i] += (targetH - this.visualHeights[i]) * 15 * dt;
                this.visualDots[i].position.set(start.x, this.visualHeights[i], start.z);
                this.visualDots[i].visible = true;
                this.groundHits[i] = true;
            } else {
                this.visualHeights[i] += (pos.y - 1.2 - this.visualHeights[i]) * 5 * dt;
                this.visualDots[i].visible = false;
                this.groundHits[i] = false;
            }
        });

        const avgH = (this.visualHeights[0] + this.visualHeights[1] + this.visualHeights[2] + this.visualHeights[3]) / 4;
        const frontH = (this.visualHeights[0] + this.visualHeights[1]) / 2;
        const backH = (this.visualHeights[2] + this.visualHeights[3]) / 2;
        const leftH = (this.visualHeights[1] + this.visualHeights[3]) / 2;
        const rightH = (this.visualHeights[0] + this.visualHeights[2]) / 2;
        const terrainPitch = Math.atan2(backH - frontH, 3.6); 
        const terrainRoll = Math.atan2(rightH - leftH, 2.2); 

        if (leanActive && !this.hoverMode && Math.abs(steerInput) > 0.1) {
            this.leanDir = Math.sign(steerInput);
            this.leanLerp += (1.0 - this.leanLerp) * 6 * dt;
        } else {
            this.leanLerp += (0.0 - this.leanLerp) * 8 * dt;
        }

        const targetTilt = (-steerInput * (this.isDrifting ? 0.18 : 0.1) * (1.0 - this.leanLerp)) + (-this.leanDir * (Math.PI * 0.35) * this.leanLerp);
        let targetAirPitch = 0;
        let targetAirRoll = 0;
        if (!this.isTrulyGrounded && !this.hoverMode && !leanActive) {
            targetAirRoll = -steerInput * 0.4;
            targetAirPitch = (this.airPitchInput || 0) * 0.3;
        }
        this.steeringTilt += (targetTilt + targetAirRoll - this.steeringTilt) * 8 * dt;
        this.visualAirPitch += (targetAirPitch - this.visualAirPitch) * 8 * dt;

        let flipRoll = 0;
        let flipPitch = 0;
        if (this.isAirFlipping) {
            this.airFlipTimer += dt * 2.5; 
            if (this.airFlipTimer >= 1.0) { this.isAirFlipping = false; this.airFlipTimer = 0; }
            else {
                const angle = -this.airFlipDir * Math.PI * 2 * this.airFlipTimer;
                if (this.airFlipType === 'roll') flipRoll = angle; else flipPitch = angle;
            }
        }

        const lateralOffset = this.leanDir * 0.8 * this.leanLerp; 
        
        // SMOOTH HYDRAULICS WITH BOUNCE ("shhheeeeoooo, shtz")
        const h = this.hydraulics;
        
        // Asymmetric logic: Faster going UP/EXTENDING, normal going DOWN/RETURNING
        const getSpring = (cur, target) => {
            // If we are moving further from 0 (extending), use higher stiffness
            return Math.abs(target) > Math.abs(cur) ? 260 : 180;
        };
        const damper = 14;  // Damping
        
        // LIFT spring physics
        const liftErr = h.targetLift - h.lift;
        h.velocity.lift += (liftErr * getSpring(h.lift, h.targetLift) - h.velocity.lift * damper) * dt;
        h.lift += h.velocity.lift * dt;
        
        // PITCH spring physics
        const pitchErr = h.targetPitch - h.pitch;
        h.velocity.pitch += (pitchErr * getSpring(h.pitch, h.targetPitch) - h.velocity.pitch * damper) * dt;
        h.pitch += h.velocity.pitch * dt;
        
        // ROLL spring physics
        const rollErr = h.targetRoll - h.roll;
        h.velocity.roll += (rollErr * getSpring(h.roll, h.targetRoll) - h.velocity.roll * damper) * dt;
        h.roll += h.velocity.roll * dt;

        const hydraulicLift = h.lift * 0.8;
        const targetY = this.hoverMode ? pos.y - 0.4 : Math.max(pos.y - 0.4, avgH + 0.4);
        const visualPos = new THREE.Vector3(pos.x, targetY + hydraulicLift, pos.z);
        visualPos.add(new THREE.Vector3(1, 0, 0).applyQuaternion(quat).multiplyScalar(lateralOffset));
        visualPos.y += this.leanLerp * 0.5;

        this.carMesh.position.copy(visualPos);
        this.carMesh.rotation.x = (terrainPitch + flipPitch + this.visualAirPitch + (h.pitch * 0.35)) * (this.hoverMode ? 0.1 : 1.0);
        this.carMesh.rotation.z = (terrainRoll + this.steeringTilt + flipRoll + (h.roll * 0.35)) * (this.hoverMode ? 0.1 : 1.0);

        this.debugPoint.position.set(pos.x, pos.y, pos.z);
        this.hitboxHelper.position.set(visualPos.x, visualPos.y + 0.5, visualPos.z);
        this.hitboxHelper.quaternion.copy(this.carMesh.quaternion);
    }

    getStableCenter() {
        return new THREE.Vector3(this.chassisBody.position.x, this.chassisBody.position.y, this.chassisBody.position.z);
    }

    get isTrulyGrounded() {
        const start = this.chassisBody.position;
        const result = new CANNON.RaycastResult();
        this.world.raycastClosest(start, start.vadd(new CANNON.Vec3(0, -2.0, 0)), { collisionFilterMask: ~this.collisionFilterGroup }, result);
        return result.hasHit;
    }
}
