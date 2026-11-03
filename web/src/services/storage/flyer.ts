/**
 * The flyer, as Settings ▸ Flyer keeps them: a name, and each organization
 * they fly under with their member number and the highest certification they
 * hold there. The flight card prints it and checks the flight against it.
 *
 * NAR and Tripoli in the United States, CAR in Canada; anyone else (UKRA, AMRS,
 * a club of their own) is Other with its name typed in. Each rates its
 * certifications the same way, Level 1 to 3, by the impulse the flyer may fly.
 */
export const CERT_ORGS = ['nar', 'tripoli', 'car', 'other'] as const;
export type CertOrg = (typeof CERT_ORGS)[number];

/** The organizations' own names, the same in every language. */
export const CERT_ORG_NAMES: Record<Exclude<CertOrg, 'other'>, string> = {
  nar: 'NAR',
  tripoli: 'Tripoli',
  car: 'CAR',
};

/** No certification, or Level 1 to 3. */
export const CERT_LEVELS = [0, 1, 2, 3] as const;
export type HeldLevel = (typeof CERT_LEVELS)[number];

export interface Membership {
  org: CertOrg;
  /** Other's name, as the flyer typed it; '' for the named organizations. */
  orgName: string;
  number: string;
  level: HeldLevel;
}

export interface Flyer {
  name: string;
  memberships: Membership[];
}

export const DEFAULT_FLYER: Flyer = { name: '', memberships: [] };

/** What a membership is called on the card: the organization's own name, or the one typed for Other. */
export const orgLabel = (m: Pick<Membership, 'org' | 'orgName'>): string =>
  m.org === 'other' ? m.orgName.trim() : CERT_ORG_NAMES[m.org];

/** The highest level any membership holds; null when there are none. */
export function highestLevel(flyer: Flyer): HeldLevel | null {
  if (!flyer.memberships.length) return null;
  return flyer.memberships.reduce<HeldLevel>((top, m) => (m.level > top ? m.level : top), 0);
}

/** A stored flyer, field by field: anything unusable is dropped rather than shown on a card. */
export function flyerFrom(value: unknown): Flyer {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_FLYER);
  const v = value as { name?: unknown; memberships?: unknown };
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
  const memberships = Array.isArray(v.memberships)
    ? v.memberships.flatMap((raw): Membership[] => {
        if (!raw || typeof raw !== 'object') return [];
        const m = raw as Record<string, unknown>;
        if (!CERT_ORGS.includes(m.org as CertOrg)) return [];
        const level = CERT_LEVELS.includes(m.level as HeldLevel) ? (m.level as HeldLevel) : 0;
        return [{ org: m.org as CertOrg, orgName: text(m.orgName, 60), number: text(m.number, 40), level }];
      })
    : [];
  return { name: text(v.name, 80), memberships };
}
