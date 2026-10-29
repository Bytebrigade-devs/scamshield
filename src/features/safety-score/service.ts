import { parseSummary, safeApiPath, type SafetySummary } from "./model.ts";
export class SummaryError extends Error {
  kind: "auth" | "forbidden" | "network" | "format" | "config";
  constructor(
    kind: "auth" | "forbidden" | "network" | "format" | "config",
    message: string,
  ) {
    super(message);
    this.kind = kind;
  }
}
export async function fetchSummary(
  configuredPath: string,
  signal?: AbortSignal,
): Promise<SafetySummary> {
  const path = safeApiPath(configuredPath);
  if (!path)
    throw new SummaryError(
      "config",
      "Configure an approved same-origin /api/ endpoint before connecting.",
    );
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch {
    throw new SummaryError(
      "network",
      "We couldn’t reach the summary service. Try again when it is available.",
    );
  }
  if (response.status === 401)
    throw new SummaryError(
      "auth",
      "Sign in through Module 2 to retrieve your personal summary.",
    );
  if (response.status === 403)
    throw new SummaryError(
      "forbidden",
      "This session is not authorised to view the requested summary.",
    );
  if (!response.ok)
    throw new SummaryError(
      "network",
      "The summary service is unavailable. Your previous view has not been replaced with a success state.",
    );
  try {
    return parseSummary(await response.json());
  } catch {
    throw new SummaryError(
      "format",
      "The service returned an unsupported summary. No score has been displayed.",
    );
  }
}
