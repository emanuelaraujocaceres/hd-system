import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
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
      appName: "HD-System",
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

      // 1) Valida o chamador: precisa ser superadmin
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) {
        return res.status(401).json({ success: false, message: 'Não autenticado.' });
      }
      const { data: authData, error: getUserErr } = await supabaseAdmin.auth.getUser(token);
      if (getUserErr || !authData?.user) {
        return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
      }
      const { data: callerProfile } = await supabaseAdmin
        .from('system_users')
        .select('superadmin, role, organization_id')
        .eq('id', authData.user.id)
        .maybeSingle();
      // Superadmin pode criar usuário em qualquer org.
      // Admin só pode criar usuário na própria organização.
      const isSuperadmin = callerProfile?.superadmin === true;
      const isAdmin = callerProfile?.role === 'admin';
      if (!isSuperadmin && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Acesso negado: apenas superadmin ou admin.' });
      }

      const { name, email, role, organization_id, store_branch_id, password } = req.body;
      if (!name || !email || !organization_id) {
        return res.status(400).json({ success: false, message: "name, email e organization_id são obrigatórios." });
      }

      // Admin só pode criar usuário na própria organização
      if (!isSuperadmin && callerProfile?.organization_id !== organization_id) {
        return res.status(403).json({ success: false, message: 'Acesso negado: admin só pode criar usuário na própria organização.' });
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

      // Usar senha manual OU gerar temporária se não fornecida
      const finalPassword = password || (
        Math.random().toString(36).slice(2, 6).toUpperCase() +
        Math.random().toString(36).slice(2, 6) +
        Math.random().toString(10).slice(2, 5) +
        "@"
      );

      // 1. Criar no Supabase Auth
      const { data: authUser, error: createUserErr } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password: finalPassword,
        email_confirm: true,
        user_metadata: { name, role: role || "collaborator" },
      });
      if (createUserErr) {
        // Erro específico: e-mail já cadastrado no Auth
        if (createUserErr.message?.includes("already registered") || createUserErr.message?.includes("already exists")) {
          return res.json({ success: false, message: "Este e-mail já possui uma conta no sistema. Use outro e-mail." });
        }
        return res.status(500).json({ success: false, message: `Erro Auth: ${createUserErr.message}` });
      }

      // 2. Inserir em system_users com o mesmo UUID do Auth
      const { error: dbErr } = await supabaseAdmin.from("system_users").insert({
        id: authUser.user.id,
        organization_id,
        name,
        email: email.toLowerCase(),
        role: role || "collaborator",
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
        password: finalPassword,
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

      // 1) Valida o chamador: precisa ser superadmin
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) {
        return res.status(401).json({ success: false, message: 'Não autenticado.' });
      }
      const { data: authData, error: getUserErr2 } = await supabaseAdmin.auth.getUser(token);
      if (getUserErr2 || !authData?.user) {
        return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
      }
      const { data: callerProfile } = await supabaseAdmin
        .from('system_users')
        .select('superadmin')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (!callerProfile?.superadmin) {
        return res.status(403).json({ success: false, message: 'Acesso negado: apenas superadmin.' });
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
      const { data: authUser, error: createUserErr2 } = await supabaseAdmin.auth.admin.createUser({
        email: admin_email.toLowerCase(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: admin_name, role: "admin" },
      });
      if (createUserErr2) {
        if (createUserErr2.message?.includes("already registered") || createUserErr2.message?.includes("already exists")) {
          return res.json({ success: false, message: "Este e-mail já possui uma conta no sistema. Use outro e-mail." });
        }
        return res.status(500).json({ success: false, message: `Erro Auth: ${createUserErr2.message}` });
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

  // ─── WEBHOOK HANDLER ────────────────────────────────────────
  // Recebe notificações de pagamento e roteia para a filial correta
  // URL única para todas as filiais - o roteamento é feito via payment_id
  app.post('/api/webhook', async (req, res) => {
    try {
      const { payment_id, status, event_type, ...extra } = req.body;
      
      if (!payment_id) {
        return res.status(400).json({ error: 'payment_id is required' });
      }

      console.log(`[Webhook] Received: payment_id=${payment_id}, status=${status}, event=${event_type}`);

      if (!supabaseAdmin) {
        return res.status(500).json({ error: 'Service not configured' });
      }

      // 1. Buscar a sale pelo payment_id para descobrir a filial
      const { data: sale, error: saleError } = await supabaseAdmin
        .from('sales')
        .select('id, store_branch_id, organization_id, status, payments')
        .eq('payment_id', payment_id)
        .single();

      if (saleError || !sale) {
        console.warn(`[Webhook] Sale not found for payment_id=${payment_id}`);
        // Salva o evento mesmo assim para auditoria
        await supabaseAdmin.from('webhook_events').insert({
          payment_id,
          event_type: event_type || 'unknown',
          payload: req.body,
          processed: false,
          error_message: 'Sale not found',
        });
        return res.status(404).json({ error: 'Sale not found' });
      }

      // 2. Log do evento
      await supabaseAdmin.from('webhook_events').insert({
        organization_id: sale.organization_id,
        store_branch_id: sale.store_branch_id,
        payment_id,
        event_type: event_type || status || 'unknown',
        payload: req.body,
        processed: true,
        processed_at: new Date().toISOString(),
      });

      // 3. Mapear status do webhook para status da sale
      let newStatus = sale.status;
      let kitchenStatus = null;

      switch (status) {
        case 'approved':
        case 'paid':
        case 'confirmed':
          newStatus = 'completed';
          kitchenStatus = 'pending';
          break;
        case 'refunded':
        case 'charged_back':
          newStatus = 'refunded';
          break;
        case 'cancelled':
        case 'voided':
          newStatus = 'cancelled';
          break;
        case 'declined':
        case 'rejected':
          newStatus = 'declined';
          break;
        case 'pending':
          newStatus = 'pending';
          break;
      }

      // 4. Atualizar status da sale
      const updateData: any = { status: newStatus };
      if (kitchenStatus) updateData.kitchen_status = kitchenStatus;
      updateData.updated_at = new Date().toISOString();

      await supabaseAdmin
        .from('sales')
        .update(updateData)
        .eq('id', sale.id);

      console.log(`[Webhook] Sale ${sale.id} updated: status=${newStatus}, branch=${sale.store_branch_id}`);

      // 5. Retornar sucesso para o provedor de pagamento
      return res.status(200).json({ 
        success: true, 
        message: 'Webhook processed',
        sale_id: sale.id,
        branch_id: sale.store_branch_id,
      });

    } catch (err: any) {
      console.error('[Webhook] Error:', err);
      return res.status(500).json({ error: 'Internal server error' });
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

  // ─── REPROCESSAR DLQ NO STARTUP ──────────────────────────────
  // Ao iniciar o servidor, tenta reprocessar falhas pendentes na
  // tabela movimentacoes_falhas. Usa service_role (byepassa RLS).
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc("reprocessar_movimentacoes_falhas");
      if (error) {
        console.warn("[DLQ] Erro ao reprocessar falhas no startup:", error.message);
      } else {
        console.log(`[DLQ] Reprocessamento no startup: ${JSON.stringify(data)}`);
      }
    } catch (e: any) {
      console.warn("[DLQ] Exceção ao reprocessar falhas no startup:", e?.message);
    }
  } else {
    console.warn("[DLQ] SUPABASE_SERVICE_ROLE_KEY não configurada — reprocessamento automático desativado");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HD-System] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
