import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MenuGL } from '../objects/menu/MenuGL.js';
import { CONFIG } from './Config.js';
import { getCarProgress, UPGRADE_DEFS } from './StoryData.js';
import { LoadingUI } from './LoadingUI.js';
import { selectCar } from './CarSelect.js';
import { ArcadePreview } from './ArcadePreview.js';
import { MenuMusicManager, MENU_MUSIC_TRACKS, DEFAULT_AUDIO_SETTINGS, AUDIO_SETTINGS_KEY, loadRadioStations, updateRadioUI } from './MenuMusicManager.js';
import { MultiplayerMenu } from './MultiplayerMenu.js';

const arcadePreview = new ArcadePreview();
window.arcadePreview = arcadePreview;
let multiplayerMenu = null;
let menuGL = null;
window.currentCar = 'beachbug';
window.aiDifficulty = 'hard';
window.aiCount = 5;

const MAP_CONFIGS = {
    'ball': 'BALL PROVING GROUNDS',
    'city': 'CITY (DAY)',
    'dev': 'DEV RANGE',
    'greyhills': 'GREYHILLS',
    'riverbanks': 'RIVERBANKS',
    'deport': 'DEPORT',
    'redballoons': 'REDBALLOONS',
    'area51': 'AREA 51',
    'antarctica': 'ANTARCTICA',
    'canyon': 'CANYON',
    'prison': 'PRISON',
    'trailerpark': 'TRAILER PARK',
    'castle': 'CASTLE',
    'airport': 'AIRPORT',
    'raceden': 'RACE DEN',
    'dragtrack': 'DRAG TRACK',
    'nascar': 'NASCAR OVAL',
    'drivein': 'DRIVE-IN',
    'underwater': 'UNDERWATER CITY',
    'dish': 'ARECIBO DISH'
};
const mapKeys = Object.keys(MAP_CONFIGS);
let currentMapIdx = 0;
window.currentMap = 'ball';

window.nextMapIndex = () => {
    currentMapIdx = (currentMapIdx + 1) % mapKeys.length;
    selectMap(mapKeys[currentMapIdx]);
};
window.prevMapIndex = () => {
    currentMapIdx = (currentMapIdx - 1 + mapKeys.length) % mapKeys.length;
    selectMap(mapKeys[currentMapIdx]);
};

window.selectMap = (key) => {
    window.currentMap = key;
    const display = document.getElementById('map-name-display');
    if (display) display.innerText = MAP_CONFIGS[key];
};

window.customPlaylist = [];
window.radioStations = loadRadioStations();

window.setMusicSource = (source) => {
    if (window.menuMusic) window.menuMusic.setSource(source);
};

function loadSharedAudioSettings() {
    try {
        const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
        return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(raw) };
    } catch (err) {
        return { ...DEFAULT_AUDIO_SETTINGS };
    }
}

window.sharedAudioSettings = loadSharedAudioSettings();

const menuMusic = new MenuMusicManager(MENU_MUSIC_TRACKS);
window.menuMusic = menuMusic;

function persistSharedAudioSettings() {
    try {
        localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(window.sharedAudioSettings));
    } catch (err) {}
}

window.applySharedAudioSettingsToGame = function() {
    const audio = window.game && window.game.audio;
    if (!audio) return;
    audio.setMasterVolume(window.sharedAudioSettings.master);
    audio.setMusicVolume(window.sharedAudioSettings.music);
    audio.setSfxVolume(window.sharedAudioSettings.sfx);
    audio.toggleAudioDrive(window.sharedAudioSettings.driveEnabled);
    audio.setDriveStrength(window.sharedAudioSettings.driveStrength);
    audio.vizActive = !!window.sharedAudioSettings.viz;
};

function syncSharedAudioUI() {
    document.querySelectorAll('[data-audio-setting]').forEach((el) => {
        const key = el.dataset.audioSetting;
        const value = window.sharedAudioSettings[key];
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value;
    });
}
window.syncSharedAudioUI = syncSharedAudioUI;

function setSharedAudioSetting(key, value) {
    window.sharedAudioSettings[key] = value;
    persistSharedAudioSettings();
    syncSharedAudioUI();
    window.applySharedAudioSettingsToGame();
    if (window.menuMusic) window.menuMusic.applyVolume();
}

function bindSharedAudioSettingsUI() {
    document.querySelectorAll('[data-audio-setting]').forEach((el) => {
        if (el.dataset.boundAudio === '1') return;
        const eventName = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            const key = el.dataset.audioSetting;
            const value = el.type === 'checkbox' ? el.checked : (['master', 'menuMusic', 'music', 'sfx'].includes(key) ? Number(el.value) : el.value);
            setSharedAudioSetting(key, value);
        });
        el.dataset.boundAudio = '1';
    });
    syncSharedAudioUI();
}

window.stepSharedTrack = (dir) => {
    if (window.game && window.game.audio) {
        if (dir < 0) window.game.audio.prevTrack();
        else window.game.audio.nextTrack();
        if (window.game.updatePauseSongName) window.game.updatePauseSongName();
        return;
    }
    if (!window.menuMusic) return;
    if (dir < 0) window.menuMusic.prevTrack();
    else window.menuMusic.nextTrack();
};

window.openPauseControlLayout = (layout) => {
    document.querySelectorAll('[data-control-layout-tab]').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.controlLayoutTab === layout);
    });
    document.querySelectorAll('[data-control-layout-panel]').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.controlLayoutPanel === layout);
    });
};

function updateVisibleSunStates() {
    document.querySelectorAll('.blackhole-sun-container').forEach((sun) => {
        sun.classList.remove('sun-active');
    });
    const visibleMenuSun = document.querySelector('.menu-container:not(.hidden) .blackhole-sun-container');
    if (visibleMenuSun && document.getElementById('menu-layer').style.display !== 'none') {
        visibleMenuSun.classList.add('sun-active');
    }
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu && pauseMenu.style.display !== 'none') {
        pauseMenu.querySelectorAll('.blackhole-sun-container').forEach((sun) => {
            sun.classList.add('sun-active');
        });
    }
}
window.updateVisibleSunStates = updateVisibleSunStates;

window.showSubMenu = (id) => {
    if (!window.game && !window._plCustomPreviewActive && window.menuMusic) window.menuMusic.enable();

    if (id === 'multiplayer-menu') {
        document.querySelectorAll('.menu-container').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById('multiplayer-menu');
        if (target) target.classList.remove('hidden');
        document.getElementById('webgl-canvas').style.display = 'none';
        setLetterboxMainMenuState(false);
        arcadePreview.active = false;
        if (!multiplayerMenu) { multiplayerMenu = new MultiplayerMenu(); window.multiplayerMenu = multiplayerMenu; }
        multiplayerMenu.active = true;
        multiplayerMenu.setCar(window.currentCar);
        updateVisibleSunStates();
        return;
    }

    if (id === 'vehicle-select-menu' && window._mpCarSelect) {
        document.getElementById('webgl-canvas').style.display = 'block';
    }

    const currentMenu = document.querySelector('.menu-container:not(.hidden)');
    const switchMenu = () => {
        const sectionMap = { 'main-menu': 0, 'story-car-select-menu': 1, 'arcade-menu': 1, 'settings-menu': 1, 'vehicle-select-menu': 2, 'car-setup-menu': 3, 'parkinglot-menu': 1 };
        const depthMap = { 'main-menu': 1, 'story-car-select-menu': 2, 'arcade-menu': 2, 'settings-menu': 2, 'vehicle-select-menu': 3, 'car-setup-menu': 4, 'parkinglot-menu': 2 };
        const idx = sectionMap[id];
        const depth = depthMap[id];

        if (multiplayerMenu) multiplayerMenu.active = false;
        document.getElementById('webgl-canvas').style.display = 'block';
        if (menuGL && depth) menuGL.setDepth(depth);
        if (idx !== undefined && menuGL) {
            menuGL.activeIdx = idx;
            const targetSection = document.getElementById(`s${idx}`);
            if (targetSection) menuGL.smoothScrollToY(targetSection.offsetTop);
        }
        document.querySelectorAll('.menu-container').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('menu-flip-out');
        });
        const target = document.getElementById(id);
        if (target) {
            target.classList.remove('hidden');
        }
        setLetterboxMainMenuState(id === 'main-menu');
        arcadePreview.active = (id === 'vehicle-select-menu');
        if (id === 'settings-menu') setTimeout(() => { _settingsFocusIdx = 0; _settingsTabIdx = 0; openSettingsTab('controls'); }, 50);
        if (id === 'parkinglot-menu') {
            const el = document.getElementById('pl-car-name');
            if (el) el.textContent = CONFIG.CARS[window.currentCar]?.name || window.currentCar;
            renderParkingLotSongList();
        }
        if (arcadePreview.active) setTimeout(() => { arcadePreview.updateSize(); selectCar(window.currentCar); }, 50);
        MenuController.selectedIndex = 0;
        _carSetupFocus = 0;
        updateVisibleSunStates();
        _lastHintKey = '';
        setTimeout(() => MenuController.updateSelection(), 100);
    };

    if (currentMenu && currentMenu.id !== id) {
        currentMenu.classList.add('menu-flip-out');
        setTimeout(switchMenu, 400);
    } else {
        switchMenu();
    }
};

