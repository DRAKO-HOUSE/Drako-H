// Painel do restaurante: autenticação, dados em tempo real e telas das abas.
import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { ref, get, set, update, remove, push, onValue, onChildAdded, onChildChanged, onChildRemoved,
  query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { el, formatarPreco, somenteDigitos, formatarDataHora, toast, comCarregamento, lerLocal, gravarLocal } from './utils.js';
import * as impressora from './printer.js';

const STATUS = ['Novo', 'Em preparo', 'Saiu para entrega', 'Entregue', 'Cancelado'];
const NOMES_TIPO = { batatas: 'Tamanhos M/G + adicionais', combos: 'Combo com sabores', simples: 'Preço único' };
const CHAVE_PREFS = 'drako_impressora_v1';
const $ = (id) => document.getElementById(id);

const estado = {
  categorias: {}, produtos: {}, adicionais: {}, bairros: {},
  entrega: { cobrarTaxa: true, modo: 'bairro', taxaUnica: 0 },
  restaurante: {},
  pedidos: new Map(),
  cancelar: [],                 // funções para remover os listeners ao sair
  painelAtivo: false,
  impressos: new Set(),         // ids já impressos automaticamente
  fotoProduto: '',
  prefs: { colunas: 32, auto: false, ...lerLocal(CHAVE_PREFS, {}) }
};

// ---------- Mensagens de erro ----------

function traduzirErroAuth(codigo) {
  const mapa = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.'
  };
  return mapa[codigo] || 'Não foi possível entrar. Tente novamente.';
}

function traduzirErroBanco(erro) {
  return /permission_denied/i.test(`${erro?.code} ${erro?.message}`)
    ? 'Sem permissão. Confira as regras do banco e se esta conta está em admins.'
    : 'Não foi possível concluir. Verifique a conexão e tente de novo.';
}

// Executa uma gravação com loading no botão e toast de sucesso/erro.
async function gravar(botao, operacao, mensagemOk) {
  try {
    await comCarregamento(botao, operacao);
    toast(mensagemOk);
    return true;
  } catch (erro) {
    toast(traduzirErroBanco(erro), 'erro');
    return false;
  }
}

// ---------- Autenticação ----------

function mostrarTela(nome) {
  $('tela-login').hidden = nome !== 'login';
  $('tela-painel').hidden = nome !== 'painel';
}

function mostrarErroLogin(texto) {
  $('login-erro').textContent = texto;
  $('login-erro').hidden = !texto;
}

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) { pararPainel(); mostrarTela('login'); return; }
  try {
    const admin = await get(ref(db, `admins/${usuario.uid}`));
    if (admin.val() !== true) {
      await signOut(auth);
      mostrarErroLogin('Esta conta não tem acesso ao painel.');
      return;
    }
    $('email-logado').textContent = usuario.email;
    mostrarTela('painel');
    iniciarPainel();
  } catch (erro) {
    await signOut(auth);
    mostrarErroLogin(traduzirErroBanco(erro));
  }
});

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarErroLogin('');
  const email = $('login-email').value.trim();
  const senha = $('login-senha').value;
  if (!email || !senha) { mostrarErroLogin('Informe o e-mail e a senha.'); return; }
  try {
    await comCarregamento(e.submitter, () => signInWithEmailAndPassword(auth, email, senha));
    $('login-senha').value = '';
  } catch (erro) {
    mostrarErroLogin(traduzirErroAuth(erro.code));
  }
});

$('btn-sair').addEventListener('click', () => signOut(auth));

// ---------- Ciclo de vida dos listeners ----------

function assinar(caminho, aoReceber) {
  const cancelar = onValue(ref(db, caminho), (s) => aoReceber(s.val()),
    () => toast(`Não foi possível carregar "${caminho}".`, 'erro'));
  estado.cancelar.push(cancelar);
}

function iniciarPainel() {
  if (estado.painelAtivo) return;
  estado.painelAtivo = true;
  assinar('categorias', (v) => { estado.categorias = v || {}; renderCategorias(); renderSelectCategoria(); renderProdutos(); });
  assinar('produtos', (v) => { estado.produtos = v || {}; renderProdutos(); renderCategorias(); });
  assinar('adicionais', (v) => { estado.adicionais = v || {}; renderAdicionais(); });
  assinar('bairros', (v) => { estado.bairros = v || {}; renderBairros(); });
  assinar('configuracoes/entrega', (v) => { if (v) estado.entrega = v; renderEntrega(); });
  assinar('configuracoes/restaurante', (v) => { estado.restaurante = v || {}; renderConfig(); });
  assinar('configuracoes/statusLoja', (v) => { atualizarBotoesStatusLoja(v !== false); });
  assinarPedidos();
  renderImpressora();
}

