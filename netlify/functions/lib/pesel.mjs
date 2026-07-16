export const normalizePesel = (value) => String(value || "").replace(/\D/g, "");

export const isValidPesel = (value) => {
  const pesel = normalizePesel(value);
  if (!/^\d{11}$/.test(pesel)) return false;

  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  let sum = 0;

  for (let index = 0; index < 10; index += 1) {
    sum += Number(pesel[index]) * weights[index];
  }

  const checksum = (10 - (sum % 10)) % 10;
  return checksum === Number(pesel[10]);
};
