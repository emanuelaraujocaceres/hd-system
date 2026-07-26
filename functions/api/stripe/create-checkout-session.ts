// Cloudflare Pages Function — POST /api/stripe/create-checkout-session
// Adapted from api/stripe/create-checkout-session.ts for Cloudflare Workers runtime

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const { userEmail, successUrl, cancelUrl } = await request.json();
    const stripeKey = env.STRIPE_SECRET_KEY;

    if (stripeKey) {
      // Dynamic import of Stripe (compatible with Workers runtime)
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: userEmail || 'admin@hd-system.com.br',
        line_items: [{
          price_data: {
            currency: 'brl',
            product_data: {
              name: 'HD-System Enterprise PRO - Assinatura Mensal',
              description: 'Acesso completo aos módulos ERP, PDV, Filiais, CRM e IA Copilot.',
            },
            unit_amount: 19900,
            recurring: { interval: 'month' as const },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: successUrl || 'https://hd-system.pages.dev/?stripe_payment=success',
        cancel_url: cancelUrl || 'https://hd-system.pages.dev/?stripe_payment=cancelled',
      });

      return new Response(JSON.stringify({ checkoutUrl: session.url, simulated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fallback: Stripe not configured
    return new Response(JSON.stringify({
      checkoutUrl: null,
      simulated: true,
      message: 'Chave STRIPE_SECRET_KEY não detectada. Modo simulado ativado.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Stripe] Erro:', error?.message || error);
    return new Response(JSON.stringify({ error: error.message || 'Erro no Stripe' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
