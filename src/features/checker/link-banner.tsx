"use client";

/**
 * The lookalike-link warning banner.
 *
 * The banner model is the published, drift-tested view model (`linkWarningModel`) — this file
 * only renders it. Submitted hostnames stay inert text: the checker never opens, fetches or links
 * them, and the absence of a banner never implies safety.
 */

import { linkWarningModel } from "@/lib/scam-checker/ui/public/link-banner.js";

export function LinkWarningBanner({ inspection }: { inspection: unknown }) {
  const model = linkWarningModel(inspection) as {
    show: boolean;
    title: string;
    message: string;
    hostnames: string[];
  };
  if (!model.show) return null;
  return (
    <section className="notice notice--warning" aria-labelledby="link-warning-title" data-testid="link-warning">
      <h3 className="notice__title" id="link-warning-title">
        {model.title}
      </h3>
      <p>{model.message}</p>
      {model.hostnames.length > 0 ? (
        <p className="notice__emphasis">
          {`Flagged hostname${model.hostnames.length === 1 ? "" : "s"} (inert text, never made clickable): ${model.hostnames.join(", ")}`}
        </p>
      ) : null}
    </section>
  );
}
