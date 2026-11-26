// Impressão de pedidos: Web Bluetooth + ESC/POS, com alternativa via window.print().

const UUIDS_SERVICO = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
];
const TAMANHO_PEDACO = 100;          // bytes por envio (limite seguro do BLE)
const ESPERA_ENTRE_PEDACOS_MS = 40;  // evita estourar o buffer da impressora

export const MSG_SEM_BLUETOOTH =
  'Seu navegador não suporta Bluetooth. Use Chrome ou Edge (Android ou computador). No Brave, ative brave://flags/#brave-web-bluetooth-api';

const estado = {
  dispositivo: null,
  caracteristica: null,
  fila: Promise.resolve(),
  reconectando: false,
  desconexaoManual: false,
  aoMudarStatus: () => {},
  aoFalhar: () => {}
};

export const bluetoothDisponivel = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const impressoraConectada = () => !!(estado.caracteristica && estado.dispositivo?.gatt?.connected);

export function configurarCallbacks({ aoMudarStatus, aoFalhar }) {
  if (aoMudarStatus) estado.aoMudarStatus = aoMudarStatus;
  if (aoFalhar) estado.aoFalhar = aoFalhar;
}

// ---------- Conexão ----------

// Abre o GATT e procura uma characteristic gravável em qualquer serviço permitido.
async function abrirCanal(dispositivo) {
  const servidor = await dispositivo.gatt.connect();
  for (const servico of await servidor.getPrimaryServices()) {
    const caracteristicas = await servico.getCharacteristics();
    const gravavel = caracteristicas.find(c => c.properties.write || c.properties.writeWithoutResponse);
    if (gravavel) return gravavel;
  }
  throw new Error('Esta impressora não tem canal de escrita compatível.');
}

// Tenta reconectar uma única vez quando a conexão cai sozinha.
async function aoDesconectar() {
  estado.caracteristica = null;
  estado.aoMudarStatus(false, estado.dispositivo?.name);
  if (estado.desconexaoManual || estado.reconectando) return;
  estado.reconectando = true;
  try {
    estado.caracteristica = await abrirCanal(estado.dispositivo);
    estado.aoMudarStatus(true, estado.dispositivo.name);
  } catch {
    estado.aoFalhar('A impressora desconectou. Reconecte na aba Impressora.');
  } finally {
    estado.reconectando = false;
  }
}

// Precisa ser chamada a partir de um clique (exigência do Web Bluetooth).
export async function conectarImpressora() {
  if (!bluetoothDisponivel()) throw new Error(MSG_SEM_BLUETOOTH);
  const dispositivo = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: UUIDS_SERVICO
  });
  if (estado.dispositivo) estado.dispositivo.removeEventListener('gattserverdisconnected', aoDesconectar);
  estado.dispositivo = dispositivo;
  estado.desconexaoManual = false;
  dispositivo.addEventListener('gattserverdisconnected', aoDesconectar);
  estado.caracteristica = await abrirCanal(dispositivo);
  estado.aoMudarStatus(true, dispositivo.name);
}

export function desconectarImpressora() {
  estado.desconexaoManual = true;
  if (estado.dispositivo?.gatt?.connected) estado.dispositivo.gatt.disconnect();
  estado.caracteristica = null;
  estado.aoMudarStatus(false, estado.dispositivo?.name);
}

// ---------- Envio (fila: um cupom por vez) ----------

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function escrever(bytes) {
  if (!impressoraConectada()) throw new Error('Impressora não conectada.');
  const c = estado.caracteristica;
  const semResposta = c.properties.writeWithoutResponse && c.writeValueWithoutResponse;
  for (let i = 0; i < bytes.length; i += TAMANHO_PEDACO) {
    const pedaco = bytes.slice(i, i + TAMANHO_PEDACO);
    if (semResposta) await c.writeValueWithoutResponse(pedaco);
    else await c.writeValue(pedaco);
    await esperar(ESPERA_ENTRE_PEDACOS_MS);
  }
}

function enviar(bytes) {
  const tarefa = estado.fila.then(() => escrever(bytes));
  estado.fila = tarefa.catch(() => {}); // um erro não trava os próximos cupons
  return tarefa;
}

// ---------- Montagem do cupom ----------

// Remove acentos e caracteres fora do ASCII: impressoras térmicas costumam quebrar com eles.
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
const dinheiro = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

