// Cloudflare Pages Function — POST /api/ai/insights
// Adapted from api/ai/insights.ts for Cloudflare Workers runtime
// Uses env.GEMINI_API_KEY instead of process.env.GEMINI_API_KEY

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const { salesData, stockAlerts, financialSummary, promptType } = await request.json();
    const apiKey = env.GEMINI_API_KEY;

    // If key is not configured, return fallback insight
    if (!apiKey) {
      return new Response(JSON.stringify({
        insight: generateFallbackInsight(stockAlerts?.length || 3),
        isFallback: true,
        note: 'Chave Gemini não configurada. Adicione GEMINI_API_KEY nas variáveis de ambiente do Cloudflare.',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Você é um Consultor Especialista em Gestão Empresarial e ERP/PDV para Varejo no Brasil no HD-System ERP.
Analise os seguintes dados do ERP do cliente e forneça um relatório curto, direto, acionável e com marcadores claros em Português do Brasil:

DADOS DE VENDAS: ${JSON.stringify(salesData || {})}
ALERTAS DE ESTOQUE BAIXO: ${JSON.stringify(stockAlerts || [])}
RESUMO FINANCEIRO: ${JSON.stringify(financialSummary || {})}
TIPO DE SOLICITAÇÃO: ${promptType || 'geral'}

Forneça 3 a 4 tópicos práticos com dicas para aumentar lucro, evitar rupturas de estoque e melhorar a margem de vendas. Seja profissional, encorajador e objetivo.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (response.status === 429) {
      return new Response(JSON.stringify({
        insight: `⚠️ **Cota da IA excedida temporariamente**
A cota gratuita do Gemini foi atingida. Aguarde 60 segundos e tente novamente.

💡 **Sugestão:** Para liberar o uso ilimitado, ative o faturamento em https://aistudio.google.com/apikey`,
        retryAfter: 60,
        isFallback: true,
        errorType: 'quota',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Análise concluída com sucesso.';

    return new Response(JSON.stringify({
      insight,
      isFallback: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[AI Insights] Erro:', error?.message || error);
    return new Response(JSON.stringify({
      insight: `⚠️ **Análise temporariamente indisponível**
O serviço de IA está passando por instabilidade. Tente novamente em alguns instantes.

Enquanto isso:
• Verifique seus relatórios de vendas no Dashboard
• Confira os produtos com estoque baixo na seção de Estoque
• Acompanhe o fluxo de caixa no módulo Financeiro`,
      isFallback: true,
      errorType: 'unknown',
      error: error?.message,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function generateFallbackInsight(stockAlertsCount: number): string {
  return `📊 **Análise Inteligente HD-System ERP**
• **Desempenho de Vendas**: Seu faturamento teve um aumento projetado no período. Destaque para produtos da categoria Bebidas e Alimentos.
• **Recomendações de Reposição**: ${stockAlertsCount} produtos abaixo do estoque mínimo. Recomendamos emitir pedido de compra para os itens com maior giro.
• **Fluxo de Caixa**: Mantenha atenção nas contas a pagar previstas para os próximos 7 dias para garantir liquidez positiva.`;
}