function pararPainel() {
  estado.cancelar.forEach(cancelar => cancelar());
  estado.cancelar = [];
  estado.painelAtivo = false;
  estado.pedidos.clear();
  if (impressora.impressoraConectada()) impressora.desconectarImpressora();
}

// ---------- Abas ----------

document.querySelector('.adm-abas').addEventListener('click', (e) => {
  const botao = e.target.closest('[data-aba]');
  if (!botao) return;
  document.querySelectorAll('.adm-abas [data-aba]').forEach(b => {
    b.classList.toggle('ativo', b === botao);
    b.setAttribute('aria-selected', String(b === botao));
  });
  document.querySelectorAll('[data-aba-conteudo]').forEach(s => { s.hidden = s.id !== `aba-${botao.dataset.aba}`; });
});

// ---------- Pedidos ----------

const opcoesCupom = () => ({ nomeRestaurante: estado.restaurante.nome || 'DRAKO HOUSE', colunas: estado.prefs.colunas });

let contextoSom = null;
function tocarSom() {
  try {
    contextoSom = contextoSom || new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = contextoSom.createOscillator();
      const ganho = contextoSom.createGain();
      osc.frequency.value = freq;
      osc.connect(ganho); ganho.connect(contextoSom.destination);
      const inicio = contextoSom.currentTime + i * 0.2;
      ganho.gain.setValueAtTime(0.25, inicio);
      osc.start(inicio); osc.stop(inicio + 0.18);
    });
  } catch { /* navegador sem áudio liberado: só o aviso visual aparece */ }
}

async function assinarPedidos() {
  const consulta = query(ref(db, 'pedidos'), orderByChild('criadoEm'), limitToLast(200));
  try {
    const inicial = await get(consulta);
    if (!estado.painelAtivo) return;
    inicial.forEach(f => estado.pedidos.set(f.key, { id: f.key, ...f.val() }));
    renderPedidos();
  } catch (erro) {
    $('lista-pedidos').replaceChildren(el('p', { className: 'adm-vazio', text: traduzirErroBanco(erro) }));
    return;
  }
  // Pedidos que já existiam ao abrir a página não tocam som nem imprimem.
  const existentes = new Set(estado.pedidos.keys());
  estado.cancelar.push(onChildAdded(consulta, (f) => {
    if (existentes.has(f.key)) return;
    const pedido = { id: f.key, ...f.val() };
    estado.pedidos.set(f.key, pedido);
    renderPedidos();
    aoChegarPedidoNovo(pedido);
  }));
  estado.cancelar.push(onChildChanged(consulta, (f) => { estado.pedidos.set(f.key, { id: f.key, ...f.val() }); renderPedidos(); }));
  estado.cancelar.push(onChildRemoved(consulta, (f) => { estado.pedidos.delete(f.key); renderPedidos(); }));
}

function aoChegarPedidoNovo(pedido) {
  tocarSom();
  toast(`Novo pedido #${pedido.codigo || ''}`);
  const pode = estado.prefs.auto && impressora.impressoraConectada() && pedido.status === 'Novo' && !estado.impressos.has(pedido.id);
  if (!pode) return;
  estado.impressos.add(pedido.id); // marca antes de imprimir para nunca duplicar
  impressora.imprimirPedido(pedido, opcoesCupom()).catch(() => toast(`Falha ao imprimir o pedido #${pedido.codigo}.`, 'erro'));
}

async function mudarStatus(pedido, status, botao) {
  if (status === 'Cancelado' && !confirm(`Cancelar o pedido #${pedido.codigo}?`)) return;
  const agora = Date.now();
  // Atualiza o pedido completo e a cópia pública (usada por "Meus pedidos") de uma só vez.
  await gravar(botao, () => update(ref(db), {
    [`pedidos/${pedido.id}/status`]: status,
    [`pedidos/${pedido.id}/atualizadoEm`]: agora,
    [`pedidosStatus/${pedido.id}/codigo`]: pedido.codigo,
    [`pedidosStatus/${pedido.id}/criadoEm`]: pedido.criadoEm,
    [`pedidosStatus/${pedido.id}/tipo`]: pedido.tipo,
    [`pedidosStatus/${pedido.id}/total`]: pedido.total,
    [`pedidosStatus/${pedido.id}/status`]: status,
    [`pedidosStatus/${pedido.id}/atualizadoEm`]: agora
  }), `Pedido #${pedido.codigo}: ${status}`);
}

