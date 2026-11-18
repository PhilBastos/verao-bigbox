// Landing: peças ao vivo (mesmo arquivo de ofertas), tabloide, pilha de camadas do KV, carrossel arrastável e o
// profundímetro, que marca os capítulos pela profundidade. A cena 3D (main.js) lê a mesma rolagem por conta própria.
import { monta, semanas } from '../pecas/pecas.js';
import { tabloide } from '../pecas/tabloide.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);

// ---------- peças: renderizadas da semana escolhida no tabloide ----------
const pecas = s => $$('[data-vitrine]').forEach(el => el.replaceChildren(monta(el.dataset.vitrine, s)));
pecas(semanas[0]);
let primeira = true;
tabloide($('#tabloide .tabloide'), { aoTrocar: s => {
  if (primeira) { primeira = false; return; }
  pecas(s); $('.semana-aviso').textContent = `${s.nome} (${s.datas}): as peças acima já mudaram`;
} });

// ---------- carrossel: arrastar com o mouse (toque e trackpad já rolam sozinhos) ----------
const trilho = $('.trilho'), pontos = $$('.carrossel .pontos i');
let x0 = null;
trilho.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; x0 = e.clientX + trilho.scrollLeft; trilho.classList.add('arrastando'); trilho.setPointerCapture(e.pointerId); });
trilho.addEventListener('pointermove', e => { if (x0 !== null) trilho.scrollLeft = x0 - e.clientX; });
const solta = () => { x0 = null; trilho.classList.remove('arrastando'); };
trilho.addEventListener('pointerup', solta); trilho.addEventListener('pointercancel', solta);
const marca = () => { const i = Math.round(trilho.scrollLeft / (trilho.scrollWidth / 3)); pontos.forEach((p, k) => p.classList.toggle('on', k === i)); };
trilho.addEventListener('scroll', marca, { passive: true }); marca();

// ---------- profundímetro: 0 m na linha d'água, 2 m ao fim do mergulho, 40 m no fim da página ----------
const H = () => innerHeight, FUNDO = 40;
function prof(y) {
  const a = 1.3 * H(), b = 2.6 * H(), fim = Math.max(b + 1, document.documentElement.scrollHeight - H());
  return y <= a ? 0 : y <= b ? 2 * (y - a) / (b - a) : 2 + (FUNDO - 2) * clamp((y - b) / (fim - b));
}
const caps = $$('main > section'), lista = $('#caps'), leitura = $('.leitura b'), nav = $('.profundimetro');
let marcas = [];
function montaMarcas() {
  marcas = caps.map(c => ({ c, y: c === caps[0] ? 0 : c.offsetTop - 0.3 * H() }));
  lista.innerHTML = marcas.map(({ c, y }) => { const m = Math.round(prof(y));
    return `<li style="top:${100 * prof(y) / FUNDO}%"><a href="#${c.id}"><b>${m} m</b><span>${c.dataset.cap}</span></a></li>`; }).join('');
  marcas.forEach(({ c, y }) => { const o = $('.olho', c); if (o) o.textContent = `${Math.round(prof(y))} m · ${c.dataset.cap}`; });
}
function atualiza() {
  const y = scrollY, p = prof(y);
  leitura.textContent = p.toFixed(1).replace('.', ',');
  lista.style.setProperty('--y', `${100 * p / FUNDO}%`);
  nav.classList.toggle('visivel', y > 2.2 * H());   // só depois de entrar na água
  const atual = marcas.filter(m => m.y <= y + 2).pop()?.c;
  $$('a', lista).forEach(a => a.toggleAttribute('aria-current', a.hash === '#' + atual?.id));
  camadas();
}
$('.leitura').addEventListener('click', () => { const on = nav.classList.toggle('aberto'); $('.leitura').setAttribute('aria-expanded', on); });
lista.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('aberto'); $('.leitura').setAttribute('aria-expanded', false); } });

// ---------- o KV em camadas: a pilha se abre no meio da seção e se fecha antes do fim ----------
const secC = $('#campanha'), pilha = $('.camadas');
function camadas() {
  const r = secC.getBoundingClientRect(), e = clamp(-r.top / Math.max(1, r.height - H()));
  pilha.style.setProperty('--s', Math.pow(Math.sin(Math.PI * clamp(e / 0.85)), 0.8).toFixed(3));
}

// ---------- voltar à superfície: a câmera e os peixes sobem junto com a rolagem ----------
$('.subir').addEventListener('click', () => (dispatchEvent(new Event('voltar-superficie')), scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })));   // main.js refaz os saltos ao chegar

addEventListener('scroll', atualiza, { passive: true });
addEventListener('resize', () => { montaMarcas(); atualiza(); });
addEventListener('load', () => { montaMarcas(); atualiza(); });
montaMarcas(); atualiza();
