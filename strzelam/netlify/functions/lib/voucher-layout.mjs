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
    top: 9,
    left: 0,
    width: 100,
    height: 11,
    fontSize: 38,
    minFontSize: 24,
  },
  name: {
    left: 8.6,
    top: 55.4,
    width: 52.5,
    height: 15.2,
    fontSize: 22,
    minFontSize: 14,
  },
  dateLabel: {
    right: 7,
    top: 69.5,
    width: 26,
    height: 4.5,
    fontSize: 10,
    minFontSize: 8,
  },
  type: {
    left: 8.8,
    top: 75.4,
    width: 52.5,
    height: 8.5,
    fontSize: 17,
    minFontSize: 12,
  },
  date: {
    right: 7,
    top: 75.2,
    width: 24,
    height: 8.5,
    fontSize: 15,
    minFontSize: 11,
  },
  footer: {
    bottom: 2.8,
    left: 4,
    width: 92,
    height: 9,
    fontSize: 10,
    minFontSize: 7,
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

const px = (percent, total) => Math.round((percent / 100) * total);

const formatVoucherDate = (value) => {
  const date = String(value || "-").trim();
  if (date === "-") return date;
  return date.endsWith(" r.") ? date : `${date} r.`;
};

const getRecipientFontSizePx = (recipient, cardWidthPx) => {
  const normalizedRecipient = String(recipient || "")
    .replace(/\s+/g, " ")
    .trim();
  const longestWordLength = Math.max(
    ...normalizedRecipient.split(" ").map((word) => word.length),
    0,
  );
  const totalLength = normalizedRecipient.length;
  const sizeByTotalLength = 22 - Math.max(0, totalLength - 14) * 0.55;
  const sizeByLongestWord = 22 - Math.max(0, longestWordLength - 10) * 0.85;
  const size = Math.min(sizeByTotalLength, sizeByLongestWord, (cardWidthPx / 600) * 22);

  return Math.round(clamp(size, VOUCHER_FIELDS.name.minFontSize, VOUCHER_FIELDS.name.fontSize));
};

export const getRecipientFontSizeRem = (recipient) => {
  const pxSize = getRecipientFontSizePx(recipient, 600);
  return `${(pxSize / 16).toFixed(2)}rem`;
};

const emailFonts = {
  title: "'Black Ops One', Impact, 'Arial Black', sans-serif",
  name: "'Merriweather', Georgia, 'Times New Roman', serif",
  label: "'Oswald', 'Arial Narrow', Arial, sans-serif",
  data: "'Oswald', 'Arial Narrow', Arial, sans-serif",
  footer: "'Oswald', Arial, Helvetica, sans-serif",
};

const renderEmailVoucherTable = ({
  recipient,
  packageLabel,
  validUntil,
  cardWidthPx,
  backgroundUrl,
}) => {
  const cardHeightPx = Math.round((cardWidthPx * VOUCHER_TEMPLATE.height) / VOUCHER_TEMPLATE.width);
  const safeRecipient = escapeHtml(recipient || "Osoba obdarowana");
  const safePackage = escapeHtml(packageLabel);
  const safeDate = escapeHtml(formatVoucherDate(validUntil));
  const safeDateLabel = escapeHtml(VOUCHER_DATE_LABEL);
  const safeFooter = escapeHtml(VOUCHER_CONTACT_LINE);

  const titleTop = px(VOUCHER_FIELDS.title.top, cardHeightPx);
  const titleHeight = px(VOUCHER_FIELDS.title.height, cardHeightPx);

  const nameTop = px(VOUCHER_FIELDS.name.top, cardHeightPx);
  const nameHeight = px(VOUCHER_FIELDS.name.height, cardHeightPx);
  const nameLeft = px(VOUCHER_FIELDS.name.left, cardWidthPx);
  const nameWidth = px(VOUCHER_FIELDS.name.width, cardWidthPx);

  const dateLabelTop = px(VOUCHER_FIELDS.dateLabel.top, cardHeightPx);
  const dateLabelHeight = px(VOUCHER_FIELDS.dateLabel.height, cardHeightPx);
  const dateLabelWidth = px(VOUCHER_FIELDS.dateLabel.width, cardWidthPx);
  const dateLabelRight = px(VOUCHER_FIELDS.dateLabel.right, cardWidthPx);

  const rowTop = px(VOUCHER_FIELDS.type.top, cardHeightPx);
  const rowHeight = px(VOUCHER_FIELDS.type.height, cardHeightPx);
  const typeLeft = px(VOUCHER_FIELDS.type.left, cardWidthPx);
  const typeWidth = px(VOUCHER_FIELDS.type.width, cardWidthPx);
  const dateWidth = px(VOUCHER_FIELDS.date.width, cardWidthPx);
  const dateRight = px(VOUCHER_FIELDS.date.right, cardWidthPx);

  const footerHeight = px(VOUCHER_FIELDS.footer.height, cardHeightPx);
  const footerTop = cardHeightPx - px(VOUCHER_FIELDS.footer.bottom, cardHeightPx) - footerHeight;
  const footerLeft = px(VOUCHER_FIELDS.footer.left, cardWidthPx);
  const footerWidth = px(VOUCHER_FIELDS.footer.width, cardWidthPx);

  const gapAfterTitle = Math.max(0, nameTop - titleTop - titleHeight);
  const gapAfterName = Math.max(0, dateLabelTop - nameTop - nameHeight);
  const gapAfterDateLabel = Math.max(0, rowTop - dateLabelTop - dateLabelHeight);
  const gapAfterTypeRow = Math.max(0, footerTop - rowTop - rowHeight);
  const bottomSpacer = Math.max(0, cardHeightPx - footerTop - footerHeight);

  const nameFontSize = getRecipientFontSizePx(recipient, cardWidthPx);
  const titleFontSize = Math.round(
    clamp((cardWidthPx / 600) * VOUCHER_FIELDS.title.fontSize, VOUCHER_FIELDS.title.minFontSize, VOUCHER_FIELDS.title.fontSize),
  );
  const footerFontSize = Math.round(
    clamp((cardWidthPx / 600) * VOUCHER_FIELDS.footer.fontSize, VOUCHER_FIELDS.footer.minFontSize, VOUCHER_FIELDS.footer.fontSize),
  );

  const dataTextBase =
    "font-family:Arial,Helvetica,sans-serif;font-weight:900;color:#141414;text-transform:uppercase;text-align:center;line-height:1.1;mso-line-height-rule:exactly;";

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${cardWidthPx}" style="width:${cardWidthPx}px;max-width:100%;border-collapse:collapse;margin:0 auto;">
      <tr>
        <td
          width="${cardWidthPx}"
          height="${cardHeightPx}"
          valign="top"
          background="${backgroundUrl}"
          style="width:${cardWidthPx}px;height:${cardHeightPx}px;background-color:#1a1a1a;background-image:url('${backgroundUrl}');background-repeat:no-repeat;background-size:${cardWidthPx}px ${cardHeightPx}px;background-position:center top;border:1px solid rgba(21,22,23,0.12);padding:0;"
        >
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
            <tr>
              <td height="${titleTop}" style="height:${titleTop}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td
                height="${titleHeight}"
                align="center"
                valign="middle"
                style="height:${titleHeight}px;font-family:${emailFonts.title};font-size:${titleFontSize}px;font-weight:400;color:#f8f4ee;letter-spacing:0.14em;text-transform:uppercase;text-align:center;line-height:1;mso-line-height-rule:exactly;text-shadow:0 2px 8px rgba(0,0,0,0.65);"
              >VOUCHER</td>
            </tr>
            <tr>
              <td height="${gapAfterTitle}" style="height:${gapAfterTitle}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td width="${nameLeft}" style="width:${nameLeft}px;font-size:0;line-height:0;">&nbsp;</td>
              <td
                width="${nameWidth}"
                height="${nameHeight}"
                valign="middle"
                align="center"
                style="width:${nameWidth}px;height:${nameHeight}px;font-family:${emailFonts.name};font-size:${nameFontSize}px;font-weight:700;font-style:italic;color:#141414;text-transform:none;text-align:center;line-height:1.12;mso-line-height-rule:exactly;"
              >${safeRecipient}</td>
              <td style="font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td height="${gapAfterName}" colspan="3" style="height:${gapAfterName}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td colspan="3" style="padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="font-size:0;line-height:0;">&nbsp;</td>
                    <td
                      width="${dateLabelWidth}"
                      height="${dateLabelHeight}"
                      align="center"
                      valign="bottom"
                      style="width:${dateLabelWidth}px;height:${dateLabelHeight}px;font-family:${emailFonts.label};font-size:${VOUCHER_FIELDS.dateLabel.fontSize}px;font-weight:700;color:#f8f4ee;text-transform:none;text-align:center;line-height:1.1;mso-line-height-rule:exactly;text-shadow:0 1px 4px rgba(0,0,0,0.7);"
                    >${safeDateLabel}</td>
                    <td width="${dateLabelRight}" style="width:${dateLabelRight}px;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td height="${gapAfterDateLabel}" colspan="3" style="height:${gapAfterDateLabel}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td width="${typeLeft}" style="width:${typeLeft}px;font-size:0;line-height:0;">&nbsp;</td>
              <td
                width="${typeWidth}"
                height="${rowHeight}"
                valign="middle"
                align="center"
                style="width:${typeWidth}px;height:${rowHeight}px;${dataTextBase}font-family:${emailFonts.data};font-size:${VOUCHER_FIELDS.type.fontSize}px;letter-spacing:0.04em;background:transparent;"
              >${safePackage}</td>
              <td
                width="${dateWidth}"
                height="${rowHeight}"
                valign="middle"
                align="center"
                style="width:${dateWidth}px;height:${rowHeight}px;${dataTextBase}font-family:${emailFonts.data};font-size:${VOUCHER_FIELDS.date.fontSize}px;letter-spacing:0.02em;background:transparent;"
              >${safeDate}</td>
              <td width="${dateRight}" style="width:${dateRight}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td height="${gapAfterTypeRow}" colspan="4" style="height:${gapAfterTypeRow}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td width="${footerLeft}" style="width:${footerLeft}px;font-size:0;line-height:0;">&nbsp;</td>
              <td
                width="${footerWidth}"
                height="${footerHeight}"
                align="center"
                valign="middle"
                style="width:${footerWidth}px;height:${footerHeight}px;padding:4px 8px;background-color:rgba(8,8,8,0.62);font-family:${emailFonts.footer};font-size:${footerFontSize}px;font-weight:500;color:#f8f4ee;text-transform:none;text-align:center;line-height:1.25;mso-line-height-rule:exactly;"
              >${safeFooter}</td>
              <td style="font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td height="${bottomSpacer}" colspan="3" style="height:${bottomSpacer}px;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
};

export const renderVoucherCardMarkup = ({
  recipient,
  packageLabel = VOUCHER_PACKAGE_LABEL,
  validUntil,
  cardWidthPx = 600,
  backgroundUrl = "",
  mode = "email",
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

  const backgroundStyle = `background-image:linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)), url('${resolvedBackgroundUrl}');`;

  if (mode === "web") {
    return `
      <div class="voucher-card-preview" style="max-width:${cardWidthPx}px;">
        <div class="voucher-card-inner" style="${backgroundStyle}background-size:cover;background-position:center;">
          <div class="voucher-card-title">VOUCHER</div>
          <div class="voucher-card-name" id="preview-recipient" style="--recipient-font-size:${recipientFontSize};">${safeRecipient}</div>
          <div class="voucher-card-date-label">${safeDateLabel}</div>
          <div class="voucher-card-type">${safePackage}</div>
          <div class="voucher-card-date" id="preview-valid-until">${safeDate}</div>
          <div class="voucher-card-footer">${safeFooter}</div>
        </div>
      </div>
    `;
  }

  return renderEmailVoucherTable({
    recipient,
    packageLabel,
    validUntil,
    cardWidthPx,
    backgroundUrl: resolvedBackgroundUrl,
  });
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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${VOUCHER_FONT_LINK}" rel="stylesheet" />
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