async function imprimirManual(pedido, botao) {
  try {
    await comCarregamento(botao, async () => {
      if (impressora.impressoraConectada()) await impressora.imprimirPedido(pedido, opcoesCupom());
      else impressora.imprimirPeloNavegador(pedido, opcoesCupom());
    });
  } catch { toast('Não foi possível imprimir. Reconecte na aba Impressora.', 'erro'); }
}

function cartaoPedido(p) {
  const itens = Array.isArray(p.itens) ? p.itens : Object.values(p.itens || {});
  const cliente = p.cliente || {};
  const botoesStatus = STATUS.filter(s => s !== p.status).map(s => {
    const botao = el('button', { type: 'button', text: s, className: s === 'Cancelado' ? 'perigo' : '' });
    botao.addEventListener('click', () => mudarStatus(p, s, botao));
    return botao;
  });
  const botaoImprimir = el('button', { type: 'button', text: '🖨️ Imprimir' });
  botaoImprimir.addEventListener('click', () => imprimirManual(p, botaoImprimir));
  const endereco = p.tipo === 'entrega'
    ? `${cliente.endereco || ''}, ${cliente.numero || ''} - ${cliente.bairro || ''}` : 'Retirada no local';
  return el('article', { className: 'adm-item adm-pedido' },
    el('div', { className: 'adm-pedido-topo' },
      el('strong', { text: `#${p.codigo || ''} • ${formatarDataHora(p.criadoEm)}` }),
      el('span', { className: 'adm-status', text: p.status, 'data-status': p.status })),
    el('div', { text: `${cliente.nome || ''} • ${cliente.telefone || ''}` }),
    el('small', { text: endereco }),
    el('ul', {}, itens.map(i => el('li', { text: `${i.qtd}x ${i.nome}${i.observacao ? ` (${i.observacao})` : ''}` }))),
    el('strong', { text: `${formatarPreco(p.total)} • ${p.pagamento || ''}` }),
    el('div', { className: 'adm-acoes' }, ...botoesStatus, botaoImprimir));
}

function renderPedidos() {
  const lista = [...estado.pedidos.values()].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  $('lista-pedidos').replaceChildren(...(lista.length ? lista.map(cartaoPedido)
    : [el('p', { className: 'adm-vazio', text: 'Nenhum pedido ainda.' })]));
  const novos = lista.filter(p => p.status === 'Novo').length;
  $('badge-novos').textContent = novos;
  $('badge-novos').hidden = novos === 0;
}

// ---------- Utilidades de lista ----------

const vazio = (texto) => [el('p', { className: 'adm-vazio', text: texto })];
const nomeCategoria = (id) => estado.categorias[id]?.nome || 'Sem categoria';
const categoriasOrdenadas = () =>
  Object.entries(estado.categorias).sort(([, a], [, b]) => (a.ordem ?? 0) - (b.ordem ?? 0));

function botaoAcao(texto, aoClicar, classe = '') {
  const botao = el('button', { type: 'button', text: texto, className: classe });
  botao.addEventListener('click', () => aoClicar(botao));
  return botao;
}

// ---------- Produtos ----------

function renderSelectCategoria() {
  const atual = $('prod-categoria').value;
  $('prod-categoria').replaceChildren(el('option', { value: '', text: 'Escolha a categoria' }),
    ...categoriasOrdenadas().map(([id, c]) => el('option', { value: id, text: c.nome })));
  $('prod-categoria').value = estado.categorias[atual] ? atual : '';
  ajustarCamposProduto();
}

// Mostra só os campos que o tipo da categoria usa.
function ajustarCamposProduto() {
  const tipo = estado.categorias[$('prod-categoria').value]?.tipo || 'simples';
  $('grupo-preco-g').hidden = tipo !== 'batatas';
  $('grupo-sabores').hidden = tipo !== 'combos';
  $('rotulo-preco-m').textContent = tipo === 'batatas' ? 'Preço M (R$)' : 'Preço (R$)';
}
$('prod-categoria').addEventListener('change', ajustarCamposProduto);

