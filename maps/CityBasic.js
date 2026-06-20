export const CityBasicMap = {
    name: "City Basic",
    buildings: [
        { 
            position: { x: 50, y: 15, z: 50 }, 
            size: { x: 15, y: 30, z: 15 },
            color: 0x444444
        },
        { 
            position: { x: -60, y: 25, z: 20 }, 
            size: { x: 20, y: 50, z: 20 },
            color: 0x333333
        },
        { 
            position: { x: 20, y: 20, z: -70 }, 
            size: { x: 25, y: 40, z: 25 },
            color: 0x555555
        }
    ],
    pickups: [
        { x: 200, z: 200, type: 'health' },
        { x: -200, z: 200, type: 'charge' },
        { x: 0, z: -350, type: 'ammo' },
        { x: 500, z: 500, type: 'ammo' },
        { x: -500, z: -500, type: 'ammo' },
        { x: 500, z: -500, type: 'charge' },
        { x: -500, z: 500, type: 'charge' },
        { x: 0, z: 250, type: 'buff_hover' },
        { x: 150, z: -150, type: 'ult' },
        { x: -150, z: -150, type: 'missile' },
        { x: 250, z: 150, type: 'mortar' },
        { x: -250, z: 150, type: 'shotgun' },
        { x: 150, z: 250, type: 'turret' },
        { x: -150, z: 250, type: 'cannon' },
        { x: 250, z: -150, type: 'melee' },
        { x: -250, z: -150, type: 'energywep' }
    ],
    barrels: [
        { x: 150, z: 150, type: 'explosive' },
        { x: -150, z: -150, type: 'explosive' },
        { x: 300, z: -250, type: 'explosive' },
        { x: -350, z: 400, type: 'cryo' },
        { x: 600, z: 0, type: 'cryo' },
        { x: 0, z: 600, type: 'toxic' },
        { x: -600, z: -400, type: 'toxic' },
        { x: 250, z: 450, type: 'oil' },
        { x: -450, z: 250, type: 'oil' }
    ],
    spawnAI: false
};
