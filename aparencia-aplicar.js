/**
 * Aplicação de Design Tokens e Temas CSS
 * Exporta funções puras que aplicam variáveis em qualquer elemento raiz (documento ou preview iframe/container).
 */

import { gerarVariacoesCor, garantirTextoContraste } from './utils-cor.js';

/**
 * Aplica todos os tokens de cores, derivados e tema no elemento especificado (default: document.documentElement).
 */
export function aplicarTokensAparencia(config, elementoRaiz = document.documentElement) {
  if (!config) return;

  const cores = config.cores || {};
  const primaria = cores.primaria || '#516e03';
  const secundaria = cores.secundaria || '#2e5902';
  const destaque = cores.destaque || '#f2f2f2';
  const fundo = cores.fundo || '#f4f5f8';
  const tema = config.tema || 'claro';

  // Determina se o tema efetivo é escuro
  let escuro = tema === 'escuro';
  if (tema === 'auto') {
    escuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Define data-tema no elemento
  elementoRaiz.setAttribute('data-tema', escuro ? 'escuro' : 'claro');

  // Variáveis derivadas da cor primária
  const deriv = gerarVariacoesCor(primaria);
  const contrastePrimaria = garantirTextoContraste(primaria);
  const contrasteSecundaria = garantirTextoContraste(secundaria);

  // Design Tokens Principais
  elementoRaiz.style.setProperty('--cor-primaria', primaria);
  elementoRaiz.style.setProperty('--cor-primaria-hover', deriv.hover);
  elementoRaiz.style.setProperty('--cor-primaria-active', deriv.active);
  elementoRaiz.style.setProperty('--cor-primaria-texto', contrastePrimaria.corTexto);
  elementoRaiz.style.setProperty('--cor-secundaria', secundaria);
  elementoRaiz.style.setProperty('--cor-secundaria-texto', contrasteSecundaria.corTexto);
  elementoRaiz.style.setProperty('--cor-destaque', destaque);
  elementoRaiz.style.setProperty('--borda-foco', deriv.bordaFoco);
  elementoRaiz.style.setProperty('--sombra-primaria', deriv.sombraGlow);

  // Tokens de Superfície, Fundo e Texto de acordo com o modo
  if (escuro) {
    elementoRaiz.style.setProperty('--cor-fundo', '#0f172a');
    elementoRaiz.style.setProperty('--cor-superficie', '#1e293b');
    elementoRaiz.style.setProperty('--cor-superficie-elevada', '#334155');
    elementoRaiz.style.setProperty('--cor-texto', '#f8fafc');
    elementoRaiz.style.setProperty('--cor-texto-mutado', '#94a3b8');
    elementoRaiz.style.setProperty('--cor-texto-claro', '#64748b');
    elementoRaiz.style.setProperty('--cor-borda', 'rgba(255, 255, 255, 0.12)');
    elementoRaiz.style.setProperty('--sombra-card', '0 4px 18px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3)');
  } else {
    elementoRaiz.style.setProperty('--cor-fundo', fundo);
    elementoRaiz.style.setProperty('--cor-superficie', '#ffffff');
    elementoRaiz.style.setProperty('--cor-superficie-elevada', '#f8fafc');
    elementoRaiz.style.setProperty('--cor-texto', '#18191b');
    elementoRaiz.style.setProperty('--cor-texto-mutado', '#6b7280');
    elementoRaiz.style.setProperty('--cor-texto-claro', '#9ca3af');
    elementoRaiz.style.setProperty('--cor-borda', 'rgba(0, 0, 0, 0.08)');
    elementoRaiz.style.setProperty('--sombra-card', '0 4px 18px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)');
  }

  // Compatibilidade com variáveis legadas do Drako House
  elementoRaiz.style.setProperty('--vermelho-principal', primaria);
  elementoRaiz.style.setProperty('--vermelho-escuro', secundaria);
  elementoRaiz.style.setProperty('--laranja-detalhes', destaque);
  elementoRaiz.style.setProperty('--cinza-fundo', escuro ? '#0f172a' : fundo);
  elementoRaiz.style.setProperty('--superficie-card', escuro ? '#1e293b' : '#ffffff');
  elementoRaiz.style.setProperty('--texto-escuro', escuro ? '#f8fafc' : '#18191b');
  elementoRaiz.style.setProperty('--texto-mutado', escuro ? '#94a3b8' : '#6b7280');
  elementoRaiz.style.setProperty('--borda-suave', escuro ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)');
  elementoRaiz.style.setProperty('--cor-categorias', primaria);
  elementoRaiz.style.setProperty('--cor-categoria-ativa', primaria);

  // Aplicação no Cabeçalho (se existir no escopo)
  const cabecalhoEl = elementoRaiz.querySelector ? elementoRaiz.querySelector('.main-header') : null;
  const cfgCab = config.cabecalho || {};
  if (cabecalhoEl) {
    if (cfgCab.tipo === 'gradiente' && cfgCab.gradiente) {
      cabecalhoEl.style.background = cfgCab.gradiente;
    } else if (cfgCab.tipo === 'imagem' && cfgCab.imagem) {
      cabecalhoEl.style.backgroundImage = `url("${cfgCab.imagem}")`;
      cabecalhoEl.style.backgroundSize = 'cover';
      cabecalhoEl.style.backgroundPosition = 'center';
    } else {
      cabecalhoEl.style.background = cfgCab.cor || secundaria;
    }

    // Camada de escurecimento (overlay)
    const overlayEscurecimento = (cfgCab.escurecimento ?? 40) / 100;
    cabecalhoEl.style.setProperty('--escurecimento-cabecalho', overlayEscurecimento);
  }

  // Aplicação do Logo
  const cfgLogo = config.logo || {};
  const logos = elementoRaiz.querySelectorAll ? elementoRaiz.querySelectorAll('.logo, #logo-empresa') : [];
  logos.forEach(img => {
    if (cfgLogo.src) {
      img.src = cfgLogo.src;
      img.style.display = 'block';
      if (cfgLogo.largura) {
        img.style.width = `${cfgLogo.largura}px`;
        img.style.height = `${cfgLogo.largura}px`;
      }
    } else {
      // Remove logo: esconde imagem
      img.style.display = 'none';
    }
  });

  return {
    escuro,
    contrastePrimaria
  };
}
