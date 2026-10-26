"use client";
import { Heading, Card } from "./ui";
export function VaultScreen({ segments }: { segments: string[] }) { return <><Heading title="Password vault" description="A safer home for your passwords, notes and everyday accounts." /><Card>Vault interface foundation · {segments.join(" / ") || "All items"}</Card></>; }
