const admin = require('firebase-admin');

// Origens autorizadas para CORS
const ORIGENS_PERMITIDAS = new Set([
  'https://drako-house.vercel.app',
  'https://drako-house.github.io'
]);

// Validação estrita do ID do pedido (ex: Firebase Push Key "-O..." ou alphanum)
const REGEX_PEDIDO_ID = /^[A-Za-z0-9_-]{5,80}$/;

/**
 * Inicializa o Firebase Admin SDK como singleton.
 * Lê credenciais das variáveis de ambiente da Vercel.
 */
function obterFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!serviceAccountRaw) {
    throw new Error('Configuração ausente: variável FIREBASE_SERVICE_ACCOUNT não definida.');
  }
  if (!databaseURL) {
    throw new Error('Configuração ausente: variável FIREBASE_DATABASE_URL não definida.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch (erroParse) {
    throw new Error('Formato inválido: FIREBASE_SERVICE_ACCOUNT deve ser uma string JSON válida.');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseURL
  });

  return admin.app();
}

/**
 * Aplica cabeçalhos de CORS com validação de origem estrita e Vary: Origin.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true se a origem é permitida
 */
function aplicarCors(req, res) {
  const origin = req.headers.origin;

  res.setHeader('Vary', 'Origin');

  if (origin && ORIGENS_PERMITIDAS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return true;
  }

  // Requisições sem cabeçalho Origin (ex: ferramentas servidor/curl se testado diretamente)
  if (!origin) {
    return true;
  }

  return false;
}

/**
 * Handler Serverless Vercel (CommonJS).
 */