const MenuController = {
    selectedIndex: 0,
    isLocked: true,
    getVisibleMenu() { return document.querySelector('.menu-container:not(.hidden)'); },
    getOptions() { const menu = this.getVisibleMenu(); if (!menu) return []; return Array.from(menu.querySelectorAll('.option, .back-btn, .arrow-btn')).filter(el => el.offsetParent !== null); },
    updateSelection() { const options = this.getOptions(); options.forEach((opt, i) => { opt.classList.toggle('selected', i === this.selectedIndex); }); },
    moveSelection(dir) {
        if (this.isLocked) return;
        const options = this.getOptions();
        if (options.length === 0) return;
        this.selectedIndex = (this.selectedIndex + dir + options.length) % options.length;
        this.updateSelection();
    },
    confirm() {
        if (this.isLocked) return;
        const options = this.getOptions();
        if (options[this.selectedIndex]) options[this.selectedIndex].click();
    },
    back() {
        if (this.isLocked) return;
        const menu = this.getVisibleMenu();
        if (!menu || menu.id === 'main-menu') return;
        const backBtn = menu.querySelector('[data-action="back"]');
        if (backBtn) backBtn.click();
    },
    next() {
        if (this.isLocked) return;
        const menu = this.getVisibleMenu();
        if (!menu) return;
        const nextBtn = menu.querySelector('[data-action="next"]');
        if (nextBtn) nextBtn.click();
    }
};

let menuInputCooldown = 0;
let _lastHintKey = '';
function updateControllerHints() {
    const gp = Array.from(navigator.getGamepads()).find(g => g !== null);
    const connected = !!gp;
    const menuId = document.querySelector('.menu-container:not(.hidden)')?.id || '';
    const key = connected + '-' + menuId;
    if (key === _lastHintKey) return;
    _lastHintKey = key;
    document.body.classList.toggle('controller-active', connected);
    document.querySelectorAll('[data-action="back"]:not(.mp-back-btn)').forEach(el => {
        if (el.closest('#multiplayer-menu')) return;
        const label = el.dataset.label || 'BACK';
        el.innerHTML = connected ? '○ <span>' + label + '</span>' : '&lt; ' + label;
    });
    document.querySelectorAll('[data-action="next"]').forEach(el => {
        if (el.closest('#multiplayer-menu')) return;
        const label = el.dataset.label || 'NEXT';
        el.innerHTML = connected ? '<span>' + label + '</span> ▶' : label + ' &gt;';
    });
}
let _carSetupFocus = 0;
function handleCarSetupGamepad(gp) {
    const groups = document.querySelectorAll('#car-setup-menu [data-focusable]');
    if (!groups.length) return false;
    groups.forEach((el, i) => el.classList.toggle('focused', i === _carSetupFocus));
    if (gp.buttons[12]?.pressed) { _carSetupFocus = (_carSetupFocus - 1 + groups.length) % groups.length; menuInputCooldown = 15; return true; }
    if (gp.buttons[13]?.pressed) { _carSetupFocus = (_carSetupFocus + 1) % groups.length; menuInputCooldown = 15; return true; }
    if (gp.buttons[14]?.pressed || gp.buttons[0]?.pressed) {
        if (_carSetupFocus === 0) {
            const sel = document.getElementById('ai-difficulty-select');
            if (sel && sel.selectedIndex > 0) { sel.selectedIndex--; sel.dispatchEvent(new Event('change')); }
        } else {
            const btn = document.querySelector('#car-setup-menu .arrow-btn');
            if (btn) btn.click();
        }
        menuInputCooldown = 20; return true;
    }
    if (gp.buttons[15]?.pressed) {
        if (_carSetupFocus === 0) {
            const sel = document.getElementById('ai-difficulty-select');
            if (sel && sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; sel.dispatchEvent(new Event('change')); }
        } else {
            const btns = document.querySelectorAll('#car-setup-menu .arrow-btn');
            if (btns.length > 1) btns[1].click();
        }
        menuInputCooldown = 20; return true;
    }
    return false;
}
let _settingsFocusIdx = 0;
let _settingsTabIdx = 0;
const SETTINGS_TABS = ['controls', 'audio', 'music', 'video', 'dev', 'account', 'wiki'];

function getSettingsFocusables() {
    const panel = document.querySelector('#settings-menu .settings-panel:not(.hidden)');
    if (!panel) return [];
    const el = panel.querySelectorAll('input, select, button, label, .back-btn');
    return Array.from(el).filter(e => e.offsetParent !== null);
}