// Reduz a foto antes de guardar no banco (as imagens ficam em base64, como já era).
function comprimirImagem(arquivo, max = 500, qualidade = 0.75) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler a imagem.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => rejeitar(new Error('Imagem inválida.'));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolver(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

$('prod-foto').addEventListener('change', async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  try {
    estado.fotoProduto = await comprimirImagem(arquivo);
    $('prod-preview').src = estado.fotoProduto;
    $('prod-preview').hidden = false;
  } catch (erro) { toast(erro.message, 'erro'); }
});

function limparFormProduto() {
  $('form-produto').reset();
  $('prod-id').value = '';
  $('prod-disponivel').checked = true;
  $('prod-preview').hidden = true;
  estado.fotoProduto = '';
  $('titulo-produto').textContent = 'Novo produto';
  $('btn-cancelar-produto').hidden = true;
  ajustarCamposProduto();
}
$('btn-cancelar-produto').addEventListener('click', limparFormProduto);

function editarProduto(id) {
  const p = estado.produtos[id];
  $('prod-id').value = id;
  $('prod-nome').value = p.nome || '';
  $('prod-desc').value = p.descricao || '';
  $('prod-categoria').value = p.categoria || '';
  $('prod-preco-m').value = p.precoM ?? '';
  $('prod-preco-g').value = p.precoG ?? '';
  $('prod-sabores').value = p.qtdSabores || 2;
  $('prod-disponivel').checked = p.disponivel !== false;
  $('prod-destaque').checked = !!p.destaque;
  estado.fotoProduto = p.foto || '';
  $('prod-preview').src = estado.fotoProduto;
  $('prod-preview').hidden = !estado.fotoProduto;
  $('titulo-produto').textContent = 'Editar produto';
  $('btn-cancelar-produto').hidden = false;
  ajustarCamposProduto();
  $('form-produto').scrollIntoView({ behavior: 'smooth' });
}

$('form-produto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = $('prod-nome').value.trim();
  const categoria = $('prod-categoria').value;
  const precoM = parseFloat($('prod-preco-m').value);
  const precoG = parseFloat($('prod-preco-g').value);
  if (!nome) return toast('Informe o nome do produto.', 'erro');
  if (!categoria) return toast('Escolha uma categoria (crie uma na aba Categorias, se precisar).', 'erro');
  if (!(precoM >= 0)) return toast('Informe um preço válido (zero ou maior).', 'erro');
  if (!estado.fotoProduto) return toast('Escolha uma imagem para o produto.', 'erro');
  const id = $('prod-id').value || push(ref(db, 'produtos')).key;
  const dados = {
    nome, categoria, precoM, foto: estado.fotoProduto,
    descricao: $('prod-desc').value.trim(),
    precoG: precoG >= 0 ? precoG : precoM,
    qtdSabores: parseInt($('prod-sabores').value, 10) || 2,
    disponivel: $('prod-disponivel').checked,
    destaque: $('prod-destaque').checked
  };
  if (await gravar(e.submitter, () => update(ref(db, `produtos/${id}`), dados), 'Produto salvo!')) limparFormProduto();
});

function linhaProduto([id, p]) {
  const foto = el('img', { src: p.foto || '', alt: '', loading: 'lazy' });
  return el('article', { className: 'adm-item' }, foto,
    el('div', { className: 'adm-item-info' },
      el('strong', { text: p.nome }),
      el('small', { text: `${nomeCategoria(p.categoria)} • ${formatarPreco(p.precoM)}${p.disponivel === false ? ' • INDISPONÍVEL' : ''}` })),
    el('div', { className: 'adm-acoes' },
      botaoAcao(p.disponivel === false ? 'Ativar' : 'Pausar', (b) =>
        gravar(b, () => set(ref(db, `produtos/${id}/disponivel`), p.disponivel === false), 'Disponibilidade atualizada.')),
      botaoAcao('Editar', () => editarProduto(id)),
      botaoAcao('Excluir', (b) => confirm(`Excluir o produto "${p.nome}"?`)
        && gravar(b, () => remove(ref(db, `produtos/${id}`)), 'Produto excluído.'), 'perigo')));
}

function renderProdutos() {
  const lista = Object.entries(estado.produtos);
  $('lista-produtos').replaceChildren(...(lista.length ? lista.map(linhaProduto) : vazio('Nenhum produto cadastrado.')));
}

