const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

const voucherForm = document.querySelector("#voucher-form");
const voucherAmount = document.querySelector("#voucher-amount");
const voucherAmountVisibility = document.querySelector("#voucher-amount-visibility");
const voucherRecipient = document.querySelector("#voucher-recipient");
const voucherEmail = document.querySelector("#voucher-email");
const voucherValidUntil = document.querySelector("#voucher-valid-until");
const previewImage = document.querySelector("#voucher-preview-image");
const previewEndpoint = "/.netlify/functions/preview-voucher-image";
const controlCode = document.querySelector("#control-code");
const controlAmount = document.querySelector("#control-amount");
const controlRecipient = document.querySelector("#control-recipient");
const controlValidUntil = document.querySelector("#control-valid-until");
const controlAmountVisibility = document.querySelector("#control-amount-visibility");
const controlEmail = document.querySelector("#control-email");
const paymentNote = document.querySelector("#payment-note");
const successVoucherSummary = document.querySelector("#success-voucher-summary");

const checkoutEndpoint = "/.netlify/functions/create-checkout-session";
const allowedVoucherAmounts = new Set(["300", "400", "500", "600", "800"]);

const formatDate = (date) =>
  new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const getVoucherExpiryDate = () => {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
};

const getVoucherCode = () => {
  let code = sessionStorage.getItem("voucherCode");

  if (!code) {
    const timestampPart = Date.now().toString(36).slice(-4).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    code = `SP-${timestampPart}-${randomPart}`;
    sessionStorage.setItem("voucherCode", code);
  }

  return code;
};

const buildPreviewImageUrl = (recipient, validUntil, amount, amountVisibility) => {
  const params = new URLSearchParams({
    recipient: recipient || "Osoba obdarowana",
    validUntil: validUntil || formatDate(getVoucherExpiryDate()),
    amount: amount || "500",
    amountVisibility: amountVisibility || "hidden",
  });
  return `${previewEndpoint}?${params.toString()}`;
};

let previewTimer = null;
let previewRequestId = 0;

const updatePreviewImage = () => {
  if (!previewImage) return;

  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const recipient = voucherRecipient?.value.trim() || "Osoba obdarowana";
    const validUntil = formatDate(getVoucherExpiryDate());
    const amount = voucherAmount?.value || "500";
    const amountVisibility = voucherAmountVisibility?.value || "hidden";
    const requestId = ++previewRequestId;

    try {
      const response = await fetch(buildPreviewImageUrl(recipient, validUntil, amount, amountVisibility));
      if (!response.ok || requestId !== previewRequestId) return;

      const blob = await response.blob();
      if (requestId !== previewRequestId) return;

      const objectUrl = URL.createObjectURL(blob);
      const previousUrl = previewImage.dataset.objectUrl;
      previewImage.src = objectUrl;
      previewImage.dataset.objectUrl = objectUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    } catch (error) {
      console.error(error);
    }
  }, 450);
};

const updateVoucherPreview = () => {
  if (!voucherForm) return;

  const recipient = voucherRecipient?.value.trim() || "Osoba obdarowana";
  const amount = voucherAmount?.value || "500";
  const showAmount = voucherAmountVisibility?.value === "visible";
  const email = voucherEmail?.value.trim() || "-";
  const expiry = formatDate(getVoucherExpiryDate());
  const code = getVoucherCode();

  if (voucherValidUntil) voucherValidUntil.textContent = expiry;
  updatePreviewImage();
  if (controlCode) controlCode.textContent = code;
  if (controlAmount) controlAmount.textContent = `${amount} zł`;
  if (controlRecipient) controlRecipient.textContent = recipient;
  if (controlValidUntil) controlValidUntil.textContent = expiry;
  if (controlAmountVisibility) {
    controlAmountVisibility.textContent = showAmount ? "widoczna" : "ukryta";
  }
  if (controlEmail) controlEmail.textContent = email;
};

