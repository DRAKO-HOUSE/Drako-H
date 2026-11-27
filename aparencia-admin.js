/**
 * Controlador da Aba Aparência no Painel Administrativo
 * Gerencia sub-abas, paletas, modo personalizado, contrastes WCAG, upload de logo/cabeçalho,
 * histórico com reversão, preview mockup mobile e confirmação de descarte de alterações.
 */

import {
  PALETAS_PREDEFINIDAS,
  CONFIG_APARENCIA_PADRAO,
  salvarAparencia,
  assinarAparencia,
  assinarHistorico
} from './aparencia-service.js';
import { aplicarTokensAparencia } from './aparencia-aplicar.js';
import { garantirTextoContraste } from './utils-cor.js';
import { comprimirImagemParaBase64 } from './utils-imagem.js';
import { toast, comCarregamento, formatarDataHora } from './utils.js';

export function inicializarAbaAparencia() {
  // Estado local de edição e backup do que está salvo no banco
  let configSalva = JSON.parse(JSON.stringify(CONFIG_APARENCIA_PADRAO));
  let configEditando = JSON.parse(JSON.stringify(CONFIG_APARENCIA_PADRAO));
  let temAlteracoesNaoSalvas = false;

  const $ = (id) => document.getElementById(id);
  const containerPreview = $('mockup-preview-conteudo');

  // ---------- Notificação de alterações não salvas ao trocar de aba ou sair ----------
  window.addEventListener('beforeunload', (e) => {
    if (temAlteracoesNaoSalvas) {
      e.preventDefault();
      e.returnValue = 'Existem alterações de aparência não salvas. Deseja realmente sair?';
    }
  });

  // ---------- Renderização dos Cartões de Paletas Prontas ----------
  function renderizarPaletas() {
    const grade = $('grade-paletas');
    if (!grade) return;
    grade.innerHTML = '';

    PALETAS_PREDEFINIDAS.forEach(p => {
      const card = document.createElement('div');
      card.className = `cartao-paleta ${configEditando.paleta === p.id ? 'ativo' : ''}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', String(configEditando.paleta === p.id));

      card.innerHTML = `
        <div class="paleta-cores-barra">
          <span style="background: ${p.cores.primaria}" title="Primária: ${p.cores.primaria}"></span>
          <span style="background: ${p.cores.secundaria}" title="Secundária: ${p.cores.secundaria}"></span>
          <span style="background: ${p.cores.destaque}" title="Destaque: ${p.cores.destaque}"></span>
          <span style="background: ${p.cores.fundo}" title="Fundo: ${p.cores.fundo}"></span>
        </div>
        <div class="paleta-info">
          <strong>${p.nome}</strong>
          <small>${p.descricao}</small>
        </div>
      `;

      const selecionar = () => {
        configEditando.paleta = p.id;
        configEditando.cores = { ...p.cores };
        sincronizarCamposComEstado();
        marcarAlterado();
      };

      card.addEventListener('click', selecionar);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionar(); } });
      grade.appendChild(card);
    });
  }

  // ---------- Sincronização dos Inputs com o Estado ----------
  function sincronizarCamposComEstado() {
    const c = configEditando.cores;

    // Inputs de Cor e Texto HEX
    if ($('cor-primaria-pick')) $('cor-primaria-pick').value = c.primaria;
    if ($('cor-primaria-hex')) $('cor-primaria-hex').value = c.primaria.toUpperCase();

    if ($('cor-secundaria-pick')) $('cor-secundaria-pick').value = c.secundaria;
    if ($('cor-secundaria-hex')) $('cor-secundaria-hex').value = c.secundaria.toUpperCase();

    if ($('cor-destaque-pick')) $('cor-destaque-pick').value = c.destaque;
    if ($('cor-destaque-hex')) $('cor-destaque-hex').value = c.destaque.toUpperCase();

    if ($('cor-fundo-pick')) $('cor-fundo-pick').value = c.fundo;
    if ($('cor-fundo-hex')) $('cor-fundo-hex').value = c.fundo.toUpperCase();

    // Verificação de Contraste WCAG
    const avisoContraste = $('aviso-contraste-wcag');
    if (avisoContraste) {
      const info = garantirTextoContraste(c.primaria);
      if (!info.atendeWcagAa) {
        avisoContraste.hidden = false;
        avisoContraste.innerHTML = `⚠️ <strong>Atenção de Contraste (WCAG AA):</strong> A cor primária selecionada possui contraste de ${info.ratio}:1 com texto. O sistema ajustou automaticamente para <strong>${info.corTexto === '#ffffff' ? 'Texto Branco' : 'Texto Escuro'}</strong> para manter a legibilidade.`;
      } else {
        avisoContraste.hidden = true;
      }
    }

    // Botões de Tema Claro / Escuro / Auto
    document.querySelectorAll('[data-opcao-tema]').forEach(btn => {
      const ativo = btn.dataset.opcaoTema === configEditando.tema;
      btn.classList.toggle('ativo', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
    });

    // Logo
    if ($('slider-largura-logo')) $('slider-largura-logo').value = configEditando.logo.largura || 84;
    if ($('valor-largura-logo')) $('valor-largura-logo').textContent = `${configEditando.logo.largura || 84}px`;
    if ($('preview-logo-admin')) {
      $('preview-logo-admin').src = configEditando.logo.src || './assets/logo.jpeg';
      $('preview-logo-admin').style.display = configEditando.logo.src ? 'block' : 'none';
    }

    // Cabeçalho
    document.querySelectorAll('[data-tipo-cabecalho]').forEach(btn => {
      const ativo = btn.dataset.tipoCabecalho === configEditando.cabecalho.tipo;
      btn.classList.toggle('ativo', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
    });
    if ($('painel-cabecalho-cor')) $('painel-cabecalho-cor').hidden = configEditando.cabecalho.tipo !== 'cor';
    if ($('painel-cabecalho-gradiente')) $('painel-cabecalho-gradiente').hidden = configEditando.cabecalho.tipo !== 'gradiente';
    if ($('painel-cabecalho-imagem')) $('painel-cabecalho-imagem').hidden = configEditando.cabecalho.tipo !== 'imagem';

    if ($('cab-cor-pick')) $('cab-cor-pick').value = configEditando.cabecalho.cor || c.secundaria;
    if ($('cab-escurecimento-slider')) $('cab-escurecimento-slider').value = configEditando.cabecalho.escurecimento ?? 40;
    if ($('valor-escurecimento')) $('valor-escurecimento').textContent = `${configEditando.cabecalho.escurecimento ?? 40}%`;

    renderizarPaletas();
    atualizarPreviewAoVivo();
  }

  function marcarAlterado() {
    temAlteracoesNaoSalvas = true;
    const btnSalvar = $('btn-salvar-aparencia');
    const btnDescartar = $('btn-descartar-aparencia');
    if (btnSalvar) btnSalvar.disabled = false;
    if (btnDescartar) btnDescartar.disabled = false;
    atualizarPreviewAoVivo();
  }

  function desmarcarAlterado() {
    temAlteracoesNaoSalvas = false;
    const btnSalvar = $('btn-salvar-aparencia');
    const btnDescartar = $('btn-descartar-aparencia');
    if (btnSalvar) btnSalvar.disabled = true;
    if (btnDescartar) btnDescartar.disabled = true;
  }

  // ---------- Atualização do Mockup Mobile (Preview ao Vivo) ----------
  function atualizarPreviewAoVivo() {
    if (!containerPreview) return;
    aplicarTokensAparencia(configEditando, containerPreview);

    // Ajusta o fundo e logo no mockup
    const mockHeader = containerPreview.querySelector('.mockup-header');
    if (mockHeader) {
      const cfgCab = configEditando.cabecalho;
      if (cfgCab.tipo === 'gradiente' && cfgCab.gradiente) {
        mockHeader.style.background = cfgCab.gradiente;
      } else if (cfgCab.tipo === 'imagem' && cfgCab.imagem) {
        mockHeader.style.backgroundImage = `url("${cfgCab.imagem}")`;
        mockHeader.style.backgroundSize = 'cover';
      } else {
        mockHeader.style.background = cfgCab.cor || configEditando.cores.secundaria;
      }

      const escurecer = (cfgCab.escurecimento ?? 40) / 100;
      mockHeader.style.setProperty('--escurecimento-mock', escurecer);
    }

    const mockLogo = containerPreview.querySelector('.mockup-logo');
    if (mockLogo) {
      if (configEditando.logo.src) {
        mockLogo.src = configEditando.logo.src;
        mockLogo.style.display = 'block';
        const largura = Math.round((configEditando.logo.largura || 84) * 0.7);
        mockLogo.style.width = `${largura}px`;
        mockLogo.style.height = `${largura}px`;
      } else {
        mockLogo.style.display = 'none';
      }
    }
  }

  // ---------- Sub-abas Internas (Cores | Tema | Logo | Cabeçalho | Histórico) ----------
  document.querySelectorAll('.sub-aba-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-aba-btn').forEach(b => {
        b.classList.toggle('ativo', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      document.querySelectorAll('[data-subaba-conteudo]').forEach(sec => {
        sec.hidden = sec.id !== `subaba-${btn.dataset.subaba}`;
      });
    });
  });

  // ---------- Sincronização Pickers e HEX ----------
  function ligarParPickerHex(idPick, idHex, chaveCor) {
    const pick = $(idPick);
    const hex = $(idHex);
    if (!pick || !hex) return;

    pick.addEventListener('input', (e) => {
      const cor = e.target.value.toLowerCase();
      hex.value = cor.toUpperCase();
      configEditando.cores[chaveCor] = cor;
      configEditando.paleta = 'personalizada';
      marcarAlterado();
      sincronizarCamposComEstado();
    });

    hex.addEventListener('change', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = `#${val}`;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        pick.value = val;
        configEditando.cores[chaveCor] = val.toLowerCase();
        configEditando.paleta = 'personalizada';
        marcarAlterado();
        sincronizarCamposComEstado();
      } else {
        toast('Código HEX inválido. Use formato #RRGGBB', 'erro');
        hex.value = configEditando.cores[chaveCor].toUpperCase();
      }
    });
  }

  ligarParPickerHex('cor-primaria-pick', 'cor-primaria-hex', 'primaria');
  ligarParPickerHex('cor-secundaria-pick', 'cor-secundaria-hex', 'secundaria');
  ligarParPickerHex('cor-destaque-pick', 'cor-destaque-hex', 'destaque');
  ligarParPickerHex('cor-fundo-pick', 'cor-fundo-hex', 'fundo');

  // ---------- Botões de Tema ----------
  document.querySelectorAll('[data-opcao-tema]').forEach(btn => {
    btn.addEventListener('click', () => {
      configEditando.tema = btn.dataset.opcaoTema;
      marcarAlterado();
      sincronizarCamposComEstado();
    });
  });

  // ---------- Upload e Controle do Logo ----------
  const dropzoneLogo = $('dropzone-logo');
  const inputLogo = $('input-logo-file');

  if (dropzoneLogo && inputLogo) {
    dropzoneLogo.addEventListener('click', () => inputLogo.click());
    dropzoneLogo.addEventListener('dragover', (e) => { e.preventDefault(); dropzoneLogo.classList.add('dragover'); });
    dropzoneLogo.addEventListener('dragleave', () => dropzoneLogo.classList.remove('dragover'));
    dropzoneLogo.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzoneLogo.classList.remove('dragover');
      if (e.dataTransfer.files?.[0]) processarArquivoLogo(e.dataTransfer.files[0]);
    });
    inputLogo.addEventListener('change', (e) => {
      if (e.target.files?.[0]) processarArquivoLogo(e.target.files[0]);
    });
  }

  async function processarArquivoLogo(arquivo) {
    try {
      const base64 = await comprimirImagemParaBase64(arquivo, {
        larguraMax: 400,
        alturaMax: 400,
        tamanhoMaxBytes: 300 * 1024
      });
      configEditando.logo.src = base64;
      marcarAlterado();
      sincronizarCamposComEstado();
      toast('Logo carregada e otimizada com sucesso!');
    } catch (err) {
      toast(err.message || 'Erro ao processar imagem.', 'erro');
    }
  }

  $('btn-remover-logo')?.addEventListener('click', () => {
    if (confirm('Deseja remover a logo? O cardápio exibirá o nome "DRAKO HOUSE" em texto.')) {
      configEditando.logo.src = '';
      marcarAlterado();
      sincronizarCamposComEstado();
    }
  });

  $('slider-largura-logo')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    configEditando.logo.largura = val;
    if ($('valor-largura-logo')) $('valor-largura-logo').textContent = `${val}px`;
    marcarAlterado();
    atualizarPreviewAoVivo();
  });

  // ---------- Fundo do Cabeçalho ----------
  document.querySelectorAll('[data-tipo-cabecalho]').forEach(btn => {
    btn.addEventListener('click', () => {
      configEditando.cabecalho.tipo = btn.dataset.tipoCabecalho;
      marcarAlterado();
      sincronizarCamposComEstado();
    });
  });

  $('cab-cor-pick')?.addEventListener('input', (e) => {
    configEditando.cabecalho.cor = e.target.value;
    marcarAlterado();
    atualizarPreviewAoVivo();
  });

  document.querySelectorAll('[data-preset-grad]').forEach(btn => {
    btn.addEventListener('click', () => {
      configEditando.cabecalho.gradiente = btn.dataset.presetGrad;
      marcarAlterado();
      atualizarPreviewAoVivo();
    });
  });

  $('input-cab-imagem')?.addEventListener('change', async (e) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      const base64 = await comprimirImagemParaBase64(arq, {
        larguraMax: 800,
        alturaMax: 500,
        qualidade: 0.8,
        tamanhoMaxBytes: 300 * 1024
      });
      configEditando.cabecalho.imagem = base64;
      marcarAlterado();
      atualizarPreviewAoVivo();
      toast('Imagem de fundo aplicada!');
    } catch (err) {
      toast(err.message || 'Erro ao carregar fundo.', 'erro');
    }
  });

  $('cab-escurecimento-slider')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    configEditando.cabecalho.escurecimento = val;
    if ($('valor-escurecimento')) $('valor-escurecimento').textContent = `${val}%`;
    marcarAlterado();
    atualizarPreviewAoVivo();
  });

  $('btn-remover-fundo-cab')?.addEventListener('click', () => {
    configEditando.cabecalho = {
      tipo: 'cor',
      cor: configEditando.cores.secundaria,
      gradiente: '',
      imagem: '',
      escurecimento: 40
    };
    marcarAlterado();
    sincronizarCamposComEstado();
    toast('Fundo do cabeçalho restaurado.');
  });

  // ---------- Restaurar Padrão Drako House ----------
  $('btn-restaurar-padrao')?.addEventListener('click', () => {
    if (confirm('Deseja realmente restaurar a aparência para o Padrão Drako House?')) {
      configEditando = JSON.parse(JSON.stringify(CONFIG_APARENCIA_PADRAO));
      marcarAlterado();
      sincronizarCamposComEstado();
      toast('Padrão Drako House carregado.');
    }
  });

  // ---------- Descartar Alterações ----------
  $('btn-descartar-aparencia')?.addEventListener('click', () => {
    if (confirm('Deseja descartar todas as alterações não salvas?')) {
      configEditando = JSON.parse(JSON.stringify(configSalva));
      desmarcarAlterado();
      sincronizarCamposComEstado();
      toast('Alterações descartadas.');
    }
  });

  // ---------- Salvar Alterações ----------
  $('btn-salvar-aparencia')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await comCarregamento(btn, async () => {
        const salva = await salvarAparencia(configEditando);
        configSalva = JSON.parse(JSON.stringify(salva));
        configEditando = JSON.parse(JSON.stringify(salva));
        desmarcarAlterado();
        sincronizarCamposComEstado();
      });
      toast('Aparência salva e publicada em tempo real!');
    } catch (err) {
      toast(err.message || 'Erro ao salvar aparência no banco.', 'erro');
    }
  });

  // ---------- Histórico de Versões e Reversão ----------
  function renderizarHistorico(lista) {
    const container = $('lista-historico-aparencia');
    if (!container) return;
    container.innerHTML = '';

    if (!lista || lista.length === 0) {
      container.innerHTML = '<p class="adm-vazio">Nenhuma alteração registrada ainda.</p>';
      return;
    }

    lista.forEach(item => {
      const card = document.createElement('div');
      card.className = 'adm-item';
      const dataFormatada = formatarDataHora(item.atualizadoEm);
      const autor = item.atualizadoPor || 'Admin';
      const paletaNome = PALETAS_PREDEFINIDAS.find(p => p.id === item.paleta)?.nome || 'Personalizada';

      card.innerHTML = `
        <div class="paleta-cores-barra" style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
          <span style="background: ${item.cores.primaria}; height: 25%;"></span>
          <span style="background: ${item.cores.secundaria}; height: 25%;"></span>
          <span style="background: ${item.cores.destaque}; height: 25%;"></span>
          <span style="background: ${item.cores.fundo}; height: 25%;"></span>
        </div>
        <div class="adm-item-info">
          <strong>${paletaNome} (${item.tema.toUpperCase()})</strong>
          <small>Salvo em: ${dataFormatada} por <em>${autor}</em></small>
        </div>
        <button type="button" class="btn-secundario adm-btn-peq btn-restaurar-versao">Restaurar esta versão</button>
      `;

      card.querySelector('.btn-restaurar-versao').addEventListener('click', () => {
        if (confirm(`Deseja restaurar a aparência da versão de ${dataFormatada}?`)) {
          configEditando = JSON.parse(JSON.stringify(item));
          delete configEditando.id;
          marcarAlterado();
          sincronizarCamposComEstado();
          toast('Versão carregada no editor! Clique em "Salvar alterações" para publicar.');
        }
      });

      container.appendChild(card);
    });
  }

  // ---------- Inscrição em Tempo Real no Firebase ----------
  assinarAparencia((dados) => {
    if (dados) {
      configSalva = JSON.parse(JSON.stringify(dados));
      if (!temAlteracoesNaoSalvas) {
        configEditando = JSON.parse(JSON.stringify(dados));
        sincronizarCamposComEstado();
      }
    } else {
      // Primeira vez / Sem dados: usa padrão Drako House
      configSalva = JSON.parse(JSON.stringify(CONFIG_APARENCIA_PADRAO));
      if (!temAlteracoesNaoSalvas) {
        configEditando = JSON.parse(JSON.stringify(CONFIG_APARENCIA_PADRAO));
        sincronizarCamposComEstado();
      }
    }
  });

  assinarHistorico((lista) => {
    renderizarHistorico(lista);
  });
}
