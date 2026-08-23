-- ═══════════════════════════════════════════════════════════════════
-- FIX: Criar bucket product-images no Supabase Storage
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Criar bucket para imagens de produtos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,                          -- público (imagens de cardápio)
  2097152,                       -- 2MB limite
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload
CREATE POLICY "Allow authenticated upload to product-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Policy: anyone can read (public bucket)
CREATE POLICY "Allow public read from product-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'product-images');
