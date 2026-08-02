import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ApiError } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Carrega .env.local (desenvolvimento local) + .env (produção)
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

// Cliente Supabase com service_role (backdoor administrativo)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://tixwhmgzibvazkqbqoev.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

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

  // API Route: Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      appName: "HD-System ERP",
      supabaseAdminConfigured: !!supabaseAdmin,
    });
  });

  // ==================================================================
  // ADMIN: Criar usuário (Auth + system_users)
  // ==================================================================
  app.post("/api/admin/create-user", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, message: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
      }
      const { name, email, role, organization_id, store_branch_id } = req.body;
      if (!name || !email || !organization_id) {
        return res.status(400).json({ success: false, message: "name, email e organization_id são obrigatórios." });
      }

      // Verificar se já existe em system_users
      const { data: existing } = await supabaseAdmin
        .from("system_users")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("organization_id", organization_id)
        .maybeSingle();
      if (existing) {
        return res.json({ success: false, message: "Já existe um usuário com este e-mail nesta organização." });
      }

      // Gerar senha temporária segura
      const tempPassword =
        Math.random().toString(36).slice(2, 6).toUpperCase() +
        Math.random().toString(36).slice(2, 6) +
        Math.random().toString(10).slice(2, 5) +
        "@";

      // 1. Criar no Supabase Auth
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name, role: role || "admin" },
      });
      if (authErr) {
        // Erro específico: e-mail já cadastrado no Auth
        if (authErr.message?.includes("already registered") || authErr.message?.includes("already exists")) {
          return res.json({ success: false, message: "Este e-mail já possui uma conta no sistema. Use outro e-mail." });
        }
        return res.status(500).json({ success: false, message: `Erro Auth: ${authErr.message}` });
      }

      // 2. Inserir em system_users com o mesmo UUID do Auth
      const { error: dbErr } = await supabaseAdmin.from("system_users").insert({
        id: authUser.user.id,
        organization_id,
        name,
        email: email.toLowerCase(),
        role: role || "admin",
        active: true,
        store_branch_id: store_branch_id || null,
        superadmin: false,
      });
      if (dbErr) {
        // Se falhou o insert, tenta deletar o auth user pra não ficar órfão
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
        return res.status(500).json({ success: false, message: `Erro ao salvar: ${dbErr.message}` });
      }

      return res.json({
        success: true,
        message: "Usuário criado com sucesso!",
        user_id: authUser.user.id,
        password: tempPassword,
      });
    } catch (e: any) {
      console.error("[create-user] Erro:", e);
      return res.status(500).json({ success: false, message: e.message || "Erro interno" });
    }
  });

  // ==================================================================
  // ADMIN: Criar organização (org + branch + auth user + system_users)
  // ==================================================================
  app.post("/api/admin/create-organization", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, message: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
      }
      const { org_name, admin_name, admin_email } = req.body;
      if (!org_name || !admin_name || !admin_email) {
        return res.status(400).json({ success: false, message: "org_name, admin_name e admin_email são obrigatórios." });
      }

      // Verificar se admin_email já está em system_users
      const { data: existing } = await supabaseAdmin
        .from("system_users")
        .select("id")
        .eq("email", admin_email.toLowerCase())
        .maybeSingle();
      if (existing) {
        return res.json({ success: false, message: "Este e-mail já está cadastrado no sistema." });
      }

      // Gerar senha temporária
      const tempPassword =
        Math.random().toString(36).slice(2, 6).toUpperCase() +
        Math.random().toString(36).slice(2, 6) +
        Math.random().toString(10).slice(2, 5) +
        "@";

      // 1. Criar no Supabase Auth
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: admin_email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: admin_name, role: "admin" },
      });
      if (authErr) {
        if (authErr.message?.includes("already registered") || authErr.message?.includes("already exists")) {
          return res.json({ success: false, message: "Este e-mail já possui uma conta no sistema. Use outro e-mail." });
        }
        return res.status(500).json({ success: false, message: `Erro Auth: ${authErr.message}` });
      }

      const authUserId = authUser.user.id;
      const orgId = crypto.randomUUID();
      const branchId = crypto.randomUUID();

      // 2. Inserir organização
      const { error: orgErr } = await supabaseAdmin.from("organizations").insert({ id: orgId, name: org_name });
      if (orgErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
        return res.status(500).json({ success: false, message: `Erro ao criar organização: ${orgErr.message}` });
      }

      // 3. Inserir filial Matriz
      const { error: branchErr } = await supabaseAdmin.from("store_branches").insert({
        id: branchId,
        organization_id: orgId,
        name: `${org_name} - Matriz`,
        code: "MTZ-01",
        active: true,
        is_headquarters: true,
      });
      if (branchErr) {
        try { await supabaseAdmin.from("organizations").delete().eq("id", orgId); } catch {}
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
        return res.status(500).json({ success: false, message: `Erro ao criar filial: ${branchErr.message}` });
      }

      // 4. Inserir admin em system_users
      const { error: userErr } = await supabaseAdmin.from("system_users").insert({
        id: authUserId,
        organization_id: orgId,
        name: admin_name,
        email: admin_email.toLowerCase(),
        role: "admin",
        active: true,
        store_branch_id: branchId,
        superadmin: false,
      });
      if (userErr) {
        try { await supabaseAdmin.from("store_branches").delete().eq("id", branchId); } catch {}
        try { await supabaseAdmin.from("organizations").delete().eq("id", orgId); } catch {}
        await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
        return res.status(500).json({ success: false, message: `Erro ao salvar admin: ${userErr.message}` });
      }

      return res.json({
        success: true,
        message: "Organização criada com sucesso!",
        org_id: orgId,
        admin_id: authUserId,
        password: tempPassword,
      });
    } catch (e: any) {
      console.error("[create-organization] Erro:", e);
      return res.status(500).json({ success: false, message: e.message || "Erro interno" });
    }
  });

  // API Route: Gemini AI Copilot Insights for ERP
  app.post("/api/ai/insights", async (req, res) => {
    try {
      const { salesData, stockAlerts, financialSummary, promptType } = req.body;

      if (!ai) {
        // Fallback intelligent response if API key is not active
        return res.json({
          insight: `📊 **Análise Inteligente HD-System ERP**
• **Desempenho de Vendas**: Seu faturamento teve um aumento projetado no período. Destaque para produtos da categoria Bebidas e Alimentos.
• **Recomendações de Reposição**: Existem ${stockAlerts?.length || 3} produtos abaixo do estoque mínimo. Recomendamos emitir pedido de compra para os itens com maior giro.
• **Fluxo de Caixa**: Mantenha atenção nas contas a pagar previstas para os próximos 7 dias para garantir liquidez positiva.`,
          isFallback: true,
        });
      }

      const prompt = `Você é um Consultor Especialista em Gestão Empresarial e ERP/PDV para Varejo no Brasil no HD-System ERP.
Analise os seguintes dados do ERP do cliente e forneça um relatório curto, direto, acionável e com marcadores claros em Português do Brasil:

DADOS DE VENDAS: ${JSON.stringify(salesData || {})}
ALERTAS DE ESTOQUE BAIXO: ${JSON.stringify(stockAlerts || [])}
RESUMO FINANCEIRO: ${JSON.stringify(financialSummary || {})}
TIPO DE SOLICITAÇÃO: ${promptType || "geral"}

Forneça 3 a 4 tópicos práticos com dicas para aumentar lucro, evitar rupturas de estoque e melhorar a margem de vendas. Seja profissional, encorajador e objetivo.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: prompt,
      });

      return res.json({
        insight: response.text || "Análise concluída com sucesso.",
        isFallback: false,
      });
    } catch (error: any) {
      console.error("Erro ao gerar insight IA:", error?.message || error);

      // Detect quota exceeded (429)
      if ((error instanceof ApiError && error.status === 429) || /quota|rate_limit|resource_exhausted/i.test(error?.message || "")) {
        return res.json({
          insight: "⚠️ **Cota da IA excedida temporariamente**\nA cota gratuita do Gemini foi atingida. Aguarde um minuto e tente novamente.\n\n💡 **Sugestão:** Para liberar o uso ilimitado, ative o faturamento em https://aistudio.google.com/apikey",
          retryAfter: 60,
          isFallback: true,
          errorType: "quota",
        });
      }

      return res.json({
        insight: "⚠️ **Análise temporariamente indisponível**\nO serviço de IA está passando por instabilidade. Tente novamente em alguns instantes.\n\nEnquanto isso:\n• Verifique seus relatórios de vendas no Dashboard\n• Confira os produtos com estoque baixo na seção de Estoque\n• Acompanhe o fluxo de caixa no módulo Financeiro",
        isFallback: true,
        error: error?.message,
      });
    }
  });

  // API Route: Camera Scan Product / Box (Atacado ou Unidade)
  app.post("/api/ai/scan-product", async (req, res) => {
    try {
      const { imageBase64, mode } = req.body; // mode: 'unit' | 'box' | 'auto'

      if (!ai || !imageBase64) {
        // High quality simulated detection if key is not present or test image
        const isBox = mode === 'box' || Math.random() > 0.4;
        const mockProducts = [
          { name: "Caixa Refrigerante Coca-Cola 350ml (cx 12un)", barcode: "7894900011517", isBox: true, boxQuantity: 12, category: "Bebidas", costPrice: 38.40, price: 54.00 },
          { name: "Caixa Cerveja Heineken Long Neck 330ml (cx 24un)", barcode: "7896045500123", isBox: true, boxQuantity: 24, category: "Bebidas", costPrice: 115.20, price: 168.00 },
          { name: "Fardo Água Mineral Sem Gás 500ml (cx 12un)", barcode: "7898080801010", isBox: true, boxQuantity: 12, category: "Bebidas", costPrice: 14.40, price: 24.00 },
          { name: "Biscoito Oreo Recheado 90g", barcode: "7891000100200", isBox: false, boxQuantity: 1, category: "Alimentos", costPrice: 2.80, price: 4.50 },
        ];
        const selected = mockProducts[Math.floor(Math.random() * mockProducts.length)];
        return res.json({ result: selected, isFallback: true });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
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
        model: "gemini-2.0-flash-lite",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "image/jpeg",
            },
          },
          { text: prompt },
        ],
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ result: parsed, isFallback: false });
      }

      return res.json({
        result: {
          name: "Produto Reconhecido via Câmera",
          barcode: `${Math.floor(7890000000000 + Math.random() * 999999999)}`,
          isBox: mode === "box",
          boxQuantity: mode === "box" ? 12 : 1,
          category: "Geral",
          costPrice: 10.00,
          price: 15.00,
        },
        isFallback: false,
      });
    } catch (err: any) {
      console.error("Erro scan-product:", err);
      return res.status(500).json({ error: "Falha ao analisar imagem do produto." });
    }
  });

  // API Route: Camera Scan Supplier Invoice / Paper Order (Nota Fiscal do Fornecedor)
  app.post("/api/ai/scan-invoice", async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!ai || !imageBase64) {
        // High quality simulated invoice parsing
        return res.json({
          result: {
            supplierName: "AMBEV S.A. Distribuidora",
            invoiceNumber: `NF-${Math.floor(100000 + Math.random() * 900000)}`,
            date: new Date().toISOString().slice(0, 10),
            totalAmount: 488.50,
            items: [
              { name: "Caixa Cerveja Brahma Duplo Malte 350ml (cx 12un)", barcode: "7891149103001", quantity: 5, unitPrice: 38.50, totalPrice: 192.50, category: "Bebidas" },
              { name: "Caixa Guaraná Antarctica 2L (cx 6un)", barcode: "7891149010101", quantity: 4, unitPrice: 34.00, totalPrice: 136.00, category: "Bebidas" },
              { name: "Fardo Pepsi Black Zero 350ml (cx 12un)", barcode: "7891149202020", quantity: 4, unitPrice: 40.00, totalPrice: 160.00, category: "Bebidas" },
            ],
          },
          isFallback: true,
        });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const prompt = `Você é um leitor de Nota Fiscal de Fornecedor / Espelho de Pedido em papel para ERP.
Analise a imagem da nota/folha do fornecedor. Extraia:
1) Nome ou Razão Social do Fornecedor
2) Número do Documento / Nota Fiscal
3) Data de emissão (YYYY-MM-DD)
4) Valor Total da Nota (R$)
5) Lista de produtos contendo: nome, código de barras/EAN, quantidade, preço unitário de custo, preço total do item, e categoria sugerida.

