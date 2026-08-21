import Stripe from "stripe";
import { sendVoucherEmail } from "./lib/voucher-mail.mjs";
import {
  getVoucherOrderBySessionId,
  markVoucherOrderPaid,
} from "./lib/voucher-orders.mjs";

const getSiteUrl = () =>
  process.env.VOUCHER_SITE_URL ||
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  "https://strzelam.com";

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
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const code = metadata.voucherCode;

      if (!code) {
        return new Response(JSON.stringify({ received: true, skipped: "not_a_voucher" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const existing = await getVoucherOrderBySessionId(session.id);
      if (existing?.status === "paid" && existing?.emailSentAt) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const voucher = {
        code,
        recipient: metadata.voucherRecipient || existing?.recipient || "",
        email: session.customer_details?.email || metadata.voucherEmail || existing?.email || "",
        amount: Number(metadata.voucherAmount || existing?.amount || 0),
        amountVisibility: metadata.voucherAmountVisibility || existing?.amountVisibility || "hidden",
        validUntil: metadata.voucherValidUntil || existing?.validUntil || "",
        stripeSessionId: session.id,
        paidAt: new Date().toISOString(),
      };

      await markVoucherOrderPaid(code, voucher);

      try {
        await sendVoucherEmail({
          to: voucher.email,
          recipient: voucher.recipient,
          validUntil: voucher.validUntil,
          amount: voucher.amount,
          amountVisibility: voucher.amountVisibility,
          code: voucher.code,
          siteUrl: getSiteUrl(),
        });

        await markVoucherOrderPaid(code, { emailSentAt: new Date().toISOString() });
      } catch (mailError) {
        console.error("stripe-webhook email", mailError);
        await markVoucherOrderPaid(code, {
          emailError: mailError.message || "Nie udało się wysłać e-maila.",
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stripe-webhook", error);
    return new Response("Webhook handler failed.", { status: 500 });
  }
};
