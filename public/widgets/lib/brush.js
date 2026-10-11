// 筆でかすれた帯の画像（SVG を毎回ちがう筆跡で作る）。カットインの帯と、RUSH の左右の筆の線で使う。
// w × h の帯を、上下に h * 0.3 ずつ余白を付けて描く（画像の高さは h * 1.6。wave を大きくすると余白も増え、img.pad でわかる）。
// colors は帯の向きに沿ったグラデーション、streak はかすれ具合（feColorMatrix のアルファの行）。
// wave は帯のうねりの大きさ（太さに対する倍率）。細い線は大きくすると手描きらしくなる。
export function brushImage(w, h, colors, seed, { ink = false, glint = false, core = true, streak = null, wave = 0.32 } = {}) {
  const padK = Math.max(0.3, wave * 0.6);
  const pad = Math.round(h * padK);
  const fy = `y="${-padK * 100}%" height="${100 + padK * 200}%"`;
  const H = h + pad * 2;
  const y0 = pad, y1 = pad + h;
  // 入りは細く、抜けはかすれて伸びる筆の形
  const shape = `M ${w * 0.05} ${y0 + h * 0.12} C ${w * 0.3} ${y0 - h * 0.04}, ${w * 0.7} ${y0 + h * 0.02}, ${w * 0.985} ${y0 + h * 0.06}
    L ${w} ${y0 + h * 0.45} L ${w * 0.97} ${y1 - h * 0.02} C ${w * 0.6} ${y1 + h * 0.03}, ${w * 0.3} ${y1}, ${w * 0.03} ${y1 - h * 0.1}
    L 0 ${y0 + h * 0.5} Z`;
  const stops = colors.map((c, i) => `<stop offset="${i / (colors.length - 1)}" stop-color="${c}"/>`).join('');
  const fill = ink ? '#000' : glint ? '#fff' : 'url(#g)';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="${colors.length > 5 ? 1 : 0.35}" y2="1">${stops}</linearGradient>
      <filter id="rough" x="-2%" ${fy} width="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.018" numOctaves="2" seed="${seed}" result="wave"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="${seed + 3}" result="jag"/>
        <feDisplacementMap in="SourceGraphic" in2="wave" scale="${h * wave}" xChannelSelector="R" yChannelSelector="G" result="a"/>
        <feDisplacementMap in="a" in2="jag" scale="${h * 0.1}" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="dry" x="-2%" ${fy} width="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.018" numOctaves="2" seed="${seed}" result="wave"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="${seed + 3}" result="jag"/>
        <feDisplacementMap in="SourceGraphic" in2="wave" scale="${h * wave}" xChannelSelector="R" yChannelSelector="G" result="a"/>
        <feDisplacementMap in="a" in2="jag" scale="${h * 0.1}" xChannelSelector="R" yChannelSelector="G" result="b"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.0018 ${glint ? 0.5 : 0.24}" numOctaves="3" seed="${seed + 7}" result="streak"/>
        <feColorMatrix in="streak" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${streak ?? (glint ? '9 0 0 0 -5.6' : '7 0 0 0 -2.9')}" result="mask"/>
        <feComposite in="b" in2="mask" operator="in"/>
      </filter>
    </defs>
    <path d="${shape}" fill="${fill}" filter="url(#dry)"/>
    ${glint || !core ? '' : `<path d="${shape}" fill="${fill}" filter="url(#rough)" transform="translate(${w * 0.06} ${H / 2}) scale(0.86 0.62) translate(0 ${-H / 2})"/>`}
  </svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  img.alt = '';
  img.pad = pad;
  return img;
}
