import { getBearerToken, jsonResponse, verifyMemberToken } from "./auth.mjs";
import { getApplication } from "./store.mjs";

export const getApproverEmails = () =>
  (process.env.APPROVER_EMAILS || "apolinarski@yahoo.com,apolinarski@op.pl")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const isApproverApplication = (application) => {
  if (!application?.email) return false;
  return getApproverEmails().includes(String(application.email).trim().toLowerCase());
};

export const requireApprover = async (request) => {
  const token = getBearerToken(request);
  const data = verifyMemberToken(token);

  if (!data) {
    return { ok: false, response: jsonResponse({ error: "Brak autoryzacji członka." }, 401) };
  }

  const member = await getApplication(data.code);
  if (!member || member.status !== "approved") {
    return { ok: false, response: jsonResponse({ error: "Brak dostępu do strefy klubowej." }, 403) };
  }

  if (!isApproverApplication(member)) {
    return { ok: false, response: jsonResponse({ error: "Brak uprawnień do akceptacji wniosków." }, 403) };
  }

  return { ok: true, member };
};
