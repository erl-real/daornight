// =============================================================
// MODULE: Weps.js
// ROLE:   Weapon/mine type definitions shared across the game.
//
// All weapon types are consumed by Ults.js via WEAPON_TYPES.
// The game uses these for ammo caps, cooldowns, and UI.
//
// WEAPON INVENTORY (used by ArcadeTestGame / Game):
//   'ult'       - Vehicle-specific ultimate ability
//   'missile'   - Fast homing projectile, tracks nearest target
//   'shotgun'   - Spread fire (3 wide fast balls), close range
//   'cannon'    - Heavy slug with arc/drop, high damage
//   'turret'    - Deployable auto-turret that shoots nearest car for 5s
//   'energy'    - Hitscan laser MG, lower damage, auto-fire hold
//   'melee'     - Ram ball ahead of car, small explosion on contact
//   'mortar'    - Fires up in arc, splash damage on landing
//   'c4'        - Throw in arc, retrigger to detonate (one at a time)
//
// BACKFIRE:
//   All weapons EXCEPT ults, mines, and bullets can fire behind
//   by holding down on dpad or left joystick.
//
// MINE TYPES (used by Projectiles.js):
//   'standard'  - Basic proximity explosive
//   'super'     - High-yield (triggered by up-up-down combo)
//   'toxic'     - Releases corrosive cloud
//   'cryo'      - Freezes on detonation
//
// TODO: Add weapon variant system with upgrade tiers for story mode.
// =============================================================

export const WEAPON_TYPES = {
    'ult': {
        name: 'Ultimate',
        ammoCap: 3,
        color: 0xffd700,
        speed: 15,
        damage: 100,
        cooldown: 3000,
        description: 'Vehicle-specific ultimate ability'
    },
    'missile': {
        name: 'Missile',
        ammoCap: 20,
        color: 0xff0000,
        speed: 200,
        damage: 8,
        cooldown: 260,
        maxRange: 200,
        life: 8.0,
        homing: true,
        homingMaxTurn: 2.5,
        homingLoseTime: 5.0,
        description: 'Fast homing missile, ~60% hit rate, jukeable'
    },
    'shotgun': {
        name: 'Shotgun',
        ammoCap: 8,
        color: 0x00ff44,
        speed: 160,
        damage: 12,
        cooldown: 650,
        projectiles: 3,
        spread: 0.05,
        maxRange: 40,
        description: 'Three fast tight balls, medium range'
    },
    'cannon': {
        name: 'Cannon',
        ammoCap: 4,
        color: 0x555555,
        speed: 80,
        damage: 50,
        cooldown: 820,
        gravity: true,
        description: 'Heavy slug with arc and drop'
    },
    'turret': {
        name: 'Turret',
        ammoCap: 100,
        color: 0x0044ff,
        speed: 0,
        damage: 10,
        cooldown: 130,
        duration: 5,
        autoTarget: true,
        deployRange: 30,
        description: 'Deployable auto-turret, shoots nearest car for 5s'
    },
    'energy': {
        name: 'Energy Beam',
        ammoCap: 30,
        color: 0x00ffff,
        speed: 0,
        damage: 6,
        cooldown: 100,
        hitscan: true,
        hitscanRange: 60,
        coneAngle: 0.15,
        description: 'Hitscan laser MG, lower damage, auto-fire hold'
    },
    'melee': {
        name: 'Melee Ram',
        ammoCap: 50,
        color: 0xff0088,
        speed: 0,
        damage: 30,
        cooldown: 130,
        melee: true,
        meleeRange: 8,
        description: 'Ram ball ahead of car, small explosion on contact'
    },
    'mortar': {
        name: 'Mortar',
        ammoCap: 6,
        color: 0xff8800,
        speed: 25,
        damage: 35,
        cooldown: 900,
        arc: true,
        gravity: true,
        splashRadius: 6,
        description: 'Arcing projectile with splash damage on landing'
    },
    'c4': {
        name: 'C4',
        ammoCap: 3,
        color: 0xcc0000,
        speed: 15,
        damage: 60,
        cooldown: 200,
        throw: true,
        splashRadius: 8,
        description: 'Throwable charge, retrigger to detonate (one at a time)'
    }
};

export const MINE_TYPES = {
    'standard': {
        name: 'Standard Mine',
        color: 0xff2200,
        emissive: 0xaa0000,
        damage: 30,
        mass: 10,
        radius: 0.4,
        height: 0.2,
        description: 'Traditional proximity explosive'
    },
    'super': {
        name: 'Super Mine',
        color: 0x89CFF0,
        emissive: 0x4488aa,
        damage: 60,
        mass: 15,
        radius: 0.6,
        height: 0.3,
        description: 'High-yield tactical explosive'
    },
    'toxic': {
        name: 'Toxic Mine',
        color: 0x00ff00,
        emissive: 0x00aa00,
        damage: 15,
        mass: 8,
        radius: 0.4,
        height: 0.2,
        effect: 'toxic',
        description: 'Releases a corrosive cloud on impact'
    },
    'cryo': {
        name: 'Cryo Mine',
        color: 0x00ffff,
        emissive: 0x00aaaa,
        damage: 5,
        mass: 8,
        radius: 0.4,
        height: 0.2,
        effect: 'cryo',
        description: 'Flash-freezes nearby units'
    }
};
