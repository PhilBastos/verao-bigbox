// Produtos e ofertas da campanha Verão Big Box. Stories, posts, carrossel e tabloide leem daqui:
// trocar um preço ou a semana muda todas as peças. Produtos e preços são ilustrativos (apresentação).
// un: 'kg' → a boia diz "o quilo" (det fica vazio); senão a boia diz "cada" e det traz a embalagem.
export const produtos = {
  melancia: { nome: 'Melancia', det: '', un: 'kg', img: 'melancia' },
  abacaxi: { nome: 'Abacaxi pérola', det: 'unidade', img: 'abacaxi' },
  manga: { nome: 'Manga palmer', det: '', un: 'kg', img: 'manga' },
  coco: { nome: 'Coco verde', det: 'unidade', img: 'coco' },
  contrafile: { nome: 'Contrafilé em bifes', det: '', un: 'kg', img: 'contrafile' },
  linguica: { nome: 'Linguiça toscana', det: '', un: 'kg', img: 'linguica' },
  coalho: { nome: 'Queijo coalho no espeto', det: 'pacote com 5', img: 'queijo-coalho' },
  carvao: { nome: 'Carvão vegetal', det: 'saco 3 kg', img: 'carvao' },
  gelo: { nome: 'Gelo em cubos', det: 'saco 5 kg', img: 'gelo' },
  cerveja: { nome: 'Cerveja pilsen', det: 'lata 350 ml', img: 'cerveja', alcool: true },
  refri: { nome: 'Refrigerante guaraná', det: 'garrafa 2 litros', img: 'refrigerante' },
  sorvete: { nome: 'Sorvete napolitano', det: 'pote 1,5 litro', img: 'sorvete' },
  picole: { nome: 'Picolé de frutas', det: 'unidade', img: 'picole' },
  protetor: { nome: 'Protetor solar FPS 50', det: 'frasco 200 ml', img: 'protetor' },
};

// cada oferta: p = produto, preco, de = preço anterior (opcional), meu = exclusivo para clientes Meu Big Box
export const semanas = [
  { id: 1, nome: 'Semana 1', datas: '05 a 11/01/2027', ofertas: [
    { p: 'melancia', preco: 1.99, de: 2.89, meu: true },
    { p: 'contrafile', preco: 39.9, de: 46.9 },
    { p: 'linguica', preco: 18.98 },
    { p: 'carvao', preco: 14.98, meu: true },
    { p: 'cerveja', preco: 2.99, de: 3.69 },
    { p: 'gelo', preco: 9.98 },
    { p: 'sorvete', preco: 16.98, de: 21.9, meu: true },
    { p: 'picole', preco: 2.49 },
    { p: 'coco', preco: 4.98 },
    { p: 'protetor', preco: 39.9, de: 52.9 },
  ] },
  { id: 2, nome: 'Semana 2', datas: '12 a 18/01/2027', ofertas: [
    { p: 'abacaxi', preco: 5.98, de: 7.49, meu: true },
    { p: 'manga', preco: 4.49 },
    { p: 'coalho', preco: 17.98, de: 22.9 },
    { p: 'contrafile', preco: 42.9 },
    { p: 'refri', preco: 6.98, de: 8.99, meu: true },
    { p: 'cerveja', preco: 3.19 },
    { p: 'gelo', preco: 8.98, meu: true },
    { p: 'sorvete', preco: 18.98 },
    { p: 'melancia', preco: 2.29 },
    { p: 'protetor', preco: 42.9 },
  ] },
  { id: 3, nome: 'Semana 3', datas: '19 a 25/01/2027', ofertas: [
    { p: 'coco', preco: 3.98, de: 4.98, meu: true },
    { p: 'picole', preco: 1.99, de: 2.49 },
    { p: 'linguica', preco: 16.98, meu: true },
    { p: 'coalho', preco: 18.98 },
    { p: 'carvao', preco: 13.98 },
    { p: 'refri', preco: 7.49 },
    { p: 'manga', preco: 3.99, de: 4.99, meu: true },
    { p: 'abacaxi', preco: 6.49 },
    { p: 'cerveja', preco: 2.89, de: 3.69 },
    { p: 'sorvete', preco: 15.98, de: 18.98 },
  ] },
];

export const legal = s => `*Imagens meramente ilustrativas. Ofertas válidas para todas as lojas Big Box, de ${s.datas}, ou enquanto durarem os estoques.`;
export const alcool = 'Beba com moderação. Venda proibida para menores de 18 anos.';
