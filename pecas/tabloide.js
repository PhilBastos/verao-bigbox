// Tabloide digital: lê o mesmo arquivo de ofertas das peças. Trocar a semana faz as ofertas afundarem e as novas
// subirem; tocar num produto revela a oferta relâmpago (15% abaixo, até a meia-noite).
// root precisa ter .tab-barra, .grade-t e .tab-legal. aoTrocar(semana) avisa quem mais mostra a semana (as peças na landing).
import { produtos, semanas, legal, alcool } from './dados.js';
import { boia, img } from './pecas.js';

const relampago = v => Math.floor(v * 0.85 * 10) / 10 + 0.09;
const resta = () => { const f = new Date(); f.setHours(24, 0, 0, 0); const s = Math.max(0, (f - Date.now()) / 1000 | 0);
  return [s / 3600 | 0, (s / 60 | 0) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':'); };

function cartao(o, i) {
  const p = produtos[o.p];
  return `<button class="oferta entra" style="--i:${i}" aria-pressed="false" data-p="${o.p}">
    <span class="foto"><img src="${img(o.p)}" alt="">${boia(o)}</span>
    <span class="nome">${p.nome}</span>${p.det ? `<span class="det">${p.det}</span>` : ''}
    ${o.meu ? '<span class="meu">Exclusivo Meu Big Box</span>' : ''}<span class="raio">Exemplo · acaba em <b>${resta()}</b></span></button>`;
}

export function tabloide(root, { semana = 1, aoTrocar } = {}) {
  const barra = root.querySelector('.tab-barra'), grade = root.querySelector('.grade-t'), rodape = root.querySelector('.tab-legal');
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let atual = null;
  async function mostra(id) {
    const s = semanas.find(s => s.id === id); if (!s || s === atual) return;
    barra.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === id));
    if (atual && !reduz) {                                             // as ofertas da semana anterior afundam…
      grade.querySelectorAll('.oferta').forEach((c, i) => { c.classList.replace('entra', 'sai'); c.style.setProperty('--i', i); });
      await new Promise(r => setTimeout(r, 650));
    }
    atual = s;                                                         // …e as novas sobem
    grade.innerHTML = s.ofertas.map(cartao).join('');
    rodape.textContent = legal(s) + (s.ofertas.some(o => produtos[o.p].alcool) ? ' ' + alcool : '') + ' Produtos e preços ilustrativos.';
    aoTrocar?.(s);
  }
  grade.addEventListener('click', e => {
    const c = e.target.closest('.oferta'); if (!c) return;
    const on = c.getAttribute('aria-pressed') !== 'true', o = atual.ofertas.find(o => o.p === c.dataset.p);
    c.querySelector('.boia').outerHTML = boia(on ? { ...o, de: o.preco, preco: relampago(o.preco) } : o);
    c.setAttribute('aria-pressed', on);
  });
  setInterval(() => root.querySelectorAll('.oferta[aria-pressed=true] .raio b').forEach(b => b.textContent = resta()), 1000);
  for (const s of semanas) barra.insertAdjacentHTML('beforeend', `<button data-s="${s.id}">${s.nome}<small>${s.datas.slice(0, 10)}</small></button>`);
  barra.addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostra(+b.dataset.s); });
  mostra(semana);
  return { mostra };
}
