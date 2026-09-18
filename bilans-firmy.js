// Bilans Firmy — kalkulator zysku/straty JDG na podstawie faktur przychodowych i kosztowych.
// Wszystkie dane są przechowywane wyłącznie lokalnie (localStorage) — nic nie jest wysyłane na serwer.

const STORAGE_KEY = "bilansFirmy.v1";

const DEFAULT_CATEGORIES = [
  { id: "paliwo", name: "Paliwo", pct: 75 },
  { id: "leasing", name: "Leasing", pct: 75 },
  { id: "inne", name: "Inne", pct: 100 },
];

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) && parsed.categories.length
        ? parsed.categories
        : DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      revenues: Array.isArray(parsed.revenues) ? parsed.revenues : [],
      costs: Array.isArray(parsed.costs) ? parsed.costs : [],
    };
  } catch {
    return {
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      revenues: [],
      costs: [],
    };
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;
  let str = String(raw).trim();
  if (!str) return null;
  str = str.replace(/\s|zł|PLN/gi, "");
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");
  if (hasComma && hasDot) {
    // treat the later separator as the decimal one
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (hasComma) {
    str = str.replace(",", ".");
  }
  const value = Number.parseFloat(str);
  return Number.isFinite(value) ? value : null;
}

function formatMoney(value) {
  const v = Number.isFinite(value) ? value : 0;
  return `${v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthOf(dateStr) {
  return typeof dateStr === "string" ? dateStr.slice(0, 7) : "";
}

function findCategory(idOrName) {
  return state.categories.find(
    (c) => c.id === idOrName || c.name.toLowerCase() === String(idOrName).toLowerCase()
  );
}

function normalizeHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function detectDelimiter(line) {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);
  if (!lines.length) return { rows: [], error: "Brak danych do zaimportowania." };
  const delimiter = detectDelimiter(lines[0]);
  const headerCells = lines[0].split(delimiter).map(normalizeHeader);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(delimiter);
    const row = {};
    headerCells.forEach((h, idx) => {
      row[h] = (cells[idx] || "").trim();
    });
    rows.push(row);
  }
  return { rows, error: null };
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

// ---------- Rendering ----------

const el = (id) => document.getElementById(id);

let monthFilter = currentMonthValue();
let showAllMonths = false;

function ensureMonthInput() {
  const input = el("bf-month");
  input.value = monthFilter;
  input.addEventListener("change", () => {
    monthFilter = input.value || currentMonthValue();
    showAllMonths = false;
    render();
  });
  el("bf-month-all").addEventListener("click", () => {
    showAllMonths = !showAllMonths;
    el("bf-month-all").textContent = showAllMonths
      ? "Pokaż tylko wybrany miesiąc"
      : "Pokaż wszystkie miesiące";
    render();
  });
}

function renderCategories() {
  const wrap = el("bf-categories-list");
  wrap.innerHTML = "";
  state.categories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "bf-category-row";
    row.innerHTML = `
      <span class="bf-category-row-name">${escapeHtml(cat.name)}</span>
      <input type="number" min="0" max="100" value="${cat.pct}" data-cat="${cat.id}">
      <button type="button" class="bf-row-delete" data-remove-cat="${cat.id}">Usuń</button>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("input[data-cat]").forEach((input) => {
    input.addEventListener("change", () => {
      const cat = state.categories.find((c) => c.id === input.dataset.cat);
      if (!cat) return;
      const pct = Number.parseFloat(input.value);
      cat.pct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : cat.pct;
      saveState();
      render();
    });
  });

  wrap.querySelectorAll("button[data-remove-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.removeCat;
      if (state.costs.some((c) => c.categoryId === id)) {
        // eslint-disable-next-line no-alert
        if (!confirm("Ta kategoria jest używana w kosztach. Usunąć mimo to? Koszty pozostaną z zapisanym procentem.")) {
          return;
        }
      }
      state.categories = state.categories.filter((c) => c.id !== id);
      saveState();
      populateCategorySelect();
      render();
    });
  });
}

