import Stripe from "stripe";
import { calculateMembershipFees } from "./lib/fees.mjs";
import { jsonResponse } from "./lib/auth.mjs";
import { savePaymentRecord } from "./lib/payments.mjs";

const getSiteUrl = () =>
  process.env.URL || process.env.DEPLOY_PRIME_URL || "https://relaxed-sawine-3b870a.netlify.app";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return jsonResponse({ error: "Płatności online nie są jeszcze skonfigurowane (STRIPE_SECRET_KEY)." }, 503);
  }

  try {
    const body = await request.json();
    const code = String(body.code || "").trim();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const acceptanceDate = String(body.acceptanceDate || "").trim();

    if (!code || !name || !email) {
      return jsonResponse({ error: "Podaj numer wniosku, imię i nazwisko oraz e-mail." }, 400);
    }

    const fees = calculateMembershipFees(acceptanceDate || undefined);
    const stripe = new Stripe(secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "blik", "p24"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "pln",
            unit_amount: fees.totalGrosze,
            product_data: {
              name: `Wpisowe i składka TMS Sagittarius`,
              description: `Wniosek ${code} — ${name}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        applicationCode: code,
        applicantName: name,
        applicantEmail: email,
        acceptanceDate: fees.acceptanceDate,
      },
      success_url: `${getSiteUrl()}/success.html?code=${encodeURIComponent(code)}&payment=success`,
      cancel_url: `${getSiteUrl()}/#czlonkostwo?payment=cancelled&code=${encodeURIComponent(code)}`,
    });

    await savePaymentRecord(code, {
      status: "pending",
      method: "stripe",
      amount: fees.total,
      amountGrosze: fees.totalGrosze,
      entryFee: fees.entryFee,
      annualFee: fees.annualFee,
      months: fees.months,
      acceptanceDate: fees.acceptanceDate,
      stripeSessionId: session.id,
      createdAt: new Date().toISOString(),
      applicantName: name,
      applicantEmail: email,
    });

    return jsonResponse({ ok: true, url: session.url, amount: fees.total });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Nie udało się utworzyć sesji płatności." }, 500);
  }
};
