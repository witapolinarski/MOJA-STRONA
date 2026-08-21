const TYPO_SKIP_SELECTOR =
  "script, style, noscript, textarea, input, select, option, code, pre, table, .voucher-form, .voucher-control, .voucher-preview";

const TYPO_ROOT_SELECTORS = [
  ".top-line",
  ".hero-content",
  ".section-heading",
  ".intro-copy",
  ".audience-grid article",
  ".feature-card",
  ".steps-row article",
  ".split-section .section-heading",
  ".price-panel",
  ".arsenal-grid article",
  ".arsenal-note",
  ".voucher-band > div:first-child",
  ".faq-list",
  ".contact-strip",
  ".site-footer",
];

const bindSpace = (text, pattern, replacement) => text.replace(pattern, replacement);

const typografText = (text) => {
  if (!text || !/\S/.test(text)) return text;

  let result = text.normalize("NFC");

  result = bindSpace(result, /(\d)\s+(m|mm|zł|km|kg|os\.|godz\.|stopni)\b/gi, "$1\u00A0$2");
  result = bindSpace(result, /,\s+a\s+(?=\S)/gi, ",\u00A0a\u00A0");
  result = bindSpace(result, /(^|[\s(„"«])\b([aiouwz])\s+(?=\S)/gi, "$1$2\u00A0");
  result = bindSpace(
    result,
    /\b(do|na|po|od|ze|we|ku|za|przy|bez|dla|nad|pod|oraz|albo|czy|niż|jak|że)\s+(?=\S)/gi,
    (match) => match.replace(/\s+/, "\u00A0"),
  );

  return result;
};

const shouldSkipNode = (node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest(TYPO_SKIP_SELECTOR));
};

const typografNode = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node) || !/\S/.test(node.nodeValue)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => {
    const updated = typografText(node.nodeValue);
    if (updated !== node.nodeValue) {
      node.nodeValue = updated;
    }
  });
};

const applyTypography = () => {
  TYPO_ROOT_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach(typografNode);
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyTypography, { once: true });
} else {
  applyTypography();
}