// ---------- Adicionais ----------

function limparFormAdicional() {
  $('form-adicional').reset();
  $('add-id').value = '';
  $('titulo-adicional').textContent = 'Novo adicional';
  $('btn-cancelar-adicional').hidden = true;
}
$('btn-cancelar-adicional').addEventListener('click', limparFormAdicional);

$('form-adicional').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = $('add-nome').value.trim();
  const preco = parseFloat($('add-preco').value);
  if (!nome) return toast('Informe o nome do adicional.', 'erro');
  if (!(preco >= 0)) return toast('Informe um preço válido (zero ou maior).', 'erro');
  const id = $('add-id').value || push(ref(db, 'adicionais')).key;
  if (await gravar(e.submitter, () => set(ref(db, `adicionais/${id}`), { nome, preco }), 'Adicional salvo!')) limparFormAdicional();
});

function renderAdicionais() {
  const lista = Object.entries(estado.adicionais);
  $('lista-adicionais').replaceChildren(...(lista.length ? lista.map(([id, a]) => el('article', { className: 'adm-item' },
    el('div', { className: 'adm-item-info' }, el('strong', { text: a.nome }), el('small', { text: formatarPreco(a.preco) })),
    el('div', { className: 'adm-acoes' },
      botaoAcao('Editar', () => {
        $('add-id').value = id; $('add-nome').value = a.nome; $('add-preco').value = a.preco;
        $('titulo-adicional').textContent = 'Editar adicional'; $('btn-cancelar-adicional').hidden = false;
        $('add-nome').focus();
      }),
      botaoAcao('Excluir', (b) => confirm(`Excluir o adicional "${a.nome}"?`)
        && gravar(b, () => remove(ref(db, `adicionais/${id}`)), 'Adicional excluído.'), 'perigo'))))
    : vazio('Nenhum adicional cadastrado.')));
}

// ---------- Categorias ----------

function limparFormCategoria() {
  $('form-categoria').reset();
  $('cat-id').value = '';
  $('titulo-categoria').textContent = 'Nova categoria';
  $('btn-cancelar-categoria').hidden = true;
}
$('btn-cancelar-categoria').addEventListener('click', limparFormCategoria);

$('form-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = $('cat-nome').value.trim();
  if (!nome) return toast('Informe o nome da categoria.', 'erro');
  const idEdicao = $('cat-id').value;
  const id = idEdicao || push(ref(db, 'categorias')).key;
  const ordem = idEdicao ? (estado.categorias[id]?.ordem ?? 0)
    : Math.max(-1, ...Object.values(estado.categorias).map(c => c.ordem ?? 0)) + 1;
  const dados = { nome, titulo: $('cat-titulo').value.trim(), icone: $('cat-icone').value.trim(), tipo: $('cat-tipo').value, ordem };
  if (await gravar(e.submitter, () => set(ref(db, `categorias/${id}`), dados), 'Categoria salva!')) limparFormCategoria();
});

// Reescreve a ordem de todas como 0,1,2... para nunca haver empate.
async function moverCategoria(id, deslocamento, botao) {
  const ids = categoriasOrdenadas().map(([i]) => i);
  const de = ids.indexOf(id), para = de + deslocamento;
  if (para < 0 || para >= ids.length) return;
  ids.splice(para, 0, ids.splice(de, 1)[0]);
  const alteracoes = Object.fromEntries(ids.map((i, pos) => [`categorias/${i}/ordem`, pos]));
  await gravar(botao, () => update(ref(db), alteracoes), 'Ordem atualizada.');
}

function excluirCategoria(id, botao) {
  const quantos = Object.values(estado.produtos).filter(p => p.categoria === id).length;
  const aviso = quantos
    ? `A categoria "${estado.categorias[id].nome}" tem ${quantos} produto(s). Eles ficarão ocultos no cardápio. Excluir mesmo assim?`
    : `Excluir a categoria "${estado.categorias[id].nome}"?`;
  if (confirm(aviso)) gravar(botao, () => remove(ref(db, `categorias/${id}`)), 'Categoria excluída.');
}

