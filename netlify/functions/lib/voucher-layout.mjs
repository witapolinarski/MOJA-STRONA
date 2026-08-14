export const VOUCHER_TEMPLATE = {
  width: 1378,
  height: 719,
};

export const VOUCHER_ASPECT_RATIO = `${VOUCHER_TEMPLATE.width} / ${VOUCHER_TEMPLATE.height}`;

export const VOUCHER_PACKAGE_LABEL = "OSTRE STRZELANIE";

export const VOUCHER_TIERS_PLN = [300, 400, 500, 600, 800];

export const VOUCHER_FIELDS = {
  name: {
    left: 8.6,
    top: 55.4,
    width: 52.5,
    height: 15.2,
    fontSize: 1.35,
    minFontSize: 0.64,
  },
  type: {
    left: 8.8,
    top: 75.4,
    width: 52.5,
    height: 8.5,
    fontSize: 1.05,
    minFontSize: 0.7,
  },
  date: {
    right: 7,
    top: 75.2,
    width: 24,
    height: 8.5,
    fontSize: 1,
    minFontSize: 0.68,
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

export const getRecipientFontSizeRem = (recipient) => {
  const normalizedRecipient = String(recipient || "")
    .replace(/\s+/g, " ")
    .trim();
  const longestWordLength = Math.max(
    ...normalizedRecipient.split(" ").map((word) => word.length),
    0,
  );
  const totalLength = normalizedRecipient.length;
  const sizeByTotalLength = 1.44 - Math.max(0, totalLength - 14) * 0.035;
  const sizeByLongestWord = 1.44 - Math.max(0, longestWordLength - 10) * 0.06;
  const size = Math.min(sizeByTotalLength, sizeByLongestWord);

  return `${clamp(size, VOUCHER_FIELDS.name.minFontSize, VOUCHER_FIELDS.name.fontSize).toFixed(2)}rem`;
};

const fieldBoxStyle = (field, cardWidthPx) => {
  const horizontal =
    typeof field.right === "number"
      ? `right:${field.right}%;left:auto;`
      : `left:${field.left}%;right:auto;`;

  const fontSizePx = clamp(
    (field.fontSize / 16) * (cardWidthPx / 37.5),
    field.minFontSize * 16,
    field.fontSize * 16,
  );

  return [
    "position:absolute",
    horizontal,
    `top:${field.top}%`,
    `width:${field.width}%`,
    `height:${field.height}%`,
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:0 1.4%",
    "box-sizing:border-box",
    "overflow:hidden",
    "color:#141414",
    "font-weight:900",
    "line-height:1.1",
    "text-align:center",
    "text-transform:uppercase",
    `font-size:${fontSizePx.toFixed(2)}px`,
    "overflow-wrap:anywhere",
    "white-space:normal",
  ].join(";");
};

export const renderVoucherCardMarkup = ({
  recipient,
  packageLabel = VOUCHER_PACKAGE_LABEL,
  validUntil,
  cardWidthPx = 600,
  backgroundUrl = "",
  mode = "email",
}) => {
  const cardHeightPx = Math.round((cardWidthPx * VOUCHER_TEMPLATE.height) / VOUCHER_TEMPLATE.width);
  const safeRecipient = escapeHtml(recipient || "Osoba obdarowana");
  const safePackage = escapeHtml(packageLabel);
  const safeDate = escapeHtml(validUntil || "-");
  const recipientFontSize = getRecipientFontSizeRem(recipient || "");

  const backgroundStyle = backgroundUrl
    ? `background-image:linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)), url('${backgroundUrl}');`
    : "background-image:linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)), url('assets/voucher-template-bg.jpg');";

  const resolvedNameStyle = fieldBoxStyle(VOUCHER_FIELDS.name, cardWidthPx).replace(
    /font-size:[^;]+;/,
    `font-size:${(parseFloat(recipientFontSize) * 16).toFixed(2)}px;`,
  );

  if (mode === "web") {
    return `
      <div class="voucher-card-preview" style="max-width:${cardWidthPx}px;">
        <div class="voucher-card-inner" style="${backgroundStyle}background-size:cover;background-position:center;">
          <div class="voucher-card-name" id="preview-recipient" style="--recipient-font-size:${recipientFontSize};">${safeRecipient}</div>
          <div class="voucher-card-type">${safePackage}</div>
          <div class="voucher-card-date" id="preview-valid-until">${safeDate}</div>
          <div class="voucher-card-title">BON</div>
        </div>
      </div>
    `;
  }

  return `
    <div style="width:${cardWidthPx}px;max-width:100%;margin:0 auto;">
      <div style="position:relative;width:${cardWidthPx}px;max-width:100%;height:${cardHeightPx}px;${backgroundStyle}background-size:cover;background-position:center;border:1px solid rgba(21,22,23,0.12);">
        <div style="${resolvedNameStyle}">${safeRecipient}</div>
        <div style="${fieldBoxStyle(VOUCHER_FIELDS.type, cardWidthPx)}">${safePackage}</div>
        <div style="${fieldBoxStyle(VOUCHER_FIELDS.date, cardWidthPx)}">${safeDate}</div>
        <div style="position:absolute;left:6.2%;bottom:5.6%;width:26%;color:#f6f1ea;font-weight:900;line-height:1.1;text-align:center;text-transform:uppercase;font-size:${Math.max(12, cardWidthPx * 0.028).toFixed(2)}px;">BON</div>
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
}) => {
  const backgroundUrl = `${siteUrl.replace(/\/$/, "")}/assets/voucher-template-bg.jpg`;

  return `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bon podarunkowy</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f4ee;color:#151617;font-family:Inter,Arial,sans-serif;line-height:1.55;">
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
                  backgroundUrl,
                  mode: "email",
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
