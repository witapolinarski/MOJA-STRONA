import { renderVoucherEmailHtml } from "./voucher-layout.mjs";

const getResendApiKey = () => process.env.RESEND_API_KEY || "";

const getFromAddress = () =>
  process.env.VOUCHER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "Strzelam.com <bon@strzelam.com>";

export const sendVoucherEmail = async ({
  to,
  recipient,
  validUntil,
  amount,
  amountVisibility,
  code,
  siteUrl,
}) => {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("Brak RESEND_API_KEY — nie można wysłać bonu e-mailem.");
  }

  const html = renderVoucherEmailHtml({
    recipient,
    validUntil,
    amount,
    amountVisibility,
    code,
    siteUrl,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [to],
      subject: `Bon podarunkowy dla ${recipient}`,
      html,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || result?.error || "Nie udało się wysłać e-maila z bonem.");
  }

  return result;
};
