// おみくじの大吉の確定演出を Three.js(WebGL)で描く。間（光が集まる）→ 破裂（閃光・衝撃の輪・金の粉）→ 余韻（後光と舞う粉）→ 収束（紙と一緒に消える）。
// three は大吉の reveal が始まったときに初めて読む。描けないとき（WebGL なし・読めない・動きを減らす設定）は何もせず、index.html の CSS の演出がそのまま出る。

// three は版を固定してこのフォルダの three/ に置いている（0.183.0。three/README.md）。ページの住所によらず、このファイルから見た場所で読む
const THREE_URL = new URL('./three/three.module.min.js', import.meta.url).href;
const SIZE = 600; // 描く板の一辺（舞台の px）。中心は後光の中心（舞台の 180, 216）

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// 衝撃の輪: 破裂から start 秒後に出て dur 秒で広がり切る（半径 27px → 281px。CSS 版の ring-out と同じ広がり）
function ring(b, start, dur) {
  const x = (b - start) / dur;
  if (x < 0 || x > 1) return { r: 0, a: 0 };
  return { r: 125 * (0.22 + 2.03 * easeOut(x)), a: x < 0.12 ? 0.95 * x / 0.12 : 0.95 * (1 - (x - 0.12) / 0.88) };
}

// 結果が出てから t 秒の、各部の強さ。burstAt は破裂の秒（CSS の --fx-delay と同じ値）。描画と分けてテストで確かめる
export function daikichiTimeline(t, burstAt) {
  const at = Math.max(burstAt, 0.01);
  const b = t - at; // 破裂からの秒（破裂の前は負）
  const gather = b < 0 ? clamp01(t / at) : 0;
  let flare = 1;
  if (b >= 0 && b < 0.8) flare = 0.72 + 0.38 * easeOut(b / 0.8);
  else if (b >= 0.8 && b < 1.5) flare = 1.1 - 0.1 * easeInOut((b - 0.8) / 0.7);
  const calm = 1 + 0.045 * (0.5 - 0.5 * Math.cos(2 * Math.PI * Math.max(0, b - 1.5) / 6.4)); // 余韻の静かな脈
  return {
    gather,
    halo: b < 0 ? 0.22 * gather : 1,
    haloScale: b < 0 ? 0.45 + 0.2 * gather : flare * calm,
    flash: b >= 0 && b < 0.6 ? Math.pow(1 - b / 0.6, 2) : 0,
    rayTurn: (t / 16) * 2 * Math.PI, // 光の筋は16秒で1周
    rings: [ring(b, 0, 1.15), ring(b, 0.5, 1.5)], // 破裂と、字が決まる瞬間の2回
    sparkT: b,
    dust: clamp01((b - 0.3) / 0.8),
  };
}

// 光はどれも「色を足して、背景は少しだけ隠す」重ね方（あらかじめ掛けたアルファ）。透明なキャンバスでも光って見える
const GLOW_BLEND = { transparent: true, depthWrite: false };

const HALO_FRAG = `
varying vec2 vUv;
uniform float uI, uFlash, uTurn, uFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float glow = pow(max(1.0 - r, 0.0), 1.6);
  float rays = pow(0.5 + 0.5 * cos(a * 28.0 + uTurn), 6.0) * 0.7 + pow(0.5 + 0.5 * cos(a * 17.0 - uTurn * 1.6 + 1.3), 10.0) * 0.5;
  rays *= smoothstep(1.0, 0.25, r) * smoothstep(0.05, 0.3, r);
  float core = exp(-r * r * 18.0) * uFlash;
  float alpha = ((glow * 0.55 + rays * 0.6) * uI + core) * uFade;
  vec3 col = mix(vec3(1.0, 0.66, 0.1), vec3(1.0, 0.93, 0.66), clamp(glow + core, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha * 0.55);
}`;

const FLASH_FRAG = `
varying vec2 vUv;
uniform float uA, uFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float alpha = exp(-dot(p, p) * 6.0) * uA * uFade;
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.78) * alpha, alpha * 0.5);
}`;

