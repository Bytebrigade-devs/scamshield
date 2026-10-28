"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createDemoData, removeFolder, type Login, type SecureNote, type Folder, type Activity } from "./model";

type VaultContext = { logins: Login[]; notes: SecureNote[]; folders: Folder[]; activity: Activity[]; locked: boolean; generatedDraft: string; setGeneratedDraft: (value: string) => void; lock: () => void; unlock: () => void; saveLogin: (login: Login) => void; saveNote: (note: SecureNote) => void; deleteItems: (ids: string[]) => void; moveItems: (ids: string[], folderId: string) => void; saveFolder: (folder: Folder) => void; deleteFolder: (id: string) => void; toggleFavorite: (id: string) => void; copy: (value: string, label: string) => Promise<boolean>; toast: string; notify: (message: string) => void; folderName: (id: string) => string };
const Context = createContext<VaultContext | null>(null);
export function VaultProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState(createDemoData);
  const [locked, setLocked] = useState(false);
  const [toast, setToast] = useState("");
  const [generatedDraft, setGeneratedDraft] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function notify(message: string) { setToast(message); }
  function record(action: string, category: Activity["category"], description = "Frontend demo action") {
    setData(old => ({ ...old, activity: [{ id: crypto.randomUUID(), action, description, category, at: new Date().toISOString() }, ...old.activity] }));
  }
  const clearAndLock = useCallback(() => {
    setLocked(true);
    setData({ logins: [], notes: [], folders: [], activity: [] });
    setGeneratedDraft("");
    setToast("");
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = null;
    router.replace("/vault/locked");
  }, [router]);
  function unlock() { setData(createDemoData()); setLocked(false); router.replace("/vault"); }
  useEffect(() => {
    if (locked) return;
    let timeout: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timeout); timeout = setTimeout(clearAndLock, 5 * 60 * 1000); };
    reset(); const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach(event => window.addEventListener(event, reset, { passive: true }));
    return () => { clearTimeout(timeout); events.forEach(event => window.removeEventListener(event, reset)); };
  }, [locked, clearAndLock]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 5000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const value: VaultContext = {
    ...data, locked, lock: clearAndLock, unlock, toast, notify, generatedDraft, setGeneratedDraft,
    folderName: id => data.folders.find(folder => folder.id === id)?.name ?? "Unfiled",
    saveLogin(login) { setData(old => ({ ...old, logins: old.logins.some(item => item.id === login.id) ? old.logins.map(item => item.id === login.id ? login : item) : [login, ...old.logins] })); record("Login saved", "login"); },
    saveNote(note) { setData(old => ({ ...old, notes: old.notes.some(item => item.id === note.id) ? old.notes.map(item => item.id === note.id ? note : item) : [note, ...old.notes] })); record("Secure note saved", "note"); },
    deleteItems(ids) { setData(old => ({ ...old, logins: old.logins.filter(item => !ids.includes(item.id)), notes: old.notes.filter(item => !ids.includes(item.id)) })); record(`${ids.length} ${ids.length === 1 ? "item" : "items"} deleted`, "login"); },
    moveItems(ids, folderId) { setData(old => ({ ...old, logins: old.logins.map(item => ids.includes(item.id) ? { ...item, folderId } : item), notes: old.notes.map(item => ids.includes(item.id) ? { ...item, folderId } : item) })); record(`${ids.length} ${ids.length === 1 ? "item" : "items"} moved`, "folder"); },
    saveFolder(folder) { setData(old => ({ ...old, folders: old.folders.some(item => item.id === folder.id) ? old.folders.map(item => item.id === folder.id ? folder : item) : [...old.folders, folder] })); record("Folder saved", "folder"); },
    deleteFolder(id) { setData(old => ({ ...old, folders: old.folders.filter(folder => folder.id !== id), logins: removeFolder(old.logins, id), notes: removeFolder(old.notes, id) })); record("Folder deleted", "folder", "Items moved to Unfiled"); },
    toggleFavorite(id) { setData(old => ({ ...old, logins: old.logins.map(item => item.id === id ? { ...item, favorite: !item.favorite } : item) })); },
    async copy(value, label) {
      try {
        await navigator.clipboard.writeText(value); record(`${label} copied`, "copy", "Clipboard clearing is best effort");
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(async () => {
          // Never blindly overwrite clipboard contents the user copied elsewhere.
          try { if (await navigator.clipboard.readText() === value) await navigator.clipboard.writeText(""); } catch { /* Browser permission can prevent cleanup. No guarantee is made. */ }
        }, 30000);
        return true;
      } catch { notify("Clipboard access was denied. You can reveal and select the value instead."); return false; }
    }
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useVault() { const context = useContext(Context); if (!context) throw new Error("VaultProvider is missing"); return context; }
