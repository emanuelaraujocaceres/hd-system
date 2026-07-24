// API Route: Stripe Webhook Listener
app.post("/api/stripe/webhook", (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log("Recebido evento de Webhook Stripe. Signature:", signature ? "presente" : "ausente");

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