const RING_FRAG = `
varying vec2 vUv;
uniform float uR, uA, uFade;
void main() {
  float d = length((vUv - 0.5) * ${SIZE.toFixed(1)});
  float w = abs(d - uR);
  float line = smoothstep(3.0, 0.0, w);
  float glow = exp(-w * w / 260.0) * 0.45;
  float alpha = (line + glow) * uA * uFade;
  vec3 col = mix(vec3(1.0, 0.75, 0.2), vec3(1.0, 0.95, 0.75), line);
  gl_FragColor = vec4(col * alpha, alpha * 0.7);
}`;

const PLANE_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// 粒の共通の頭。aVel / aSize / aDelay / aLife / aSeed の意味は粒の種類ごとに下の説明のとおり
const POINT_HEAD = `
attribute vec3 aVel;
attribute float aSize, aDelay, aLife, aSeed;
uniform float uT, uA, uFade, uPx;
varying float vA, vSeed, vT;`;
const POINT_TAIL = `
  vSeed = aSeed; vT = uT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);`;

// 金の粉の破裂: aVel は飛ぶ速さ(px/秒)。空気の抵抗で止まりながら少し落ちる。奥へ飛んだ粒は紙の後ろに回る
const SPARK_VERT = `${POINT_HEAD}
void main() {
  float t = uT - aDelay;
  if (t <= 0.0 || t >= aLife) { vA = 0.0; vSeed = 0.0; vT = 0.0; gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = aVel * (1.0 - exp(-2.6 * t)) / 2.6;
  p.y -= 70.0 * t * t;
  p.z += 15.0;
  float life = t / aLife;
  vA = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.55, 1.0, life)) * uFade;
  gl_PointSize = aSize * (1.0 + p.z / 300.0) * (1.0 - 0.5 * life) * uPx;
${POINT_TAIL}
}`;

// 間（光が集まる）: aVel は (向き, 半径, 奥行き)。uT は集まり具合 0〜1。渦を巻いて中心へ吸い込まれる
const GATHER_VERT = `${POINT_HEAD}
void main() {
  float g = clamp((uT - aDelay) / (1.0 - aDelay), 0.0, 1.0);
  float rr = aVel.y * (1.0 - g * g);
  float ang = aVel.x + g * 1.4;
  vec3 p = vec3(cos(ang) * rr, sin(ang) * rr, aVel.z);
  vA = smoothstep(0.0, 0.25, g) * (1.0 - smoothstep(0.85, 1.0, g)) * 0.9 * uA * uFade;
  gl_PointSize = aSize * (0.6 + 0.6 * g) * uPx;
${POINT_TAIL}
}`;

// 余韻の舞う粉: aVel は (はじめの x, はじめの y, 奥行き)、aLife は落ちる速さ(px/秒)。上から下へ回り続ける
const DUST_VERT = `${POINT_HEAD}
void main() {
  float y = 280.0 - mod(280.0 - aVel.y + uT * aLife, 560.0);
  float x = aVel.x + sin(uT * 0.8 + aSeed * 6.283) * 14.0;
  vec3 p = vec3(x, y, aVel.z);
  vA = uA * (1.0 - smoothstep(190.0, 290.0, length(p.xy))) * (0.55 + 0.45 * sin(uT * 3.0 + aSeed * 30.0)) * uFade;
  gl_PointSize = aSize * uPx;
${POINT_TAIL}
}`;

// 粒の見た目: 丸い光。4つに1つは十字のきらめき
const POINT_FRAG = `
varying float vA, vSeed, vT;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float disc = smoothstep(1.0, 0.0, r);
  disc *= disc;
  float star = 0.0;
  if (vSeed > 0.75) star = (smoothstep(0.12, 0.0, abs(c.x)) + smoothstep(0.12, 0.0, abs(c.y))) * smoothstep(1.0, 0.2, r) * 0.9;
  float tw = 0.75 + 0.25 * sin(vT * 22.0 + vSeed * 40.0);
  float alpha = clamp(disc + star, 0.0, 1.0) * vA * tw;
  vec3 col = mix(vec3(1.0, 0.72, 0.12), vec3(1.0, 0.97, 0.82), smoothstep(0.5, 0.0, r));
  gl_FragColor = vec4(col * alpha, alpha * 0.8);
}`;

