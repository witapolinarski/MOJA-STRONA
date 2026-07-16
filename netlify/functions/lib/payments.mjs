import { getApplicationsStore, getApplication, saveApplication } from "./store.mjs";

const paymentKey = (code) => `payment:${code}`;

export const getPaymentRecord = async (code) => {
  const store = getApplicationsStore();
  return store.get(paymentKey(code), { type: "json" });
};

export const savePaymentRecord = async (code, payment) => {
  const store = getApplicationsStore();
  await store.setJSON(paymentKey(code), payment);

  const application = await getApplication(code);
  if (application) {
    application.payment = payment;
    await saveApplication(application);
  }

  return payment;
};

export const mergePaymentIntoApplication = async (application) => {
  const payment = await getPaymentRecord(application.code);
  if (payment) {
    application.payment = payment;
  }
  return application;
};

export const isPaymentConfirmed = (application) =>
  application?.payment?.status === "paid" ||
  Boolean(application?.files?.paymentProof);
