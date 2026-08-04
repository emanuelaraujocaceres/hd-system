// Cloudflare Pages Function — POST /api/ai/scan-boleto
// Decodificação determinística do código de barras (SEM IA).
// Endpoint de apoio: o frontend já decodifica localmente; este endpoint existe
// para casos em que os dígitos precisam ser validados/devolvidos pelo servidor.

import { decodeBoleto } from './boletoLib';

function jsonResponse(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context: any) {
  try {
    const body = await context.request.json();
    const barcode = typeof body?.barcode === 'string' ? body.barcode : '';

    const decoded = decodeBoleto(barcode);
    if (!decoded.type || !decoded.barcode) {
      return jsonResponse(
        { error: 'Código de barras inválido. Envie os 44, 47 ou 48 dígitos.', result: null },
        422
      );
    }

    return jsonResponse(
      {
        result: {
          supplierName: decoded.supplierName || '',
          barcode: decoded.barcode,
          dueDate: decoded.dueDate || '',
          amount: decoded.amount,
          category: decoded.category || 'Fornecedores',
          documentNumber: '',
          source: decoded.type,
          barcodeValid: decoded.barcodeValid,
        },
        isFallback: false,
      },
      200
    );
  } catch (err: any) {
    return jsonResponse({ error: 'Falha ao ler o boleto.', details: err?.message }, 500);
  }
}
