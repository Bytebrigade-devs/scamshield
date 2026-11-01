export type Health = "strong" | "weak" | "reused" | "common";
export type Login = { id: string; title: string; website: string; username: string; password: string; folderId: string; notes: string; favorite: boolean; updatedAt: string };
export type SecureNote = { id: string; title: string; content: string; folderId: string; updatedAt: string };
export type Folder = { id: string; name: string };
export type Activity = { id: string; action: string; description: string; at: string; category: "login" | "note" | "folder" | "copy" | "session" };
export type GeneratorOptions = { length: number; uppercase: boolean; lowercase: boolean; numbers: boolean; symbols: boolean; avoidAmbiguous: boolean };
export const defaultGeneratorOptions: GeneratorOptions = { length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true, avoidAmbiguous: true };
export const unfiled = "unfiled";

function randomBelow(limit: number): number {
  const cap = Math.floor(0x100000000 / limit) * limit;
  const buffer = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= cap);
  return buffer[0] % limit;
}
export function generatePassword(options: GeneratorOptions): string {
  if (!Number.isInteger(options.length) || options.length < 8 || options.length > 64) throw new Error("Choose a length between 8 and 64.");
  const groups = [options.uppercase ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "", options.lowercase ? "abcdefghijklmnopqrstuvwxyz" : "", options.numbers ? "0123456789" : "", options.symbols ? "!@#$%&*+-=?" : ""]
    .filter(Boolean).map(group => options.avoidAmbiguous ? group.replace(/[O0Il1]/g, "") : group);
  if (!groups.length) throw new Error("Choose at least one character type.");
  const pool = groups.join("");
  const chars = groups.map(group => group[randomBelow(group.length)]);
  while (chars.length < options.length) chars.push(pool[randomBelow(pool.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomBelow(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
// Preview heuristic, NOT the planned 10,000-item common list or a calibrated estimator.
const sampleCommon = new Set(["password", "password123", "12345678", "qwerty123", "letmein123"]);
export function strength(password: string): "strong" | "weak" | "common" {
  if (sampleCommon.has(password.toLowerCase())) return "common";
  if (password.length < 14 || /(.)\1{3}|1234|qwerty|password/i.test(password)) return "weak";
  return "strong";
}
export function healthOf(login: Login, all: Login[]): Health {
  const estimate = strength(login.password);
  if (estimate === "common") return "common";
  if (all.some(other => other.id !== login.id && other.password === login.password)) return "reused";
  return estimate;
}
export function removeFolder<T extends { folderId: string }>(items: T[], folderId: string): T[] {
  return items.map(item => item.folderId === folderId ? { ...item, folderId: unfiled } : item);
}
export function safeWebsite(value: string): string | null {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function createDemoData(): { logins: Login[]; notes: SecureNote[]; folders: Folder[]; activity: Activity[] } {
  const titles = ["Google", "Netflix", "GitHub", "Amazon", "LinkedIn", "Spotify", "Notion", "Figma", "Slack", "Dropbox", "Disney+", "Etsy", "Microsoft", "Apple", "Adobe", "Canva", "Zoom", "Trello", "Reddit", "Pinterest", "Airbnb", "Booking", "Duolingo", "Coursera"];
  const now = "2026-10-26T09:42:00.000Z";
  const logins: Login[] = titles.map((title, i) => ({ id: title.toLowerCase().replace(/[^a-z]/g, ""), title, website: `https://${title.toLowerCase().replace(/[^a-z]/g, "")}.example.com`, username: i === 2 ? "nimal-dev" : "nimal.perera@example.com", password: i === 1 || i === 10 ? "Example-Reused!24" : i === 3 || i === 11 ? "short123" + i : i === 4 ? "password123" : `Demo!${title}#Only-2026-${i}`, folderId: i === 2 || i === 4 ? "work" : i === 3 || i === 11 ? "shopping" : "personal", notes: i === 0 ? "Primary account for personal services. Fictional demo credentials." : "Fictional demo account. Do not use these credentials.", favorite: false, updatedAt: now }));
  const names = ["Recovery reminders", "Travel documents", "Home network", "Work onboarding", "Insurance contacts", "Project reminders"];
  return { logins, notes: names.map((title, i) => ({ id: `note-${i + 1}`, title, content: i === 0 ? "Recovery instructions are stored in my offline backup envelope.\n\nReview every three months. Keep the backup in a safe place.\n\nFictional example — no real recovery codes." : "A fictional private reminder for this frontend demonstration.", folderId: i === 3 ? "work" : "personal", updatedAt: now })), folders: [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }, { id: "shopping", name: "Shopping" }, { id: unfiled, name: "Unfiled" }], activity: [
    { id: "a1", action: "Login updated", description: "A saved login was changed", at: now, category: "login" },
    { id: "a2", action: "Password copied", description: "Fictional example event", at: "2026-10-26T09:38:00Z", category: "copy" },
    { id: "a3", action: "Secure note created", description: "A new encrypted-note design was previewed", at: "2026-10-26T09:35:00Z", category: "note" },
    { id: "a4", action: "2 items moved", description: "Folder organisation updated", at: "2026-10-26T09:30:00Z", category: "folder" }
  ] };
}