function populateCategorySelect() {
  const select = el("bf-cost-category");
  const prev = select.value;
  select.innerHTML = state.categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.pct}%)</option>`)
    .join("");
  if (state.categories.some((c) => c.id === prev)) select.value = prev;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function visibleRevenues() {
  return state.revenues
    .filter((r) => showAllMonths || monthOf(r.date) === monthFilter)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function visibleCosts() {
  return state.costs
    .filter((c) => showAllMonths || monthOf(c.date) === monthFilter)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function renderRevenueTable() {
  const wrap = el("bf-revenue-table-wrap");
  const rows = visibleRevenues();
  if (!rows.length) {
    wrap.innerHTML = '<p class="bf-table-empty">Brak przychodów w tym okresie.</p>';
    return;
  }
  const total = rows.reduce((sum, r) => sum + (r.netto || 0), 0);
  wrap.innerHTML = `
    <table class="bf-table">
      <thead>
        <tr><th>Data</th><th>Kontrahent</th><th>Nr faktury</th><th>Netto</th><th>Brutto</th><th></th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.party)}</td>
            <td>${escapeHtml(r.number || "—")}</td>
            <td>${formatMoney(r.netto)}</td>
            <td>${r.brutto ? formatMoney(r.brutto) : "—"}</td>
            <td><button type="button" class="bf-row-delete" data-remove-revenue="${r.id}">Usuń</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr><td colspan="3">Suma</td><td>${formatMoney(total)}</td><td></td><td></td></tr>
      </tfoot>
    </table>
  `;
  wrap.querySelectorAll("button[data-remove-revenue]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.revenues = state.revenues.filter((r) => r.id !== btn.dataset.removeRevenue);
      saveState();
      render();
    });
  });
}

function renderCostTable() {
  const wrap = el("bf-cost-table-wrap");
  const rows = visibleCosts();
  if (!rows.length) {
    wrap.innerHTML = '<p class="bf-table-empty">Brak kosztów w tym okresie.</p>';
    return;
  }
  let totalNetto = 0;
  let totalRecognized = 0;
  wrap.innerHTML = `
    <table class="bf-table">
      <thead>
        <tr><th>Data</th><th>Kontrahent</th><th>Nr faktury</th><th>Kategoria</th><th>Netto</th><th>% uznane</th><th>Uznany koszt</th><th></th></tr>
      </thead>
      <tbody>
        ${rows
          .map((c) => {
            const cat = findCategory(c.categoryId) || { name: "Inne", pct: 100 };
            const pct = Number.isFinite(c.pctOverride) ? c.pctOverride : cat.pct;
            const recognized = (c.netto || 0) * (pct / 100);
            totalNetto += c.netto || 0;
            totalRecognized += recognized;
            return `
          <tr>
            <td>${escapeHtml(c.date)}</td>
            <td>${escapeHtml(c.party)}</td>
            <td>${escapeHtml(c.number || "—")}</td>
            <td>${escapeHtml(cat.name)}</td>
            <td>${formatMoney(c.netto)}</td>
            <td><span class="bf-pct-badge">${pct}%</span></td>
            <td>${formatMoney(recognized)}</td>
            <td><button type="button" class="bf-row-delete" data-remove-cost="${c.id}">Usuń</button></td>
          </tr>`;
          })
          .join("")}
      </tbody>
      <tfoot>
        <tr><td colspan="4">Suma</td><td>${formatMoney(totalNetto)}</td><td></td><td>${formatMoney(totalRecognized)}</td><td></td></tr>
      </tfoot>
    </table>
  `;
  wrap.querySelectorAll("button[data-remove-cost]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.costs = state.costs.filter((c) => c.id !== btn.dataset.removeCost);
      saveState();
      render();
    });
  });
}

function renderSummary() {
  const revenues = visibleRevenues();
  const costs = visibleCosts();
  const revenueTotal = revenues.reduce((sum, r) => sum + (r.netto || 0), 0);
  let costTotal = 0;
  let costFullTotal = 0;
  costs.forEach((c) => {
    const cat = findCategory(c.categoryId) || { pct: 100 };
    const pct = Number.isFinite(c.pctOverride) ? c.pctOverride : cat.pct;
    costTotal += (c.netto || 0) * (pct / 100);
    costFullTotal += c.netto || 0;
  });
  const result = revenueTotal - costTotal;

  el("bf-sum-revenue").textContent = formatMoney(revenueTotal);
  el("bf-sum-costs").textContent = formatMoney(costTotal);
  el("bf-sum-costs-sub").textContent =
    costFullTotal !== costTotal
      ? `Pełna kwota kosztów: ${formatMoney(costFullTotal)} (część nieuznana: ${formatMoney(costFullTotal - costTotal)})`
      : "";
  el("bf-sum-result").textContent = formatMoney(result);

  const card = el("bf-result-card");
  card.classList.remove("is-profit", "is-loss");
  const label = el("bf-sum-result-label");
  if (result > 0) {
    card.classList.add("is-profit");
    label.textContent = "Zysk";
  } else if (result < 0) {
    card.classList.add("is-loss");
    label.textContent = "Strata";
  } else {
    label.textContent = "Zero";
  }
}

function render() {
  renderCategories();
  populateCategorySelect();
  renderRevenueTable();
  renderCostTable();
  renderSummary();
}

// ---------- Forms ----------

function wireRevenueForm() {
  el("bf-revenue-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const netto = parseAmount(el("bf-rev-netto").value);
    if (netto === null) {
      // eslint-disable-next-line no-alert
      alert("Podaj poprawną kwotę netto.");
      return;
    }
    state.revenues.push({
      id: uid(),
      date: el("bf-rev-date").value,
      party: el("bf-rev-party").value.trim(),
      number: el("bf-rev-number").value.trim(),
      netto,
      brutto: parseAmount(el("bf-rev-brutto").value),
    });
    saveState();
    e.target.reset();
    render();
  });

  el("bf-rev-csv-import").addEventListener("click", () => {
    importRevenueCsv(el("bf-rev-csv").value, "bf-rev-csv-note");
  });
  el("bf-rev-csv-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    el("bf-rev-csv").value = text;
    importRevenueCsv(text, "bf-rev-csv-note");
  });
}

function importRevenueCsv(text, noteId) {
  const { rows, error } = parseCsv(text);
  const note = el(noteId);
  if (error) {
    note.textContent = error;
    return;
  }
  let imported = 0;
  rows.forEach((row) => {
    const netto = parseAmount(pick(row, "kwota_netto", "netto", "kwota netto"));
    const date = pick(row, "data", "date");
    if (netto === null || !date) return;
    state.revenues.push({
      id: uid(),
      date,
      party: pick(row, "kontrahent", "klient", "nazwa"),
      number: pick(row, "numer", "nr faktury", "nr_faktury"),
      netto,
      brutto: parseAmount(pick(row, "kwota_brutto", "brutto", "kwota brutto")) ?? null,
    });
    imported += 1;
  });
  saveState();
  note.textContent = `Zaimportowano ${imported} z ${rows.length} wierszy.`;
  render();
}

function wireCostForm() {
  el("bf-cost-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const netto = parseAmount(el("bf-cost-netto").value);
    if (netto === null) {
      // eslint-disable-next-line no-alert
      alert("Podaj poprawną kwotę netto.");
      return;
    }
    const pctRaw = el("bf-cost-pct").value;
    state.costs.push({
      id: uid(),
      date: el("bf-cost-date").value,
      party: el("bf-cost-party").value.trim(),
      number: el("bf-cost-number").value.trim(),
      categoryId: el("bf-cost-category").value,
      netto,
      brutto: parseAmount(el("bf-cost-brutto").value),
      pctOverride: pctRaw ? Math.min(100, Math.max(0, Number.parseFloat(pctRaw))) : null,
    });
    saveState();
    e.target.reset();
    populateCategorySelect();
    render();
  });

  el("bf-cost-csv-import").addEventListener("click", () => {
    importCostCsv(el("bf-cost-csv").value, "bf-cost-csv-note");
  });
  el("bf-cost-csv-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    el("bf-cost-csv").value = text;
    importCostCsv(text, "bf-cost-csv-note");
  });
}

function resolveOrCreateCategory(name) {
  if (!name) return state.categories[state.categories.length - 1]?.id || null;
  let cat = findCategory(name);
  if (!cat) {
    cat = { id: uid(), name: name.trim(), pct: 100 };
    state.categories.push(cat);
  }
  return cat.id;
}

function importCostCsv(text, noteId) {
  const { rows, error } = parseCsv(text);
  const note = el(noteId);
  if (error) {
    note.textContent = error;
    return;
  }
  let imported = 0;
  rows.forEach((row) => {
    const netto = parseAmount(pick(row, "kwota_netto", "netto", "kwota netto"));
    const date = pick(row, "data", "date");
    if (netto === null || !date) return;
    const categoryName = pick(row, "kategoria", "category") || "Inne";
    const categoryId = resolveOrCreateCategory(categoryName);
    const pctRaw = pick(row, "procent", "%", "pct");
    state.costs.push({
      id: uid(),
      date,
      party: pick(row, "kontrahent", "klient", "nazwa"),
      number: pick(row, "numer", "nr faktury", "nr_faktury"),
      categoryId,
      netto,
      brutto: parseAmount(pick(row, "kwota_brutto", "brutto", "kwota brutto")) ?? null,
      pctOverride: pctRaw ? Math.min(100, Math.max(0, Number.parseFloat(pctRaw))) : null,
    });
    imported += 1;
  });
  saveState();
  populateCategorySelect();
  note.textContent = `Zaimportowano ${imported} z ${rows.length} wierszy.`;
  render();
}

function wireCategoryForm() {
  el("bf-category-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el("bf-new-category-name").value.trim();
    const pct = Number.parseFloat(el("bf-new-category-pct").value);
    if (!name || !Number.isFinite(pct)) return;
    if (findCategory(name)) {
      // eslint-disable-next-line no-alert
      alert("Kategoria o tej nazwie już istnieje.");
      return;
    }
    state.categories.push({ id: uid(), name, pct: Math.min(100, Math.max(0, pct)) });
    saveState();
    e.target.reset();
    el("bf-new-category-pct").value = 100;
    render();
  });
}

function wireGlobalActions() {
  el("bf-clear-all").addEventListener("click", () => {
    // eslint-disable-next-line no-alert
    if (!confirm("Na pewno usunąć wszystkie dane (przychody, koszty, kategorie)? Tej operacji nie można cofnąć.")) {
      return;
    }
    state = {
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      revenues: [],
      costs: [],
    };
    saveState();
    render();
  });

  el("bf-export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bilans-firmy-kopia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  el("bf-import-json-btn").addEventListener("click", () => el("bf-import-json-input").click());
  el("bf-import-json-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state = {
        categories: Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_CATEGORIES,
        revenues: Array.isArray(parsed.revenues) ? parsed.revenues : [],
        costs: Array.isArray(parsed.costs) ? parsed.costs : [],
      };
      saveState();
      render();
      // eslint-disable-next-line no-alert
      alert("Dane zostały zaimportowane.");
    } catch {
      // eslint-disable-next-line no-alert
      alert("Nie udało się odczytać pliku — sprawdź, czy to poprawny plik eksportu tego narzędzia.");
    } finally {
      e.target.value = "";
    }
  });
}

function init() {
  ensureMonthInput();
  wireRevenueForm();
  wireCostForm();
  wireCategoryForm();
  wireGlobalActions();
  el("bf-rev-date").value = new Date().toISOString().slice(0, 10);
  el("bf-cost-date").value = new Date().toISOString().slice(0, 10);
  render();
}

document.addEventListener("DOMContentLoaded", init);
