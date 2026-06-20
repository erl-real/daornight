export const DevMap = {
    name: "Development Lab",
    buildings: [],
    ramps: [
        { x: 40, y: 0.5, z: 40, w: 10, h: 1.5, d: 10, rotX: 0.25 },
        { x: 60, y: 1.2, z: 40, w: 12, h: 3, d: 14, rotX: 0.25 },
        { x: 85, y: 2.5, z: 40, w: 15, h: 6, d: 20, rotX: 0.25 }
    ],
    pickups: [
        { x: 80, z: 80, type: 'health' },
        { x: -80, z: 80, type: 'c4' },
        { x: 80, z: -80, type: 'charge' },
        { x: -80, z: -80, type: 'charge' },
        { x: 0, z: 150, type: 'ammo' },
        { x: 0, z: -150, type: 'ammo' },
        { x: 25, z: 25, type: 'ult' },
        { x: -30, z: 30, type: 'missile' },
        { x: -20, z: 30, type: 'mortar' },
        { x: -10, z: 30, type: 'shotgun' },
        { x: 0, z: 30, type: 'turret' },
        { x: 10, z: 30, type: 'cannon' },
        { x: 20, z: 30, type: 'energywep' },
        { x: 30, z: 30, type: 'melee' },
        { x: 0, z: 60, type: 'buff_hover' }
    ],
    barrels: [
        { x: 10, z: 10, type: 'explosive' },
        { x: -10, z: 10, type: 'explosive' },
        { x: 10, z: -10, type: 'cryo' },
        { x: -10, z: -10, type: 'cryo' },
        { x: 25, z: 0, type: 'toxic' },
        { x: -25, z: 0, type: 'oil' }
    ],
    spawnAI: true
};
