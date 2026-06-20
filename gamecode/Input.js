// =============================================================
// MODULE: Input.js
// ROLE:   Centralized input handling for all control schemes.
//
// Mirrors the input system from ArcadeTestGame's initInput()
// with full support for all displayed layout types.
//
// CONTROL SCHEMES (from pause menu):
//   keyboard - WASD/Arrows, Space, Shift, B, H, F, Q, E, Y, J, [, ]
//   ps1      - Left Stick, R2/L2, R1, L1, L3, Square, Cross, Circle, Triangle, R3, D-Pad
//   xbox     - Left Stick, RT/LT, RB, LB, L3, X, A, B, Y, R3, D-Pad
//   switch   - Left Stick, ZR/ZL, R, L, L3, Y, B, A, X, R3, D-Pad
//
// USAGE:
//   const input = new Input(gameInstance);
//   // In game loop:
//   const { steer, throttle, brake, boost, fireBullet, fireWeapon, ... } = input.poll(dt);
// =============================================================

export class Input {
    constructor(game = null) {
        this.game = game;
        this.keys = {};
        this.inputBuffer = [];
        this.lastInputTime = 0;
        this.gearStickReset = true;
        this.dpadReset = true;
        this.scheme = localStorage.getItem('roadknight_control_scheme') || 'default';

        this._keydownRef = (e) => {
            if (e.repeat) return;
            this.keys[e.code] = true;
            if (this.game) {
                if (e.code === 'KeyJ' && Date.now() - (this.game.lastJumpTime || 0) > 2000) this.game.handleJump();
                if (e.code === 'BracketRight') { this.game.currentGear = Math.min(5, (this.game.currentGear || 0) + 1); this.pushCombo('up'); }
                if (e.code === 'BracketLeft') { this.game.currentGear = Math.max(0, (this.game.currentGear || 0) - 1); this.pushCombo('down'); }
                if (e.code === 'KeyQ') this.game.fireWeapon();
                if (e.code === 'KeyE') this.game.fireMine();
                if (e.code === 'KeyY') this.game.toggleShield?.(true);
            }
        };
        this._keyupRef = (e) => {
            this.keys[e.code] = false;
            if (e.code === 'KeyY' && this.game?.toggleShield) this.game.toggleShield(false);
        };
        this._mousedownRef = (e) => { if (e.button === 0) this.keys['Mouse0'] = true; };
        this._mouseupRef = (e) => { if (e.button === 0) this.keys['Mouse0'] = false; };
        this._wheelRef = (e) => { if (this.game?.rotateWeapon) { if (e.deltaY > 0) this.game.rotateWeapon(1); else this.game.rotateWeapon(-1); } };

        window.addEventListener('keydown', this._keydownRef);
        window.addEventListener('keyup', this._keyupRef);
        window.addEventListener('mousedown', this._mousedownRef);
        window.addEventListener('mouseup', this._mouseupRef);
        window.addEventListener('wheel', this._wheelRef);
    }

    pushCombo(dir) {
        this.inputBuffer.push(dir);
        if (this.inputBuffer.length > 3) this.inputBuffer.shift();
        this.lastInputTime = Date.now();
    }

    getGamepad() {
        return Array.from(navigator.getGamepads()).find(g => g !== null);
    }

    setScheme(scheme) {
        this.scheme = scheme;
        localStorage.setItem('roadknight_control_scheme', scheme);
    }

    poll(dt) {
        const gp = this.getGamepad();

        // ----- STEER -----
        let steer = 0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer += 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) steer -= 1;
        if (gp && Math.abs(gp.axes[0]) > 0.1) steer = -gp.axes[0];

        // ----- THROTTLE / BRAKE -----
        let throttle = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) throttle += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) throttle -= 1;
        if (gp) {
            const fwd = gp.buttons[7]?.value || 0;
            const rev = gp.buttons[6]?.value || 0;
            if (Math.abs(fwd) > 0.05 || Math.abs(rev) > 0.05) throttle = fwd - rev;
        }

        const brake = this.keys['Space'] || (gp && gp.buttons[5]?.pressed);

        // ----- BOOST (Gear 2+ only) -----
        const boost = (this.keys['ShiftLeft'] || (gp && gp.buttons[4]?.pressed));

        // ----- HOVER -----
        const hover = this.keys['KeyH'] || (gp && gp.buttons[10]?.pressed);

        // ----- BULLET FIRE -----
        const fireBullet = this.keys['Mouse0'] || this.keys['KeyF'] || (gp && gp.buttons[2]?.pressed);

        // ----- D-PAD WEAPON SWITCH -----
        if (this.dpadReset) {
            if (gp?.buttons[14]?.pressed) { if (this.game?.rotateWeapon) this.game.rotateWeapon(-1); this.dpadReset = false; }
            else if (gp?.buttons[15]?.pressed) { if (this.game?.rotateWeapon) this.game.rotateWeapon(1); this.dpadReset = false; }
        } else if (!gp || (!gp.buttons[14]?.pressed && !gp.buttons[15]?.pressed)) {
            this.dpadReset = true;
        }

        // ----- GEAR SHIFT (Gamepad) -----
        if (this.gearStickReset) {
            if (gp?.buttons[12]?.pressed) { this.game.currentGear = Math.min(5, (this.game.currentGear || 0) + 1); this.pushCombo('up'); this.gearStickReset = false; }
            else if (gp?.buttons[13]?.pressed) { this.game.currentGear = Math.max(0, (this.game.currentGear || 0) - 1); this.pushCombo('down'); this.gearStickReset = false; }
        } else if (!gp || (!gp.buttons[12]?.pressed && !gp.buttons[13]?.pressed)) {
            this.gearStickReset = true;
        }

        return { steer, throttle, brake, boost, hover, fireBullet };
    }

    dispose() {
        window.removeEventListener('keydown', this._keydownRef);
        window.removeEventListener('keyup', this._keyupRef);
        window.removeEventListener('mousedown', this._mousedownRef);
        window.removeEventListener('mouseup', this._mouseupRef);
        window.removeEventListener('wheel', this._wheelRef);
    }
}
