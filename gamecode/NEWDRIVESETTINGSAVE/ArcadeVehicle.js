import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

export class ArcadeVehicle {
    constructor(scene, world, options = {}) {
        this.scene = scene;
        this.world = world;
        this.mass = options.mass || 1200;
        this.position = options.position || new CANNON.Vec3(0, 5, 0);
        this.collisionFilterGroup = options.collisionFilterGroup || 1;
        this.collisionFilterMask = options.collisionFilterMask || -1;
        this.material = options.material || new CANNON.Material();
        this.hoverMode = false;
        this.targetHeight = 1.2; 
        this.hoverHeight = 4.0;
        this.springStrength = 150; 
        this.springDamping = 30;
        this.throttle = 0;
        this.isBraking = false;
        this.isDrifting = false;
        this.driftAngle = 0;
        this.boostFactor = 1.0;
        this.initPhysics();
        this.initGraphics();
    }

    initPhysics() {
        // RESTORED STABLE SPHERE: 1.0m radius for stability.
        const sphereShape = new CANNON.Sphere(1.0); 
        this.chassisBody = new CANNON.Body({
            mass: this.mass,
            position: this.position,
            linearDamping: 0.1,
            angularDamping: 0.99, 
            material: this.material,
            collisionFilterGroup: this.collisionFilterGroup,
            collisionFilterMask: this.collisionFilterMask
        });
        this.chassisBody.addShape(sphereShape); 
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
    }

    initGraphics() {
        const geo = new THREE.BoxGeometry(2, 0.8, 4);
        const mat = new THREE.MeshPhongMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
        this.carMesh = new THREE.Mesh(geo, mat);
        this.carMesh.rotation.order = 'YXZ'; 
        this.scene.add(this.carMesh);
        const hitboxGeo = new THREE.BoxGeometry(1.8, 1.4, 6.4);
        const hitboxMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.3, wireframe: true });
        this.hitboxHelper = new THREE.Mesh(hitboxGeo, hitboxMat);
        this.scene.add(this.hitboxHelper);
        const loader = new GLTFLoader();
        loader.load('objects/cars/35-impala/scene.gltf', (gltf) => {
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const scale = 4 / Math.max(size.x, size.y, size.z);
            model.scale.set(scale * 1.5, scale * 1.5, scale * 1.5);
            model.rotation.y = Math.PI; 
            model.position.y = -0.4;     
            this.carMesh.add(model);
            this.carMesh.material.visible = false; 
        });
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
        this.hoverMode = !this.hoverMode;
    }

    update(dt, virtualHeading, steerInput = 0, leanActive = false) {
        // SMOOTHED ROTATION: 15.0 speed for responsive but non-instant turning.
        const targetQuat = new CANNON.Quaternion();
        targetQuat.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), virtualHeading);
        this.chassisBody.quaternion.slerp(targetQuat, Math.min(1.0, 15 * dt), this.chassisBody.quaternion);

        this.applySuspension();
        this.applyMovement(dt, virtualHeading);
        this.applyExtraGravity();
        this.updateVisualsAndHitbox(dt, virtualHeading, steerInput, leanActive);
    }

    applySuspension() {
        const targetH = this.hoverMode ? this.hoverHeight : this.targetHeight;
        const start = this.chassisBody.position;
        const result = new CANNON.RaycastResult();
        this.world.raycastClosest(start, start.vadd(new CANNON.Vec3(0, -10, 0)), { collisionFilterMask: ~this.collisionFilterGroup }, result);
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

    applyMovement(dt, virtualHeading) {
        const driveForce = 25000 * this.boostFactor;
        const maxSpeed = 120 * this.boostFactor;
        const forward = new CANNON.Vec3(-Math.sin(virtualHeading), 0, -Math.cos(virtualHeading));
        if (Math.abs(this.throttle) > 0.01) {
            this.chassisBody.applyForce(forward.scale(this.throttle * driveForce), this.chassisBody.position);
        }
        // ORIGINAL LATERAL DAMPING (No Redirection)
        const velocity = this.chassisBody.velocity;
        const forwardVelMag = velocity.dot(forward);
        const lateralVel = velocity.vsub(forward.scale(forwardVelMag));
        const grip = this.isDrifting ? 0.3 : 2.0;
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
        // REMOVED SNAP: Always use driftAngle (it decays naturally in the game loop)
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
        this.steeringTilt += (targetTilt - this.steeringTilt) * 10 * dt;

        const lateralOffset = this.leanDir * 0.8 * this.leanLerp; 
        const targetY = this.hoverMode ? pos.y - 0.4 : Math.max(pos.y - 0.4, avgH + 0.4);
        const visualPos = new THREE.Vector3(pos.x, targetY, pos.z);
        visualPos.add(new THREE.Vector3(1, 0, 0).applyQuaternion(quat).multiplyScalar(lateralOffset));
        visualPos.y += this.leanLerp * 0.5;

        this.carMesh.position.copy(visualPos);
        this.carMesh.rotation.x = terrainPitch * (this.hoverMode ? 0.1 : 1.0);
        this.carMesh.rotation.z = (terrainRoll + this.steeringTilt) * (this.hoverMode ? 0.1 : 1.0);

        this.debugPoint.position.set(pos.x, pos.y, pos.z);
        this.hitboxHelper.position.set(visualPos.x, visualPos.y + 0.5, visualPos.z);
        this.hitboxHelper.quaternion.copy(this.carMesh.quaternion);
    }

    getStableCenter() {
        return new THREE.Vector3(this.chassisBody.position.x, this.chassisBody.position.y, this.chassisBody.position.z);
    }
}