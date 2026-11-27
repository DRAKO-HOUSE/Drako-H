/**
 * aparencia-cliente.js
 * Script puro para o site do cliente (cardápio público).
 * Utiliza o Firebase Compat 10.8.0 já inicializado na página index.html.
 * Sincroniza em tempo real sem recarregar e mantém compatibilidade com versões antigas.
 */

(function () {
  'use strict';

  var CHAVE_CACHE = 'drako_aparencia_cache_v1';

  var PADRAO = {
    cores: {
      primaria: '#516e03',
      secundaria: '#2e5902',
      destaque: '#f2f2f2',
      fundo: '#f4f5f8'
    },
    tema: 'claro',
    logo: {
      src: './assets/logo.jpeg',
      largura: 84
    },
    cabecalho: {
      tipo: 'cor',
      cor: '#2e5902',
      gradiente: '',
      imagem: '',
      escurecimento: 40
    }
  };

  function clamp(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  function hexParaRgb(hex) {
    if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
    var limpo = hex.replace('#', '').trim();
    if (limpo.length === 3) {
      limpo = limpo.split('').map(function (c) { return c + c; }).join('');
    }
    var num = parseInt(limpo, 16);
    if (isNaN(num)) return { r: 0, g: 0, b: 0 };
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function ajustarBrilho(hex, percentual) {
    var rgb = hexParaRgb(hex);
    var fator = percentual / 100;
    var r = clamp(rgb.r + (fator > 0 ? (255 - rgb.r) * fator : rgb.r * fator));
    var g = clamp(rgb.g + (fator > 0 ? (255 - rgb.g) * fator : rgb.g * fator));
    var b = clamp(rgb.b + (fator > 0 ? (255 - rgb.b) * fator : rgb.b * fator));
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  function luminanciaRelativa(rgb) {
    var sRGB = [rgb.r, rgb.g, rgb.b].map(function (val) {
      val /= 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
  }

  function calcularRazaoContraste(hex1, hex2) {
    var lum1 = luminanciaRelativa(hexParaRgb(hex1));
    var lum2 = luminanciaRelativa(hexParaRgb(hex2));
    var maisClaro = Math.max(lum1, lum2);
    var maisEscuro = Math.min(lum1, lum2);
    return (maisClaro + 0.05) / (maisEscuro + 0.05);
  }

  function textoContraste(fundoHex) {
    var branco = calcularRazaoContraste(fundoHex, '#ffffff');
    var preto = calcularRazaoContraste(fundoHex, '#000000');
    return branco >= preto ? '#ffffff' : '#111827';
  }

  function aplicarAparenciaNoDocumento(dados) {
    var raiz = document.documentElement;
    var c = (dados && dados.cores) ? dados.cores : PADRAO.cores;
    var tema = (dados && dados.tema) ? dados.tema : PADRAO.tema;
    var cab = (dados && dados.cabecalho) ? dados.cabecalho : PADRAO.cabecalho;
    var logo = (dados && dados.logo) ? dados.logo : PADRAO.logo;

    var escuro = tema === 'escuro';
    if (tema === 'auto') {
      escuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    raiz.setAttribute('data-tema', escuro ? 'escuro' : 'claro');

    var primaria = c.primaria || PADRAO.cores.primaria;
    var secundaria = c.secundaria || PADRAO.cores.secundaria;
    var destaque = c.destaque || PADRAO.cores.destaque;
    var fundo = c.fundo || PADRAO.cores.fundo;

    var rgbP = hexParaRgb(primaria);

    // Design Tokens Novos
    raiz.style.setProperty('--cor-primaria', primaria);
    raiz.style.setProperty('--cor-primaria-hover', ajustarBrilho(primaria, -12));
    raiz.style.setProperty('--cor-primaria-active', ajustarBrilho(primaria, -22));
    raiz.style.setProperty('--cor-primaria-texto', textoContraste(primaria));
    raiz.style.setProperty('--cor-secundaria', secundaria);
    raiz.style.setProperty('--cor-secundaria-texto', textoContraste(secundaria));
    raiz.style.setProperty('--cor-destaque', destaque);
    raiz.style.setProperty('--borda-foco', 'rgba(' + rgbP.r + ',' + rgbP.g + ',' + rgbP.b + ',0.4)');
    raiz.style.setProperty('--sombra-primaria', '0 4px 14px rgba(' + rgbP.r + ',' + rgbP.g + ',' + rgbP.b + ',0.28)');

    if (escuro) {
      raiz.style.setProperty('--cor-fundo', '#0f172a');
      raiz.style.setProperty('--cor-superficie', '#1e293b');
      raiz.style.setProperty('--cor-superficie-elevada', '#334155');
      raiz.style.setProperty('--cor-texto', '#f8fafc');
      raiz.style.setProperty('--cor-texto-mutado', '#94a3b8');
      raiz.style.setProperty('--cor-texto-claro', '#64748b');
      raiz.style.setProperty('--cor-borda', 'rgba(255, 255, 255, 0.12)');
      raiz.style.setProperty('--sombra-card', '0 4px 18px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3)');
    } else {
      raiz.style.setProperty('--cor-fundo', fundo);
      raiz.style.setProperty('--cor-superficie', '#ffffff');
      raiz.style.setProperty('--cor-superficie-elevada', '#f8fafc');
      raiz.style.setProperty('--cor-texto', '#18191b');
      raiz.style.setProperty('--cor-texto-mutado', '#6b7280');
      raiz.style.setProperty('--cor-texto-claro', '#9ca3af');
      raiz.style.setProperty('--cor-borda', 'rgba(0, 0, 0, 0.08)');
      raiz.style.setProperty('--sombra-card', '0 4px 18px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)');
    }

    // Variáveis legadas do projeto
    raiz.style.setProperty('--vermelho-principal', primaria);
    raiz.style.setProperty('--vermelho-escuro', secundaria);
    raiz.style.setProperty('--laranja-detalhes', destaque);
    raiz.style.setProperty('--cinza-fundo', escuro ? '#0f172a' : fundo);
    raiz.style.setProperty('--superficie-card', escuro ? '#1e293b' : '#ffffff');
    raiz.style.setProperty('--texto-escuro', escuro ? '#f8fafc' : '#18191b');
    raiz.style.setProperty('--texto-mutado', escuro ? '#94a3b8' : '#6b7280');
    raiz.style.setProperty('--borda-suave', escuro ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)');
    raiz.style.setProperty('--cor-categorias', primaria);
    raiz.style.setProperty('--cor-categoria-ativa', primaria);

    // Cabeçalho
    var cabecalhoEl = document.querySelector('.main-header');
    if (cabecalhoEl) {
      if (cab.tipo === 'gradiente' && cab.gradiente) {
        cabecalhoEl.style.background = cab.gradiente;
      } else if (cab.tipo === 'imagem' && cab.imagem) {
        cabecalhoEl.style.backgroundImage = 'url("' + cab.imagem + '")';
        cabecalhoEl.style.backgroundSize = 'cover';
        cabecalhoEl.style.backgroundPosition = 'center';
      } else {
        cabecalhoEl.style.background = cab.cor || secundaria;
      }

      var escurecer = (cab.escurecimento !== undefined ? cab.escurecimento : 40) / 100;
      cabecalhoEl.style.setProperty('--escurecimento-cabecalho', escurecer);
    }

    // Logo e favicon
    var logos = document.querySelectorAll('.logo, #logo-empresa');
    logos.forEach(function (img) {
      if (logo.src) {
        img.src = logo.src;
        img.style.display = 'block';
        if (logo.largura) {
          img.style.width = logo.largura + 'px';
          img.style.height = logo.largura + 'px';
        }
      } else {
        img.style.display = 'none';
      }
    });

    var favicon = document.querySelector('link[rel="icon"]');
    if (favicon && logo.src) {
      favicon.href = logo.src;
    }
  }

  // 1. Aplica imediatamente o que estiver no cache local
  try {
    var cacheSalvo = localStorage.getItem(CHAVE_CACHE);
    if (cacheSalvo) {
      aplicarAparenciaNoDocumento(JSON.parse(cacheSalvo));
    }
  } catch (e) {}

  // 2. Conecta ao Firebase Realtime Database com listener em tempo real
  function iniciarMonitoramento() {
    if (typeof firebase === 'undefined' || !firebase.database) {
      setTimeout(iniciarMonitoramento, 200);
      return;
    }

    firebase.database().ref('configuracoes/aparencia').on('value', function (snapshot) {
      var val = snapshot.val();
      if (val) {
        try {
          localStorage.setItem(CHAVE_CACHE, JSON.stringify(val));
        } catch (e) {}
        aplicarAparenciaNoDocumento(val);
      } else {
        aplicarAparenciaNoDocumento(PADRAO);
      }
    });
  }

  // Monitora alterações de preferência do sistema se tema estiver em 'auto'
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      try {
        var dados = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null');
        if (dados && dados.tema === 'auto') {
          aplicarAparenciaNoDocumento(dados);
        }
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarMonitoramento);
  } else {
    iniciarMonitoramento();
  }
})();
