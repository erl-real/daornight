import * as THREE from 'three';

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.source = null;
        this.externalAudio = null; 
        this.analyser = null;
        this.gainNode = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.highpass = null;
        this.lowpass = null;
        this.turnGain = null;
        this.turnFilter = null;
        this.reverbHighpass = null;
        this.distortFilter = null;
        this.subFilter = null;
        this.subGain = null;
        this.convolver = null;
        this.initialized = false;
        this.canvas = null;
        this.canvasCtx = null;
        
        // Match playlist based on actual folder contents
        this.playlist = [
            '01.ogg', '02.wav', '03.ogg', '03.wav', '05.ogg', '06.ogg', 
            '4-22 4 more bass.ogg', 'alibi.wav', 'bigtop grave yard.wav', 'cirusfools.wav'
        ];
        
        this.queue = [];
        this.queueIdx = 0;
        const shared = window.sharedAudioSettings || {};
        this.masterVolume = (shared.master ?? 100) / 100;
        this.musicVolume = (shared.music ?? 80) / 100;
        this.sfxVolume = (shared.sfx ?? 100) / 100;
        this.volume = this.musicVolume; 
        this.activeReqId = 0;
        this.lastReqId = 0;
        this.driveStrength = shared.driveStrength || 'max'; 
        this.lastTelemetry = null;
        this.vizActive = !!shared.viz;
        this.soundDriveActive = shared.driveEnabled ?? true; 

        this.musicSource = 'game'; 
    }

    async init() {
        if (this.initialized) return;
        
        // Use existing context if menu music is already running
        this.ctx = window.__roadknightMenuMusicCtx || new (window.AudioContext || window.webkitAudioContext)();
        window.__roadknightMenuMusicCtx = this.ctx;

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.gainNode = this.ctx.createGain();
        this.masterGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.musicGain.gain.value = this.musicVolume;
        this.sfxGain.gain.value = this.sfxVolume;
        
        this.highpass = this.ctx.createBiquadFilter();
        this.highpass.type = 'highpass';
        this.highpass.frequency.value = 200;

        this.lowpass = this.ctx.createBiquadFilter();
        this.lowpass.type = 'lowpass';
        this.lowpass.frequency.value = 450;

        this.turnFilter = this.ctx.createBiquadFilter();
        this.turnFilter.type = 'lowpass';
        this.turnFilter.frequency.value = 1500;
        this.turnFilter.Q.value = 0.7;

        this.reverbHighpass = this.ctx.createBiquadFilter();
        this.reverbHighpass.type = 'highpass';
        this.reverbHighpass.frequency.value = 300;

        this.convolver = this.ctx.createConvolver();
        this.convolver.buffer = this.createReverbBuffer();

        this.turnGain = this.ctx.createGain();
        this.turnGain.gain.value = 0;

        this.distortNode = this.ctx.createWaveShaper();
        this.distortNode.curve = this.makeDistortionCurve(100);
        this.distortFilter = this.ctx.createBiquadFilter();
        this.distortFilter.type = 'lowpass';
        this.distortFilter.frequency.value = 3500;
        this.distortGain = this.ctx.createGain();
        this.distortGain.gain.value = 0;

        this.subFilter = this.ctx.createBiquadFilter();
        this.subFilter.type = 'lowpass';
        this.subFilter.frequency.value = 80;
        this.subFilter.Q.value = 1.0;

        this.subGain = this.ctx.createGain();
        this.subGain.gain.value = 0.0;

        // SYNTH ENGINE SOUND
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 60;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0;
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 1000;
        
        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.sfxGain);
        this.engineOsc.start();

        this.musicGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.canvas = document.getElementById('eq-canvas');
        this.rampCanvas = document.getElementById('ramp-canvas');
        this.statsOverlay = document.getElementById('audio-stats-overlay');

        if (this.canvas) {
            this.canvas.style.pointerEvents = 'auto';
            this.canvas.onmousemove = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const bin = (x / rect.width);
                this.hoverHz = Math.pow(10, bin * 4.3);
            };
            this.canvas.onmousedown = () => { this.clickHz = this.clickHz === this.hoverHz ? null : this.hoverHz; };
            this.canvas.onmouseleave = () => { this.hoverHz = 0; };
        }

        if (this.rampCanvas) {
            this.rampCanvas.style.pointerEvents = 'auto';
            this.rampCanvas.onmousemove = (e) => {
                const rect = this.rampCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = 1 - (e.clientY - rect.top) / rect.height;
                this.hoverSpeed = (x / rect.width) * 150;
                this.hoverPercent = y;
            };
            this.rampCanvas.onmousedown = () => { 
                this.clickSpeed = this.clickSpeed === this.hoverSpeed ? null : this.hoverSpeed;
                this.clickPercent = this.clickSpeed !== null ? this.hoverPercent : null;
            };
            this.rampCanvas.onmouseleave = () => { this.hoverSpeed = 0; this.hoverPercent = 0; };
        }

        this.initialized = true;
        this.syncWithExternalManager();
    }

    syncWithExternalManager() {
        if (!window.menuMusic) return;
        const source = window.menuMusic.getSourceType();
        this.musicSource = source;
        
        if (source === 'game') {
            this.shuffleQueue();
            this.loadTrack();
        } else {
            this.loadExternalSource();
            if (window.menuMusic && window.menuMusic.audio && window.menuMusic.audio.paused) {
                window.menuMusic.play();
            }
        }
    }

    loadExternalSource() {
        if (!this.initialized || !this.ctx || !window.menuMusic) return;
        
        // Cancel any pending async game track load
        this.activeReqId = -1;

        if (this.source) {
            this.source.onended = null;
            try { this.source.stop(); } catch(e){}
            this.source.disconnect();
            this.source = null;
        }

        if (this.externalSourceNode) {
            this.externalSourceNode.disconnect();
        }

        const audioEl = window.menuMusic.getAudioElement();
        if (!audioEl) return;

        // Use pre-existing source node from MenuMusicManager
        if (!audioEl.__sourceNode) {
            audioEl.__sourceNode = this.ctx.createMediaElementSource(audioEl);
        }
        this.externalSourceNode = audioEl.__sourceNode;
        this.connectToEffects(this.externalSourceNode);
    }

    connectToEffects(node) {
        // Disconnect from any previous destinations to be safe
        try { node.disconnect(); } catch(e) {}

        node.connect(this.highpass);
        this.highpass.connect(this.lowpass);
        this.lowpass.connect(this.musicGain);

        node.connect(this.distortNode);
        this.distortNode.connect(this.distortFilter);
        this.distortFilter.connect(this.distortGain);
        this.distortGain.connect(this.musicGain);

        node.connect(this.turnFilter);
        this.turnFilter.connect(this.reverbHighpass);
        this.reverbHighpass.connect(this.convolver);
        this.convolver.connect(this.turnGain);
        this.turnGain.connect(this.musicGain);

        node.connect(this.subFilter);
        this.subFilter.connect(this.subGain);
        this.subGain.connect(this.musicGain);
    }

    updateStatsOverlay(telemetry, volFactor, loudnessComp, targetHP, targetLP, subMasterGain) {
        if (!this.statsOverlay || !this.vizActive) return;
        let trackName = 'EXTERNAL';
        if (this.musicSource === 'game') {
            trackName = this.queue[this.queueIdx] || 'NONE';
        } else if (window.menuMusic) {
            trackName = window.menuMusic.getCurrentTrackName();
        }
        
        const engineFreq = this.engineOsc ? this.engineOsc.frequency.value : 0;
        const engineGainVal = this.engineGain ? this.engineGain.gain.value : 0;
        const subFreq = this.subFilter ? this.subFilter.frequency.value : 0;

        this.statsOverlay.style.display = 'block';
        this.statsOverlay.innerHTML = `
            <b style="color:#fff">SOUNDDRIVE DASHBOARD</b><br>
            SOURCE: ${this.musicSource.toUpperCase()}<br>
            TRACK: ${trackName.toUpperCase()}<br>
            MASTER VOL: ${(this.masterVolume * this.musicVolume * volFactor * loudnessComp).toFixed(3)} (NORM: ${loudnessComp.toFixed(2)})<br>
            <hr style="border:0;border-top:1px solid #333">
            HIGHPASS (BASS): ${targetHP.toFixed(0)}Hz<br>
            LOWPASS (TREBLE): ${targetLP.toFixed(0)}Hz<br>
            SUB BOOST GAIN: ${subMasterGain.toFixed(2)}x @ ${subFreq.toFixed(0)}Hz<br>
            <hr style="border:0;border-top:1px solid #333">
            SYNTH ENGINE: ${engineFreq.toFixed(0)}Hz @ ${engineGainVal.toFixed(2)}v<br>
            DISTORTION: HARD-CLIP (${(this.distortGain.gain.value * 100).toFixed(1)}%)<br>
            REVERB: DYNAMIC-ROOM (${(this.turnGain.gain.value * 100).toFixed(1)}%)<br>
            <hr style="border:0;border-top:1px solid #333">
            INPUT: SPEED ${telemetry.speed.toFixed(0)}kmh | THROTTLE ${telemetry.throttle.toFixed(1)}
        `;
    }

    dispose() {
        this.initialized = false;
        if (this.engineOsc) { try { this.engineOsc.stop(); } catch(e){} }
        if (this.source) {
            this.source.onended = null;
            try { this.source.stop(); } catch(e){}
            this.source.disconnect();
            this.source = null;
        }
        if (this.externalSourceNode) {
            // Don't disconnect the node itself permanently, just from our graph
            this.externalSourceNode.disconnect();
        }
        // Don't close the context if it's shared!
        // if (this.ctx) { try { this.ctx.close(); } catch(e){} this.ctx = null; }
    }

    shuffleQueue() {
        this.queue = [...this.playlist];
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        this.queueIdx = 0;
    }

    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    createReverbBuffer() {
        const len = (this.ctx ? this.ctx.sampleRate : 44100) * 2;
        const buf = this.ctx ? this.ctx.createBuffer(2, len, this.ctx.sampleRate) : null;
        if (!buf) return null;
        for (let i = 0; i < 2; i++) {
            const data = buf.getChannelData(i);
            for (let j = 0; j < len; j++) {
                data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2);
            }
        }
        return buf;
    }

    async loadTrack() {
        if (!this.initialized || !this.ctx || this.musicSource !== 'game') return;
        
        const reqId = ++this.lastReqId;
        this.activeReqId = reqId;

        if (this.source) {
            this.source.onended = null;
            try { this.source.stop(); } catch(e){}
            this.source.disconnect();
            this.source = null;
        }
        
        try {
            const trackName = this.queue[this.queueIdx];
            const response = await fetch(`sound/music/match/${trackName}`); 
            if (!response.ok) { console.warn(`${trackName} not found.`); return; }
            const arrayBuf = await response.arrayBuffer();
            
            if (this.activeReqId !== reqId) return;
            const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
            if (this.activeReqId !== reqId) return;

            this.source = this.ctx.createBufferSource();
            this.source.buffer = audioBuf;
            this.source.loop = false;
            this.source.onended = () => {
                this.queueIdx++;
                if (this.queueIdx >= this.queue.length) this.shuffleQueue();
                this.loadTrack();
            };

            this.connectToEffects(this.source);

            this.source.start(0);
            const cleanName = trackName.replace('.mp3', '').replace('.ogg', '').replace('.wav', '').toUpperCase();
            if (window.updateSharedTrackName) window.updateSharedTrackName(cleanName);
        } catch (e) { console.warn("Audio load failed:", e.message); }
    }

    setMasterVolume(val) {
        this.masterVolume = Number(val) / 100;
        if (this.masterGain && this.ctx) this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.1);
    }
    setMusicVolume(val) {
        this.musicVolume = Number(val) / 100;
        this.volume = this.musicVolume;
        if (this.initialized && this.lastTelemetry && this.soundDriveActive) this.update(this.lastTelemetry);
        else if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.1);
    }
    setSfxVolume(val) {
        this.sfxVolume = Number(val) / 100;
        if (this.sfxGain && this.ctx) this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.1);
    }
    setVolume(val) { this.setMusicVolume(val); }
    setDriveStrength(val) { 
        this.driveStrength = val;
        this.strengthVolMult = (val === 'subtle') ? 0.90 : (val === 'soft' ? 0.95 : 1.0);
        if (this.initialized && this.lastTelemetry) {
            this.update(this.lastTelemetry);
        }
    }
    nextTrack() { 
        if (this.musicSource === 'game') {
            this.queueIdx++;
            if (this.queueIdx >= this.queue.length) this.shuffleQueue();
            this.loadTrack(); 
        } else if (window.menuMusic) {
            window.menuMusic.nextTrack();
        }
    }
    prevTrack() { 
        if (this.musicSource === 'game') {
            this.queueIdx--;
            if (this.queueIdx < 0) this.queueIdx = this.queue.length - 1;
            this.loadTrack(); 
        } else if (window.menuMusic) {
            window.menuMusic.prevTrack();
        }
    }

    toggleAudioDrive(val) { 
        this.soundDriveActive = val; 
        if (!val) { 
            if (this.highpass) this.highpass.frequency.setTargetAtTime(20, this.ctx.currentTime, 0.1); 
            if (this.lowpass) this.lowpass.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.1); 
            if (this.turnGain) this.turnGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); 
            if (this.distortGain) this.distortGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); 
            if (this.subGain) this.subGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); 
            if (this.musicGain) this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.1); 
        } 
    }

    getBassIntensity(speedMPH, gasFactor, isHandbrake) {
        const s = this.driveStrength;
        const isStationaryRev = isHandbrake && speedMPH < 5 && gasFactor > 0.1;

        if (s === 'max') {
            let targetHP = 200;
            if (speedMPH < 20) {
                const t = speedMPH / 20;
                const baseline = 200 * Math.pow(230 / 200, t);
                const idleFloor = isStationaryRev ? 160 : baseline;
                targetHP = baseline - (gasFactor * (baseline - idleFloor));
            } else if (speedMPH < 35) {
                const t = (speedMPH - 20) / 15;
                targetHP = 230 - t * 63; 
            } else if (speedMPH < 80) {
                const t = (speedMPH - 35) / 45;
                targetHP = 167 * Math.pow(45 / 167, t);
            } else {
                targetHP = 45;
            }
            return targetHP;
        } else {
            const hpStart = (s === 'subtle') ? 45 : 100;
            const hpEnd = (s === 'subtle') ? 30 : 35;
            const t = Math.min(1.0, speedMPH / 80);
            const baseline = hpStart * Math.pow(hpEnd / hpStart, t);
            const idleFloor = isStationaryRev ? 160 : baseline;
            return baseline - (gasFactor * (baseline - idleFloor));
        }
    }

    getSubGain(speedMPH, gasFactor, isHandbrake) {
        if (speedMPH >= 80) return 0; 
        const s = this.driveStrength;
        const strengthMult = (s === 'subtle') ? 0.2 : (s === 'soft' ? 0.5 : 1.0);

        let subCurve = 0;
        const isStationaryRev = isHandbrake && speedMPH < 5 && gasFactor > 0.1;

        if (speedMPH >= 10 && speedMPH < 35) {
            const t = (speedMPH - 10) / 25;
            subCurve = Math.pow(Math.sin(t * Math.PI * 0.5), 3) * 0.3 * strengthMult;
        } else if (speedMPH >= 35 && speedMPH < 80) {
            const t = (speedMPH - 35) / 45;
            subCurve = (0.3 * strengthMult) * (1 - t);
        }

        if (isStationaryRev) return Math.max(0.25 * strengthMult, gasFactor * 0.5 * strengthMult);
        if (speedMPH < 5) return Math.max(0.1 * strengthMult, gasFactor * 0.1 * strengthMult);
        return subCurve;
    }

    update(telemetry) {
        if (!this.initialized || (!this.source && !this.externalSourceNode)) return;
        this.lastTelemetry = telemetry;
        const { throttle, speed, boost, steerVal, isHandbrake } = telemetry;
        const speedMPH = speed * 0.621371;
        const gasFactor = Math.abs(throttle);

        if (!this.soundDriveActive) {
            if (this.vizActive) {
                this.drawEQ();
                this.drawRamps(speedMPH, 1.0, 1.0, 1.0, false);
            }
            return;
        }

        let subMasterGain = this.getSubGain(speedMPH, gasFactor, isHandbrake);
        let targetHP = this.getBassIntensity(speedMPH, gasFactor, isHandbrake);
        const loudnessComp = 1.0 - (subMasterGain * 0.15);

        let volFactor = 1.0;
        if (speedMPH < 5) volFactor = 0.75;
        else if (speedMPH < 20) volFactor = 0.75 + ((speedMPH - 5) / 15) * 0.1;
        else if (speedMPH < 60) volFactor = 0.85 + ((speedMPH - 20) / 40) * 0.12;
        else if (speedMPH < 80) volFactor = 0.97 + ((speedMPH - 60) / 20) * 0.03;
        
        const sVol = this.strengthVolMult || 1.0;
        this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.2);
        this.musicGain.gain.setTargetAtTime(this.musicVolume * volFactor * loudnessComp * sVol, this.ctx.currentTime, 0.2);
        this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.2);

        if (speedMPH >= 35 && speedMPH < 80) {
            const t = (speedMPH - 35) / 45;
            targetHP = 167 * Math.pow(30 / 167, t);
        }
        if (this.highpass) this.highpass.frequency.setTargetAtTime(targetHP, this.ctx.currentTime, 0.15);

        const s = this.driveStrength;
        const lpMin = (s === 'subtle') ? 4000 : (s === 'soft' ? 1500 : 450);
        const lpMax = (s === 'subtle') ? 12000 : (s === 'soft' ? 16000 : 20000);
        const lpMid1 = (s === 'subtle') ? 6000 : (s === 'soft' ? 4500 : 3000);
        const lpMid2 = (s === 'subtle') ? 8000 : (s === 'soft' ? 6500 : 5000);

        let targetLP = lpMin;
        if (speedMPH < 20) targetLP = lpMin * Math.pow(785 / lpMin, speedMPH / 20);
        else if (speedMPH < 60) targetLP = 785 * Math.pow(lpMid1 / 785, (speedMPH - 20) / 40);
        else if (speedMPH < 80) targetLP = lpMid1 * Math.pow(lpMid2 / lpMid1, (speedMPH - 60) / 20);
        else if (speedMPH < 88) targetLP = lpMid2 * Math.pow(lpMax / lpMid2, (speedMPH - 80) / 8);
        else targetLP = lpMax;
        
        if (boost > 50 && speedMPH < 80) targetLP = Math.min(20000, targetLP * 1.2);
        const turnFactor = Math.min(1.0, Math.abs(steerVal) * 2);
        if (turnFactor > 0.1 && speedMPH < 80) targetLP *= (1 - turnFactor * 0.3);
        if (this.lowpass) this.lowpass.frequency.setTargetAtTime(targetLP, this.ctx.currentTime, 0.2);

        const currentTurnGain = this.turnGain ? this.turnGain.gain.value : 0;
        const turnTarget = (turnFactor * 0.4) * (speedMPH < 80 ? 1 : 0);
        const turnTimeConstant = turnTarget > currentTurnGain ? 0.3 : 1.5;
        if (this.turnGain) this.turnGain.gain.setTargetAtTime(turnTarget, this.ctx.currentTime, turnTimeConstant);

        let driftTarget = isHandbrake ? 0.05 : 0.0;
        if (speedMPH < 20) driftTarget *= (speedMPH / 20);
        if (speedMPH >= 80) driftTarget = 0;
        if (this.distortGain) this.distortGain.gain.setTargetAtTime(driftTarget, this.ctx.currentTime, 0.25);

        let subActive = (speedMPH < 80) || (isHandbrake && speedMPH < 5);
        let subTargetGain = subActive ? 2.5 : 0.0; 
        
        let subFreq = 80;
        if (isHandbrake && speedMPH < 5 && gasFactor > 0.1) subFreq = 160;
        else if (speedMPH > 5) subFreq = 80 + Math.min(1.0, (speedMPH - 5) / 75) * 80;

        const currentSubGainValue = this.subGain ? this.subGain.gain.value : 0;
        const subTC = subMasterGain > currentSubGainValue ? 0.15 : 0.3;

        if (this.subFilter) {
            this.subFilter.frequency.setTargetAtTime(subFreq, this.ctx.currentTime, subTC);
            this.subFilter.gain.setTargetAtTime(subTargetGain, this.ctx.currentTime, subTC);
        }
        if (this.subGain) this.subGain.gain.setTargetAtTime(subMasterGain, this.ctx.currentTime, subTC);

        if (this.vizActive) {
            this.drawEQ();
            this.drawRamps(speedMPH, volFactor * loudnessComp, targetLP / 20000, targetHP, subMasterGain);
            this.updateStatsOverlay(telemetry, volFactor, loudnessComp, targetHP, targetLP, subMasterGain);
        } else {
            if (this.statsOverlay) this.statsOverlay.style.display = 'none';
            if (document.getElementById('eq-viz-container')) document.getElementById('eq-viz-container').style.display = 'none';
        }
    }

    drawEQ() {
        if (!this.canvasCtx) {
            this.canvas = document.getElementById('eq-canvas');
            if (!this.canvas) return;
            this.canvasCtx = this.canvas.getContext('2d');
            if (document.getElementById('eq-viz-container')) document.getElementById('eq-viz-container').style.display = 'flex';
        }
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        const ctx = this.canvasCtx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const barCount = 100;
        const sampleRate = this.ctx.sampleRate;
        const fftSize = this.analyser.fftSize;
        for (let i = 0; i < barCount; i++) {
            const hz = Math.pow(10, (i / barCount) * 4.3);
            const bin = Math.round(hz / (sampleRate / fftSize));
            const val = data[bin] || 0;
            const h = (val / 255) * this.canvas.height;
            const px = (i / barCount) * this.canvas.width;
            const pw = Math.ceil(this.canvas.width / barCount);
            ctx.fillStyle = `rgba(0, ${val + 100}, 255, 0.5)`;
            ctx.fillRect(px, this.canvas.height - h, pw, h);
        }
        const binCount = 40;
        const freqs = new Float32Array(binCount);
        for (let i = 0; i < binCount; i++) freqs[i] = Math.pow(10, (i / binCount) * 4.3);
        const hpMag = new Float32Array(binCount);
        const hpPhase = new Float32Array(binCount);
        const lpMag = new Float32Array(binCount);
        const lpPhase = new Float32Array(binCount);
        const subMag = new Float32Array(binCount);
        const subPhase = new Float32Array(binCount);
        this.highpass.getFrequencyResponse(freqs, hpMag, hpPhase);
        this.lowpass.getFrequencyResponse(freqs, lpMag, lpPhase);
        this.subFilter.getFrequencyResponse(freqs, subMag, subPhase);
        const currentSubGain = this.subGain.gain.value;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < binCount; i++) {
            const combinedMag = Math.max(hpMag[i] * lpMag[i], subMag[i] * currentSubGain);
            const px = (i / binCount) * this.canvas.width;
            const py = this.canvas.height - (Math.min(1.0, combinedMag) * this.canvas.height);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    drawRamps(speedMPH, volFactor, clarityFactor, currentBassHP, currentSubGain) {
        const canvas = document.getElementById('ramp-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const drawLogicLine = (color, getY) => {
            ctx.strokeStyle = color; ctx.beginPath();
            for (let s = 0; s <= 150; s += 5) {
                const px = (s / 150) * canvas.width;
                const py = canvas.height - (getY(s) * canvas.height);
                if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
        };
        drawLogicLine('rgba(0, 255, 0, 0.4)', (s) => {
            if (s < 5) return 0.75;
            if (s < 20) return 0.75 + ((s-5)/15)*0.1;
            if (s < 60) return 0.85 + ((s-20)/40)*0.12;
            if (s < 80) return 0.97 + ((s-60)/20)*0.03;
            return 1.0;
        });
        drawLogicLine('rgba(255, 0, 255, 0.3)', (s) => {
            let hp = this.getBassIntensity(s, 0, false);
            if (s >= 35 && s < 80) hp = 167 * Math.pow(30 / 167, (s - 35) / 45);
            return (230 - hp) / 231.25;
        });
        const dotX = (Math.min(150, speedMPH) / 150) * canvas.width;
        ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(dotX, canvas.height - (volFactor * canvas.height), 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f0f'; ctx.beginPath(); ctx.arc(dotX, canvas.height - ((230 - currentBassHP) / 231.25 * canvas.height), 3, 0, Math.PI*2); ctx.fill();
    }
}
