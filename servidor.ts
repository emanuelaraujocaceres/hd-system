import express from "express";

/**
 * Stripe Webhook Listener — standalone route registration.
 * NOTE: The main server (server.ts) already includes this webhook handler inline.
 * This file exists as a reference/backup in case you need to extract it later.
 */
export function registerStripeWebhook(app: express.Application) {
  app.post("/api/stripe/webhook", (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    console.log("Recebido evento de Webhook Stripe. Signature:", signature ? "presente" : "ausente");

    // TODO: In production, verify the webhook signature with Stripe SDK:
    // const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    const event = req.body;

    switch (event?.type) {
      case "checkout.session.completed":
        console.log("Pagamento de Assinatura recebido com sucesso:", event.data?.object?.id);
        break;
      case "customer.subscription.updated":
        console.log("Assinatura atualizada no Stripe:", event.data?.object?.id);
        break;
      case "customer.subscription.deleted":
        console.log("Assinatura cancelada no Stripe:", event.data?.object?.id);
        break;
      default:
        console.log(`Evento de Webhook Stripe recebido: ${event?.type}`);
    }

    return res.json({ received: true, status: "success" });
  });
}
