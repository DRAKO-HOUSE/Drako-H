/**
 * Utilitários de Cor & Acessibilidade WCAG AA
 * Cálculo de luminância relativa, contraste e variações derivadas.
 */

export function hexParaRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  let limpo = hex.replace('#', '').trim();
  if (limpo.length === 3) {
    limpo = limpo.split('').map(c => c + c).join('');
  }
  const num = parseInt(limpo, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export function rgbParaHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function luminanciaRelativa({ r, g, b }) {
  const sRGB = [r, g, b].map(val => {
    val /= 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

export function calcularRazaoContraste(hex1, hex2) {
  const lum1 = luminanciaRelativa(hexParaRgb(hex1));
  const lum2 = luminanciaRelativa(hexParaRgb(hex2));
  const maisClaro = Math.max(lum1, lum2);
  const maisEscuro = Math.min(lum1, lum2);
  return (maisClaro + 0.05) / (maisEscuro + 0.05);
}

/**
 * Garante texto WCAG AA (>= 4.5:1) contra a cor de fundo informada.
 * Retorna #ffffff ou #000000 e se foi necessário fazer ajuste.
 */
export function garantirTextoContraste(corFundoHex) {
  const ratioBranco = calcularRazaoContraste(corFundoHex, '#ffffff');
  const ratioPreto = calcularRazaoContraste(corFundoHex, '#000000');
  const melhorCor = ratioBranco >= ratioPreto ? '#ffffff' : '#111827';
  const maiorRatio = Math.max(ratioBranco, ratioPreto);
  return {
    corTexto: melhorCor,
    ratio: Number(maiorRatio.toFixed(2)),
    atendeWcagAa: maiorRatio >= 4.5
  };
}

/**
 * Clareia ou escurece uma cor HEX por uma porcentagem (-100 a 100).
 */
export function ajustarBrilho(hex, percentual) {
  const rgb = hexParaRgb(hex);
  const fator = percentual / 100;
  return rgbParaHex(
    rgb.r + (fator > 0 ? (255 - rgb.r) * fator : rgb.r * fator),
    rgb.g + (fator > 0 ? (255 - rgb.g) * fator : rgb.g * fator),
    rgb.b + (fator > 0 ? (255 - rgb.b) * fator : rgb.b * fator)
  );
}

/**
 * Gera variações derivadas da cor primária (hover, active, borda, foco, sombras).
 */
export function gerarVariacoesCor(corPrimaria) {
  const rgb = hexParaRgb(corPrimaria);
  return {
    hover: ajustarBrilho(corPrimaria, -12),
    active: ajustarBrilho(corPrimaria, -22),
    clara: ajustarBrilho(corPrimaria, 35),
    bordaFoco: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`,
    sombraGlow: `0 4px 14px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`
  };
}
