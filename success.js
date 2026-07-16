const summary = document.querySelector("#success-summary");
const params = new URLSearchParams(window.location.search);
const codeFromUrl = params.get("code");
const paymentSuccess = params.get("payment") === "success";

const appendItem = (list, label, value) => {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value || "—";
  row.append(term, description);
  list.append(row);
};

const formatMoney = (value) => {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);
};

const renderSummary = async () => {
  if (!summary) return;

  const raw = localStorage.getItem("pendingMembership");
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  const code = data?.code || codeFromUrl;

  if (!code) {
    summary.innerHTML =
      "<p>Wniosek został przyjęty. Jeśli nie otrzymasz wiadomości w ciągu kilku dni, napisz na kontakt@strzelamy.org.pl.</p>";
    return;
  }

  let paymentInfo = null;
  try {
    const response = await fetch(
      `/.netlify/functions/payment-status?code=${encodeURIComponent(code)}`,
    );
    const payload = await response.json().catch(() => ({}));
    paymentInfo = payload.payment;
  } catch {
    paymentInfo = null;
  }

  const list = document.createElement("dl");
  list.className = "success-list";

  appendItem(list, "Nr wniosku", code);
  appendItem(list, "Wnioskodawca", data?.name);
  appendItem(list, "E-mail", data?.email);
  appendItem(list, "Telefon", data?.phone);
  appendItem(list, "Typ członkostwa", data?.type);
  appendItem(list, "Rekomendacja", data?.recommender);

  if (paymentSuccess || paymentInfo?.status === "paid") {
    appendItem(list, "Płatność online", `Potwierdzona · ${formatMoney(paymentInfo?.amount)}`);
  }

  summary.replaceChildren(list);

  if (paymentSuccess && paymentInfo?.status === "paid" && !data) {
    const note = document.createElement("p");
    note.className = "success-lead";
    note.textContent =
      "Płatność Stripe została zaksięgowana. Uzupełnij i wyślij wniosek członkowski, jeśli jeszcze tego nie zrobiłeś.";
    summary.append(note);
  }
};

renderSummary();
