import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CONFIG } from './Config.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

function getModelInfo(car) {
    if (car.gltfFile && car.gltfPath) return { file: car.gltfFile, path: car.gltfPath };
    if (car.objFile && car.objPath) return { file: car.objFile, path: car.objPath };
    if (car.fbxFile && car.fbxPath) return { file: car.fbxFile, path: car.fbxPath };
    return null;
}

export class MultiplayerMenu {
    constructor() {
        this.container = document.getElementById('mp-car-container');
        this._active = false;
        this.autoRotate = true;
        this.autoRotateSpeed = 0.3;
        this.orbitAngle = 0;
        this.orbitPhi = 0.3;
        this.orbitRadius = 8;
        this.isDragging = false;
        this.prevMouseX = 0;
        this.prevMouseY = 0;
        this.targetOrbitAngle = 0;
        this.targetOrbitPhi = 0.3;
        this.lerpSpeed = 4;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
        this.camera.position.set(0, 3, 8);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.container.appendChild(this.renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const key = new THREE.DirectionalLight(0xffd4a0, 2.5);
        key.position.set(5, 8, 6);
        this.scene.add(key);

        const fill = new THREE.DirectionalLight(0x8888ff, 0.8);
        fill.position.set(-4, 2, -5);
        this.scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffffaa, 1.2);
        rim.position.set(-2, 6, -8);
        this.scene.add(rim);

        const hemi = new THREE.HemisphereLight(0xff8c5a, 0x4444aa, 0.6);
        this.scene.add(hemi);

        this.carGroup = new THREE.Group();
        this.scene.add(this.carGroup);

        // Floating ground ring
        const ringGeo = new THREE.RingGeometry(2.4, 2.8, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -1.1;
        this.carGroup.add(ring);

        const innerRing = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 0.8, 32),
            ringMat
        );
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = -1.1;
        this.carGroup.add(innerRing);

        this.active = true;
        this.setCar(window.currentCar || '35-impala');

        this.bindMouse();

