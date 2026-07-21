(() => {
  const SOZ_LIST_URL = "https://soz.pzss.org.pl/Club/Persons/List";
  const DEFAULT_SITE = "https://relaxed-sawine-3b870a.netlify.app";
  const SECRET_KEY = "sagittariusSozSyncSecret";
  const SITE_KEY = "sagittariusSozSyncSite";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalizeDate = (value) => {
    const text = String(value || "").trim();
    if (!text || text === "—" || text === "-") return "";
    return text.slice(0, 10);
  };

  const rowToLine = (cells) => {
    const values = cells.map((cell) => String(cell || "").replace(/\s+/g, " ").trim());
    const pesel = values.find((cell) => /^\d{11}$/.test(cell.replace(/\D/g, ""))) || "";
    if (!pesel) return "";

    const cleanPesel = pesel.replace(/\D/g, "");
    const peselIndex = values.findIndex((cell) => cell.replace(/\D/g, "") === cleanPesel);
    const namePart = values[peselIndex - 1] || values[0] || "";
    const email = values[peselIndex + 1] || "";
    const memberSince = normalizeDate(values[peselIndex + 2]);
    const memberUntil = normalizeDate(values[peselIndex + 3]);

    if (!namePart || /imię i nazwisko/i.test(namePart)) return "";
    return [namePart, cleanPesel, email, memberSince, memberUntil].join("\t");
  };

  const scrapeCurrentTable = () => {
    const lines = new Set();

    for (const table of document.querySelectorAll("table")) {
      for (const row of table.querySelectorAll("tbody tr")) {
        const cells = [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim());
        const line = rowToLine(cells);
        if (line) lines.add(line);
      }
    }

    return [...lines];
  };

  const collectWithDataTables = async () => {
    if (!window.jQuery || !jQuery.fn?.dataTable) return null;

    const tables = jQuery("table.dataTable, table[id]");
    const lines = new Set();

    for (let index = 0; index < tables.length; index += 1) {
      const table = jQuery(tables[index]);
      if (!jQuery.fn.dataTable.isDataTable(table)) continue;

      const dataTable = table.DataTable();
      const info = dataTable.page.info();
      const originalPage = info.page;
      const pageSize = info.length || 100;
      const totalPages = Math.max(1, Math.ceil(info.recordsDisplay / pageSize));

      for (let page = 0; page < totalPages; page += 1) {
        dataTable.page(page).draw("page");
        await sleep(250);

        dataTable.rows({ page: "current" }).every(function collectRow() {
          const cells = jQuery(this.node()).find("td").toArray().map((cell) => cell.innerText.trim());
          const line = rowToLine(cells);
          if (line) lines.add(line);
        });
      }

      dataTable.page(originalPage).draw("page");
    }

    return lines.size ? [...lines] : null;
  };

  const collectWithPagination = async () => {
    const lines = new Set();
    let stagnation = 0;

    for (let step = 0; step < 200; step += 1) {
      for (const line of scrapeCurrentTable()) lines.add(line);

      const nextButton = [...document.querySelectorAll("a, button")].find((element) => {
        const label = `${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase();
        return /następna|następny|next|›|»/i.test(label) && !element.classList.contains("disabled");
      });

      if (!nextButton || nextButton.disabled || nextButton.classList.contains("disabled")) break;

      const before = lines.size;
      nextButton.click();
      await sleep(400);
      if (lines.size === before) {
        stagnation += 1;
        if (stagnation >= 3) break;
      } else {
        stagnation = 0;
      }
    }

    return [...lines];
  };

  const collectAllLines = async () => {
    const dataTableLines = await collectWithDataTables();
    if (dataTableLines?.length) return dataTableLines;

    const paginatedLines = await collectWithPagination();
    if (paginatedLines.length) return paginatedLines;

    return scrapeCurrentTable();
  };

  const getSiteUrl = () => {
    const stored = localStorage.getItem(SITE_KEY);
    if (stored) return stored.replace(/\/$/, "");

    const entered = window.prompt(
      "Podaj adres strony klubu (np. https://relaxed-sawine-3b870a.netlify.app):",
      DEFAULT_SITE,
    );
    if (!entered) throw new Error("Anulowano synchronizację.");

    const normalized = entered.trim().replace(/\/$/, "");
    localStorage.setItem(SITE_KEY, normalized);
    return normalized;
  };

  const getSyncSecret = () => {
    const stored = localStorage.getItem(SECRET_KEY);
    if (stored) return stored;

    const entered = window.prompt("Podaj klucz synchronizacji z Netlify (ROSTER_SYNC_SECRET):");
    if (!entered) throw new Error("Brak klucza synchronizacji.");

    localStorage.setItem(SECRET_KEY, entered.trim());
    return entered.trim();
  };

  const syncFromSozPage = async () => {
    if (!location.href.includes("soz.pzss.org.pl/Club/Persons/List")) {
      const go = window.confirm(
        `Otwórz listę zawodników SOZ:\n${SOZ_LIST_URL}\n\nPrzejść teraz?`,
      );
      if (go) {
        location.href = SOZ_LIST_URL;
      }
      return;
    }

    const lines = await collectAllLines();
    if (!lines.length) {
      throw new Error("Nie znaleziono zawodników na stronie. Ustaw 100 wpisów na stronę i spróbuj ponownie.");
    }

    const site = getSiteUrl();
    const secret = getSyncSecret();
    const response = await fetch(`${site}/.netlify/functions/member-roster-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Roster-Sync-Secret": secret,
      },
      body: JSON.stringify({
        text: lines.join("\n"),
        source: "soz-persons-list",
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Synchronizacja nie powiodła się.");
    }

    window.alert(`Zsynchronizowano ${data.memberCount} członków z SOZ.`);
  };

  window.sagittariusSozSync = syncFromSozPage;
  syncFromSozPage().catch((error) => window.alert(error.message || String(error)));
})();
