import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export class Barrels {
    constructor(scene, world, onLoaded, locations = null) {
        this.scene = scene;
        this.world = world;
        this.barrels = [];
        this.grid = new Map();
        this.gridCell = 30;
        this.locations = locations;
        this.pools = {
            explosive: [],
            toxic: [],
            oil: [],
            cryo: []
        };
        this.models = {
            oil: null,
            cryo: null
        };
        this.materials = {};
        this.loadingManager = new THREE.LoadingManager();
        
        if (onLoaded) {
            this.loadingManager.onLoad = onLoaded;
        } else {
            this.loadingManager.onLoad = () => {
                this.initMaterials();
                if (this.locations && this.locations.length > 0) {
                    this.locations.forEach(loc => this.spawnBarrel(loc.x, loc.z, loc.type));
                } else {
                    this.initDefaultBarrels();
                }
            };
        }

        this.loadModels();
        
        // Pooled Flash Light
        this.flashLight = new THREE.PointLight(0xffffff, 0, 15);
        this.scene.add(this.flashLight);
        this.flashTimer = 0;
    }

    loadModels() {
        const loader = new OBJLoader(this.loadingManager);
        
        // Oil Drum Model - sm_barrel.obj uses cm (vertices ~50), scale 0.012 fits r=0.7
        loader.load('objects/pickups/sm_barrel.obj', (obj) => {
            const box = new THREE.Box3().setFromObject(obj);
            const centerY = (box.max.y + box.min.y) / 2;
            obj.traverse(child => {
                if (child.isMesh) {
                    child.position.y -= centerY;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            obj.scale.set(0.012, 0.012, 0.012);
            this.models.oil = obj;
        });

        // Cryo Tank Model
        loader.load('objects/pickups/liquidnitrogen/liquid_nitrogen_tank__laboratory__pbr__low_4k.obj', (obj) => {
            const box = new THREE.Box3().setFromObject(obj);
            const centerY = (box.max.y + box.min.y) / 2;
            obj.traverse(child => {
                if (child.isMesh) {
                    child.position.y -= centerY;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            obj.scale.set(2.6, 2.6, 2.6);
            this.models.cryo = obj;
        });
    }

    initMaterials() {
        const createOilMat = (tint, em, emInt) => {
            return new THREE.MeshStandardMaterial({
                color: tint,
                emissive: em,
                emissiveIntensity: emInt,
                metalness: 0.5,
                roughness: 0.5
            });
        };

        this.materials.explosive = createOilMat(new THREE.Color(1.0, 0.4, 0.4), new THREE.Color(0x331100), 0.5);
        this.materials.toxic = createOilMat(new THREE.Color(0.4, 1.0, 0.4), new THREE.Color(0x113300), 0.5);
        this.materials.oil = createOilMat(new THREE.Color(0.2, 0.2, 0.2), new THREE.Color(0x000000), 0);
        
        this.materials.cryo = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x88ccff),
            emissive: new THREE.Color(0x004488),
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.5
        });
    }

    initDefaultBarrels() {
        const locations = [
            { x: 80, z: 0, type: 'explosive' },
            { x: 40, z: 69, type: 'explosive' },
            { x: -40, z: 69, type: 'cryo' },
            { x: -80, z: 0, type: 'cryo' },
            { x: -40, z: -69, type: 'toxic' },
            { x: 40, z: -69, type: 'oil' }
        ];
        locations.forEach(loc => this.spawnBarrel(loc.x, loc.z, loc.type));
    }

    spawnBarrel(x, z, type) {
        let barrel = this.pools[type].pop();

        if (!barrel) {
            const radius = 0.7;
            const height = 1.8;
            const shape = new CANNON.Cylinder(radius, radius, height, 8);
            const body = new CANNON.Body({ mass: 50, shape: shape });
            
            let mesh;
            if (type === 'cryo' && this.models.cryo) {
                mesh = this.models.cryo.clone();
                mesh.traverse(c => { if (c.isMesh) c.material = this.materials.cryo; });
            } else {
                mesh = this.models.oil.clone();
                mesh.traverse(c => { if (c.isMesh) c.material = this.materials[type]; });
            }

            barrel = { body, mesh, type, health: 10, isDead: false };
        }

        barrel.isDead = false;
        barrel.health = 10;
        barrel.body.position.set(x, 0.9, z); // half height
        barrel.body.velocity.set(0, 0, 0);
        barrel.body.angularVelocity.set(0, 0, 0);
        barrel.body.quaternion.set(0, 0, 0, 1);
        
        if (!barrel.body.world) this.world.addBody(barrel.body);
        if (!barrel.mesh.parent) this.scene.add(barrel.mesh);
        
        barrel.mesh.visible = true;
        barrel.mesh.position.copy(barrel.body.position);
        
        this.barrels.push(barrel);
        return barrel;
    }

    _gridKey(x, z) { return `${Math.floor(x / this.gridCell)},${Math.floor(z / this.gridCell)}`; }

    _register(b) {
        const key = this._gridKey(b.body.position.x, b.body.position.z);
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(b);
    }

    getNearby(pos, range) {
        const results = [];
        const cr = Math.ceil(range / this.gridCell);
        const cx = Math.floor(pos.x / this.gridCell);
        const cz = Math.floor(pos.z / this.gridCell);
        for (let dx = -cr; dx <= cr; dx++) {
            for (let dz = -cr; dz <= cr; dz++) {
                const key = `${cx + dx},${cz + dz}`;
                const arr = this.grid.get(key);
                if (arr) {
                    for (const b of arr) {
                        if (!b.isDead) results.push(b);
                    }
                }
            }
        }
        return results;
    }

    update() {
        if (this.flashTimer > 0) {
            this.flashTimer -= 0.016;
            if (this.flashTimer <= 0) this.flashLight.intensity = 0;
        }

        this.grid.clear();
        for (let i = 0; i < this.barrels.length; i++) {
            const b = this.barrels[i];
            if (!b.isDead) {
                b.mesh.position.copy(b.body.position);
                b.mesh.quaternion.copy(b.body.quaternion);
                this._register(b);
            }
        }
    }

    applyDamage(barrel, amount, onExplode) {
        if (barrel.isDead) return;
        barrel.health -= amount;
        if (barrel.health <= 0) {
            this.explode(barrel, onExplode);
        }
    }

    explode(barrel, onExplode) {
        barrel.isDead = true;
        barrel.mesh.visible = false;
        
        let flashColor;
        switch(barrel.type) {
            case 'explosive': flashColor = 0xffaa00; break;
            case 'cryo': flashColor = 0x00ffff; break;
            case 'toxic': flashColor = 0x88ff00; break;
            case 'oil': flashColor = 0x444444; break;
            default: flashColor = 0xffffff;
        }

        this.flashLight.color.setHex(flashColor);
        this.flashLight.intensity = 30;
        this.flashLight.position.copy(barrel.body.position);
        this.flashTimer = 0.2;

        if (onExplode) onExplode(barrel);

        const spawnPos = { x: barrel.body.position.x, z: barrel.body.position.z };
        const type = barrel.type;

        this.world.removeBody(barrel.body);
        const index = this.barrels.indexOf(barrel);
        if (index > -1) this.barrels.splice(index, 1);
        
        this.pools[type].push(barrel);

        setTimeout(() => this.spawnBarrel(spawnPos.x, spawnPos.z, type), 10000);
    }
}
