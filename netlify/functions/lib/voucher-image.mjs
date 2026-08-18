import sharp from "sharp";
import opentype from "opentype.js";
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
  join(moduleDir, "../../assets"),
  join(process.cwd(), "assets"),
  join(process.cwd(), "netlify/functions/assets"),
  join(process.cwd(), "strzelam/netlify/functions/assets"),
  "/var/task/assets",
  "/var/task/netlify/functions/assets",
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

const parseFontBuffer = (buffer) => {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return opentype.parse(arrayBuffer);
};

const loadFonts = async (siteUrl = DEFAULT_SITE_URL) => {
  if (fontCache) return fontCache;

  const [blackOpsBuffer, oswaldBuffer] = await Promise.all([
    readAsset(siteUrl, "fonts/BlackOpsOne-Regular.ttf"),
    readAsset(siteUrl, "fonts/Oswald-Bold.ttf"),
  ]);

  fontCache = {
    blackOps: parseFontBuffer(blackOpsBuffer),
    oswald: parseFontBuffer(oswaldBuffer),
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

const REFERENCE_WIDTH = 600;

const scaleFont = (field, cardWidthPx, key = "fontSize", minKey = "minFontSize") => {
  const scale = cardWidthPx / REFERENCE_WIDTH;
  return Math.round(clamp(scale * field[key], scale * field[minKey], scale * field[key]));
};

const scaledFontValue = (field, cardWidthPx, key) =>
  Math.round((cardWidthPx / REFERENCE_WIDTH) * field[key]);

const fitFontSizeToBox = (font, text, box, maxSize, minSize, fill = 0.76) => {
  const maxWidth = box.width * fill;
  const maxHeight = box.height * fill;
  let best = minSize;

  for (let size = Math.round(minSize); size <= Math.round(maxSize); size += 1) {
    const bbox = getPathBoundingBox(font, text, size);
    const width = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;

    if (width <= maxWidth && height <= maxHeight) {
      best = size;
    } else {
      break;
    }
  }

  return best;
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

const pillScoreAt = (data, width, channels, x, y) => {
  const index = (y * width + x) * channels;
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const average = (red + green + blue) / 3;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  return average > 185 && spread < 25 ? average : 0;
};

const findBestPill = (data, width, height, channels, { xMin, xMax, yMin, yMax }) => {
  let best = null;

  for (let leftPct = xMin; leftPct < xMax; leftPct += 0.005) {
    for (let widthPct = 0.28; widthPct <= 0.45; widthPct += 0.005) {
      const rightPct = leftPct + widthPct;
      if (rightPct > xMax) continue;

      let score = 0;
      let samples = 0;

      for (let y = Math.floor(height * yMin); y < Math.floor(height * yMax); y += 2) {
        for (let x = Math.floor(width * leftPct); x < Math.floor(width * rightPct); x += 3) {
          const value = pillScoreAt(data, width, channels, x, y);
          if (value) {
            score += value;
            samples += 1;
          }
        }
      }

      if (samples < 50) continue;

      const candidate = {
        left: leftPct * 100,
        width: widthPct * 100,
        right: rightPct * 100,
        cx: ((leftPct + rightPct) / 2) * 100,
        top: yMin * 100,
        height: (yMax - yMin) * 100,
        cy: ((yMin + yMax) / 2) * 100,
      };

      if (!best || score > best.score) {
        best = { ...candidate, score };
      }
    }
  }

  return best;
};

const analyzeTemplatePills = async (templateBuffer) => {
  const { data, info } = await sharp(templateBuffer).raw().toBuffer({ resolveWithObject: true });
  const packagePill = findBestPill(data, info.width, info.height, info.channels, {
    xMin: 0.05,
    xMax: 0.65,
    yMin: 0.54,
    yMax: 0.7,
  });
  const recipientPill = findBestPill(data, info.width, info.height, info.channels, {
    xMin: 0.05,
    xMax: 0.52,
    yMin: 0.74,
    yMax: 0.86,
  });
  const datePill = findBestPill(data, info.width, info.height, info.channels, {
    xMin: 0.5,
    xMax: 0.95,
    yMin: 0.74,
    yMax: 0.86,
  });

  return { packagePill, recipientPill, datePill };
};

const pillToBox = (pill, width, height) => {
  const leftPx = (pill.left / 100) * width;
  const topPx = (pill.top / 100) * height;
  const boxWidth = (pill.width / 100) * width;
  const boxHeight = (pill.height / 100) * height;

  return {
    x: (pill.cx / 100) * width,
    y: (pill.cy / 100) * height,
    leftPx,
    topPx,
    width: boxWidth,
    height: boxHeight,
  };
};

const clipRect = (id, box, radius = 18) =>
  `<clipPath id="${id}"><rect x="${box.leftPx}" y="${box.topPx}" width="${box.width}" height="${box.height}" rx="${radius}"/></clipPath>`;

const getPathBoundingBox = (font, text, fontSize) => {
  const path = font.getPath(text, 0, 0, fontSize);
  return path.getBoundingBox();
};

const getCenteredPathData = (font, text, centerX, centerY, fontSize) => {
  const bbox = getPathBoundingBox(font, text, fontSize);
  const x = centerX - (bbox.x1 + bbox.x2) / 2;
  const y = centerY - (bbox.y1 + bbox.y2) / 2;
  return font.getPath(text, x, y, fontSize).toPathData(2);
};

const getSpacedPathData = (font, text, centerX, centerY, fontSize, letterSpacingEm = 0) => {
  if (!letterSpacingEm || text.length <= 1) {
    return getCenteredPathData(font, text, centerX, centerY, fontSize);
  }

  const chars = [...text];
  const spacing = fontSize * letterSpacingEm;
  const charBoxes = chars.map((char) => getPathBoundingBox(font, char, fontSize));
  const totalWidth =
    charBoxes.reduce((sum, box) => sum + (box.x2 - box.x1), 0) + spacing * (chars.length - 1);

  let cursorX = centerX - totalWidth / 2;
  const parts = [];

  chars.forEach((char, index) => {
    const box = charBoxes[index];
    const charWidth = box.x2 - box.x1;
    const x = cursorX - box.x1;
    const y = centerY - (box.y1 + box.y2) / 2;
    parts.push(font.getPath(char, x, y, fontSize).toPathData(2));
    cursorX += charWidth + spacing;
  });

  return parts.join(" ");
};

const pathElement = (pathData, fill, opacity = 1) =>
  `<path d="${pathData}" fill="${fill}" fill-opacity="${opacity}"/>`;

const buildOverlaySvg = async ({
  recipient,
  packageLabel,
  validUntil,
  width,
  height,
  siteUrl,
  templateBuffer,
}) => {
  const fonts = await loadFonts(siteUrl);
  const safeRecipient = recipient || "Osoba obdarowana";
  const safePackage = packageLabel || VOUCHER_PACKAGE_LABEL;
  const safeDate = formatVoucherDate(validUntil);
  const pills = await analyzeTemplatePills(templateBuffer);

  const titleSize = scaleFont(VOUCHER_FIELDS.title, width);
  const packageMaxSize = scaledFontValue(VOUCHER_FIELDS.package, width, "fontSize");
  const packageMinSize = scaledFontValue(VOUCHER_FIELDS.package, width, "minFontSize");
  const recipientMaxSize = getRecipientFontSizePx(recipient, width);
  const recipientMinSize = scaledFontValue(VOUCHER_FIELDS.recipient, width, "minFontSize");
  const dateMaxSize = scaledFontValue(VOUCHER_FIELDS.date, width, "fontSize");
  const dateMinSize = scaledFontValue(VOUCHER_FIELDS.date, width, "minFontSize");
  const labelSize = scaleFont(VOUCHER_FIELDS.dateLabel, width);
  const footerSize = scaleFont(VOUCHER_FIELDS.footer, width);
  const phoneSize = scaleFont(VOUCHER_FIELDS.footer, width, "phoneFontSize", "phoneMinFontSize");

  const title = getFieldBox(VOUCHER_FIELDS.title, width, height);
  const packageBox = pillToBox(pills.packagePill, width, height);
  const recipientBox = pillToBox(pills.recipientPill, width, height);
  const dateBox = pillToBox(pills.datePill, width, height);
  const dateLabelBox = {
    ...dateBox,
    topPx: (VOUCHER_FIELDS.dateLabel.top / 100) * height,
    height: (VOUCHER_FIELDS.dateLabel.height / 100) * height,
    y: (VOUCHER_FIELDS.dateLabel.top / 100) * height + ((VOUCHER_FIELDS.dateLabel.height / 100) * height) / 2,
  };
  const footer = getFieldBox(VOUCHER_FIELDS.footer, width, height);

  const packageSize = fitFontSizeToBox(
    fonts.oswald,
    safePackage.toUpperCase(),
    packageBox,
    packageMaxSize,
    packageMinSize,
  );
  const recipientSize = fitFontSizeToBox(
    fonts.oswald,
    safeRecipient,
    recipientBox,
    recipientMaxSize,
    recipientMinSize,
  );
  const dateSize = fitFontSizeToBox(fonts.oswald, safeDate, dateBox, dateMaxSize, dateMinSize, 0.72);

  const footerLine1Y = footer.y - phoneSize * 0.55;
  const footerLine2Y = footer.y + phoneSize * 0.55;

  const titleShadow = getSpacedPathData(fonts.blackOps, "VOUCHER", title.x + 1, title.y + 2, titleSize, 0.12);
  const titleMain = getSpacedPathData(fonts.blackOps, "VOUCHER", title.x, title.y, titleSize, 0.12);
  const packagePath = getCenteredPathData(
    fonts.oswald,
    safePackage.toUpperCase(),
    packageBox.x,
    packageBox.y,
    packageSize,
  );
  const recipientPath = getCenteredPathData(
    fonts.oswald,
    safeRecipient,
    recipientBox.x,
    recipientBox.y,
    recipientSize,
  );
  const datePath = getCenteredPathData(fonts.oswald, safeDate, dateBox.x, dateBox.y, dateSize);
  const dateLabelMain = getCenteredPathData(
    fonts.oswald,
    VOUCHER_DATE_LABEL,
    dateBox.x,
    dateLabelBox.y,
    labelSize,
  );
  const footerLine1Path = getCenteredPathData(fonts.oswald, VOUCHER_FOOTER_LINE1, footer.x, footerLine1Y, footerSize);
  const footerLine2Path = getCenteredPathData(fonts.oswald, VOUCHER_FOOTER_LINE2, footer.x, footerLine2Y, phoneSize);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${pathElement(titleShadow, "#000000", 0.5)}
  ${pathElement(titleMain, "#ffffff")}
  ${pathElement(packagePath, "#111111")}
  ${pathElement(recipientPath, "#111111")}
  ${pathElement(dateLabelMain, "#ffffff")}
  ${pathElement(datePath, "#111111")}
  <rect x="${footer.leftPx}" y="${footer.topPx}" width="${footer.width}" height="${footer.height}" rx="5" fill="rgba(8,8,8,0.78)"/>
  ${pathElement(footerLine1Path, "#ffffff")}
  ${pathElement(footerLine2Path, "#ffffff")}
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
    templateBuffer: template,
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