function renderCategorias() {
  const lista = categoriasOrdenadas();
  $('lista-categorias').replaceChildren(...(lista.length ? lista.map(([id, c], pos) => el('article', { className: 'adm-item' },
    el('div', { className: 'adm-item-info' },
      el('strong', { text: `${c.icone || ''} ${c.nome}` }), el('small', { text: NOMES_TIPO[c.tipo] || c.tipo })),
    el('div', { className: 'adm-acoes' },
      botaoAcao('▲', (b) => moverCategoria(id, -1, b)),
      botaoAcao('▼', (b) => moverCategoria(id, 1, b)),
      botaoAcao('Editar', () => {
        $('cat-id').value = id; $('cat-nome').value = c.nome; $('cat-icone').value = c.icone || '';
        $('cat-titulo').value = c.titulo || ''; $('cat-tipo').value = c.tipo;
        $('titulo-categoria').textContent = 'Editar categoria'; $('btn-cancelar-categoria').hidden = false;
        $('cat-nome').focus();
      }),
      botaoAcao('Excluir', (b) => excluirCategoria(id, b), 'perigo')))) : vazio('Nenhuma categoria criada.')));
}

// ---------- Bairros e taxas ----------

function modoAtualTaxa() {
  return !estado.entrega.cobrarTaxa ? 'sem' : estado.entrega.modo;
}

function renderEntrega() {
  const modo = modoAtualTaxa();
  document.querySelectorAll('input[name="modo-taxa"]').forEach(r => { r.checked = r.value === modo; });
  $('taxa-unica').value = estado.entrega.taxaUnica ?? 0;
  $('grupo-taxa-unica').hidden = modo !== 'unica';
}
document.querySelectorAll('input[name="modo-taxa"]').forEach(r =>
  r.addEventListener('change', () => { $('grupo-taxa-unica').hidden = r.value !== 'unica' || !r.checked; }));

$('form-entrega').addEventListener('submit', async (e) => {
  e.preventDefault();
  const escolhido = document.querySelector('input[name="modo-taxa"]:checked')?.value;
  const taxaUnica = parseFloat($('taxa-unica').value) || 0;
  if (!escolhido) return toast('Escolha como a taxa será cobrada.', 'erro');
  if (taxaUnica < 0) return toast('A taxa não pode ser negativa.', 'erro');
  // "Sem taxa" desliga a cobrança e preserva o modo anterior (as regras exigem o campo).
  const config = { cobrarTaxa: escolhido !== 'sem', modo: escolhido === 'sem' ? estado.entrega.modo || 'bairro' : escolhido, taxaUnica };
  await gravar(e.submitter, () => set(ref(db, 'configuracoes/entrega'), config), 'Taxa de entrega salva!');
});

function limparFormBairro() {
  $('form-bairro').reset();
  $('bairro-id').value = '';
  $('titulo-bairro').textContent = 'Novo bairro';
  $('btn-cancelar-bairro').hidden = true;
}
$('btn-cancelar-bairro').addEventListener('click', limparFormBairro);

$('form-bairro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = $('bairro-nome').value.trim();
  const taxa = parseFloat($('bairro-taxa').value);
  if (!nome) return toast('Informe o nome do bairro.', 'erro');
  if (!(taxa >= 0)) return toast('Informe uma taxa válida (zero ou maior).', 'erro');
  const id = $('bairro-id').value || push(ref(db, 'bairros')).key;
  if (await gravar(e.submitter, () => set(ref(db, `bairros/${id}`), { nome, taxa }), 'Bairro salvo!')) limparFormBairro();
});

function renderBairros() {
  const lista = Object.entries(estado.bairros).sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('lista-bairros').replaceChildren(...(lista.length ? lista.map(([id, b]) => el('article', { className: 'adm-item' },
    el('div', { className: 'adm-item-info' },
      el('strong', { text: b.nome }), el('small', { text: b.taxa > 0 ? formatarPreco(b.taxa) : 'Entrega grátis' })),
    el('div', { className: 'adm-acoes' },
      botaoAcao('Editar', () => {
        $('bairro-id').value = id; $('bairro-nome').value = b.nome; $('bairro-taxa').value = b.taxa;
        $('titulo-bairro').textContent = 'Editar bairro'; $('btn-cancelar-bairro').hidden = false;
        $('bairro-nome').focus();
      }),
      botaoAcao('Excluir', (btn) => confirm(`Excluir o bairro "${b.nome}"?`)
        && gravar(btn, () => remove(ref(db, `bairros/${id}`)), 'Bairro excluído.'), 'perigo'))))
    : vazio('Nenhum bairro cadastrado.')));
}

// ---------- Configurações ----------

