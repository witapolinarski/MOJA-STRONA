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
  getVoucherPillBox,
} from "./voucher-layout.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SITE_URL = "https://strzelam.com";
const REFERENCE_WIDTH = 600;

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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scaleFont = (field, cardWidthPx, key = "fontSize", minKey = "minFontSize") => {
  const scale = cardWidthPx / REFERENCE_WIDTH;
  return Math.round(clamp(scale * field[key], scale * field[minKey], scale * field[key]));
};

const scaledFontValue = (field, cardWidthPx, key) =>
  Math.round((cardWidthPx / REFERENCE_WIDTH) * field[key]);

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

const innerBox = (box, paddingX = 0, paddingY = 0) => {
  const padX = box.width * paddingX;
  const padY = box.height * paddingY;

  return {
    ...box,
    leftPx: box.leftPx + padX,
    topPx: box.topPx + padY,
    width: Math.max(0, box.width - padX * 2),
    height: Math.max(0, box.height - padY * 2),
    x: box.leftPx + padX + Math.max(0, box.width - padX * 2) / 2,
    y: box.topPx + padY + Math.max(0, box.height - padY * 2) / 2,
  };
};

const splitBoxRows = (box, rowWeights, gapRatio = 0.06) => {
  const gap = box.height * gapRatio;
  const totalWeight = rowWeights.reduce((sum, weight) => sum + weight, 0);
  const availableHeight = Math.max(0, box.height - gap * (rowWeights.length - 1));
  let cursorY = box.topPx;

  return rowWeights.map((weight) => {
    const rowHeight = (availableHeight * weight) / totalWeight;
    const row = {
      ...box,
      topPx: cursorY,
      height: rowHeight,
      y: cursorY + rowHeight / 2,
    };
    cursorY += rowHeight + gap;
    return row;
  });
};

const getPathBoundingBox = (font, text, fontSize) => font.getPath(text, 0, 0, fontSize).getBoundingBox();

const fitFontSizeToBox = (font, text, box, maxSize, minSize, fill = 0.64) => {
  const maxWidth = box.width * fill;
  const maxHeight = box.height * fill;
  const floor = Math.max(8, Math.round(minSize * 0.5));

  for (let size = Math.round(maxSize); size >= floor; size -= 1) {
    const bbox = getPathBoundingBox(font, text, size);
    const width = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;

    if (width <= maxWidth && height <= maxHeight) {
      return size;
    }
  }

  return floor;
};

const renderTextInBox = (font, text, box, fontSize) => {
  const centerX = box.leftPx + box.width / 2;
  const centerY = box.topPx + box.height / 2;
  const bbox = getPathBoundingBox(font, text, fontSize);
  const x = centerX - (bbox.x1 + bbox.x2) / 2;
  const y = centerY - (bbox.y1 + bbox.y2) / 2;
  return font.getPath(text, x, y, fontSize).toPathData(2);
};

