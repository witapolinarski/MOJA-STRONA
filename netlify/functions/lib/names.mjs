export const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const nameTokens = (value) => normalizeText(value).split(" ").filter((token) => token.length > 1);

export const buildPaymentNameKeys = (member) => {
  const lastName = normalizeText(member.lastName);
  const firstName = normalizeText(member.firstName);
  const firstParts = firstName.split(" ").filter(Boolean);
  const firstToken = firstParts[0] || "";
  const keys = new Set(
    [
      member.displayName,
      member.fullName,
      `${member.firstName} ${member.lastName}`,
      `${member.lastName} ${member.firstName}`,
      `${lastName} ${firstName}`,
      `${firstName} ${lastName}`,
      `${lastName} ${firstToken}`,
      `${firstToken} ${lastName}`,
      firstToken && lastName ? `${lastName} ${firstToken.charAt(0)}` : "",
      firstToken && lastName ? `${firstToken.charAt(0)} ${lastName}` : "",
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean),
  );

  for (const part of firstParts) {
    keys.add(`${lastName} ${part}`);
    keys.add(`${part} ${lastName}`);
  }

  return keys;
};

export const buildRosterNameIndex = (members = []) => {
  const index = new Map();
  const bySurname = new Map();

  for (const member of members) {
    if (member.active === false) continue;

    for (const key of buildPaymentNameKeys(member)) {
      if (!index.has(key)) index.set(key, member);
    }

    const surname = normalizeText(member.lastName);
    if (!surname) continue;
    const bucket = bySurname.get(surname) || [];
    bucket.push(member);
    bySurname.set(surname, bucket);
  }

  return { index, bySurname };
};

export const matchPaymentToMember = (paymentName, members, lookup = null) => {
  const active = (members || []).filter((member) => member.active !== false);
  const { index, bySurname } = lookup || buildRosterNameIndex(active);
  const candidates = [paymentName].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    if (index.has(normalized)) return index.get(normalized);

    const tokens = nameTokens(candidate);
    if (tokens.length >= 2) {
      const reversed = `${tokens[1]} ${tokens[0]}`;
      if (index.has(reversed)) return index.get(reversed);

      if (tokens.length === 2) {
        const swapped = `${tokens[tokens.length - 1]} ${tokens[0]}`;
        if (index.has(swapped)) return index.get(swapped);
      }
    }

    if (tokens.length >= 1) {
      const surname = tokens.length === 1 ? tokens[0] : tokens[tokens.length - 1];
      const surnameMatches = bySurname.get(surname) || [];
      if (surnameMatches.length === 1) return surnameMatches[0];

      if (surnameMatches.length > 1 && tokens.length >= 2) {
        const firstToken = tokens[0];
        const refined = surnameMatches.filter((member) => {
          const firstParts = nameTokens(member.firstName);
          return firstParts.some(
            (part) => part.startsWith(firstToken) || firstToken.startsWith(part.charAt(0)),
          );
        });
        if (refined.length === 1) return refined[0];
      }
    }

    const fuzzy = findRosterMember(candidate, active);
    if (fuzzy) return fuzzy;
  }

  return null;
};

export const findRosterMember = (recommender, members) => {
  const active = (members || []).filter((member) => member.active !== false);
  const norm = normalizeText(recommender);
  if (!norm) return null;

  for (const member of active) {
    const variants = [
      normalizeText(member.displayName),
      normalizeText(`${member.firstName} ${member.lastName}`),
      normalizeText(`${member.lastName} ${member.firstName}`),
      normalizeText(member.fullName),
    ];
    if (variants.includes(norm)) return member;
  }

  const tokens = norm.split(" ").filter(Boolean);
  if (!tokens.length) return null;

  const surnameCandidates = new Set([tokens[tokens.length - 1], tokens[0]]);
  const matches = active.filter((member) => surnameCandidates.has(normalizeText(member.lastName)));

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    const refined = matches.filter((member) => {
      const firstTokens = normalizeText(member.firstName).split(" ").filter(Boolean);
      return tokens.some((token) => firstTokens.includes(token));
    });
    if (refined.length === 1) return refined[0];
  }

  return null;
};
