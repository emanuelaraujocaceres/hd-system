# Proposta de Estrutura de Dados — Tabela `purchase_documents`

> **Status:** PROPOSTA (Fase 0). **Não executado.** Nenhuma migration aplicada.
> Alvo: registrar o documento de entrada (NF-e / pedido / controle interno) e suas
> movimentações, vindo de 3 fontes: `ocr` (papel), `xml` (NF-e), `manual`.

## 1. Princípios (herdados do AGENTS.md)
- Multi-tenant rigoroso: `organization_id` + `store_branch_id` em **toda** tabela nova.
- RLS obrigatória, `GRANT` só `authenticated` + `service_role` (nunca `anon`).
- Tabela nova DEVE entrar na publicação `supabase_realtime` + `REPLICA IDENTITY FULL`.
- Registrar em 3 pontos de sync: `syncService` (TABLES + BRANCH_REQUIRED + hidratação),
  `App.tsx` (handler realtime), `syncQueueService`, `backupService`.
- Mappers (upsert / `*FromRemote` / hidratação) devem cobrir **todas** as colunas (regra da blindagem).

## 2. TypeScript (src/types/index.ts) — proposta
```ts
export type PurchaseDocSource = 'ocr' | 'xml' | 'manual';
export type PurchaseDocStatus = 'pending' | 'confirmed' | 'adjusted';

export interface PurchaseDocumentItem {
  productName: string;
  code?: string;
  quantity: number;          // qtd informada no papel
  unitPrice: number;         // valor unitário
  subtotal: number;          // qty * unitPrice (ou do papel)
  adjustment?: number;       // +/- aplicado na revisão (0 se não houve)
  adjustmentReason?: string; // observação opcional justificando o ajuste
  matchedProductId?: string; // vínculo com Product existente (se encontrado)
}

export interface PurchaseDocument {
  id: string;
  organizationId?: string;
  storeBranchId?: string;
  source: PurchaseDocSource;
  sourceDetail?: string;        // ex.: nome do arquivo, ou 'qr:<chave>'
  qrAccessKey?: string;         // chave de acesso do DANFE (arquivo)
  templateId?: string;          // template de fornecedor usado no OCR
  ocrConfidence?: number;       // confiança média do Tesseract (0-100)
  documentNumber?: string;      // nº NF / pedido
  issueDate?: string;
  status: PurchaseDocStatus;
  observation?: string;         // observação geral do documento
  supplierId?: string;          // FK -> suppliers (se fornecedor criado/linkado)
  supplierSnapshot: {           // cópia no momento da leitura (mesmo sem cadastro)
    name?: string; companyName?: string; cnpj?: string;
    address?: string; city?: string; state?: string; zip?: string;
    phone?: string; email?: string;
  };
  items: PurchaseDocumentItem[];
  totalValue: number;
  images?: string[];            // paths do Storage (ver seção 4)
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}
```

## 3. SQL DDL (PROPOSTA — não executar sem autorização + backup)
```sql
-- Estender suppliers com endereço (faltando hoje)
ALTER TABLE hd_system_suppliers
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text;

-- Tabela de documentos de entrada
CREATE TABLE IF NOT EXISTS hd_system_purchase_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES hd_system_organizations(id),
  store_branch_id uuid NOT NULL REFERENCES hd_system_store_branches(id),
  source text NOT NULL CHECK (source IN ('ocr','xml','manual')),
  source_detail text,
  qr_access_key text,
  template_id text,
  ocr_confidence numeric,
  document_number text,
  issue_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','adjusted')),
  observation text,
  supplier_id uuid REFERENCES hd_system_suppliers(id),
  supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_value numeric NOT NULL DEFAULT 0,
  images text[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE hd_system_purchase_documents ENABLE ROW LEVEL SECURITY;

-- Policies (modelo das demais tabelas branch-scoped do projeto)
CREATE POLICY org_select_docs ON hd_system_purchase_documents
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());
CREATE POLICY org_insert_docs ON hd_system_purchase_documents
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id());
CREATE POLICY org_update_docs ON hd_system_purchase_documents
  FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())
  WITH CHECK (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id());
CREATE POLICY org_delete_docs ON hd_system_purchase_documents
  FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id());

-- Realtime (regra 2 do AGENTS): publicação + REPLICA IDENTITY FULL
ALTER PUBLICATION supabase_realtime ADD TABLE hd_system_purchase_documents;
ALTER TABLE hd_system_purchase_documents REPLICA IDENTITY FULL;
```

## 4. Imagens (várias folhas) — decisão recomendada
- **Recomendado:** Supabase **Storage** bucket `nf-documents` com RLS por `organization_id`/`store_branch_id`
  (metadata do object ou prefixo `org/<id>/branch/<id>/<doc>/pagN.jpg`). Evita inflar a linha.
- Alternativa (MVP simples, igual ao `pdfFile` atual de `nf_records`): `images text[]` com base64.
  Aceitável para 1–2 fotos; várias páginas em alta resolução pode estourar o tamanho da linha.

## 5. Histórico de movimentações no Dashboard
- `stock_movements` **já existe e é sincronizado/realtime**. Não precisa de tabela nova.
- Ao **confirmar** um `purchase_document` (status `confirmed`), gerar 1 `stock_movements`
  tipo `in` por item via `ajustar_estoque` (RPC já usada), com
  `reason = "Entrada doc <docNumber/qr> — <observation>"`.
- Dashboard: novo card listando `stock_movements` filtrando `type` (in/out/adjustment/loss),
  com filtros de data/produto/fornecedor. Agregação client-side (dados já sincronizados).

## 6. Pendências para a Fase 1 (após validar acurácia na Fase 0)
- [ ] Afinar `itemLine`/`supplier` regex em `templates.json` com OCR real (Ambev/Coca/Lago Azul/DANFE).
- [ ] Decidir Storage vs base64 para `images`.
- [ ] Relaxar `assertSuperadminOrgSelected` em `saveSupplier` (criação segue acesso da página CRM).
- [ ] Criar migration + policies + realtime + mappers (3 caminhos) + atualizar SUPABASE_SCHEMA.md.
- [ ] Testes: `parser.test.ts` (OCR + XML) e regressão de sync.
