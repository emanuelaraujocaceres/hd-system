// Cloudflare Pages Function — GET /api/health
// Adapted from api/health.ts for Cloudflare Workers runtime

export async function onRequestGet(context: any) {
  const { env } = context;

  return new Response(JSON.stringify({
    status: 'ok',
    appName: 'HD-System ERP',
    platform: 'cloudflare-pages',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
