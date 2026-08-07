-- Adiciona coluna show_on_cardapio na tabela products
-- Controla quais produtos aparecem no cardápio digital (acessado via QR Code)

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_on_cardapio boolean DEFAULT false;

-- Comentário
COMMENT ON COLUMN public.products.show_on_cardapio IS 'Controla se o produto aparece no cardápio digital (acessado via QR Code)';