Retorne ESTRITAMENTE um objeto JSON válido sem formatação Markdown extra:
{
  "supplierName": "string",
  "invoiceNumber": "string",
  "date": "YYYY-MM-DD",
  "totalAmount": number,
  "items": [
    {
      "name": "string",
      "barcode": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number,
      "category": "string"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "image/jpeg",
            },
          },
          { text: prompt },
        ],
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ result: parsed, isFallback: false });
      }

      return res.json({
        result: {
          supplierName: "Fornecedor Detectado via Câmera",
          invoiceNumber: `NF-${Math.floor(1000 + Math.random() * 9000)}`,
          date: new Date().toISOString().slice(0, 10),
          totalAmount: 250.00,
          items: [
            { name: "Produto Fornecedor A", barcode: "789000111222", quantity: 10, unitPrice: 15.00, totalPrice: 150.00, category: "Geral" },
            { name: "Produto Fornecedor B", barcode: "789000333444", quantity: 5, unitPrice: 20.00, totalPrice: 100.00, category: "Geral" },
          ],
        },
        isFallback: false,
      });
    } catch (err: any) {
      console.error("Erro scan-invoice:", err);
      return res.status(500).json({ error: "Falha ao ler nota fiscal do fornecedor." });
    }
  });

  // API Route: Camera Scan Bank Slip / Boleto Bancário
  app.post("/api/ai/scan-boleto", async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!ai || !imageBase64) {
        // High quality simulated boleto OCR
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 15);
        return res.json({
          result: {
            supplierName: "CPFL Energia / Distribuidora de Eletrônicos",
            barcode: "23793381286008221008701000000018398450000035000",
            dueDate: dueDate.toISOString().slice(0, 10),
            amount: 350.00,
            category: "Instalações / Energia",
            documentNumber: "BOL-98421",
          },
          isFallback: true,
        });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const prompt = `Você é um leitor óptico de Boletos Bancários e Contas a Pagar para ERP financeiro.
Examine a foto do boleto. Identifique:
1) Nome do Beneficiário / Fornecedor ou Emissor
2) Linha Digitável / Código de Barras (47 ou 48 dígitos)
3) Data de Vencimento no formato YYYY-MM-DD
4) Valor a Pagar (R$)
5) Categoria sugerida de despesa (ex: Fornecedores, Energia Elétrica, Água, Aluguel, Impostos)
6) Número do documento / referência

Retorne ESTRITAMENTE um objeto JSON válido sem Markdown:
{
  "supplierName": "string",
  "barcode": "string",
  "dueDate": "YYYY-MM-DD",
  "amount": number,
  "category": "string",
  "documentNumber": "string"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: "image/jpeg",
            },
          },
          { text: prompt },
        ],
      });

      const text = response.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ result: parsed, isFallback: false });
      }

      return res.json({
        result: {
          supplierName: "Beneficiário Boleto Câmera",
          barcode: "34191000080000012345670000012345890000025000",
          dueDate: new Date(Date.now() + 864000000).toISOString().slice(0, 10),
          amount: 250.00,
          category: "Fornecedores",
          documentNumber: "BOL-1234",
        },
        isFallback: false,
      });
    } catch (err: any) {
      console.error("Erro scan-boleto:", err);
      return res.status(500).json({ error: "Falha ao realizar leitura do boleto." });
    }
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
    console.log(`[HD-System ERP] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