const renderSpacedTextInBox = (font, text, box, fontSize, letterSpacingEm = 0) => {
  if (!letterSpacingEm || text.length <= 1) {
    return renderTextInBox(font, text, box, fontSize);
  }

  const centerX = box.leftPx + box.width / 2;
  const centerY = box.topPx + box.height / 2;
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

const pathSvg = (pathData, fill, opacity = 1) =>
  `<path d="${pathData}" fill="${fill}" fill-opacity="${opacity}"/>`;

const pathSvgWithStroke = (pathData, fill, stroke = "#ffffff", strokeWidth = 3) =>
  `<path d="${pathData}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round"/>`;

const buildOverlaySvg = async ({
  recipient,
  packageLabel,
  validUntil,
  width,
  height,
  siteUrl,
}) => {
  const fonts = await loadFonts(siteUrl);
  const safeRecipient = recipient || "Osoba obdarowana";
  const safePackage = packageLabel || VOUCHER_PACKAGE_LABEL;
  const safeDate = formatVoucherDate(validUntil);

  const titleBox = getFieldBox(VOUCHER_FIELDS.title, width, height);
  const packageBox = innerBox(getVoucherPillBox("package", width, height), 0.06, 0.14);
  const recipientBox = innerBox(getVoucherPillBox("recipient", width, height), 0.07, 0.14);
  const dateBox = innerBox(getVoucherPillBox("date", width, height), 0.12, 0.16);
  const dateLabelBox = innerBox(getFieldBox(VOUCHER_FIELDS.dateLabel, width, height), 0.06, 0);
  const footerBox = getFieldBox(VOUCHER_FIELDS.footer, width, height);

  const titleSize = scaleFont(VOUCHER_FIELDS.title, width);
  const packageSize = fitFontSizeToBox(
    fonts.oswald,
    safePackage.toUpperCase(),
    packageBox,
    scaledFontValue(VOUCHER_FIELDS.package, width, "fontSize"),
    scaledFontValue(VOUCHER_FIELDS.package, width, "minFontSize"),
  );
  const recipientSize = fitFontSizeToBox(
    fonts.oswald,
    safeRecipient,
    recipientBox,
    getRecipientFontSizePx(recipient, width),
    scaledFontValue(VOUCHER_FIELDS.recipient, width, "minFontSize"),
  );
  const dateSize = fitFontSizeToBox(
    fonts.oswald,
    safeDate,
    dateBox,
    scaledFontValue(VOUCHER_FIELDS.date, width, "fontSize"),
    scaledFontValue(VOUCHER_FIELDS.date, width, "minFontSize"),
    0.56,
  );
  const labelSize = fitFontSizeToBox(
    fonts.oswald,
    VOUCHER_DATE_LABEL,
    dateLabelBox,
    scaledFontValue(VOUCHER_FIELDS.dateLabel, width, "fontSize"),
    scaledFontValue(VOUCHER_FIELDS.dateLabel, width, "minFontSize"),
    0.82,
  );

  const footerInner = innerBox(footerBox, 0.02, 0.1);
  const [footerLine1Box, footerLine2Box] = splitBoxRows(footerInner, [0.54, 0.46], 0.1);
  const footerSize = fitFontSizeToBox(
    fonts.oswald,
    VOUCHER_FOOTER_LINE1,
    footerLine1Box,
    scaledFontValue(VOUCHER_FIELDS.footer, width, "fontSize"),
    scaledFontValue(VOUCHER_FIELDS.footer, width, "minFontSize"),
    0.94,
  );
  const phoneSize = fitFontSizeToBox(
    fonts.oswald,
    VOUCHER_FOOTER_LINE2,
    footerLine2Box,
    scaledFontValue(VOUCHER_FIELDS.footer, width, "phoneFontSize"),
    scaledFontValue(VOUCHER_FIELDS.footer, width, "phoneMinFontSize"),
    0.9,
  );

  const titlePath = renderSpacedTextInBox(fonts.blackOps, "VOUCHER", titleBox, titleSize, 0.12);
  const titleShadow = renderSpacedTextInBox(
    fonts.blackOps,
    "VOUCHER",
    {
      ...titleBox,
      leftPx: titleBox.leftPx + 1,
      topPx: titleBox.topPx + 2,
    },
    titleSize,
    0.12,
  );
  const packagePath = renderTextInBox(fonts.oswald, safePackage.toUpperCase(), packageBox, packageSize);
  const recipientPath = renderTextInBox(fonts.oswald, safeRecipient, recipientBox, recipientSize);
  const datePath = renderTextInBox(fonts.oswald, safeDate, dateBox, dateSize);
  const dateLabelPath = renderTextInBox(fonts.oswald, VOUCHER_DATE_LABEL, dateLabelBox, labelSize);
  const footerLine1Path = renderTextInBox(fonts.oswald, VOUCHER_FOOTER_LINE1, footerLine1Box, footerSize);
  const footerLine2Path = renderTextInBox(fonts.oswald, VOUCHER_FOOTER_LINE2, footerLine2Box, phoneSize);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${pathSvg(titleShadow, "#000000", 0.5)}
  ${pathSvg(titlePath, "#ffffff")}
  ${pathSvgWithStroke(packagePath, "#111111", "#ffffff", 2)}
  ${pathSvg(recipientPath, "#111111")}
  ${pathSvg(dateLabelPath, "#ffffff")}
  ${pathSvg(datePath, "#111111")}
  <rect x="${footerBox.leftPx.toFixed(2)}" y="${footerBox.topPx.toFixed(2)}" width="${footerBox.width.toFixed(2)}" height="${footerBox.height.toFixed(2)}" rx="5" fill="rgba(8,8,8,0.82)"/>
  ${pathSvg(footerLine1Path, "#ffffff")}
  ${pathSvg(footerLine2Path, "#ffffff")}
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
  const svg = await buildOverlaySvg({
    recipient,
    packageLabel,
    validUntil,
    width,
    height,
    siteUrl,
  });
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();

  const composited = await sharp(template)
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
