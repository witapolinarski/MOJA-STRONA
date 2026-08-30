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

const buildSessionParams = (payload, siteUrl, paymentMethodTypes) => {
  const amountLabel =
    payload.amountVisibility === "visible" ? `${payload.amount} zł` : "kwota ukryta na bonie";

  return {
    mode: "payment",
    locale: "pl",
    payment_method_types: paymentMethodTypes,
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
  };
};

const createCheckoutSession = async (stripe, payload, siteUrl) => {
  const attempts = [
    { label: "card+blik", types: ["card", "blik"] },
    { label: "card+blik+p24", types: ["card", "blik", "p24"] },
    { label: "card", types: ["card"] },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      return await stripe.checkout.sessions.create(
        buildSessionParams(payload, siteUrl, attempt.types),
      );
    } catch (error) {
      lastError = error;
      console.error(`create-checkout-session:${attempt.label}`, error?.type || error?.message);
    }
  }

  throw lastError;
};

const getCheckoutErrorMessage = (error) => {
  if (error?.type === "StripeAuthenticationError") {
    return "Płatności wymagają aktualizacji klucza Stripe w konfiguracji strony.";
  }

  const message = String(error?.message || "");
  if (message.includes("payment_method_types") || message.includes("payment method")) {
    return "Wybrana metoda płatności jest chwilowo niedostępna. Spróbuj ponownie za chwilę.";
  }

  return "Nie udało się przygotować płatności.";
};

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
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
    const session = await createCheckoutSession(stripe, payload, siteUrl);

    if (!session?.url) {
      throw new Error("Stripe nie zwrócił adresu płatności.");
    }

    try {
      await savePendingVoucherOrder(payload, session.id);
    } catch (blobError) {
      console.error("savePendingVoucherOrder", blobError);
    }

    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    console.error("create-checkout-session", error);
    return jsonResponse({ error: getCheckoutErrorMessage(error) }, 500);
  }
};
