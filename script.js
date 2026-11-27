/* ==========================================================================
   DRAKO HOUSE - script.js
   --------------------------------------------------------------------------
   Estrutura do arquivo:
   1. Estado compartilhado e utilitários (categorias, bairros, taxa, cliente)
   2. Cardápio do cliente (DOMContentLoaded): produtos, carrinho, checkout,
      cadastro do cliente, envio do pedido e "Meus pedidos"
   3. Status da loja e identidade visual
   4. Painel administrativo (Firebase Authentication): produtos, pedidos,
      categorias, entrega/bairros, adicionais, identidade visual e loja

   Estrutura no Firebase Realtime Database:
   /produtos/{id}            -> cardápio (leitura pública)
   /adicionais/{id}          -> adicionais das batatas (leitura pública)
   /categorias/{id}          -> { nome, titulo, icone, tipo, ordem }
   /bairros/{id}             -> { nome, taxa }
   /configuracoes/statusLoja -> true/false
   /configuracoes/visual     -> cores, logo, textos do cabeçalho
   /configuracoes/entrega    -> { cobrarTaxa, modo: 'unica'|'bairro', taxaUnica }
   /clientes/{telefone}      -> dados do cliente (só o admin lê)
   /pedidos/{id}             -> pedido completo (só o admin lê)
   /pedidosStatus/{id}       -> cópia sem dados pessoais, para "Meus pedidos"
   /admins/{uid}: true       -> contas com acesso ao painel
   ========================================================================== */

// ==========================================================================
// 1. ESTADO COMPARTILHADO E UTILITÁRIOS
// ==========================================================================

// Tipos de categoria: definem como os produtos se comportam no cardápio
const TIPOS_CATEGORIA = {
    batatas: 'Tamanhos M/G + adicionais',
    combos: 'Combo com escolha de sabores',
    simples: 'Preço único'
};

// Categorias iniciais: mesmas chaves usadas pelos produtos já cadastrados
// (produto.categoria = 'batatas' | 'combos' | 'bebidas'), então nada precisa ser migrado.
const CATEGORIAS_PADRAO = {
    batatas: { nome: 'Batatas', titulo: 'Nossas Batatas', icone: '🍟', tipo: 'batatas', ordem: 1 },
    combos: { nome: 'Combos', titulo: 'Combos Especiais', icone: '🍔', tipo: 'combos', ordem: 2 },
    bebidas: { nome: 'Bebidas', titulo: 'Bebidas Geladas', icone: '🥤', tipo: 'simples', ordem: 3 }
};

// Bairros que estavam fixos no checkout antes (usados até o dono configurar a entrega)
const BAIRROS_PADRAO = {
    'agua-nova': { nome: 'Agua Nova', taxa: 5 },
    'centro': { nome: 'Centro', taxa: 0 },
    'estacao-da-luiz': { nome: 'Estação da Luiz', taxa: 0 },
    'jardim-araujo': { nome: 'Jardim Araújo', taxa: 0 },
    'jardim-formosa': { nome: 'Jardim Formosa', taxa: 0 },
    'jose-mendes': { nome: 'José Mendes', taxa: 0 },
    'nova-avenida': { nome: 'Nova Avenida', taxa: 0 },
    'nova-morada': { nome: 'Nova Morada', taxa: 0 },
    'novo-oeste': { nome: 'Novo Oeste', taxa: 0 },
    'oliveira': { nome: 'Oliveira', taxa: 0 },
    'planaltino': { nome: 'Planaltino', taxa: 0 },
    'sacramento': { nome: 'Sacramento', taxa: 0 },
    'sao-luiz': { nome: 'São Luiz', taxa: 0 },
    'vicente-ferreira': { nome: 'Vicente Ferreira', taxa: 0 }
};

const CONFIG_ENTREGA_PADRAO = { cobrarTaxa: true, modo: 'bairro', taxaUnica: 0 };

const STATUS_PEDIDO = ['Novo', 'Em preparo', 'Saiu para entrega', 'Entregue', 'Cancelado'];
const STATUS_ATIVOS = ['Novo', 'Em preparo', 'Saiu para entrega'];

// Valores de reserva: o painel (configuracoes/restaurante) sobrescreve quando existir
let NUMERO_WHATSAPP_LOJA = '557491954272';
let NOME_RESTAURANTE = 'DRAKO HOUSE';
let MENSAGEM_FINAL_PEDIDO = 'Pedido gerado via cardápio online Drako House';

// Chaves do localStorage
const CACHE_KEY_CATEGORIAS = 'drako_cache_categorias_v1';
const CACHE_KEY_BAIRROS = 'drako_cache_bairros_v1';
const CACHE_KEY_ENTREGA = 'drako_cache_entrega_v1';
const CHAVE_CLIENTE = 'drako_cliente_v1';
const CHAVE_MEUS_PEDIDOS = 'drako_meus_pedidos_v1';

function lerLocal(chave, padrao = null) {
    try {
        const bruto = localStorage.getItem(chave);
        return bruto ? JSON.parse(bruto) : padrao;
    } catch (e) {
        return padrao;
    }
}

function gravarLocal(chave, valor) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
        console.warn('Não foi possível salvar no navegador:', e);
    }
}

// Estado compartilhado entre o cardápio e o painel
let dadosProdutos = {};
let listaAdicionais = {};
let categoriasCardapio = lerLocal(CACHE_KEY_CATEGORIAS) || { ...CATEGORIAS_PADRAO };
let configEntregaBruta = lerLocal(CACHE_KEY_ENTREGA);      // null = entrega ainda não configurada no painel
let bairrosBrutos = lerLocal(CACHE_KEY_BAIRROS);
let configEntrega = { ...CONFIG_ENTREGA_PADRAO, ...(configEntregaBruta || {}) };
let bairrosEntrega = calcularBairrosEfetivos();

// Enquanto a entrega nunca foi configurada, usa a lista antiga de bairros para não quebrar o checkout
function calcularBairrosEfetivos() {
    if (configEntregaBruta === null) return bairrosBrutos || { ...BAIRROS_PADRAO };
    return bairrosBrutos || {};
}

function firebaseDisponivel() {
    return typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0;
}

