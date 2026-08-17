import { createClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || 'https://tixwhmgzibvazkqbqoev.supabase.co';
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Upload base64 data URL to Supabase Storage (product-images bucket).
 * Returns a public URL. If upload fails, returns the original data URL.
 */
export async function uploadProductImage(dataUrl: string, productId: string): Promise<string> {
  // Skip non-base64 URLs (already hosted)
  if (!dataUrl.startsWith('data:image/')) return dataUrl;

  try {
    // Convert base64 data URL to Blob
    const [header, base64Data] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch?.[1] || 'image/jpeg';
    const ext = mime.split('/')[1] || 'jpg';
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mime });

    // Upload to Supabase Storage
    const filePath = `products/${productId}-${Date.now()}.${ext}`;
    const { data: uploadData, error } = await supabase.storage
      .from('product-images')
      .upload(filePath, blob, { contentType: mime, upsert: true });

    if (error) {
      console.warn('[Storage] Image upload failed:', error.message);
      return dataUrl; // Fallback to base64
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(uploadData.path);

    return urlData?.publicUrl || dataUrl;
  } catch (err) {
    console.warn('[Storage] Image upload exception:', err);
    return dataUrl; // Fallback to base64
  }
}
