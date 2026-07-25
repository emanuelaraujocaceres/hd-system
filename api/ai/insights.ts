import { IncomingMessage, ServerResponse } from 'node:http';

import { GoogleGenAI, ApiError } from '@google/genai';

/**
 * Attempts to extract a retry delay (in seconds) from a quota error.
 * Gemini free tier errors include "retryDelay" of ~55s in the message.
 */
function extractRetryDelay(error: unknown): number | null {
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  // Some SDK versions include "retryDelay: \"NNs\"" or "retry_delay"
  const retryMatch = msg.match(/retry[_\s]?delay[:\s]*"?(\d+)/i);
  if (retryMatch) return parseInt(retryMatch[1], 10);

  // Generic fallback for quota/rate errors
  if (msg.includes('quota') || msg.includes('rate_limit') || msg.includes('resource_exhausted') || msg.includes('429')) {
    return 60; // Default 60s cooldown
  }

  return null;
}

function isQuotaError(error: unknown): boolean {
  // ApiError with status 429
  if (error && typeof error === 'object' && 'status' in error) {
    const err = error as { status: number };
    if (err.status === 429) return true;
  }

  // Check message for quota keywords
  const msg = String(error instanceof Error ? error.message : error).toLowerCase();
  return msg.includes('quota') || msg.includes('rate_limit') || msg.includes('resource_exhausted') || msg.includes('429');
}

function generateFallbackInsight(stockAlertsCount: number): string {
  return `📊 **Análise Inteligente HD-System ERP**
• **Desempenho de Vendas**: Seu faturamento teve um aumento projetado no período. Destaque para produtos da categoria Bebidas e Alimentos.
• **Recomendações de Reposição**: ${stockAlertsCount} produtos abaixo do estoque mínimo. Recomendamos emitir pedido de compra para os itens com maior giro.
• **Fluxo de Caixa**: Mantenha atenção nas contas a pagar previstas para os próximos 7 dias para garantir liquidez positiva.`;
}

function sendJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  // Read JSON body
  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const { salesData, stockAlerts, financialSummary, promptType } = JSON.parse(body);
    const apiKey = process.env.GEMINI_API_KEY;

    // If key is not configured, return fallback insight
    if (!apiKey) {
      sendJson(res, 200, {
        insight: generateFallbackInsight(stockAlerts?.length || 3),
        isFallback: true,
        note: 'Chave Gemini não configurada. Adicione GEMINI_API_KEY nas variáveis de ambiente.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const prompt = `Você é um Consultor Especialista em Gestão Empresarial e ERP/PDV para Varejo no Brasil no HD-System ERP.
Analise os seguintes dados do ERP do cliente e forneça um relatório curto, direto, acionável e com marcadores claros em Português do Brasil:

DADOS DE VENDAS: ${JSON.stringify(salesData || {})}
ALERTAS DE ESTOQUE BAIXO: ${JSON.stringify(stockAlerts || [])}
RESUMO FINANCEIRO: ${JSON.stringify(financialSummary || {})}
TIPO DE SOLICITAÇÃO: ${promptType || 'geral'}

Forneça 3 a 4 tópicos práticos com dicas para aumentar lucro, evitar rupturas de estoque e melhorar a margem de vendas. Seja profissional, encorajador e objetivo.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: prompt,
    });

    sendJson(res, 200, {
      insight: response.text || 'Análise concluída com sucesso.',
      isFallback: false,
    });
  } catch (error: any) {
    console.error('[AI Insights] Erro:', error?.message || error);

    // === Detect quota exceeded (429) ===
    if (isQuotaError(error)) {
      const retryAfter = extractRetryDelay(error) || 60;
      console.warn(`[AI Insights] Cota excedida. Tentar novamente em ${retryAfter}s`);
      sendJson(res, 200, {
        insight: `⚠️ **Cota da IA excedida temporariamente**
A cota gratuita do Gemini foi atingida. Aguarde ${retryAfter} segundos e tente novamente.

💡 **Sugestão:** Para liberar o uso ilimitado, ative o faturamento em https://aistudio.google.com/apikey`,
        retryAfter,
        isFallback: true,
        errorType: 'quota',
      });
      return;
    }

    // === Outros erros (rede, auth, etc) ===
    sendJson(res, 200, {
      insight: `⚠️ **Análise temporariamente indisponível**
O serviço de IA está passando por instabilidade. Tente novamente em alguns instantes.

Enquanto isso:
• Verifique seus relatórios de vendas no Dashboard
• Confira os produtos com estoque baixo na seção de Estoque
• Acompanhe o fluxo de caixa no módulo Financeiro`,
      isFallback: true,
      errorType: 'unknown',
      error: error?.message,
    });
  }
}