        window.addEventListener('resize', () => this.resize());
    }

    setCar(type) {
        for (let i = this.carGroup.children.length - 1; i >= 0; i--) {
            const c = this.carGroup.children[i];
            if (i > 1 || c.userData?.isModel) {
                this.carGroup.remove(c);
            }
        }

        const car = CONFIG.CARS[type] || CONFIG.CARS['35-impala'];
        const modelInfo = getModelInfo(car);

        if (modelInfo) {
            const modelPath = modelInfo.path + modelInfo.file;
            const ext = modelInfo.file.split('.').pop().toLowerCase();

            const onLoaded = (object) => {
                const model = object.scene || object;
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const scale = (4 / Math.max(size.x, size.y, size.z)) * 1.5;
                model.scale.set(scale, scale, scale);
                const center = box.getCenter(new THREE.Vector3());
                model.position.x = -center.x * scale;
                model.position.z = -center.z * scale;
                model.position.y = -box.min.y * scale;
                model.rotation.y = car.rotationOffset !== undefined ? car.rotationOffset : Math.PI;
                model.userData.isModel = true;
                this.carGroup.add(model);
            };

            if (ext === 'glb' || ext === 'gltf') {
                const loader = new GLTFLoader();
                loader.setDRACOLoader(dracoLoader);
                loader.load(modelPath, onLoaded);
            } else if (ext === 'obj') {
                const loader = new OBJLoader();
                loader.load(modelPath, onLoaded);
            } else if (ext === 'fbx') {
                const loader = new FBXLoader();
                loader.load(modelPath, onLoaded);
            }
        } else {
            const dims = car.dimensions || CONFIG.chassisDimensions;
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(dims.x * 2, dims.y * 2, dims.z * 2),
                new THREE.MeshStandardMaterial({ color: car.color || 0x00ffff, metalness: 0.3, roughness: 0.4 })
            );
            mesh.position.y = dims.y;
            mesh.userData.isModel = true;
            this.carGroup.add(mesh);
        }
    }

    bindMouse() {
        this._onDown = (e) => {
            this.isDragging = true;
            this.prevMouseX = e.clientX;
            this.prevMouseY = e.clientY;
            this.autoRotate = false;
        };
        this._onMove = (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.prevMouseX;
            const dy = e.clientY - this.prevMouseY;
            this.targetOrbitAngle -= dx * 0.008;
            this.targetOrbitPhi = Math.max(-0.1, Math.min(1.2, this.targetOrbitPhi + dy * 0.006));
            this.prevMouseX = e.clientX;
            this.prevMouseY = e.clientY;
        };
        this._onUp = () => {
            this.isDragging = false;
            setTimeout(() => { this.autoRotate = true; }, 1500);
        };

        this._onTouchStart = (e) => {
            const t = e.touches[0];
            if (!t) return;
            this.isDragging = true;
            this.prevMouseX = t.clientX;
            this.prevMouseY = t.clientY;
            this.autoRotate = false;
        };
        this._onTouchMove = (e) => {
            const t = e.touches[0];
            if (!t || !this.isDragging) return;
            const dx = t.clientX - this.prevMouseX;
            const dy = t.clientY - this.prevMouseY;
            this.targetOrbitAngle -= dx * 0.008;
            this.targetOrbitPhi = Math.max(-0.1, Math.min(1.2, this.targetOrbitPhi + dy * 0.006));
            this.prevMouseX = t.clientX;
            this.prevMouseY = t.clientY;
        };
        this._onTouchEnd = () => {
            this.isDragging = false;
            setTimeout(() => { this.autoRotate = true; }, 1500);
        };

        this.container.addEventListener('mousedown', this._onDown);
        window.addEventListener('mousemove', this._onMove);
        window.addEventListener('mouseup', this._onUp);

        this.container.addEventListener('touchstart', this._onTouchStart, { passive: true });
        this.container.addEventListener('touchmove', this._onTouchMove, { passive: true });
        this.container.addEventListener('touchend', this._onTouchEnd, { passive: true });
    }

    dispose() {
        this._active = false;
        if (this._onDown) this.container.removeEventListener('mousedown', this._onDown);
        if (this._onMove) window.removeEventListener('mousemove', this._onMove);
        if (this._onUp) window.removeEventListener('mouseup', this._onUp);
        if (this._onTouchStart) this.container.removeEventListener('touchstart', this._onTouchStart);
        if (this._onTouchMove) this.container.removeEventListener('touchmove', this._onTouchMove);
        if (this._onTouchEnd) this.container.removeEventListener('touchend', this._onTouchEnd);
        if (this._resizeRef) window.removeEventListener('resize', this._resizeRef);
        this._onDown = null;
        this._onMove = null;
        this._onUp = null;
        this._onTouchStart = null;
        this._onTouchMove = null;
        this._onTouchEnd = null;
        this._resizeRef = null;
    }

    resize() {
        if (!this._active) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w > 0 && h > 0) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        }
    }

    get active() { return this._active; }
    set active(val) {
        this._active = val;
        if (val) {
            this.animate();
            setTimeout(() => this.resize(), 50);
        }
    }

    animate() {
        if (!this._active) return;
        requestAnimationFrame(() => this.animate());

        const dt = 1 / 60;

        if (this.autoRotate) {
            this.targetOrbitAngle += this.autoRotateSpeed * dt;
        }

        this.orbitAngle += (this.targetOrbitAngle - this.orbitAngle) * this.lerpSpeed * dt;
        this.orbitPhi += (this.targetOrbitPhi - this.orbitPhi) * this.lerpSpeed * dt;

        const radius = this.orbitRadius;
        this.camera.position.x = Math.sin(this.orbitAngle) * radius * Math.cos(this.orbitPhi);
        this.camera.position.z = Math.cos(this.orbitAngle) * radius * Math.cos(this.orbitPhi);
        this.camera.position.y = 2 + Math.sin(this.orbitPhi) * radius * 0.5;
        this.camera.lookAt(0, 0.2, 0);

        this.renderer.render(this.scene, this.camera);
    }
}
