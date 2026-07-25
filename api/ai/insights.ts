import { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Only accept POST
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        insight:
`📊 **Análise Inteligente HD-System ERP**
• **Desempenho de Vendas**: Seu faturamento teve um aumento projetado no período. Destaque para produtos da categoria Bebidas e Alimentos.
• **Recomendações de Reposição**: ${stockAlerts?.length || 3} produtos abaixo do estoque mínimo. Recomendamos emitir pedido de compra para os itens com maior giro.
• **Fluxo de Caixa**: Mantenha atenção nas contas a pagar previstas para os próximos 7 dias para garantir liquidez positiva.`,
        isFallback: true,
      }));
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
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      insight: response.text || 'Análise concluída com sucesso.',
      isFallback: false,
    }));
  } catch (error: any) {
    console.error('[AI Insights] Erro:', error);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      insight:
`⚠️ **Análise temporariamente indisponível**
O serviço de IA está passando por instabilidade. Tente novamente em alguns instantes.

Enquanto isso:
• Verifique seus relatórios de vendas no Dashboard
• Confira os produtos com estoque baixo na seção de Estoque
• Acompanhe o fluxo de caixa no módulo Financeiro`,
      isFallback: true,
      error: error?.message,
    }));
  }
}
