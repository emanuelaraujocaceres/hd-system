import { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  try {
    const event = JSON.parse(body);
    const signature = req.headers['stripe-signature'];

    console.log('[Stripe Webhook] Recebido evento:', event?.type);
    console.log('[Stripe Webhook] Signature:', signature ? 'presente' : 'ausente');

    switch (event?.type) {
      case 'checkout.session.completed':
        console.log('[Stripe] Pagamento de Assinatura recebido com sucesso:', event.data?.object?.id);
        break;
      case 'customer.subscription.updated':
        console.log('[Stripe] Assinatura atualizada:', event.data?.object?.id);
        break;
      case 'customer.subscription.deleted':
        console.log('[Stripe] Assinatura cancelada:', event.data?.object?.id);
        break;
      default:
        console.log(`[Stripe] Evento recebido: ${event?.type}`);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, status: 'success' }));
  } catch (err: any) {
    console.error('[Stripe Webhook] Erro ao processar evento:', err);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid payload', details: err?.message }));
  }
}
