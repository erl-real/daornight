import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const GROUPS = { GROUND: 1, OBSTACLE: 2, BALL: 4, PLAYER: 8 };

export class RoadliteEnemy {
    constructor(scene, world, position, slickMat, type = 'normal') {
        this.scene = scene;
        this.world = world;
        this.isDead = false;
        this.type = type;
        this.contactTimer = 0;
        this.contactCooldown = 0.5;

        if (type === 'big') {
            this.hp = 80;
            this.hpMax = 80;
            this.speedMult = 0.5 + Math.random() * 0.2;
            this.body = new CANNON.Body({
                mass: 3000,
                position: position,
                linearDamping: 0.15,
                angularDamping: 0.99,
                fixedRotation: true,
                collisionFilterGroup: GROUPS.PLAYER,
                collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER,
                material: slickMat,
                shape: new CANNON.Box(new CANNON.Vec3(1.5, 1.2, 5.0))
            });
            this.world.addBody(this.body);
            this.mesh = new THREE.Mesh(
                new THREE.BoxGeometry(3.0, 2.4, 10.0),
                new THREE.MeshPhongMaterial({ color: 0xff4444 })
            );
            this.mesh.castShadow = true;
            this.scene.add(this.mesh);
        } else {
            this.hp = 30;
            this.hpMax = 30;
            this.speedMult = 0.8 + Math.random() * 0.4;
            this.body = new CANNON.Body({
                mass: 1400,
                position: position,
                linearDamping: 0.1,
                angularDamping: 0.99,
                fixedRotation: true,
                collisionFilterGroup: GROUPS.PLAYER,
                collisionFilterMask: GROUPS.GROUND | GROUPS.OBSTACLE | GROUPS.BALL | GROUPS.PLAYER,
                material: slickMat,
                shape: new CANNON.Box(new CANNON.Vec3(0.9, 0.7, 3.2))
            });
            this.world.addBody(this.body);
            this.mesh = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 1.4, 6.4),
                new THREE.MeshPhongMaterial({ color: 0x4488ff })
            );
            this.mesh.castShadow = true;
            this.scene.add(this.mesh);
        }
    }

    update(dt, playerPos) {
        if (this.isDead) return;

        const pos = this.body.position;
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 1) {
            const angle = Math.atan2(-dx, -dz);
            const eulerTarget = new CANNON.Vec3();
            this.body.quaternion.toEuler(eulerTarget);
            const currentAngle = eulerTarget.y || 0;
            let diff = angle - currentAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const steer = Math.max(-1, Math.min(1, diff * 3));

            const speed = Math.min(15 * this.speedMult, dist * 0.5);
            const fwd = new CANNON.Vec3(-Math.sin(currentAngle), 0, -Math.cos(currentAngle));
            this.body.velocity.x += fwd.x * speed * dt * 0.5;
            this.body.velocity.z += fwd.z * speed * dt * 0.5;
            this.body.angularVelocity.y = steer * 2;
        }

        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);

        this.contactTimer += dt;
    }

    canDamagePlayer() {
        if (this.contactTimer >= this.contactCooldown) {
            this.contactTimer = 0;
            return true;
        }
        return false;
    }

    takeDamage(amount) {
        if (this.isDead) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        }
    }

    die() {
        this.isDead = true;
        this.scene.remove(this.mesh);
        this.world.removeBody(this.body);
    }

    getPosition() {
        return this.body.position;
    }
}
