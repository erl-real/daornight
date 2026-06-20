import { CONFIG } from './Config.js';

export const carKeys = ['beachbug', 'foodtruck', 'beachpartyvan', 'hovercar', 'rover', 'rv', 'sidecarbike', 'ratrod', 'amrtruck', 'sprintracer', 'bladecybercar', '12-servervan', 'aicop', 'policecar', 'grappler', 'f2', 'rally', 'livsuper', 'bowcar', 'muscle', 'willys', 'mini', 'sportssuper', 'van', 'rougeai', 'scorp', 'nado', '4door', '61lowrider', 'tourbus', 'forklift', 'flagtruck', 'mixer', 'miramar', 'democharger', 'semi', 'voidbike', 'voidcar', 'tractor', 'oldrace', 'spycar', 'redrum', 'planecar', 'humher', 'schoolbus', 'yellowelstang', 'rocketcar', 'wolfstreet', 'bumsboss', 'z2-ufo', 'ratsboss', 'hackerboss', 'policeboss', 'jammonsterboss', 'junkboss', 'cuteboss', 'finaltank', 'bigboss', 'cranetruck', 'demoboss', 'voidboss', 'radioboss', 'armyboss', 'prostreetboss', '35-impala'];

export const DRIVERS = {
    0: [{ name: 'DEV' }],
    1: [{ name: 'TEAM 1 A' }, { name: 'TEAM 1 B' }, { name: 'TEAM 1 C' }],
    2: [{ name: 'TEAM 2 A' }, { name: 'TEAM 2 B' }, { name: 'TEAM 2 C' }],
    3: [{ name: 'TEAM 3 A' }, { name: 'TEAM 3 B' }, { name: 'TEAM 3 C' }],
    4: [{ name: 'TEAM 4 A' }, { name: 'TEAM 4 B' }, { name: 'TEAM 4 C' }],
    5: [{ name: 'TEAM 5 A' }, { name: 'TEAM 5 B' }, { name: 'TEAM 5 C' }],
    6: [{ name: 'TEAM 6 A' }, { name: 'TEAM 6 B' }, { name: 'TEAM 6 C' }],
    7: [{ name: 'TEAM 7 A' }, { name: 'TEAM 7 B' }, { name: 'TEAM 7 C' }],
    8: [{ name: 'TEAM 8 A' }, { name: 'TEAM 8 B' }, { name: 'TEAM 8 C' }],
    9: [{ name: 'TEAM 9 A' }, { name: 'TEAM 9 B' }, { name: 'TEAM 9 C' }],
    10: [{ name: 'TEAM 10 A' }, { name: 'TEAM 10 B' }, { name: 'TEAM 10 C' }],
    11: [{ name: 'TEAM 11 A' }, { name: 'TEAM 11 B' }, { name: 'TEAM 11 C' }],
    12: [{ name: 'TEAM 12 A' }, { name: 'TEAM 12 B' }, { name: 'TEAM 12 C' }],
    13: [{ name: 'TEAM 13 A' }, { name: 'TEAM 13 B' }, { name: 'TEAM 13 C' }],
    14: [{ name: 'TEAM 14 A' }, { name: 'TEAM 14 B' }, { name: 'TEAM 14 C' }],
    15: [{ name: 'TEAM 15 A' }, { name: 'TEAM 15 B' }, { name: 'TEAM 15 C' }],
    16: [{ name: 'TEAM 16 A' }, { name: 'TEAM 16 B' }, { name: 'TEAM 16 C' }]
};

export let currentCarIdx = 0;
export let currentDriverIdx = 0;
export let currentCar = carKeys[0];

function getCarTeam(type) {
    const carData = CONFIG.CARS[type];
    return carData ? carData.team : 0;
}

function getTeamDrivers(team) {
    return DRIVERS[team] || DRIVERS[0];
}

export function updateDriverDisplay() {
    const team = getCarTeam(window.currentCar || currentCar);
    const drivers = getTeamDrivers(team);
    const driver = drivers[currentDriverIdx] || drivers[0];
    const nameEl = document.getElementById('driver-name-display');
    if (nameEl) nameEl.innerText = driver.name;

    let folder = window.currentCar || currentCar;
    if (folder === 'z2-ufo') folder = '35-impala';
    const artEl = document.getElementById('character-art');
    if (artEl) artEl.style.backgroundImage = `url('objects/cars/${folder}/1.png')`;
}

export function selectDriver(delta) {
    const team = getCarTeam(window.currentCar || currentCar);
    const drivers = getTeamDrivers(team);
    currentDriverIdx = (currentDriverIdx + delta + drivers.length) % drivers.length;
    updateDriverDisplay();
}

export function selectCar(type) {
    window.currentCar = type;
    currentCar = type;
    const carData = CONFIG.CARS[type] || CONFIG.CARS['35-impala'];

    if (document.getElementById('car-name-display')) {
        document.getElementById('car-name-display').innerText = carData.name.toUpperCase();
    }

    const descEl = document.getElementById('car-description');
    if (descEl) {
        const team = carData.team !== undefined ? `TEAM ${carData.team}` : '';
        const cls = carData.class ? carData.class.toUpperCase() : '';
        descEl.innerText = [team, cls].filter(Boolean).join(' - ');
    }

    const ultEl = document.getElementById('car-ult-desc');
    if (ultEl) ultEl.innerText = carData.ult ? `ULT: ${carData.ult}` : '';

    const statsEl = document.getElementById('car-stats');
    if (statsEl) statsEl.innerText = '';

    // Auto-switch driver to match car class: Light→A(0), Medium→B(1), Heavy→C(2)
    const cls = carData.class ? carData.class.toLowerCase() : '';
    if (cls === 'boss') {
        // Boss cars keep current driver (any team driver works)
    } else if (cls === 'light') {
        currentDriverIdx = 0;
    } else if (cls === 'medium') {
        currentDriverIdx = 1;
    } else if (cls === 'heavy') {
        currentDriverIdx = 2;
    } else {
        currentDriverIdx = 0;
    }

    updateDriverDisplay();
    if (window.arcadePreview) window.arcadePreview.setCar(type);
}

window.selectCar = selectCar;
window.selectCarGlobal = (type) => { selectCar(type); if (window.multiplayerMenu) window.multiplayerMenu.setCar(type); };

window.nextCarIndex = () => { currentCarIdx = (currentCarIdx + 1) % carKeys.length; selectCar(carKeys[currentCarIdx]); };
window.prevCarIndex = () => { currentCarIdx = (currentCarIdx - 1 + carKeys.length) % carKeys.length; selectCar(carKeys[currentCarIdx]); };
window.nextDriverIndex = () => { selectDriver(1); };
window.prevDriverIndex = () => { selectDriver(-1); };

window.updateMapSelection = (el) => {
    const parent = el.parentNode;
    parent.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
};
