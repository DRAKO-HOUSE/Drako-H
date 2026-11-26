// Utilitários compartilhados pelo painel (sem dependência do Firebase).

// Cria elementos sempre com textContent: dados do banco nunca entram como HTML (evita XSS).
export function el(tag, props = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'text') no.textContent = valor;
    else if (chave.startsWith('on')) no.addEventListener(chave.slice(2), valor);
    else if (chave in no) no[chave] = valor;
    else no.setAttribute(chave, valor);
  }
  no.append(...filhos.flat().filter(f => f !== null && f !== undefined && f !== false));
  return no;
}

export const formatarPreco = (valor) => `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
export const somenteDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');
export const formatarDataHora = (ts) =>
  ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

export function lerLocal(chave, padrao = null) {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
}
export function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado: ignora */ }
}

// Aviso rápido no rodapé (usa o estilo .toast-aviso já existente no style.css).
let temporizadorToast = null;
export function toast(mensagem, tipo = 'ok') {
  const caixa = document.getElementById('toast-aviso');
  if (!caixa) return;
  caixa.textContent = mensagem;
  caixa.className = `toast-aviso visivel ${tipo === 'erro' ? 'erro' : ''}`;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { caixa.className = 'toast-aviso'; }, 4200);
}

// Desabilita o botão e mostra "Aguarde..." enquanto a operação roda.
export async function comCarregamento(botao, operacao) {
  const textoOriginal = botao?.textContent;
  if (botao) { botao.disabled = true; botao.textContent = 'Aguarde...'; }
  try { return await operacao(); }
  finally { if (botao) { botao.disabled = false; botao.textContent = textoOriginal; } }
}
