export const VOUCHER_TEMPLATE = {
  width: 1378,
  height: 719,
};

export const VOUCHER_ASPECT_RATIO = `${VOUCHER_TEMPLATE.width} / ${VOUCHER_TEMPLATE.height}`;

export const VOUCHER_PACKAGE_LABEL = "OSTRE STRZELANIE";

export const VOUCHER_TIERS_PLN = [300, 400, 500, 600, 800];

export const VOUCHER_DATE_LABEL = "Voucher ważny do:";

export const VOUCHER_CONTACT_LINE =
  "Realizacja vouchera możliwa jest po wcześniejszej rezerwacji telefonicznej +48 662 475 714";

export const VOUCHER_FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Merriweather:ital,wght@0,700;1,700&family=Oswald:wght@500;700&display=swap";

export const VOUCHER_FIELDS = {
  title: {
    top: 8.5,
    left: 26,
    width: 48,
    height: 10,
    fontSize: 46,
    minFontSize: 30,
  },
  package: {
    left: 21,
    top: 56.2,
    width: 58,
    height: 10.5,
    fontSize: 21,
    minFontSize: 14,
  },
  recipient: {
    left: 20.5,
    top: 74.2,
    width: 36.5,
    height: 7.8,
    fontSize: 24,
    minFontSize: 12,
  },
  dateLabel: {
    left: 57.5,
    top: 65.8,
    width: 34,
    height: 5.2,
    fontSize: 14,
    minFontSize: 10,
  },
  date: {
    left: 57.5,
    top: 74.2,
    width: 31,
    height: 7.8,
    fontSize: 16,
    minFontSize: 11,
  },
  footer: {
    bottom: 1.5,
    left: 3.5,
    width: 93,
    height: 9,
    fontSize: 13.5,
    minFontSize: 9,
  },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const formatVoucherDate = (value) => {
  const date = String(value || "-").trim();
  if (date === "-") return date;
  return date.endsWith(" r.") ? date : `${date} r.`;
};

export const getRecipientFontSizePx = (recipient, cardWidthPx) => {
  const normalizedRecipient = String(recipient || "")
    .replace(/\s+/g, " ")
    .trim();
  const longestWordLength = Math.max(
    ...normalizedRecipient.split(" ").map((word) => word.length),
    0,
  );
  const totalLength = normalizedRecipient.length;
  const field = VOUCHER_FIELDS.recipient;
  const sizeByTotalLength = field.fontSize - Math.max(0, totalLength - 12) * 0.75;
  const sizeByLongestWord = field.fontSize - Math.max(0, longestWordLength - 9) * 1.1;
  const size = Math.min(sizeByTotalLength, sizeByLongestWord, (cardWidthPx / 600) * field.fontSize);

  return Math.round(clamp(size, field.minFontSize, field.fontSize));
};

export const getRecipientFontSizeRem = (recipient) => {
  const pxSize = getRecipientFontSizePx(recipient, 600);
  return `${(pxSize / 16).toFixed(2)}rem`;
};

export const renderVoucherCardMarkup = ({
  recipient,
  packageLabel = VOUCHER_PACKAGE_LABEL,
  validUntil,
  cardWidthPx = 600,
  backgroundUrl = "",
  mode = "web",
  imageSrc = "",
}) => {
  const safeRecipient = escapeHtml(recipient || "Osoba obdarowana");
  const safePackage = escapeHtml(packageLabel);
  const safeDate = escapeHtml(formatVoucherDate(validUntil));
  const safeDateLabel = escapeHtml(VOUCHER_DATE_LABEL);
  const safeFooter = escapeHtml(VOUCHER_CONTACT_LINE);
  const recipientFontSize = getRecipientFontSizeRem(recipient || "");
  const resolvedBackgroundUrl =
    backgroundUrl ||
    "https://strzelam.com/assets/voucher-template-bg.jpg";

  if (mode === "email" && imageSrc) {
    const safeImageSrc = escapeHtml(imageSrc);
    const safeAlt = escapeHtml(`Bon podarunkowy dla ${recipient || "osoby obdarowanej"}`);

    return `
      <img
        src="${safeImageSrc}"
        width="${cardWidthPx}"
        alt="${safeAlt}"
        style="display:block;width:100%;max-width:${cardWidthPx}px;height:auto;margin:0 auto;border:1px solid rgba(21,22,23,0.12);"
      />
    `;
  }

  const backgroundStyle = `background-image:linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)), url('${resolvedBackgroundUrl}');`;

  return `
    <div class="voucher-card-preview" style="max-width:${cardWidthPx}px;">
      <div class="voucher-card-inner" style="${backgroundStyle}background-size:cover;background-position:center;">
        <div class="voucher-card-title">VOUCHER</div>
          <div class="voucher-card-package">OSTRE STRZELANIE</div>
          <div class="voucher-card-date-label">${safeDateLabel}</div>
          <div class="voucher-card-name" id="preview-recipient" style="--recipient-font-size:${recipientFontSize};">${safeRecipient}</div>
          <div class="voucher-card-date" id="preview-valid-until">${safeDate}</div>
        <div class="voucher-card-footer">${safeFooter}</div>
      </div>
    </div>
  `;
};

export const renderControlCouponMarkup = ({
  code,
  amount,
  recipient,
  validUntil,
  amountVisibility,
  mode = "email",
}) => {
  const safeCode = escapeHtml(code);
  const safeRecipient = escapeHtml(recipient);
  const safeDate = escapeHtml(validUntil);
  const amountLabel = escapeHtml(`${amount} zł`);
  const visibilityLabel = amountVisibility === "visible" ? "widoczna" : "ukryta";

  if (mode === "web") {
    return "";
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px auto 0;border-collapse:collapse;max-width:600px;">
      <tr>
        <td style="padding:14px 16px;background:#fbfaf7;border:1px solid rgba(21,22,23,0.18);">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 10px;border-bottom:1px solid rgba(21,22,23,0.14);font-size:12px;font-weight:900;color:#626970;text-transform:uppercase;">Kupon kontrolny</td>
              <td style="padding:0 0 10px;border-bottom:1px solid rgba(21,22,23,0.14);font-size:16px;font-weight:900;color:#153526;text-align:right;">${safeCode}</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;">
            <tr>
              <td width="50%" style="padding:6px 8px 6px 0;vertical-align:top;">
                <div style="font-size:11px;font-weight:900;color:#626970;text-transform:uppercase;">Do realizacji</div>
                <div style="margin-top:3px;font-size:14px;font-weight:900;color:#151617;">${amountLabel}</div>
              </td>
              <td width="50%" style="padding:6px 0 6px 8px;vertical-align:top;">
                <div style="font-size:11px;font-weight:900;color:#626970;text-transform:uppercase;">Bon dla</div>
                <div style="margin-top:3px;font-size:14px;font-weight:900;color:#151617;">${safeRecipient}</div>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:6px 8px 6px 0;vertical-align:top;">
                <div style="font-size:11px;font-weight:900;color:#626970;text-transform:uppercase;">Ważny do</div>
                <div style="margin-top:3px;font-size:14px;font-weight:900;color:#151617;">${safeDate}</div>
              </td>
              <td width="50%" style="padding:6px 0 6px 8px;vertical-align:top;">
                <div style="font-size:11px;font-weight:900;color:#626970;text-transform:uppercase;">Kwota na bonie</div>
                <div style="margin-top:3px;font-size:14px;font-weight:900;color:#151617;">${visibilityLabel}</div>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.45;color:#626970;">Rezerwacje: 662 475 714. Bon jest ważny rok od daty zakupu.</p>
        </td>
      </tr>
    </table>
  `;
};

export const renderVoucherEmailHtml = ({
  recipient,
  validUntil,
  amount,
  amountVisibility,
  code,
  siteUrl,
  voucherImageSrc = "",
}) => {
  return `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bon podarunkowy</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f4ee;color:#151617;font-family:Arial,Helvetica,sans-serif;line-height:1.55;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7f4ee;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:640px;">
            <tr>
              <td style="padding:0 0 8px;font-size:12px;font-weight:800;color:#c89b46;text-transform:uppercase;letter-spacing:0.04em;">STRZELAM.COM</td>
            </tr>
            <tr>
              <td style="padding:0 0 10px;font-size:30px;font-weight:900;line-height:1.05;">Bon podarunkowy</td>
            </tr>
            <tr>
              <td style="padding:0 0 22px;font-size:16px;color:#626970;">
                Dziękujemy za zakup. Poniżej znajduje się bon do wydrukowania lub przekazania osobie obdarowanej.
              </td>
            </tr>
            <tr>
              <td>
                ${renderVoucherCardMarkup({
                  recipient,
                  validUntil,
                  cardWidthPx: 600,
                  mode: "email",
                  imageSrc: voucherImageSrc,
                })}
              </td>
            </tr>
            <tr>
              <td>
                ${renderControlCouponMarkup({
                  code,
                  amount,
                  recipient,
                  validUntil,
                  amountVisibility,
                  mode: "email",
                })}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
