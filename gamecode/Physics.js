// =============================================================
// MODULE: Physics.js
// ROLE:   Cannon-es physics world initialization.
//
// Matches ArcadeTestGame.initPhysics() exactly.
// Creates the world with gravity, slick contact material,
// and a static ground body.
//
// USAGE (standalone):
//   const physics = new Physics();
//   physics.world.step(1/60, dt);
//   physics.addBox(w, h, d, x, y, z, group);
//
// GROUPS for collision filtering:
//   GROUND   = 1  (arena floor, ramps, asphalt)
//   OBSTACLE = 2  (buildings, walls)
//   BALL     = 4  (football in Ball map)
//   PLAYER   = 8  (vehicles)
//
// TODO: Add world boundaries, dynamic physics zones (low-grav,
//       boost pads), and destructible environment support.
// =============================================================

import * as CANNON from 'cannon-es';
import { CONFIG } from './Config.js';

export const GROUPS = {
    GROUND: 1,
    OBSTACLE: 2,
    BALL: 4,
    PLAYER: 8
};

export class Physics {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, CONFIG.gravity || -9.82, 0);

        this.slickMat = new CANNON.Material('slick');
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.slickMat,
            this.slickMat,
            { friction: 0.0, restitution: 0.0 }
        ));

        this.initGround();
    }

    initGround() {
        const groundBody = new CANNON.Body({
            mass: 0,
            collisionFilterGroup: GROUPS.GROUND,
            material: this.slickMat
        });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
    }

    step(dt) {
        this.world.step(1 / 60, Math.min(dt, 0.1));
    }

    addBox(w, h, d, x, y, z, group = GROUPS.OBSTACLE) {
        const body = new CANNON.Body({
            mass: 0,
            collisionFilterGroup: group,
            material: this.slickMat,
            position: new CANNON.Vec3(x, y, z)
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
        this.world.addBody(body);
        return body;
    }

    dispose() {
        this.world.bodies.forEach(b => this.world.removeBody(b));
    }
}
