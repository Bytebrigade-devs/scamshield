import { VaultScreen } from "@/features/vault/screens";
export default async function VaultPage({ params }: { params: Promise<{ segments?: string[] }> }) { const { segments = [] } = await params; return <VaultScreen segments={segments} />; }
