import Stripe from "stripe";
import { jsonResponse } from "./lib/auth.mjs";
import {
  normalizeVoucherPayload,
  savePendingVoucherOrder,
  validateVoucherPayload,
} from "./lib/voucher-orders.mjs";

const getSiteUrl = () =>
  process.env.VOUCHER_SITE_URL ||
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  "https://strzelam.com";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return jsonResponse({ error: "Płatności online nie są jeszcze skonfigurowane." }, 503);
  }

  try {
    const payload = normalizeVoucherPayload(await request.json());
    const validationError = validateVoucherPayload(payload);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    const stripe = new Stripe(secretKey);
    const siteUrl = getSiteUrl().replace(/\/$/, "");
    const amountLabel =
      payload.amountVisibility === "visible" ? `${payload.amount} zł` : "kwota ukryta na bonie";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "blik", "p24"],
      customer_email: payload.email,
      line_items: [
        {
          price_data: {
            currency: "pln",
            unit_amount: payload.amount * 100,
            product_data: {
              name: `Bon podarunkowy ${payload.amount} zł`,
              description: `Bon dla: ${payload.recipient} (${amountLabel})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        voucherCode: payload.code,
        voucherRecipient: payload.recipient,
        voucherEmail: payload.email,
        voucherAmount: String(payload.amount),
        voucherAmountVisibility: payload.amountVisibility,
        voucherValidUntil: payload.validUntil,
      },
      success_url: `${siteUrl}/?payment=success&code=${encodeURIComponent(payload.code)}`,
      cancel_url: `${siteUrl}/#vouchery?payment=cancelled`,
    });

    await savePendingVoucherOrder(payload, session.id);

    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    console.error("create-checkout-session", error);
    return jsonResponse({ error: "Nie udało się przygotować płatności." }, 500);
  }
};
