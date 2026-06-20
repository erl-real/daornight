export const RADIO_KEY = 'roadknight_radio_stations_v1';
export const AUDIO_SETTINGS_KEY = 'roadknight_shared_audio_settings_v1';

export const DEFAULT_AUDIO_SETTINGS = {
    master: 75,
    menuMusic: 25,
    music: 75,
    sfx: 75,
    driveEnabled: true,
    driveStrength: 'max',
    viz: false,
    controlScheme: 'default'
};

export const MENU_MUSIC_TRACKS = [
    'menu/answeredthoughtALFRED.mp3',
    'menu/answeredthoughtbadhabits.mp3',
    'menu/answeredthoughtRIP.mp3',
    'menu/CarsanDADDYISSUESMASTER-B.mp3',
    'menu/iggybangbadbitch.mp3',
    'menu/SwillowWHODAONE.mp3'
];

export function loadRadioStations() {
    try {
        return JSON.parse(localStorage.getItem(RADIO_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

export function saveRadioStation(url) {
    const input = document.getElementById('radio-url-input');
    const u = (url || input.value).trim();
    if (!u) return;
    const stations = loadRadioStations();
    if (!stations.includes(u)) {
        stations.push(u);
        localStorage.setItem(RADIO_KEY, JSON.stringify(stations));
        if (input) input.value = '';
        updateRadioUI();
    }
}
window.saveRadioStation = saveRadioStation;

export function removeRadioStation(url) {
    const stations = loadRadioStations().filter(s => s !== url);
    localStorage.setItem(RADIO_KEY, JSON.stringify(stations));
    updateRadioUI();
}
window.removeRadioStation = removeRadioStation;

export function updateRadioUI() {
    const container = document.getElementById('saved-stations');
    if (!container) return;
    container.innerHTML = '';
    const stations = loadRadioStations();
    stations.forEach((url, i) => {
        const btn = document.createElement('div');
        btn.className = 'option';
        btn.style.fontSize = '0.7em';
        btn.style.padding = '4px 8px';
        btn.innerHTML = `STATION ${i+1} <span style="color:#f44;margin-left:5px" onclick="event.stopPropagation(); removeRadioStation('${url}')">X</span>`;
        btn.onclick = () => {
            if (window.menuMusic) window.menuMusic.loadExternal(url, 'radio');
        };
        container.appendChild(btn);
    });
}

window.updateRadioUI = updateRadioUI;

export function handlePlaylistUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target.result;
            let urls = [];
            if (file.name.endsWith('.json')) {
                urls = JSON.parse(content);
            } else {
                urls = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
            }
            window.customPlaylist = urls;
            if (urls.length > 0 && window.menuMusic) {
                window.menuMusic.customQueue = [...urls];
                alert(`LOADED ${urls.length} TRACKS TO CUSTOM PLAYLIST`);
            }
        } catch (err) { alert("FAILED TO LOAD PLAYLIST: " + err.message); }
    };
    reader.readAsText(file);
}
window.handlePlaylistUpload = handlePlaylistUpload;

function updateSharedTrackName(name) {
    const text = (name || 'TRACK 1').toUpperCase();
    document.querySelectorAll('[data-current-track]').forEach((el) => {
        el.innerText = text;
    });
}
window.updateSharedTrackName = updateSharedTrackName;

export class MenuMusicManager {
    constructor(tracks) {
        this.tracks = [...tracks];
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.loop = false;
        this.queue = [];
        this.customQueue = [];
        this.index = -1;
        this.enabled = false;
        this.pendingPlay = false;
        this.toastTimer = null;
        this.audioCtx = null;
        this.mediaSource = null;
        this.analyser = null;
        this.freqData = null;
        this.bassValue = 0;

        this.sourceType = 'game';
        this.currentRadioUrl = '';

        this.audio.addEventListener('ended', () => this.nextTrack());
        this.audio.addEventListener('canplay', () => {
            if (this.enabled && this.pendingPlay) this.tryPlay();
        });
        this.audio.addEventListener('play', () => {
            this.pendingPlay = false;
            const current = this.getCurrentTrackName();
            if (current) {
                updateSharedTrackName(current);
                this.showToast(current);
            }
        });
        this.audio.addEventListener('loadedmetadata', () => {
            this.applyVolume();
        });
        this.audio.addEventListener('error', (e) => {
            console.warn("AUDIO ERROR:", e);
            if (this.sourceType !== 'game' && this.audio.src) {
                alert("EXTERNAL SOURCE FAILED. REVERTING TO GAME MUSIC.");
                this.setSource('game');
            }
        });

        this.shuffle();
        this.setupHotkeys();
    }

    setupHotkeys() {
        window.addEventListener('keydown', (e) => {
            if (window.game) return;
            if (e.code === 'KeyR') {
                this.nextTrack();
            } else if (e.code === 'KeyU') {
                const next = this.sourceType === 'game' ? 'radio' : 'game';
                this.setSource(next);
                const select = document.getElementById('music-source-select');
                if (select) select.value = next;
            }
        });
    }

    getAudioElement() { return this.audio; }
    getSourceType() { return this.sourceType; }

    setSource(type) {
        this.sourceType = type;
        this.pause();
        if (type === 'game') {
            this.shuffle();
            this.loadIndex(0);
        } else if (type === 'radio') {
            const stations = loadRadioStations();
            if (stations.length > 0) {
                this.currentRadioUrl = stations[0];
                this.audio.src = this.currentRadioUrl;
                this.audio.load();
            }
        } else if (type === 'custom') {
            if (this.customQueue.length > 0) {
                this.loadIndex(0);
            }
        }
        this.play();
        if (window.game && window.game.audio) window.game.audio.syncWithExternalManager();
    }

    loadExternal(url, type) {
        this.sourceType = type;
        this.currentRadioUrl = url;
        this.audio.src = url;
        this.audio.load();
        this.play();
        if (window.game && window.game.audio) window.game.audio.syncWithExternalManager();
    }

    shuffle() {
        const target = this.sourceType === 'custom' ? this.customQueue : this.tracks;
        if (!target.length) return;
        this.queue = [...target];
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        this.index = -1;
    }

    cleanTrackName(fileName) {
        if (this.sourceType === 'radio') return "RADIO: " + (this.currentRadioUrl.split('/').pop() || 'STREAM');
        const parts = (fileName || 'TRACK').split('/');
        const name = parts[parts.length - 1];
        return name.replace(/\.(mp3|wav|ogg|m4a)$/i, '')
            .replace(/[_-]+/g, ' ')
            .trim()
            .toUpperCase();
    }

    getCurrentFile() {
        if (this.sourceType === 'radio') return this.currentRadioUrl;
        return this.queue[this.index] || null;
    }

    getCurrentTrackName() {
        return this.cleanTrackName(this.getCurrentFile());
    }

    ensureAnalyser() {
        if (this.analyser && window.game) return;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        try {
            this.audioCtx = window.__roadknightMenuMusicCtx || new Ctx();
            window.__roadknightMenuMusicCtx = this.audioCtx;

            if (!this.audio.__sourceNode) {
                this.audio.__sourceNode = this.audioCtx.createMediaElementSource(this.audio);
            }
            this.mediaSource = this.audio.__sourceNode;

            if (!window.game) {
                if (!this.analyser) {
                    this.analyser = this.audioCtx.createAnalyser();
                    this.analyser.fftSize = 256;
                    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
                }
                this.mediaSource.disconnect();
                this.mediaSource.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);
            }
        } catch (err) {}
    }

    applyVolume() {
        if (window.game) {
            this.audio.volume = 1.0;
            return;
        }
        const master = (window.sharedAudioSettings?.master ?? 100) / 100;
        const menuMusic = (window.sharedAudioSettings?.menuMusic ?? 50) / 100;
        this.audio.volume = Math.max(0, Math.min(1, master * menuMusic));
    }

    loadIndex(idx) {
        if (this.sourceType === 'radio') return;
        if (!this.queue.length) return;
        this.index = idx;
        const file = this.getCurrentFile();
        if (!file) return;

        if (this.sourceType === 'game') {
            this.audio.src = `sound/music/${encodeURIComponent(file)}`;
        } else {
            this.audio.src = file;
        }
        this.audio.load();
        updateSharedTrackName(this.getCurrentTrackName());
    }

    ensureTrackLoaded() {
        if (this.sourceType === 'radio') return;
        if (this.index === -1 || !this.getCurrentFile()) {
            if (!this.queue.length) this.shuffle();
            this.loadIndex(0);
        }
    }

    async play() {
        this.ensureTrackLoaded();
        this.applyVolume();
        this.pendingPlay = true;
        await this.tryPlay();
    }

    async tryPlay() {
        try {
            this.ensureAnalyser();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
            await this.audio.play();
            this.pendingPlay = false;
        } catch (err) {
            this.pendingPlay = true;
        }
    }

    async enable() {
        this.enabled = true;
        await this.play();
    }

    async resumeFromMatch() {
        this.enabled = true;
        if (this.sourceType === 'radio') {
            await this.play();
            return;
        }
        if (!this.queue.length) return;
        if (this.index === -1 || !this.getCurrentFile()) {
            if (!this.queue.length) this.shuffle();
            this.loadIndex(0);
            await this.play();
            return;
        }
        let nextIdx = this.index + 1;
        if (nextIdx >= this.queue.length) {
            this.shuffle();
            nextIdx = 0;
        }
        this.loadIndex(nextIdx);
        await this.play();
    }

    pause() {
        this.audio.pause();
        this.pendingPlay = false;
        this.bassValue = 0;
        if (window.menuGL) window.menuGL.setBassIntensity(0);
    }

    async nextTrack() {
        if (this.sourceType === 'radio') {
            const stations = loadRadioStations();
            const idx = stations.indexOf(this.currentRadioUrl);
            const next = (idx + 1) % stations.length;
            if (stations[next]) this.loadExternal(stations[next], 'radio');
            return;
        }
        if (!this.queue.length) return;
        let nextIdx = this.index + 1;
        if (nextIdx >= this.queue.length) {
            this.shuffle();
            nextIdx = 0;
        }
        this.loadIndex(nextIdx);
        await this.play();
    }

    async prevTrack() {
        if (this.sourceType === 'radio') {
            const stations = loadRadioStations();
            const idx = stations.indexOf(this.currentRadioUrl);
            const prev = (idx - 1 + stations.length) % stations.length;
            if (stations[prev]) this.loadExternal(stations[prev], 'radio');
            return;
        }
        if (!this.queue.length) return;
        let nextIdx = this.index - 1;
        if (nextIdx < 0) {
            if (!this.queue.length) this.shuffle();
            nextIdx = this.queue.length - 1;
        }
        this.loadIndex(nextIdx);
        await this.play();
    }

    showToast(name) {
        const toast = document.getElementById('menu-music-toast');
        if (!toast) return;
        const title = toast.querySelector('.title');
        if (title) title.innerText = name;
        toast.classList.add('visible');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('visible');
        }, 5000);
    }

    updateReactiveBass() {
        if (window.game || !this.analyser || !this.freqData) {
            this.bassValue += (0 - this.bassValue) * 0.10;
            if (window.menuGL) window.menuGL.setBassIntensity(this.bassValue);
            return;
        }
        this.analyser.getByteFrequencyData(this.freqData);
        let sum = 0;
        const bassBins = Math.min(8, this.freqData.length);
        for (let i = 0; i < bassBins; i++) sum += this.freqData[i];
        const rawBass = bassBins > 0 ? (sum / bassBins) / 255 : 0;
        const shapedBass = (rawBass - 0.08) * 1.55;
        this.bassValue += (shapedBass - this.bassValue) * 0.09;
        if (window.menuGL) window.menuGL.setBassIntensity(this.bassValue);
    }
}