function handleSettingsGamepad(gp) {
    const m = document.getElementById('settings-menu');
    if (!m || m.classList.contains('hidden')) return false;

    // L1/R1 switch tabs
    if (gp.buttons[4]?.pressed) {
        _settingsTabIdx = (_settingsTabIdx - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        openSettingsTab(SETTINGS_TABS[_settingsTabIdx]);
        _settingsFocusIdx = 0;
        menuInputCooldown = 20;
        return true;
    }
    if (gp.buttons[5]?.pressed) {
        _settingsTabIdx = (_settingsTabIdx + 1) % SETTINGS_TABS.length;
        openSettingsTab(SETTINGS_TABS[_settingsTabIdx]);
        _settingsFocusIdx = 0;
        menuInputCooldown = 20;
        return true;
    }

    // D-pad left/right on tabs to switch too
    if (gp.buttons[14]?.pressed) {
        _settingsTabIdx = (_settingsTabIdx - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
        openSettingsTab(SETTINGS_TABS[_settingsTabIdx]);
        _settingsFocusIdx = 0;
        menuInputCooldown = 20;
        return true;
    }
    if (gp.buttons[15]?.pressed) {
        _settingsTabIdx = (_settingsTabIdx + 1) % SETTINGS_TABS.length;
        openSettingsTab(SETTINGS_TABS[_settingsTabIdx]);
        _settingsFocusIdx = 0;
        menuInputCooldown = 20;
        return true;
    }

    const focusables = getSettingsFocusables();
    if (focusables.length === 0) return false;

    // D-pad up/down
    if (gp.buttons[12]?.pressed) {
        _settingsFocusIdx = (_settingsFocusIdx - 1 + focusables.length) % focusables.length;
        menuInputCooldown = 15;
        focusables[_settingsFocusIdx]?.focus?.();
        return true;
    }
    if (gp.buttons[13]?.pressed) {
        _settingsFocusIdx = (_settingsFocusIdx + 1) % focusables.length;
        menuInputCooldown = 15;
        focusables[_settingsFocusIdx]?.focus?.();
        return true;
    }

    // X/A to activate
    if (gp.buttons[0]?.pressed) {
        const el = focusables[_settingsFocusIdx];
        if (el) {
            if (el.tagName === 'SELECT') { el.focus(); el.click(); }
            else if (el.tagName === 'LABEL') { const cb = el.querySelector('input[type="checkbox"]'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } }
            else if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
            else el.click();
        }
        menuInputCooldown = 25;
        return true;
    }

    // Circle/B to go back
    if (gp.buttons[1]?.pressed) {
        const backBtn = m.querySelector('.back-btn');
        if (backBtn) backBtn.click();
        menuInputCooldown = 25;
        return true;
    }

    return false;
}

function updateMenuGamepad() {
    requestAnimationFrame(updateMenuGamepad);
    if (document.getElementById('game-layer').style.display === 'block') return;
    updateControllerHints();
    const gp = Array.from(navigator.getGamepads()).find(g => g !== null);
    if (menuInputCooldown > 0) { menuInputCooldown--; return; }
    if (!gp) return;
    const m = MenuController.getVisibleMenu();
    if (m && m.id === 'settings-menu' && handleSettingsGamepad(gp)) return;
    if (m && m.id === 'car-setup-menu' && handleCarSetupGamepad(gp)) return;
    if (m && m.id === 'parkinglot-menu') {
        if (gp.buttons[12]?.pressed) { window._plHandleNav(-1); menuInputCooldown = 15; return; }
        if (gp.buttons[13]?.pressed) { window._plHandleNav(1); menuInputCooldown = 15; return; }
    }
    if (gp.buttons[12]?.pressed) { MenuController.moveSelection(-1); menuInputCooldown = 15; }
    else if (gp.buttons[13]?.pressed) { MenuController.moveSelection(1); menuInputCooldown = 15; }
    else if (gp.buttons[0]?.pressed) {
        if (m && m.id === 'arcade-menu') MenuController.next();
        else if (m && m.id === 'vehicle-select-menu') { if (window.arcadePreview) window.arcadePreview.fireUlt(); }
        else MenuController.confirm();
        menuInputCooldown = 25;
    }
    else if (gp.buttons[1]?.pressed) { MenuController.back(); menuInputCooldown = 25; }
    else if (gp.buttons[9]?.pressed) { MenuController.next(); menuInputCooldown = 25; }
    else if (gp.buttons[14]?.pressed) { if (m) { const a = Array.from(m.querySelectorAll('.arrow-btn')).filter(el => el.offsetParent !== null); if (a.length) { a[0].click(); menuInputCooldown = 15; } } }
    else if (gp.buttons[15]?.pressed) { if (m) { const a = Array.from(m.querySelectorAll('.arrow-btn')).filter(el => el.offsetParent !== null); if (a.length) { a[a.length-1].click(); menuInputCooldown = 15; } } }
}
updateMenuGamepad();

let storyPreview = null;

function renderStoryStats(carType) {
    const list = document.getElementById('story-stats-list');
    if (!list) return;
    list.innerHTML = '';
    const carConfig = CONFIG.CARS[carType] || CONFIG.CARS['35-impala'];
    const progress = getCarProgress(carType);
    const upgrades = progress.upgrades || {};

    for (const def of UPGRADE_DEFS) {
        const level = upgrades[def.id] || 0;
        const isMaxed = level >= 5;
        const baseVal = carConfig.stats?.[def.baseKey] ?? 1;
        let totalBonus = 0;
        for (let i = 0; i < level; i++) totalBonus += def.values[i];
        const finalVal = def.isPct ? baseVal * (1 + totalBonus) : baseVal + totalBonus;
        const displayFinal = def.isPct ? (finalVal * 100).toFixed(1) + '%' : finalVal.toFixed(def.suffix === ' HP' ? 0 : 1) + (def.suffix || '');
        const pct = level / 5 * 100;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.75em;';
        row.innerHTML = `
            <div style="width:80px;flex-shrink:0;color:#aaa;">${def.name}</div>
            <div style="flex:1;height:12px;background:rgba(255,255,255,0.08);border-radius:6px;position:relative;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${isMaxed ? '#ffd700' : '#0af'};border-radius:6px;transition:width 0.3s;"></div>
                ${[20,40,60,80].map(p => `<div style="position:absolute;top:0;left:${p}%;width:2px;height:100%;background:${level * 20 >= p ? '#0f0' : 'rgba(255,255,255,0.15)'};"></div>`).join('')}
            </div>
            <div style="width:65px;text-align:right;color:${isMaxed ? '#ffd700' : '#fff'};">${displayFinal}</div>
        `;
        list.appendChild(row);
    }
}

window.selectStoryCar = async function(carType) {
    window._storySelectedCar = carType;
    const panel = document.getElementById('story-right-panel');
    if (panel) panel.style.display = 'flex';
    const label = document.getElementById('story-driver-name');
    const startBtn = document.getElementById('story-start-btn');
    if (label) label.textContent = CONFIG.CARS[carType]?.name || carType;
    if (startBtn) startBtn.style.display = 'block';

    renderStoryStats(carType);

    if (!storyPreview) {
        storyPreview = new ArcadePreview('story-preview-container');
    }
    storyPreview.active = true;
    setTimeout(() => storyPreview.setCar(carType), 50);
};

function setMiniLogoSVG(crewId) {
    const el = document.getElementById('story-mini-logo');
    if (!el) return;
    const svgs = {
        sun: '<svg viewBox="0 0 100 100" width="36" height="36" style="filter:drop-shadow(0 0 4px currentColor);"><circle cx="50" cy="50" r="18" fill="currentColor"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><line x1="50" y1="6" x2="50" y2="22"/><line x1="50" y1="78" x2="50" y2="94"/><line x1="6" y1="50" x2="22" y2="50"/><line x1="78" y1="50" x2="94" y2="50"/><line x1="14" y1="14" x2="26" y2="26"/><line x1="74" y1="74" x2="86" y2="86"/><line x1="86" y1="14" x2="74" y2="26"/><line x1="26" y1="74" x2="14" y2="86"/></g></svg>',
        moon: '<svg viewBox="0 0 100 100" width="36" height="36" style="filter:drop-shadow(0 0 4px currentColor);"><path d="M60 15 A40 40 0 1 0 60 85 A30 30 0 1 1 60 15Z" fill="currentColor"/></svg>',
        rat: '',
        hacker: '',
        cops: '<svg viewBox="0 0 100 100" width="36" height="36" style="filter:drop-shadow(0 0 4px currentColor);"><path d="M50 15 A35 35 0 1 0 50 85 A35 35 0 1 0 50 15Z" fill="currentColor"/><circle cx="50" cy="50" r="14" fill="#111"/><circle cx="50" cy="48" r="3" fill="currentColor"/><circle cx="45" cy="45" r="1.5" fill="#111"/><circle cx="55" cy="45" r="1.5" fill="#111"/></svg>',
        jam: '',
        junk: '',
        cute: '',
        final: '',
        outcast: '',
        wasted: '',
        demo: '',
        void: '',
        kings: '',
        fold: '',
        prostreet: '',
        wcrew: '',
        rich: '',
        dev: ''
    };
    el.innerHTML = svgs[crewId] || '';
}

function disposeStoryPreview() {
    if (storyPreview) {
        storyPreview.active = false;
        if (storyPreview.renderer && storyPreview.renderer.domElement && storyPreview.renderer.domElement.parentNode) {
            storyPreview.renderer.domElement.parentNode.removeChild(storyPreview.renderer.domElement);
        }
        storyPreview = null;
    }
    // Also clear any leftover canvases in the preview container
    const container = document.getElementById('story-preview-container');
    if (container) {
        while (container.firstChild) container.removeChild(container.firstChild);
    }
}

window._selectedCrew = 'beach';

function updateCrewLogo(crewId) {
    import('./StoryData.js').then(sd => {
        const crew = sd.CREWS[crewId];
        if (!crew) return;
        const crewProgress = sd.getCrewProgress(crewId);
        const mp = crewProgress.missionProgress || 0;
        const crewComplete = mp >= 5;
        const fullyMaxed = sd.isCrewFullyMaxed(crewId);

        const logoMap = { sun: 'story-sun-logo', moon: 'story-moon-logo', rat: 'story-rat-logo', hacker: 'story-hacker-logo', cops: 'story-cops-logo', jam: 'story-jam-logo', junk: 'story-junk-logo', cute: 'story-cute-logo', final: 'story-infected-logo', outcast: 'story-outcast-logo', wasted: 'story-wasted-logo', demo: 'story-demo-logo', void: 'story-void-logo', kings: 'story-kings-logo', fold: 'story-fold-logo', prostreet: 'story-prostreet-logo', wcrew: 'story-wcrew-logo', rich: 'story-rich-logo', dev: 'story-dev-logo' };
        const logoId = logoMap[crew.icon] || 'story-sun-logo';
        const isEmpty = crew.cars.length === 0;
        const logo = document.getElementById(logoId);
        if (logo) {
            if (isEmpty) {
                logo.style.color = '#555';
                logo.style.borderColor = '#555';
                logo.style.boxShadow = 'none';
            } else if (fullyMaxed) {
                logo.style.color = '#ffd700';
                logo.style.borderColor = '#ffd700';
                logo.style.boxShadow = '0 0 20px #ffd70044';
            } else if (crewComplete) {
                logo.style.color = '#c0c0c0';
                logo.style.borderColor = '#c0c0c0';
                logo.style.boxShadow = '0 0 15px #c0c0c044';
            } else {
                logo.style.color = '#0af';
                logo.style.borderColor = '#0af';
                logo.style.boxShadow = 'none';
            }
        }

        const statusMap = { beach: 'story-beach-status', moon: 'story-moon-status', rat: 'story-rat-status', hacker: 'story-hacker-status', cops: 'story-cops-status', jam: 'story-jam-status', junk: 'story-junk-status', cute: 'story-cute-status', final: 'story-infected-status', outcast: 'story-outcast-status', wasted: 'story-wasted-status', demo: 'story-demo-status', void: 'story-void-status', kings: 'story-kings-status', fold: 'story-fold-status', prostreet: 'story-prostreet-status', wcrew: 'story-wcrew-status', rich: 'story-rich-status', dev: 'story-dev-status' };
        const statusId = statusMap[crewId];
        const statusEl = document.getElementById(statusId);
        if (statusEl) {
            if (isEmpty) {
                statusEl.textContent = '???';
                statusEl.style.color = '#555';
            } else if (fullyMaxed) {
                statusEl.textContent = 'ALL MAXED';
                statusEl.style.color = '#ffd700';
            } else if (crewComplete) {
                statusEl.textContent = '✓ STORY COMPLETE';
                statusEl.style.color = '#c0c0c0';
            } else {
                statusEl.textContent = `MISSION ${mp + 1} / 5`;
                statusEl.style.color = '#0af';
            }
        }
    });
}

// Hook into the menu system - reset story menu when opened
const origShowSubMenu = window.showSubMenu;
window.showSubMenu = function(id) {
    origShowSubMenu(id);
    if (id === 'story-car-select-menu') {
        disposeStoryPreview();
        const initView = document.getElementById('story-initial-view');
        const expandedView = document.getElementById('story-expanded-view');
        const rightPanel = document.getElementById('story-right-panel');
        const startBtn = document.getElementById('story-start-btn');
        if (initView) initView.style.display = 'flex';
        if (expandedView) expandedView.style.display = 'none';
        if (rightPanel) rightPanel.style.display = 'none';
        if (startBtn) startBtn.style.display = 'none';
        updateCrewLogo('beach');
        updateCrewLogo('moon');
        updateCrewLogo('rat');
        updateCrewLogo('hacker');
        updateCrewLogo('cops');
        updateCrewLogo('jam');
        updateCrewLogo('junk');
        updateCrewLogo('cute');
        updateCrewLogo('final');
        updateCrewLogo('outcast');
        updateCrewLogo('wasted');
        updateCrewLogo('demo');
        updateCrewLogo('void');
        updateCrewLogo('kings');
        updateCrewLogo('fold');
        updateCrewLogo('prostreet');
        updateCrewLogo('wcrew');
        updateCrewLogo('rich');

        // Check if all crews are beaten to unlock dev crew
        import('./StoryData.js').then(sd => {
            const allDone = Object.keys(sd.CREWS).filter(k => k !== 'dev' && k !== 'wcrew' && k !== 'rich').every(k => {
                const cp = sd.getCrewProgress(k);
                return cp.missionProgress >= 5;
            });
            const wrapper = document.getElementById('story-dev-crew-wrapper');
            if (wrapper) {
                wrapper.style.display = allDone ? 'flex' : 'none';
                if (allDone) updateCrewLogo('dev');
            }
        });
    }
};

// Crew prev/next arrows in expanded view
document.getElementById('story-crew-prev')?.addEventListener('click', () => switchCrew(-1));
document.getElementById('story-crew-next')?.addEventListener('click', () => switchCrew(1));

async function switchCrew(dir) {
    const sd = await import('./StoryData.js');
    const devUnlocked = Object.keys(sd.CREWS).filter(k => k !== 'dev' && k !== 'wcrew' && k !== 'rich').every(k => sd.getCrewProgress(k).missionProgress >= 5);
    const crewIds = Object.keys(sd.CREWS).filter(k => {
        if (k === 'wcrew' || k === 'rich') return false;
        if (k === 'dev') return devUnlocked;
        return true;
    });
    const curIdx = crewIds.indexOf(window._selectedCrew);
    if (curIdx === -1) return;
    const nextIdx = (curIdx + dir + crewIds.length) % crewIds.length;
    const nextCrew = crewIds[nextIdx];

    // Simulate clicking that crew's logo
    const initView = document.getElementById('story-initial-view');
    const expandedView = document.getElementById('story-expanded-view');
    const rightPanel = document.getElementById('story-right-panel');
    if (initView) initView.style.display = 'none';
    if (expandedView) expandedView.style.display = 'flex';
    if (rightPanel) rightPanel.style.display = 'none';
    disposeStoryPreview();
    window._selectedCrew = nextCrew;
    setMiniLogoSVG(nextCrew);

    const crew = sd.CREWS[nextCrew];
    if (!crew) return;
    const bossUnlocked = sd.isBossUnlocked(nextCrew);
    const crewComplete = sd.getCrewProgress(nextCrew).missionProgress >= 5;
    const list = document.getElementById('story-car-list');
    const ngSection = document.getElementById('story-ng-section');

    const miniLogo = document.getElementById('story-mini-logo');
    const expCrewLabel = document.getElementById('story-exp-crew-label');
    const expCrewStatus = document.getElementById('story-exp-crew-status');
    if (miniLogo) {
        const fullyMaxed = sd.isCrewFullyMaxed(nextCrew);
        if (fullyMaxed) { miniLogo.style.color = '#ffd700'; miniLogo.style.borderColor = '#ffd700'; miniLogo.style.boxShadow = '0 0 10px #ffd70044'; }
        else if (crewComplete) { miniLogo.style.color = '#c0c0c0'; miniLogo.style.borderColor = '#c0c0c0'; miniLogo.style.boxShadow = '0 0 8px #c0c0c044'; }
        else { miniLogo.style.color = '#0af'; miniLogo.style.borderColor = '#0af'; miniLogo.style.boxShadow = 'none'; }
    }
    if (expCrewLabel) expCrewLabel.textContent = crew.name;
    if (expCrewStatus) {
        const cp = sd.getCrewProgress(nextCrew);
        const fullyMaxed = sd.isCrewFullyMaxed(nextCrew);
        if (fullyMaxed) expCrewStatus.textContent = 'ALL MAXED';
        else if (crewComplete) expCrewStatus.textContent = '✓ STORY COMPLETE';
        else expCrewStatus.textContent = `MISSION ${(cp.missionProgress || 0) + 1} / 5`;
        expCrewStatus.style.color = fullyMaxed ? '#ffd700' : crewComplete ? '#c0c0c0' : '#0af';
    }
    if (ngSection) ngSection.style.display = crewComplete ? 'flex' : 'none';

    if (list) {
        list.innerHTML = '';
        const allCars = [...crew.cars];
        if (crew.boss) allCars.push(crew.boss);
        for (const c of allCars) {
            const p = sd.getCarProgress(c);
            const pres = p.prestige || 0;
            const isBoss = c === crew.boss;
            const isLocked = !bossUnlocked && c === crew.boss;
            const isComplete = pres > 0;
            const bossMaxed = isBoss && sd.isCarFullyMaxed(c);
            let color = '';
            if (isLocked) color = 'color:#555;opacity:0.5;cursor:default;';
            else if (bossMaxed) color = 'color:#ffd700;';
            else if (isComplete && !isBoss) color = 'color:#0f0;';
            const div = document.createElement('div');
            div.className = 'option';
            div.style.cssText = `font-size:1em;padding:5px 10px;text-align:center;${color}`;
            div.textContent = `${isComplete ? '✓ ' : ''}${CONFIG.CARS[c]?.name || c}${isComplete ? ' COMPLETE' : ''}`;
            if (!isLocked) div.onclick = () => window.selectStoryCar(c);
            list.appendChild(div);
        }
        const firstUnlocked = allCars.find(c => c !== crew.boss || bossUnlocked);
        if (firstUnlocked) window.selectStoryCar(firstUnlocked);
    }
}

// Logo click → show expanded view + populate driver list for that crew
document.addEventListener('click', async (e) => {
    const logo = e.target.closest('[data-crew]');
    const miniSun = document.getElementById('story-mini-logo');
    const initView = document.getElementById('story-initial-view');
    const expandedView = document.getElementById('story-expanded-view');
    const rightPanel = document.getElementById('story-right-panel');

    // Mini sun click → back to initial
    if (miniSun && initView && expandedView && miniSun.contains(e.target) && expandedView.style.display === 'flex') {
        expandedView.style.display = 'none';
        initView.style.display = 'flex';
        disposeStoryPreview();
        return;
    }

    if (!logo || !initView || !expandedView) return;
    const crewId = logo.dataset.crew;
    if (expandedView.style.display === 'flex') return;

    window._selectedCrew = crewId;
    setMiniLogoSVG(crewId);

    initView.style.display = 'none';
    expandedView.style.display = 'flex';
    if (rightPanel) rightPanel.style.display = 'none';
    disposeStoryPreview();

    const sd = await import('./StoryData.js');
    const crew = sd.CREWS[crewId];
    if (!crew) return;
    const bossUnlocked = sd.isBossUnlocked(crewId);
    const crewComplete = sd.getCrewProgress(crewId).missionProgress >= 5;
    const list = document.getElementById('story-car-list');
    const ngSection = document.getElementById('story-ng-section');

    // Update expanded view header
    const miniLogo = document.getElementById('story-mini-logo');
    const expCrewLabel = document.getElementById('story-exp-crew-label');
    const expCrewStatus = document.getElementById('story-exp-crew-status');
    if (miniLogo) {
        const fullyMaxed = sd.isCrewFullyMaxed(crewId);
        if (fullyMaxed) {
            miniLogo.style.color = '#ffd700';
            miniLogo.style.borderColor = '#ffd700';
            miniLogo.style.boxShadow = '0 0 10px #ffd70044';
        } else if (crewComplete) {
            miniLogo.style.color = '#c0c0c0';
            miniLogo.style.borderColor = '#c0c0c0';
            miniLogo.style.boxShadow = '0 0 8px #c0c0c044';
        } else {
            miniLogo.style.color = '#0af';
            miniLogo.style.borderColor = '#0af';
            miniLogo.style.boxShadow = 'none';
        }
    }
    if (expCrewLabel) expCrewLabel.textContent = crew.name;
    if (expCrewStatus) {
        const cp = sd.getCrewProgress(crewId);
        const fullyMaxed = sd.isCrewFullyMaxed(crewId);
        if (fullyMaxed) expCrewStatus.textContent = 'ALL MAXED';
        else if (crewComplete) expCrewStatus.textContent = '✓ STORY COMPLETE';
        else expCrewStatus.textContent = `MISSION ${(cp.missionProgress || 0) + 1} / 5`;
        expCrewStatus.style.color = fullyMaxed ? '#ffd700' : crewComplete ? '#c0c0c0' : '#0af';
    }

    if (ngSection) ngSection.style.display = crewComplete ? 'flex' : 'none';

    if (list) {
        list.innerHTML = '';
        const allCars = [...crew.cars];
        if (crew.boss) allCars.push(crew.boss);

        for (const c of allCars) {
            const p = sd.getCarProgress(c);
            const pres = p.prestige || 0;
            const isBoss = c === crew.boss;
            const isLocked = !bossUnlocked && c === crew.boss;
            const isComplete = pres > 0;
            const bossMaxed = isBoss && sd.isCarFullyMaxed(c);
            let color = '';
            if (isLocked) color = 'color:#555;opacity:0.5;cursor:default;';
            else if (bossMaxed) color = 'color:#ffd700;';
            else if (isComplete && !isBoss) color = 'color:#0f0;';
            const div = document.createElement('div');
            div.className = 'option';
            div.style.cssText = `font-size:1em;padding:5px 10px;text-align:center;${color}`;
            div.textContent = `${isComplete ? '✓ ' : ''}${CONFIG.CARS[c]?.name || c}${isComplete ? ' COMPLETE' : ''}`;
            if (!isLocked) div.onclick = () => window.selectStoryCar(c);
            list.appendChild(div);
        }
        // Auto-select first unlocked car
        const firstUnlocked = allCars.find(c => c !== crew.boss || bossUnlocked);
        if (firstUnlocked) window.selectStoryCar(firstUnlocked);
    }
});

window.startArcade = () => bootGame();
window._mpCarSelect = false;
window._settingsFrom = null;

window.settingsBack = () => {
    const prev = window._settingsFrom;
    window._settingsFrom = null;
    showSubMenu(prev && prev !== 'main-menu' ? prev : 'main-menu');
};

window.mpCarSelectBack = () => {
    if (window._mpCarSelect) {
        window._mpCarSelect = false;
        showSubMenu('multiplayer-menu');
    } else {
        showSubMenu('arcade-menu');
    }
};

window.toggleMPStats = (force) => {
    const overlay = document.getElementById('mp-stats-overlay');
    if (!overlay) return;
    if (force === true) overlay.classList.add('visible');
    else if (force === false) overlay.classList.remove('visible');
    else overlay.classList.toggle('visible');
};

document.addEventListener('click', (e) => {
    if (e.target.closest('#mp-stats-overlay') && !e.target.closest('.mp-stats-panel')) {
        window.toggleMPStats(false);
    }
}, true);

window.selectMPServer = (val) => {
    if (val && val !== 'none') {
        console.log('[MP] Server selected:', val);
    }
};

window.returnToMenu = () => {
    window._plCustomPreviewActive = false;
    if (window.game) { window.game.dispose(); window.game = null; }
    if (window._mpMatch) { window._mpMatch.dispose(); window._mpMatch = null; }
    if (window._net) {
        if (window._net.role === 'host') window._net.closeLobby();
        else window._net.leaveLobby();
    }
    const goEl = document.getElementById('game-over-overlay'); if (goEl) goEl.style.display = 'none';
    document.getElementById('game-layer').style.display = 'none';
    document.getElementById('menu-layer').style.display = 'block';
    document.getElementById('menu-layer').style.opacity = '1';
    document.getElementById('webgl-canvas').style.display = 'block';
    if (menuGL) menuGL.start();
    if (window.menuMusic) window.menuMusic.resumeFromMatch();
    showSubMenu('main-menu');
    updateVisibleSunStates();
};

let isBooting = false;
window._storySelectedCar = 'beachbug';
window._storyBulletType = 'machinegun';
const BULLET_TYPE_ORDER = ['machinegun', 'shotgun', 'sniper'];
window.cycleBulletType = (dir) => {
    const idx = BULLET_TYPE_ORDER.indexOf(window._storyBulletType);
    window._storyBulletType = BULLET_TYPE_ORDER[(idx + dir + 3) % 3];
    const el = document.getElementById('story-bullet-display');
    if (el) el.textContent = window._storyBulletType.toUpperCase();
};
window.bootGame = async function() {
    if (isBooting) return; isBooting = true;
    hideLetterboxImmediately();
    if (menuGL) menuGL.stop();
    if (window.game) { window.game.dispose(); window.game = null; }
    if (window.menuMusic) window.menuMusic.pause();
    document.getElementById('menu-layer').style.display = 'none';
    document.getElementById('webgl-canvas').style.display = 'none';
    document.getElementById('game-layer').style.display = 'block';
    updateVisibleSunStates();
    const { ArcadeTestGame } = await import('./ArcadeTestGame.js');
    window.game = new ArcadeTestGame();
    window.applySharedAudioSettingsToGame();
    syncSharedAudioUI();
    setTimeout(() => { isBooting = false; }, 500);
};

window.startNewGamePlus = async function() {
    const sd = await import('./StoryData.js');
    const carType = window._storySelectedCar || 'beachbug';
    const crewId = sd.getCarCrew(carType);
    const diffEl = document.getElementById('story-ng-difficulty');
    const difficulty = diffEl ? diffEl.value : 'hard';
    const scrap = crewId ? sd.getCrewScrap(crewId) : 0;
    window.bootStoryGame(carType, 0, scrap, difficulty);
};

window.bootStoryGame = async function(carType, missionIndex, scrap, difficulty) {
    if (isBooting) return; isBooting = true;
    hideLetterboxImmediately();
    if (menuGL) menuGL.stop();
    if (window.game) { window.game.dispose(); window.game = null; }
    if (window.menuMusic) window.menuMusic.pause();
    document.getElementById('menu-layer').style.display = 'none';
    document.getElementById('webgl-canvas').style.display = 'none';
    document.getElementById('game-layer').style.display = 'block';
    updateVisibleSunStates();
    const sd = await import('./StoryData.js');
    const selectedCar = carType || window._storySelectedCar || 'beachbug';
    const carProgress = sd.getCarProgress(selectedCar);
    const crewId = sd.getCarCrew(selectedCar);
    const crewProgress = crewId ? sd.getCrewProgress(crewId) : { missionProgress: 0 };
    const prestige = difficulty ? sd.getDifficultyPrestige(difficulty) : (carProgress.prestige || 0);
    const { Game } = await import('./Game.js');
    const savedBullet = carProgress.bulletType;
    const bulletType = window._storyBulletType || savedBullet || 'machinegun';
    window._storyBulletType = bulletType;
    try {
    const missionCount = crewId ? (sd.CREWS[crewId]?.missions?.length || 5) : 5;
    const rawMission = missionIndex !== undefined ? missionIndex : (crewProgress.missionProgress || 0);
    const cappedMission = rawMission >= missionCount ? 0 : rawMission;
    window.game = new Game({
        carType: selectedCar,
        missionIndex: cappedMission,
        scrap: scrap !== undefined ? scrap : (crewId ? sd.getCrewScrap(crewId) : 0),
            prestige: prestige,
            difficulty: difficulty || 'hard',
            bulletType: bulletType
        });
        window.applySharedAudioSettingsToGame();
        syncSharedAudioUI();
    } catch (e) {
        console.error('bootStoryGame error:', e);
        alert('Failed to start story mode: ' + e.message);
    }
    setTimeout(() => { isBooting = false; }, 500);
};

function setLetterboxMainMenuState(isMainMenu) {
    const letterbox = document.getElementById('menu-letterbox'); if (!letterbox) return;
    if (isMainMenu) {
        letterbox.style.display = 'block';
        setTimeout(() => letterbox.classList.remove('exiting'), 50);
    } else {
        letterbox.classList.add('exiting');
        setTimeout(() => {
            if (letterbox.classList.contains('exiting')) {
                letterbox.style.display = 'none';
            }
        }, 1000);
    }
}

function hideLetterboxImmediately() {
    const letterbox = document.getElementById('menu-letterbox'); if (letterbox) letterbox.style.display = 'none';
}

document.addEventListener('click', (e) => {
    const pc = document.getElementById('preview-container');
    if (pc && pc.contains(e.target) && window.arcadePreview) window.arcadePreview.fireUlt();
});
window.addEventListener('keydown', (e) => {
    if (document.getElementById('game-layer').style.display === 'block') return;
    const km = MenuController.getVisibleMenu();
    if (km && km.id === 'car-setup-menu') {
        const groups = document.querySelectorAll('#car-setup-menu [data-focusable]');
        if (groups.length) {
            if (['ArrowUp', 'KeyW'].includes(e.code)) { _carSetupFocus = (_carSetupFocus - 1 + groups.length) % groups.length; groups.forEach((el, i) => el.classList.toggle('focused', i === _carSetupFocus)); return; }
            if (['ArrowDown', 'KeyS'].includes(e.code)) { _carSetupFocus = (_carSetupFocus + 1) % groups.length; groups.forEach((el, i) => el.classList.toggle('focused', i === _carSetupFocus)); return; }
            if (['ArrowLeft', 'KeyA'].includes(e.code)) {
                if (_carSetupFocus === 0) { const sel = document.getElementById('ai-difficulty-select'); if (sel && sel.selectedIndex > 0) { sel.selectedIndex--; sel.dispatchEvent(new Event('change')); } }
                else { const btn = document.querySelector('#car-setup-menu .arrow-btn'); if (btn) btn.click(); }
                return;
            }
            if (['ArrowRight', 'KeyD'].includes(e.code)) {
                if (_carSetupFocus === 0) { const sel = document.getElementById('ai-difficulty-select'); if (sel && sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; sel.dispatchEvent(new Event('change')); } }
                else { const btns = document.querySelectorAll('#car-setup-menu .arrow-btn'); if (btns.length > 1) btns[1].click(); }
                return;
            }
        }
    }
    const plMenu = document.querySelector('#parkinglot-menu:not(.hidden)');
    if (plMenu) {
        if (['ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); window._plHandleNav(-1); return; }
        if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); window._plHandleNav(1); return; }
    }
    if (['ArrowUp', 'KeyW'].includes(e.code)) MenuController.moveSelection(-1);
    else if (['ArrowDown', 'KeyS'].includes(e.code)) MenuController.moveSelection(1);
    else if (['ArrowLeft', 'KeyA'].includes(e.code)) { const m = MenuController.getVisibleMenu(); if (m) { const a = m.querySelectorAll('.arrow-btn'); if (a.length) a[0].click(); } }
    else if (['ArrowRight', 'KeyD'].includes(e.code)) { const m = MenuController.getVisibleMenu(); if (m) { const a = m.querySelectorAll('.arrow-btn'); if (a.length) a[a.length-1].click(); } }
    else if (['Enter', 'Space'].includes(e.code)) MenuController.confirm();
    else if (e.code === 'Escape') MenuController.back();
});

// ---- CUSTOM VIDEO URLS ----
const PL_CUSTOM_URLS_KEY = 'roadknight_pl_custom_urls';

function getCustomUrls() {
    try { return JSON.parse(localStorage.getItem(PL_CUSTOM_URLS_KEY) || '[]'); } catch { return []; }
}

function saveCustomUrls(urls) {
    localStorage.setItem(PL_CUSTOM_URLS_KEY, JSON.stringify(urls));
}

function extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

window.addCustomUrl = function() {
    const input = document.getElementById('pl-custom-url-input');
    if (!input) return;
    const url = input.value.trim();
    if (!url) return;
    const urls = getCustomUrls();
    if (urls.some(u => u.url === url)) return;
    const ytId = extractYouTubeId(url);
    const label = ytId ? `YouTube: ${ytId}` : url.split('/').pop().split('?')[0].substring(0, 40) || url;
    urls.push({ url, label, ytId, added: Date.now() });
    saveCustomUrls(urls);
    input.value = '';
    renderParkingLotSongList();
};

window.removeCustomUrl = function(index) {
    const urls = getCustomUrls();
    urls.splice(index, 1);
    saveCustomUrls(urls);
    renderParkingLotSongList();
};

function getAllPLSongs() {
    const songs = SONG_DB.flatMap(g => g.songs);
    const customUrls = getCustomUrls();
    customUrls.forEach((cu, i) => {
        songs.push({
            file: '__custom__:' + i,
            label: '📺 ' + cu.label,
            isCustom: true,
            customIndex: i,
            customUrl: cu.url,
            customUrlType: cu.ytId ? 'youtube' : 'direct',
            ytVideoId: cu.ytId
        });
    });
    return songs;
}

// ---- PARKING LOT MENU ----
let _plSelectedSong = null;
let _plSongFocusIdx = 0;

function playPLSong(file) {
    // Clean up any previous preview
    window._plCustomPreviewActive = false;
    if (window._plPreviewVideo) {
        window._plPreviewVideo.pause();
        window._plPreviewVideo.remove();
        window._plPreviewVideo = null;
    }
    if (window._plPreviewYT) {
        try { window._plPreviewYT.destroy(); } catch(e) {}
        window._plPreviewYT = null;
    }
    const previewYTPlayerContainer = document.getElementById('pl-yt-preview');
    if (previewYTPlayerContainer) previewYTPlayerContainer.innerHTML = '';

    if (file && file.startsWith('__custom__:')) {
        const idx = parseInt(file.split(':')[1]);
        const urls = getCustomUrls();
        const entry = urls[idx];
        if (!entry) return;
        if (window.menuMusic) window.menuMusic.pause();
        window._plCustomPreviewActive = true;

        if (entry.ytId) {
            // YouTube preview - needs user gesture to play, so just load the API
            const container = document.getElementById('pl-yt-preview') || (() => {
                const d = document.createElement('div');
                d.id = 'pl-yt-preview';
                d.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';
                document.body.appendChild(d);
                return d;
            })();
            container.innerHTML = '';
            PL_loadYouTubeAPI().then(YT => {
                const p = new YT.Player(container, {
                    height: '1', width: '1',
                    videoId: entry.ytId,
                    playerVars: { autoplay: 1, controls: 0, mute: 0 },
                    events: {
                        onReady: (e) => { e.target.setVolume(30); e.target.playVideo(); },
                        onError: () => {}
                    }
                });
                window._plPreviewYT = p;
            }).catch(() => {});
        } else {
            // Direct video preview
            const video = document.createElement('video');
            video.src = entry.url;
            video.crossOrigin = 'anonymous';
            video.volume = 0.3;
            video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';
            document.body.appendChild(video);
            video.play().catch(() => {});
            window._plPreviewVideo = video;
        }
        return;
    }

    if (!window.menuMusic) return;
    const mm = window.menuMusic;
    mm.pause();
    mm.sourceType = 'game';
    mm.queue = [file];
    mm.index = -1;
    mm.loadIndex(0);
    mm.play();
    mm.audio.volume = 0;

    if (mm._plFadeInterval) clearInterval(mm._plFadeInterval);
    const targetVol = ((window.sharedAudioSettings?.master ?? 100) / 100) * ((window.sharedAudioSettings?.menuMusic ?? 50) / 100);
    const steps = 20;
    const stepSize = targetVol / steps;
    let step = 0;
    mm._plFadeInterval = setInterval(() => {
        step++;
        const v = Math.min(step * stepSize, targetVol);
        mm.audio.volume = v;
        if (v >= targetVol) {
            clearInterval(mm._plFadeInterval);
            mm._plFadeInterval = null;
        }
    }, 35);
}

let _plYTAPILoaded = false;
let _plYTAPIPromise = null;
function PL_loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (_plYTAPIPromise) return _plYTAPIPromise;
    _plYTAPIPromise = new Promise((resolve) => {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onload = () => {
            if (window.YT && window.YT.Player) resolve(window.YT);
            else {
                const check = setInterval(() => {
                    if (window.YT && window.YT.Player) {
                        clearInterval(check);
                        resolve(window.YT);
                    }
                }, 100);
            }
        };
        document.head.appendChild(tag);
    });
    return _plYTAPIPromise;
}

function selectPLSong(idx) {
    const songs = getAllPLSongs();
    if (idx < 0) idx = songs.length - 1;
    if (idx >= songs.length) idx = 0;
    _plSongFocusIdx = idx;
    _plSelectedSong = songs[idx];
    playPLSong(_plSelectedSong.file);
    renderParkingLotSongList();
    const container = document.getElementById('pl-song-list');
    if (container) {
        const entry = container.querySelectorAll('.pl-song-entry')[idx];
        if (entry) entry.scrollIntoView({ block: 'nearest' });
    }
}

function renderParkingLotSongList() {
    if (!_plSelectedSong) {
        const songs = getAllPLSongs();
        _plSelectedSong = songs[0] || null;
    }
    const container = document.getElementById('pl-song-list');
    if (!container) return;
    let html = '';
    let idx = 0;
    for (const group of SONG_DB) {
        html += `<div style="margin-bottom:8px;"><div style="color:#666;font-size:0.65em;letter-spacing:2px;margin-bottom:3px;border-bottom:1px solid rgba(0,170,255,0.08);padding-bottom:2px;">${group.cat}</div>`;
        for (const s of group.songs) {
            const isFocus = idx === _plSongFocusIdx;
            const isSelected = _plSelectedSong && _plSelectedSong.file === s.file;
            const highlight = isFocus ? 'rgba(0,170,255,0.2)' : (isSelected ? 'rgba(0,170,255,0.1)' : 'transparent');
            const textColor = isFocus ? '#0ff' : (isSelected ? '#0af' : '#ccc');
            html += `<div class="pl-song-entry" data-idx="${idx}" data-file="${s.file}" style="display:flex;align-items:center;gap:6px;padding:3px 5px;border-radius:2px;cursor:pointer;transition:background 0.1s;background:${highlight};border-left:2px solid ${isFocus ? '#0ff' : 'transparent'};">
                <span style="flex:1;font-size:0.8em;color:${textColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.label}</span>
            </div>`;
            idx++;
        }
        html += '</div>';
    }
    // Add custom URL entries
    const customUrls = getCustomUrls();
    if (customUrls.length > 0) {
        html += `<div style="margin-bottom:8px;"><div style="color:#f80;font-size:0.65em;letter-spacing:2px;margin-bottom:3px;border-bottom:1px solid rgba(255,136,0,0.15);padding-bottom:2px;">CUSTOM URLS</div>`;
        customUrls.forEach((cu, i) => {
            const s = { file: '__custom__:' + i, label: cu.label, isCustom: true };
            const isFocus = idx === _plSongFocusIdx;
            const isSelected = _plSelectedSong && _plSelectedSong.file === s.file;
            const highlight = isFocus ? 'rgba(255,136,0,0.25)' : (isSelected ? 'rgba(255,136,0,0.12)' : 'transparent');
            const textColor = isFocus ? '#fa0' : (isSelected ? '#f80' : '#ca8');
            html += `<div class="pl-song-entry" data-idx="${idx}" data-file="${s.file}" data-custom="1" style="display:flex;align-items:center;gap:6px;padding:3px 5px;border-radius:2px;cursor:pointer;transition:background 0.1s;background:${highlight};border-left:2px solid ${isFocus ? '#fa0' : 'transparent'};">
                <span style="flex:1;font-size:0.8em;color:${textColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📺 ${cu.label}</span>
                <span onclick="event.stopPropagation();removeCustomUrl(${i})" style="cursor:pointer;color:#f44;font-size:0.65em;flex-shrink:0;">✕</span>
            </div>`;
            idx++;
        });
        html += '</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.pl-song-entry').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx);
            selectPLSong(idx);
        });
    });
}

