(function () {
  const endpoint = "/.netlify/functions/analytics";

  if (window.location.pathname.endsWith("/statystyki.html")) return;
  if (navigator.doNotTrack === "1") return;

  const getSessionId = () => {
    const key = "strzelamAnalyticsSession";
    let sessionId = sessionStorage.getItem(key);

    if (!sessionId) {
      sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, sessionId);
    }

    return sessionId;
  };

  const getDevice = () => {
    const width = window.innerWidth || 1200;
    if (width < 760) return "telefon";
    if (width < 1024) return "tablet";
    return "komputer";
  };

  const sendEvent = (payload) => {
    const data = {
      path: window.location.pathname,
      referrer: document.referrer,
      sessionId: getSessionId(),
      device: getDevice(),
      ...payload,
    };
    const body = JSON.stringify(data);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  };

  const labels = {
    start: "Start",
    "dla-kogo": "Dla kogo",
    oferta: "Oferta",
    cennik: "Cennik",
    arsenal: "Arsenał",
    vouchery: "Bony",
    faq: "FAQ",
    kontakt: "Kontakt",
  };

  sendEvent({ type: "page_view" });

  const observeSections = () => {
    if (!("IntersectionObserver" in window)) return;

    const seen = new Set();
    const sections = Array.from(document.querySelectorAll("main[id], section[id]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id || "start";
          if (seen.has(id)) return;
          seen.add(id);
          sendEvent({ type: "section_view", section: labels[id] || id });
        });
      },
      { threshold: 0.45 },
    );

    sections.forEach((section) => observer.observe(section));
  };

  const getClickTarget = (element) => {
    const href = element.getAttribute("href") || "";
    const text = (element.textContent || "").trim().toLowerCase();

    if (element.id === "voucher-pay") return "Płatność bonu";
    if (href.startsWith("tel:")) return "Telefon";
    if (href.includes("wa.me")) return "WhatsApp";
    if (href.includes("google.com") || text.includes("opinie")) return "Opinie Google";
    if (href.includes("#vouchery") || text.includes("bon")) return "Bon podarunkowy";
    if (href.startsWith("#")) return `Sekcja ${href.replace("#", "")}`;
    if (element.matches("button")) return text || "Przycisk";
    return "Link";
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("a, button");
    if (!target) return;
    sendEvent({ type: "click", target: getClickTarget(target) });
  });

  const voucherForm = document.querySelector("#voucher-form");
  const voucherAmount = document.querySelector("#voucher-amount");

  if (voucherForm) {
    let started = false;

    voucherForm.addEventListener(
      "input",
      () => {
        if (started) return;
        started = true;
        sendEvent({ type: "voucher_form_start" });
      },
      { once: false },
    );

    voucherAmount?.addEventListener("change", () => {
      sendEvent({ type: "voucher_amount_change", amount: voucherAmount.value });
    });

    voucherForm.addEventListener("submit", () => {
      sendEvent({ type: "checkout_start", amount: voucherAmount?.value || "" });
    });
  }

  document.querySelectorAll(".faq-list details").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      const summary = details.querySelector("summary");
      sendEvent({
        type: "faq_open",
        question: summary?.textContent || "FAQ",
      });
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observeSections, { once: true });
  } else {
    observeSections();
  }
})();
