import sharp from "sharp";
import { readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VOUCHER_TEMPLATE,
  VOUCHER_PACKAGE_LABEL,
  VOUCHER_DATE_LABEL,
  VOUCHER_FOOTER_LINE1,
  VOUCHER_FOOTER_LINE2,
  VOUCHER_EMAIL_WIDTH_PX,
  VOUCHER_FIELDS,
  formatVoucherDate,
  getRecipientFontSizePx,
} from "./voucher-layout.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SITE_URL = "https://strzelam.com";

let fontCache = null;
let assetsDirCache = null;

const assetCandidates = () => [
  join(moduleDir, "../assets"),
  join(process.cwd(), "assets"),
  "/var/task/assets",
];

const resolveAssetsDir = async () => {
  if (assetsDirCache) return assetsDirCache;

  for (const candidate of assetCandidates()) {
    try {
      await access(join(candidate, "voucher-template-bg.jpg"));
      assetsDirCache = candidate;
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
};

const fetchAsset = async (siteUrl, relativePath) => {
  const url = `${siteUrl.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać zasobu bonu: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const readAsset = async (siteUrl, relativePath) => {
  const assetsDir = await resolveAssetsDir();
  if (assetsDir) {
    try {
      return await readFile(join(assetsDir, relativePath));
    } catch {
      // fallback to HTTP
    }
  }

  return fetchAsset(siteUrl, relativePath.startsWith("assets/") ? relativePath : `assets/${relativePath}`);
};

const loadFontsBase64 = async (siteUrl = DEFAULT_SITE_URL) => {
  if (fontCache) return fontCache;

  const [blackOps, oswald] = await Promise.all([
    readAsset(siteUrl, "fonts/BlackOpsOne-Regular.ttf"),
    readAsset(siteUrl, "fonts/Oswald-Bold.ttf"),
  ]);

  fontCache = {
    blackOps: blackOps.toString("base64"),
    oswald: oswald.toString("base64"),
  };

  return fontCache;
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scaleFont = (field, cardWidthPx, key = "fontSize", minKey = "minFontSize") => {
  const scale = cardWidthPx / 600;
  return Math.round(clamp(scale * field[key], field[minKey], field[key]));
};

const getFieldBox = (field, width, height) => {
  const left =
    typeof field.left === "number" ? field.left : 100 - (field.right ?? 0) - field.width;
  const top =
    typeof field.top === "number" ? field.top : 100 - (field.bottom ?? 0) - field.height;

  const leftPx = (left / 100) * width;
  const topPx = (top / 100) * height;
  const boxWidth = (field.width / 100) * width;
  const boxHeight = (field.height / 100) * height;

  return {
    x: leftPx + boxWidth / 2,
    y: topPx + boxHeight / 2,
    leftPx,
    topPx,
    width: boxWidth,
    height: boxHeight,
  };
};

const textOnPill = ({ x, y, size, text, uppercase = false }) => {
  const transform = uppercase ? ' text-transform="uppercase"' : "";
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', 'Arial Narrow', Arial, sans-serif" font-size="${size}" font-weight="700"
    fill="#111111" letter-spacing="0.02em"${transform}>${text}</text>`;
};

const buildOverlaySvg = async ({
  recipient,
  packageLabel,
  validUntil,
  width,
  height,
  siteUrl,
}) => {
  const fonts = await loadFontsBase64(siteUrl);
  const safeRecipient = escapeXml(recipient || "Osoba obdarowana");
  const safePackage = escapeXml(packageLabel || VOUCHER_PACKAGE_LABEL);
  const safeDate = escapeXml(formatVoucherDate(validUntil));
  const safeDateLabel = escapeXml(VOUCHER_DATE_LABEL);
  const safeFooterLine1 = escapeXml(VOUCHER_FOOTER_LINE1);
  const safeFooterLine2 = escapeXml(VOUCHER_FOOTER_LINE2);

  const titleSize = scaleFont(VOUCHER_FIELDS.title, width);
  const packageSize = scaleFont(VOUCHER_FIELDS.package, width);
  const recipientSize = getRecipientFontSizePx(recipient, width);
  const dateSize = scaleFont(VOUCHER_FIELDS.date, width);
  const labelSize = scaleFont(VOUCHER_FIELDS.dateLabel, width);
  const footerSize = scaleFont(VOUCHER_FIELDS.footer, width);
  const phoneSize = scaleFont(VOUCHER_FIELDS.footer, width, "phoneFontSize", "phoneMinFontSize");

  const title = getFieldBox(VOUCHER_FIELDS.title, width, height);
  const packageBox = getFieldBox(VOUCHER_FIELDS.package, width, height);
  const recipientBox = getFieldBox(VOUCHER_FIELDS.recipient, width, height);
  const dateLabel = getFieldBox(VOUCHER_FIELDS.dateLabel, width, height);
  const date = getFieldBox(VOUCHER_FIELDS.date, width, height);
  const footer = getFieldBox(VOUCHER_FIELDS.footer, width, height);

  const footerLine1Y = footer.y - phoneSize * 0.55;
  const footerLine2Y = footer.y + phoneSize * 0.55;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'Black Ops One';
        src: url(data:font/truetype;charset=utf-8;base64,${fonts.blackOps}) format('truetype');
        font-weight: 400;
      }
      @font-face {
        font-family: 'Oswald';
        src: url(data:font/truetype;charset=utf-8;base64,${fonts.oswald}) format('truetype');
        font-weight: 700;
      }
    </style>
  </defs>
  <text x="${title.x + 1}" y="${title.y + 2}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Black Ops One', Impact, sans-serif" font-size="${titleSize}" fill="#000000" fill-opacity="0.5"
    letter-spacing="0.12em">VOUCHER</text>
  <text x="${title.x}" y="${title.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Black Ops One', Impact, sans-serif" font-size="${titleSize}" fill="#ffffff"
    letter-spacing="0.12em">VOUCHER</text>
  ${textOnPill({ x: packageBox.x, y: packageBox.y, size: packageSize, text: safePackage, uppercase: true })}
  ${textOnPill({ x: recipientBox.x, y: recipientBox.y, size: recipientSize, text: safeRecipient })}
  <text x="${dateLabel.x + 1}" y="${dateLabel.y + 1}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${labelSize}" font-weight="700" fill="#000000" fill-opacity="0.55">${safeDateLabel}</text>
  <text x="${dateLabel.x}" y="${dateLabel.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${labelSize}" font-weight="700" fill="#ffffff">${safeDateLabel}</text>
  ${textOnPill({ x: date.x, y: date.y, size: dateSize, text: safeDate })}
  <rect x="${footer.leftPx}" y="${footer.topPx}" width="${footer.width}" height="${footer.height}" rx="5" fill="rgba(8,8,8,0.78)"/>
  <text x="${footer.x}" y="${footerLine1Y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${footerSize}" font-weight="600" fill="#ffffff">${safeFooterLine1}</text>
  <text x="${footer.x}" y="${footerLine2Y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${phoneSize}" font-weight="700" fill="#ffffff">${safeFooterLine2}</text>
</svg>`;
};

export const generateVoucherImageBuffer = async ({
  recipient,
  packageLabel = VOUCHER_PACKAGE_LABEL,
  validUntil,
  outputWidth = VOUCHER_EMAIL_WIDTH_PX,
  siteUrl = DEFAULT_SITE_URL,
}) => {
  const template = await readAsset(siteUrl, "voucher-template-bg.jpg");
  const width = VOUCHER_TEMPLATE.width;
  const height = VOUCHER_TEMPLATE.height;
  const templateMeta = await sharp(template).metadata();
  const templatePrepared = await sharp(template)
    .resize(templateMeta.width, templateMeta.height)
    .png()
    .toBuffer();
  const svg = await buildOverlaySvg({
    recipient,
    packageLabel,
    validUntil,
    width,
    height,
    siteUrl,
  });
  const overlay = await sharp(Buffer.from(svg))
    .resize(templateMeta.width, templateMeta.height, { fit: "fill" })
    .png()
    .toBuffer();

  const composited = await sharp(templatePrepared)
    .composite([{ input: overlay, top: 0, left: 0, blend: "over" }])
    .png()
    .toBuffer();

  return sharp(composited)
    .resize(outputWidth)
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();
};

export const generateVoucherImageBase64 = async (props) => {
  const buffer = await generateVoucherImageBuffer(props);
  return buffer.toString("base64");
};
