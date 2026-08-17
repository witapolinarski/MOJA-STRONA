import sharp from "sharp";
import { readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VOUCHER_TEMPLATE,
  VOUCHER_PACKAGE_LABEL,
  VOUCHER_DATE_LABEL,
  VOUCHER_CONTACT_LINE,
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

  const [blackOps, merriweather, oswald] = await Promise.all([
    readAsset(siteUrl, "fonts/BlackOpsOne-Regular.ttf"),
    readAsset(siteUrl, "fonts/Merriweather-BoldItalic.ttf"),
    readAsset(siteUrl, "fonts/Oswald-Bold.ttf"),
  ]);

  fontCache = {
    blackOps: blackOps.toString("base64"),
    merriweather: merriweather.toString("base64"),
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
  const safeFooter = escapeXml(VOUCHER_CONTACT_LINE);

  const scale = width / 600;
  const titleSize = Math.round(
    clamp(scale * VOUCHER_FIELDS.title.fontSize, VOUCHER_FIELDS.title.minFontSize, VOUCHER_FIELDS.title.fontSize),
  );
  const nameSize = getRecipientFontSizePx(recipient, width);
  const typeSize = Math.round(
    clamp(scale * VOUCHER_FIELDS.type.fontSize, VOUCHER_FIELDS.type.minFontSize, VOUCHER_FIELDS.type.fontSize),
  );
  const dateSize = Math.round(
    clamp(scale * VOUCHER_FIELDS.date.fontSize, VOUCHER_FIELDS.date.minFontSize, VOUCHER_FIELDS.date.fontSize),
  );
  const labelSize = Math.round(
    clamp(
      scale * VOUCHER_FIELDS.dateLabel.fontSize,
      VOUCHER_FIELDS.dateLabel.minFontSize,
      VOUCHER_FIELDS.dateLabel.fontSize,
    ),
  );
  const footerSize = Math.round(
    clamp(scale * VOUCHER_FIELDS.footer.fontSize, VOUCHER_FIELDS.footer.minFontSize, VOUCHER_FIELDS.footer.fontSize),
  );

  const title = getFieldBox(VOUCHER_FIELDS.title, width, height);
  const name = getFieldBox(VOUCHER_FIELDS.name, width, height);
  const dateLabel = getFieldBox(VOUCHER_FIELDS.dateLabel, width, height);
  const type = getFieldBox(VOUCHER_FIELDS.type, width, height);
  const date = getFieldBox(VOUCHER_FIELDS.date, width, height);
  const footer = getFieldBox(VOUCHER_FIELDS.footer, width, height);

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
        font-family: 'Merriweather';
        src: url(data:font/truetype;charset=utf-8;base64,${fonts.merriweather}) format('truetype');
        font-weight: 700;
        font-style: italic;
      }
      @font-face {
        font-family: 'Oswald';
        src: url(data:font/truetype;charset=utf-8;base64,${fonts.oswald}) format('truetype');
        font-weight: 700;
      }
    </style>
  </defs>
  <text x="${title.x + 1}" y="${title.y + 2}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Black Ops One', Impact, sans-serif" font-size="${titleSize}" fill="#000000" fill-opacity="0.45"
    letter-spacing="0.14em">VOUCHER</text>
  <text x="${title.x}" y="${title.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Black Ops One', Impact, sans-serif" font-size="${titleSize}" fill="#f8f4ee"
    letter-spacing="0.14em">VOUCHER</text>
  <text x="${name.x}" y="${name.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Merriweather', Georgia, serif" font-size="${nameSize}" fill="#141414"
    font-weight="700" font-style="italic">${safeRecipient}</text>
  <text x="${dateLabel.x + 1}" y="${dateLabel.y + 1}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${labelSize}" fill="#000000" fill-opacity="0.55">${safeDateLabel}</text>
  <text x="${dateLabel.x}" y="${dateLabel.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${labelSize}" fill="#f8f4ee">${safeDateLabel}</text>
  <text x="${type.x}" y="${type.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${typeSize}" fill="#141414"
    letter-spacing="0.04em" font-weight="700">${safePackage}</text>
  <text x="${date.x}" y="${date.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${dateSize}" fill="#141414"
    letter-spacing="0.02em" font-weight="700">${safeDate}</text>
  <rect x="${footer.leftPx}" y="${footer.topPx}" width="${footer.width}" height="${footer.height}" rx="4" fill="rgba(8,8,8,0.62)"/>
  <text x="${footer.x}" y="${footer.y}" text-anchor="middle" dominant-baseline="middle"
    font-family="'Oswald', Arial, sans-serif" font-size="${footerSize}" fill="#f8f4ee"
    font-weight="500">${safeFooter}</text>
</svg>`;
};

export const generateVoucherImageBuffer = async ({
  recipient,
  packageLabel = VOUCHER_PACKAGE_LABEL,
  validUntil,
  outputWidth = 600,
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
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
};

export const generateVoucherImageBase64 = async (props) => {
  const buffer = await generateVoucherImageBuffer(props);
  return buffer.toString("base64");
};
