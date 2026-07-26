// Cloudflare Pages Function — POST /api/stripe/webhook
// Adapted from api/stripe/webhook.ts for Cloudflare Workers runtime

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const body = await request.text();
    const event = JSON.parse(body);
    const signature = request.headers.get('stripe-signature');

    console.log('[Stripe Webhook] Evento:', event?.type);
    console.log('[Stripe Webhook] Signature:', signature ? 'presente' : 'ausente');

    switch (event?.type) {
      case 'checkout.session.completed':
        console.log('[Stripe] Pagamento recebido:', event.data?.object?.id);
        break;
      case 'customer.subscription.updated':
        console.log('[Stripe] Assinatura atualizada:', event.data?.object?.id);
        break;
      case 'customer.subscription.deleted':
        console.log('[Stripe] Assinatura cancelada:', event.data?.object?.id);
        break;
      default:
        console.log(`[Stripe] Evento: ${event?.type}`);
    }

    return new Response(JSON.stringify({ received: true, status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Stripe Webhook] Erro:', err?.message || err);
    return new Response(JSON.stringify({ error: 'Invalid payload', details: err?.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
