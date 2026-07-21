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
  }

  return null;
};

export const buildMemberTextPatternIndex = (members = []) => {
  const active = (members || []).filter((member) => member.active !== false);
  const bySurname = new Map();
  const all = [];

  for (const member of active) {
    const last = normalizeText(member.lastName);
    const first = normalizeText(member.firstName).split(" ").filter(Boolean)[0] || "";
    if (!last || !first) continue;

    const unique = new Set(
      [`${last} ${first}`, `${first} ${last}`, ...buildPaymentNameKeys(member)].filter(
        (value) => value.length >= 8,
      ),
    );

    for (const pattern of unique) {
      const entry = { pattern, member, length: pattern.length };
      all.push(entry);
      const bucket = bySurname.get(last) || [];
      bucket.push(entry);
      bySurname.set(last, bucket);
    }
  }

  for (const bucket of bySurname.values()) {
    bucket.sort((a, b) => b.length - a.length);
  }

  all.sort((a, b) => b.length - a.length);
  return { bySurname, all };
};

export const findMemberInPaymentText = (text, members = [], patternIndex = null) => {
  const all = findAllMembersInPaymentText(text, members, patternIndex);
  return all.length ? all[0] : null;
};

export const findAllMembersInPaymentText = (text, members = [], patternIndex = null) => {
  const norm = normalizeText(text);
  if (!norm || norm.length < 5) return [];

  const index = patternIndex || buildMemberTextPatternIndex(members);
  const candidates = [];

  for (const [surname, patterns] of index.bySurname) {
    if (!norm.includes(surname)) continue;
    for (const entry of patterns) {
      if (norm.includes(entry.pattern)) candidates.push(entry);
    }
  }

  const unique = new Map();
  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
    for (const entry of candidates) {
      unique.set(entry.member.id, entry.member);
    }
    return [...unique.values()];
  }

  const loose = findMemberByLooseNameInText(norm, members);
  return loose ? [loose] : [];
};

const firstNameMatchesToken = (firstName, token) => {
  if (!firstName || !token || token.length < 3) return false;
  if (firstName === token) return true;
  if (firstName.startsWith(token) || token.startsWith(firstName)) return true;
  const prefix = firstName.slice(0, 3);
  return prefix.length === 3 && token.startsWith(prefix);
};

export const findMemberByLooseNameInText = (norm, members = []) => {
  const active = (members || []).filter((member) => member.active !== false);
  const tokens = norm.split(" ").filter((token) => token.length >= 3);
  if (!tokens.length) return null;

  const candidates = [];

  for (const member of active) {
    const last = normalizeText(member.lastName);
    if (!last || last.length < 3 || !norm.includes(last)) continue;

    const firstParts = normalizeText(member.firstName).split(" ").filter(Boolean);
    for (const part of firstParts) {
      if (norm.includes(`${part} ${last}`) || norm.includes(`${last} ${part}`)) {
        candidates.push({ member, score: part.length + last.length });
        continue;
      }

      for (const token of tokens) {
        if (token === last && firstNameMatchesToken(part, token)) {
          candidates.push({ member, score: 5 });
          continue;
        }
        if (firstNameMatchesToken(part, token) && tokens.includes(last)) {
          candidates.push({ member, score: part.length + last.length });
        }
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].member;
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
