/**
 * Serviço de Persistência de Aparência e Histórico no Firebase
 * Utiliza o db e auth de firebase-config.js
 */

import { db, auth } from './firebase-config.js';
import { ref, set, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

export const PALETAS_PREDEFINIDAS = [
  {
    id: 'drako-house',
    nome: 'Padrão Drako House',
    descricao: 'Verde oliva e verde militar autênticos do Drako House',
    cores: {
      primaria: '#516e03',
      secundaria: '#2e5902',
      destaque: '#f2f2f2',
      fundo: '#f4f5f8'
    }
  },
  {
    id: 'burguer-artesanal',
    nome: 'Burguer Artesanal',
    descricao: 'Vermelho intenso e carvão para hamburguerias clássicas',
    cores: {
      primaria: '#dc2626',
      secundaria: '#1f2937',
      destaque: '#f59e0b',
      fundo: '#f8fafc'
    }
  },
  {
    id: 'pizzaria-rustica',
    nome: 'Pizzaria Rústica',
    descricao: 'Terracota e verde manjericão tradicional italiano',
    cores: {
      primaria: '#c2410c',
      secundaria: '#15803d',
      destaque: '#fef08a',
      fundo: '#fdfbf7'
    }
  },
  {
    id: 'sushi-oriental',
    nome: 'Sushi & Oriental',
    descricao: 'Preto nobre, salmão e dourado minimalista',
    cores: {
      primaria: '#111827',
      secundaria: '#fb7185',
      destaque: '#facc15',
      fundo: '#f3f4f6'
    }
  },
  {
    id: 'acai-tropical',
    nome: 'Açaí Tropical',
    descricao: 'Roxo açaí vivo com toque verde limão refrescante',
    cores: {
      primaria: '#581c87',
      secundaria: '#059669',
      destaque: '#fde047',
      fundo: '#faf5ff'
    }
  },
  {
    id: 'cafeteria-vintage',
    nome: 'Cafeteria Vintage',
    descricao: 'Tons de café expresso, caramelo e creme suave',
    cores: {
      primaria: '#78350f',
      secundaria: '#b45309',
      destaque: '#fef3c7',
      fundo: '#fffbeb'
    }
  },
  {
    id: 'doceria-pastel',
    nome: 'Doceria & Confeitaria',
    descricao: 'Rosa framboesa e lilás adocicado requintado',
    cores: {
      primaria: '#db2777',
      secundaria: '#7c3aed',
      destaque: '#fbcfe8',
      fundo: '#fdf2f8'
    }
  },
  {
    id: 'churrasco-prime',
    nome: 'Churrascaria Prime',
    descricao: 'Âmbar tostado, preto fogo e dourado braseiro',
    cores: {
      primaria: '#991b1b',
      secundaria: '#0f172a',
      destaque: '#ea580c',
      fundo: '#fcfcfc'
    }
  }
];

export const CONFIG_APARENCIA_PADRAO = {
  versao: 1,
  paleta: 'drako-house',
  cores: {
    primaria: '#516e03',
    secundaria: '#2e5902',
    destaque: '#f2f2f2',
    fundo: '#f4f5f8'
  },
  tema: 'claro', // 'claro' | 'escuro' | 'auto'
  logo: {
    src: './assets/logo.jpeg',
    largura: 84
  },
  cabecalho: {
    tipo: 'cor', // 'cor' | 'gradiente' | 'imagem'
    cor: '#2e5902',
    gradiente: 'linear-gradient(135deg, #2e5902 0%, #516e03 100%)',
    imagem: '',
    escurecimento: 40
  },
  atualizadoEm: Date.now(),
  atualizadoPor: 'sistema'
};

/**
 * Salva a nova configuração de aparência de forma atômica no Realtime Database
 * com atualização multi-path gravando também o histórico (últimas 10 versões).
 */
export async function salvarAparencia(dadosAparencia) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Usuário não autenticado.');

  const agora = Date.now();
  const configuracaoCompleta = {
    ...CONFIG_APARENCIA_PADRAO,
    ...dadosAparencia,
    atualizadoEm: agora,
    atualizadoPor: usuario.email || usuario.uid
  };

  // 1. Busca histórico existente
  const historicoRef = ref(db, 'configuracoes/aparenciaHistorico');
  const historicoSnap = await get(historicoRef);
  let listaHistorico = historicoSnap.exists() ? Object.values(historicoSnap.val()) : [];

  // Ordena por data decrescente
  listaHistorico.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

  // Adiciona a nova versão na cabeça
  listaHistorico.unshift({
    id: `v_${agora}`,
    ...configuracaoCompleta
  });

  // Mantém estritamente no máximo as 10 últimas versões
  if (listaHistorico.length > 10) {
    listaHistorico = listaHistorico.slice(0, 10);
  }

  // Transforma array em mapa de chaves
  const novoMapaHistorico = {};
  listaHistorico.forEach(item => {
    novoMapaHistorico[item.id] = item;
  });

  // Atualização multi-path atômica
  const atualizacoes = {
    'configuracoes/aparencia': configuracaoCompleta,
    'configuracoes/aparenciaHistorico': novoMapaHistorico
  };

  await update(ref(db), atualizacoes);
  return configuracaoCompleta;
}

/**
 * Assina mudanças na configuração de aparência em tempo real.
 */
export function assinarAparencia(callback) {
  const aparenciaRef = ref(db, 'configuracoes/aparencia');
  return onValue(aparenciaRef, snapshot => {
    callback(snapshot.val() || null);
  });
}

/**
 * Assina o histórico de versões em tempo real.
 */
export function assinarHistorico(callback) {
  const histRef = ref(db, 'configuracoes/aparenciaHistorico');
  return onValue(histRef, snapshot => {
    const val = snapshot.val();
    if (!val) return callback([]);
    const lista = Object.values(val);
    lista.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
    callback(lista);
  });
}
