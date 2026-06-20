export const SAVE_KEY = 'roadknight_story';

export const DIFFICULTIES = {
    hard:   { prestige: 1, label: 'Hard',       desc: '+2 enemies, +25% scrap' },
    harder: { prestige: 2, label: 'Harder',      desc: '+4 enemies, +50% scrap' },
    epic:   { prestige: 3, label: 'Epic',        desc: '+6 enemies, +75% scrap' },
    master: { prestige: 5, label: 'Master',      desc: '+10 enemies, +125% scrap' },
    onehit: { prestige: 5, label: 'Onehit',      desc: 'Master difficulty, any hit kills you' }
};

export function getDifficultyPrestige(diff) {
    return DIFFICULTIES[diff]?.prestige ?? 0;
}

export function getDifficultyFromPrestige(prestige) {
    for (const [id, d] of Object.entries(DIFFICULTIES)) {
        if (d.prestige === prestige) return id;
    }
    return 'hard';
}

export const CREWS = {
    beach: {
        name: 'Beach Crew',
        icon: 'sun',
        cars: ['beachbug', 'foodtruck', 'beachpartyvan'],
        boss: 'bumsboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Proving Grounds — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Street Scuffle — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Wareyard Brawl — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Highway Havoc — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Final Stand — 10 enemies + boss' }
        ]
    },
    moon: {
        name: 'Moon Crew',
        icon: 'moon',
        cars: ['hovercar', 'rover', 'rv'],
        boss: 'z2-ufo',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Crater Run — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Lunar Scuffle — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Dark Side — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Zero-G Havoc — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Moonbase Finale — 10 enemies + boss' }
        ]
    },
    rat: {
        name: 'Rat Crew',
        icon: 'rat',
        cars: ['sidecarbike', 'ratrod', 'amrtruck'],
        boss: 'ratsboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Sewer Sprint — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Alley Ambush — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Junkyard King — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Rat Run — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'The Nest — 10 enemies + boss' }
        ]
    },
    hacker: {
        name: 'Hacker Crew',
        icon: 'hacker',
        cars: ['sprintracer', 'bladecybercar', '12-servervan'],
        boss: 'hackerboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Firewall Breach — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Data Heist — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Kernel Panic — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Root Access — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'System Shutdown — 10 enemies + boss' }
        ]
    },
    cops: {
        name: 'Cops Crew',
        icon: 'cops',
        cars: ['aicop', 'policecar', 'grappler'],
        boss: 'policeboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Patrol Beat — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Hot Pursuit — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Breakout — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Manhunt — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Full Lockdown — 10 enemies + boss' }
        ]
    },
    jam: {
        name: 'Jam Crew',
        icon: 'jam',
        cars: ['f2', 'rally', 'livsuper'],
        boss: 'jammonsterboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Warm Up — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Street Jam — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Drop the Bass — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Mosh Pit — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Encore — 10 enemies + boss' }
        ]
    },
    junk: {
        name: 'Junk Crew',
        icon: 'junk',
        cars: ['bowcar', 'muscle', 'willys'],
        boss: 'junkboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Scrapyard — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Rust Buckets — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Junkheap — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Salvage Run — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Total Wreck — 10 enemies + boss' }
        ]
    },
    cute: {
        name: 'Cute Crew',
        icon: 'cute',
        cars: ['mini', 'sportssuper', 'van'],
        boss: 'cuteboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Playdate — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Tea Party — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Toybox — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Bedlam — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Sweet Mayhem — 10 enemies + boss' }
        ]
    },
    final: {
        name: 'Infected Crew',
        icon: 'final',
        cars: ['rougeai', 'scorp', 'nado'],
        boss: 'finaltank',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Opening Salvo — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Crossfire — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'No Mans Land — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Heavy Fire — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Armageddon — 10 enemies + boss' }
        ]
    },
    outcast: {
        name: 'Outcast Crew',
        icon: 'outcast',
        cars: ['4door', '61lowrider', 'tourbus'],
        boss: 'bigboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Outcasts — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Rejects — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Cast Out — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Exiled — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Last Stand — 10 enemies + boss' }
        ]
    },
    wasted: {
        name: 'Wasted Crew',
        icon: 'wasted',
        cars: ['forklift', 'flagtruck', 'mixer'],
        boss: 'cranetruck',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Trash Day — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Dump Run — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Landfill — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Compactor — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Incineration — 10 enemies + boss' }
        ]
    },
    demo: {
        name: 'Demo Crew',
        icon: 'demo',
        cars: ['miramar', 'democharger', 'semi'],
        boss: 'demoboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Test Site — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Blast Zone — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Detonation — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Collateral — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Chain Reaction — 10 enemies + boss' }
        ]
    },
    void: {
        name: 'Void Crew',
        icon: 'void',
        cars: ['voidbike', 'voidcar', 'tractor'],
        boss: 'voidboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Darkness — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Abyss — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Event Horizon — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Singularity — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Oblivion — 10 enemies + boss' }
        ]
    },
    kings: {
        name: 'Kings Crew',
        icon: 'kings',
        cars: ['oldrace', 'spycar', 'redrum'],
        boss: 'radioboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Royal Flush — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Crown Jewels — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Throne Room — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Kingdom — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Usurper — 10 enemies + boss' }
        ]
    },
    fold: {
        name: 'The Fold',
        icon: 'fold',
        cars: ['planecar', 'humher', 'schoolbus'],
        boss: 'armyboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Rally Point — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Formation — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Frontline — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Siege — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Total War — 10 enemies + boss' }
        ]
    },
    wcrew: {
        name: 'W Crew',
        icon: 'wcrew',
        cars: [],
        boss: null,
        missions: []
    },
    rich: {
        name: 'Rich Crew',
        icon: 'rich',
        cars: [],
        boss: null,
        missions: []
    },
    dev: {
        name: 'Dev Crew',
        icon: 'dev',
        cars: ['35-impala'],
        boss: null,
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Test Run — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Debug — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Crash Test — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Beta — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Release — 10 enemies + boss' }
        ]
    },
    prostreet: {
        name: 'Prostreet Crew',
        icon: 'prostreet',
        cars: ['yellowelstang', 'rocketcar', 'wolfstreet'],
        boss: 'prostreetboss',
        missions: [
            { mission: 1, enemyCount: 3, hasBoss: false, scrapReward: 100, desc: 'Street Race — 3 enemies' },
            { mission: 2, enemyCount: 4, hasBoss: false, scrapReward: 150, desc: 'Underground — 4 enemies' },
            { mission: 3, enemyCount: 6, hasBoss: true,  scrapReward: 200, desc: 'Illegal Meet — 6 enemies + boss' },
            { mission: 4, enemyCount: 8, hasBoss: false, scrapReward: 250, desc: 'Midnight Run — 8 enemies' },
            { mission: 5, enemyCount: 10, hasBoss: true, scrapReward: 350, desc: 'Street Kings — 10 enemies + boss' }
        ]
    }
};

