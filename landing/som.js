// Som da landing, sintetizado no navegador (Web Audio, sem arquivos):
//   superfície: vento em rajadas, ondas que crescem e quebram, marolinhas;
//   mergulho: ao cruzar a linha d'água, respingo + baque grave + bolhas (na volta, uma emersão mais leve);
//   fundo: ronco abafado da água e bolhas de vez em quando, mais escuro quanto mais fundo;
//   respingos dos saltos dos peixes (evento 'respingo' do main.js), no lado da tela em que acontecem.
// A mistura segue a câmera (window.cena, escrita pelo main.js). O navegador só toca depois de um clique: começa mudo.
const btn = document.querySelector('.som'), rotulo = btn.querySelector('span');
let ctx = null, M = null, ligado = false, yAnt = null, ultimo = -9;

const suave = (a, b, v) => { const k = Math.min(Math.max((v - a) / (b - a), 0), 1); return k * k * (3 - 2 * k); };

function ruido(marrom) {                        // 4 s em laço, sem estalo na emenda
  const n = ctx.sampleRate * 4, b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let u = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; d[i] = marrom ? (u = (u + 0.02 * w) / 1.02) * 3.5 : w; }
    if (marrom) { const dd = d[n - 1] - d[0]; for (let i = 0; i < n; i++) d[i] -= dd * i / n; }
  }
  return b;
}
const filtro = (type, frequency, Q = 0.7) => new BiquadFilterNode(ctx, { type, frequency, Q });
const ganho = (v = 0) => new GainNode(ctx, { gain: v });
const laco = buf => { const s = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true }); s.start(0, Math.random() * 3); return s; };
const vai = (p, v, tau = 0.15) => p.setTargetAtTime(v, ctx.currentTime, tau);

function monta() {
  ctx = new AudioContext();
  const branco = ruido(false), marrom = ruido(true);
  const master = ganho(0), comp = new DynamicsCompressorNode(ctx, { threshold: -14, ratio: 3 });
  master.connect(comp).connect(ctx.destination);
  // superfície (passa por um passa-baixa que fecha quando a câmera afunda: o som fica abafado)
  const sup = ganho(1), supLP = filtro('lowpass', 14000); sup.connect(supLP).connect(master);
  const ventoBP = filtro('bandpass', 600, 0.6), ventoG = ganho(); laco(branco).connect(ventoBP).connect(ventoG).connect(sup);
  const ondasLP = filtro('lowpass', 750, 0.5), ondasG = ganho(); laco(marrom).connect(ondasLP).connect(ondasG).connect(sup);
  const marolaBP = filtro('bandpass', 2400, 1.3), marolaG = ganho(); laco(branco).connect(marolaBP).connect(marolaG).connect(sup);
  // fundo
  const fundo = ganho(0), fundoLP = filtro('lowpass', 900); fundo.connect(master); fundoLP.connect(fundo);
  const roncoLP = filtro('lowpass', 210, 0.8), roncoG = ganho(0.9); laco(marrom).connect(roncoLP).connect(roncoG).connect(fundo);
  const chiado = ganho(0.016); laco(branco).connect(filtro('lowpass', 380)).connect(chiado).connect(fundo);
  // efeitos pontuais
  const fx = ganho(1); fx.connect(master);
  M = { master, supLP, ventoBP, ventoG, ondasG, marolaG, marolaBP, fundo, fundoLP, roncoLP, fx, branco };
  setInterval(atualiza, 50);
}

