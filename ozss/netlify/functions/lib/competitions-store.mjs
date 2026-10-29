import { getCompetitionsStore } from "./store.mjs";

export const listCompetitions = async () => {
  const store = getCompetitionsStore();
  const { blobs } = await store.list();
  const competitions = await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" })));
  return competitions.filter(Boolean);
};

export const getCompetition = async (id) => {
  const store = getCompetitionsStore();
  return store.get(id, { type: "json" });
};

export const saveCompetition = async (competition) => {
  const store = getCompetitionsStore();
  await store.setJSON(competition.id, competition);
  return competition;
};

export const nextCompetitionId = () => `zawody-${Date.now()}-${Math.round(Math.random() * 1000)}`;
