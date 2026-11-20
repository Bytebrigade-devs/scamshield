/** The displayed sender is supplied by the user, not authenticated transport metadata. */
import type { OrganizationRecord } from './organization-directory.ts';
import { contactMatches, isFresh } from './organization-verification.ts';
import type { ContactMatch } from './organization-verification.ts';

export interface SenderVerification {
  value: string;
  kind: 'name' | 'phone' | 'email';
  status: 'matched' | 'not-confirmed' | 'outdated';
  matches: ContactMatch[];
}

export function verifySender(sender: string, directory: readonly OrganizationRecord[], now = Date.now()): SenderVerification {
  const value = sender.trim();
  const email = /^[^\s<>@]+@([a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,})$/i.exec(value);
  const phone = /^\+?[\d\s().-]+$/.test(value) && /\d/.test(value);
  const kind = email ? 'email' : phone ? 'phone' : 'name';
  // Email sender comparisons require an exact reviewed domain, regardless of website subdomain policy.
  const matches = email ? directory.flatMap(org => org.domains.filter(domain => domain.value === email[1].toLowerCase())
    .map(domain => ({ organizationId: org.id, organizationName: org.name, scope: 'Exact reviewed sender email domain', source: domain.source })))
    : phone ? contactMatches('phone', value, directory) : [];
  return { value, kind, status: matches.length ? matches.some(match => isFresh(match.source, now)) ? 'matched' : 'outdated' : 'not-confirmed', matches };
}
