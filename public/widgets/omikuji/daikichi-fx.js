// おみくじの大吉の確定演出を Three.js(WebGL)で、ウィジェットの画面いっぱいに描く。流れは3段:
// 溜め（画面の外から光が渦を巻いて集まり、だんだん速く・強くなり、最後は画面が小さく震える）→ 解放（字が叩き出される瞬間に、閃光・十字の光・画面を洗う光・輪3つ・金の粉を一度に。強さの頂点はここ1回だけ）
// → 余韻（立体の光の柱が回り、きらめく粉が舞う）→ 収束（光が中心へ集まって小さく灯り、消える）。
// three は大吉の reveal が始まったときに初めて読む。描けないとき（WebGL なし・読めない・動きを減らす設定）は何もせず、index.html の CSS の演出がそのまま出る。

// three は版を固定してこのフォルダの three/ に置いている（0.183.0。three/README.md）。ページの住所によらず、このファイルから見た場所で読む
const THREE_URL = new URL('./three/three.module.min.js', import.meta.url).href;
// 描く板はウィジェットの画面全体。立体の座標は「舞台（360x460）の px」で、原点は後光の中心（舞台の 180, 216）
const STAGE_W = 360;
const ORIGIN = [180, 216];
// 描く板の画素の上限（前の 600x600・倍率2 と同じ）。画面が大きくても、これを超えないよう描く細かさを下げる
const MAX_PIXELS = 600 * 600 * 4;
// 粒の数（合わせて千個未満の約束。テストで確かめる）
export const PARTICLES = { burst: 380, crown: 180, gather: 80, dust: 220 };
// 衝撃の輪の広がり切った半径（舞台の px）: 解放の輪 / 寝かせた輪 / 大きな輪。640x500 の画面の角までは約 424px
export const RING_MAX = [470, 400, 680];
// 解放の金の粉が飛び出す時刻のばらつきの上限（秒）。解放の瞬間からこの間に全部出る（頂点を1回に寄せる）
export const EMIT_SPREAD = { burst: 0.08, crown: 0.05 };
const SHAKE_FROM = 0.7; // 溜めのこの割合から震え始める（最後の3割）
const SPIN = (2 * Math.PI) / 16; // 余韻の回る速さ（16秒で1周）
const SPIN_UP = 5; // 溜めの終わりの回る速さは、余韻の 1+5 倍
const SPIN_DECAY = 0.6; // 解放のあと、速い回りが余韻の速さへ戻る時定数（秒）

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

// 衝撃の輪: 解放から start 秒後に出て dur 秒で、半径 27px から max まで広がる
function ring(b, start, dur, max) {
  const x = (b - start) / dur;
  if (x < 0 || x > 1) return { r: 0, a: 0 };
  return { r: 27 + (max - 27) * easeOut(x), a: x < 0.1 ? x / 0.1 : 1 - (x - 0.1) / 0.9 };
}

