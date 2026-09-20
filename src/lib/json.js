/* Models sometimes wrap JSON in prose or markdown fences; strip fences and
   take the outermost object. Shared by the client and the server scheduler
   so both sides tolerate the same replies. */
export function parseJsonLoose(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("The model didn't return usable JSON.");
}
