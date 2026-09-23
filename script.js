document.addEventListener('DOMContentLoaded', () => {
    // Estado Global da Aplicação
    let totalItens = 0;
    let precoTotalProdutos = 0.0;
    let taxaEntregaAtual = 0.0;
    const carrinho = {};
    let listaAdicionais = {};
    let dadosProdutos = {};

    // Estado do Modal de Customização
    let prodCustomizando = null;
    let customTamanhoSelecionado = 'M';
    let customAdicionaisSelecionados = [];
    let customQtd = 1;

    // --- Monitoramento Firebase ---

    function monitorarAdicionais() {
        if (typeof firebase === 'undefined') return;
        firebase.database().ref('adicionais').on('value', (snapshot) => {
            listaAdicionais = snapshot.val() || {};
            carregarCardapio();
        });
    }

    function carregarCardapio() {
        if (typeof firebase === 'undefined') return;

        firebase.database().ref('produtos').on('value', (snapshot) => {
            dadosProdutos = snapshot.val() || {};
            renderizarListasCardapio(dadosProdutos);
        });
    }

    function renderizarListasCardapio(dados) {
        const listaDestaques = document.getElementById('lista-destaques');
        const listaBatatas = document.getElementById('lista-batatas');
        const listaCombos = document.getElementById('lista-combos');
        const listaBebidas = document.getElementById('lista-bebidas');

        if (listaDestaques) listaDestaques.innerHTML = '';
        if (listaBatatas) listaBatatas.innerHTML = '';
        if (listaCombos) listaCombos.innerHTML = '';
        if (listaBebidas) listaBebidas.innerHTML = '';

        if (!dados || Object.keys(dados).length === 0) {
            exibirEstadoVazioCardapio();
            return;
        }

        let qtdDestaques = 0;
        let qtdBatatas = 0;
        let qtdCombos = 0;
        let qtdBebidas = 0;

        Object.keys(dados).forEach((id) => {
            const produto = dados[id];
            produto.id = id;

            if (produto.destaque) {
                qtdDestaques++;
                if (listaDestaques) {
                    const cardDestaque = criarCardProduto(id, produto, true);
                    listaDestaques.appendChild(cardDestaque);
                }
            }

            const cardCategoria = criarCardProduto(id, produto, false);
            if (produto.categoria === 'batatas' && listaBatatas) {
                qtdBatatas++;
                listaBatatas.appendChild(cardCategoria);
            } else if (produto.categoria === 'combos' && listaCombos) {
                qtdCombos++;
                listaCombos.appendChild(cardCategoria);
            } else if (produto.categoria === 'bebidas' && listaBebidas) {
                qtdBebidas++;
                listaBebidas.appendChild(cardCategoria);
            }
        });

        // Atualizar contadores visuais nas seções
        const cntDestaques = document.getElementById('contador-destaques');
        const cntBatatas = document.getElementById('contador-batatas');
        const cntCombos = document.getElementById('contador-combos');
        const cntBebidas = document.getElementById('contador-bebidas');

        if (cntDestaques) cntDestaques.innerText = `${qtdDestaques} item${qtdDestaques !== 1 ? 's' : ''}`;
        if (cntBatatas) cntBatatas.innerText = `${qtdBatatas} item${qtdBatatas !== 1 ? 's' : ''}`;
        if (cntCombos) cntCombos.innerText = `${qtdCombos} item${qtdCombos !== 1 ? 's' : ''}`;
        if (cntBebidas) cntBebidas.innerText = `${qtdBebidas} item${qtdBebidas !== 1 ? 's' : ''}`;

        // Controle de visibilidade da seção de destaques
        const secDestaques = document.getElementById('destaques');
        const navDestaques = document.getElementById('link-nav-destaques');

        if (secDestaques && navDestaques) {
            if (qtdDestaques === 0) {
                secDestaques.style.display = 'none';
                navDestaques.style.display = 'none';
                if (navDestaques.classList.contains('active')) {
                    navDestaques.classList.remove('active');
                    const linkBatatas = document.querySelector('.menu-categorias a[href="#batatas"]');
                    if (linkBatatas) linkBatatas.classList.add('active');
                }
            } else {
                secDestaques.style.display = 'block';
                navDestaques.style.display = 'inline-flex';
            }
        }

        // Atualizar botões de rolagem dos carrosséis
        configurarBotoesCarrossel();
    }

    function exibirEstadoVazioCardapio() {
        const containers = ['lista-destaques', 'lista-batatas', 'lista-combos', 'lista-bebidas'];
        containers.forEach(cid => {
            const el = document.getElementById(cid);
            if (el) el.innerHTML = '<p style="color:#888; font-size:0.9rem; padding:15px;">Nenhum produto cadastrado nesta categoria.</p>';
        });
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

        if (produto.categoria === 'batatas') {
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
        } else if (produto.categoria === 'combos') {
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

        if (produto.categoria === 'batatas' && precoG > 0 && precoG !== precoM) {
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

        if (produto.categoria === 'batatas' && keysAdicionais.length > 0) {
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

        const nomeFormatado = prodCustomizando.categoria === 'batatas' && prodCustomizando.precoG
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

        firebase.database().ref('produtos').orderByChild('categoria').equalTo('batatas').once('value', (snapshot) => {
            const batatas = snapshot.val();
            if (!batatas) {
                opcoesContainer.innerHTML = '<p style="padding:15px; text-align:center;">Nenhum sabor de batata encontrado.</p>';
                return;
            }

            opcoesContainer.innerHTML = '';
            Object.values(batatas).forEach(batata => {
                const label = document.createElement('label');
                label.className = 'adicional-custom-item';
                label.style.marginBottom = '8px';

                label.innerHTML = `
                    <div class="adicional-custom-info" style="align-items: flex-start;">
                        <input type="checkbox" value="${batata.nome}" style="margin-top: 3px;">
                        <div>
                            <strong class="adicional-custom-nome" style="display:block;">${batata.nome}</strong>
                            <p style="font-size: 0.8rem; color: #666; margin-top: 2px;">${batata.descricao || ''}</p>
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
        });

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

    window.calcularFrete = () => {
        const seletor = document.getElementById('bairro');
        if (!seletor || seletor.value === "") return;

        taxaEntregaAtual = parseFloat(seletor.value) || 0;
        const bairroNome = seletor.options[seletor.selectedIndex].text;
        const divTaxa = document.getElementById('exibicao-taxa');
        const textoTaxa = document.getElementById('texto-taxa');
        const linhaFrete = document.getElementById('linha-resumo-frete');
        const valorFrete = document.getElementById('valor-resumo-frete');

        if (divTaxa) divTaxa.style.display = 'block';

        if (taxaEntregaAtual === 0) {
            if (textoTaxa) textoTaxa.innerHTML = `<strong>✅ Entrega Grátis</strong> para o bairro ${bairroNome}`;
            if (valorFrete) valorFrete.innerText = 'Grátis';
        } else {
            if (textoTaxa) textoTaxa.innerHTML = `<strong>🛵 Taxa de Entrega: R$ ${taxaEntregaAtual.toFixed(2).replace('.', ',')}</strong> (${bairroNome})`;
            if (valorFrete) valorFrete.innerText = `R$ ${taxaEntregaAtual.toFixed(2).replace('.', ',')}`;
        }

        atualizarTotalGeral();
    };

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
        if (totalItens === 0) {
            alert("Sua sacola está vazia!");
            return;
        }

        const tipoPedido = document.getElementById('retirada ou entrega')?.value || 'entrega';
        const nome = document.getElementById('nome-cliente')?.value.trim();
        const pagamento = document.getElementById('pagamento')?.value || 'Pix';
        const pontoReferencia = document.getElementById('ponto-referencia')?.value.trim() || '';
        const trocoPara = document.getElementById('troco-para')?.value.trim() || '';

        if (!nome) {
            alert("Por favor, digite o seu nome para identificação do pedido!");
            document.getElementById('nome-cliente')?.focus();
            return;
        }

        let rua = "", numero = "", bairroNome = "";

        if (tipoPedido === 'entrega') {
            const seletorBairro = document.getElementById('bairro');
            if (!seletorBairro || seletorBairro.value === "") {
                alert("Por favor, selecione o bairro para entrega!");
                seletorBairro?.focus();
                return;
            }
            rua = document.getElementById('endereco-cliente')?.value.trim() || '';
            numero = document.getElementById('numero-casa')?.value.trim() || '';
            bairroNome = seletorBairro.options[seletorBairro.selectedIndex].text;

            if (!rua || !numero) {
                alert("Por favor, preencha a rua e o número da sua casa para a entrega!");
                document.getElementById('endereco-cliente')?.focus();
                return;
            }
        }

        // Montagem Elegante da Mensagem
        let mensagem = `*NOVO PEDIDO - DRAKO HOUSE* 🍔🍟\n`;
        mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `👤 *Cliente:* ${nome}\n`;
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
        }

        mensagem += `\n━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `Subtotal dos Itens: R$ ${precoTotalProdutos.toFixed(2).replace('.', ',')}\n`;

        if (tipoPedido === 'entrega') {
            mensagem += taxaEntregaAtual > 0
                ? `🛵 Taxa de Entrega: R$ ${taxaEntregaAtual.toFixed(2).replace('.', ',')}\n`
                : `🛵 Taxa de Entrega: Grátis\n`;
            mensagem += `*TOTAL FINAL: R$ ${(precoTotalProdutos + taxaEntregaAtual).toFixed(2).replace('.', ',')}*\n`;
        } else {
            mensagem += `*TOTAL FINAL: R$ ${precoTotalProdutos.toFixed(2).replace('.', ',')}*\n`;
        }
        mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `_Pedido gerado via cardápio online Drako House_`;

        window.open(`https://wa.me/557491954272?text=${encodeURIComponent(mensagem)}`, '_blank');
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

    const navLinks = document.querySelectorAll('.menu-categorias a');
    const sections = document.querySelectorAll('.secao-categoria');

    function changeLinkStateOnScroll() {
        let currentSectionId = '';
        sections.forEach(section => {
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

    // Inicialização
    monitorarAdicionais();
});

// --- Monitoramento do Status da Loja ---

function monitorarStatusLoja() {
    if (typeof firebase === 'undefined') return;
    firebase.database().ref('configuracoes/statusLoja').on('value', (snapshot) => {
        const estaAberta = snapshot.val();
        const overlay = document.getElementById('overlay-fechado');
        const dot = document.getElementById('status-dot');
        const txtStatus = document.getElementById('texto-status-loja');

        if (dot && txtStatus) {
            if (estaAberta) {
                dot.className = 'status-dot';
                txtStatus.innerText = 'Aberto para Pedidos';
            } else {
                dot.className = 'status-dot fechado';
                txtStatus.innerText = 'Loja Fechada no Momento';
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

// --- Painel Administrativo ---

const SENHA_CORRETA = "1234";

window.abrirModalAdmin = function() {
    const modal = document.getElementById('modal-admin');
    if (modal) modal.style.display = 'flex';
};

document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'a' || event.key === 'A')) {
        abrirModalAdmin();
    }
});

window.verificarSenha = function () {
    const campoSenha = document.getElementById('senha-admin');
    if (campoSenha.value === SENHA_CORRETA) {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-controles').style.display = 'block';
        carregarListaAdmin();
        carregarListaAdicionaisAdmin();
        carregarIdentidadeVisualAdmin();
    } else {
        alert("Senha incorreta!");
    }
};

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
            });
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

window.converterLogoParaBase64 = function (input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const logo = event.target.result;
        document.getElementById('logo-empresa-base64').value = logo;
        const preview = document.getElementById('preview-logo');
        if (preview) preview.src = logo;
    };
    reader.readAsDataURL(file);
};

window.converterFundoCabecalhoParaBase64 = function (input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const imagem = event.target.result;
        document.getElementById('fundo-cabecalho-base64').value = imagem;
        const preview = document.getElementById('preview-fundo-cabecalho');
        if (preview) {
            preview.src = imagem;
            preview.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
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
    });
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
    });
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
    });
};

window.excluirAdicionalFirebase = function (id) {
    if (confirm("Deseja realmente excluir este adicional?")) {
        firebase.database().ref(`adicionais/${id}`).remove().then(() => {
            alert("Adicional excluído!");
            carregarListaAdicionaisAdmin();
        });
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
                    <span><strong>${add.nome}</strong> (+R$ ${parseFloat(add.preco).toFixed(2).replace('.', ',')})</span>
                    <button onclick="excluirAdicionalFirebase('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">Excluir</button>
                </div>
            `;
        });
    });
}

window.converterImagemParaBase64 = function (input) {
    const file = input.files[0];
    if (file) {
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

    const produtoData = { nome, descricao, foto, categoria, qtdSabores, precoM, precoG };

    firebase.database().ref(`produtos/${id}`).update(produtoData).then(() => {
        alert("Produto salvo com sucesso!");
        limparFormularioProduto();
        carregarListaAdmin();
    });
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

            listaAdmin.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ddd; gap: 6px; flex-wrap: wrap;">
                    <span><strong>${p.nome}</strong> (${p.categoria})</span>
                    <div style="display: flex; gap: 4px;">
                        ${btnDestaque}
                        <button onclick="preencherEdicao('${id}', '${p.nome.replace(/'/g, "\\'")}', '${(p.descricao || '').replace(/'/g, "\\'")}', '${p.foto}', '${p.categoria}', ${p.precoM}, ${p.precoG}, ${p.qtdSabores || 2})" style="background:#f39c12; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;">Editar</button>
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
};

window.excluirProduto = function (id) {
    if (confirm("Deseja realmente excluir este produto?")) {
        firebase.database().ref(`produtos/${id}`).remove().then(() => {
            alert("Produto excluído!");
            carregarListaAdmin();
        });
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
}