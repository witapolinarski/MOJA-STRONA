import { renderVoucherEmailHtml } from "./voucher-layout.mjs";
import { generateVoucherImageBuffer } from "./voucher-image.mjs";

const getResendApiKey = () => process.env.RESEND_API_KEY || "";

const getFromAddress = () =>
  process.env.VOUCHER_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "Strzelam.com <bon@strzelam.com>";

const getCopyEmail = () => String(process.env.VOUCHER_COPY_EMAIL || "").trim().toLowerCase();

const VOUCHER_IMAGE_CID = "voucher-card";

export const buildVoucherEmail = async ({
  recipient,
  validUntil,
  amount,
  amountVisibility,
  code,
  siteUrl,
  inlinePreview = false,
}) => {
  const imageBuffer = await generateVoucherImageBuffer({ recipient, validUntil });
  const imageBase64 = imageBuffer.toString("base64");
  const imageSrc = inlinePreview
    ? `data:image/jpeg;base64,${imageBase64}`
    : `cid:${VOUCHER_IMAGE_CID}`;

  const html = renderVoucherEmailHtml({
    recipient,
    validUntil,
    amount,
    amountVisibility,
    code,
    siteUrl,
    voucherImageSrc: imageSrc,
  });

  return {
    html,
    imageBase64,
    imageCid: VOUCHER_IMAGE_CID,
  };
};

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

  const { html, imageBase64, imageCid } = await buildVoucherEmail({
    recipient,
    validUntil,
    amount,
    amountVisibility,
    code,
    siteUrl,
  });

  const copyEmail = getCopyEmail();
  const payload = {
    from: getFromAddress(),
    to: [to],
    subject: `Bon podarunkowy dla ${recipient}`,
    html,
    reply_to: copyEmail || undefined,
    attachments: [
      {
        filename: "bon-podarunkowy.jpg",
        content: imageBase64,
        content_id: imageCid,
      },
    ],
  };

  if (copyEmail && copyEmail !== String(to).trim().toLowerCase()) {
    payload.bcc = [copyEmail];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Resend error", response.status, result);
    throw new Error(result?.message || result?.error || "Nie udało się wysłać e-maila z bonem.");
  }

  return result;
};