export function getCarCrew(carType) {
    for (const [id, crew] of Object.entries(CREWS)) {
        if (crew.cars.includes(carType) || crew.boss === carType) return id;
    }
    return null;
}

export function getCrewMissions(crewId) {
    const crew = CREWS[crewId];
    return crew ? crew.missions : null;
}

export function getCrewByCar(carType) {
    const id = getCarCrew(carType);
    return id ? CREWS[id] : null;
}

export const BULLET_TYPES = {
    machinegun: { baseSpeed: 300, baseDamage: 5,  size: 0.1, ttl: 800,  pellets: 1, spread: 0,    bpsBase: 7, bpsRamp: 13, color: 0x88ccff, label: 'MACHINEGUN' },
    shotgun:    { baseSpeed: 250, baseDamage: 3,  size: 0.15, ttl: 300, pellets: 5, spread: 0.35, bpsBase: 2, bpsRamp: 3,  color: 0xff8800, label: 'SHOTGUN' },
    sniper:     { baseSpeed: 600, baseDamage: 25, size: 0.35, ttl: 1500, pellets: 1, spread: 0,    bpsBase: 2, bpsRamp: 2,  color: 0xff2200, label: 'SNIPER', altSides: true }
};

export const UPGRADE_DEFS = [
    { id: 'hp',         name: 'Armor',       tier: 2, desc: '+10 / +20 / +35 / +55 / +80 max HP', values: [10, 20, 35, 55, 80], suffix: ' HP', isPct: false, baseKey: 'hp' },
    { id: 'accel',      name: 'Acceleration',tier: 2, desc: '+5% / +10% / +18% / +28% / +40%', values: [0.05, 0.10, 0.18, 0.28, 0.40], suffix: '%', isPct: true, baseKey: 'accel' },
    { id: 'topSpeed',   name: 'Top Speed',   tier: 2, desc: '+5% / +10% / +18% / +28% / +40%', values: [0.05, 0.10, 0.18, 0.28, 0.40], suffix: '%', isPct: true, baseKey: 'topSpeed' },
    { id: 'boostMult',  name: 'Nitro Boost', tier: 2, desc: '+0.15 / +0.3 / +0.5 / +0.75 / +1.0', values: [0.15, 0.30, 0.50, 0.75, 1.0], suffix: 'x', isPct: false, baseKey: 'boostMult' },
    { id: 'bulletDmg',  name: 'Bullet DMG',  tier: 2, desc: '+5% / +10% / +18% / +28% / +40%', values: [0.05, 0.10, 0.18, 0.28, 0.40], suffix: '%', isPct: true, baseKey: 'bulletDmg' },
    { id: 'ultDmg',     name: 'Ult DMG',     tier: 2, desc: '+5% / +10% / +18% / +28% / +40%', values: [0.05, 0.10, 0.18, 0.28, 0.40], suffix: '%', isPct: true, baseKey: 'ultDmg' },
    { id: 'jumpPower',  name: 'Jump Power',  tier: 1, desc: '+5% / +10% / +15% / +22% / +30%', values: [0.05, 0.10, 0.15, 0.22, 0.30], suffix: '%', isPct: true, baseKey: 'jumpPower' },
    { id: 'boostDur',   name: 'Nitro Drain', tier:1,  desc: '-5% / -10% / -15% / -22% / -30%', values: [0.05, 0.10, 0.15, 0.22, 0.30], suffix: '%', isPct: true, baseKey: 'boostDur' },
    { id: 'energyRegen',name: 'Energy Regen',tier: 1, desc: '+10% / +20% / +30% / +45% / +60%', values: [0.10, 0.20, 0.30, 0.45, 0.60], suffix: '%', isPct: true, baseKey: 'energyRegen' },
    { id: 'nitroRegen', name: 'Nitro Regen', tier: 1, desc: '+10% / +20% / +30% / +45% / +60%', values: [0.10, 0.20, 0.30, 0.45, 0.60], suffix: '%', isPct: true, baseKey: 'nitroRegen' },
    { id: 'bulletSpeed',name: 'Bullet Speed',tier: 1, desc: '+5% / +10% / +18% / +28% / +40%', values: [0.05, 0.10, 0.18, 0.28, 0.40], suffix: '%', isPct: true, baseKey: 'bulletSpeed' },
    { id: 'grip',       name: 'Grip',        tier: 1, desc: '+5% / +10% / +15% / +22% / +30%', values: [0.05, 0.10, 0.15, 0.22, 0.30], suffix: '%', isPct: true, baseKey: 'grip' },
    { id: 'ultCharge',  name: 'Ult Charges', tier: 1, desc: '+1 / +1 / +2 / +2 / +3', values: [1, 1, 2, 2, 3], suffix: '', isPct: false, baseKey: 'ultCharge' }
];

