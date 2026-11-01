import { VaultProvider } from "@/features/vault/provider";
import { VaultShell } from "@/features/vault/shell";
import "./vault.css";
export default function VaultLayout({ children }: { children: React.ReactNode }) { return <VaultProvider><VaultShell>{children}</VaultShell></VaultProvider>; }