// 結果が出てから t 秒の、各部の強さ。burstAt は解放の秒 L（CSS の --fx-delay と同じ値。字が叩き出される瞬間）。
// end は終わりの段階（done）の進み 0〜1（reveal の間は 0）。描画と分けてテストで確かめる
export function daikichiTimeline(t, burstAt, end = 0) {
  const at = Math.max(burstAt, 0.01);
  const b = t - at; // 解放からの秒（解放の前は負）
  const p = b < 0 ? clamp01(t / at) : 1; // 溜めの進み
  // 溜め: 集まり方は二乗で加速し、強さは静かに始まって終わりに張り詰め、最後の3割だけ震えが 0 から増える。解放の瞬間に全部止まる
  const tension = b < 0 ? p * p * p : 0;
  const shake = b < 0 ? Math.pow(clamp01((p - SHAKE_FROM) / (1 - SHAKE_FROM)), 2) : 0;
  // 解放: 頂点は b=0 の1回だけ。そこから下がるだけ（余韻の後光の静かな脈は大きさだけに掛ける）
  const flash = b >= 0 && b < 0.9 ? Math.pow(1 - b / 0.9, 2) : 0;
  const settle = b < 0 ? 0 : 0.55 * Math.exp(-b / 0.3) + 0.45 * (1 - smooth(0, 2, b)); // 1 から 0 へ単調に下がる
  const calm = 1 + 0.045 * (0.5 - 0.5 * Math.cos(2 * Math.PI * Math.max(0, b - 1.5) / 6.4)); // 余韻の静かな脈
  const converge = easeInOut(clamp01((end - 0.4) / 0.4)); // 収束: 光が中心へ集まる
  // 回る速さ（余韻の何倍か）と角度。溜めで 1→6 倍に上がり、解放のあと 1 倍へ戻る。角度は速さを積み上げたもの（途切れない）
  const spin = b < 0 ? 1 + SPIN_UP * p * p : 1 + SPIN_UP * Math.exp(-b / SPIN_DECAY);
  const turn = b < 0 ? t + (SPIN_UP * at * p * p * p) / 3 : t + (SPIN_UP * at) / 3 + SPIN_UP * SPIN_DECAY * (1 - Math.exp(-b / SPIN_DECAY));
  return {
    gather: b < 0 ? p * p : 0,
    tension,
    shake,
    spin,
    halo: b < 0 ? 0.06 + 0.44 * tension : 1 + 0.9 * settle,
    haloScale: (b < 0 ? 0.45 + 0.5 * p * p : (1 + 0.28 * Math.exp(-b / 0.5)) * calm) * (1 - 0.85 * converge),
    flash,
    beams: b < 0 ? 0.4 * tension : 0.6 + settle,
    rayTurn: SPIN * turn,
    rings: [ring(b, 0, 1.15, RING_MAX[0]), ring(b, 0, 1.5, RING_MAX[1]), ring(b, 0, 1.05, RING_MAX[2])],
    sparkT: b,
    dust: clamp01((b - 0.3) / 0.8),
    converge,
    ember: smooth(0.6, 0.82, end) * (1 - smooth(0.86, 1, end)), // 集まった光が小さく灯ってから消える
    fade: 1 - smooth(0.72, 0.9, end),
  };
}

// 光はどれも「色を足して、背景は少しだけ隠す」重ね方（あらかじめ掛けたアルファ）。透明なキャンバスでも光って見える
const GLOW_BLEND = { transparent: true, depthWrite: false };

const PLANE_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// 後光: やわらかい光と、2組の筋（回る）。uFlash は中心の白い芯
const HALO_FRAG = `
varying vec2 vUv;
uniform float uI, uFlash, uTurn, uFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float glow = pow(max(1.0 - r, 0.0), 1.8);
  float rays = pow(0.5 + 0.5 * cos(a * 28.0 + uTurn), 6.0) * 0.7 + pow(0.5 + 0.5 * cos(a * 17.0 - uTurn * 1.6 + 1.3), 10.0) * 0.5;
  rays *= smoothstep(1.0, 0.2, r) * smoothstep(0.04, 0.22, r);
  float core = exp(-r * r * 26.0) * uFlash;
  float alpha = ((glow * 0.55 + rays * 0.55) * uI + core) * uFade;
  vec3 col = mix(vec3(1.0, 0.66, 0.1), vec3(1.0, 0.93, 0.66), clamp(glow + core, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha * 0.55);
}`;

// 閃光: 白い芯（半径 uCoreR px）と、画面を洗う広い金の光（uW）。板は 1600px 四方
const FLASH_FRAG = `
varying vec2 vUv;
uniform float uA, uW, uCoreR, uFade;
void main() {
  float d = length(vUv - 0.5) * 1600.0;
  float core = exp(-d * d / (uCoreR * uCoreR)) * uA;
  float wash = exp(-d / 360.0) * uW;
  float alpha = (core + wash) * uFade;
  vec3 col = mix(vec3(1.0, 0.78, 0.28), vec3(1.0, 0.97, 0.86), clamp(core * 1.5, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha * 0.45);
}`;