const getVoucherData = () => ({
    amount: voucherAmount?.value || "500",
    recipient: voucherRecipient?.value.trim() || "Osoba obdarowana",
    email: voucherEmail?.value.trim() || "",
    amountVisibility: voucherAmountVisibility?.value || "hidden",
    code: getVoucherCode(),
    validUntil: formatDate(getVoucherExpiryDate()),
    orderedAt: new Date().toISOString(),
});

const savePendingVoucher = () => {
  const voucherData = getVoucherData();

  localStorage.setItem("pendingVoucher", JSON.stringify(voucherData));
  return voucherData;
};

const setPayButtonLoading = (isLoading) => {
  const payButton = document.querySelector("#voucher-pay");
  if (!payButton) return;

  payButton.disabled = isLoading;
  payButton.classList.toggle("is-loading", isLoading);
};

const startCheckout = async () => {
  const voucherData = savePendingVoucher();
  const isOnlinePage = window.location.protocol === "https:" || window.location.protocol === "http:";

  if (paymentNote) {
    paymentNote.textContent = "Przygotowujemy bezpieczną płatność i automatyczną wysyłkę bonu.";
  }

  if (!isOnlinePage) {
    if (paymentNote) {
      paymentNote.textContent =
        "Automatyczna płatność działa po opublikowaniu strony online.";
    }
    return;
  }

  setPayButtonLoading(true);

  try {
    const response = await fetch(checkoutEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(voucherData),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.checkoutUrl) {
      throw new Error(result.error || "Nie udalo sie przygotowac platnosci.");
    }

    window.location.href = result.checkoutUrl;
  } catch (error) {
    console.error(error);
    if (paymentNote) {
      paymentNote.textContent =
        "Nie udało się otworzyć płatności. Sprawdź dane i spróbuj ponownie albo zadzwoń: 662 475 714.";
    }
  } finally {
    setPayButtonLoading(false);
  }
};

const appendSuccessItem = (list, label, value) => {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value || "-";
  row.append(term, description);
  list.append(row);
};

const renderSuccessVoucherSummary = () => {
  if (!successVoucherSummary) return;

  const rawVoucher = localStorage.getItem("pendingVoucher");
  if (!rawVoucher) {
    const message = document.createElement("p");
    message.textContent =
      "Po potwierdzeniu płatności bon podarunkowy zostanie przygotowany i wysłany na adres e-mail podany przy zakupie.";
    successVoucherSummary.replaceChildren(message);
    return;
  }

  try {
    const voucher = JSON.parse(rawVoucher);
    const list = document.createElement("dl");
    list.className = "success-list";

    appendSuccessItem(list, "Bon dla", voucher.recipient);
    appendSuccessItem(list, "Kod bonu", voucher.code);
    appendSuccessItem(list, "Wartość", `${voucher.amount} zł`);
    appendSuccessItem(
      list,
      "Kwota na bonie",
      voucher.amountVisibility === "visible" ? "widoczna" : "ukryta",
    );
    appendSuccessItem(list, "Ważny do", voucher.validUntil);
    appendSuccessItem(list, "E-mail", voucher.email);
    successVoucherSummary.replaceChildren(list);
  } catch {
    const message = document.createElement("p");
    message.textContent =
      "Po potwierdzeniu płatności bon podarunkowy zostanie przygotowany i wysłany na adres e-mail podany przy zakupie.";
    successVoucherSummary.replaceChildren(message);
  }
};

if (voucherForm) {
  updateVoucherPreview();

  [voucherAmount, voucherAmountVisibility, voucherRecipient, voucherEmail].forEach((field) => {
    field?.addEventListener("input", updateVoucherPreview);
    field?.addEventListener("change", updateVoucherPreview);
  });

  voucherForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateVoucherPreview();

    const amount = voucherAmount?.value || "500";

    if (!allowedVoucherAmounts.has(amount)) {
      if (paymentNote) {
        paymentNote.textContent =
          "Wybierz jedną z dostępnych kwot bonu: 300, 400, 500, 600 lub 800 zł.";
      }
      return;
    }

    startCheckout();
  });
}

renderSuccessVoucherSummary();