window._plHandleNav = (dir) => {
    const menu = document.querySelector('.menu-container:not(.hidden)');
    if (!menu || menu.id !== 'parkinglot-menu') return;
    const songs = getAllPLSongs();
    selectPLSong(_plSongFocusIdx + dir);
};

window.startParkingLot = async () => {
    // Clean up any leftover preview players
    if (window._plPreviewVideo) {
        window._plPreviewVideo.pause();
        window._plPreviewVideo.remove();
        window._plPreviewVideo = null;
    }
    if (window._plPreviewYT) {
        try { window._plPreviewYT.destroy(); } catch(e) {}
        window._plPreviewYT = null;
    }
    const previewContainer = document.getElementById('pl-yt-preview');
    if (previewContainer) previewContainer.innerHTML = '';

    const song = _plSelectedSong ? _plSelectedSong.file : null;
    const car = window.currentCar;
    const difficulty = document.getElementById('pl-difficulty-select')?.value || 'easy';
    const isDev = document.getElementById('pl-dev-mode')?.checked || false;

    // Extract custom URL info if selected
    let customUrlOpts = {};
    if (_plSelectedSong && _plSelectedSong.isCustom) {
        customUrlOpts = {
            customUrl: _plSelectedSong.customUrl,
            customUrlType: _plSelectedSong.customUrlType,
            ytVideoId: _plSelectedSong.ytVideoId
        };
    }

    window.parkingLotConfig = { car, song, difficulty, devMode: isDev, ...customUrlOpts };

    if (isBooting) return; isBooting = true;
    window._plCustomPreviewActive = false;
    hideLetterboxImmediately();
    if (menuGL) menuGL.stop();
    if (window.game) { window.game.dispose(); window.game = null; }
    if (window.menuMusic) window.menuMusic.pause();
    document.getElementById('menu-layer').style.display = 'none';
    document.getElementById('webgl-canvas').style.display = 'none';
    document.getElementById('game-layer').style.display = 'block';
    updateVisibleSunStates();
    const { ParkingLot } = await import('./ParkingLot.js');
    window.game = new ParkingLot({ car, song: customUrlOpts.customUrl || song, difficulty, devMode: isDev, chartName: song ? song.split('/').pop().replace(/\.[^.]+$/, '') : 'untitled', ...customUrlOpts });
    if (window.applySharedAudioSettingsToGame) window.applySharedAudioSettingsToGame();
    syncSharedAudioUI();
    setTimeout(() => { isBooting = false; }, 500);
};