// onLost: WebGL の文脈が失われたときに呼ぶ（呼ぶ側で片付けて CSS 版に戻す）
function createFx(THREE, stage, onLost) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // WebGL が使えないとここで投げる（呼ぶ側で CSS の演出に任せる）
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  const px = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(px);
  renderer.setSize(SIZE, SIZE, false); // 見た目の大きさは CSS（.fx-3d-canvas）で決める
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(canvas);
  canvas.addEventListener('webglcontextlost', onLost);

  const half = SIZE / 2;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 1000);
  camera.position.z = 500;
  const scene = new THREE.Scene();

  const glow = (frag, uniforms) => new THREE.ShaderMaterial({
    vertexShader: PLANE_VERT, fragmentShader: frag, uniforms, ...GLOW_BLEND,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const u = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

  // 紙の形の見えない板。奥行きだけ書くので、紙より奥（z<0）の光は紙に隠れ、手前の光は紙の上に出る
  const occluder = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ colorWrite: false }));
  occluder.renderOrder = -1;
  scene.add(occluder);

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(580, 580), glow(HALO_FRAG, u({ uI: 0, uFlash: 0, uTurn: 0, uFade: 1 })));
  halo.position.z = -50;
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), glow(FLASH_FRAG, u({ uA: 0, uFade: 1 })));
  flash.position.z = 30;
  const rings = [0, 1].map(() => new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), glow(RING_FRAG, u({ uR: 0, uA: 0, uFade: 1 }))));
  rings[0].position.z = 20;
  rings[1].rotation.x = -1.05; // 2つめの輪は寝かせて紙を囲む（上半分は紙の後ろ、下半分は手前）
  scene.add(halo, flash, ...rings);

  // 粒は種を固定して、いつ見ても同じ形にする
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const points = (count, make, vert) => {
    const geo = new THREE.BufferGeometry();
    const arr = { aVel: new Float32Array(count * 3), aSize: new Float32Array(count), aDelay: new Float32Array(count), aLife: new Float32Array(count), aSeed: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
      const p = make();
      arr.aVel.set(p.vel, i * 3);
      arr.aSize[i] = p.size; arr.aDelay[i] = p.delay; arr.aLife[i] = p.life; arr.aSeed[i] = rnd();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aVel', new THREE.BufferAttribute(arr.aVel, 3));
    for (const k of ['aSize', 'aDelay', 'aLife', 'aSeed']) geo.setAttribute(k, new THREE.BufferAttribute(arr[k], 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: POINT_FRAG, uniforms: u({ uT: 0, uA: 1, uFade: 1, uPx: px }), ...GLOW_BLEND,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false; // 位置は頂点の計算で決まるので、元の位置（全部 0）で隠させない
    scene.add(obj);
    return obj;
  };
  const sparks = points(220, () => {
    const th = rnd() * Math.PI * 2, ph = (rnd() - 0.5) * 1.2, sp = 260 + rnd() * 360;
    return { vel: [Math.cos(th) * Math.cos(ph) * sp, Math.sin(th) * Math.cos(ph) * sp, Math.sin(ph) * sp], size: 5 + rnd() * 9, delay: rnd() * 0.18, life: 1.1 + rnd() * 0.8 };
  }, SPARK_VERT);
  const gather = points(48, () => ({ vel: [rnd() * Math.PI * 2, 160 + rnd() * 120, (rnd() - 0.5) * 80], size: 4 + rnd() * 5, delay: rnd() * 0.4, life: 1 }), GATHER_VERT);
  const dust = points(70, () => ({ vel: [(rnd() - 0.5) * 520, (rnd() - 0.5) * 560, (rnd() - 0.5) * 80], size: 3 + rnd() * 4, delay: 0, life: 18 + rnd() * 30 }), DUST_VERT);

  // 紙の今の位置と大きさ（開く・震える・縮めて表示するを含む）に、見えない板を合わせる
  const slip = stage.querySelector('.slip');
  const placeOccluder = () => {
    const cr = canvas.getBoundingClientRect();
    const sr = slip ? slip.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    const k = cr.width ? SIZE / cr.width : 1;
    occluder.position.set(((sr.left + sr.right) / 2 - cr.left) * k - half, half - ((sr.top + sr.bottom) / 2 - cr.top) * k, 0);
    occluder.scale.set(Math.max(sr.width * k, 1e-3), Math.max(sr.height * k, 1e-3), 1);
  };

  return {
    render(tl, fade, t) {
      placeOccluder();
      const hu = halo.material.uniforms;
      hu.uI.value = tl.halo * (1 + 0.7 * tl.flash); hu.uFlash.value = tl.flash; hu.uTurn.value = tl.rayTurn; hu.uFade.value = fade;
      halo.scale.set(tl.haloScale, tl.haloScale, 1);
      flash.material.uniforms.uA.value = tl.flash * 0.75; flash.material.uniforms.uFade.value = fade;
      rings.forEach((m, i) => { const mu = m.material.uniforms; mu.uR.value = tl.rings[i].r; mu.uA.value = tl.rings[i].a; mu.uFade.value = fade; });
      sparks.visible = tl.sparkT > 0 && tl.sparkT < 2.2;
      sparks.material.uniforms.uT.value = tl.sparkT; sparks.material.uniforms.uFade.value = fade;
      gather.visible = tl.gather > 0 && tl.gather < 1;
      gather.material.uniforms.uT.value = tl.gather; gather.material.uniforms.uFade.value = fade;
      dust.visible = tl.dust > 0;
      dust.material.uniforms.uT.value = t; dust.material.uniforms.uA.value = tl.dust; dust.material.uniforms.uFade.value = fade;
      renderer.render(scene, camera);
    },
    // 後片付け: 立体と素材と WebGL の文脈を捨て、板も画面から外す。次の抽選には何も残さない
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost); // 下の forceContextLoss を「失われた」と数えない
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

// 舞台（#stage）の data-tier / data-phase を見て、大吉の reveal が始まったら three を読んで描き始め、大吉が終わったら片付ける。
// ほかの運勢・待ちの間・動きを減らす設定では読みもしない。load は three の読み込み（テストで差し替える）
export function startDaikichiFx(stage, load = () => import(THREE_URL)) {
  if (!stage || typeof window === 'undefined') return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slip = stage.querySelector('.slip');
  let fx = null;
  let raf = 0;
  let run = 0; // 何回目の大吉か。読み込みを待つ間に終わった回を見分ける
  let failed = false; // 一度読めなかった・描けなかったら、このページでは CSS の演出に任せる

  const stop = () => {
    run++;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stage.classList.remove('fx-3d');
    if (fx) { fx.dispose(); fx = null; }
  };

  const start = () => {
    const id = ++run;
    const startAt = performance.now();
    const burstAt = parseFloat(getComputedStyle(stage).getPropertyValue('--fx-delay')) || 1.2;
    load().then((THREE) => {
      if (id !== run) return; // 読み込みの間に終わった、または次の抽選になった
      // 破裂に間に合わなかった回は、途中で切り替えると粉や輪が途中で消えるので CSS 版のまま見せる（次からは読み込み済み）
      if ((performance.now() - startAt) / 1000 > burstAt) return;
      fx = createFx(THREE, stage, () => { failed = true; stop(); });
      stage.classList.add('fx-3d');
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        // 終わりの段階は、紙の消え方（CSS の daikichi-done）に光も合わせる
        const fade = stage.getAttribute('data-phase') === 'done' && slip ? Number(getComputedStyle(slip).opacity) : 1;
        const t = Math.max(0, (now - startAt) / 1000);
        fx.render(daikichiTimeline(t, burstAt), fade, t);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => { if (id === run) { failed = true; stop(); } });
  };

  let lastPhase = '';
  const sync = () => {
    const phase = stage.getAttribute('data-phase') || '';
    const newReveal = phase === 'reveal' && lastPhase !== 'reveal';
    lastPhase = phase;
    const on = stage.getAttribute('data-tier') === 'daikichi' && (phase === 'reveal' || phase === 'done');
    // 大吉が終わったら片付ける。続けて次の大吉が出たときも、前の回を片付けてから間から描き直す
    if (!on || newReveal) stop();
    // 終わりの段階から開いたときは描かない（CSS 版のまま）
    if (on && newReveal && !failed && !reduced.matches) start();
  };
  new MutationObserver(sync).observe(stage, { attributes: true, attributeFilter: ['data-tier', 'data-phase'] });
  sync();
}
