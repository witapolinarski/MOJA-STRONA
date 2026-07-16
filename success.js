const summary = document.querySelector("#success-summary");
const params = new URLSearchParams(window.location.search);
const codeFromUrl = params.get("code");

const appendItem = (list, label, value) => {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value || "—";
  row.append(term, description);
  list.append(row);
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
      "<p>Wniosek został przyjęty. Jeśli nie otrzymasz wiadomości w ciągu kilku dni, napisz na apolinarski@yahoo.com.</p>";
    return;
  }

  const list = document.createElement("dl");
  list.className = "success-list";

  appendItem(list, "Nr wniosku", code);
  appendItem(list, "Wnioskodawca", data?.name);
  appendItem(list, "E-mail", data?.email);
  appendItem(list, "Telefon", data?.phone);
  appendItem(list, "Typ członkostwa", data?.type);
  appendItem(list, "Rekomendacja", data?.recommender);

  summary.replaceChildren(list);
};

renderSummary();