// ---- DEBUG OVERLAY (hidden by default, toggled by DEV tab checkbox) ----
let _devDebug = false;
let _debugFrames = 0, _debugFpsTime = 0, _debugFps = 0;

const debugEl = (() => {
    const el = document.createElement('div');
    el.id = 'menu-debug';
    el.style.cssText = 'position:fixed;bottom:4px;right:4px;color:#0f0;font:11px/1.3 monospace;background:rgba(0,0,0,0.6);padding:3px 6px;z-index:9999;pointer-events:none;white-space:pre;text-align:right;display:none';
    document.body.appendChild(el);
    return el;
})();

window.toggleDevDebug = () => {
    const cb = document.getElementById('dev-cb-debug');
    _devDebug = cb ? cb.checked : !_devDebug;
    debugEl.style.display = _devDebug ? 'block' : 'none';
};

function updateMenuMusicReactiveLoop() {
    requestAnimationFrame(updateMenuMusicReactiveLoop);
    if (window.menuMusic) window.menuMusic.updateReactiveBass();

    if (_devDebug) {
        const now = performance.now();
        _debugFrames++;
        if (now - _debugFpsTime >= 1000) {
            _debugFps = _debugFrames;
            _debugFrames = 0;
            _debugFpsTime = now;
        }
        if (window.menuGL && window.menuMusic) {
            const gl = window.menuGL;
            const mm = window.menuMusic;
            const uBass = 1.0 + gl.audioBassSmooth * 0.10;
            debugEl.textContent =
                `uT:${((now - gl.t0)/1000).toFixed(1)}`
                + ` uBass:${uBass.toFixed(4)}`
                + ` bassTgt:${gl.audioBassTgt.toFixed(3)}`
                + ` raw:${mm.bassValue.toFixed(3)}`
                + ` FPS:${_debugFps}`;
        }
    }

    // Logo: full at main menu (pushed higher), 1/3 at any submenu (same spot), hidden in-game
    const inner = window.__logoInner;
    if (inner && window.menuGL) {
        const inGame = document.getElementById('game-layer')?.style.display === 'block';
        if (inGame) {
            inner.style.display = 'none';
        } else {
            inner.style.display = '';
            inner.style.transform = window.menuGL.depthTgt > 0
                ? 'translateY(-48vh) scale(0.33)'
                : 'translateY(-20vh)';
        }
    }
}
updateMenuMusicReactiveLoop();

