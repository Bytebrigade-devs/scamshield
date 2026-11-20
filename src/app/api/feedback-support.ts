import { createFeedbackSupport } from '@/lib/scam-checker/ui/feedback-endpoint';
import { DEMO_SUBJECT_KEY } from '@/lib/scam-checker/ui/check-service';

/**
 * Shared in-memory feedback support for the mounted checker routes.
 *
 * One instance serves both `/api/check` (issuing the opaque check id) and `/api/feedback`
 * (validating the echoed report). Storage is process-local and resets on restart by design —
 * durable persistence waits on M2's RLS convention and the shared schema. No message text.
 */
export const feedback = createFeedbackSupport({ subjectKey: DEMO_SUBJECT_KEY });
