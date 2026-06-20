export class MenuGL {
    constructor() {
        this.canvas = document.getElementById("webgl-canvas");
        if (!this.canvas) return;

        this.gl = this.canvas.getContext("webgl", {
            alpha: false, antialias: false, depth: false, stencil: false,
            preserveDrawingBuffer: false, powerPreference: "high-performance"
        });

        if (!this.gl) {
            this.canvas.style.background = "#0a0a0f";
            return;
        }

        this.initShaders();
        this.initBuffers();
        this.initUniforms();
        
        this.N = 5;
        this.maxScroll = 1;
        this.tgt = 0;
        this.smooth = 0;
        this.velocity = 0;
        this.scrollEase = 0.1;
        this.qualityScale = 1.0;
        this.t0 = performance.now();
        this.lastNow = this.t0;
        this.activeIdx = 0; // Track which section we are on
        this.running = true;
        this.depthTgt = 0; // Target depth (0.0 to 1.0)
        this.depthSmooth = 0;
        this.audioBassTgt = 0;
        this.audioBassSmooth = 0;

        this.bindEvents();
        this.resize();
        this.animate();
    }

    setDepth(d) {
        // d is 1-5, map to 0.0-1.0 range for the shader
        this.depthTgt = (Math.max(1, Math.min(5, d)) - 1) / (this.N - 1);
    }

    stop() {
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastNow = performance.now();
        this.animate();
    }

    setBassIntensity(v) {
        this.audioBassTgt = v || 0;
    }

    initShaders() {
        const vs = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;
        const fs = `
precision highp float;
uniform vec2  uR;
uniform float uT, uS, uSc, uBl, uBass;
uniform vec3  uBg;
#define PI 3.14159265359
#define MARCH_STEPS 24
#define REFINE_STEPS 6

vec3 sCol(vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  int si = int(uSc);
  vec3 a = c0, b = c1;
  if (si == 1) { a = c1; b = c2; }
  else if (si == 2) { a = c2; b = c3; }
  else if (si == 3) { a = c3; b = c4; }
  return mix(a, b, uBl);
}

float sF(float c0, float c1, float c2, float c3, float c4) {
  int si = int(uSc);
  float a = c0, b = c1;
  if (si == 1) { a = c1; b = c2; }
  else if (si == 2) { a = c2; b = c3; }
  else if (si == 3) { a = c3; b = c4; }
  return mix(a, b, uBl);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float waveH(vec2 p, float t, float amp) {
  float h = 0.0;
  float reactiveAmp = amp * (1.0 + uBass * 0.24);
  vec2 swellDir = normalize(vec2(1.0, 0.35));
  float d = dot(p, swellDir);
  h += reactiveAmp * 0.28 * sin(d * 0.80 + t * 0.60);
  h += reactiveAmp * 0.40 * sin(p.x * 0.70 + t * 0.55 + p.y * 0.28);
  h += reactiveAmp * 0.24 * sin(p.x * 1.60 - t * 0.82 + p.y * 0.72);
  h += reactiveAmp * 0.16 * sin(p.x * 3.10 + t * 1.15 - p.y * 0.50);
  h += reactiveAmp * 0.10 * sin(p.x * 5.50 - t * 1.70 + p.y * 1.30);
  h += reactiveAmp * 0.05 * sin(p.x * 8.60 + t * 2.20 + p.y * 1.95);
  float micro = noise(p * 18.0 + vec2(t * 0.35, t * 0.12)) * 0.010;
  h += micro * reactiveAmp;
  return h;
}

vec3 waveNorm(vec2 p, float t, float amp) {
  float e = 0.014;
  float hL = waveH(p - vec2(e, 0.0), t, amp);
  float hR = waveH(p + vec2(e, 0.0), t, amp);
  float hD = waveH(p - vec2(0.0, e), t, amp);
  float hU = waveH(p + vec2(0.0, e), t, amp);
  return normalize(vec3(-(hR - hL) / (2.0 * e), 1.0, -(hU - hD) / (2.0 * e)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uR * 0.5) / uR.y;
  vec3 ro = vec3(sin(uT * 0.07) * 0.02, 1.1 + sin(uT * 0.11) * 0.01, 0.0);
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.10, -1.4));

  vec3 skyTop  = sCol(vec3(0.18, 0.06, 0.24), vec3(0.05, 0.24, 0.68), vec3(0.26, 0.06, 0.04), vec3(0.01, 0.01, 0.05), vec3(0.04, 0.05, 0.09));
  vec3 skyHori = sCol(vec3(0.92, 0.48, 0.18), vec3(0.42, 0.62, 0.90), vec3(0.88, 0.32, 0.04), vec3(0.03, 0.05, 0.14), vec3(0.15, 0.17, 0.23));
  vec3 sunCol  = sCol(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.96, 0.80), vec3(1.0, 0.38, 0.05), vec3(0.70, 0.75, 0.94), vec3(0.26, 0.28, 0.34));
  vec3 seaDeep = sCol(vec3(0.08, 0.05, 0.12), vec3(0.03, 0.14, 0.34), vec3(0.10, 0.06, 0.04), vec3(0.00, 0.01, 0.03), vec3(0.03, 0.04, 0.07));
  vec3 seaShlo = sCol(vec3(0.28, 0.17, 0.24), vec3(0.09, 0.38, 0.60), vec3(0.24, 0.13, 0.06), vec3(0.04, 0.06, 0.16), vec3(0.07, 0.10, 0.14));
  vec3 fogCol  = sCol(vec3(0.80, 0.50, 0.30), vec3(0.58, 0.72, 0.90), vec3(0.70, 0.28, 0.05), vec3(0.02, 0.03, 0.08), vec3(0.12, 0.14, 0.18));

  float sunProgress = clamp(uS / 0.58, 0.0, 1.0);
  float sunAngle = sunProgress * PI;
  float sunArcX = cos(sunAngle) * -0.75;
  float sunArcY = sin(sunAngle) * 0.38 - 0.08;
  vec3 sunDir  = normalize(vec3(sunArcX, sunArcY, -1.0));
  vec3 moonDir = normalize(vec3(-0.14, 0.42, -1.0));
  float warm = smoothstep(0.22, -0.08, sunDir.y);
  sunCol = mix(sunCol, vec3(1.0, 0.55, 0.25), warm * 0.35);

  float waveAmp = sF(0.08, 0.07, 0.10, 0.05, 0.34);
  float fogDen  = sF(0.018, 0.010, 0.020, 0.032, 0.048);
  float moonAmt = sF(0.0, 0.0, 0.05, 0.92, 0.06);
  float sunAbove = step(0.0, sunDir.y);
  float sunGlow  = smoothstep(-0.10, 0.06, sunDir.y);

  vec3 col;
  if (rd.y < 0.0) {
    float tFlat = ro.y / (-rd.y);
    float baseStep = tFlat / float(MARCH_STEPS);
    float t = baseStep;
    for (int i = 0; i < MARCH_STEPS; i++) {
      vec2 wpTest = ro.xz + rd.xz * t; float wy = ro.y + rd.y * t;
      if (wy < waveH(wpTest, uT, waveAmp)) break;
      t += baseStep;
    }
    float ta = t - baseStep; float tb = t;
    for (int i = 0; i < REFINE_STEPS; i++) {
      float tm = (ta + tb) * 0.5; vec2 wpm = ro.xz + rd.xz * tm;
      if (ro.y + rd.y * tm < waveH(wpm, uT, waveAmp)) tb = tm; else ta = tm;
    }
    t = (ta + tb) * 0.5;
    vec2 wp = ro.xz + rd.xz * t; vec3 n = waveNorm(wp, uT, waveAmp);
    vec3 vDir = -rd; float fres = pow(1.0 - clamp(dot(n, vDir), 0.0, 1.0), 4.0);
    vec3 refl = reflect(rd, n); float rh = clamp(refl.y, 0.0, 1.0);
    vec3 reflSky = mix(skyHori, skyTop, pow(rh, 0.42)); reflSky = mix(reflSky, skyHori, 0.12);
    float rSun = max(dot(refl, sunDir), 0.0);
    reflSky += sunCol * pow(rSun, 128.0) * 2.2 * sunGlow;
    reflSky += sunCol * pow(rSun, 18.0) * 0.08 * sunGlow;
    if (moonAmt > 0.04) { float rMoon = max(dot(refl, moonDir), 0.0); reflSky += vec3(0.72, 0.80, 0.95) * pow(rMoon, 128.0) * 0.8 * moonAmt; }
    float depth = exp(-t * 0.40); vec3 waterC = mix(seaDeep, seaShlo, depth * 0.5);
    vec3 absorb = vec3(0.78, 0.90, 1.0); waterC *= mix(vec3(1.0), absorb, clamp(t * 0.35, 0.0, 1.0));
    float stormTex = noise(wp * 1.9 + vec2(uT * 0.24, uT * 0.08)); waterC += stormTex * 0.018 * smoothstep(0.75, 1.0, uS);
    col = mix(waterC, reflSky, 0.15 + fres * 0.35);
    float spec = pow(max(dot(reflect(-sunDir, n), vDir), 0.0), 220.0); col += sunCol * spec * 1.25 * sunAbove;
    float broadSpec = pow(max(dot(reflect(-sunDir, n), vDir), 0.0), 36.0); col += sunCol * broadSpec * 0.14 * sunGlow;
    float sunLine = pow(max(dot(reflect(rd, n), sunDir), 0.0), 10.0); col += sunCol * sunLine * 0.32 * smoothstep(0.0, 0.35, -rd.y) * sunGlow;
    float sparkle = noise(wp * 24.0 + vec2(uT * 0.8, uT * 0.35)); sparkle = smoothstep(0.92, 1.0, sparkle); col += sunCol * sparkle * 0.12 * sunGlow * sunAbove;
    if (moonAmt > 0.04) { float mSpec = pow(max(dot(reflect(-moonDir, n), vDir), 0.0), 600.0); col += vec3(0.72, 0.80, 0.95) * mSpec * 0.11 * moonAmt; }
    float hC = waveH(wp, uT, waveAmp); float hL = waveH(wp - vec2(0.02, 0.0), uT, waveAmp); float hR = waveH(wp + vec2(0.02, 0.0), uT, waveAmp); float hD = waveH(wp - vec2(0.0, 0.02), uT, waveAmp); float hU = waveH(wp + vec2(0.0, 0.02), uT, waveAmp);
    float curvature = hR + hL + hU + hD - 4.0 * hC; float foam = clamp(curvature * 28.0, 0.0, 1.0); col += foam * vec3(1.0) * 0.10 * smoothstep(0.70, 1.0, uS);
    float fog = 1.0 - exp(-t * fogDen); col = mix(col, fogCol, fog);
  } else {
    float h = clamp(rd.y, 0.0, 1.0); col = mix(skyHori, skyTop, pow(h, 0.38));
  }
  float horizonW = 0.008; float skyMix = smoothstep(-horizonW, horizonW, rd.y);
  vec3 skyCol; {
    float h = clamp(rd.y, 0.0, 1.0); skyCol = mix(skyHori, skyTop, pow(h, 0.38));
    float sd = max(dot(rd, sunDir), 0.0); skyCol += sunCol * pow(sd, 420.0) * 7.2 * sunGlow; skyCol += sunCol * pow(sd, 24.0)  * 0.22 * sunGlow; skyCol += sunCol * pow(sd, 5.0)   * 0.10 * sunGlow;
    float sunDisk = smoothstep(0.9992, 0.99995, dot(rd, sunDir)); skyCol += sunCol * sunDisk * 2.8 * sunGlow;
    float halo = pow(max(dot(rd, sunDir), 0.0), 2.0); skyCol += sunCol * halo * 0.04 * sunGlow;
    float horizonBand = exp(-abs(rd.y) * 24.0); skyCol += sunCol * horizonBand * 0.12 * sunGlow;
    float viewSun = max(dot(rd, sunDir), 0.0); skyCol += sunCol * pow(viewSun, 3.0) * 0.04 * sunGlow;
    if (moonAmt > 0.04) { float md = max(dot(rd, moonDir), 0.0); skyCol += vec3(0.88, 0.92, 1.0) * pow(md, 900.0) * 8.0 * moonAmt; skyCol += vec3(0.88, 0.92, 1.0) * pow(md, 6.0)   * 0.05 * moonAmt; }
    float horizonMist = exp(-abs(rd.y) * 40.0); skyCol += fogCol * horizonMist * 0.08;
    float horizonFade = exp(-abs(rd.y) * 18.0); float lum = dot(skyCol, vec3(0.3333333)); skyCol = mix(skyCol, vec3(lum), horizonFade * 0.12);
  }
  col = mix(col, skyCol, skyMix); float hEdge = smoothstep(-0.008, 0.018, rd.y); col = mix(fogCol, col, hEdge * 0.25 + 0.75);
  vec2 uvV = (gl_FragCoord.xy - uR * 0.5) / uR.y; float vignette = smoothstep(1.15, 0.35, length(uvV)); col = mix(uBg, col, vignette);
  float grain = hash(gl_FragCoord.xy + uT * 60.0) - 0.5; col += grain * 0.004;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

        const mkShader = (type, src) => {
            const s = this.gl.createShader(type);
            this.gl.shaderSource(s, src);
            this.gl.compileShader(s);
            if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
                console.error(this.gl.getShaderInfoLog(s));
                this.gl.deleteShader(s);
                return null;
            }
            return s;
        };

        const vert = mkShader(this.gl.VERTEX_SHADER, vs);
        const frag = mkShader(this.gl.FRAGMENT_SHADER, fs);
        this.prog = this.gl.createProgram();
        this.gl.attachShader(this.prog, vert);
        this.gl.attachShader(this.prog, frag);
        this.gl.linkProgram(this.prog);
        this.gl.useProgram(this.prog);

        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.disable(this.gl.CULL_FACE);
    }

    initBuffers() {
        const buf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), this.gl.STATIC_DRAW);
        const ap = this.gl.getAttribLocation(this.prog, "a");
        this.gl.enableVertexAttribArray(ap);
        this.gl.vertexAttribPointer(ap, 2, this.gl.FLOAT, false, 0, 0);
    }

    initUniforms() {
        this.uR = this.gl.getUniformLocation(this.prog, "uR");
        this.uTi = this.gl.getUniformLocation(this.prog, "uT");
        this.uScroll = this.gl.getUniformLocation(this.prog, "uS");
        this.uScene = this.gl.getUniformLocation(this.prog, "uSc");
        this.uBlend = this.gl.getUniformLocation(this.prog, "uBl");
        this.uBass = this.gl.getUniformLocation(this.prog, "uBass");
        this.uBg = this.gl.getUniformLocation(this.prog, "uBg");
        this.gl.uniform3f(this.uBg, 0.04, 0.04, 0.06); // Dark theme default
        this.gl.uniform1f(this.uBass, 1.0);
    }

    resize() {
        const vp = { width: Math.max(window.innerWidth, 1), height: Math.max(window.innerHeight, 1) };
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const pixelW = Math.max(1, Math.round(vp.width * dpr));
        const pixelH = Math.max(1, Math.round(vp.height * dpr));
        if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
            this.canvas.width = pixelW;
            this.canvas.height = pixelH;
            this.gl.viewport(0, 0, pixelW, pixelH);
            this.gl.uniform2f(this.uR, pixelW, pixelH);
        }

        this.canvas.style.width = `${vp.width}px`;
        this.canvas.style.height = `${vp.height}px`;
        this.canvas.style.left = '0px';
        this.canvas.style.top = '0px';

        const menuLayer = document.getElementById('menu-layer');
        if (menuLayer) {
            this.maxScroll = Math.max(1, menuLayer.scrollHeight - window.innerHeight);
            // Snap to the current active section so it stays centered
            const targetSection = document.getElementById(`s${this.activeIdx}`);
            if (targetSection) {
                menuLayer.scrollTo(0, targetSection.offsetTop);
            }
        }
    }

    bindEvents() {
        const menuLayer = document.getElementById('menu-layer');
        if (!menuLayer) return;

        menuLayer.addEventListener("scroll", () => {
            this.tgt = this.maxScroll > 0 ? menuLayer.scrollTop / this.maxScroll : 0;
        }, { passive: true });

        window.addEventListener("resize", () => this.resize(), { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", () => this.resize(), { passive: true });
        }
    }

    smoothScrollToY(targetY, duration = 900) {
        const menuLayer = document.getElementById('menu-layer');
        if (!menuLayer) return;
        this.velocity = 0;
        const startY = menuLayer.scrollTop;
        const diff = targetY - startY;
        const start = performance.now();
        const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const tick = (now) => {
            const p = Math.min(1, (now - start) / duration);
            const e = easeInOutCubic(p);
            menuLayer.scrollTo(0, startY + diff * e);
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    animate() {
        if (!this.running) return;
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        const dt = Math.min((now - this.lastNow) * 0.001, 0.033);
        this.lastNow = now;

        // Smoothly transition depth
        this.depthSmooth += (this.depthTgt - this.depthSmooth) * (1 - Math.exp(-dt * 6));
        this.audioBassSmooth += (this.audioBassTgt - this.audioBassSmooth) * (1 - Math.exp(-dt * 10));

        const raw = this.depthSmooth * (this.N - 1);
        const flr = Math.floor(raw);
        const si = Math.min(flr, this.N - 2);
        const bl = flr >= this.N - 1 ? 1.0 : raw - flr;

        this.gl.uniform1f(this.uTi, (now - this.t0) / 1000);
        this.gl.uniform1f(this.uScroll, this.depthSmooth);
        this.gl.uniform1f(this.uScene, si);
        this.gl.uniform1f(this.uBlend, bl);
        this.gl.uniform1f(this.uBass, 1.0 + this.audioBassSmooth * 0.10);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}
