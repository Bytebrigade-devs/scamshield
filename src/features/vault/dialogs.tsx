"use client";
import { useState } from "react";
import { Button, Modal, SuccessIcon } from "./ui";
import { useVault } from "./provider";
import { unfiled, type SecureNote } from "./model";

export type DialogSpec =
  | { type: "delete"; ids: string[]; label?: string; name?: string; done?: () => void }
  | { type: "move"; ids: string[]; done?: () => void }
  | { type: "folder"; id?: string }
  | { type: "delete-folder"; id: string }
  | { type: "note"; note?: SecureNote; done?: (id: string) => void }
  | { type: "success"; title: string; description: string; done?: () => void };

export function DialogHost({ spec, close }: { spec: DialogSpec; close: () => void }) {
  const vault = useVault();
  const [value, setValue] = useState(spec.type === "folder" && spec.id ? vault.folderName(spec.id) : "");
  const [folderId, setFolderId] = useState(spec.type === "note" ? spec.note?.folderId ?? "personal" : "personal");
  const [title, setTitle] = useState(spec.type === "note" ? spec.note?.title ?? "" : "");
  const [content, setContent] = useState(spec.type === "note" ? spec.note?.content ?? "" : "");
  const [error, setError] = useState("");
  const [confirmFolderDelete, setConfirmFolderDelete] = useState(false);
  const finish = () => { close(); if (spec.type === "success") spec.done?.(); };
  if (spec.type === "success") return <Modal title={spec.title} onClose={finish}><SuccessIcon /><p>{spec.description}</p><Button className="w-full" onClick={finish}>Done</Button></Modal>;
  if (spec.type === "delete") return <Modal title={spec.ids.length === 1 ? `Delete this ${spec.label ?? "login"}?` : `Delete ${spec.ids.length} selected items?`} onClose={close}><p>{spec.name ?? "These items"} will be removed from this demo vault. This cannot be undone during this session.</p><div className="modal-actions"><Button variant="secondary" onClick={close}>{spec.ids.length === 1 ? `Keep ${spec.label ?? "login"}` : "Cancel"}</Button><Button variant="danger" onClick={() => { vault.deleteItems(spec.ids); close(); spec.done?.(); vault.notify("Selected items deleted from the demo vault."); }}>Delete {spec.ids.length === 1 ? spec.label ?? "login" : `${spec.ids.length} items`}</Button></div></Modal>;
  if (spec.type === "move") return <Modal title={`Move ${spec.ids.length} ${spec.ids.length === 1 ? "item" : "items"}`} onClose={close}><p>Choose where to keep the selected items.</p><fieldset><legend className="sr-only">Destination folder</legend>{vault.folders.map(folder => <label className="radio-option" key={folder.id}><input type="radio" name="destination" value={folder.id} checked={folderId === folder.id} onChange={() => setFolderId(folder.id)} />{folder.name}</label>)}</fieldset><div className="modal-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={() => { vault.moveItems(spec.ids, vault.folders.some(f => f.id === folderId) ? folderId : unfiled); close(); spec.done?.(); vault.notify("Items moved."); }}>Move items</Button></div></Modal>;
  if (spec.type === "delete-folder" || (spec.type === "folder" && confirmFolderDelete && spec.id)) {
    const id = spec.id!; const count = [...vault.logins, ...vault.notes].filter(item => item.folderId === id).length;
    return <Modal title={`Delete ${vault.folderName(id)} folder?`} onClose={close}><p>Its {count} {count === 1 ? "item will" : "items will"} move to Unfiled. The items will stay in your vault.</p><div className="modal-actions"><Button variant="secondary" onClick={close}>Keep folder</Button><Button variant="danger" onClick={() => { vault.deleteFolder(id); close(); vault.notify("Folder deleted. Its items are now in Unfiled."); }}>Delete folder</Button></div></Modal>;
  }
  if (spec.type === "folder") return <Modal title={spec.id ? `Manage ${vault.folderName(spec.id)}` : "Create a folder"} onClose={close}><p>{spec.id ? "Rename this folder or remove it without deleting the items inside." : "Keep related logins and notes together."}</p><form onSubmit={e => { e.preventDefault(); const name = value.trim(); if (!name) { setError("Enter a folder name."); return; } if (vault.folders.some(f => f.id !== spec.id && f.name.toLowerCase() === name.toLowerCase())) { setError("A folder with this name already exists."); return; } vault.saveFolder({ id: spec.id ?? crypto.randomUUID(), name }); close(); vault.notify(spec.id ? "Folder renamed." : "Folder created."); }} noValidate><label className="v-field">Folder name *<input className="v-input" autoFocus maxLength={60} value={value} onChange={e => setValue(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "folder-error" : undefined} /></label>{error && <p className="field-error mt-2" id="folder-error" role="alert">{error}</p>}<div className="modal-actions">{spec.id ? <><Button type="submit">Save name</Button><Button variant="danger" onClick={() => setConfirmFolderDelete(true)}>Delete folder</Button></> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit">Create folder</Button></>}</div></form></Modal>;
  if (spec.type === "note") return <Modal title={spec.note ? "Edit secure note" : "New secure note"} onClose={close}><p>Keep a fictional reminder in this demo. Encrypted storage will be connected later.</p><form className="form-stack" noValidate onSubmit={e => { e.preventDefault(); if (!title.trim() || !content.trim()) { setError("Enter a title and note content."); return; } const id = spec.note?.id ?? crypto.randomUUID(); vault.saveNote({ id, title: title.trim(), content, folderId, updatedAt: new Date().toISOString() }); close(); spec.done?.(id); vault.notify("Secure note saved in this demo session."); }}><label className="v-field">Title *<input className="v-input" autoFocus value={title} maxLength={100} onChange={e => setTitle(e.target.value)} aria-invalid={!!error && !title.trim()} /></label><label className="v-field">Folder<select className="v-select" value={folderId} onChange={e => setFolderId(e.target.value)}>{vault.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="v-field">Note content *<textarea className="v-textarea" rows={7} value={content} maxLength={5000} onChange={e => setContent(e.target.value)} aria-invalid={!!error && !content.trim()} /></label>{error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit">Save note</Button></div></form></Modal>;
  return null;
}
