"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type AnchorHTMLAttributes } from "react";
const prefix = "/safety-score";
export function safetyHref(path: string) {
  return path === "/" ? prefix : prefix + path.replace(/\/+$/, "");
}
export function SafetyLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <Link {...props} href={safetyHref(href)} />;
}
export function useSafetyRouter() {
  const router = useRouter();
  return useMemo(
    () => ({ push: (path: string) => router.push(safetyHref(path)) }),
    [router],
  );
}
export function useSafetyPathname() {
  const path = usePathname();
  return path === prefix || path === prefix + "/"
    ? "/"
    : path.slice(prefix.length).replace(/\/+$/, "") + "/";
}
