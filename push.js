// Módulo ES para gerenciamento de Web Push / FCM no Painel do Restaurante
import { app, auth, db } from './firebase-config.js';
import { getMessaging, getToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js';
import { ref, set }
  from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { toast } from './utils.js';

// Chave pública VAPID do Firebase Cloud Messaging (Web Push Certificates)
// IMPORTANTE: Insira sua chave VAPID gerada em:
// Firebase Console -> Configurações do Projeto -> Cloud Messaging -> Web Push certificates
export const VAPID_KEY = 'SUA_CHAVE_PUBLICA_VAPID_AQUI';

let messagingInstancia = null;

/**
 * Verifica se o dispositivo está rodando no iOS fora do modo PWA (Adicionado à tela inicial)
 * @returns {boolean}
 */
function isIosNaoInstalado() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return isIos && !isStandalone;
}

/**
 * Atualiza visualmente o botão de notificações no cabeçalho do painel
 * @param {'concedida'|'padrao'|'bloqueada'} estadoPermissao
 */
function atualizarBotao(estadoPermissao) {
  const btn = document.getElementById('btnNotificacoes');
  if (!btn) return;

  if (estadoPermissao === 'concedida') {
    btn.innerHTML = '🔔 Notificações Ativas';
    btn.classList.add('adm-btn-ativo');
    btn.title = 'Aparelho pronto para receber alertas de novos pedidos';
  } else if (estadoPermissao === 'bloqueada') {
    btn.innerHTML = '🔕 Notificações Bloqueadas';
    btn.classList.remove('adm-btn-ativo');
    btn.title = 'Permissão bloqueada no navegador. Habilite nas configurações do site.';
  } else {
    btn.innerHTML = '🔔 Ativar Notificações';
    btn.classList.remove('adm-btn-ativo');
    btn.title = 'Toque para receber avisos de pedidos neste aparelho';
  }
}

/**
 * Registra o Service Worker e obtém o Token FCM do aparelho
 * @returns {Promise<string|null>}
 */
async function obterTokenFCM() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Navegador sem suporte a Service Worker.');
  }

  const registroSW = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/'
  });

  if (!messagingInstancia) {
    messagingInstancia = getMessaging(app);
  }

  const tokenAtual = await getToken(messagingInstancia, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registroSW
  });

  return tokenAtual;
}

/**
 * Salva o token FCM no Realtime Database sob o UID autenticado do dono:
 * adminTokens/{uid}/{token} = timestamp
 * @param {string} token
 */
async function salvarTokenNoBanco(token) {
  const usuario = auth.currentUser;
  if (!usuario) {
    console.warn('[PUSH] Usuário não está autenticado. Não foi possível salvar token.');
    return;
  }

  // Chaves no Firebase RTDB não podem conter certos caracteres como . $ # [ ] /
  // Tokens FCM são seguros, mas garantimos gravação na chave do token
  const tokenKey = encodeURIComponent(token).replace(/\./g, '%2E');
  const tokenRef = ref(db, `adminTokens/${usuario.uid}/${tokenKey}`);

  await set(tokenRef, Date.now());
}

/**
 * Listener para quando o painel já estiver aberto na tela e um push chegar.
 * Exibe o aviso em primeiro plano e toca som de notificação se disponível.
 */
function ouvirMensagensPrimeiroPlano() {
  if (!messagingInstancia) return;

  onMessage(messagingInstancia, (payload) => {
    const dados = payload.data || {};
    const titulo = dados.titulo || 'Novo Pedido Chegou!';
    const corpo = dados.corpo || 'Confira a aba de pedidos.';

    toast(`🔔 ${titulo}: ${corpo}`);

    // Se a notificação do sistema for permitida, exibe também no SO
    if (Notification.permission === 'granted') {
      try {
        new Notification(titulo, {
          body: corpo,
          icon: '/assets/logo.jpeg'
        });
      } catch (e) {
        // Ignora caso Notification direta seja restrita em dispositivos móveis
      }
    }
  });
}

/**
 * Solicita a permissão do usuário e ativa as notificações neste aparelho.
 * DEVE ser acionado diretamente por um gesto do usuário (clique no botão).
 */
export async function ativarNotificacoes() {
  const btn = document.getElementById('btnNotificacoes');

  // 1. Validações de suporte do sistema e iOS
  if (isIosNaoInstalado()) {
    toast('No iPhone/iPad, adicione o painel à Tela Inicial (Compartilhar -> Adicionar à Tela de Início) para ativar notificações.');
    return;
  }

  const suportado = await isSupported().catch(() => false);
  if (!suportado || !('Notification' in window)) {
    toast('Este navegador não possui suporte a notificações Web Push.');
    return;
  }

  if (Notification.permission === 'denied') {
    atualizarBotao('bloqueada');
    toast('Permissão bloqueada nas configurações do seu navegador. Desbloqueie para ativar.');
    return;
  }

  if (VAPID_KEY === 'SUA_CHAVE_PUBLICA_VAPID_AQUI') {
    toast('Configuração pendente: chave VAPID_KEY precisa ser configurada em push.js.');
    console.error('[PUSH] Configure a VAPID_KEY em push.js.');
    return;
  }

  try {
    if (btn) btn.disabled = true;

    // 2. Solicita permissão explícita
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      atualizarBotao(permissao === 'denied' ? 'bloqueada' : 'padrao');
      toast('Permissão para notificações não foi autorizada.');
      return;
    }

    // 3. Obtém o token FCM
    const token = await obterTokenFCM();
    if (!token) {
      toast('Não foi possível obter o token deste dispositivo.');
      return;
    }

    // 4. Salva no banco de dados
    await salvarTokenNoBanco(token);

    atualizarBotao('concedida');
    ouvirMensagensPrimeiroPlano();
    toast('✅ Notificações ativadas com sucesso neste aparelho!');
  } catch (erro) {
    console.error('[PUSH_ERRO_ATIVACAO]', erro);
    if (!navigator.onLine) {
      toast('Falha de rede. Verifique sua conexão à internet.');
    } else {
      toast('Erro ao ativar notificações: ' + (erro.message || 'Tente novamente.'));
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Inicializa a gestão de push após login do administrador.
 * Configura o botão na interface e renova o token em silêncio se já autorizado.
 */
export async function iniciarPush() {
  const suportado = await isSupported().catch(() => false);
  if (!suportado || !('Notification' in window)) {
    const btn = document.getElementById('btnNotificacoes');
    if (btn) btn.style.display = 'none';
    return;
  }

  const btn = document.getElementById('btnNotificacoes');
  if (btn) {
    btn.onclick = () => ativarNotificacoes();
  }

  if (Notification.permission === 'granted') {
    atualizarBotao('concedida');
    try {
      if (VAPID_KEY !== 'SUA_CHAVE_PUBLICA_VAPID_AQUI') {
        const token = await obterTokenFCM();
        if (token) {
          await salvarTokenNoBanco(token);
        }
        ouvirMensagensPrimeiroPlano();
      }
    } catch (e) {
      console.warn('[PUSH] Falha silenciosa ao sincronizar token:', e.message);
    }
  } else if (Notification.permission === 'denied') {
    atualizarBotao('bloqueada');
  } else {
    atualizarBotao('padrao');
  }
}