const TIER_COSTS = {
    1: [15, 25, 40, 65, 100],
    2: [25, 40, 65, 100, 150]
};

export function getUpgradeCost(upgradeDef, level) {
    const costs = TIER_COSTS[upgradeDef.tier];
    return costs[level] || 999;
}

export function getTotalScrapToMax() {
    let total = 0;
    for (const def of UPGRADE_DEFS) {
        const costs = TIER_COSTS[def.tier];
        for (let i = 0; i < 5; i++) total += costs[i];
    }
    return total;
}

export function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        const save = raw ? JSON.parse(raw) : {};
        // Migrate old saves to crew system
        if (!save.crews) save.crews = {};
        let changed = false;
        for (const [crewId, crew] of Object.entries(CREWS)) {
            if (!save.crews[crewId]) {
                save.crews[crewId] = { missionProgress: 0, bossUnlocked: false };
            }
            for (const c of crew.cars) {
                const p = save[c];
                if (p && p.missionProgress >= 5) {
                    if (save.crews[crewId].missionProgress < 5) {
                        save.crews[crewId].missionProgress = 5;
                        save.crews[crewId].bossUnlocked = true;
                        changed = true;
                    }
                    delete p.missionProgress;
                    changed = true;
                }
            }
        }
        if (changed) saveSave(save);
        return save;
    } catch { return {}; }
}

