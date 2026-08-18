import { generateVoucherImageBuffer } from "./lib/voucher-image.mjs";

const formatDate = (date) =>
  new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

const getDefaultValidUntil = () => {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return formatDate(expiry);
};

export default async (request) => {
  if (request.method !== "GET") {
    return new Response("Metoda niedozwolona.", { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const recipient = String(url.searchParams.get("recipient") || "Osoba obdarowana").trim() || "Osoba obdarowana";
    const validUntil = String(url.searchParams.get("validUntil") || getDefaultValidUntil()).trim();

    const image = await generateVoucherImageBuffer({
      recipient,
      validUntil,
      outputWidth: 800,
    });

    return new Response(image, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("preview-voucher-image", error);
    return new Response("Nie udało się wygenerować podglądu bonu.", { status: 500 });
  }
};