function tryUnlockMenuMusic() {
    const gameLayer = document.getElementById('game-layer');
    const introLayer = document.getElementById('intro-layer');
    if (gameLayer && gameLayer.style.display === 'block') return;
    if (introLayer && introLayer.style.display !== 'none' && introLayer.style.opacity !== '0') return;
    if (window._plCustomPreviewActive) return;
    if (window.menuMusic) window.menuMusic.enable();
}
window.addEventListener('pointerdown', tryUnlockMenuMusic);
window.addEventListener('keydown', tryUnlockMenuMusic);

window.addEventListener('load', () => {
    menuGL = new MenuGL();
    window.menuGL = menuGL;

    // Real HTML logo overlay: clipped at horizon so water covers it
    const origTitle = document.querySelector('.main-menu-title');
    if (origTitle) {
        const clipBox = document.createElement('div');
        clipBox.id = 'logo-overlay-clip';
        clipBox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;pointer-events:none;z-index:1';
        document.body.appendChild(clipBox);

        const inner = origTitle.cloneNode(true);
        inner.id = 'logo-overlay-inner';
        inner.style.cssText = 'position:absolute;top:55%;right:0;width:min(920px,50vw);transition:transform 0.2s ease-out;transform-origin:top right';
        const bh = inner.querySelector('.blackhole-sun-container');
        if (bh) bh.classList.add('sun-active');
        clipBox.appendChild(inner);
        window.__logoInner = inner;

        // Hide the original title/logo in the menu HTML
        const orig = document.querySelector('.main-menu-title');
        if (orig) orig.style.display = 'none';
    }

    const introLayer = document.getElementById('intro-layer');
    const introVideo = document.getElementById('intro-video');
    const unmuteBtn = document.getElementById('unmute-btn');
    const skipHint = document.getElementById('skip-hint');
    const mainMenu = document.getElementById('menu-layer');

    let introPhase = 1;

    const revealMenu = () => {
        window.removeEventListener('keydown', checkSkipKey);
        introVideo.style.opacity = '0';
        introLayer.style.opacity = '0';
        setTimeout(() => {
            introLayer.style.display = 'none';
            mainMenu.style.opacity = '1';
            if (window.menuMusic) window.menuMusic.enable();
            updateVisibleSunStates();
            MenuController.isLocked = false;
        }, 1500);
    };

    const skipIntro = () => {
        introVideo.pause();
        revealMenu();
    };

    const checkSkipKey = (e) => {
        if (e.code === 'Space') skipIntro();
    };

    const checkGamepad = () => {
        if (introLayer.style.display === 'none') return;
        const gp = Array.from(navigator.getGamepads()).find(g => g !== null);
        if (gp && gp.buttons[9] && gp.buttons[9].pressed) {
            skipIntro();
        } else {
            requestAnimationFrame(checkGamepad);
        }
    };

    const playSecondIntro = () => {
        introPhase = 2;
        introVideo.src = "sound/gameintro.mp4";
        introVideo.load();
        introVideo.play().then(() => {});
    };

    if (unmuteBtn) {
        unmuteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            introVideo.muted = false;
            unmuteBtn.style.display = 'none';
        });
    }

    introVideo.play().then(() => {
        introVideo.style.opacity = '1';
        skipHint.style.display = 'block';
        skipHint.innerText = "PRESS SPACE TO SKIP";
        window.addEventListener('keydown', checkSkipKey);
        checkGamepad();
    });

    introVideo.onended = () => {
        if (introPhase === 1) playSecondIntro();
        else revealMenu();
    };

    updateRadioUI();
});

