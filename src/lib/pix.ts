/**
 * PIX BR Code Payload Generator
 *
 * Gera payload válido no formato EMV/BR Code conforme padrão
 * do Banco Central do Brasil (BACEN).
 *
 * Referência: https://www.bcb.gov.br/content/estabilidadefinanceira/forumpireunioes/202009011/pixmanualv1010020200901.pdf
 */

import QRCode from 'qrcode';

// ─── CRC-16/CCITT (padrão BR Code) ──────────────────────────────

function crc16Ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// ─── Helpers ────────────────────────────────────────────────────

/** Remove acentos e caracteres não-ISO-8859-1 (obrigatório para BR Code) */
function stripAscii(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

/** Monta um campo TLV (Tag-Length-Value) do EMV */
function tlv(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, '0')}${value}`;
}

// ─── Types ──────────────────────────────────────────────────────

export interface PixPayloadOptions {
  /** Chave PIX do destinatário (CPF, CNPJ, e-mail, telefone ou UUID) */
  chavePix: string;
  /** Valor em reais (ex: 42.50) */
  valor: number;
  /** Nome do titular / estabelecimento (max 25 chars) */
  nomeTitular: string;
  /** Cidade do titular (max 15 chars) */
  cidade: string;
  /** Texto livre adicional (aparece no "Adicionais" do BR Code) */
  identificador?: string;
}

export interface PixQrCodeOptions extends PixPayloadOptions {
  /** Largura da imagem em pixels (default: 300) */
  width?: number;
  /** Margem em módulos (default: 2) */
  margin?: number;
}

// ─── Payload Builder ────────────────────────────────────────────

/**
 * Gera o payload PIX no formato EMV/BR Code.
 *
 * Tags incluídas:
 *   00 - Payload Format Indicator ("01")
 *   26 - Merchant Account Information (GUI + chave)
 *   52 - Merchant Category Code ("0000")
 *   53 - Transaction Currency ("986" = BRL)
 *   54 - Transaction Amount
 *   58 - Country Code ("BR")
 *   59 - Merchant Name
 *   60 - Merchant City
 *   62 - Additional Data (TXID)
 *   63 - CRC16
 */
export function generatePixPayload(opts: PixPayloadOptions): string {
  const {
    chavePix,
    valor,
    nomeTitular,
    cidade,
    identificador = '***',
  } = opts;

  const nomeClean = stripAscii(nomeTitular).slice(0, 25) || 'HD-SYSTEM';
  const cidadeClean = stripAscii(cidade).slice(0, 15) || 'SAO PAULO';
  const chaveClean = chavePix.trim();
  const txid = stripAscii(identificador).slice(0, 25) || '***';

  // Montar payload
  let payload = '';

  // 00 — Payload Format Indicator
  payload += tlv('00', '01');

  // 26 — Merchant Account Information (GUI + Chave PIX)
  payload += tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', chaveClean));

  // 52 — Merchant Category Code
  payload += tlv('52', '0000');

  // 53 — Transaction Currency (BRL)
  payload += tlv('53', '986');

  // 54 — Transaction Amount (opcional, mas recomendado para QR Code de pagamento)
  if (valor > 0) {
    const valorStr = valor.toFixed(2);
    payload += tlv('54', valorStr);
  }

  // 58 — Country Code
  payload += tlv('58', 'BR');

  // 59 — Merchant Name
  payload += tlv('59', nomeClean);

  // 60 — Merchant City
  payload += tlv('60', cidadeClean);

  // 62 — Additional Data Field (TXID)
  payload += tlv('62', tlv('05', txid));

  // 63 — CRC16
  const crcBase = payload + '6304';
  const crc = crc16Ccitt(crcBase);

  return crcBase + crc;
}

// ─── QR Code Generator ──────────────────────────────────────────

/**
 * Gera QR Code PIX como DataURL (base64 PNG).
 * Uso: `<img src={dataUrl} />`
 */
export async function generatePixQrCode(opts: PixQrCodeOptions): Promise<string> {
  const {
    width = 300,
    margin = 2,
    ...payloadOpts
  } = opts;

  const payload = generatePixPayload(payloadOpts);

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin,
    width,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}

/**
 * Gera QR Code PIX como Buffer (para impressão térmica, etc.)
 */
export async function generatePixQrCodeBuffer(
  opts: PixQrCodeOptions,
): Promise<Buffer> {
  const {
    width = 300,
    margin = 2,
    ...payloadOpts
  } = opts;

  const payload = generatePixPayload(payloadOpts);

  return QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M',
    margin,
    width,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}