// 十字の光（解放の瞬間の大きな光と、収束の最後の小さな灯）
const STAR_FRAG = `
varying vec2 vUv;
uniform float uA, uFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec2 q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
  float core = exp(-dot(p, p) * 60.0);
  float crs = exp(-abs(p.y) * 70.0) * (1.0 - abs(p.x)) + exp(-abs(p.x) * 70.0) * (1.0 - abs(p.y));
  float diag = (exp(-abs(q.y) * 110.0) * max(0.0, 1.0 - abs(q.x) * 1.6) + exp(-abs(q.x) * 110.0) * max(0.0, 1.0 - abs(q.y) * 1.6)) * 0.4;
  float alpha = clamp(core * 1.3 + crs * 0.9 + diag, 0.0, 1.4) * uA * uFade;
  vec3 col = mix(vec3(1.0, 0.8, 0.3), vec3(1.0, 0.98, 0.9), clamp(core * 2.0 + crs * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(col * alpha, alpha * 0.6);
}`;

// 衝撃の輪: 半径 uR の細い線と光。uFill は輪の内側に残る光（大きな輪だけ）。uHalf は板の半分の px
const RING_FRAG = `
varying vec2 vUv;
uniform float uR, uA, uFade, uHalf, uFill;
void main() {
  float d = length(vUv - 0.5) * uHalf * 2.0;
  float w = abs(d - uR);
  float line = smoothstep(3.5, 0.0, w);
  float glow = exp(-w * w / 300.0) * 0.5;
  float fill = d < uR ? exp(-(uR - d) / 70.0) * uFill : 0.0;
  float alpha = (line + glow + fill) * uA * uFade;
  vec3 col = mix(vec3(1.0, 0.75, 0.2), vec3(1.0, 0.95, 0.75), line);
  gl_FragColor = vec4(col * alpha, alpha * 0.7);
}`;

// 光の柱: 中心から伸びる細長い板を、立体の向き（奥・手前へ傾く）で回す。正面の向きにまっすぐ見えると長く、手前へ倒れると短く明るく見える。
// position は (根元から先へ 0〜1, 横 -1〜1)、aBeam は (向き, 傾きの幅, 種)。紙より奥に置く（紙の板はカメラから 500。柱は 700 の深さ）
const BEAM_VERT = `
attribute vec3 aBeam;
uniform float uTurn, uLen;
varying vec2 vC;
varying float vLit;
void main() {
  float th = aBeam.x + uTurn;
  float ph = aBeam.y * sin(uTurn * 1.3 + aBeam.z * 6.283);
  vec3 dir = vec3(cos(th) * cos(ph), sin(th) * cos(ph), sin(ph));
  vec3 side = vec3(-sin(th), cos(th), 0.0);
  float len = uLen * (0.75 + 0.5 * fract(aBeam.z * 7.13));
  float w = (16.0 + 30.0 * fract(aBeam.z * 3.7)) * (0.2 + position.x);
  vec4 mv = modelViewMatrix * vec4(dir * position.x * len + side * position.y * w, 1.0);
  mv.z = -700.0;
  vC = position.xy;
  vLit = 0.8 + 0.5 * sin(ph);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = `
varying vec2 vC;
varying float vLit;
uniform float uI, uFade;
void main() {
  float across = abs(vC.y);
  float a = pow(1.0 - vC.x, 1.3) * smoothstep(0.0, 0.1, vC.x) * pow(1.0 - across, 2.0) * uI * vLit * uFade;
  vec3 col = mix(vec3(1.0, 0.68, 0.14), vec3(1.0, 0.95, 0.75), (1.0 - across) * (1.0 - vC.x));
  gl_FragColor = vec4(col * a, a * 0.4);
}`;

// 粒の共通の頭。aVel / aSize / aDelay / aLife / aSeed の意味は粒の種類ごとに下の説明のとおり
const POINT_HEAD = `
attribute vec3 aVel;
attribute float aSize, aDelay, aLife, aSeed;
uniform float uT, uA, uFade, uPx;
varying float vA, vSeed, vT;`;
const POINT_TAIL = `
  vSeed = aSeed; vT = uT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);`;

// 金の粉（破裂の粒と冠の粒が同じ板。どちらも解放の瞬間から aDelay 秒のうちに出る）: aVel は飛ぶ速さ(px/秒)。空気の抵抗で止まりながら落ちる。奥へ飛んだ粒は紙の後ろに回る
const SPARK_VERT = `${POINT_HEAD}
void main() {
  float t = uT - aDelay;
  if (t <= 0.0 || t >= aLife) { vA = 0.0; vSeed = 0.0; vT = 0.0; gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = aVel * (1.0 - exp(-2.6 * t)) / 2.6;
  p.y -= 55.0 * t * t;
  p.z += 15.0;
  float life = t / aLife;
  vA = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.5, 1.0, life)) * uFade;
  gl_PointSize = aSize * (1.0 + p.z / 300.0) * (1.0 - 0.55 * life) * uPx;
