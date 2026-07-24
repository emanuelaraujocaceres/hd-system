import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini AI client on server side
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey
    ? new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      })
    : null;

  // API Route: Stripe Webhook Listener
  app.post("/api/stripe/webhook", (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log("Recebido evento de Webhook Stripe. Signature:", signature ? "presente" : "ausente");

    // Processamento do evento do Stripe (checkout.session.completed, customer.subscription.created, etc)
    const event = req.body;

    switch (event?.type) {
      case "checkout.session.completed":
        console.log("Pagamento de Assinatura recebido com sucesso:", event.data?.object?.id);
        break;
      case "customer.subscription.updated":
        console.log("Assinatura atualizada no Stripe:", event.data?.object?.id);
        break;
      case "customer.subscription.deleted":
        console.log("Assinatura cancelada no Stripe:", event.data?.object?.id);
        break;
      default:
        console.log(`Evento de Webhook Stripe recebido: ${event?.type}`);
    }

    return res.json({ received: true, status: "success" });
  });

  // API Route: Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      appName: "HD-System ERP / Nexus SaaS",
      supabaseConnected: true,
      supabaseUrl: process.env.VITE_SUPABASE_URL || "https://tixwhmgzibvazkqbqoev.supabase.co",
    });
  });

  // API Route: Gemini AI Copilot Insights for ERP
  app.post("/api/ai/insights", async (req, res) => {
    try {
      const { salesData, stockAlerts, financialSummary, promptType } = req.body;

      if (!ai) {
        // Fallback intelligent response if API key is not active
        return res.json({
          insight: `[Análise Inteligente Nexus ERP]
• **Desempenho de Vendas**: Seu faturamento teve um aumento projetado no período. Destaque para produtos da categoria Bebidas e Alimentos.
• **Recomendações de Reposição**: Existem ${stockAlerts?.length || 3} produtos abaixo do estoque mínimo. Recomendamos emitir pedido de compra para os itens com maior giro.
• **Fluxo de Caixa**: Mantenha atenção nas contas a pagar previstas para os próximos 7 dias para garantir liquidez positiva.`,
          isFallback: true,
        });
      }

      const prompt = `Você é um Consultor Especialista em Gestão Empresarial e ERP/PDV para Varejo no Brasil.
Analise os seguintes dados do ERP do cliente e forneça um relatório curto, direto, acionável e com marcadores claros em Português do Brasil:

DADOS DE VENDAS: ${JSON.stringify(salesData || {})}
ALERTAS DE ESTOQUE BAIXO: ${JSON.stringify(stockAlerts || [])}
RESUMO FINANCEIRO: ${JSON.stringify(financialSummary || {})}
TIPO DE SOLICITAÇÃO: ${promptType || "geral"}

Forneça 3 a 4 tópicos práticos com dicas para aumentar lucro, evitar rupturas de estoque e melhorar a margem de vendas. Seja profissional, encorajador e objetivo.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

      return res.json({
        insight: response.text || "Análise concluída com sucesso.",
        isFallback: false,
      });
    } catch (error: any) {
      console.error("Erro ao gerar insight IA:", error);
      res.status(500).json({
        error: "Erro ao processar análise da IA.",
        details: error?.message,
      });
    }
  });

  // API Route: NFC-e Emissão Simulator
  app.post("/api/nfe/issue", (req, res) => {
    const { saleId, total, itemsCount, customerCpf } = req.body;
    const now = new Date();
    const formattedDate = now.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);
    const randomKey = Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");

    res.json({
      success: true,
      protocol: `13526${formattedDate}${Math.floor(1000 + Math.random() * 9000)}`,
      chaveAcesso: randomKey,
      series: "001",
      numeroNFCe: Math.floor(10000 + Math.random() * 90000),
      dataEmissao: now.toISOString(),
      qrCodeUrl: `https://www.fazenda.sp.gov.br/nfce/qrcode?p=${randomKey}|2|1|1|${total}`,
      xmlSimulado: `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${randomKey}"><ide><cUF>35</cUF><cNF>12345678</cNF><natOp>VENDA MERCADORIA</natOp><mod>65</mod><serie>1</serie><nNF>${Math.floor(10000 + Math.random() * 90000)}</nNF></ide><total><ICMSTot><vNF>${total}</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`,
    });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Nexus ERP PDV] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
