document.addEventListener('DOMContentLoaded', () => {
    let totalItens = 0;
    let precoTotalProdutos = 0.0;
    let taxaEntregaAtual = 0.0;
    const carrinho = {};
    let listaAdicionais = {};

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
            const dados = snapshot.val();
            const listaDestaques = document.getElementById('lista-destaques');
            const listaBatatas = document.getElementById('lista-batatas');
            const listaCombos = document.getElementById('lista-combos');
            const listaBebidas = document.getElementById('lista-bebidas');

            if (listaDestaques) listaDestaques.innerHTML = '';
            if (listaBatatas) listaBatatas.innerHTML = '';
            if (listaCombos) listaCombos.innerHTML = '';
            if (listaBebidas) listaBebidas.innerHTML = '';

            if (!dados) return;

            let qtdDestaques = 0;

            Object.keys(dados).forEach((id) => {
                const produto = dados[id];

                if (produto.destaque) {
                    qtdDestaques++;
                    if (listaDestaques) {
                        const cardDestaque = criarCardProduto(id, produto, true);
                        listaDestaques.appendChild(cardDestaque);
                    }
                }

                const cardCategoria = criarCardProduto(id, produto, false);
                if (produto.categoria === 'batatas' && listaBatatas) {
                    listaBatatas.appendChild(cardCategoria);
                } else if (produto.categoria === 'combos' && listaCombos) {
                    listaCombos.appendChild(cardCategoria);
                } else if (produto.categoria === 'bebidas' && listaBebidas) {
                    listaBebidas.appendChild(cardCategoria);
                }
            });

            // Controle de visibilidade da seção e navegação de destaques
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
                    navDestaques.style.display = 'inline-block';
                }
            }
        });
    }

    function criarCardProduto(id, produto, isDestaque = false) {
        const card = document.createElement('div');
        card.className = 'item-produto';
        const sufixo = isDestaque ? '-destaque' : '';
        const badge = isDestaque ? '<span class="badge-destaque">⭐ Destaque</span>' : '';
        const qtdAtual = getQtdTotalProdutoCard(id);

        if (produto.categoria === 'batatas') {
            let adicionaisHtml = '';
            const keysAdd = Object.keys(listaAdicionais);
            if (keysAdd.length > 0) {
                adicionaisHtml = `
                    <div class="opcoes-adicionais">
                        <span class="titulo-adicionais">Adicionais (opcional):</span>
                        <div class="lista-adicionais-grid">
                            ${keysAdd.map(addId => {
                                const add = listaAdicionais[addId];
                                return `
                                    <label class="item-adicional">
                                        <input type="checkbox" class="chk-adicional-${id}${sufixo}" data-id="${addId}" data-nome="${add.nome}" data-preco="${add.preco}">
                                        <span>${add.nome} (+R$ ${parseFloat(add.preco).toFixed(2).replace('.', ',')})</span>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            card.innerHTML = `
                ${badge}
                <img src="${produto.foto}" alt="${produto.nome}">
                <h3>${produto.nome}</h3>
                <p>${produto.descricao || ''}</p>
                <div class="tamanhos-container">
                    <label class="tamanho-opcao">
                        <input type="radio" name="tamanho-${id}${sufixo}" value="M" data-preco="${produto.precoM}" checked onclick="atualizarPrecoCard(this, '${id}${sufixo}')"> 
                        Tam. M: R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}
                    </label>
                    <label class="tamanho-opcao">
                        <input type="radio" name="tamanho-${id}${sufixo}" value="G" data-preco="${produto.precoG}" onclick="atualizarPrecoCard(this, '${id}${sufixo}')"> 
                        Tam. G: R$ ${parseFloat(produto.precoG).toFixed(2).replace('.', ',')}
                    </label>
                </div>
                ${adicionaisHtml}
                <span class="preco" id="preco-exibicao-${id}${sufixo}" style="font-weight:bold; font-size:1.1rem; margin-bottom:8px;">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                <div class="seletor-quantidade">
                    <button onclick="alterarQtd(this, -1, '${id}', '${produto.nome.replace(/'/g, "\\'")}', null, null, '${sufixo}')">-</button>
                    <span class="qtd-numero" id="qtd-${id}${sufixo}">${qtdAtual}</span>
                    <button onclick="alterarQtd(this, 1, '${id}', '${produto.nome.replace(/'/g, "\\'")}', null, null, '${sufixo}')">+</button>
                </div>
            `;
        } else if (produto.categoria === 'combos') {
            card.innerHTML = `
                ${badge}
                <img src="${produto.foto}" alt="${produto.nome}">
                <h3>${produto.nome}</h3>
                <p>${produto.descricao || ''}</p>
                <span class="preco">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                <button class="btn-add-combo" onclick='abrirModalSabores(${JSON.stringify({ id, ...produto })})' style="width:100%; padding:10px; background:#516E03; color:white; border:none; border-radius:8px; cursor:pointer; margin-top:10px;">Escolher Sabores</button>
            `;
            card.classList.add('item-produto-combo');
        } else if (produto.categoria === 'bebidas') {
            card.innerHTML = `
                ${badge}
                <img src="${produto.foto}" alt="${produto.nome}">
                <h3>${produto.nome}</h3>
                <p>${produto.descricao || ''}</p>
                <span class="preco" id="preco-exibicao-${id}${sufixo}" style="font-weight:bold; font-size:1.1rem; margin-bottom:8px;">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                <div class="seletor-quantidade">
                    <button onclick="alterarQtd(this, -1, '${id}', '${produto.nome.replace(/'/g, "\\'")}', 'Único', ${produto.precoM}, '${sufixo}')">-</button>
                    <span class="qtd-numero" id="qtd-${id}${sufixo}">${qtdAtual}</span>
                    <button onclick="alterarQtd(this, 1, '${id}', '${produto.nome.replace(/'/g, "\\'")}', 'Único', ${produto.precoM}, '${sufixo}')">+</button>
                </div>
            `;
        }

        return card;
    }

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
        const elPadrao = document.getElementById(`qtd-${id}`);
        const elDestaque = document.getElementById(`qtd-${id}-destaque`);
        if (elPadrao) elPadrao.innerText = qtd;
        if (elDestaque) elDestaque.innerText = qtd;
    }

    monitorarAdicionais();

    let comboAtualParaSelecao = {};
    const NUMERO_DE_SABORES_A_ESCOLHER = 2;

    window.abrirModalSabores = (produtoCombo) => {
        comboAtualParaSelecao = produtoCombo;
        const maxSabores = parseInt(produtoCombo.qtdSabores) || 2;
        const modal = document.getElementById('modal-combo-sabores');
        document.getElementById('modal-combo-titulo').textContent = `Escolha os sabores para: ${produtoCombo.nome}`;
        document.getElementById('modal-combo-descricao').textContent = maxSabores === 1 
            ? `Você pode escolher 1 sabor.` 
            : `Você pode escolher ${maxSabores} sabores.`;
        const opcoesContainer = document.getElementById('combo-sabores-opcoes');
        opcoesContainer.innerHTML = '';

        firebase.database().ref('produtos').orderByChild('categoria').equalTo('batatas').once('value', (snapshot) => {
            const batatas = snapshot.val();
            if (!batatas) {
                opcoesContainer.innerHTML = '<p>Nenhum sabor de batata encontrado.</p>';
                return;
            }
            Object.values(batatas).forEach(batata => {
                const label = document.createElement('label');
                label.style.cssText = "display: block; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;";

                label.innerHTML = `
                    <div style="display: flex; align-items: flex-start;">
                        <input type="checkbox" value="${batata.nome}" style="margin-top: 4px; margin-right: 10px;">
                        <div>
                            <strong style="display: block;">${batata.nome}</strong>
                            <p style="font-size: 0.8rem; color: #666; margin: 2px 0 0 0; line-height: 1.3;">${batata.descricao || ''}</p>
                        </div>
                    </div>
                `;

                label.querySelector('input[type="checkbox"]').onchange = (event) => {
                    const selecionados = opcoesContainer.querySelectorAll('input:checked');
                    if (selecionados.length > maxSabores) {
                        alert(maxSabores === 1 ? `Você só pode escolher 1 sabor.` : `Você só pode escolher ${maxSabores} sabores.`);
                        event.target.checked = false;
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
        const nomeCompleto = `${comboAtualParaSelecao.nome} (${saboresEscolhidos.join(', ')})`;
        const chaveCarrinho = `combo-${comboAtualParaSelecao.id}-${Date.now()}`;

        carrinho[chaveCarrinho] = {
            idProduto: comboAtualParaSelecao.id,
            qtd: 1,
            nome: nomeCompleto,
            preco: parseFloat(comboAtualParaSelecao.precoM),
            adicionais: []
        };

        atualizarResumo();
        fecharModalSabores();
    }

    window.atualizarPrecoCard = (radio, idSufixo) => {
        const preco = parseFloat(radio.getAttribute('data-preco'));
        const display = document.getElementById(`preco-exibicao-${idSufixo}`);
        if (display) display.innerText = `R$ ${preco.toFixed(2).replace('.', ',')}`;
    };

    window.alterarQtd = (botao, mudanca, id, nomeBase, tamanhoUnico = null, precoUnico = null, sufixo = '') => {
        let tamanho = tamanhoUnico;
        let precoBase = precoUnico;
        let adicionaisSelecionados = [];

        if (!tamanhoUnico) {
            const radioSelecionado = document.querySelector(`input[name="tamanho-${id}${sufixo}"]:checked`);
            if (!radioSelecionado) return;
            tamanho = radioSelecionado.value;
            precoBase = parseFloat(radioSelecionado.getAttribute('data-preco'));

            const checkboxesAdicionais = document.querySelectorAll(`.chk-adicional-${id}${sufixo}:checked`);
            adicionaisSelecionados = Array.from(checkboxesAdicionais).map(cb => ({
                id: cb.getAttribute('data-id'),
                nome: cb.getAttribute('data-nome'),
                preco: parseFloat(cb.getAttribute('data-preco'))
            }));
        }

        const somaAdicionais = adicionaisSelecionados.reduce((acc, a) => acc + a.preco, 0);
        const precoTotalItem = precoBase + somaAdicionais;
        const chaveAdicionais = adicionaisSelecionados.map(a => a.id).sort().join('_');
        const chaveCarrinho = tamanhoUnico
            ? `${id}-unico`
            : (chaveAdicionais ? `${id}-${tamanho}-${chaveAdicionais}` : `${id}-${tamanho}`);

        if (mudanca > 0) {
            if (!carrinho[chaveCarrinho]) {
                carrinho[chaveCarrinho] = {
                    idProduto: id,
                    qtd: 0,
                    nome: tamanhoUnico ? nomeBase : `${nomeBase} (${tamanho})`,
                    precoBase: precoBase,
                    adicionais: adicionaisSelecionados,
                    preco: precoTotalItem
                };
            }
            carrinho[chaveCarrinho].qtd += mudanca;
        } else if (mudanca < 0) {
            if (carrinho[chaveCarrinho]) {
                carrinho[chaveCarrinho].qtd += mudanca;
                if (carrinho[chaveCarrinho].qtd <= 0) {
                    delete carrinho[chaveCarrinho];
                }
            } else {
                for (const key in carrinho) {
                    if (carrinho[key].idProduto === id) {
                        carrinho[key].qtd += mudanca;
                        if (carrinho[key].qtd <= 0) {
                            delete carrinho[key];
                        }
                        break;
                    }
                }
            }
        }

        atualizarExibicaoQtdCards(id);
        atualizarResumo();
    };

    function atualizarResumo() {
        totalItens = 0;
        precoTotalProdutos = 0.0;
        for (const chave in carrinho) {
            totalItens += carrinho[chave].qtd;
            precoTotalProdutos += carrinho[chave].qtd * carrinho[chave].preco;
        }
        const totalItensElement = document.getElementById('total-itens');
        if (totalItensElement) totalItensElement.innerText = totalItens;
        atualizarTotalGeral();
    }

    window.calcularFrete = () => {
        const seletor = document.getElementById('bairro');
        if (!seletor || seletor.value === "") return;

        taxaEntregaAtual = parseFloat(seletor.value);
        const bairroNome = seletor.options[seletor.selectedIndex].text;
        const divTaxa = document.getElementById('exibicao-taxa');
        const textoTaxa = document.getElementById('texto-taxa');

        if (divTaxa) divTaxa.style.display = 'block';

        if (taxaEntregaAtual === 0) {
            if (textoTaxa) textoTaxa.innerHTML = `<strong>✅ Entrega Grátis</strong> para ${bairroNome}`;
        } else {
            if (textoTaxa) textoTaxa.innerHTML = `<strong>🛵 Taxa: R$ ${taxaEntregaAtual.toFixed(2).replace('.', ',')}</strong> (${bairroNome})`;
        }
        atualizarTotalGeral();
    };

    function atualizarTotalGeral() {
        const totalFinal = precoTotalProdutos + taxaEntregaAtual;
        const display = document.getElementById('preco-total');
        if (display) display.innerText = totalFinal.toFixed(2).replace('.', ',');
    }

    window.enviarPedido = () => {
        if (totalItens === 0) {
            alert("Seu carrinho está vazio!");
            return;
        }

        const divDados = document.getElementById('dados-entrega');
        const botao = document.getElementById('btn-finalizar');

        if (!divDados.classList.contains('ativo')) {
            divDados.classList.add('ativo');
            botao.innerText = "Confirmar e Enviar Pedido";
            botao.style.backgroundColor = "#25D366";
            document.getElementById('btn-voltar').style.display = "block";
            return;
        }

        const tipoPedido = document.getElementById('retirada ou entrega').value;
        const nome = document.getElementById('nome-cliente').value.trim();
        const pagamento = document.getElementById('pagamento').value;

        if (!nome) {
            alert("Preencha o seu nome!");
            return;
        }

        let rua = "", numero = "", bairroNome = "";

        if (tipoPedido === 'entrega') {
            const seletorBairro = document.getElementById('bairro');
            if (!seletorBairro || seletorBairro.value === "") {
                alert("Selecione um bairro!");
                return;
            }
            rua = document.getElementById('endereco-cliente').value.trim();
            numero = document.getElementById('numero-casa').value.trim();
            bairroNome = seletorBairro.options[seletorBairro.selectedIndex].text;

            if (!rua || !numero) {
                alert("Preencha todos os dados de entrega!");
                return;
            }
        }

        let mensagem = `*Novo Pedido - DRAKO HOUSE*\n━━━━━━━━━━━━━━━━━━━━\n`;
        mensagem += `👤 *Cliente:* ${nome}\n`;
        mensagem += `📦 *Tipo:* ${tipoPedido === 'retirada' ? 'Retirada no Local' : 'Entrega'}\n`;

        if (tipoPedido === 'entrega') {
            mensagem += `📍 *Endereço:* ${rua}, Nº ${numero}\n🏘️ *Bairro:* ${bairroNome}\n`;
        }

        mensagem += `💳 *Pagamento:* ${pagamento}\n━━━━━━━━━━━━━━━━━━━━\n\n`;

        for (const chave in carrinho) {
            const item = carrinho[chave];
            const subtotalItem = item.qtd * item.preco;
            mensagem += `✅ ${item.qtd}x ${item.nome} - R$ ${subtotalItem.toFixed(2).replace('.', ',')}\n`;
            if (item.adicionais && item.adicionais.length > 0) {
                const addList = item.adicionais.map(a => `${a.nome} (+R$ ${parseFloat(a.preco).toFixed(2).replace('.', ',')})`).join(', ');
                mensagem += `   Adicionais: ${addList}\n`;
            }
        }

        if (tipoPedido === 'entrega') {
            mensagem += taxaEntregaAtual > 0 ? `\n🛵 *Frete:* R$ ${taxaEntregaAtual.toFixed(2).replace('.', ',')}` : `\n🛵 *Frete:* Grátis`;
            mensagem += `\n*TOTAL FINAL: R$ ${(precoTotalProdutos + taxaEntregaAtual).toFixed(2).replace('.', ',')}*`;
        } else {
            mensagem += `\n*TOTAL FINAL: R$ ${precoTotalProdutos.toFixed(2).replace('.', ',')}*`;
        }

        window.open(`https://wa.me/557491954272?text=${encodeURIComponent(mensagem)}`, '_blank');
    };

    window.fecharDadosEntrega = () => {
        document.getElementById('dados-entrega').classList.remove('ativo');
        const btn = document.getElementById('btn-finalizar');
        btn.innerText = "Finalizar via WhatsApp";
        btn.style.backgroundColor = "";
        document.getElementById('btn-voltar').style.display = "none";
    };

    window.abrirModalCarrinho = () => {
        const modal = document.getElementById('modal-carrinho');
        const container = document.getElementById('lista-itens-carrinho');
        if (!modal || !container) return;

        container.innerHTML = '';
        const keys = Object.keys(carrinho);
        if (keys.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; padding: 20px 0;">Seu carrinho está vazio.</p>';
        } else {
            keys.forEach(chave => {
                const item = carrinho[chave];
                const div = document.createElement('div');
                div.style.cssText = 'padding: 10px 0; border-bottom: 1px solid #eee; display: flex; flex-direction: column; gap: 4px;';

                let adicionaisTexto = '';
                if (item.adicionais && item.adicionais.length > 0) {
                    const addList = item.adicionais.map(a => `${a.nome} (+R$ ${parseFloat(a.preco).toFixed(2).replace('.', ',')})`).join(', ');
                    adicionaisTexto = `<span class="item-carrinho-adicionais"><strong>+ Adicionais:</strong> ${addList}</span>`;
                }

                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${item.qtd}x ${item.nome}</strong>
                            ${adicionaisTexto}
                        </div>
                        <span style="font-weight: bold; color: #2E5902;">R$ ${(item.qtd * item.preco).toFixed(2).replace('.', ',')}</span>
                    </div>
                `;
                container.appendChild(div);
            });
        }
        modal.style.display = 'flex';
    };

    window.fecharModalCarrinho = () => {
        const modal = document.getElementById('modal-carrinho');
        if (modal) modal.style.display = 'none';
    };

    const navLinks = document.querySelectorAll('.menu-categorias a');
    const sections = document.querySelectorAll('.secao-categoria');

    function changeLinkStateOnScroll() {
        let currentSectionId = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (window.scrollY >= sectionTop - 100) {
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
    window.addEventListener('scroll', changeLinkStateOnScroll);
});

function monitorarStatusLoja() {
    if (typeof firebase === 'undefined') return;
    firebase.database().ref('configuracoes/statusLoja').on('value', (snapshot) => {
        const estaAberta = snapshot.val();
        const overlay = document.getElementById('overlay-fechado');
        if (!overlay) return;
        if (estaAberta) {
            overlay.style.display = 'none';
            document.body.style.overflow = 'auto';
        } else {
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            window.scrollTo(0, 0);
        }
    });
}
monitorarStatusLoja();

const SENHA_CORRETA = "1234";
document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'a' || event.key === 'A')) {
        const modal = document.getElementById('modal-admin');
        if (modal) modal.style.display = 'block';
    }
});

window.verificarSenha = function () {
    const campoSenha = document.getElementById('senha-admin');
    if (campoSenha.value === SENHA_CORRETA) {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-controles').style.display = 'block';
        carregarListaAdmin();
        carregarListaAdicionaisAdmin();
    } else {
        alert("Senha incorreta!");
    }
};

window.alternarLoja = function (status) {
    if (typeof firebase !== 'undefined') {
        firebase.database().ref('configuracoes/statusLoja').set(status)
            .then(() => {
                alert(status ? "Loja Aberta! ✅" : "Loja Fechada! 🔒");
            });
    }
};

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
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #ddd; font-size:0.9rem;">
                    <span><strong>${add.nome}</strong> (+R$ ${parseFloat(add.preco).toFixed(2).replace('.', ',')})</span>
                    <button onclick="excluirAdicionalFirebase('${id}')" style="background:#e74c3c; color:white; border:none; padding:3px 6px; border-radius:4px; cursor:pointer;">Excluir</button>
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
    const nome = document.getElementById('prod-nome').value;
    const descricao = document.getElementById('prod-desc').value;
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
                ? `<button onclick="alternarDestaqueProduto('${id}', false)" style="background:#7f8c8d; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">❌ Tirar Destaque</button>`
                : `<button onclick="alternarDestaqueProduto('${id}', true)" style="background:#f1c40f; color:black; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">⭐ Destacar</button>`;

            listaAdmin.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #ddd; gap: 6px; flex-wrap: wrap;">
                    <span><strong>${p.nome}</strong> (${p.categoria})</span>
                    <div style="display: flex; gap: 4px;">
                        ${btnDestaque}
                        <button onclick="preencherEdicao('${id}', '${p.nome.replace(/'/g, "\\'")}', '${(p.descricao || '').replace(/'/g, "\\'")}', '${p.foto}', '${p.categoria}', ${p.precoM}, ${p.precoG}, ${p.qtdSabores || 2})" style="background:#f39c12; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Editar</button>
                        <button onclick="excluirProduto('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Excluir</button>
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

window.mostrarCamposEntrega = function () {
    const seletor = document.getElementById('retirada ou entrega');
    const nomeCampo = document.getElementById('nome-cliente');
    const enderecoCampo = document.getElementById('endereco-cliente');
    const numeroCampo = document.getElementById('numero-casa');
    const bairroCampo = document.getElementById('bairro');
    const pontoRefCampo = document.getElementById('ponto-referencia');
    const exibicaoTaxa = document.getElementById('exibicao-taxa');

    if (seletor.value === 'retirada') {
        nomeCampo.style.display = 'block';
        enderecoCampo.style.display = 'none';
        numeroCampo.parentElement.style.display = 'none';
        bairroCampo.parentElement.style.display = 'none';
        pontoRefCampo.style.display = 'none';
        exibicaoTaxa.style.display = 'none';
        enderecoCampo.value = '';
        numeroCampo.value = '';
        bairroCampo.value = '';
        pontoRefCampo.value = '';
        taxaEntregaAtual = 0;
    } else {
        nomeCampo.style.display = 'block';
        enderecoCampo.style.display = 'block';
        numeroCampo.parentElement.style.display = 'block';
        bairroCampo.parentElement.style.display = 'block';
        pontoRefCampo.style.display = 'block';
    }
};