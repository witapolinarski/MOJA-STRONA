import { jsonResponse, verifyAdminPassword } from "./lib/auth.mjs";
import { sendVoucherEmail } from "./lib/voucher-mail.mjs";
import { renderVoucherEmailHtml } from "./lib/voucher-layout.mjs";
import { isAllowedVoucherAmount } from "./lib/voucher-orders.mjs";

const getSiteUrl = () =>
  process.env.VOUCHER_SITE_URL ||
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  "https://strzelam.com";

const formatDate = (date) =>
  new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const getDefaultValidUntil = () => {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return formatDate(expiry);
};

const buildTestCode = () => {
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SP-TEST-${randomPart}`;
};

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metoda niedozwolona." }, 405);
  }

  try {
    const body = await request.json();
    const password = String(body.password || "").trim();

    if (!verifyAdminPassword(password)) {
      return jsonResponse({ error: "Nieprawidłowe hasło administratora." }, 401);
    }

    const recipient = String(body.recipient || "Osoba testowa").trim() || "Osoba testowa";
    const email = String(body.email || "").trim().toLowerCase();
    const amount = Number(body.amount || 500);
    const amountVisibility = body.amountVisibility === "visible" ? "visible" : "hidden";
    const validUntil = String(body.validUntil || getDefaultValidUntil()).trim();
    const code = String(body.code || buildTestCode()).trim().toUpperCase();
    const previewOnly = body.preview === true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Podaj poprawny adres e-mail odbiorcy." }, 400);
    }

    if (!isAllowedVoucherAmount(amount)) {
      return jsonResponse({ error: "Niepoprawna kwota bonu." }, 400);
    }

    const siteUrl = getSiteUrl().replace(/\/$/, "");
    const voucher = {
      recipient,
      validUntil,
      amount,
      amountVisibility,
      code,
      siteUrl,
    };

    if (previewOnly) {
      return jsonResponse({
        ok: true,
        preview: true,
        html: renderVoucherEmailHtml({ ...voucher, siteUrl }),
        voucher,
      });
    }

    const result = await sendVoucherEmail({
      to: email,
      ...voucher,
    });

    return jsonResponse({
      ok: true,
      message: `Wysłano testowy bon na adres ${email}.`,
      voucher,
      emailId: result?.id || "",
    });
  } catch (error) {
    console.error("send-test-voucher", error);
    return jsonResponse(
      { error: error.message || "Nie udało się wysłać testowego bonu." },
      500,
    );
  }
};
