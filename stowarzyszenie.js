(() => {
  "use strict";

  const STORAGE_KEY = "stowarzyszenie-projekt-v1";

  const defaultState = {
    core: {
      nazwa: "",
      siedziba: "",
      adres: "",
      wojewodztwo: "",
      dataZebrania: "",
      miejsceZebrania: "",
      liczbaZarzadu: "3",
      kadencja: "4",
      prezes: "",
      wiceprezes: "",
      skarbnik: "",
      sekretarz: "",
      przewodniczacyKR: "",
      czlonekKR1: "",
      czlonekKR2: "",
      cele: "",
    },
    founders: [],
    checklist: {},
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredCloneState(defaultState);
      const parsed = JSON.parse(raw);
      return {
        core: { ...defaultState.core, ...(parsed.core || {}) },
        founders: Array.isArray(parsed.founders) ? parsed.founders : [],
        checklist: parsed.checklist || {},
      };
    } catch (e) {
      return structuredCloneState(defaultState);
    }
  }

  function structuredCloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // ---------- Tabs ----------
  const tabs = document.querySelectorAll(".st-tab");
  const panels = document.querySelectorAll(".st-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
    });
  });

  // ---------- Core form ----------
  const coreForm = document.getElementById("st-core-form");

  function fillCoreForm() {
    if (!coreForm) return;
    Object.entries(state.core).forEach(([key, value]) => {
      const field = coreForm.elements.namedItem(key);
      if (field) field.value = value;
    });
  }

  function readCoreForm() {
    if (!coreForm) return;
    Object.keys(state.core).forEach((key) => {
      const field = coreForm.elements.namedItem(key);
      if (field) state.core[key] = field.value;
    });
  }

  if (coreForm) {
    coreForm.addEventListener("input", () => {
      readCoreForm();
      saveState();
      renderBindings();
    });
  }

  // ---------- Data bindings (statut, protokol, uchwaly) ----------
  function computedValues() {
    const c = state.core;
    const year = c.dataZebrania ? c.dataZebrania.slice(0, 4) : "[ROK]";
    return {
      nazwa: c.nazwa || "[NAZWA STOWARZYSZENIA]",
      nazwaUpper: (c.nazwa || "[NAZWA STOWARZYSZENIA]").toUpperCase(),
      siedziba: c.siedziba || "[SIEDZIBA]",
      wojewodztwo: c.wojewodztwo || "[WOJEWÓDZTWO]",
      dataZebrania: formatDate(c.dataZebrania) || "[DATA]",
      miejsceZebrania: c.miejsceZebrania || c.adres || "[MIEJSCE]",
      liczbaZarzadu: c.liczbaZarzadu || "[LICZBA]",
      kadencja: c.kadencja || "[LICZBA]",
      prezes: c.prezes || "[PREZES]",
      wiceprezes: c.wiceprezes || "[WICEPREZES]",
      skarbnik: c.skarbnik || "[SKARBNIK]",
      sekretarz: c.sekretarz || "[SEKRETARZ]",
      przewodniczacyKR: c.przewodniczacyKR || "[PRZEWODNICZĄCY]",
      czlonekKR1: c.czlonekKR1 || "[CZŁONEK]",
      czlonekKR2: c.czlonekKR2 || "[CZŁONEK]",
      rokZebrania: year,
    };
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value + "T00:00:00");
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" });
  }

  function renderBindings() {
    const values = computedValues();
    document.querySelectorAll("[data-bind]").forEach((el) => {
      const key = el.dataset.bind;
      if (key in values) el.textContent = values[key];
    });

    const sekretarzLi = document.querySelector('[data-optional="sekretarz"]');
    if (sekretarzLi) {
      sekretarzLi.style.display = state.core.sekretarz ? "" : "none";
    }

    renderCeleList();
    renderFoundersCountInProtokol();
  }

  function renderCeleList() {
    const list = document.getElementById("statut-cele-list");
    if (!list) return;
    const lines = (state.core.cele || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    list.innerHTML = lines.map((l) => `<li>${escapeHtml(l)},</li>`).join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Founders table ----------
  const foundersBody = document.getElementById("st-founders-body");
  const foundersCountEl = document.getElementById("st-founders-count");

  function renderFounders() {
    if (!foundersBody) return;
    foundersBody.innerHTML = "";
    state.founders.forEach((founder, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><input type="text" data-field="name" value="${escapeAttr(founder.name)}" placeholder="Imię i nazwisko"></td>
        <td><input type="text" data-field="pesel" value="${escapeAttr(founder.pesel)}" placeholder="00000000000" maxlength="11"></td>
        <td><input type="text" data-field="address" value="${escapeAttr(founder.address)}" placeholder="Adres zamieszkania"></td>
        <td>…………………</td>
        <td class="no-print"><button type="button" class="st-remove-row" aria-label="Usuń">×</button></td>
      `;
      tr.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => {
          state.founders[index][input.dataset.field] = input.value;
          saveState();
        });
      });
      tr.querySelector(".st-remove-row").addEventListener("click", () => {
        state.founders.splice(index, 1);
        saveState();
        renderFounders();
        renderBindings();
      });
      foundersBody.appendChild(tr);
    });

    if (foundersCountEl) {
      const count = state.founders.length;
      const needed = Math.max(0, 7 - count);
      foundersCountEl.textContent =
        count >= 7
          ? `Liczba założycieli: ${count} — spełniony wymóg ustawowy (min. 7).`
          : `Liczba założycieli: ${count} — brakuje jeszcze ${needed}, aby spełnić wymóg ustawowy (min. 7).`;
    }
  }

  function renderFoundersCountInProtokol() {
    const el = document.getElementById("protokol-liczba-zalozycieli");
    if (el) el.textContent = String(state.founders.length);
  }

  function escapeAttr(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  const addFounderBtn = document.getElementById("st-add-founder");
  if (addFounderBtn) {
    addFounderBtn.addEventListener("click", () => {
      state.founders.push({ name: "", pesel: "", address: "" });
      saveState();
      renderFounders();
      renderBindings();
    });
  }

  // ---------- Checklist ----------
  const checklistItems = document.querySelectorAll("#st-checklist-list [data-id]");
  const progressFill = document.getElementById("st-progress-fill");
  const progressText = document.getElementById("st-progress-text");

  function renderChecklist() {
    checklistItems.forEach((li) => {
      const id = li.dataset.id;
      const checkbox = li.querySelector("input[type=checkbox]");
      checkbox.checked = Boolean(state.checklist[id]);
    });
    updateProgress();
  }

  function updateProgress() {
    const total = checklistItems.length;
    const done = Array.from(checklistItems).filter((li) => state.checklist[li.dataset.id]).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (progressFill) progressFill.style.width = pct + "%";
    if (progressText) progressText.textContent = `${done} / ${total} ukończone`;
  }

  checklistItems.forEach((li) => {
    const id = li.dataset.id;
    const checkbox = li.querySelector("input[type=checkbox]");
    checkbox.addEventListener("change", () => {
      state.checklist[id] = checkbox.checked;
      saveState();
      updateProgress();
    });
  });

  // ---------- Printing ----------
  document.querySelectorAll(".st-print-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById("print-" + btn.dataset.print);
      if (!target) return;
      target.classList.add("print-active");
      window.print();
    });
  });

  window.addEventListener("afterprint", () => {
    document.querySelectorAll(".st-printable.print-active").forEach((el) => el.classList.remove("print-active"));
  });

  // ---------- Export / import / clear ----------
  const exportBtn = document.getElementById("st-export-json");
  const importBtn = document.getElementById("st-import-json-btn");
  const importInput = document.getElementById("st-import-json-input");
  const clearBtn = document.getElementById("st-clear-all");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stowarzyszenie-dane.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (importBtn && importInput) {
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
      const file = importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          state = {
            core: { ...defaultState.core, ...(parsed.core || {}) },
            founders: Array.isArray(parsed.founders) ? parsed.founders : [],
            checklist: parsed.checklist || {},
          };
          saveState();
          renderAll();
        } catch (e) {
          alert("Nie udało się wczytać pliku — upewnij się, że to eksport z tego narzędzia.");
        }
      };
      reader.readAsText(file);
      importInput.value = "";
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (!confirm("Na pewno wyczyścić wszystkie dane zapisane w tej przeglądarce? Tej operacji nie można cofnąć.")) return;
      localStorage.removeItem(STORAGE_KEY);
      state = structuredCloneState(defaultState);
      renderAll();
    });
  }

  function renderAll() {
    fillCoreForm();
    renderFounders();
    renderChecklist();
    renderBindings();
  }

  renderAll();
})();
