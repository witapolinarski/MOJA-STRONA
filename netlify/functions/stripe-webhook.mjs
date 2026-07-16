import Stripe from "stripe";
import { savePaymentRecord } from "./lib/payments.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Metoda niedozwolona.", { status: 405 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return new Response("Webhook Stripe nie jest skonfigurowany.", { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature error:", error.message);
    return new Response(`Webhook Error: ${error.message}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const code = session.metadata?.applicationCode;

      if (code) {
        await savePaymentRecord(code, {
          status: "paid",
          method: "stripe",
          amount: (session.amount_total || 0) / 100,
          amountGrosze: session.amount_total || 0,
          currency: session.currency || "pln",
          paidAt: new Date().toISOString(),
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent || "",
          receiptUrl: session.receipt_url || "",
          applicantName: session.metadata?.applicantName || "",
          applicantEmail: session.customer_details?.email || session.metadata?.applicantEmail || "",
          acceptanceDate: session.metadata?.acceptanceDate || "",
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response("Webhook handler failed.", { status: 500 });
  }
};