${POINT_TAIL}
}`;

// 溜め（光が集まる）: aVel は (向き, 半径, 奥行き)。uT は集まり具合 0〜1（時間の二乗で進む）。画面の外から渦を巻いて中心へ吸い込まれ、
// 終わりに近いほど速く寄り、速く回る
const GATHER_VERT = `${POINT_HEAD}
void main() {
  float g = clamp((uT - aDelay) / (1.0 - aDelay), 0.0, 1.0);
  float rr = aVel.y * (1.0 - g);
  float ang = aVel.x + g * g * 2.6;
  vec3 p = vec3(cos(ang) * rr, sin(ang) * rr, aVel.z);
  vA = smoothstep(0.0, 0.2, g) * (1.0 - smoothstep(0.85, 1.0, g)) * uA * uFade;
  gl_PointSize = aSize * (0.6 + 0.7 * g) * uPx;
${POINT_TAIL}
}`;

// 余韻の舞う粉: 画面全体（uView = 左, 右, 下, 上）に散る。aVel は (横の位置 0〜1, 縦の位置 0〜1, 奥行き)、aLife は落ちる速さ(px/秒)。
// 種が 0.8 より大きい粒は「きらめき」（大きさが脈打ち、十字に光る）。uConv は収束（中心へ渦を巻いて集まる）
const DUST_VERT = `${POINT_HEAD}
uniform vec4 uView;
uniform float uConv;
void main() {
  float h = uView.w - uView.z + 40.0;
  float y = uView.w + 20.0 - mod(aVel.y * h + uT * aLife, h);
  float x = uView.x + aVel.x * (uView.y - uView.x) + sin(uT * 0.8 + aSeed * 6.283) * 14.0;
  float k = 1.0 - uConv;
  float an = uConv * 2.2;
  vec3 p = vec3(mat2(cos(an), sin(an), -sin(an), cos(an)) * vec2(x, y) * k, aVel.z * k);
  float tw = 0.55 + 0.45 * sin(uT * 3.0 + aSeed * 30.0);
  float glint = aSeed > 0.8 ? pow(0.5 + 0.5 * sin(uT * 2.3 + aSeed * 50.0), 4.0) : 0.0;
  vA = uA * max(tw, glint) * uFade;
  gl_PointSize = aSize * (0.75 + 0.35 * tw + 2.4 * glint) * (1.0 - 0.6 * uConv) * uPx;
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
  if (vSeed > 0.75) star = (smoothstep(0.1, 0.0, abs(c.x)) + smoothstep(0.1, 0.0, abs(c.y))) * smoothstep(1.0, 0.2, r) * 0.9;
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
  renderer.setClearColor(0x000000, 0);
  // 舞台が縮められていても画面の端まで描けるよう、板は body の直下に置く（見た目の大きさは CSS の .fx-3d-canvas で画面全体）
  document.body.appendChild(canvas);
  canvas.addEventListener('webglcontextlost', onLost);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  camera.position.z = 500;
  const scene = new THREE.Scene();

  const glowMat = (vert, frag, uniforms) => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms, ...GLOW_BLEND,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const u = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
  const plane = (size, frag, uniforms, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), glowMat(PLANE_VERT, frag, u(uniforms)));
    m.position.z = z;
    scene.add(m);
    return m;
  };

  // 紙の形の見えない板。奥行きだけ書くので、紙より奥（z<0）の光は紙に隠れ、手前の光は紙の上に出る
  const occluder = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ colorWrite: false }));
  occluder.renderOrder = -1;
  scene.add(occluder);

  const halo = plane(900, HALO_FRAG, { uI: 0, uFlash: 0, uTurn: 0, uFade: 1 }, -50);
  const flash = plane(1600, FLASH_FRAG, { uA: 0, uW: 0, uCoreR: 150, uFade: 1 }, 30);
  const star = plane(1, STAR_FRAG, { uA: 0, uFade: 1 }, 40);
  const rings = RING_MAX.map((max, i) => plane(2 * (max + 80), RING_FRAG, { uR: 0, uA: 0, uFade: 1, uHalf: max + 80, uFill: i === 2 ? 0.35 : 0 }, 20));
  rings[1].rotation.x = -1.05; // 寝かせた輪は紙を囲む（上半分は紙の後ろ、下半分は手前）
  rings[1].position.z = 0;

  // 粒は種を固定して、いつ見ても同じ形にする
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // 光の柱（14本を1つの板の束で描く）
  const BEAMS = 14;
  const beamGeo = new THREE.BufferGeometry();
  const bPos = [], bInfo = [], bIdx = [];
  for (let i = 0; i < BEAMS; i++) {
    const info = [(i + rnd() * 0.6) / BEAMS * Math.PI * 2, 0.35 + rnd() * 0.55, rnd()];
    for (const [x, y] of [[0, -1], [1, -1], [1, 1], [0, 1]]) { bPos.push(x, y, 0); bInfo.push(...info); }
    bIdx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
  beamGeo.setAttribute('aBeam', new THREE.Float32BufferAttribute(bInfo, 3));
  beamGeo.setIndex(bIdx);
  const beams = new THREE.Mesh(beamGeo, glowMat(BEAM_VERT, BEAM_FRAG, u({ uTurn: 0, uLen: 520, uI: 0, uFade: 1 })));
  beams.frustumCulled = false; // 位置は頂点の計算で決まる
  scene.add(beams);

  const points = (list, vert, extra = {}) => {
    const count = list.length;
    const geo = new THREE.BufferGeometry();
    const arr = { aVel: new Float32Array(count * 3), aSize: new Float32Array(count), aDelay: new Float32Array(count), aLife: new Float32Array(count), aSeed: new Float32Array(count) };
    list.forEach((p, i) => {
      arr.aVel.set(p.vel, i * 3);
      arr.aSize[i] = p.size; arr.aDelay[i] = p.delay; arr.aLife[i] = p.life; arr.aSeed[i] = rnd();
    });
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aVel', new THREE.BufferAttribute(arr.aVel, 3));
    for (const k of ['aSize', 'aDelay', 'aLife', 'aSeed']) geo.setAttribute(k, new THREE.BufferAttribute(arr[k], 1));
    const obj = new THREE.Points(geo, glowMat(vert, POINT_FRAG, u({ uT: 0, uA: 1, uFade: 1, uPx: 1, ...extra })));
    obj.frustumCulled = false; // 位置は頂点の計算で決まるので、元の位置（全部 0）で隠させない
    scene.add(obj);
    return obj;
  };
  const many = (n, make) => Array.from({ length: n }, make);
  // 破裂: 立体の全方向へ。速いものは画面の端（約 450px 先）まで届く。解放の瞬間から EMIT_SPREAD.burst 秒のうちに全部出る
  const burst = many(PARTICLES.burst, () => {
    const th = rnd() * Math.PI * 2, ph = (rnd() - 0.5) * 1.2, sp = 330 + rnd() * 900;
    return { vel: [Math.cos(th) * Math.cos(ph) * sp, Math.sin(th) * Math.cos(ph) * sp, Math.sin(ph) * sp], size: 6 + rnd() * 11, delay: rnd() * EMIT_SPREAD.burst, life: 1.3 + rnd() * 0.9 };
  });
  // 冠: ほぼ画面と平行に、輪のように一斉に広がる（破裂と同じ瞬間に、速い粒で外側の層を作る）
  const crown = many(PARTICLES.crown, () => {
    const th = rnd() * Math.PI * 2, ph = (rnd() - 0.5) * 0.25, sp = 760 + rnd() * 560;
    return { vel: [Math.cos(th) * Math.cos(ph) * sp, Math.sin(th) * Math.cos(ph) * sp, Math.sin(ph) * sp], size: 5 + rnd() * 8, delay: rnd() * EMIT_SPREAD.crown, life: 0.9 + rnd() * 0.6 };
  });
  const sparks = points([...burst, ...crown], SPARK_VERT);
  const gather = points(many(PARTICLES.gather, () => ({ vel: [rnd() * Math.PI * 2, 230 + rnd() * 230, (rnd() - 0.5) * 120], size: 4 + rnd() * 6, delay: rnd() * 0.4, life: 1 })), GATHER_VERT);
  const dust = points(many(PARTICLES.dust, () => ({ vel: [rnd(), rnd(), (rnd() - 0.5) * 80], size: 3 + rnd() * 4, delay: 0, life: 18 + rnd() * 34 })), DUST_VERT, { uView: new THREE.Vector4(-320, 320, -280, 220), uConv: 0 });
  const pointSets = [sparks, gather, dust];

  // 溜めの震え: 舞台ごと数 px 揺らす（光は下の place で舞台に合わせるので、紙と一緒に揺れる）。
  // 舞台の transform は index.html の fit（縮め）が使うので、その後ろに足して外す
  const SHAKE_RE = / ?translate\([^)]*\)$/;
  let shaking = false;
  const shakeStage = (amount, t) => {
    if (!amount && !shaking) return;
    const base = stage.style.transform.replace(SHAKE_RE, '');
    const px = 3 * amount;
    stage.style.transform = amount ? `${base} translate(${(px * Math.sin(t * 113)).toFixed(2)}px, ${(px * Math.sin(t * 89 + 1.3)).toFixed(2)}px)`.trim() : base;
    shaking = amount > 0;
  };

  // 画面の大きさ・舞台の縮み・紙の位置に、板とカメラと見えない板を毎回合わせる
  const slip = stage.querySelector('.slip');
  let lastW = 0, lastH = 0;
  const place = () => {
    const w = window.innerWidth, h = window.innerHeight;
    if (w !== lastW || h !== lastH) {
      lastW = w; lastH = h;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max(1, w * h))));
      renderer.setSize(w, h, false);
    }
    const st = stage.getBoundingClientRect();
    const k = st.width / STAGE_W || 1; // 舞台の縮み（index.html の fit）
    const cx = st.left + ORIGIN[0] * k, cy = st.top + ORIGIN[1] * k;
    camera.left = -cx / k; camera.right = (w - cx) / k; camera.top = cy / k; camera.bottom = -(h - cy) / k;
    camera.updateProjectionMatrix();
    const px = k * renderer.getPixelRatio();
    for (const o of pointSets) o.material.uniforms.uPx.value = px;
    dust.material.uniforms.uView.value.set(camera.left, camera.right, camera.bottom, camera.top);
    const sr = slip ? slip.getBoundingClientRect() : { left: cx, right: cx, top: cy, bottom: cy, width: 0, height: 0 };
    occluder.position.set(((sr.left + sr.right) / 2 - cx) / k, (cy - (sr.top + sr.bottom) / 2) / k, 0);
    occluder.scale.set(Math.max(sr.width / k, 1e-3), Math.max(sr.height / k, 1e-3), 1);
  };

  return {
    render(tl, t) {
      shakeStage(tl.shake, t);
      place();
      const fade = tl.fade;
      const hu = halo.material.uniforms;
      hu.uI.value = tl.halo * (1 - 0.4 * tl.converge); hu.uFlash.value = tl.flash + 0.3 * tl.tension; hu.uTurn.value = tl.rayTurn; hu.uFade.value = fade;
      const hs = tl.haloScale * (1 + 0.03 * tl.shake * Math.sin(t * 131)); // 震えの間は光の大きさも細かく揺れる
      halo.scale.set(hs, hs, 1);
      // 閃光の芯は解放の瞬間に一番大きく、そこから縮む。紙の後ろに置き（紙の縁からあふれる。字は白く飛ばさない）、
      // 収束の最後は紙の前で小さな灯になる
      const fu = flash.material.uniforms;
      const emberLead = tl.ember > tl.flash;
      fu.uA.value = emberLead ? tl.ember * 0.8 : tl.flash * 0.9; fu.uCoreR.value = emberLead ? 60 : 170 + 130 * tl.flash;
      fu.uW.value = 0.55 * tl.flash;
      flash.visible = fu.uA.value > 0.002 || fu.uW.value > 0.002;
      const su = star.material.uniforms;
      su.uA.value = Math.max(tl.flash, tl.ember);
      const ss = emberLead ? 190 * (0.5 + 0.5 * tl.ember) : 860 * (0.7 + 0.3 * tl.flash);
      flash.position.z = star.position.z = emberLead ? 40 : -40;
      star.scale.set(ss, ss, 1);
      star.visible = su.uA.value > 0.002;
      rings.forEach((m, i) => { const mu = m.material.uniforms; mu.uR.value = tl.rings[i].r; mu.uA.value = tl.rings[i].a * 0.95; mu.uFade.value = fade; m.visible = tl.rings[i].a > 0; });
      const bu = beams.material.uniforms;
      bu.uI.value = tl.beams; bu.uTurn.value = tl.rayTurn; bu.uLen.value = 520 * (1 - 0.9 * tl.converge); bu.uFade.value = fade;
      beams.visible = tl.beams > 0 && fade > 0;
      sparks.visible = tl.sparkT > 0 && tl.sparkT < 2.8;
      sparks.material.uniforms.uT.value = tl.sparkT; sparks.material.uniforms.uFade.value = fade; // 終わりが短い設定でも、紙と一緒に消す
      gather.visible = tl.gather > 0 && tl.gather < 1;
      gather.material.uniforms.uT.value = tl.gather; gather.material.uniforms.uA.value = 0.45 + 0.55 * tl.tension; gather.material.uniforms.uFade.value = fade;
      const du = dust.material.uniforms;
      dust.visible = tl.dust > 0 && fade > 0;
      du.uT.value = t; du.uA.value = tl.dust; du.uFade.value = fade; du.uConv.value = tl.converge;
      renderer.render(scene, camera);
    },
    // 後片付け: 立体と素材と WebGL の文脈を捨て、板も画面から外す。次の抽選には何も残さない
    dispose() {
      shakeStage(0, 0); // 途中で終わっても舞台の揺れを残さない
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
  let fx = null;
  let raf = 0;
  let run = 0; // 何回目の大吉か。読み込みを待つ間に終わった回を見分ける
  let failed = false; // 一度読めなかった・描けなかったら、このページでは CSS の演出に任せる
  let doneAt = 0; // 終わりの段階（done）が始まった時刻。収束の進みは --done（紙の消え方 daikichi-done と同じ長さ）で数える
  let doneSec = 3.5;

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
    doneAt = 0;
    const burstAt = parseFloat(getComputedStyle(stage).getPropertyValue('--fx-delay')) || 1.2;
    load().then((THREE) => {
      if (id !== run) return; // 読み込みの間に終わった、または次の抽選になった
      // 解放（破裂）に間に合わなかった回は、途中で切り替えると粉や輪が途中で消えるので CSS 版のまま見せる（次からは読み込み済み）
      if ((performance.now() - startAt) / 1000 > burstAt) return;
      fx = createFx(THREE, stage, () => { failed = true; stop(); });
      stage.classList.add('fx-3d');
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const t = Math.max(0, (now - startAt) / 1000);
        const end = doneAt ? clamp01((now - doneAt) / 1000 / doneSec) : 0;
        fx.render(daikichiTimeline(t, burstAt, end), t);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => { if (id === run) { failed = true; stop(); } });
  };

  let lastPhase = '';
  const sync = () => {
    const phase = stage.getAttribute('data-phase') || '';
    const newReveal = phase === 'reveal' && lastPhase !== 'reveal';
    if (phase === 'done' && lastPhase !== 'done') {
      doneAt = performance.now();
      doneSec = parseFloat(getComputedStyle(stage).getPropertyValue('--done')) || 3.5;
    }
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
