// Monta as peças a partir de dados.js. Cada peça escolhe suas ofertas por regra (não por produto fixo),
// então trocar a semana refaz stories, post e carrossel sozinho.
import { produtos, semanas, legal, alcool } from './dados.js';

const A = new URL('assets/', import.meta.url).href;            // imagens relativas a este módulo: funciona na landing também
const img = p => `${A}produtos/${produtos[p].img}.webp`;
const CAT = { frutas: ['melancia', 'abacaxi', 'manga', 'coco'], churrasco: ['contrafile', 'linguica', 'coalho', 'carvao'],
  bebidas: ['cerveja', 'refri', 'gelo'], gelados: ['sorvete', 'picole'] };

export { img };
export function boia(o, cls = '', d) {
  const p = produtos[o.p], [i, c] = o.preco.toFixed(2).split('.');
  const k = { 1: .3, 2: .25, 3: .2 }[i.length];
  const de = o.de ? `<span class="de">de <s>R$ ${o.de.toFixed(2).replace('.', ',')}</s> por</span>` : '';
  return `<div class="boia ${cls}" style="--k:${k}${d ? `;--d:${d}px` : ''}">${de}<div class="miolo"><span class="rs">R$</span>
    <span class="valor"><span class="int">${i}</span><span class="dec">,${c}</span></span><span class="un">${p.un === 'kg' ? 'o quilo' : 'cada'}</span></div></div>`;
}

// bolhas em posições fixas (mesmo PNG a cada exportação)
const bolhas = (n, y0, y1, seed = 1) => Array.from({ length: n }, (_, i) => {
  const r = k => ((Math.sin(seed * 97.1 + i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const s = 10 + r(1) * 26, x = 40 + r(2) * 1000, y = y0 + r(3) * (y1 - y0);
  return `<i class="bolha" style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;--t:${7 + r(4) * 6}s;--atraso:-${r(5) * 9}s"></i>`;
}).join('');

// ofertas da semana nas categorias pedidas, na ordem das categorias (a peça só lista o que combina com o título)
const pick = (s, cats, n) => cats.flatMap(c => s.ofertas.filter(o => CAT[c].includes(o.p))).slice(0, n);
const rodape = (s, os) => `<p class="legal">${legal(s)}${os.some(o => produtos[o.p].alcool) ? ' ' + alcool : ''}</p>`;
const texto = o => `<p class="nome">${produtos[o.p].nome}</p>${produtos[o.p].det ? `<p class="det">${produtos[o.p].det}</p>` : ''}`;

export const PECAS = {
  'story-destaque': s => {
    const o = s.ofertas.find(o => o.meu) ?? s.ofertas[0];
    return { cls: 'story destaque', bg: A + 'peca-story-fundo.webp', html: `
      ${bolhas(9, 900, 1700, 2)}
      <img class="peixe flutua" style="--atraso:-1.2s" src="${A}peixe-laranja-frente.webp" alt="">
      <span class="selo">${o.meu ? 'Exclusivo Meu Big Box' : 'Oferta da semana'}</span>
      <img class="produto flutua" src="${img(o.p)}" alt="${produtos[o.p].nome}">
      ${boia(o, 'flutua')}
      <div class="texto">${texto(o)}</div>${rodape(s, [o])}` };
  },
  'story-churrasco': s => {
    const os = pick(s, ['churrasco', 'bebidas'], 3);
    return { cls: 'story lista funda', bg: A + 'peca-story-fundo.webp', html: `
      ${bolhas(8, 880, 1700, 3)}
      <img class="peixe nada" src="${A}peixe-vermelho-lado.webp" alt="">
      <h2 class="titulo">Tudo pro<br>churrasco</h2>
      <div class="itens">${os.map((o, i) => `<div class="item"><div class="foto"><img class="flutua" style="--atraso:-${i * 1.3}s" src="${img(o.p)}" alt=""></div>
        <div class="texto">${texto(o)}</div>${boia(o, 'flutua')}</div>`).join('')}</div>${rodape(s, os)}` };
  },
  'feed-gelados': s => ({ cls: 'feed funda grade dupla', bg: A + 'peca-feed-fundo.webp',
    html: grade('Pra refrescar', pick(s, ['gelados', 'frutas', 'bebidas'], 2), s) }),
  'carrossel-1': s => ({ cls: 'feed capa', bg: A + 'peca-feed-fundo.webp', html: `
      ${bolhas(10, 620, 1300, 5)}
      <h2 class="titulo">Ofertas que<br>refrescam</h2>
      <img class="peixe pa flutua" src="${A}peixe-laranja-frente.webp" alt=""><img class="peixe pb flutua" style="--atraso:-2.4s" src="${A}peixe-vermelho-frente.webp" alt="">
      <span class="selo arraste">Arraste para ver as ofertas →</span>` }),
  'carrossel-2': s => ({ cls: 'feed fundo grade', bg: A + 'peca-story-fundo.webp', html: grade('Bem gelado', pick(s, ['bebidas', 'gelados'], 4), s, A + 'peixe-laranja-lado.webp') }),
  'carrossel-3': s => ({ cls: 'feed fundo grade', bg: A + 'peca-story-fundo.webp', html: grade('Fruta da estação', pick(s, ['frutas'], 4), s, A + 'peixe-vermelho-lado.webp') }),
};
const grade = (t, os, s, peixe) => `
  ${bolhas(9, 300, 1250, t.length)}${peixe ? `<img class="peixe flutua" src="${peixe}" alt="">` : ''}
  <h2 class="titulo">${t}</h2>
  <div class="itens${os.length <= 2 ? ' um' : ''}" style="grid-template-rows:repeat(${Math.ceil(os.length / 2)},minmax(0,1fr))">${os.map((o, i) => `<div class="cel"><div class="foto"><img class="flutua" style="--atraso:-${i * 1.1}s" src="${img(o.p)}" alt="">${boia(o, 'flutua')}</div>
    ${texto(o)}</div>`).join('')}</div>${rodape(s, os)}`;

export function monta(id, s) {
  const { cls, bg, html } = PECAS[id](s);
  const el = document.createElement('article');
  el.className = 'peca ' + cls; el.dataset.peca = id;
  if (bg) el.style.setProperty('--bg', `url(${bg})`);
  el.innerHTML = html;
  return el;
}
export { semanas };
