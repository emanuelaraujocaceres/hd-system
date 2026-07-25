import { IncomingMessage, ServerResponse } from 'node:http';
import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      stripeClient = new Stripe(key);
    }
  }
  return stripeClient;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const { planCode, userEmail, successUrl, cancelUrl } = JSON.parse(body);
    const stripe = getStripe();

    if (stripe && process.env.STRIPE_SECRET_KEY) {
      const priceId = process.env.STRIPE_PRICE_ID || 'price_HDSYSTEM_PRO';
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
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: successUrl || 'http://localhost:3000/?stripe_payment=success',
        cancel_url: cancelUrl || 'http://localhost:3000/?stripe_payment=cancelled',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ checkoutUrl: session.url, simulated: false }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      checkoutUrl: null,
      simulated: true,
      message: 'Chave STRIPE_SECRET_KEY não detectada. Modo de pagamento instantâneo em teste ativado.',
    }));
  } catch (error: any) {
    console.error('[Stripe] Erro ao criar sessão:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Erro no Stripe' }));
  }
}
