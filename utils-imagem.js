/**
 * Utilitários de Imagem, Compressão Canvas e Sanitização SVG
 */

/**
 * Sanitiza código SVG removendo tags <script>, atributos onload/onerror/onclick e links maliciosos.
 */
export function sanitizarSvg(codigoSvg) {
  if (typeof codigoSvg !== 'string') return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(codigoSvg, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Arquivo SVG inválido ou corrompido.');
  }

  // Remove tags script, foreignObject, iframe, embed, object
  const tagsPerigosas = ['script', 'foreignobject', 'iframe', 'embed', 'object'];
  tagsPerigosas.forEach(tag => {
    doc.querySelectorAll(tag).forEach(el => el.remove());
  });

  // Remove atributos inline com javascript: ou handlers on*
  const todosElementos = doc.querySelectorAll('*');
  todosElementos.forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const nome = attr.name.toLowerCase();
      const valor = attr.value.trim().toLowerCase();
      if (nome.startsWith('on') || valor.startsWith('javascript:') || valor.startsWith('data:text/html')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(doc.documentElement);
}

/**
 * Comprime e redimensiona imagem para base64 com limite de dimensão e tamanho.
 * @param {File} arquivo
 * @param {Object} opcoes { larguraMax: 400, alturaMax: 400, qualidade: 0.85, tamanhoMaxBytes: 300 * 1024 }
 */
export async function comprimirImagemParaBase64(arquivo, opcoes = {}) {
  const {
    larguraMax = 400,
    alturaMax = 400,
    qualidade = 0.82,
    tamanhoMaxBytes = 300 * 1024
  } = opcoes;

  const tipo = arquivo.type;

  // Se for SVG, sanitiza e converte para Data URL
  if (tipo === 'image/svg+xml') {
    const textoSvg = await arquivo.text();
    const svgLimpo = sanitizarSvg(textoSvg);
    const base64Svg = `data:image/svg+xml;utf8,${encodeURIComponent(svgLimpo)}`;
    if (new Blob([base64Svg]).size > tamanhoMaxBytes) {
      throw new Error(`SVG excede o limite de ${(tamanhoMaxBytes / 1024).toFixed(0)} KB.`);
    }
    return base64Svg;
  }

  // Formatos raster: JPG, PNG, WEBP
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Erro ao ler arquivo da imagem.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        let { width, height } = img;

        if (width > larguraMax || height > alturaMax) {
          const proporcao = Math.min(larguraMax / width, alturaMax / height);
          width = Math.round(width * proporcao);
          height = Math.round(height * proporcao);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Gera WebP ou JPEG para máxima compressão
        const formatoSaida = tipo === 'image/png' ? 'image/webp' : 'image/jpeg';
        let base64 = canvas.toDataURL(formatoSaida, qualidade);

        // Fallback caso navegador não suporte webp no toDataURL
        if (base64.length > tamanhoMaxBytes * 1.37) {
          base64 = canvas.toDataURL('image/jpeg', 0.7);
        }

        const tamanhoBytes = Math.round((base64.length * 3) / 4);
        if (tamanhoBytes > tamanhoMaxBytes) {
          reject(new Error(`A imagem comprimida (${(tamanhoBytes / 1024).toFixed(0)} KB) ultrapassa o limite de ${(tamanhoMaxBytes / 1024).toFixed(0)} KB.`));
          return;
        }

        resolve(base64);
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}
