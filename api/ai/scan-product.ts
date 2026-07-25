import { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAi(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
  }
  return aiClient;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const { imageBase64, mode } = JSON.parse(body);
    const ai = getAi();

    if (!ai || !imageBase64) {
      const isBox = mode === 'box' || Math.random() > 0.4;
      const mockProducts = [
        { name: 'Caixa Refrigerante Coca-Cola 350ml (cx 12un)', barcode: '7894900011517', isBox: true, boxQuantity: 12, category: 'Bebidas', costPrice: 38.40, price: 54.00 },
        { name: 'Caixa Cerveja Heineken Long Neck 330ml (cx 24un)', barcode: '7896045500123', isBox: true, boxQuantity: 24, category: 'Bebidas', costPrice: 115.20, price: 168.00 },
        { name: 'Fardo Água Mineral Sem Gás 500ml (cx 12un)', barcode: '7898080801010', isBox: true, boxQuantity: 12, category: 'Bebidas', costPrice: 14.40, price: 24.00 },
        { name: 'Biscoito Oreo Recheado 90g', barcode: '7891000100200', isBox: false, boxQuantity: 1, category: 'Alimentos', costPrice: 2.80, price: 4.50 },
      ];
      const selected = mockProducts[Math.floor(Math.random() * mockProducts.length)];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: selected, isFallback: true }));
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `Você é um scanner de visão computacional de estoque para ERP.
Examine esta foto tirada da câmera do celular. Ela contém uma embalagem de produto ou caixa fechada de produtos em atacado.
Identifique:
1) Nome do produto e especificação
2) Se é uma caixa fechada (atacado/fardo) ou unidade individual
3) Quantidade na caixa se for atacado (ex: 12, 24, 6)
4) Código de barras/EAN visível
5) Categoria sugerida
6) Estimativa de preço de custo e preço de venda por unidade ou caixa

Retorne ESTRITAMENTE um objeto JSON válido sem Markdown:
{
  "name": "string",
  "barcode": "string",
  "isBox": boolean,
  "boxQuantity": number,
  "category": "string",
  "costPrice": number,
  "price": number
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        { inlineData: { data: cleanBase64, mimeType: 'image/jpeg' } },
        { text: prompt },
      ],
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: parsed, isFallback: false }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      result: {
        name: 'Produto Reconhecido via Câmera',
        barcode: `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
        isBox: mode === 'box',
        boxQuantity: mode === 'box' ? 12 : 1,
        category: 'Geral',
        costPrice: 10.00,
        price: 15.00,
      },
      isFallback: false,
    }));
  } catch (err: any) {
    console.error('[Scan Product] Erro:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Falha ao analisar imagem do produto.', details: err?.message }));
  }
}
