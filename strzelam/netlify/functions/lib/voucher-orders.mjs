import { getStore } from "@netlify/blobs";
import { VOUCHER_TIERS_PLN } from "./voucher-layout.mjs";

const STORE_NAME = "voucher-orders";

const getOrdersStore = () => getStore(STORE_NAME);

export const isAllowedVoucherAmount = (amount) => VOUCHER_TIERS_PLN.includes(Number(amount));

export const normalizeVoucherPayload = (body = {}) => {
  const amount = Number(body.amount);
  const recipient = String(body.recipient || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const amountVisibility = body.amountVisibility === "visible" ? "visible" : "hidden";
  const code = String(body.code || "").trim().toUpperCase();
  const validUntil = String(body.validUntil || "").trim();
  const orderedAt = String(body.orderedAt || new Date().toISOString());

  return {
    amount,
    recipient,
    email,
    amountVisibility,
    code,
    validUntil,
    orderedAt,
  };
};

export const validateVoucherPayload = (payload) => {
  if (!isAllowedVoucherAmount(payload.amount)) {
    return "Niepoprawna kwota bonu.";
  }
  if (!payload.recipient) {
    return "Brakuje danych bonu.";
  }
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "Podaj poprawny adres e-mail.";
  }
  if (!payload.code) {
    return "Brakuje danych bonu.";
  }
  if (!payload.validUntil) {
    return "Brakuje danych bonu.";
  }
  return "";
};

export const savePendingVoucherOrder = async (payload, stripeSessionId) => {
  const store = getOrdersStore();
  const record = {
    ...payload,
    status: "pending",
    stripeSessionId,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(payload.code, record);
  await store.setJSON(`session:${stripeSessionId}`, { code: payload.code, updatedAt: record.updatedAt });
  return record;
};

export const getVoucherOrderBySessionId = async (stripeSessionId) => {
  const store = getOrdersStore();
  const pointer = await store.get(`session:${stripeSessionId}`, { type: "json" });
  if (!pointer?.code) return null;
  return store.get(pointer.code, { type: "json" });
};

export const markVoucherOrderPaid = async (code, details = {}) => {
  const store = getOrdersStore();
  const existing = (await store.get(code, { type: "json" })) || {};
  const record = {
    ...existing,
    ...details,
    status: "paid",
    paidAt: details.paidAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.setJSON(code, record);
  return record;
};
