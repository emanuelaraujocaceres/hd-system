-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Tabela: ai_insights — Insights Gerados pelo Motor de Regras ║
-- ║  Armazena as análises geradas diariamente via Edge Function   ║
-- ╚══════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,                    -- ex: "daily-2026-07-26"
  insights JSONB NOT NULL DEFAULT '[]',   -- array de objetos Insight
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  today_revenue NUMERIC(10,2) DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  ticket_medio NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_ai_insights_generated_at ON ai_insights(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_id ON ai_insights(id);

-- RLS (Row Level Security) — permite leitura autenticada
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Policy: qualquer um autenticado pode ler
CREATE POLICY "Allow authenticated read" ON ai_insights
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: service_role pode escrever (Edge Function usa service_role)
CREATE POLICY "Allow service_role write" ON ai_insights
  FOR ALL
  TO service_role
  USING (true);

-- Policy: anon pode ler (para o dashboard)
CREATE POLICY "Allow anon read" ON ai_insights
  FOR SELECT
  TO anon
  USING (true);
