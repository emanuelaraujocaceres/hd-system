// Cloudflare Pages Functions — Global Middleware (CORS)
// Applies to ALL /api/* routes automatically
//
// SECURITY: CORS restrito ao domínio da aplicação + localhost (dev).
// Antes usávamos '*' que permitia qualquer site chamar nossas APIs admin.

const ALLOWED_ORIGINS = [
  'https://hd-system.pages.dev',       // produção Cloudflare Pages
  'https://hd-system.vercel.app',      // produção Vercel (se aplicável)
  'http://localhost:3000',             // dev local (Vite/Express)
  'http://localhost:5173',             // dev local (Vite default)
  'http://127.0.0.1:3000',            // dev local (variant)
  'http://127.0.0.1:5173',            // dev local (variant)
];

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin') || '';
  // Permitir origens na lista OU qualquer localhost (dev)
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
    return origin;
  }
  // Fallback: primeira origem permitida (produção)
  return ALLOWED_ORIGINS[0];
}

export async function onRequest(context: any) {
  const allowedOrigin = getAllowedOrigin(context.request);

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = await context.next();

  // Add CORS headers to response
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  return newResponse;
}
