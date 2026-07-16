export const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

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
