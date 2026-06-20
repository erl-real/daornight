import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';
import { MINE_TYPES } from './Weps.js';
import { BULLET_TYPES } from './StoryData.js';

export class Projectiles {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.projectiles = [];
        this.activeMines = [];
        this.sniperSide = -1;
    }

    fireBullet(pos, forward, duration, source = null, bulletType = 'machinegun', dmgMult = 1, spdMult = 1) {
        const cfg = BULLET_TYPES[bulletType] || BULLET_TYPES.machinegun;
        const damage = Math.round(cfg.baseDamage * dmgMult);
        const speed = cfg.baseSpeed * spdMult;
        const spawnPos = new THREE.Vector3().copy(pos).add(forward.clone().multiplyScalar(3));
        spawnPos.y += 0.35;

        const pelletCount = cfg.pellets;
        for (let i = 0; i < pelletCount; i++) {
            let dir = forward.clone();
            let sPos = spawnPos.clone();

            if (cfg.altSides) {
                this.sniperSide = -this.sniperSide;
                const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
                sPos.add(right.clone().multiplyScalar(this.sniperSide * 0.6));
            }

            if (cfg.spread > 0) {
                dir.add(new THREE.Vector3((Math.random() - 0.5) * cfg.spread, (Math.random() - 0.5) * cfg.spread, (Math.random() - 0.5) * cfg.spread)).normalize();
            }
            const baseColor = new THREE.Color(cfg.color);
            const holdFade = Math.min(1, duration / 10);
            const color = baseColor.clone().lerp(new THREE.Color(0xffffff), 1 - holdFade);
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.size, 8, 8), new THREE.MeshBasicMaterial({ color }));
            mesh.position.copy(sPos);
            this.scene.add(mesh);
            this.projectiles.push({
                mesh,
                velocity: dir.multiplyScalar(speed / 60),
                time: Date.now(),
                ttl: cfg.ttl,
                source,
                damage,
                bulletType
            });
        }
    }

    dropMine(pos, backward, type = 'standard', source = null, isSuper = false) {
        const mineData = MINE_TYPES[type] || MINE_TYPES['standard'];
        const spawnPos = new THREE.Vector3().copy(pos).add(backward.clone().multiplyScalar(2.5));
        spawnPos.y += 0.2;

        const mineBody = new CANNON.Body({ 
            mass: mineData.mass, 
            shape: new CANNON.Cylinder(mineData.radius, mineData.radius, mineData.height, 8), 
            position: new CANNON.Vec3(spawnPos.x, spawnPos.y, spawnPos.z), 
            velocity: new CANNON.Vec3(backward.x * 10 + (Math.random()-0.5)*5, 5 + Math.random()*2, backward.z * 15), 
            angularVelocity: new CANNON.Vec3(Math.random()*10, Math.random()*10, Math.random()*10), 
            linearDamping: 0.5, 
            angularDamping: 0.5 
        });
        this.world.addBody(mineBody);

        const color = isSuper ? 0x89CFF0 : mineData.color;
        const emissive = isSuper ? 0x4488aa : mineData.emissive;

        const mineMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(mineData.radius, mineData.radius, mineData.height, 16), 
            new THREE.MeshPhongMaterial({ color: color, emissive: emissive, transparent: true, opacity: 0.4 })
        );
        this.scene.add(mineMesh);

        this.activeMines.push({ 
            body: mineBody, 
            mesh: mineMesh, 
            spawnedAt: Date.now(), 
            isResting: false, 
            type: type,
            data: mineData,
            source: source,
            isSuper: isSuper
        });

        if (this.activeMines.length > 7) {
            const oldest = this.activeMines.shift();
            this.world.removeBody(oldest.body);
            this.scene.remove(oldest.mesh);
        }
    }

    explodeMine(index, callback) {
        const m = this.activeMines[index];
        if (!m) return;
        const flashColor = m.isSuper ? 0x89CFF0 : (m.data.color || 0xffaa00);
        const flash = new THREE.PointLight(flashColor, 25, 20);
        flash.position.copy(m.body.position);
        this.scene.add(flash);
        setTimeout(() => this.scene.remove(flash), 150);

        if (callback) callback(m);

        this.world.removeBody(m.body);
        this.scene.remove(m.mesh);
        this.activeMines.splice(index, 1);
    }

    update(now) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (now - p.time > p.ttl) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
                continue;
            }
            p.mesh.position.add(p.velocity);
        }

        for (let i = this.activeMines.length - 1; i >= 0; i--) {
            const m = this.activeMines[i];
            if (!m.isResting) {
                m.mesh.position.copy(m.body.position);
                m.mesh.quaternion.copy(m.body.quaternion);
                const age = (now - m.spawnedAt) / 1000;
                if ((m.body.velocity.length() < 0.1 && m.body.angularVelocity.length() < 0.1 && age > 1.5) || age > 7) {
                    m.isResting = true;
                    m.body.type = CANNON.Body.STATIC;
                    m.body.quaternion.set(0, 0, 0, 1);
                    m.mesh.quaternion.set(0, 0, 0, 1);
                    m.body.position.y = 0.05;
                    m.mesh.position.y = 0.05;
                }
            }
        }
    }
}
