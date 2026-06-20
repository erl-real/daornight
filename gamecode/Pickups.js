import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
const objLoader = new OBJLoader();

// Shared Resources for Optimization
const SHARED = {
    geo: {
        sphere: new THREE.SphereGeometry(0.5, 16, 16),
        box: new THREE.BoxGeometry(0.8, 0.8, 0.8)
    },
    mat: {
        energy: new THREE.MeshPhongMaterial({ 
            color: 0x00ffff, 
            emissive: 0x00ffff, 
            emissiveIntensity: 2, 
            transparent: true, 
            opacity: 0.8 
        }),
        ammo: new THREE.MeshPhongMaterial({ color: 0x8a9a5b, emissive: 0x222211 }),
        fallback: new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x444444 }),
        hover: new THREE.MeshPhongMaterial({ color: 0xff00ff, emissive: 0x440044 })
    }
};

export class Pickups {
    constructor(scene, locations = null) {
        this.scene = scene;
        this.pickups = [];
        
        if (locations && locations.length > 0) {
            locations.forEach(loc => this.spawnPickup(loc.x, loc.z, loc.type));
        } else {
            this.initDefaultPickups();
        }
    }

    initDefaultPickups() {
        const locations = [
            { x: 160, z: 160, type: 'health' }, 
            { x: -160, z: 160, type: 'health' }, 
            { x: 160, z: -160, type: 'charge' }, 
            { x: -160, z: -160, type: 'charge' }, 
            { x: 0, z: 260, type: 'ammo' }, 
            { x: 0, z: -260, type: 'ammo' },
            { x: 120, z: 120, type: 'ult' },
            { x: 160, z: 80, type: 'missile' },
            { x: -160, z: 80, type: 'shotgun' },
            { x: 80, z: -160, type: 'turret' },
            { x: -80, z: -160, type: 'cannon' },
            { x: 0, z: 200, type: 'energy' },
            { x: 0, z: -200, type: 'melee' },
            { x: 200, z: 0, type: 'mortar' },
            { x: -200, z: 0, type: 'c4' },
            { x: 130, z: 80, type: 'buff_hover' },
            { x: 130, z: -130, type: 'energywep' }
        ];
        locations.forEach(loc => this.spawnPickup(loc.x, loc.z, loc.type));
    }

    spawnPickup(x, z, type) {
        const p = { 
            type, 
            startY: (type === 'health' ? 2.2 : 1.2), 
            angle: Math.random() * Math.PI * 2, 
            mesh: null, 
            originalX: x,
            originalZ: z,
            collectedAt: 0
        };

        const addToScene = (mesh) => {
            p.mesh = mesh;
            p.mesh.position.set(x, p.startY, z);
            this.scene.add(p.mesh);
            this.pickups.push(p);
        };

        if (type === 'health') {
            gltfLoader.load('objects/pickups/heart.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(0.8, 0.8, 0.8);
                model.rotation.z = Math.PI; 
                model.rotation.y = Math.PI;
                addToScene(model);
            });
        } else if (type === 'ammo') {
            objLoader.load('objects/pickups/ammo_box.obj', (obj) => {
                obj.scale.set(0.027, 0.027, 0.027);
                obj.traverse(child => { if (child.isMesh) child.material = SHARED.mat.ammo; });
                addToScene(obj);
            });
        } else if (type === 'charge' || type === 'energy') {
            const mesh = new THREE.Mesh(SHARED.geo.sphere, SHARED.mat.energy.clone());
            addToScene(mesh);
        } else if (type === 'ult') {
            gltfLoader.load('objects/pickups/skull.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(1.5, 1.5, 1.5);
                addToScene(model);
            });
        } else if (type === 'money') {
            gltfLoader.load('objects/pickups/money.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(1.5, 1.5, 1.5);
                addToScene(model);
            });
        } else if (type === 'missile') {
            gltfLoader.load('objects/pickups/ammo_missle.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(2.0, 2.0, 2.0);
                addToScene(model);
            });
        } else if (type === 'shotgun') {
            gltfLoader.load('objects/pickups/ammo_handbomb.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(1.5, 1.5, 1.5);
                addToScene(model);
            });
        } else if (type === 'energywep') {
            gltfLoader.load('objects/pickups/ammo_missle.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(2.0, 2.0, 2.0);
                model.traverse(child => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: 0x00cccc, emissiveIntensity: 1.5, transparent: true, opacity: 0.8 });
                    }
                });
                addToScene(model);
            });
        } else if (type === 'buff_hover') {
            gltfLoader.load('objects/pickups/cryotank.glb', (gltf) => {
                const model = gltf.scene;
                model.scale.set(2.5, 2.5, 2.5);
                addToScene(model);
            });
        } else if (type === 'mortar') {
            const mat = new THREE.MeshPhongMaterial({ color: 0xff8800 });
            const mesh = new THREE.Mesh(SHARED.geo.sphere, mat);
            mesh.scale.set(1.2, 1.2, 1.2);
            addToScene(mesh);
        } else if (type === 'c4') {
            const mat = new THREE.MeshPhongMaterial({ color: 0xcc0000 });
            const mesh = new THREE.Mesh(SHARED.geo.box, mat);
            mesh.scale.set(1.5, 1.5, 1.5);
            addToScene(mesh);
        } else {
            // Fallback for others
            const mesh = new THREE.Mesh(SHARED.geo.box, (type === 'buff_hover' || type === 'hover') ? SHARED.mat.hover : SHARED.mat.fallback);
            addToScene(mesh);
        }
    }

    update(now, vehicles, onCollect) {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            if (!p.mesh) continue;

            // Handle respawn timer
            if (p.collectedAt) {
                if (now - p.collectedAt > 10000) {
                    p.mesh.visible = true;
                    p.mesh.position.set(p.originalX, p.startY, p.originalZ);
                    p.collectedAt = 0;
                }
                continue;
            }

            p.mesh.rotation.y += 0.03;
            p.mesh.position.y = p.startY + Math.sin(now * 0.002 + p.angle) * 0.3;
            
            // Visual pulse effect (no light)
            if (p.type === 'charge' || p.type === 'energy') {
                const intensity = 1 + Math.random() * 2;
                if (p.mesh.material) p.mesh.material.emissiveIntensity = intensity;
                p.mesh.scale.setScalar(1 + Math.sin(now * 0.01) * 0.1 + (Math.random() * 0.05));
            }

            const pPos = p.mesh.position;
            for (const vehicle of vehicles) {
                if (vehicle.isDead) continue;
                const vPos = vehicle.chassisBody.position;
                const dx = pPos.x - vPos.x, dz = pPos.z - vPos.z;
                if (dx*dx + dz*dz < 16.0) {
                    if (onCollect) onCollect(p.type, vehicle);
                    p.mesh.visible = false;
                    p.collectedAt = now;
                    break;
                }
            }
        }
    }
}
