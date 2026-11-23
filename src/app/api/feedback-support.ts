import { createFeedbackSupport } from '@/lib/scam-checker/ui/feedback-endpoint';
import { DEMO_SUBJECT_KEY } from '@/lib/scam-checker/ui/check-service';
import { selectPersistence } from '@/lib/scam-checker/boundary/persistence-mode';

/**
 * Shared feedback support for the mounted checker routes.
 *
 * One instance serves both `/api/check` (issuing the opaque check id) and `/api/feedback`
 * (validating the echoed report). Storage is in memory unless `M4_DURABLE_STORE` is configured
 * — `selectPersistence` fails closed, so a half-configured durable store throws at import
 * rather than silently running in memory. No message text is ever stored.
 */
export const selection = selectPersistence(process.env);

export const feedback = createFeedbackSupport({
  subjectKey: DEMO_SUBJECT_KEY,
  ...(selection.mode === 'durable'
    ? {
        feedbackPort: selection.persistence.feedback,
        readOwnedCheck: (checkId: string, subjectKey: string, now: number) =>
          selection.persistence.checks.getOwned(checkId, subjectKey, now),
      }
    : {}),
});
