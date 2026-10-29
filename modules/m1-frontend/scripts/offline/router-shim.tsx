"use client";
import * as React from "react";
function current() {
  return typeof location === "undefined"
    ? "/"
    : location.hash.slice(1).split("?")[0] || "/";
}
export function usePathname() {
  const [value, setValue] = React.useState(current);
  React.useEffect(() => {
    const change = () => setValue(current());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return value;
}
export function useRouter() {
  return React.useMemo(
    () => ({
      push: (href: string) => {
        window.location.hash = href;
        window.scrollTo(0, 0);
      },
    }),
    [],
  );
}
export default function Link({
  href,
  onClick,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={"#" + href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (href.includes("/#")) {
          e.preventDefault();
          if (current() !== "/") window.location.hash = "/";
          setTimeout(
            () => document.getElementById(href.split("#")[1])?.scrollIntoView(),
            50,
          );
        } else {
          window.scrollTo(0, 0);
        }
      }}
    >
      {children}
    </a>
  );
}
