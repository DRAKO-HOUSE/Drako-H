document.addEventListener('DOMContentLoaded', () => {
    let totalItens = 0;
    let precoTotalProdutos = 0.0;
    let taxaEntregaAtual = 0.0;
    const carrinho = {};

    // Carregar Produtos do Firebase em Tempo Real
    function carregarCardapio() {
        if (typeof firebase === 'undefined') return;
        
        firebase.database().ref('produtos').on('value', (snapshot) => {
            const dados = snapshot.val();
            const listaBatatas = document.getElementById('lista-batatas');
            const listaCombos = document.getElementById('lista-combos');
            const listaBebidas = document.getElementById('lista-bebidas');
            const listaPasteis = document.getElementById('lista-pasteis');
            
            if(listaBatatas) listaBatatas.innerHTML = '';
            if(listaCombos) listaCombos.innerHTML = '';
            if(listaBebidas) listaBebidas.innerHTML = ''; // Limpa a nova seção de bebidas
            if(listaPasteis) listaPasteis.innerHTML = '';

            if (!dados) return;

            Object.keys(dados).forEach((id) => {
                const produto = dados[id];
                const card = document.createElement('div');
                card.className = 'item-produto';

                if (produto.categoria === 'batatas' && listaBatatas) {
                    card.innerHTML = `
                        <img src="${produto.foto}" alt="${produto.nome}">
                        <h3>${produto.nome}</h3>
                        <p>${produto.descricao || ''}</p>
                        <div class="tamanhos-container">
                            <label class="tamanho-opcao">
                                <input type="radio" name="tamanho-${id}" value="M" data-preco="${produto.precoM}" checked onclick="atualizarPrecoCard(this, '${id}')"> 
                                Tam. M: R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}
                            </label>
                            <label class="tamanho-opcao">
                                <input type="radio" name="tamanho-${id}" value="G" data-preco="${produto.precoG}" onclick="atualizarPrecoCard(this, '${id}')"> 
                                Tam. G: R$ ${parseFloat(produto.precoG).toFixed(2).replace('.', ',')}
                            </label>
                        </div>
                        <span class="preco" id="preco-exibicao-${id}" style="font-weight:bold; font-size:1.1rem; margin-bottom:8px;">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                        <div class="seletor-quantidade">
                            <button onclick="alterarQtd(this, -1, '${id}', '${produto.nome}')">-</button>
                            <span class="qtd-numero" id="qtd-${id}">0</span>
                            <button onclick="alterarQtd(this, 1, '${id}', '${produto.nome}')">+</button>
                        </div>
                    `;
                    listaBatatas.appendChild(card);
                } else if (produto.categoria === 'combos' && listaCombos) {
                    // Para COMBOS, o botão abre o modal de seleção de sabores
                    card.innerHTML = `
                        <img src="${produto.foto}" alt="${produto.nome}">
                        <h3>${produto.nome}</h3>
                        <p>${produto.descricao || ''}</p>
                        <span class="preco">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                        <button class="btn-add-combo" onclick='abrirModalSabores(${JSON.stringify({id, ...produto})})' style="width:100%; padding:10px; background:#516E03; color:white; border:none; border-radius:8px; cursor:pointer; margin-top:10px;">Escolher Sabores</button>
                    `;
                    card.classList.add('item-produto-combo');
                    listaCombos.appendChild(card);
                } else if (produto.categoria === 'pasteis' && listaPasteis) {
                    // Para BEBIDAS, manter o seletor de quantidade +/-
                    card.innerHTML = `
                        <img src="${produto.foto}" alt="${produto.nome}">
                        <h3>${produto.nome}</h3>
                        <p>${produto.descricao || ''}</p>
                        <span class="preco" id="preco-exibicao-${id}" style="font-weight:bold; font-size:1.1rem; margin-bottom:8px;">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                        <div class="seletor-quantidade">
                            <button onclick="alterarQtd(this, -1, '${id}', '${produto.nome}', 'Único', ${produto.precoM})">-</button>
                            <span class="qtd-numero" id="qtd-${id}">0</span>
                            <button onclick="alterarQtd(this, 1, '${id}', '${produto.nome}', 'Único', ${produto.precoM})">+</button>
                        </div>
                    `;
                    listaPasteis.appendChild(card);
                } else if (produto.categoria === 'bebidas' && listaBebidas) {
                    // Para BEBIDAS, manter o seletor de quantidade +/-
                    card.innerHTML = `
                        <img src="${produto.foto}" alt="${produto.nome}">
                        <h3>${produto.nome}</h3>
                        <p>${produto.descricao || ''}</p>
                        <span class="preco" id="preco-exibicao-${id}" style="font-weight:bold; font-size:1.1rem; margin-bottom:8px;">R$ ${parseFloat(produto.precoM).toFixed(2).replace('.', ',')}</span>
                        <div class="seletor-quantidade">
                            <button onclick="alterarQtd(this, -1, '${id}', '${produto.nome}', 'Único', ${produto.precoM})">-</button>
                            <span class="qtd-numero" id="qtd-${id}">0</span>
                            <button onclick="alterarQtd(this, 1, '${id}', '${produto.nome}', 'Único', ${produto.precoM})">+</button>
                        </div>
                    `;
                    listaBebidas.appendChild(card);
                }
            });
        });
    }

    // --- LÓGICA DO MODAL DE SELEÇÃO DE SABORES ---
    let comboAtualParaSelecao = {};
    const NUMERO_DE_SABORES_A_ESCOLHER = 2; // Defina aqui quantos sabores o cliente pode escolher

    window.abrirModalSabores = (produtoCombo) => {
        comboAtualParaSelecao = produtoCombo;
        const modal = document.getElementById('modal-combo-sabores');
        document.getElementById('modal-combo-titulo').textContent = `Escolha os sabores para: ${produtoCombo.nome}`;
        document.getElementById('modal-combo-descricao').textContent = `Você pode escolher ${NUMERO_DE_SABORES_A_ESCOLHER} sabores.`;
        const opcoesContainer = document.getElementById('combo-sabores-opcoes');
        opcoesContainer.innerHTML = ''; // Limpa opções anteriores

        // Busca todos os produtos da categoria 'batatas' para usar como opções
        firebase.database().ref('produtos').orderByChild('categoria').equalTo('batatas').once('value', (snapshot) => {
            const batatas = snapshot.val();
            if (!batatas) {
                opcoesContainer.innerHTML = '<p>Nenhum sabor de batata encontrado.</p>';
                return;
            }
            Object.values(batatas).forEach(batata => {
                const label = document.createElement('label');
                label.style.cssText = "display: block; padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;";

                // Usando innerHTML para incluir o nome e a descrição de forma estruturada
                label.innerHTML = `
                    <div style="display: flex; align-items: flex-start;">
                        <input type="checkbox" value="${batata.nome}" style="margin-top: 4px; margin-right: 10px;">
                        <div>
                            <strong style="display: block;">${batata.nome}</strong>
                            <p style="font-size: 0.8rem; color: #666; margin: 2px 0 0 0; line-height: 1.3;">${batata.descricao || ''}</p>
                        </div>
                    </div>
                `;

                // Adiciona o evento de verificação ao checkbox recém-criado
                label.querySelector('input[type="checkbox"]').onchange = (event) => {
                    const selecionados = opcoesContainer.querySelectorAll('input:checked');
                    if (selecionados.length > NUMERO_DE_SABORES_A_ESCOLHER) {
                        alert(`Você só pode escolher ${NUMERO_DE_SABORES_A_ESCOLHER} sabores.`);
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

        if (selecionados.length !== NUMERO_DE_SABORES_A_ESCOLHER) {
            alert(`Por favor, escolha exatamente ${NUMERO_DE_SABORES_A_ESCOLHER} sabores.`);
            return;
        }

        const saboresEscolhidos = Array.from(selecionados).map(cb => cb.value);
        const nomeCompleto = `${comboAtualParaSelecao.nome} (${saboresEscolhidos.join(', ')})`;
        
        // Usamos um timestamp para garantir uma chave única para cada combo personalizado adicionado
        // Isso permite adicionar o mesmo combo com diferentes sabores
        const chaveCarrinho = `combo-${comboAtualParaSelecao.id}-${Date.now()}`;

        // Adiciona o combo como um item único com quantidade 1
        carrinho[chaveCarrinho] = { 
            qtd: 1, 
            nome: nomeCompleto, 
            preco: comboAtualParaSelecao.precoM 
        };

        atualizarResumo();
        fecharModalSabores();
    }

    carregarCardapio();

    window.atualizarPrecoCard = (radio, id) => {
        const preco = parseFloat(radio.getAttribute('data-preco'));
        document.getElementById(`preco-exibicao-${id}`).innerText = `R$ ${preco.toFixed(2).replace('.', ',')}`;
    };

    window.alterarQtd = (botao, mudanca, id, nomeBase, tamanhoUnico = null, precoUnico = null) => {
        let tamanho = tamanhoUnico;
        let preco = precoUnico;

        if (!tamanhoUnico) {
            const radioSelecionado = document.querySelector(`input[name="tamanho-${id}"]:checked`);
            if (!radioSelecionado) return;
            tamanho = radioSelecionado.value;
            preco = parseFloat(radioSelecionado.getAttribute('data-preco'));
        }

        const chaveCarrinho = `${id}-${tamanho}`;
        const qtdElement = document.getElementById(`qtd-${id}`);
        
        if(!carrinho[chaveCarrinho]) {
            carrinho[chaveCarrinho] = { qtd: 0, nome: `${nomeBase} (${tamanho})`, preco: preco };
        }

        let qtdAtual = carrinho[chaveCarrinho].qtd + mudanca;

        if (qtdAtual >= 0) {
            carrinho[chaveCarrinho].qtd = qtdAtual;
            if (qtdElement) qtdElement.innerText = qtdAtual;
            
            if (qtdAtual === 0) {
                delete carrinho[chaveCarrinho];
            }
            atualizarResumo();
        }
    };

    function atualizarResumo() {
        totalItens = 0;
        precoTotalProdutos = 0;
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

        const tipoPedido = document.getElementById('retirada ou entrega').value; // 'entrega' ou 'retirada'
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
            mensagem += `✅ ${carrinho[chave].qtd}x ${carrinho[chave].nome}\n`;
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

    // Lógica para destacar o link ativo no menu de navegação ao rolar
    const navLinks = document.querySelectorAll('.menu-categorias a');
    const sections = document.querySelectorAll('.secao-categoria');

    function changeLinkStateOnScroll() {
        let currentSectionId = '';

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            // Considera a altura do header para a troca ser mais precisa
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

// Atalho Admin (Alt + A)
const SENHA_CORRETA = "1234";
document.addEventListener('keydown', (event) => {
    if (event.altKey && (event.key === 'a' || event.key === 'A')) {
        const modal = document.getElementById('modal-admin');
        if (modal) modal.style.display = 'block';
    }
});
 
window.verificarSenha = function() {
    const campoSenha = document.getElementById('senha-admin');
    if (campoSenha.value === SENHA_CORRETA) {
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-controles').style.display = 'block';
        carregarListaAdmin();
    } else {
        alert("Senha incorreta!");
    }
};

window.alternarLoja = function(status) {
    if (typeof firebase !== 'undefined') {
        firebase.database().ref('configuracoes/statusLoja').set(status)
            .then(() => {
                alert(status ? "Loja Aberta! ✅" : "Loja Fechada! 🔒");
            });
    }
};

// Conversor da imagem enviada para link virtual (Base64) + Preview
window.converterImagemParaBase64 = function(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64String = e.target.result;
            document.getElementById('prod-foto').value = base64String;
            const preview = document.getElementById('preview-foto');
            if(preview) {
                preview.src = base64String;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
};

// Gerenciamento de Produtos no Admin (Adicionar / Editar)
window.salvarProdutoFirebase = function() {
    const id = document.getElementById('prod-id').value || firebase.database().ref('produtos').push().key;
    const nome = document.getElementById('prod-nome').value;
    const descricao = document.getElementById('prod-desc').value;
    const foto = document.getElementById('prod-foto').value;
    const categoria = document.getElementById('prod-categoria').value;
    const precoM = parseFloat(document.getElementById('prod-preco-m').value) || 0;
    const precoG = parseFloat(document.getElementById('prod-preco-g').value) || precoM;

    if (!nome || !foto || !precoM) {
        alert("Preencha o nome, selecione uma foto e informe o preço principal!");
        return;
    }

    const produtoData = { nome, descricao, foto, categoria, precoM, precoG };

    firebase.database().ref(`produtos/${id}`).set(produtoData).then(() => {
        alert("Produto salvo com sucesso!");
        limparFormularioProduto();
        carregarListaAdmin();
    });
};

function carregarListaAdmin() {
    const listaAdmin = document.getElementById('lista-produtos-admin');
    if(!listaAdmin) return;
    
    firebase.database().ref('produtos').once('value', (snapshot) => {
        const dados = snapshot.val();
        listaAdmin.innerHTML = '';
        if(!dados) return;

        Object.keys(dados).forEach(id => {
            const p = dados[id];
            listaAdmin.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #ddd;">
                    <span><strong>${p.nome}</strong> (${p.categoria})</span>
                    <div>
                        <button onclick="preencherEdicao('${id}', '${p.nome.replace(/'/g, "\\'")}', '${(p.descricao || '').replace(/'/g, "\\'")}', '${p.foto}', '${p.categoria}', ${p.precoM}, ${p.precoG})" style="background:#f39c12; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Editar</button>
                        <button onclick="excluirProduto('${id}')" style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Excluir</button>
                    </div>
                </div>
            `;
        });
    });
}

window.preencherEdicao = function(id, nome, desc, foto, categoria, precoM, precoG) {
    document.getElementById('prod-id').value = id;
    document.getElementById('prod-nome').value = nome;
    document.getElementById('prod-desc').value = desc;
    document.getElementById('prod-foto').value = foto;
    document.getElementById('prod-categoria').value = categoria;
    document.getElementById('prod-preco-m').value = precoM;
    document.getElementById('prod-preco-g').value = precoG;

    const preview = document.getElementById('preview-foto');
    if(foto && preview) {
        preview.src = foto;
        preview.style.display = 'block';
    }
};

window.excluirProduto = function(id) {
    if(confirm("Deseja realmente excluir este produto?")) {
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
    document.getElementById('prod-preco-m').value = '';
    document.getElementById('prod-preco-g').value = '';
    const preview = document.getElementById('preview-foto');
    if(preview) preview.style.display = 'none';
}

window.mostrarCamposEntrega = function() {
    const seletor = document.getElementById('retirada ou entrega');
    const nomeCampo = document.getElementById('nome-cliente');
    const enderecoCampo = document.getElementById('endereco-cliente');
    const numeroCampo = document.getElementById('numero-casa');
    const bairroCampo = document.getElementById('bairro');
    const pontoRefCampo = document.getElementById('ponto-referencia');
    const exibicaoTaxa = document.getElementById('exibicao-taxa');

    if (seletor.value === 'retirada') {
        // Mantém o nome visível para identificar o cliente, mas oculta o resto do endereço
        nomeCampo.style.display = 'block';
        enderecoCampo.style.display = 'none';
        numeroCampo.parentElement.style.display = 'none';
        bairroCampo.parentElement.style.display = 'none';
        pontoRefCampo.style.display = 'none';
        exibicaoTaxa.style.display = 'none';
        
        // Limpar valores de endereço anteriores
        enderecoCampo.value = '';
        numeroCampo.value = '';
        bairroCampo.value = '';
        pontoRefCampo.value = '';
        taxaEntregaAtual = 0;
    } else {
        // Mostrar campos quando é ENTREGA
        nomeCampo.style.display = 'block';
        enderecoCampo.style.display = 'block';
        numeroCampo.parentElement.style.display = 'block';
        bairroCampo.parentElement.style.display = 'block';
        pontoRefCampo.style.display = 'block';
    }
};