export function saveSave(data) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
}

export function getCarProgress(carType) {
    const save = loadSave();
    return save[carType] || { upgrades: {}, scrap: 0, prestige: 0 };
}

export function setCarProgress(carType, progress) {
    const save = loadSave();
    save[carType] = progress;
    saveSave(save);
}

export function getCrewScrap(crewId) {
    const save = loadSave();
    return save.crews[crewId]?.scrap || 0;
}

export function addCrewScrap(crewId, amount) {
    const save = loadSave();
    if (!save.crews[crewId]) save.crews[crewId] = { missionProgress: 0, bossUnlocked: false };
    save.crews[crewId].scrap = (save.crews[crewId].scrap || 0) + amount;
    saveSave(save);
}

export function deductCrewScrap(crewId, amount) {
    const save = loadSave();
    if (!save.crews[crewId]) save.crews[crewId] = { missionProgress: 0, bossUnlocked: false };
    save.crews[crewId].scrap = Math.max(0, (save.crews[crewId].scrap || 0) - amount);
    saveSave(save);
}

export function getCrewProgress(crewId) {
    const save = loadSave();
    return save.crews[crewId] || { missionProgress: 0, bossUnlocked: false };
}

export function setCrewMissionProgress(crewId, missionIdx) {
    const save = loadSave();
    if (!save.crews) save.crews = {};
    if (!save.crews[crewId]) save.crews[crewId] = { missionProgress: 0, bossUnlocked: false };
    if (missionIdx + 1 > (save.crews[crewId].missionProgress || 0)) {
        save.crews[crewId].missionProgress = missionIdx + 1;
    }
    if (missionIdx + 1 >= 5) {
        save.crews[crewId].bossUnlocked = true;
    }
    saveSave(save);
}

export function isBossUnlocked(crewId) {
    const save = loadSave();
    return !!(save.crews && save.crews[crewId] && save.crews[crewId].bossUnlocked);
}

export function isCrewComplete(crewId) {
    const save = loadSave();
    return !!(save.crews && save.crews[crewId] && save.crews[crewId].missionProgress >= 5);
}

export function isCarFullyMaxed(carType) {
    const p = loadSave()[carType];
    if (!p || !p.upgrades) return false;
    for (const def of UPGRADE_DEFS) {
        const level = p.upgrades[def.id] || 0;
        if (level < 5) return false;
    }
    return true;
}

export function isCrewFullyMaxed(crewId) {
    const crew = CREWS[crewId];
    if (!crew || crew.cars.length === 0) return false;
    for (const c of crew.cars) {
        if (!isCarFullyMaxed(c)) return false;
    }
    if (crew.boss && !isCarFullyMaxed(crew.boss)) return false;
    return true;
}

export function getMissionDefs(carType, prestige = 0) {
    const crewId = getCarCrew(carType);
    const base = crewId ? CREWS[crewId].missions : null;
    if (!base) return null;
    return base.map(m => ({
        ...m,
        enemyCount: m.enemyCount + prestige * 2,
        scrapReward: Math.floor(m.scrapReward * (1 + prestige * 0.25)),
        desc: m.desc + (prestige > 0 ? ` [+${prestige}]` : '')
    }));
}

export function getUpgradeLevel(progress, upgradeId) {
    return progress.upgrades[upgradeId] || 0;
}

export function setUpgradeLevel(progress, upgradeId, level) {
    progress.upgrades[upgradeId] = level;
}

export function getTotalScrap(progress) {
    let total = 0;
    for (const def of UPGRADE_DEFS) {
        const level = getUpgradeLevel(progress, def.id);
        const costs = TIER_COSTS[def.tier];
        for (let i = 0; i < level; i++) total += costs[i];
    }
    return total;
}