function quebrar(texto, largura) {
  const linhas = [];
  let atual = '';
  for (const palavra of semAcento(texto).split(/\s+/).filter(Boolean)) {
    let p = palavra;
    while (p.length > largura) {
      if (atual) { linhas.push(atual); atual = ''; }
      linhas.push(p.slice(0, largura));
      p = p.slice(largura);
    }
    if (!atual) atual = p;
    else if ((atual + ' ' + p).length <= largura) atual += ' ' + p;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// Texto à esquerda e valor à direita na mesma linha.
function duasColunas(esquerda, direita, colunas, negrito = false) {
  const valor = semAcento(direita);
  const partes = quebrar(esquerda, Math.max(colunas - valor.length - 1, 8));
  if (!partes.length) partes.push('');
  return partes.map((t, i) => ({
    texto: i === partes.length - 1 ? t.padEnd(colunas - valor.length) + valor : t,
    negrito
  }));
}

// Devolve uma lista neutra de linhas; serve tanto para ESC/POS quanto para o navegador.
export function montarCupom(pedido, { nomeRestaurante = 'DRAKO HOUSE', colunas = 32 } = {}) {
  const linhas = [];
  const add = (texto, opcoes = {}) => quebrar(texto, colunas).forEach(t => linhas.push({ texto: t, ...opcoes }));
  const separador = () => linhas.push({ texto: '-'.repeat(colunas) });
  const itens = Array.isArray(pedido.itens) ? pedido.itens : Object.values(pedido.itens || {});
  const cliente = pedido.cliente || {};
  const entrega = pedido.tipo === 'entrega';

  add(nomeRestaurante, { negrito: true, centro: true });
  separador();
  add(`Pedido #${pedido.codigo || '-'}`, { negrito: true });
  add(new Date(pedido.criadoEm || Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
  add(entrega ? 'ENTREGA' : 'RETIRADA NO LOCAL', { negrito: true });
  add(`Cliente: ${cliente.nome || ''}`);
  add(`Tel: ${cliente.telefone || ''}`);
  if (entrega) {
    add(`End: ${cliente.endereco || ''}, ${cliente.numero || ''}`);
    add(`Bairro: ${cliente.bairro || ''}`);
    if (cliente.referencia) add(`Ref: ${cliente.referencia}`);
  }
  separador();
  for (const item of itens) {
    duasColunas(`${item.qtd}x ${item.nome}`, dinheiro(item.subtotal), colunas).forEach(l => linhas.push(l));
    for (const a of item.adicionais || []) add(`  + ${a.nome}`);
    if (item.observacao) add(`  Obs: ${item.observacao}`);
  }
  separador();
  duasColunas('Subtotal', dinheiro(pedido.subtotal), colunas).forEach(l => linhas.push(l));
  if (entrega) duasColunas('Taxa de entrega', dinheiro(pedido.taxa), colunas).forEach(l => linhas.push(l));
  duasColunas('TOTAL', dinheiro(pedido.total), colunas, true).forEach(l => linhas.push(l));
  add(`Pagamento: ${pedido.pagamento || ''}`);
  if (pedido.troco) add(`Troco para: ${pedido.troco}`);
  separador();
  add('Obrigado pela preferencia', { centro: true });
  return linhas;
}

// Converte as linhas em bytes ESC/POS.
function paraEscPos(linhas) {
  const bytes = [0x1B, 0x40];                       // ESC @ : reset
  let centro = null, negrito = null;
  for (const l of linhas) {
    const c = !!l.centro, n = !!l.negrito;
    if (c !== centro) { bytes.push(0x1B, 0x61, c ? 1 : 0); centro = c; }   // ESC a : alinhamento
    if (n !== negrito) { bytes.push(0x1B, 0x45, n ? 1 : 0); negrito = n; } // ESC E : negrito
    for (const ch of l.texto) bytes.push(ch.charCodeAt(0) & 0xFF);
    bytes.push(0x0A);
  }
  bytes.push(0x1B, 0x45, 0, 0x1B, 0x61, 0);          // volta ao normal
  bytes.push(0x1B, 0x64, 0x04);                      // ESC d 4 : avança o papel
  bytes.push(0x1D, 0x56, 0x00);                      // GS V 0 : corte
  return Uint8Array.from(bytes);
}

export const imprimirPedido = (pedido, opcoes) => enviar(paraEscPos(montarCupom(pedido, opcoes)));

const PEDIDO_TESTE = {
  codigo: 'TESTE', criadoEm: Date.now(), tipo: 'entrega', pagamento: 'Dinheiro', troco: 'R$ 50,00',
  cliente: { nome: 'Cliente de Teste', telefone: '74999998888', endereco: 'Rua Exemplo', numero: '10', bairro: 'Centro' },
  itens: [{ qtd: 1, nome: 'Batata Calabresa (G)', subtotal: 28, adicionais: [{ nome: 'Cheddar' }], observacao: 'Sem cebola' }],
  subtotal: 28, taxa: 5, total: 33
};
export const imprimirTeste = (opcoes) => imprimirPedido(PEDIDO_TESTE, opcoes);

// ---------- Alternativa: impressão pelo navegador (qualquer impressora instalada) ----------

function paraTexto(linhas, colunas) {
  return linhas.map(l => l.centro
    ? ' '.repeat(Math.max(Math.floor((colunas - l.texto.length) / 2), 0)) + l.texto
    : l.texto).join('\n');
}

export function imprimirPeloNavegador(pedido, opcoes = {}) {
  const colunas = opcoes.colunas || 32;
  const area = document.createElement('pre');
  area.id = 'area-impressao';
  area.className = colunas >= 48 ? 'papel-80' : 'papel-58';
  area.textContent = paraTexto(montarCupom(pedido, opcoes), colunas); // textContent: sem risco de XSS
  document.body.appendChild(area);
  window.addEventListener('afterprint', () => area.remove(), { once: true });
  window.print();
}
export const imprimirTestePeloNavegador = (opcoes) => imprimirPeloNavegador(PEDIDO_TESTE, opcoes);