// Escapa texto antes de inserir em HTML (evita quebrar o layout com aspas ou < >)
function esc(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatarPreco(valor) {
    return `R$ ${(parseFloat(valor) || 0).toFixed(2).replace('.', ',')}`;
}

function somenteDigitos(texto) {
    return String(texto || '').replace(/\D/g, '');
}

// Aceita DDD + número (10 ou 11 dígitos), com ou sem o 55 do Brasil
function telefoneValido(digitos) {
    return /^\d{10,13}$/.test(digitos);
}

function formatarTelefone(digitos) {
    const d = somenteDigitos(digitos).slice(0, 13);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
    return d;
}

window.formatarCampoTelefone = function (input) {
    const digitos = somenteDigitos(input.value);
    input.value = digitos.length <= 11 ? formatarTelefone(digitos) : digitos;
};

function formatarDataHora(timestamp) {
    if (!timestamp) return '';
    const data = new Date(timestamp);
    return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function classeStatus(status) {
    return {
        'Novo': 'status-novo',
        'Em preparo': 'status-preparo',
        'Saiu para entrega': 'status-entrega',
        'Entregue': 'status-entregue',
        'Cancelado': 'status-cancelado'
    }[status] || 'status-novo';
}

// Categorias ordenadas pelo campo "ordem" (depois pelo nome)
function categoriasOrdenadas() {
    return Object.entries(categoriasCardapio || {})
        .filter(([, cat]) => cat && cat.nome)
        .sort(([, a], [, b]) => (a.ordem ?? 999) - (b.ordem ?? 999) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

function tipoDaCategoria(categoriaId) {
    const categoria = categoriasCardapio[categoriaId];
    if (categoria && TIPOS_CATEGORIA[categoria.tipo]) return categoria.tipo;
    if (categoriaId === 'batatas' || categoriaId === 'combos') return categoriaId;
    return 'simples';
}

function tipoDoProduto(produto) {
    return tipoDaCategoria(produto && produto.categoria);
}

function bairrosOrdenados() {
    return Object.entries(bairrosEntrega || {})
        .filter(([, b]) => b && b.nome)
        .sort(([, a], [, b]) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

// Taxa de entrega conforme a configuração do painel
function obterTaxaEntrega(bairroId) {
    if (!configEntrega.cobrarTaxa) return 0;
    if (configEntrega.modo === 'unica') return parseFloat(configEntrega.taxaUnica) || 0;
    const bairro = bairrosEntrega[bairroId];
    return bairro ? (parseFloat(bairro.taxa) || 0) : 0;
}

// Aviso rápido no rodapé da tela
let timerToast = null;
function mostrarToast(mensagem, tipo = 'ok') {
    const toast = document.getElementById('toast-aviso');
    if (!toast) return;
    toast.textContent = mensagem;
    toast.className = `toast-aviso visivel ${tipo === 'erro' ? 'erro' : ''}`;
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { toast.className = 'toast-aviso'; }, 4200);
}

// ==========================================================================
// 2. CARDÁPIO DO CLIENTE
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Estado Global da Aplicação
    let totalItens = 0;
    let precoTotalProdutos = 0.0;
    let taxaEntregaAtual = 0.0;
    let enviandoPedido = false;
    const carrinho = {};
    // dadosProdutos e listaAdicionais ficam no topo do arquivo (compartilhados com o painel)

    // Estado do Modal de Customização
    let prodCustomizando = null;
    let customTamanhoSelecionado = 'M';
    let customAdicionaisSelecionados = [];
    let customQtd = 1;

    // --- Cache Local e Estados de Carregamento ---
    const CACHE_KEY_PRODUTOS = 'drako_cache_produtos_v1';
    const CACHE_KEY_ADICIONAIS = 'drako_cache_adicionais_v1';

    function carregarCacheLocal() {
        try {
            const cachedProdutos = localStorage.getItem(CACHE_KEY_PRODUTOS);
            const cachedAdicionais = localStorage.getItem(CACHE_KEY_ADICIONAIS);
            if (cachedAdicionais) {
                listaAdicionais = JSON.parse(cachedAdicionais) || {};
            }
            if (cachedProdutos) {
                dadosProdutos = JSON.parse(cachedProdutos) || {};
                renderizarListasCardapio(dadosProdutos);
                return true;
            }
        } catch (e) {
            console.warn('Não foi possível ler cache local:', e);
        }
        return false;
    }

    function salvarCacheLocal(chave, dados) {
        try {
            localStorage.setItem(chave, JSON.stringify(dados));
        } catch (e) {
            console.warn('Erro ao salvar no cache local:', e);
        }
    }

    // HTML do esqueleto de carregamento (2 cards cinzas animados)
    const HTML_SKELETON = `
                <div class="skeleton-card">
                    <div class="skeleton-animado skeleton-thumb"></div>
                    <div class="skeleton-animado skeleton-titulo"></div>
                    <div class="skeleton-animado skeleton-texto"></div>
                    <div class="skeleton-animado skeleton-preco"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton-animado skeleton-thumb"></div>
                    <div class="skeleton-animado skeleton-titulo"></div>
                    <div class="skeleton-animado skeleton-texto"></div>
                    <div class="skeleton-animado skeleton-preco"></div>
                </div>
            `;

    function renderizarSkeletonsIniciais() {
        garantirSecoesCategorias();
        const containers = ['lista-destaques', ...categoriasOrdenadas().map(([id]) => `lista-${id}`)];
        containers.forEach(cid => {
            const el = document.getElementById(cid);
            if (el) el.innerHTML = HTML_SKELETON;
        });
    }

    // --- Seções e menu de categorias (gerados a partir de /categorias) ---

    // Monta uma seção com a mesma estrutura visual da seção de Destaques
    function criarSecaoCategoria(id, categoria) {
        const secao = document.createElement('section');
        secao.id = id;
        secao.className = 'secao-categoria';
        secao.setAttribute('data-categoria-dinamica', id);
        const titulo = `${categoria.icone ? categoria.icone + ' ' : ''}${categoria.titulo || categoria.nome}`;
        secao.innerHTML = `
            <div class="categoria-header">
                <h2 class="categoria-titulo">${esc(titulo)}</h2>
                <span class="categoria-contador" id="contador-${esc(id)}"></span>
            </div>
            <div class="carrossel-wrapper">
                <button class="btn-scroll-nav prev" onclick="rolarCarrossel('lista-${esc(id)}', -1)" aria-label="Rolar para a esquerda">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div class="cardapio" id="lista-${esc(id)}"></div>
                <button class="btn-scroll-nav next" onclick="rolarCarrossel('lista-${esc(id)}', 1)" aria-label="Rolar para a direita">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            </div>
        `;
        return secao;
    }

    // Recria as seções e os links do menu sempre que as categorias mudam
    let assinaturaCategorias = '';
    function garantirSecoesCategorias() {
        const container = document.getElementById('secoes-categorias');
        const nav = document.getElementById('nav-categorias');
        if (!container || !nav) return;

        const lista = categoriasOrdenadas();
        const assinatura = JSON.stringify(lista);
        if (assinatura === assinaturaCategorias && container.children.length === lista.length) return;
        assinaturaCategorias = assinatura;

        container.innerHTML = '';
        nav.querySelectorAll('a[data-categoria-dinamica]').forEach(a => a.remove());

        lista.forEach(([id, categoria]) => {
            container.appendChild(criarSecaoCategoria(id, categoria));
            const link = document.createElement('a');
            link.href = `#${id}`;
            link.setAttribute('data-categoria-dinamica', id);
            link.textContent = `${categoria.icone ? categoria.icone + ' ' : ''}${categoria.nome}`;
            nav.appendChild(link);
        });
    }

    function renderizarListasCardapio(dados) {
        garantirSecoesCategorias();

        const listaDestaques = document.getElementById('lista-destaques');
        const categorias = categoriasOrdenadas();
        if (listaDestaques) listaDestaques.innerHTML = '';
        categorias.forEach(([id]) => {
            const el = document.getElementById(`lista-${id}`);
            if (el) el.innerHTML = '';
        });

        if (!dados || Object.keys(dados).length === 0) {
            exibirEstadoVazioCardapio();
            return;
        }

        let qtdDestaques = 0;
        const qtdPorCategoria = {};

        Object.keys(dados).forEach((id) => {
            const produto = dados[id];
            if (!produto) return;
            produto.id = id;

            // Produto de categoria excluída fica oculto até o dono escolher outra categoria
            const listaCategoria = categoriasCardapio[produto.categoria] ? document.getElementById(`lista-${produto.categoria}`) : null;
            if (!listaCategoria) return;

            if (produto.destaque) {
                qtdDestaques++;
                if (listaDestaques) {
                    listaDestaques.appendChild(criarCardProduto(id, produto, true));
                }
            }

            qtdPorCategoria[produto.categoria] = (qtdPorCategoria[produto.categoria] || 0) + 1;
            listaCategoria.appendChild(criarCardProduto(id, produto, false));
        });

        // Atualizar contadores visuais nas seções
        const cntDestaques = document.getElementById('contador-destaques');
        if (cntDestaques) cntDestaques.innerText = `${qtdDestaques} item${qtdDestaques !== 1 ? 's' : ''}`;
        categorias.forEach(([id]) => {
            const qtd = qtdPorCategoria[id] || 0;
            const contador = document.getElementById(`contador-${id}`);
            if (contador) contador.innerText = `${qtd} item${qtd !== 1 ? 's' : ''}`;
            const lista = document.getElementById(`lista-${id}`);
            if (lista && qtd === 0) {
                lista.innerHTML = '<p style="color:#888; font-size:0.9rem; padding:15px;">Nenhum produto cadastrado nesta categoria.</p>';
            }
        });

        // Controle de visibilidade da seção de destaques
        const secDestaques = document.getElementById('destaques');
        const navDestaques = document.getElementById('link-nav-destaques');

        if (secDestaques && navDestaques) {
            if (qtdDestaques === 0) {
                secDestaques.style.display = 'none';
                navDestaques.style.display = 'none';
                if (navDestaques.classList.contains('active')) {
                    navDestaques.classList.remove('active');
                    const primeiroLink = document.querySelector('.menu-categorias a[data-categoria-dinamica]');
                    if (primeiroLink) primeiroLink.classList.add('active');
                }
            } else {
                secDestaques.style.display = 'block';
                navDestaques.style.display = 'inline-flex';
            }
        }

        // Atualizar botões de rolagem dos carrosséis
        configurarBotoesCarrossel();

        // Se o cliente estava buscando algo, mantém o filtro aplicado
        const campoBusca = document.getElementById('campo-busca');
        if (campoBusca && campoBusca.value.trim()) filtrarCardapio(campoBusca.value);
    }

    function exibirEstadoVazioCardapio() {
        garantirSecoesCategorias();
        const containers = ['lista-destaques', ...categoriasOrdenadas().map(([id]) => `lista-${id}`)];
        containers.forEach(cid => {
            const el = document.getElementById(cid);
            if (el) el.innerHTML = '<p style="color:#888; font-size:0.9rem; padding:15px;">Nenhum produto cadastrado nesta categoria.</p>';
        });
    }

    // --- Monitoramento Firebase Otimizado ---

    function monitorarAdicionais() {
        if (!firebaseDisponivel()) return;
        firebase.database().ref('adicionais').on('value', (snapshot) => {
            listaAdicionais = snapshot.val() || {};
            salvarCacheLocal(CACHE_KEY_ADICIONAIS, listaAdicionais);
        }, (error) => {
            console.error('Erro ao escutar adicionais:', error);
        });
    }

    function carregarCardapio() {
        if (!firebaseDisponivel()) return;

        firebase.database().ref('produtos').on('value', (snapshot) => {
            dadosProdutos = Object.fromEntries(Object.entries(snapshot.val() || {}).filter(([, p]) => p && p.disponivel !== false));
            salvarCacheLocal(CACHE_KEY_PRODUTOS, dadosProdutos);
            renderizarListasCardapio(dadosProdutos);
            if (typeof aoAtualizarCategoriasAdmin === 'function') aoAtualizarCategoriasAdmin();
        }, (error) => {
            console.error('Erro ao carregar produtos:', error);
            if (!dadosProdutos || Object.keys(dadosProdutos).length === 0) {
                exibirEstadoVazioCardapio();
            }
        });
    }

    // --- Categorias, bairros e taxa de entrega em tempo real ---

    function monitorarCategorias() {
        if (!firebaseDisponivel()) return;
        firebase.database().ref('categorias').on('value', (snapshot) => {
            // Sem categorias no banco ainda: continua com as 3 categorias originais
            categoriasCardapio = snapshot.val() || { ...CATEGORIAS_PADRAO };
            gravarLocal(CACHE_KEY_CATEGORIAS, categoriasCardapio);
            renderizarListasCardapio(dadosProdutos);
            if (typeof aoAtualizarCategoriasAdmin === 'function') aoAtualizarCategoriasAdmin();
        }, (error) => console.error('Erro ao carregar categorias:', error));
    }

    function aplicarDadosEntrega() {
        configEntrega = { ...CONFIG_ENTREGA_PADRAO, ...(configEntregaBruta || {}) };
        bairrosEntrega = calcularBairrosEfetivos();
        popularSelectBairros();
        if (typeof aoAtualizarEntregaAdmin === 'function') aoAtualizarEntregaAdmin();
    }

    function monitorarEntrega() {
        if (!firebaseDisponivel()) return;
        firebase.database().ref('configuracoes/entrega').on('value', (snapshot) => {
            configEntregaBruta = snapshot.val();
            gravarLocal(CACHE_KEY_ENTREGA, configEntregaBruta);
            aplicarDadosEntrega();
        }, (error) => console.error('Erro ao carregar configuração de entrega:', error));

        firebase.database().ref('bairros').on('value', (snapshot) => {
            bairrosBrutos = snapshot.val();
            gravarLocal(CACHE_KEY_BAIRROS, bairrosBrutos);
            aplicarDadosEntrega();
        }, (error) => console.error('Erro ao carregar bairros:', error));
    }

    // --- Criação do Card de Produto ---

    function criarCardProduto(id, produto, isDestaque = false) {
        const card = document.createElement('div');
        card.className = 'item-produto';
        card.setAttribute('data-id', id);
        card.setAttribute('data-nome', (produto.nome || '').toLowerCase());
        card.setAttribute('data-desc', (produto.descricao || '').toLowerCase());
        card.setAttribute('data-categoria', produto.categoria || '');

        const sufixo = isDestaque ? '-destaque' : '';
        const badgeDestaque = isDestaque ? '<span class="badge-destaque">⭐ Destaque</span>' : '';
        const qtdNoCarrinho = getQtdTotalProdutoCard(id);
        const badgeQtd = qtdNoCarrinho > 0 ? `<span class="badge-qtd-carrinho" id="badge-qtd-${id}${sufixo}">${qtdNoCarrinho}</span>` : `<span class="badge-qtd-carrinho" id="badge-qtd-${id}${sufixo}" style="display:none;">0</span>`;

        const precoM = parseFloat(produto.precoM) || 0;
        const precoG = parseFloat(produto.precoG) || 0;
        const fotoUrl = produto.foto || './assets/logo.jpeg';

        let precoHtml = '';
        let acaoHtml = '';

        const tipo = tipoDoProduto(produto);

        if (tipo === 'batatas') {
            const rotuloPreco = (precoG > 0 && precoG !== precoM) ? 'A partir de' : 'Preço';
            precoHtml = `
                <div class="item-produto-preco-wrapper">
                    <span class="item-produto-preco-rotulo">${rotuloPreco}</span>
                    <span class="preco">R$ ${precoM.toFixed(2).replace('.', ',')}</span>
                </div>
            `;
            acaoHtml = `
                <button class="btn-card-adicionar" onclick="abrirModalCustomizacao('${id}')">
                    <span>+ Adicionar</span>
                </button>
            `;
        } else if (tipo === 'combos') {
            precoHtml = `
                <div class="item-produto-preco-wrapper">
                    <span class="item-produto-preco-rotulo">Preço do Combo</span>
                    <span class="preco">R$ ${precoM.toFixed(2).replace('.', ',')}</span>
                </div>
            `;
            acaoHtml = `
                <button class="btn-card-adicionar" onclick='abrirModalSabores(${JSON.stringify({ id, ...produto })})'>
                    <span>Sabores</span>
                </button>
            `;
        } else {
            // Bebidas / Itens Simples
            precoHtml = `
                <div class="item-produto-preco-wrapper">
                    <span class="item-produto-preco-rotulo">Preço Unitário</span>
                    <span class="preco">R$ ${precoM.toFixed(2).replace('.', ',')}</span>
                </div>
            `;
            if (qtdNoCarrinho > 0) {
                acaoHtml = `
                    <div class="seletor-quantidade-card" id="seletor-qtd-${id}${sufixo}">
                        <button onclick="alterarQtdRapida('${id}', -1, '${produto.nome.replace(/'/g, "\\'")}', ${precoM})">-</button>
                        <span class="qtd-numero">${qtdNoCarrinho}</span>
                        <button onclick="alterarQtdRapida('${id}', 1, '${produto.nome.replace(/'/g, "\\'")}', ${precoM})">+</button>
                    </div>
                `;
            } else {
                acaoHtml = `
                    <button class="btn-card-adicionar" onclick="alterarQtdRapida('${id}', 1, '${produto.nome.replace(/'/g, "\\'")}', ${precoM})">
                        <span>+ Adicionar</span>
                    </button>
                `;
            }
        }

        card.innerHTML = `
            <div class="item-produto-imagem-wrapper">
                ${badgeDestaque}
                ${badgeQtd}
                <img src="${fotoUrl}" alt="${produto.nome}" loading="lazy" onerror="this.src='./assets/logo.jpeg'">
            </div>
            <div class="item-produto-info">
                <h3>${produto.nome}</h3>
                <p>${produto.descricao || 'Receita especial feita com ingredientes selecionados.'}</p>
            </div>
            <div class="item-produto-rodape">
                ${precoHtml}
                ${acaoHtml}
            </div>
        `;

        return card;
    }

    // --- Modal de Personalização (Tamanhos M/G, Adicionais e Observações) ---

    window.abrirModalCustomizacao = (idProduto) => {
        const produto = dadosProdutos[idProduto];
        if (!produto) return;

        prodCustomizando = { id: idProduto, ...produto };
        customTamanhoSelecionado = 'M';
        customAdicionaisSelecionados = [];
        customQtd = 1;

        // Foto e dados do produto no modal
        const imgEl = document.getElementById('custom-prod-img');
        if (imgEl) imgEl.src = produto.foto || './assets/logo.jpeg';
        document.getElementById('custom-prod-nome').innerText = produto.nome;
        document.getElementById('custom-prod-desc').innerText = produto.descricao || '';
        document.getElementById('custom-prod-obs').value = '';
        document.getElementById('custom-qtd-numero').innerText = '1';

        // Renderizar seleção de tamanhos
        const secaoTamanhos = document.getElementById('custom-secao-tamanhos');
        const containerTamanhos = document.getElementById('custom-tamanhos-container');
        const precoM = parseFloat(produto.precoM) || 0;
        const precoG = parseFloat(produto.precoG) || 0;

        if (tipoDoProduto(produto) === 'batatas' && precoG > 0 && precoG !== precoM) {
            secaoTamanhos.style.display = 'block';
            containerTamanhos.innerHTML = `
                <div class="tamanho-card selecionado" id="card-tam-M" onclick="selecionarTamanhoCustom('M')">
                    <input type="radio" name="tam-custom" value="M" checked>
                    <span class="tamanho-card-nome">Tamanho M</span>
                    <span class="tamanho-card-preco">R$ ${precoM.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="tamanho-card" id="card-tam-G" onclick="selecionarTamanhoCustom('G')">
                    <input type="radio" name="tam-custom" value="G">
                    <span class="tamanho-card-nome">Tamanho G</span>
                    <span class="tamanho-card-preco">R$ ${precoG.toFixed(2).replace('.', ',')}</span>
                </div>
            `;
        } else {
            secaoTamanhos.style.display = 'none';
        }

        // Renderizar adicionais
        const secaoAdicionais = document.getElementById('custom-secao-adicionais');
        const containerAdicionais = document.getElementById('custom-adicionais-container');
        const keysAdicionais = Object.keys(listaAdicionais);

        if (tipoDoProduto(produto) === 'batatas' && keysAdicionais.length > 0) {
            secaoAdicionais.style.display = 'block';
            containerAdicionais.innerHTML = keysAdicionais.map(addId => {
                const add = listaAdicionais[addId];
                const precoAdd = parseFloat(add.preco) || 0;
                return `
                    <label class="adicional-custom-item" id="item-add-${addId}">
                        <div class="adicional-custom-info">
                            <input type="checkbox" onchange="toggleAdicionalCustom('${addId}', '${add.nome.replace(/'/g, "\\'")}', ${precoAdd}, this)">
                            <span class="adicional-custom-nome">${add.nome}</span>
                        </div>
                        <span class="adicional-custom-preco">+ R$ ${precoAdd.toFixed(2).replace('.', ',')}</span>
                    </label>
                `;
            }).join('');
        } else {
            secaoAdicionais.style.display = 'none';
        }

        atualizarTotalModalCustomizacao();
        document.getElementById('modal-customizacao').style.display = 'flex';
    };

    window.fecharModalCustomizacao = () => {
        document.getElementById('modal-customizacao').style.display = 'none';
        prodCustomizando = null;
    };

    window.selecionarTamanhoCustom = (tamanho) => {
        customTamanhoSelecionado = tamanho;
        const cardM = document.getElementById('card-tam-M');
        const cardG = document.getElementById('card-tam-G');
        if (cardM) cardM.classList.toggle('selecionado', tamanho === 'M');
        if (cardG) cardG.classList.toggle('selecionado', tamanho === 'G');

        const radioM = cardM?.querySelector('input');
        const radioG = cardG?.querySelector('input');
        if (radioM) radioM.checked = (tamanho === 'M');
        if (radioG) radioG.checked = (tamanho === 'G');

        atualizarTotalModalCustomizacao();
    };

    window.toggleAdicionalCustom = (id, nome, preco, inputEl) => {
        const itemEl = document.getElementById(`item-add-${id}`);
        if (inputEl.checked) {
            if (itemEl) itemEl.classList.add('ativo');
            customAdicionaisSelecionados.push({ id, nome, preco });
        } else {
            if (itemEl) itemEl.classList.remove('ativo');
            customAdicionaisSelecionados = customAdicionaisSelecionados.filter(a => a.id !== id);
        }
        atualizarTotalModalCustomizacao();
    };

    window.alterarQtdCustomizacao = (delta) => {
        customQtd = Math.max(1, customQtd + delta);
        document.getElementById('custom-qtd-numero').innerText = customQtd;
        atualizarTotalModalCustomizacao();
    };

    function atualizarTotalModalCustomizacao() {
        if (!prodCustomizando) return;
        const precoBase = customTamanhoSelecionado === 'G' && prodCustomizando.precoG
            ? parseFloat(prodCustomizando.precoG)
            : parseFloat(prodCustomizando.precoM);

        const somaAdicionais = customAdicionaisSelecionados.reduce((acc, a) => acc + a.preco, 0);
        const unitario = precoBase + somaAdicionais;
        const total = unitario * customQtd;

        const btnTotalEl = document.getElementById('custom-total-botao');
        if (btnTotalEl) {
            btnTotalEl.innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
        }
    }

    window.adicionarItemCustomizadoAoCarrinho = () => {
        if (!prodCustomizando) return;

        const observacao = document.getElementById('custom-prod-obs').value.trim();
        const precoBase = customTamanhoSelecionado === 'G' && prodCustomizando.precoG
            ? parseFloat(prodCustomizando.precoG)
            : parseFloat(prodCustomizando.precoM);

        const somaAdicionais = customAdicionaisSelecionados.reduce((acc, a) => acc + a.preco, 0);
        const precoUnitarioTotal = precoBase + somaAdicionais;

        // Chave única para o item no carrinho baseada em ID, tamanho, adicionais e observação
        const keyAdd = customAdicionaisSelecionados.map(a => a.id).sort().join('_');
        const hashObs = observacao ? '_' + observacao.replace(/[^a-zA-Z0-9]/g, '') : '';
        const chaveCarrinho = `${prodCustomizando.id}-${customTamanhoSelecionado}${keyAdd ? '-' + keyAdd : ''}${hashObs}`;

        const nomeFormatado = tipoDoProduto(prodCustomizando) === 'batatas' && prodCustomizando.precoG
            ? `${prodCustomizando.nome} (${customTamanhoSelecionado})`
            : prodCustomizando.nome;

        if (carrinho[chaveCarrinho]) {
            carrinho[chaveCarrinho].qtd += customQtd;
        } else {
            carrinho[chaveCarrinho] = {
                idProduto: prodCustomizando.id,
                nome: nomeFormatado,
                tamanho: customTamanhoSelecionado,
                precoBase: precoBase,
                adicionais: [...customAdicionaisSelecionados],
                observacao: observacao,
                preco: precoUnitarioTotal,
                qtd: customQtd
            };
        }

        atualizarExibicaoQtdCards(prodCustomizando.id);
        atualizarResumo();
        fecharModalCustomizacao();
    };

    // --- Adição Rápida para Bebidas/Itens Simples ---

    window.alterarQtdRapida = (id, delta, nome, preco) => {
        const chaveCarrinho = `${id}-unico`;
        if (delta > 0) {
            if (!carrinho[chaveCarrinho]) {
                carrinho[chaveCarrinho] = {
                    idProduto: id,
                    nome: nome,
                    tamanho: null,
                    precoBase: preco,
                    adicionais: [],
                    observacao: '',
                    preco: preco,
                    qtd: 0
                };
            }
            carrinho[chaveCarrinho].qtd += delta;
        } else if (delta < 0) {
            if (carrinho[chaveCarrinho]) {
                carrinho[chaveCarrinho].qtd += delta;
                if (carrinho[chaveCarrinho].qtd <= 0) {
                    delete carrinho[chaveCarrinho];
                }
            }
        }

        atualizarExibicaoQtdCards(id);
        atualizarResumo();
        renderizarListasCardapio(dadosProdutos); // Atualiza o seletor inline
    };

    // --- Modal de Combos (Escolha de Sabores) ---

    let comboAtualParaSelecao = {};

    window.abrirModalSabores = (produtoCombo) => {
        comboAtualParaSelecao = produtoCombo;
        const maxSabores = parseInt(produtoCombo.qtdSabores) || 2;
        const modal = document.getElementById('modal-combo-sabores');
        document.getElementById('modal-combo-titulo').textContent = `${produtoCombo.nome}`;
        document.getElementById('modal-combo-descricao').textContent = maxSabores === 1
            ? `Selecione 1 sabor de batata para o seu combo:`
            : `Selecione exatamente ${maxSabores} sabores de batata:`;

        const opcoesContainer = document.getElementById('combo-sabores-opcoes');
        opcoesContainer.innerHTML = '<p style="color:#666; padding:15px; text-align:center;">Carregando sabores disponíveis...</p>';

        // Sabores = produtos das categorias do tipo "batatas" (já carregados em tempo real)
        (() => {
            const batatas = Object.values(dadosProdutos).filter(p => p && categoriasCardapio[p.categoria] && tipoDoProduto(p) === 'batatas');
            if (batatas.length === 0) {
                opcoesContainer.innerHTML = '<p style="padding:15px; text-align:center;">Nenhum sabor de batata encontrado.</p>';
                return;
            }

            opcoesContainer.innerHTML = '';
            batatas.forEach(batata => {
                const label = document.createElement('label');
                label.className = 'adicional-custom-item';
                label.style.marginBottom = '8px';

                label.innerHTML = `
                    <div class="adicional-custom-info" style="align-items: flex-start;">
                        <input type="checkbox" value="${esc(batata.nome)}" style="margin-top: 3px;">
                        <div>
                            <strong class="adicional-custom-nome" style="display:block;">${esc(batata.nome)}</strong>
                            <p style="font-size: 0.8rem; color: #666; margin-top: 2px;">${esc(batata.descricao || '')}</p>
                        </div>
                    </div>
                `;

                const checkbox = label.querySelector('input[type="checkbox"]');
                checkbox.onchange = (event) => {
                    const selecionados = opcoesContainer.querySelectorAll('input:checked');
                    if (selecionados.length > maxSabores) {
                        alert(maxSabores === 1 ? `Você só pode escolher 1 sabor.` : `Você só pode escolher ${maxSabores} sabores.`);
                        event.target.checked = false;
                        label.classList.remove('ativo');
                    } else {
                        label.classList.toggle('ativo', event.target.checked);
                    }
                };

                opcoesContainer.appendChild(label);
            });
        })();

        document.getElementById('btn-confirmar-combo').onclick = adicionarComboComSaboresAoCarrinho;
        modal.style.display = 'flex';
    };

    window.fecharModalSabores = () => {
        document.getElementById('modal-combo-sabores').style.display = 'none';
    };

    function adicionarComboComSaboresAoCarrinho() {
        const selecionados = document.querySelectorAll('#combo-sabores-opcoes input:checked');
        const maxSabores = parseInt(comboAtualParaSelecao.qtdSabores) || 2;

        if (selecionados.length !== maxSabores) {
            alert(maxSabores === 1 ? `Por favor, escolha 1 sabor.` : `Por favor, escolha exatamente ${maxSabores} sabores.`);
            return;
        }

        const saboresEscolhidos = Array.from(selecionados).map(cb => cb.value);
        const nomeCompleto = `${comboAtualParaSelecao.nome} (${saboresEscolhidos.join(' + ')})`;
        const chaveCarrinho = `combo-${comboAtualParaSelecao.id}-${Date.now()}`;

        carrinho[chaveCarrinho] = {
            idProduto: comboAtualParaSelecao.id,
            qtd: 1,
            nome: nomeCompleto,
            tamanho: null,
            precoBase: parseFloat(comboAtualParaSelecao.precoM),
            adicionais: [],
            observacao: '',
            preco: parseFloat(comboAtualParaSelecao.precoM)
        };

        atualizarExibicaoQtdCards(comboAtualParaSelecao.id);
        atualizarResumo();
        fecharModalSabores();
    }

    // --- Gerenciamento do Carrinho e Cálculos ---

    function getQtdTotalProdutoCard(id) {
        let soma = 0;
        for (const key in carrinho) {
            if (carrinho[key].idProduto === id) {
                soma += carrinho[key].qtd;
            }
        }
        return soma;
    }

    function atualizarExibicaoQtdCards(id) {
        const qtd = getQtdTotalProdutoCard(id);
        const badges = [
            document.getElementById(`badge-qtd-${id}`),
            document.getElementById(`badge-qtd-${id}-destaque`)
        ];
        badges.forEach(b => {
            if (b) {
                b.innerText = qtd;
                b.style.display = qtd > 0 ? 'flex' : 'none';
            }
        });
    }

    function atualizarResumo() {
        totalItens = 0;
        precoTotalProdutos = 0.0;
        for (const chave in carrinho) {
            totalItens += carrinho[chave].qtd;
            precoTotalProdutos += carrinho[chave].qtd * carrinho[chave].preco;
        }

        // Elementos do resumo e modal
        const elTotalItens = document.getElementById('total-itens');
        const elSubtotal = document.getElementById('preco-subtotal');
        if (elTotalItens) elTotalItens.innerText = totalItens;
        if (elSubtotal) elSubtotal.innerText = precoTotalProdutos.toFixed(2).replace('.', ',');

        // Barra Flutuante de Carrinho
        const barraFlutuante = document.getElementById('barra-carrinho-flutuante');
        const flutuanteItens = document.getElementById('total-itens-flutuante');
        const flutuanteValor = document.getElementById('preco-total-flutuante');

        if (barraFlutuante) {
            if (totalItens > 0) {
                barraFlutuante.style.display = 'flex';
                if (flutuanteItens) flutuanteItens.innerText = totalItens;
                if (flutuanteValor) flutuanteValor.innerText = (precoTotalProdutos + taxaEntregaAtual).toFixed(2).replace('.', ',');
            } else {
                barraFlutuante.style.display = 'none';
            }
        }

        atualizarTotalGeral();
        renderizarItensModalCarrinho();
    }

    // --- Bairros e Taxa de Entrega (configuráveis no painel) ---

    // Preenche a lista de bairros do checkout, mantendo o bairro já escolhido
    function popularSelectBairros() {
        const seletor = document.getElementById('bairro');
        const campoTexto = document.getElementById('bairro-texto');
        if (!seletor) return;

        const anterior = seletor.value;
        const lista = bairrosOrdenados();

        seletor.innerHTML = '<option value="" disabled>Selecione seu bairro...</option>' +
            lista.map(([id, b]) => `<option value="${esc(id)}">${esc(b.nome)}</option>`).join('');

        // Sem bairros cadastrados: o cliente digita o bairro
        seletor.style.display = lista.length > 0 ? '' : 'none';
        if (campoTexto) campoTexto.style.display = lista.length > 0 ? 'none' : '';

        seletor.value = (anterior && bairrosEntrega[anterior]) ? anterior : '';
        if (!seletor.value) seletor.selectedIndex = 0;

        calcularFrete();
        atualizarCartaoEnderecoSalvo();
    }

    // Retorna { id, nome } do bairro escolhido (ou null)
    function bairroSelecionado() {
        const seletor = document.getElementById('bairro');
        const campoTexto = document.getElementById('bairro-texto');
        if (bairrosOrdenados().length === 0) {
            const nome = campoTexto ? campoTexto.value.trim() : '';
            return nome ? { id: '', nome } : null;
        }
        if (!seletor || !seletor.value || !bairrosEntrega[seletor.value]) return null;
        return { id: seletor.value, nome: bairrosEntrega[seletor.value].nome };
    }

    window.calcularFrete = () => {
        const bairro = bairroSelecionado();
        const divTaxa = document.getElementById('exibicao-taxa');
        const textoTaxa = document.getElementById('texto-taxa');
        const valorFrete = document.getElementById('valor-resumo-frete');
        const taxaUnicaAtiva = configEntrega.cobrarTaxa && configEntrega.modo === 'unica';

        // Taxa por bairro só entra depois que o bairro é escolhido; taxa única vale direto
        taxaEntregaAtual = (bairro || taxaUnicaAtiva) ? obterTaxaEntrega(bairro ? bairro.id : '') : 0;

        const mostrarCaixa = bairro || !configEntrega.cobrarTaxa || taxaUnicaAtiva;
        if (divTaxa) divTaxa.style.display = mostrarCaixa ? 'block' : 'none';

        const sufixoBairro = bairro ? ` para o bairro ${esc(bairro.nome)}` : '';
        if (!configEntrega.cobrarTaxa || (bairro && taxaEntregaAtual === 0) || (taxaUnicaAtiva && taxaEntregaAtual === 0)) {
            if (textoTaxa) textoTaxa.innerHTML = `<strong>✅ Entrega Grátis</strong>${sufixoBairro}`;
            if (valorFrete) valorFrete.innerText = 'Grátis';
        } else if (taxaEntregaAtual > 0) {
            const detalhe = bairro ? esc(bairro.nome) : 'taxa única';
            if (textoTaxa) textoTaxa.innerHTML = `<strong>🛵 Taxa de Entrega: ${formatarPreco(taxaEntregaAtual)}</strong> (${detalhe})`;
            if (valorFrete) valorFrete.innerText = formatarPreco(taxaEntregaAtual);
        } else if (valorFrete) {
            valorFrete.innerText = 'R$ 0,00';
        }

        atualizarTotalGeral();
    };

    // --- Cadastro simples do cliente (sem senha), salvo no aparelho e no Firebase ---

    function lerClienteSalvo() {
        return lerLocal(CHAVE_CLIENTE, null);
    }

    function temEnderecoCompleto(cliente) {
        return !!(cliente && cliente.endereco && cliente.numero && (cliente.bairroId || cliente.bairroNome));
    }

    // Seleciona o bairro salvo: pelo id ou, se o id mudou, pelo nome
    function selecionarBairroSalvo(cliente) {
        const seletor = document.getElementById('bairro');
        const campoTexto = document.getElementById('bairro-texto');
        if (bairrosOrdenados().length === 0) {
            if (campoTexto) campoTexto.value = cliente.bairroNome || '';
            return !!cliente.bairroNome;
        }
        let id = cliente.bairroId && bairrosEntrega[cliente.bairroId] ? cliente.bairroId : '';
        if (!id && cliente.bairroNome) {
            const achado = bairrosOrdenados().find(([, b]) => b.nome.toLowerCase() === String(cliente.bairroNome).toLowerCase());
            if (achado) id = achado[0];
        }
        if (seletor) {
            seletor.value = id;
            if (!id) seletor.selectedIndex = 0;
        }
        return !!id;
    }

    let clientePreenchido = false;
    function preencherDadosCliente() {
        if (clientePreenchido) return;
        clientePreenchido = true;
        const cliente = lerClienteSalvo();
        if (!cliente) return;

        const campos = {
            'nome-cliente': cliente.nome,
            'telefone-cliente': cliente.telefone ? formatarTelefone(cliente.telefone) : ''
        };
        Object.entries(campos).forEach(([id, valor]) => {
            const el = document.getElementById(id);
            if (el && !el.value && valor) el.value = valor;
        });

        if (temEnderecoCompleto(cliente)) {
            document.getElementById('endereco-cliente').value = cliente.endereco || '';
            document.getElementById('numero-casa').value = cliente.numero || '';
            document.getElementById('ponto-referencia').value = cliente.referencia || '';
            const bairroOk = selecionarBairroSalvo(cliente);
            calcularFrete();
            // Mostra o cartão "Entregar em" só se o bairro salvo ainda existe
            mostrarModoEndereco(bairroOk ? 'cartao' : 'campos');
        }
    }

    // 'cartao' = mostra o endereço salvo resumido; 'campos' = mostra o formulário
    function mostrarModoEndereco(modo) {
        const cartao = document.getElementById('endereco-salvo-box');
        const campos = document.getElementById('campos-endereco-detalhe');
        if (cartao) cartao.style.display = modo === 'cartao' ? 'flex' : 'none';
        if (campos) campos.style.display = modo === 'cartao' ? 'none' : 'block';
        if (modo === 'cartao') atualizarCartaoEnderecoSalvo();
    }

    function atualizarCartaoEnderecoSalvo() {
        const cartao = document.getElementById('endereco-salvo-box');
        if (!cartao || cartao.style.display === 'none') return;
        const bairro = bairroSelecionado();
        if (!bairro) {
            // O bairro salvo foi removido pelo dono: pede para o cliente escolher de novo
            mostrarModoEndereco('campos');
            return;
        }
        const rua = document.getElementById('endereco-cliente').value.trim();
        const numero = document.getElementById('numero-casa').value.trim();
        const referencia = document.getElementById('ponto-referencia').value.trim();
        document.getElementById('endereco-salvo-linha1').textContent = `${rua}, Nº ${numero}`;
        document.getElementById('endereco-salvo-linha2').textContent = `${bairro.nome}${referencia ? ' • ' + referencia : ''}`;
    }

    window.editarEnderecoSalvo = () => {
        mostrarModoEndereco('campos');
        document.getElementById('endereco-cliente')?.focus();
    };

    window.usarOutroEndereco = () => {
        ['endereco-cliente', 'numero-casa', 'ponto-referencia', 'bairro-texto'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const seletor = document.getElementById('bairro');
        if (seletor) { seletor.value = ''; seletor.selectedIndex = 0; }
        mostrarModoEndereco('campos');
        calcularFrete();
        document.getElementById('endereco-cliente')?.focus();
    };

    function salvarCliente(dados) {
        const anterior = lerClienteSalvo() || {};
        // Na retirada não há endereço novo: mantém o endereço que já estava salvo
        const cliente = dados.tipo === 'retirada'
            ? { ...anterior, nome: dados.nome, telefone: dados.telefone }
            : {
                nome: dados.nome,
                telefone: dados.telefone,
                endereco: dados.endereco,
                numero: dados.numero,
                bairroId: dados.bairroId,
                bairroNome: dados.bairroNome,
                referencia: dados.referencia
            };
        gravarLocal(CHAVE_CLIENTE, cliente);

        if (!firebaseDisponivel()) return;
        firebase.database().ref(`clientes/${cliente.telefone}`).set({
            nome: cliente.nome || '',
            telefone: cliente.telefone,
            endereco: cliente.endereco || '',
            numero: cliente.numero || '',
            bairro: cliente.bairroNome || '',
            referencia: cliente.referencia || '',
            atualizadoEm: Date.now()
        }).catch(err => console.warn('Cadastro do cliente não foi salvo no Firebase:', err));
    }

    function atualizarTotalGeral() {
        const tipoEntrega = document.getElementById('retirada ou entrega')?.value || 'entrega';
        const frete = tipoEntrega === 'retirada' ? 0 : taxaEntregaAtual;
        const totalFinal = precoTotalProdutos + frete;

        const display = document.getElementById('preco-total');
        if (display) display.innerText = totalFinal.toFixed(2).replace('.', ',');

        const flutuanteValor = document.getElementById('preco-total-flutuante');
        if (flutuanteValor) flutuanteValor.innerText = totalFinal.toFixed(2).replace('.', ',');
    }

    // --- Modal do Carrinho / Checkout ---

    window.abrirModalCarrinho = () => {
        renderizarItensModalCarrinho();
        preencherDadosCliente();
        const modal = document.getElementById('modal-carrinho');
        if (modal) modal.style.display = 'flex';
    };

    window.fecharModalCarrinho = () => {
        const modal = document.getElementById('modal-carrinho');
        if (modal) modal.style.display = 'none';
    };

    function renderizarItensModalCarrinho() {
        const container = document.getElementById('lista-itens-carrinho');
        const secaoCheckout = document.getElementById('secao-checkout-formulario');
        if (!container) return;

        const chaves = Object.keys(carrinho);
        container.innerHTML = '';

        if (chaves.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 30px 10px; color:#777;">
                    <div style="font-size: 2.8rem; margin-bottom: 8px;">🛒</div>
                    <p style="font-weight: 700; font-size: 1.1rem; color: #333;">Sua sacola está vazia</p>
                    <p style="font-size: 0.88rem; margin-top: 4px;">Adicione batatas deliciosas, combos e bebidas para fazer seu pedido!</p>
                </div>
            `;
            if (secaoCheckout) secaoCheckout.style.display = 'none';
            return;
        }

        if (secaoCheckout) secaoCheckout.style.display = 'block';

        chaves.forEach(chave => {
            const item = carrinho[chave];
            const div = document.createElement('div');
            div.className = 'carrinho-item-card';

            let adicionaisHtml = '';
            if (item.adicionais && item.adicionais.length > 0) {
                const listaStr = item.adicionais.map(a => `${a.nome} (+R$ ${parseFloat(a.preco).toFixed(2).replace('.', ',')})`).join(', ');
                adicionaisHtml = `<div class="carrinho-item-subinfo"><strong>+ Adicionais:</strong> ${listaStr}</div>`;
            }

            let obsHtml = '';
            if (item.observacao) {
                obsHtml = `<span class="carrinho-item-obs">📝 Obs: ${item.observacao}</span>`;
            }

            div.innerHTML = `
                <div class="carrinho-item-detalhes">
                    <div class="carrinho-item-nome">${item.nome}</div>
                    ${adicionaisHtml}
                    ${obsHtml}
                </div>
                <div class="carrinho-item-direita">
                    <span class="carrinho-item-preco">R$ ${(item.qtd * item.preco).toFixed(2).replace('.', ',')}</span>
                    <div class="seletor-quantidade-card">
                        <button onclick="alterarQtdItemCarrinho('${chave}', -1)">-</button>
                        <span class="qtd-numero">${item.qtd}</span>
                        <button onclick="alterarQtdItemCarrinho('${chave}', 1)">+</button>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    }

    window.alterarQtdItemCarrinho = (chave, delta) => {
        if (!carrinho[chave]) return;
        const idProduto = carrinho[chave].idProduto;
        carrinho[chave].qtd += delta;

        if (carrinho[chave].qtd <= 0) {
            delete carrinho[chave];
        }

        atualizarExibicaoQtdCards(idProduto);
        atualizarResumo();
    };

    // --- Alternância Entrega / Retirada ---

    window.selecionarTipoEntrega = (tipo) => {
        const tabEntrega = document.getElementById('tab-tipo-entrega');
        const tabRetirada = document.getElementById('tab-tipo-retirada');
        const selectOculto = document.getElementById('retirada ou entrega');
        const grupoEndereco = document.getElementById('grupo-campos-endereco');
        const linhaFrete = document.getElementById('linha-resumo-frete');

        if (selectOculto) selectOculto.value = tipo;

        if (tipo === 'entrega') {
            tabEntrega?.classList.add('ativo');
            tabRetirada?.classList.remove('ativo');
            if (grupoEndereco) grupoEndereco.style.display = 'block';
            if (linhaFrete) linhaFrete.style.display = 'flex';
        } else {
            tabRetirada?.classList.add('ativo');
            tabEntrega?.classList.remove('ativo');
            if (grupoEndereco) grupoEndereco.style.display = 'none';
            if (linhaFrete) linhaFrete.style.display = 'none';
        }

        atualizarTotalGeral();
    };

    // Mantido para compatibilidade com onchange="mostrarCamposEntrega()"
    window.mostrarCamposEntrega = () => {
        const val = document.getElementById('retirada ou entrega')?.value || 'entrega';
        selecionarTipoEntrega(val);
    };

    // --- Seleção de Forma de Pagamento ---

    window.selecionarPagamento = (forma, btnEl) => {
        document.querySelectorAll('.pagamento-card-btn').forEach(b => b.classList.remove('ativo'));
        if (btnEl) btnEl.classList.add('ativo');

        const selectOculto = document.getElementById('pagamento');
        if (selectOculto) selectOculto.value = forma;

        const trocoWrapper = document.getElementById('campo-troco-wrapper');
        if (trocoWrapper) {
            trocoWrapper.style.display = (forma === 'Dinheiro') ? 'block' : 'none';
        }
    };

    // --- Finalização e Envio do Pedido via WhatsApp ---

    window.enviarPedido = () => {
        if (typeof window.lojaAbertaParaPedidos !== 'undefined' && !window.lojaAbertaParaPedidos) {
            alert("A loja está fechada no momento e não está aceitando novos pedidos.");
            return;
        }

        if (totalItens === 0) {
            alert("Sua sacola está vazia!");
            return;
        }

        // Evita pedido duplicado com dois cliques seguidos
        if (enviandoPedido) return;

        const tipoPedido = document.getElementById('retirada ou entrega')?.value || 'entrega';
        const nome = document.getElementById('nome-cliente')?.value.trim();
        const telefone = somenteDigitos(document.getElementById('telefone-cliente')?.value);
        const pagamento = document.getElementById('pagamento')?.value || 'Pix';
        const pontoReferencia = document.getElementById('ponto-referencia')?.value.trim() || '';
        const trocoPara = document.getElementById('troco-para')?.value.trim() || '';

        if (!nome) {
            alert("Por favor, digite o seu nome para identificação do pedido!");
            document.getElementById('nome-cliente')?.focus();
            return;
        }

        if (!telefoneValido(telefone)) {
            alert("Por favor, digite seu telefone (WhatsApp) com DDD. Ex: (74) 9 9999-9999");
            document.getElementById('telefone-cliente')?.focus();
            return;
        }

        let rua = "", numero = "", bairroNome = "", bairroId = "";

        if (tipoPedido === 'entrega') {
            const bairro = bairroSelecionado();
            if (!bairro) {
                alert("Por favor, selecione o bairro para entrega!");
                mostrarModoEndereco('campos');
                (bairrosOrdenados().length ? document.getElementById('bairro') : document.getElementById('bairro-texto'))?.focus();
                return;
            }
            rua = document.getElementById('endereco-cliente')?.value.trim() || '';
            numero = document.getElementById('numero-casa')?.value.trim() || '';
            bairroNome = bairro.nome;
            bairroId = bairro.id;

            if (!rua || !numero) {
                alert("Por favor, preencha a rua e o número da sua casa para a entrega!");
                mostrarModoEndereco('campos');
                document.getElementById('endereco-cliente')?.focus();
                return;
            }
        }

        // Recalcula a taxa com a configuração mais recente do painel
        calcularFrete();
        const taxa = tipoPedido === 'entrega' ? taxaEntregaAtual : 0;
        const totalFinal = precoTotalProdutos + taxa;

        // Identificador do pedido (chave do Firebase) e código curto para o cliente
        const idPedido = firebaseDisponivel()
            ? firebase.database().ref('pedidos').push().key
            : `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const codigoPedido = idPedido.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();

        // Montagem Elegante da Mensagem
        let mensagem = `*NOVO PEDIDO - ${NOME_RESTAURANTE}* 🍔🍟\n`;
        mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `🧾 *Pedido:* #${codigoPedido}\n`;
        mensagem += `👤 *Cliente:* ${nome}\n`;
        mensagem += `📱 *Telefone:* ${formatarTelefone(telefone)}\n`;
        mensagem += `📦 *Modalidade:* ${tipoPedido === 'retirada' ? '🏬 Retirada no Local' : '🛵 Entrega'}\n`;

        if (tipoPedido === 'entrega') {
            mensagem += `📍 *Endereço:* ${rua}, Nº ${numero}\n`;
            mensagem += `🏘️ *Bairro:* ${bairroNome}\n`;
            if (pontoReferencia) {
                mensagem += `📌 *Ponto de Ref:* ${pontoReferencia}\n`;
            }
        }

        mensagem += `💳 *Pagamento:* ${pagamento}`;
        if (pagamento === 'Dinheiro' && trocoPara) {
            mensagem += ` (Troco para: ${trocoPara})`;
        }
        mensagem += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        mensagem += `*ITENS DO PEDIDO:*\n`;

        const itensPedido = [];
        for (const chave in carrinho) {
            const item = carrinho[chave];
            const subtotalItem = item.qtd * item.preco;
            mensagem += `▪️ *${item.qtd}x* ${item.nome} - R$ ${subtotalItem.toFixed(2).replace('.', ',')}\n`;
            if (item.adicionais && item.adicionais.length > 0) {
                const addList = item.adicionais.map(a => `${a.nome} (+R$ ${parseFloat(a.preco).toFixed(2).replace('.', ',')})`).join(', ');
                mensagem += `   ↳ *Adicionais:* ${addList}\n`;
            }
            if (item.observacao) {
                mensagem += `   ↳ *Obs:* ${item.observacao}\n`;
            }

            itensPedido.push({
                idProduto: item.idProduto || '',
                nome: item.nome,
                qtd: item.qtd,
                precoUnit: Number(item.preco.toFixed(2)),
                subtotal: Number(subtotalItem.toFixed(2)),
                adicionais: (item.adicionais || []).map(a => ({ nome: a.nome, preco: Number(parseFloat(a.preco).toFixed(2)) })),
                observacao: item.observacao || ''
            });
        }

        mensagem += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `Subtotal dos Itens: R$ ${precoTotalProdutos.toFixed(2).replace('.', ',')}\n`;

        if (tipoPedido === 'entrega') {
            mensagem += taxa > 0
                ? `🛵 Taxa de Entrega: R$ ${taxa.toFixed(2).replace('.', ',')}\n`
                : `🛵 Taxa de Entrega: Grátis\n`;
        }
        mensagem += `*TOTAL FINAL: R$ ${totalFinal.toFixed(2).replace('.', ',')}*\n`;
        mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `_${MENSAGEM_FINAL_PEDIDO}_`;

        // Abre o WhatsApp primeiro (o navegador bloqueia a janela se ela abrir depois de esperar o Firebase)
        enviandoPedido = true;
        setTimeout(() => { enviandoPedido = false; }, 3000);
        window.open(`https://wa.me/${NUMERO_WHATSAPP_LOJA}?text=${encodeURIComponent(mensagem)}`, '_blank');

        // Salva o cadastro do cliente (aparelho + Firebase)
        salvarCliente({ tipo: tipoPedido, nome, telefone, endereco: rua, numero, bairroId, bairroNome, referencia: pontoReferencia });

        // Salva o pedido no Firebase
        const agora = Date.now();
        const resumoItens = itensPedido.map(i => `${i.qtd}x ${i.nome}`).join(', ').slice(0, 480);
        const pedido = {
            codigo: codigoPedido,
            criadoEm: agora,
            status: 'Novo',
            tipo: tipoPedido,
            cliente: {
                nome,
                telefone,
                endereco: rua,
                numero,
                bairro: bairroNome,
                referencia: tipoPedido === 'entrega' ? pontoReferencia : ''
            },
            itens: itensPedido,
            subtotal: Number(precoTotalProdutos.toFixed(2)),
            taxa: Number(taxa.toFixed(2)),
            total: Number(totalFinal.toFixed(2)),
            pagamento,
            troco: pagamento === 'Dinheiro' ? trocoPara : ''
        };
        // Cópia sem dados pessoais: é o que o cliente consegue ler em "Meus pedidos"
        const pedidoPublico = {
            codigo: codigoPedido,
            criadoEm: agora,
            status: 'Novo',
            tipo: tipoPedido,
            itensResumo: resumoItens,
            total: pedido.total
        };

        registrarMeuPedido({ id: idPedido, telefone, ...pedidoPublico });

        if (firebaseDisponivel()) {
            firebase.database().ref().update({
                [`pedidos/${idPedido}`]: pedido,
                [`pedidosStatus/${idPedido}`]: pedidoPublico
            }).then(() => {
                mostrarToast(`✅ Pedido #${codigoPedido} registrado! Acompanhe em "Meus pedidos".`);
                // Disparo não-bloqueante do push ao dono do restaurante
                try {
                    fetch('https://drako-house.vercel.app/api/notificar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pedidoId: idPedido }),
                        keepalive: true
                    }).catch(() => {});
                } catch (e) {}
            }).catch(err => {
                console.error('Erro ao salvar pedido no Firebase:', err);
                mostrarToast('Pedido enviado pelo WhatsApp, mas não foi possível registrar no sistema.', 'erro');
            });
        }
    };

    // --- "Meus pedidos": histórico do cliente neste aparelho, identificado pelo telefone ---

    function lerMeusPedidos() {
        const lista = lerLocal(CHAVE_MEUS_PEDIDOS, []);
        return Array.isArray(lista) ? lista : [];
    }

    function registrarMeuPedido(pedido) {
        const lista = lerMeusPedidos().filter(p => p.id !== pedido.id);
        lista.unshift(pedido);
        gravarLocal(CHAVE_MEUS_PEDIDOS, lista.slice(0, 30));
        atualizarBotaoMeusPedidos();
    }

    function atualizarBotaoMeusPedidos() {
        const btn = document.getElementById('btn-meus-pedidos-topo');
        if (btn) btn.style.display = lerMeusPedidos().length > 0 ? 'inline-flex' : 'none';
    }

    // Escuta o status de cada pedido em tempo real enquanto a janela está aberta
    const ouvintesMeusPedidos = {};
    function pararOuvintesMeusPedidos() {
        Object.entries(ouvintesMeusPedidos).forEach(([id, ref]) => {
            ref.off();
            delete ouvintesMeusPedidos[id];
        });
    }

    window.abrirMeusPedidos = () => {
        const campoTel = document.getElementById('meus-pedidos-telefone');
        const cliente = lerClienteSalvo();
        const ultimoPedido = lerMeusPedidos()[0];
        const telefone = (cliente && cliente.telefone) || (ultimoPedido && ultimoPedido.telefone) || '';
        if (campoTel && !campoTel.value && telefone) campoTel.value = formatarTelefone(telefone);
        renderizarMeusPedidos();
        document.getElementById('modal-meus-pedidos').style.display = 'flex';
    };

    window.fecharMeusPedidos = () => {
        document.getElementById('modal-meus-pedidos').style.display = 'none';
        pararOuvintesMeusPedidos();
    };

    function htmlCartaoMeuPedido(p) {
        return `
            <div class="pedido-card ${classeStatus(p.status)}" id="meu-pedido-${esc(p.id)}">
                <div class="pedido-card-topo">
                    <strong>Pedido #${esc(p.codigo)}</strong>
                    <span class="badge-status ${classeStatus(p.status)}">${esc(p.status || 'Novo')}</span>
                </div>
                <div class="pedido-card-data">${esc(formatarDataHora(p.criadoEm))} • ${p.tipo === 'retirada' ? '🏬 Retirada' : '🛵 Entrega'}</div>
                <div class="pedido-card-itens-resumo">${esc(p.itensResumo || '')}</div>
                <div class="pedido-card-total">Total: <strong>${formatarPreco(p.total)}</strong></div>
            </div>
        `;
    }

    window.renderizarMeusPedidos = () => {
        const container = document.getElementById('lista-meus-pedidos');
        const telefone = somenteDigitos(document.getElementById('meus-pedidos-telefone')?.value);
        if (!container) return;
        pararOuvintesMeusPedidos();

        if (!telefoneValido(telefone)) {
            container.innerHTML = '<p class="admin-vazio">Digite o telefone que você usou no pedido.</p>';
            return;
        }

        const pedidos = lerMeusPedidos().filter(p => p.telefone === telefone);
        if (pedidos.length === 0) {
            container.innerHTML = '<p class="admin-vazio">Nenhum pedido encontrado para este telefone neste aparelho.</p>';
            return;
        }

        container.innerHTML = pedidos.map(htmlCartaoMeuPedido).join('');

        if (!firebaseDisponivel()) return;
        pedidos.forEach(p => {
            const ref = firebase.database().ref(`pedidosStatus/${p.id}`);
            ouvintesMeusPedidos[p.id] = ref;
            ref.on('value', (snapshot) => {
                const atual = snapshot.val();
                if (!atual) return;
                const atualizado = { ...p, ...atual, id: p.id, telefone: p.telefone };
                // Guarda o status mais recente no aparelho
                const lista = lerMeusPedidos().map(item => item.id === p.id ? atualizado : item);
                gravarLocal(CHAVE_MEUS_PEDIDOS, lista);
                const cartao = document.getElementById(`meu-pedido-${p.id}`);
                if (cartao) cartao.outerHTML = htmlCartaoMeuPedido(atualizado);
            }, (err) => console.warn('Não foi possível acompanhar o pedido', p.codigo, err));
        });
    };

    // --- Rolagem Horizontal e Controles dos Carrosséis ---

    window.rolarCarrossel = (idLista, direcao) => {
        const lista = document.getElementById(idLista);
        if (!lista) return;
        const cardWidth = 260; // Largura aproximada de um card + gap
        const offset = cardWidth * 1.5 * direcao;
        lista.scrollBy({ left: offset, behavior: 'smooth' });
    };

    function configurarBotoesCarrossel() {
        const wrappers = document.querySelectorAll('.carrossel-wrapper');
        wrappers.forEach(wrapper => {
            const lista = wrapper.querySelector('.cardapio');
            const btnPrev = wrapper.querySelector('.btn-scroll-nav.prev');
            const btnNext = wrapper.querySelector('.btn-scroll-nav.next');

            if (!lista || !btnPrev || !btnNext) return;

            const atualizarEstadoBotoes = () => {
                const scrollLeft = lista.scrollLeft;
                const maxScroll = lista.scrollWidth - lista.clientWidth;

                btnPrev.disabled = scrollLeft <= 5;
                btnNext.disabled = scrollLeft >= maxScroll - 5;
            };

            lista.addEventListener('scroll', atualizarEstadoBotoes, { passive: true });
            atualizarEstadoBotoes();
        });
    }

    // --- Busca e Filtro Instantâneo ---

    window.filtrarCardapio = (termo) => {
        const termoLimpo = (termo || '').trim().toLowerCase();
        const btnLimpar = document.getElementById('btn-limpar-busca');
        const buscaVazia = document.getElementById('busca-vazia');

        if (btnLimpar) {
            btnLimpar.style.display = termoLimpo.length > 0 ? 'inline-flex' : 'none';
        }

        const cards = document.querySelectorAll('.item-produto');
        let totalVisiveis = 0;

        cards.forEach(card => {
            const nome = card.getAttribute('data-nome') || '';
            const desc = card.getAttribute('data-desc') || '';
            const match = !termoLimpo || nome.includes(termoLimpo) || desc.includes(termoLimpo);

            card.style.display = match ? 'flex' : 'none';
            if (match) totalVisiveis++;
        });

        // Ocultar seções vazias
        const secoes = document.querySelectorAll('.secao-categoria');
        secoes.forEach(sec => {
            const cardsNaSecao = sec.querySelectorAll('.item-produto');
            let temVisivel = false;
            cardsNaSecao.forEach(c => {
                if (c.style.display !== 'none') temVisivel = true;
            });
            sec.style.display = temVisivel ? 'block' : 'none';
        });

        if (buscaVazia) {
            buscaVazia.style.display = (totalVisiveis === 0 && termoLimpo.length > 0) ? 'block' : 'none';
        }
    };

    window.limparBusca = () => {
        const input = document.getElementById('campo-busca');
        if (input) input.value = '';
        filtrarCardapio('');
    };

    // --- Sincronização do Menu de Categorias no Scroll ---

    function changeLinkStateOnScroll() {
        // Consulta a cada rolagem porque as seções de categoria são geradas dinamicamente
        const navLinks = document.querySelectorAll('.menu-categorias a');
        const sections = document.querySelectorAll('.secao-categoria');
        let currentSectionId = '';
        sections.forEach(section => {
            if (section.style.display === 'none') return;
            const sectionTop = section.offsetTop;
            if (window.scrollY >= sectionTop - 140) {
                currentSectionId = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    }
    window.addEventListener('scroll', changeLinkStateOnScroll, { passive: true });

    // Inicialização Instantânea com Cache e Sincronização em Background
    const temCache = carregarCacheLocal();
    if (!temCache) {
        renderizarSkeletonsIniciais();
    }
    popularSelectBairros();
    document.getElementById('bairro-texto')?.addEventListener('input', () => calcularFrete());
    atualizarBotaoMeusPedidos();
    monitorarCategorias();
    monitorarEntrega();
    monitorarAdicionais();
    carregarCardapio();
});

// --- Monitoramento do Status da Loja ---

window.lojaAbertaParaPedidos = true;

function monitorarStatusLoja() {
    if (typeof firebase === 'undefined') return;
    firebase.database().ref('configuracoes/statusLoja').on('value', (snapshot) => {
        const val = snapshot.val();
        const estaAberta = val !== false;
        window.lojaAbertaParaPedidos = estaAberta;

        const overlay = document.getElementById('overlay-fechado');
        const dot = document.getElementById('status-dot');
        const txtStatus = document.getElementById('texto-status-loja');
        const btnFinalizar = document.getElementById('btn-finalizar');

        if (dot && txtStatus) {
            if (estaAberta) {
                dot.className = 'status-dot';
                txtStatus.innerText = 'Aberto para Pedidos';
            } else {
                dot.className = 'status-dot fechado';
                txtStatus.innerText = 'Loja fechada no momento';
            }
        }

        if (overlay) {
            if (estaAberta) {
                overlay.style.display = 'none';
                document.body.style.overflow = 'auto';
            } else {
                // Notifica que está fechado, mas não trava navegação após fechar
                overlay.style.display = 'flex';
            }
        }

        if (btnFinalizar) {
            btnFinalizar.disabled = !estaAberta;
            btnFinalizar.style.opacity = estaAberta ? '1' : '0.5';
            btnFinalizar.style.cursor = estaAberta ? 'pointer' : 'not-allowed';
            btnFinalizar.title = estaAberta ? '' : 'Loja fechada no momento';
        }
    });
}
monitorarStatusLoja();

// --- Identidade Visual (Cores & Branding) ---

const IDENTIDADE_VISUAL_PADRAO = {
    logo: './assets/logo.jpeg',
    corPrincipal: '#516e03',
    corEscura: '#2e5902',
    corDestaque: '#f2f2f2',
    corFundo: '#f4f5f8',
    corFonteTitulo: '#f6f4f3',
    corFonteSubtitulo: '#f6f4f3',
    corCategorias: '#516e03',
    corCategoriaAtiva: '#516e03',
    fundoCabecalho: '',
    tituloCabecalho: 'DRAKO HOUSE',
    subtituloCabecalho: 'Sua dose diária de felicidade.'
};

function aplicarIdentidadeVisual(identidade = {}) {
    const configuracao = { ...IDENTIDADE_VISUAL_PADRAO, ...identidade };
    const raiz = document.documentElement;
    raiz.style.setProperty('--vermelho-principal', configuracao.corPrincipal);
    raiz.style.setProperty('--vermelho-escuro', configuracao.corEscura);
    raiz.style.setProperty('--laranja-detalhes', configuracao.corDestaque);
    raiz.style.setProperty('--cinza-fundo', configuracao.corFundo);
    raiz.style.setProperty('--fonte-titulo-cabecalho', configuracao.corFonteTitulo);
    raiz.style.setProperty('--fonte-subtitulo-cabecalho', configuracao.corFonteSubtitulo);
    raiz.style.setProperty('--cor-categorias', configuracao.corCategorias);
    raiz.style.setProperty('--cor-categoria-ativa', configuracao.corCategoriaAtiva);

    const cabecalho = document.querySelector('.main-header');
    if (cabecalho) {
        cabecalho.style.backgroundImage = configuracao.fundoCabecalho ? `url("${configuracao.fundoCabecalho}")` : 'none';
    }

    const tituloCabecalho = document.querySelector('.main-header h1');
    const subtituloCabecalho = document.querySelector('.main-header .header-text p');
    if (tituloCabecalho) tituloCabecalho.textContent = configuracao.tituloCabecalho;
    if (subtituloCabecalho) subtituloCabecalho.textContent = configuracao.subtituloCabecalho;

    document.querySelectorAll('.logo').forEach(logo => {
        logo.src = configuracao.logo;
    });
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = configuracao.logo;
}

function monitorarIdentidadeVisual() {
    aplicarIdentidadeVisual();
    if (typeof firebase === 'undefined') return;
    firebase.database().ref('configuracoes/visual').on('value', snapshot => {
        aplicarIdentidadeVisual(snapshot.val() || {});
    });
}
monitorarIdentidadeVisual();

// Dados do restaurante definidos no painel: WhatsApp, nome, horário e mensagem final
function monitorarDadosRestaurante() {
    if (typeof firebase === 'undefined') return;
    firebase.database().ref('configuracoes/restaurante').on('value', (snapshot) => {
        const dados = snapshot.val() || {};
        if (/^[0-9]{12,13}$/.test(dados.whatsapp || '')) NUMERO_WHATSAPP_LOJA = dados.whatsapp;
        if (dados.nome) NOME_RESTAURANTE = dados.nome;
        if (dados.mensagemWhatsapp) MENSAGEM_FINAL_PEDIDO = dados.mensagemWhatsapp;
        const horario = document.getElementById('horario-funcionamento');
        if (horario) {
            horario.textContent = dados.horario ? `🕒 ${dados.horario}` : '';
            horario.hidden = !dados.horario;
        }
    });
}
monitorarDadosRestaurante();

// ==========================================================================
// 4. PAINEL ADMINISTRATIVO (Firebase Authentication)
// --------------------------------------------------------------------------
// O login é feito com e-mail e senha do Firebase Authentication.
// Além de estar logada, a conta precisa estar em /admins/{uid} = true.
// As regras do banco (database.rules.json) bloqueiam qualquer gravação
// de quem não é admin, mesmo que alguém abra o painel pelo console.
// ==========================================================================

let adminAutorizado = false;
let refPedidosAdmin = null;
let pedidosAdmin = [];

// Mensagem padrão quando uma gravação é recusada
function erroGravacao(err) {
    console.error('Erro ao gravar no Firebase:', err);
    const semPermissao = err && /permission|PERMISSION_DENIED/i.test(String(err.code || err.message || err));
    alert(semPermissao
        ? 'Sem permissão para salvar. Entre no painel com a conta de administrador.'
        : 'Não foi possível salvar agora. Verifique sua internet e tente novamente.');
}

function traduzirErroAuth(codigo) {
    switch (codigo) {
        case 'auth/invalid-email':
            return 'E-mail inválido.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
            return 'E-mail ou senha incorretos.';
        case 'auth/too-many-requests':
            return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
        case 'auth/network-request-failed':
            return 'Sem conexão com a internet.';
        case 'auth/user-disabled':
            return 'Esta conta foi desativada.';
        case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
        case 'auth/invalid-api-key':
            return 'A apiKey do Firebase no index.html está incompleta ou errada.';
        default:
            return 'Não foi possível entrar. Tente novamente.';
    }
}

function mostrarErroLogin(mensagem) {
    const caixa = document.getElementById('admin-login-erro');
    if (!caixa) return;
    caixa.innerHTML = mensagem;
    caixa.style.display = mensagem ? 'block' : 'none';
}

window.abrirModalAdmin = function() {
    const modal = document.getElementById('modal-admin');
    if (modal) modal.style.display = 'flex';
};

document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'a' || event.key === 'A')) {
        abrirModalAdmin();
    }
});

// Login (mantém o nome antigo da função, usado pelo formulário)
window.verificarSenha = async function () {
    const email = document.getElementById('email-admin').value.trim();
    const senha = document.getElementById('senha-admin').value;
    const botao = document.getElementById('btn-entrar-admin');

    if (!email || !senha) {
        mostrarErroLogin('Digite o e-mail e a senha.');
        return;
    }
    if (!firebaseDisponivel() || !firebase.auth) {
        mostrarErroLogin('Firebase Authentication não carregou. Verifique a internet e o index.html.');
        return;
    }

    mostrarErroLogin('');
    if (botao) { botao.disabled = true; botao.textContent = 'Entrando...'; }
    try {
        await firebase.auth().signInWithEmailAndPassword(email, senha);
        document.getElementById('senha-admin').value = '';
    } catch (err) {
        mostrarErroLogin(traduzirErroAuth(err && err.code));
    } finally {
        if (botao) { botao.disabled = false; botao.textContent = 'Entrar'; }
    }
};

window.sairAdmin = function () {
    if (firebaseDisponivel() && firebase.auth) firebase.auth().signOut();
};

function mostrarPainelAdmin(logado, email = '') {
    document.getElementById('admin-login').style.display = logado ? 'none' : 'block';
    document.getElementById('admin-controles').style.display = logado ? 'block' : 'none';
    const emailEl = document.getElementById('admin-email-logado');
    if (emailEl) emailEl.textContent = email;
}

// Acompanha o login: só libera o painel para contas cadastradas em /admins
function iniciarAutenticacaoAdmin() {
    if (!firebaseDisponivel() || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(async (usuario) => {
        if (!usuario) {
            adminAutorizado = false;
            pararPedidosAdmin();
            mostrarPainelAdmin(false);
            return;
        }

        let ehAdmin = false;
        try {
            const snap = await firebase.database().ref(`admins/${usuario.uid}`).once('value');
            ehAdmin = snap.val() === true;
        } catch (err) {
            console.warn('Não foi possível verificar o acesso de admin:', err);
        }

        if (!ehAdmin) {
            adminAutorizado = false;
            mostrarPainelAdmin(false);
            mostrarErroLogin(`Esta conta ainda não tem acesso ao painel.<br>No console do Firebase, crie em <strong>admins</strong> a chave <code>${esc(usuario.uid)}</code> com o valor <strong>true</strong>.`);
            firebase.auth().signOut();
            return;
        }

        adminAutorizado = true;
        mostrarErroLogin('');
        mostrarPainelAdmin(true, usuario.email || '');
        await inicializarDadosPadraoSeNecessario();
        carregarListaAdmin();
        carregarListaAdicionaisAdmin();
        carregarIdentidadeVisualAdmin();
        atualizarSelectCategoriaProduto();
        renderizarCategoriasAdmin();
        carregarConfigEntregaAdmin();
        renderizarBairrosAdmin();
        assinarPedidosAdmin();
    });
}
iniciarAutenticacaoAdmin();

window.alternarTabAdmin = function (tabNome, btnEl) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('ativo'));
    if (btnEl) btnEl.classList.add('ativo');

    document.querySelectorAll('.tab-conteudo').forEach(c => c.style.display = 'none');
    const target = document.getElementById(`tab-conteudo-${tabNome}`);
    if (target) target.style.display = 'block';
};

window.alternarLoja = function (status) {
    if (typeof firebase !== 'undefined') {
        firebase.database().ref('configuracoes/statusLoja').set(status)
            .then(() => {
                alert(status ? "Loja Aberta! ✅" : "Loja Fechada! 🔒");
            })
            .catch(erroGravacao);
    }
};

window.atualizarCodigoCor = function (idCampo, valor) {
    const codigo = document.getElementById(`codigo-${idCampo}`);
    if (codigo) codigo.value = valor.toUpperCase();
};

window.aplicarCodigoCor = function (idCampo, valor) {
    const valorNormalizado = valor.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(valorNormalizado)) {
        atualizarCodigoCor(idCampo, document.getElementById(idCampo).value);
        return;
    }
    document.getElementById(idCampo).value = valorNormalizado;
    atualizarCodigoCor(idCampo, valorNormalizado);
};

// Utilitário para redimensionar e comprimir imagens no cliente (HTML5 Canvas)
function comprimirImagemCliente(file, maxLargura = 500, maxAltura = 500, qualidade = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let largura = img.width;
                let altura = img.height;

                if (largura > altura) {
                    if (largura > maxLargura) {
                        altura = Math.round((altura * maxLargura) / largura);
                        largura = maxLargura;
                    }
                } else {
                    if (altura > maxAltura) {
                        largura = Math.round((largura * maxAltura) / altura);
                        altura = maxAltura;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = largura;
                canvas.height = altura;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, largura, altura);

                // Converter para JPEG otimizado
                const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
                resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

window.converterLogoParaBase64 = async function (input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const logo = await comprimirImagemCliente(file, 400, 400, 0.82);
        document.getElementById('logo-empresa-base64').value = logo;
        const preview = document.getElementById('preview-logo');
        if (preview) preview.src = logo;
    } catch (err) {
        console.error('Erro ao processar logo:', err);
    }
};

window.converterFundoCabecalhoParaBase64 = async function (input) {
    const file = input.files[0];
    if (!file) return;

    try {
        const imagem = await comprimirImagemCliente(file, 800, 400, 0.75);
        document.getElementById('fundo-cabecalho-base64').value = imagem;
        const preview = document.getElementById('preview-fundo-cabecalho');
        if (preview) {
            preview.src = imagem;
            preview.style.display = 'block';
        }
    } catch (err) {
        console.error('Erro ao processar imagem de fundo:', err);
    }
};

window.salvarIdentidadeVisual = function () {
    if (typeof firebase === 'undefined') return;

    const identidade = {
        logo: document.getElementById('logo-empresa-base64').value || IDENTIDADE_VISUAL_PADRAO.logo,
        corPrincipal: document.getElementById('cor-principal').value,
        corEscura: document.getElementById('cor-escura').value,
        corDestaque: document.getElementById('cor-destaque').value,
        corFundo: document.getElementById('cor-fundo').value,
        corFonteTitulo: document.getElementById('cor-fonte-titulo').value,
        corFonteSubtitulo: document.getElementById('cor-fonte-subtitulo').value,
        corCategorias: document.getElementById('cor-categorias').value,
        corCategoriaAtiva: document.getElementById('cor-categoria-ativa').value,
        fundoCabecalho: document.getElementById('fundo-cabecalho-base64').value || IDENTIDADE_VISUAL_PADRAO.fundoCabecalho,
        tituloCabecalho: document.getElementById('titulo-cabecalho').value.trim() || IDENTIDADE_VISUAL_PADRAO.tituloCabecalho,
        subtituloCabecalho: document.getElementById('subtitulo-cabecalho').value.trim() || IDENTIDADE_VISUAL_PADRAO.subtituloCabecalho
    };

    firebase.database().ref('configuracoes/visual').set(identidade).then(() => {
        aplicarIdentidadeVisual(identidade);
        alert('Identidade visual salva com sucesso!');
    }).catch(erroGravacao);
};

function carregarIdentidadeVisualAdmin() {
    if (typeof firebase === 'undefined') return;
    firebase.database().ref('configuracoes/visual').once('value', snapshot => {
        const identidade = { ...IDENTIDADE_VISUAL_PADRAO, ...(snapshot.val() || {}) };
        document.getElementById('logo-empresa-base64').value = identidade.logo;
        document.getElementById('preview-logo').src = identidade.logo;
        document.getElementById('fundo-cabecalho-base64').value = identidade.fundoCabecalho;
        document.getElementById('titulo-cabecalho').value = identidade.tituloCabecalho;
        document.getElementById('subtitulo-cabecalho').value = identidade.subtituloCabecalho;
        const previewFundoCabecalho = document.getElementById('preview-fundo-cabecalho');
        if (previewFundoCabecalho && identidade.fundoCabecalho) {
            previewFundoCabecalho.src = identidade.fundoCabecalho;
            previewFundoCabecalho.style.display = 'block';
        }
        document.getElementById('cor-principal').value = identidade.corPrincipal;
        document.getElementById('cor-escura').value = identidade.corEscura;
        document.getElementById('cor-destaque').value = identidade.corDestaque;
        document.getElementById('cor-fundo').value = identidade.corFundo;
        document.getElementById('cor-fonte-titulo').value = identidade.corFonteTitulo;
        document.getElementById('cor-fonte-subtitulo').value = identidade.corFonteSubtitulo;
        document.getElementById('cor-categorias').value = identidade.corCategorias;
        document.getElementById('cor-categoria-ativa').value = identidade.corCategoriaAtiva;
        atualizarCodigoCor('cor-principal', identidade.corPrincipal);
        atualizarCodigoCor('cor-escura', identidade.corEscura);
        atualizarCodigoCor('cor-destaque', identidade.corDestaque);
        atualizarCodigoCor('cor-fundo', identidade.corFundo);
        atualizarCodigoCor('cor-fonte-titulo', identidade.corFonteTitulo);
        atualizarCodigoCor('cor-fonte-subtitulo', identidade.corFonteSubtitulo);
        atualizarCodigoCor('cor-categorias', identidade.corCategorias);
        atualizarCodigoCor('cor-categoria-ativa', identidade.corCategoriaAtiva);
    });
}

window.alternarDestaqueProduto = function (id, status) {
    if (typeof firebase === 'undefined') return;
    firebase.database().ref(`produtos/${id}/destaque`).set(status).then(() => {
        carregarListaAdmin();
    }).catch(erroGravacao);
};

window.salvarAdicionalFirebase = function () {
    const nome = document.getElementById('add-nome').value.trim();
    const preco = parseFloat(document.getElementById('add-preco').value) || 0;

    if (!nome || preco <= 0) {
        alert("Preencha o nome e um preço válido para o adicional!");
        return;
    }

    const id = firebase.database().ref('adicionais').push().key;
    firebase.database().ref(`adicionais/${id}`).set({ nome, preco }).then(() => {
        alert("Adicional salvo com sucesso!");
        document.getElementById('add-nome').value = '';
        document.getElementById('add-preco').value = '';
        carregarListaAdicionaisAdmin();
    }).catch(erroGravacao);
};

window.excluirAdicionalFirebase = function (id) {
    if (confirm("Deseja realmente excluir este adicional?")) {
        firebase.database().ref(`adicionais/${id}`).remove().then(() => {
            alert("Adicional excluído!");
            carregarListaAdicionaisAdmin();
        }).catch(erroGravacao);
    }
};

function carregarListaAdicionaisAdmin() {
    const container = document.getElementById('lista-adicionais-admin');
    if (!container) return;

    firebase.database().ref('adicionais').once('value', (snapshot) => {
        const dados = snapshot.val();
        container.innerHTML = '';
        if (!dados) {
            container.innerHTML = '<p style="font-size:0.85rem; color:#666;">Nenhum adicional cadastrado.</p>';
            return;
        }

        Object.keys(dados).forEach(id => {
            const add = dados[id];
            container.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #ddd; font-size:0.9rem;">
                    <span><strong>${esc(add.nome)}</strong> (+R$ ${parseFloat(add.preco).toFixed(2).replace('.', ',')})</span>
                    <button onclick="excluirAdicionalFirebase('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">Excluir</button>
                </div>
            `;
        });
    });
}

window.converterImagemParaBase64 = async function (input) {
    const file = input.files[0];
    if (file) {
        try {
            // Comprime a foto do produto antes de salvar no banco (max 500x500px, 75% qualidade)
            const base64Otimizado = await comprimirImagemCliente(file, 500, 500, 0.75);
            document.getElementById('prod-foto').value = base64Otimizado;
            const preview = document.getElementById('preview-foto');
            if (preview) {
                preview.src = base64Otimizado;
                preview.style.display = 'block';
            }
        } catch (err) {
            console.error('Erro ao comprimir imagem do produto:', err);
            // Fallback para FileReader padrão caso dê algum erro
            const reader = new FileReader();
            reader.onload = function (e) {
                const base64String = e.target.result;
                document.getElementById('prod-foto').value = base64String;
                const preview = document.getElementById('preview-foto');
                if (preview) {
                    preview.src = base64String;
                    preview.style.display = 'block';
                }
            };
            reader.readAsDataURL(file);
        }
    }
};

window.salvarProdutoFirebase = function () {
    const id = document.getElementById('prod-id').value || firebase.database().ref('produtos').push().key;
    const nome = document.getElementById('prod-nome').value.trim();
    const descricao = document.getElementById('prod-desc').value.trim();
    const foto = document.getElementById('prod-foto').value;
    const categoria = document.getElementById('prod-categoria').value;
    const qtdSabores = parseInt(document.getElementById('prod-qtd-sabores').value) || 2;
    const precoM = parseFloat(document.getElementById('prod-preco-m').value) || 0;
    const precoG = parseFloat(document.getElementById('prod-preco-g').value) || precoM;

    if (!nome || !foto || !precoM) {
        alert("Preencha o nome, selecione uma foto e informe o preço principal!");
        return;
    }

    if (!categoria || !categoriasCardapio[categoria]) {
        alert("Escolha uma categoria para o produto (crie uma na aba Categorias, se precisar).");
        return;
    }

    const produtoData = { nome, descricao, foto, categoria, qtdSabores, precoM, precoG };

    firebase.database().ref(`produtos/${id}`).update(produtoData).then(() => {
        alert("Produto salvo com sucesso!");
        limparFormularioProduto();
        carregarListaAdmin();
    }).catch(erroGravacao);
};

function carregarListaAdmin() {
    const listaAdmin = document.getElementById('lista-produtos-admin');
    if (!listaAdmin) return;

    firebase.database().ref('produtos').once('value', (snapshot) => {
        const dados = snapshot.val();
        listaAdmin.innerHTML = '';
        if (!dados) return;

        Object.keys(dados).forEach(id => {
            const p = dados[id];
            const btnDestaque = p.destaque
                ? `<button onclick="alternarDestaqueProduto('${id}', false)" style="background:#7f8c8d; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">❌ Tirar Destaque</button>`
                : `<button onclick="alternarDestaqueProduto('${id}', true)" style="background:#f1c40f; color:black; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:bold;">⭐ Destacar</button>`;

            const categoria = categoriasCardapio[p.categoria];
            const rotuloCategoria = categoria
                ? esc(`${categoria.icone ? categoria.icone + ' ' : ''}${categoria.nome}`)
                : '<span style="color:#e74c3c;">⚠️ sem categoria (oculto)</span>';
            listaAdmin.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ddd; gap: 6px; flex-wrap: wrap;">
                    <span><strong>${esc(p.nome)}</strong> (${rotuloCategoria})</span>
                    <div style="display: flex; gap: 4px;">
                        ${btnDestaque}
                        <button onclick="preencherEdicaoPorId('${id}')" style="background:#f39c12; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">Editar</button>
                        <button onclick="excluirProduto('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">Excluir</button>
                    </div>
                </div>
            `;
        });
    });
}

window.preencherEdicao = function (id, nome, desc, foto, categoria, precoM, precoG, qtdSabores = 2) {
    document.getElementById('prod-id').value = id;
    document.getElementById('prod-nome').value = nome;
    document.getElementById('prod-desc').value = desc;
    document.getElementById('prod-foto').value = foto;
    document.getElementById('prod-categoria').value = categoria;
    document.getElementById('prod-qtd-sabores').value = qtdSabores || 2;
    document.getElementById('prod-preco-m').value = precoM;
    document.getElementById('prod-preco-g').value = precoG;

    const preview = document.getElementById('preview-foto');
    if (foto && preview) {
        preview.src = foto;
        preview.style.display = 'block';
    }

    if (!categoriasCardapio[categoria]) {
        alert('A categoria deste produto foi excluída. Escolha uma nova categoria antes de salvar.');
        document.getElementById('prod-categoria').value = '';
    }
    atualizarCamposProdutoPorCategoria();
    const btnCancelar = document.getElementById('btn-cancelar-produto');
    if (btnCancelar) btnCancelar.style.display = 'inline-flex';
    document.getElementById('form-produto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Abre a edição lendo o produto do banco (evita colocar a foto inteira dentro do botão)
window.preencherEdicaoPorId = function (id) {
    firebase.database().ref(`produtos/${id}`).once('value', (snapshot) => {
        const p = snapshot.val();
        if (!p) return;
        preencherEdicao(id, p.nome || '', p.descricao || '', p.foto || '', p.categoria || '', p.precoM, p.precoG, p.qtdSabores || 2);
    });
};

window.excluirProduto = function (id) {
    if (confirm("Deseja realmente excluir este produto?")) {
        firebase.database().ref(`produtos/${id}`).remove().then(() => {
            alert("Produto excluído!");
            carregarListaAdmin();
        }).catch(erroGravacao);
    }
};

function limparFormularioProduto() {
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-nome').value = '';
    document.getElementById('prod-desc').value = '';
    document.getElementById('prod-foto').value = '';
    document.getElementById('prod-file-input').value = '';
    document.getElementById('prod-qtd-sabores').value = '2';
    document.getElementById('prod-preco-m').value = '';
    document.getElementById('prod-preco-g').value = '';
    const preview = document.getElementById('preview-foto');
    if (preview) preview.style.display = 'none';
    const btnCancelar = document.getElementById('btn-cancelar-produto');
    if (btnCancelar) btnCancelar.style.display = 'none';
    atualizarCamposProdutoPorCategoria();
}
window.limparFormularioProduto = limparFormularioProduto;
// --------------------------------------------------------------------------
// Configuração inicial: no primeiro login, grava no Firebase as 3 categorias,
// os bairros e a taxa que estavam fixos no site antes.
// --------------------------------------------------------------------------
async function inicializarDadosPadraoSeNecessario() {
    try {
        const db = firebase.database();
        const iniciado = (await db.ref('configuracoes/inicializado').once('value')).val();
        if (iniciado === true) return;

        const [catSnap, bairroSnap, entregaSnap] = await Promise.all([
            db.ref('categorias').once('value'),
            db.ref('bairros').once('value'),
            db.ref('configuracoes/entrega').once('value')
        ]);

        const atualizacoes = { 'configuracoes/inicializado': true };
        if (!catSnap.exists()) atualizacoes['categorias'] = CATEGORIAS_PADRAO;
        if (!bairroSnap.exists()) atualizacoes['bairros'] = BAIRROS_PADRAO;
        if (!entregaSnap.exists()) atualizacoes['configuracoes/entrega'] = CONFIG_ENTREGA_PADRAO;
        await db.ref().update(atualizacoes);
    } catch (err) {
        console.warn('Não foi possível criar a configuração inicial:', err);
    }
}

// Chamado pelo cardápio quando /categorias ou a entrega mudam no Firebase
function aoAtualizarCategoriasAdmin() {
    if (!adminAutorizado) return;
    renderizarCategoriasAdmin();
    atualizarSelectCategoriaProduto();
    carregarListaAdmin();
}

function aoAtualizarEntregaAdmin() {
    if (!adminAutorizado) return;
    renderizarBairrosAdmin();
}

// --------------------------------------------------------------------------
// Categorias: criar, renomear, reordenar e excluir
// --------------------------------------------------------------------------

function contarProdutosDaCategoria(categoriaId) {
    return Object.values(dadosProdutos || {}).filter(p => p && p.categoria === categoriaId).length;
}

function atualizarSelectCategoriaProduto() {
    const seletor = document.getElementById('prod-categoria');
    if (!seletor) return;
    const anterior = seletor.value;
    seletor.innerHTML = '<option value="" disabled>Escolha a categoria...</option>' + categoriasOrdenadas().map(([id, cat]) =>
        `<option value="${esc(id)}">${esc(`${cat.icone ? cat.icone + ' ' : ''}${cat.nome}`)} — ${esc(TIPOS_CATEGORIA[tipoDaCategoria(id)])}</option>`
    ).join('');
    if (anterior && categoriasCardapio[anterior]) seletor.value = anterior;
    else if (!document.getElementById('prod-id').value) seletor.selectedIndex = categoriasOrdenadas().length ? 1 : 0;
    atualizarCamposProdutoPorCategoria();
}

// Mostra só os campos que fazem sentido para o tipo da categoria escolhida
window.atualizarCamposProdutoPorCategoria = function () {
    const seletor = document.getElementById('prod-categoria');
    const tipo = seletor && seletor.value ? tipoDaCategoria(seletor.value) : 'simples';
    const campoSabores = document.getElementById('prod-qtd-sabores');
    const campoPrecoG = document.getElementById('prod-preco-g');
    const campoPrecoM = document.getElementById('prod-preco-m');
    if (campoSabores) campoSabores.style.display = tipo === 'combos' ? '' : 'none';
    if (campoPrecoG) campoPrecoG.style.display = tipo === 'batatas' ? '' : 'none';
    if (campoPrecoM) campoPrecoM.placeholder = tipo === 'batatas' ? 'Preço M' : 'Preço';
};

function renderizarCategoriasAdmin() {
    const container = document.getElementById('lista-categorias-admin');
    if (!container) return;
    const lista = categoriasOrdenadas();
    if (lista.length === 0) {
        container.innerHTML = '<p class="admin-vazio">Nenhuma categoria cadastrada.</p>';
        return;
    }
    container.innerHTML = lista.map(([id, cat], indice) => {
        const qtd = contarProdutosDaCategoria(id);
        return `
            <div class="admin-item-linha">
                <div class="admin-item-info">
                    <strong>${esc(`${cat.icone ? cat.icone + ' ' : ''}${cat.nome}`)}</strong>
                    <span>${esc(TIPOS_CATEGORIA[tipoDaCategoria(id)])} • ${qtd} produto${qtd !== 1 ? 's' : ''}</span>
                </div>
                <div class="admin-item-acoes">
                    <button type="button" class="btn-admin-mini" onclick="moverCategoria('${esc(id)}', -1)" ${indice === 0 ? 'disabled' : ''} aria-label="Subir">▲</button>
                    <button type="button" class="btn-admin-mini" onclick="moverCategoria('${esc(id)}', 1)" ${indice === lista.length - 1 ? 'disabled' : ''} aria-label="Descer">▼</button>
                    <button type="button" class="btn-admin-mini editar" onclick="editarCategoria('${esc(id)}')">Editar</button>
                    <button type="button" class="btn-admin-mini excluir" onclick="excluirCategoria('${esc(id)}')">Excluir</button>
                </div>
            </div>
        `;
    }).join('');
}

window.limparFormularioCategoria = function () {
    ['cat-id', 'cat-icone', 'cat-nome', 'cat-titulo'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('cat-tipo').value = 'simples';
    document.getElementById('btn-salvar-categoria').textContent = 'Salvar Categoria';
    document.getElementById('btn-cancelar-categoria').style.display = 'none';
};

window.editarCategoria = function (id) {
    const cat = categoriasCardapio[id];
    if (!cat) return;
    document.getElementById('cat-id').value = id;
    document.getElementById('cat-icone').value = cat.icone || '';
    document.getElementById('cat-nome').value = cat.nome || '';
    document.getElementById('cat-titulo').value = cat.titulo || '';
    document.getElementById('cat-tipo').value = tipoDaCategoria(id);
    document.getElementById('btn-salvar-categoria').textContent = 'Salvar Alterações';
    document.getElementById('btn-cancelar-categoria').style.display = 'inline-flex';
    document.getElementById('cat-nome').focus();
};

window.salvarCategoriaFirebase = function () {
    const id = document.getElementById('cat-id').value;
    const nome = document.getElementById('cat-nome').value.trim();
    const titulo = document.getElementById('cat-titulo').value.trim();
    const icone = document.getElementById('cat-icone').value.trim();
    const tipo = document.getElementById('cat-tipo').value;

    if (!nome) {
        alert('Digite o nome da categoria.');
        return;
    }
    const repetida = categoriasOrdenadas().find(([outroId, c]) => outroId !== id && c.nome.trim().toLowerCase() === nome.toLowerCase());
    if (repetida) {
        alert('Já existe uma categoria com esse nome.');
        return;
    }

    const dados = { nome, titulo, icone, tipo };
    let promessa;
    if (id) {
        promessa = firebase.database().ref(`categorias/${id}`).update(dados);
    } else {
        const maiorOrdem = categoriasOrdenadas().reduce((max, [, c]) => Math.max(max, c.ordem || 0), 0);
        promessa = firebase.database().ref('categorias').push({ ...dados, ordem: maiorOrdem + 1 });
    }
    promessa.then(() => {
        mostrarToast(id ? 'Categoria atualizada!' : 'Categoria criada!');
        limparFormularioCategoria();
    }).catch(erroGravacao);
};

// Troca a categoria de lugar com a vizinha e regrava a ordem de todas (1, 2, 3...)
window.moverCategoria = function (id, direcao) {
    const ids = categoriasOrdenadas().map(([catId]) => catId);
    const posicao = ids.indexOf(id);
    const destino = posicao + direcao;
    if (posicao < 0 || destino < 0 || destino >= ids.length) return;
    [ids[posicao], ids[destino]] = [ids[destino], ids[posicao]];

    const atualizacoes = {};
    ids.forEach((catId, indice) => { atualizacoes[`categorias/${catId}/ordem`] = indice + 1; });
    firebase.database().ref().update(atualizacoes).catch(erroGravacao);
};

window.excluirCategoria = function (id) {
    const cat = categoriasCardapio[id];
    if (!cat) return;
    if (categoriasOrdenadas().length <= 1) {
        alert('O cardápio precisa ter pelo menos uma categoria.');
        return;
    }
    const qtd = contarProdutosDaCategoria(id);
    const mensagem = qtd > 0
        ? `A categoria "${cat.nome}" tem ${qtd} produto${qtd !== 1 ? 's' : ''}.\n\nSe você excluir, ${qtd !== 1 ? 'esses produtos ficam ocultos' : 'esse produto fica oculto'} no cardápio até você escolher outra categoria para ${qtd !== 1 ? 'eles' : 'ele'} (Produtos > Editar).\n\nDeseja excluir mesmo?`
        : `Deseja excluir a categoria "${cat.nome}"?`;
    if (!confirm(mensagem)) return;
    firebase.database().ref(`categorias/${id}`).remove()
        .then(() => mostrarToast('Categoria excluída.'))
        .catch(erroGravacao);
};

// --------------------------------------------------------------------------
// Entrega: ligar/desligar taxa, taxa única ou por bairro, bairros
// --------------------------------------------------------------------------

let modoTaxaEdicao = 'bairro';

function carregarConfigEntregaAdmin() {
    document.getElementById('entrega-cobrar-taxa').checked = !!configEntrega.cobrarTaxa;
    document.getElementById('entrega-taxa-unica').value = configEntrega.taxaUnica || '';
    selecionarModoTaxa(configEntrega.modo === 'unica' ? 'unica' : 'bairro');
    atualizarFormularioEntregaAdmin();
}

window.selecionarModoTaxa = function (modo) {
    modoTaxaEdicao = modo;
    document.getElementById('entrega-modo-unica').classList.toggle('ativo', modo === 'unica');
    document.getElementById('entrega-modo-bairro').classList.toggle('ativo', modo === 'bairro');
    document.getElementById('entrega-campo-taxa-unica').style.display = modo === 'unica' ? 'block' : 'none';
};

window.atualizarFormularioEntregaAdmin = function () {
    const cobrar = document.getElementById('entrega-cobrar-taxa').checked;
    document.getElementById('entrega-opcoes-taxa').style.display = cobrar ? 'block' : 'none';
};

window.salvarConfigEntrega = function () {
    const cobrarTaxa = document.getElementById('entrega-cobrar-taxa').checked;
    const textoTaxa = document.getElementById('entrega-taxa-unica').value;
    const taxaUnica = parseFloat(String(textoTaxa).replace(',', '.')) || 0;
    if (taxaUnica < 0) {
        alert('A taxa não pode ser negativa.');
        return;
    }
    const config = { cobrarTaxa, modo: modoTaxaEdicao, taxaUnica: Number(taxaUnica.toFixed(2)) };
    firebase.database().ref('configuracoes/entrega').set(config)
        .then(() => mostrarToast('Configuração de entrega salva!'))
        .catch(erroGravacao);
};

function renderizarBairrosAdmin() {
    const container = document.getElementById('lista-bairros-admin');
    const dica = document.getElementById('entrega-dica-bairros');
    if (!container) return;

    if (dica) {
        dica.textContent = !configEntrega.cobrarTaxa
            ? 'A taxa está desligada: todos os bairros têm entrega grátis. A lista continua aparecendo para o cliente escolher o bairro.'
            : configEntrega.modo === 'unica'
                ? `Taxa única ligada (${formatarPreco(configEntrega.taxaUnica)} para todos). Os valores abaixo só valem no modo "Taxa por bairro".`
                : 'O cliente escolhe o bairro numa lista no checkout. Use R$ 0,00 para entrega grátis.';
    }

    const lista = bairrosOrdenados();
    if (lista.length === 0) {
        container.innerHTML = '<p class="admin-vazio">Nenhum bairro cadastrado. O cliente vai digitar o bairro no checkout.</p>';
        return;
    }
    container.innerHTML = lista.map(([id, b]) => {
        const taxa = parseFloat(b.taxa) || 0;
        return `
            <div class="admin-item-linha">
                <div class="admin-item-info">
                    <strong>${esc(b.nome)}</strong>
                    <span>${taxa === 0 ? '✅ Entrega grátis' : formatarPreco(taxa)}</span>
                </div>
                <div class="admin-item-acoes">
                    <button type="button" class="btn-admin-mini editar" onclick="editarBairro('${esc(id)}')">Editar</button>
                    <button type="button" class="btn-admin-mini excluir" onclick="excluirBairro('${esc(id)}')">Remover</button>
                </div>
            </div>
        `;
    }).join('');
}

window.limparFormularioBairro = function () {
    document.getElementById('bairro-id-edicao').value = '';
    document.getElementById('bairro-nome-admin').value = '';
    document.getElementById('bairro-taxa-admin').value = '';
    document.getElementById('btn-salvar-bairro').textContent = 'Adicionar Bairro';
    document.getElementById('btn-cancelar-bairro').style.display = 'none';
};

window.editarBairro = function (id) {
    const b = bairrosEntrega[id];
    if (!b) return;
    document.getElementById('bairro-id-edicao').value = id;
    document.getElementById('bairro-nome-admin').value = b.nome || '';
    document.getElementById('bairro-taxa-admin').value = parseFloat(b.taxa) || 0;
    document.getElementById('btn-salvar-bairro').textContent = 'Salvar Alterações';
    document.getElementById('btn-cancelar-bairro').style.display = 'inline-flex';
    document.getElementById('bairro-nome-admin').focus();
};

window.salvarBairroFirebase = function () {
    const id = document.getElementById('bairro-id-edicao').value;
    const nome = document.getElementById('bairro-nome-admin').value.trim();
    const textoTaxa = document.getElementById('bairro-taxa-admin').value;
    const taxa = textoTaxa === '' ? 0 : parseFloat(String(textoTaxa).replace(',', '.'));

    if (!nome) {
        alert('Digite o nome do bairro.');
        return;
    }
    if (isNaN(taxa) || taxa < 0) {
        alert('Digite uma taxa válida (use 0 para entrega grátis).');
        return;
    }
    const repetido = bairrosOrdenados().find(([outroId, b]) => outroId !== id && b.nome.trim().toLowerCase() === nome.toLowerCase());
    if (repetido) {
        alert('Esse bairro já está cadastrado.');
        return;
    }

    const dados = { nome, taxa: Number(taxa.toFixed(2)) };
    const promessa = id
        ? firebase.database().ref(`bairros/${id}`).set(dados)
        : firebase.database().ref('bairros').push(dados);

    // Se a entrega nunca foi configurada, grava a configuração atual junto
    // (assim a lista antiga de bairros deixa de ser usada como reserva)
    const garantirConfig = configEntregaBruta === null
        ? firebase.database().ref('configuracoes/entrega').set({ ...configEntrega })
        : Promise.resolve();

    Promise.all([promessa, garantirConfig]).then(() => {
        mostrarToast(id ? 'Bairro atualizado!' : 'Bairro adicionado!');
        limparFormularioBairro();
    }).catch(erroGravacao);
};

window.excluirBairro = function (id) {
    const b = bairrosEntrega[id];
    if (!b) return;
    if (!confirm(`Remover o bairro "${b.nome}"?`)) return;
    firebase.database().ref(`bairros/${id}`).remove()
        .then(() => mostrarToast('Bairro removido.'))
        .catch(erroGravacao);
};

// --------------------------------------------------------------------------
// Pedidos: lista em tempo real e mudança de status
// --------------------------------------------------------------------------

function assinarPedidosAdmin() {
    pararPedidosAdmin();
    refPedidosAdmin = firebase.database().ref('pedidos').orderByChild('criadoEm').limitToLast(200);
    refPedidosAdmin.on('value', (snapshot) => {
        const lista = [];
        snapshot.forEach(filho => {
            lista.push({ id: filho.key, ...filho.val() });
        });
        // Mais recente primeiro
        pedidosAdmin = lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
        renderizarPedidosAdmin();
    }, (err) => {
        console.error('Erro ao carregar pedidos:', err);
        const container = document.getElementById('lista-pedidos-admin');
        if (container) container.innerHTML = '<p class="admin-vazio">Não foi possível carregar os pedidos (verifique as regras do Firebase).</p>';
    });
}

function pararPedidosAdmin() {
    if (refPedidosAdmin) refPedidosAdmin.off();
    refPedidosAdmin = null;
    pedidosAdmin = [];
}

window.renderizarPedidosAdmin = function () {
    const container = document.getElementById('lista-pedidos-admin');
    const filtro = document.getElementById('filtro-status-pedidos')?.value || 'ativos';
    const badge = document.getElementById('badge-pedidos-novos');
    if (!container) return;

    const novos = pedidosAdmin.filter(p => p.status === 'Novo').length;
    if (badge) {
        badge.textContent = novos;
        badge.style.display = novos > 0 ? 'inline-flex' : 'none';
    }

    const filtrados = pedidosAdmin.filter(p => {
        if (filtro === 'todos') return true;
        if (filtro === 'ativos') return STATUS_ATIVOS.includes(p.status);
        return p.status === filtro;
    });

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="admin-vazio">Nenhum pedido aqui.</p>';
        return;
    }

    container.innerHTML = filtrados.map(p => {
        const c = p.cliente || {};
        const itens = Array.isArray(p.itens) ? p.itens : Object.values(p.itens || {});
        const itensHtml = itens.map(i => {
            const adicionais = Array.isArray(i.adicionais) ? i.adicionais : Object.values(i.adicionais || {});
            return `
                <li>
                    <span><strong>${esc(i.qtd)}x</strong> ${esc(i.nome)}</span>
                    <span>${formatarPreco(i.subtotal)}</span>
                    ${adicionais.length ? `<small>+ ${esc(adicionais.map(a => a.nome).join(', '))}</small>` : ''}
                    ${i.observacao ? `<small>📝 ${esc(i.observacao)}</small>` : ''}
                </li>
            `;
        }).join('');
        const endereco = p.tipo === 'retirada'
            ? '🏬 Retirada no local'
            : `🛵 ${esc(c.endereco)}, Nº ${esc(c.numero)} — ${esc(c.bairro)}${c.referencia ? ` <small>(Ref: ${esc(c.referencia)})</small>` : ''}`;
        const opcoesStatus = STATUS_PEDIDO.map(st => `<option value="${esc(st)}" ${st === p.status ? 'selected' : ''}>${esc(st)}</option>`).join('');
        const telefone = somenteDigitos(c.telefone);
        const linkWhats = telefone ? `https://wa.me/${telefone.length <= 11 ? '55' + telefone : telefone}` : '';

        return `
            <div class="pedido-card ${classeStatus(p.status)}">
                <div class="pedido-card-topo">
                    <strong>Pedido #${esc(p.codigo || p.id.slice(-5))}</strong>
                    <span class="badge-status ${classeStatus(p.status)}">${esc(p.status)}</span>
                </div>
                <div class="pedido-card-data">${esc(formatarDataHora(p.criadoEm))}</div>
                <div class="pedido-card-cliente">
                    👤 <strong>${esc(c.nome)}</strong>
                    ${telefone ? `• <a href="${linkWhats}" target="_blank" rel="noopener">📱 ${esc(formatarTelefone(telefone))}</a>` : ''}
                </div>
                <div class="pedido-card-endereco">${endereco}</div>
                <ul class="pedido-card-itens">${itensHtml}</ul>
                <div class="pedido-card-totais">
                    <span>Itens: ${formatarPreco(p.subtotal)}</span>
                    <span>Taxa: ${p.taxa > 0 ? formatarPreco(p.taxa) : 'Grátis'}</span>
                    <span class="total">Total: ${formatarPreco(p.total)}</span>
                </div>
                <div class="pedido-card-pagamento">💳 ${esc(p.pagamento)}${p.troco ? ` (troco para: ${esc(p.troco)})` : ''}</div>
                <label class="pedido-card-status">
                    <span>Status:</span>
                    <select class="form-select" onchange="alterarStatusPedido('${esc(p.id)}', this.value)">${opcoesStatus}</select>
                </label>
            </div>
        `;
    }).join('');
};

// Atualiza o pedido completo e a cópia pública ao mesmo tempo
window.alterarStatusPedido = function (id, status) {
    if (!STATUS_PEDIDO.includes(status)) return;
    const agora = Date.now();
    firebase.database().ref().update({
        [`pedidos/${id}/status`]: status,
        [`pedidos/${id}/atualizadoEm`]: agora,
        [`pedidosStatus/${id}/status`]: status,
        [`pedidosStatus/${id}/atualizadoEm`]: agora
    }).then(() => mostrarToast(`Status alterado para "${status}".`))
      .catch(erroGravacao);
};