function renderConfig() {
  const r = estado.restaurante;
  // Não sobrescreve o que o dono está digitando no momento.
  if (document.activeElement?.closest('#form-config')) return;
  $('cfg-nome').value = r.nome || '';
  $('cfg-whatsapp').value = r.whatsapp || '';
  $('cfg-horario').value = r.horario || '';
  $('cfg-mensagem').value = r.mensagemWhatsapp || '';
}

function atualizarBotoesStatusLoja(aberta) {
  const btnAberta = $('btn-loja-aberta');
  const btnFechada = $('btn-loja-fechada');
  if (!btnAberta || !btnFechada) return;

  btnAberta.classList.toggle('ativo', aberta);
  btnFechada.classList.toggle('ativo', !aberta);
}

$('btn-loja-aberta')?.addEventListener('click', (e) =>
  gravar(e.currentTarget, () => set(ref(db, 'configuracoes/statusLoja'), true), 'Loja aberta.'));

$('btn-loja-fechada')?.addEventListener('click', (e) =>
  gravar(e.currentTarget, () => set(ref(db, 'configuracoes/statusLoja'), false), 'Loja fechada.'));

$('form-config').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = $('cfg-nome').value.trim();
  let whatsapp = somenteDigitos($('cfg-whatsapp').value);
  if (whatsapp.length === 10 || whatsapp.length === 11) whatsapp = `55${whatsapp}`; // acrescenta o código do Brasil
  if (!nome) return toast('Informe o nome do restaurante.', 'erro');
  if (!/^\d{12,13}$/.test(whatsapp)) return toast('WhatsApp inválido. Informe o DDD e o número.', 'erro');
  const dados = { nome, whatsapp, horario: $('cfg-horario').value.trim(), mensagemWhatsapp: $('cfg-mensagem').value.trim() };
  if (await gravar(e.submitter, () => set(ref(db, 'configuracoes/restaurante'), dados), 'Configurações salvas!')) {
    $('cfg-whatsapp').value = whatsapp;
  }
});

// ---------- Impressora ----------

function atualizarStatusImpressora(conectada, nome) {
  $('status-impressora').textContent = conectada ? `Conectada${nome ? ` (${nome})` : ''}` : 'Desconectada';
  $('btn-conectar').hidden = conectada;
  $('btn-desconectar').hidden = !conectada;
}

function renderImpressora() {
  $('largura-papel').value = String(estado.prefs.colunas);
  $('impressao-auto').checked = !!estado.prefs.auto;
  atualizarStatusImpressora(impressora.impressoraConectada());
  if (!impressora.bluetoothDisponivel()) {
    $('aviso-bluetooth').textContent = impressora.MSG_SEM_BLUETOOTH;
    $('aviso-bluetooth').hidden = false;
    $('btn-conectar').disabled = true;
  }
}

impressora.configurarCallbacks({
  aoMudarStatus: atualizarStatusImpressora,
  aoFalhar: (mensagem) => toast(mensagem, 'erro')
});

function salvarPrefs() { gravarLocal(CHAVE_PREFS, estado.prefs); }

$('btn-conectar').addEventListener('click', async (e) => {
  try {
    await comCarregamento(e.currentTarget, () => impressora.conectarImpressora());
    toast('Impressora conectada!');
  } catch (erro) {
    toast(erro.name === 'NotFoundError' ? 'Nenhuma impressora foi selecionada.' : (erro.message || 'Falha ao conectar.'), 'erro');
  }
});
$('btn-desconectar').addEventListener('click', () => { impressora.desconectarImpressora(); toast('Impressora desconectada.'); });
$('largura-papel').addEventListener('change', (e) => { estado.prefs.colunas = Number(e.target.value); salvarPrefs(); });
$('impressao-auto').addEventListener('change', (e) => {
  estado.prefs.auto = e.target.checked;
  salvarPrefs();
  if (e.target.checked && !impressora.impressoraConectada()) toast('Conecte a impressora para a impressão automática funcionar.', 'erro');
});
$('btn-teste').addEventListener('click', async (e) => {
  try { await comCarregamento(e.currentTarget, () => impressora.imprimirTeste(opcoesCupom())); toast('Teste enviado!'); }
  catch { toast('Não foi possível imprimir. Conecte a impressora primeiro.', 'erro'); }
});
$('btn-teste-navegador').addEventListener('click', () => impressora.imprimirTestePeloNavegador(opcoesCupom()));