function atualiza() {
  if (!ligado || !window.cena) return;
  const { y, deep } = window.cena, t = ctx.currentTime, w = suave(0.45, -0.45, y);   // 0 na superfície, 1 debaixo d'água
  vai(M.supLP.frequency, 350 + 13650 * (1 - w) ** 3);
  vai(M.ventoG.gain, (1 - w) * (0.03 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.23)) * (0.5 + 0.5 * Math.sin(t * 0.61 + 1))), 0.4);   // rajadas
  vai(M.ventoBP.frequency, 420 + 380 * (0.5 + 0.5 * Math.sin(t * 0.17)), 0.5);
  const fase = (t % 7.3) / 7.3;                                                       // a onda cresce, quebra e espalha
  vai(M.ondasG.gain, (1 - w) * (0.08 + 0.3 * Math.sin(Math.PI * fase) ** 3), 0.3);
  vai(M.marolaG.gain, (1 - w) * (0.004 + 0.016 * Math.max(0, Math.sin(t * 2.3) * Math.sin(t * 0.9 + 2))), 0.08);
  vai(M.fundo.gain, w * (0.8 + 0.35 * deep), 0.3);
  vai(M.roncoLP.frequency, 230 - 110 * deep, 0.5);                                    // mais fundo, mais grave
  if (w > 0.6 && Math.random() < 0.05 * (1 - 0.6 * deep)) bolhas(2 + (Math.random() * 4 | 0), t, 0.5, 0.05, M.fundoLP);
  // linha d'água: mergulho ao descer, emersão ao subir (com folga, para não repetir)
  if (yAnt !== null && t - ultimo > 1.2) {
    if (yAnt > 0.08 && y <= 0.08) { mergulho(); ultimo = t; }
    else if (yAnt < -0.08 && y >= -0.08) { emersao(); ultimo = t; }
  }
  yAnt = y;
}

function burst(t, dur, f0, f1, vol, dest, pan = 0) {   // ruído por um passa-banda que desce: o respingo
  const s = new AudioBufferSourceNode(ctx, { buffer: M.branco }), bp = filtro('bandpass', f0, 0.9), g = ganho();
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(bp).connect(g).connect(new StereoPannerNode(ctx, { pan })).connect(dest); s.start(t, Math.random() * 2, dur + 0.05);
}
function bolhas(n, t0, span, vol, dest) {               // cada bolha: um "plip" que sobe de tom
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.random() * span, f = 380 + Math.random() * 1100, d = 0.04 + Math.random() * 0.07;
    const o = new OscillatorNode(ctx, { frequency: f }), g = ganho();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.8, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (0.4 + 0.6 * Math.random()), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.03);
  }
}
function mergulho() {
  const t = ctx.currentTime;
  burst(t, 0.95, 2600, 380, 1, M.fx);
  const o = new OscillatorNode(ctx, { frequency: 110 }), g = ganho();                 // baque grave da entrada na água
  o.frequency.setValueAtTime(110, t + 0.04); o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
  g.gain.setValueAtTime(0, t + 0.04); g.gain.linearRampToValueAtTime(0.55, t + 0.07); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(g).connect(M.fx); o.start(t + 0.04); o.stop(t + 0.55);
  bolhas(22, t + 0.15, 1.5, 0.16, M.fundoLP);
  vai(M.fundo.gain, 1, 0.05);
}
function emersao() {
  const t = ctx.currentTime;
  burst(t, 0.6, 1800, 3800, 0.35, M.fx);
  bolhas(8, t, 0.4, 0.08, M.fx);
}
addEventListener('respingo', e => {
  if (!ligado || !window.cena || window.cena.y < 0) return;
  const { k, x } = e.detail;
  burst(ctx.currentTime, 0.45 + 0.25 * k, 3200, 650, 0.22 * k, M.fx, Math.max(-0.9, Math.min(0.9, x / 8)));
});

btn.addEventListener('click', async () => {
  if (!ctx) monta();
  ligado = !ligado;
  if (ligado) { await ctx.resume(); vai(M.master.gain, 0.6, 0.4); } else vai(M.master.gain, 0, 0.15);
  btn.setAttribute('aria-pressed', ligado); rotulo.textContent = ligado ? 'Desligar som' : 'Ligar som';
});
document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ligado && ctx.resume(); });