window.openSettingsTab = (tabId) => {
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(`settings-${tabId}`); if (target) target.classList.remove('hidden');
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.settings-tab[data-settings-tab="${tabId}"]`);
    if (activeTab) activeTab.classList.add('active');
    if (tabId === 'music') renderSongBrowser();
};

// ---- SONG BROWSER ----

const SONG_DB = [
    { cat: 'MENU', songs: [
        { file: 'menu/answeredthoughtALFRED.mp3', label: 'Answered Thought — ALFRED' },
        { file: 'menu/answeredthoughtbadhabits.mp3', label: 'Answered Thought — Bad Habits' },
        { file: 'menu/answeredthoughtRIP.mp3', label: 'Answered Thought — RIP' },
        { file: 'menu/CarsanDADDYISSUESMASTER-B.mp3', label: 'Carsan — Daddy Issues' },
        { file: 'menu/iggybangbadbitch.mp3', label: 'Iggy Bang — Bad Bitch' },
        { file: 'menu/SwillowWHODAONE.mp3', label: 'Swillow — Who Da One' }
    ]},
    { cat: 'MATCH', songs: [
        { file: 'match/01.ogg', label: 'Track 01' },
        { file: 'match/02.wav', label: 'Track 02' },
        { file: 'match/03.ogg', label: 'Track 03' },
        { file: 'match/03.wav', label: 'Track 03 (alt)' },
        { file: 'match/05.ogg', label: 'Track 05' },
        { file: 'match/06.ogg', label: 'Track 06' },
        { file: 'match/4-22 4 more bass.ogg', label: '4-22 4 More Bass' },
        { file: 'match/alibi.wav', label: 'Alibi' },
        { file: 'match/bigtop grave yard.wav', label: 'Bigtop Graveyard' },
        { file: 'match/cirusfools.wav', label: 'Cirus Fools' }
    ]},
    { cat: 'MAYBES', songs: [
        { file: 'maybes/Jester\'s Revenge - Prod. Fu2.mp3', label: 'Jester\'s Revenge' },
        { file: 'maybes/zombie make a intro.mp3', label: 'Zombie Intro' },
        { file: 'maybes/redo vid hell of mine fix.wav', label: 'Redo Vid — Hell of Mine' }
    ]},
    { cat: 'THEMES', songs: [
        { file: 'themes/hell yeah (Prod. by Real).wav', label: 'Hell Yeah' },
        { file: 'themes/neverendever shutup and just drive real.wav', label: 'Neverendever — Shut Up & Drive' }
    ]}
];

function getToggleState(file) {
    try {
        const toggles = JSON.parse(localStorage.getItem('roadknight_song_toggles') || '{}');
        return toggles[file] !== false;
    } catch { return true; }
}

function setToggleState(file, on) {
    try {
        const toggles = JSON.parse(localStorage.getItem('roadknight_song_toggles') || '{}');
        toggles[file] = on;
        localStorage.setItem('roadknight_song_toggles', JSON.stringify(toggles));
    } catch {}
}

function playSongAsMenuMusic(file) {
    if (!window.menuMusic) return;
    window.menuMusic.pause();
    window.menuMusic.sourceType = 'game';
    window.menuMusic.queue = [file];
    window.menuMusic.index = -1;
    window.menuMusic.loadIndex(0);
    window.menuMusic.play();
    const select = document.getElementById('music-source-select');
    if (select) select.value = 'game';
}

function renderSongBrowser() {
    const container = document.getElementById('song-browser-list');
    if (!container) return;
    let html = '';
    for (const group of SONG_DB) {
        html += `<div style="margin-bottom:16px;"><div style="color:#888;font-size:0.75em;letter-spacing:2px;margin-bottom:6px;border-bottom:1px solid rgba(0,170,255,0.08);padding-bottom:4px;">${group.cat}</div>`;
        for (const s of group.songs) {
            const on = getToggleState(s.file);
            const isNow = window.menuMusic && window.menuMusic.getCurrentFile() === s.file;
            html += `<div class="song-browser-entry${isNow ? ' now-playing' : ''}" style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:3px;transition:background 0.15s;">
                <span class="song-browser-play" data-file="${s.file}" style="cursor:pointer;color:#0af;font-size:0.8em;flex-shrink:0;width:20px;text-align:center;" title="PLAY AS MENU MUSIC">&#9654;</span>
                <span style="flex:1;font-size:0.8em;color:${isNow ? '#0ff' : '#ccc'};text-transform:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.label}</span>
                <label style="flex-shrink:0;cursor:pointer;font-size:0.7em;color:#555;" title="TOGGLE IN PLAYLIST"><input type="checkbox" class="song-toggle" data-file="${s.file}" ${on ? 'checked' : ''}> ON</label>
            </div>`;
        }
        html += '</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.song-browser-play').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            playSongAsMenuMusic(el.dataset.file);
            renderSongBrowser();
        });
    });
    container.querySelectorAll('.song-toggle').forEach(el => {
        el.addEventListener('change', () => {
            setToggleState(el.dataset.file, el.checked);
        });
    });
}

bindSharedAudioSettingsUI();