module.exports = async function handler(req, res) {
  // Configura CORS
  const origemValida = aplicarCors(req, res);

  // Resposta para preflight OPTIONS
  if (req.method === 'OPTIONS') {
    if (!origemValida && req.headers.origin) {
      return res.status(403).json({ erro: 'Origem não permitida por CORS.' });
    }
    return res.status(204).end();
  }

  // Apenas método POST é aceito
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ erro: 'Método não permitido. Utilize POST.' });
  }

  // Bloqueia origens não permitidas em requisições POST
  if (req.headers.origin && !origemValida) {
    return res.status(403).json({ erro: 'Acesso negado por CORS.' });
  }

  // Validação do corpo da requisição
  const { pedidoId } = req.body || {};
  if (!pedidoId || typeof pedidoId !== 'string' || !REGEX_PEDIDO_ID.test(pedidoId)) {
    return res.status(400).json({
      erro: 'Parâmetro pedidoId inválido. Deve ter entre 5 e 80 caracteres alfanuméricos, sublinhado ou hífen.'
    });
  }

  let db;
  try {
    obterFirebaseAdmin();
    db = admin.database();
  } catch (erroInit) {
    console.error('[ERRO_INIT_FIREBASE]', erroInit.message);
    return res.status(500).json({ erro: 'Erro interno de configuração do servidor.' });
  }

  const pedidoRef = db.ref(`pedidos/${pedidoId}`);

  try {
    // 1. Verifica existência do pedido
    const snapshotPedido = await pedidoRef.once('value');
    if (!snapshotPedido.exists()) {
      return res.status(404).json({ erro: 'Pedido não encontrado.' });
    }

    const pedido = snapshotPedido.val();

    // 2. Idempotência atômica via transaction em pedidos/{pedidoId}/notificado
    const notificadoRef = pedidoRef.child('notificado');
    const resultadoTransacao = await notificadoRef.transaction((atual) => {
      if (atual === true) {
        return; // Aborta transação se já foi notificado
      }
      return true; // Marca como notificado
    });

    if (!resultadoTransacao.committed) {
      return res.status(200).json({
        sucesso: true,
        jaNotificado: true,
        mensagem: 'Pedido já notificado anteriormente.'
      });
    }

    // 3. Lê tokens cadastrados em adminTokens/{uid}/{token}
    const adminTokensRef = db.ref('adminTokens');
    const snapshotTokens = await adminTokensRef.once('value');
    const dadosTokens = snapshotTokens.val() || {};

    const mapaTokens = []; // { token, uid }
    for (const uid of Object.keys(dadosTokens)) {
      const tokensUsuario = dadosTokens[uid];
      if (tokensUsuario && typeof tokensUsuario === 'object') {
        for (const token of Object.keys(tokensUsuario)) {
          if (typeof token === 'string' && token.trim().length > 0) {
            mapaTokens.push({ token, uid });
          }
        }
      }
    }

    // Se nenhum aparelho registrado, finaliza com sucesso
    if (mapaTokens.length === 0) {
      return res.status(200).json({
        sucesso: true,
        aparelhos: 0,
        mensagem: 'Nenhum aparelho cadastrado para receber notificações.'
      });
    }

    // 4. Monta título e corpo a partir dos dados do pedido no banco
    const nomeCliente = (pedido.cliente && pedido.cliente.nome) ? String(pedido.cliente.nome).trim() : 'Cliente';
    const totalNumerico = typeof pedido.total === 'number' ? pedido.total : parseFloat(pedido.total) || 0;
    const totalFormatado = `R$ ${totalNumerico.toFixed(2).replace('.', ',')}`;
    const codigoPedido = pedido.codigo ? `#${pedido.codigo}` : `#${pedidoId.slice(-5).toUpperCase()}`;

    const tituloPush = `🍔 Novo Pedido ${codigoPedido}!`;
    const corpoPush = `${nomeCliente} • Total: ${totalFormatado}`;

    const listaTokens = mapaTokens.map((item) => item.token);

    // Mensagem FCM data-only com prioridade máxima
    const mensagemFCM = {
      tokens: listaTokens,
      data: {
        titulo: String(tituloPush),
        corpo: String(corpoPush),
        pedidoId: String(pedidoId)
      },
      android: {
        priority: 'high'
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '3600'
        }
      }
    };

    // 5. Envia notificações multicast
    let respostaFCM;
    try {
      respostaFCM = await admin.messaging().sendEachForMulticast(mensagemFCM);
    } catch (erroEnvioMulticast) {
      // Se falhar o envio por completo, desfaz o status notificado para permitir nova tentativa
      await notificadoRef.set(null);
      console.error('[ERRO_ENVIO_FCM_TOTAL]', erroEnvioMulticast);
      return res.status(500).json({ erro: 'Falha ao despachar notificação via FCM.' });
    }

    // 6. Limpeza de tokens inválidos ou não registrados
    const remocoesInvalidas = [];
    respostaFCM.responses.forEach((resp, index) => {
      if (!resp.success) {
        const codigoErro = resp.error ? resp.error.code : '';
        if (
          codigoErro === 'messaging/registration-token-not-registered' ||
          codigoErro === 'messaging/invalid-registration-token'
        ) {
          const itemInvalido = mapaTokens[index];
          if (itemInvalido) {
            console.warn(`[LIMPEZA_TOKEN] Removendo token inválido: ${itemInvalido.token.slice(0, 15)}... do UID: ${itemInvalido.uid}`);
            remocoesInvalidas.push(
              db.ref(`adminTokens/${itemInvalido.uid}/${itemInvalido.token}`).remove()
            );
          }
        } else {
          console.error(`[ERRO_FCM_PARCIAL] Erro ao enviar para token: ${codigoErro}`, resp.error);
        }
      }
    });

    if (remocoesInvalidas.length > 0) {
      await Promise.allSettled(remocoesInvalidas);
    }

    // Se todos os envios falharam por erro de rede/serviço (e não apenas tokens inválidos), desfaz notificado
    if (respostaFCM.successCount === 0 && respostaFCM.failureCount > 0) {
      const apenasTokensInvalidos = respostaFCM.responses.every((r) => {
        const cod = r.error && r.error.code;
        return cod === 'messaging/registration-token-not-registered' || cod === 'messaging/invalid-registration-token';
      });

      if (!apenasTokensInvalidos) {
        await notificadoRef.set(null);
        return res.status(500).json({ erro: 'Não foi possível entregar a notificação aos aparelhos.' });
      }
    }

    return res.status(200).json({
      sucesso: true,
      enviados: respostaFCM.successCount,
      falhas: respostaFCM.failureCount,
      aparelhos: listaTokens.length
    });
  } catch (erroGeral) {
    console.error('[ERRO_NOTIFICAR_SERVIDOR]', erroGeral);
    return res.status(500).json({ erro: 'Erro interno ao processar a notificação do pedido.' });
  }
};
