import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../state/useSettings';
import {
  CERT_LEVELS,
  CERT_ORGS,
  CERT_ORG_NAMES,
  orgLabel,
  type CertOrg,
  type HeldLevel,
  type Membership,
} from '../../services/storage/flyer';
import { smallButton } from '../common/smallButton';

const FIELD =
  'rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

export function FlyerTab() {
  const { t } = useTranslation();
  const { settings, updateSection } = useSettings();
  const { flyer } = settings;
  const nameId = useId();
  const setMemberships = (memberships: Membership[]) => updateSection('flyer', { memberships });
  const patch = (i: number, p: Partial<Membership>) =>
    setMemberships(flyer.memberships.map((m, j) => (j === i ? { ...m, ...p } : m)));

  return (
    <>
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.flyerNote')}</p>
      <label htmlFor={nameId} className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">{t('settings.flyerName')}</span>
        <input
          id={nameId}
          type="text"
          value={flyer.name}
          maxLength={80}
          onChange={(e) => updateSection('flyer', { name: e.target.value })}
          className={`w-56 ${FIELD}`}
        />
      </label>

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('settings.memberships')}</h3>
      {flyer.memberships.length === 0 && <p className="text-xs text-ink-faint">{t('settings.noMemberships')}</p>}
      <ul className="space-y-2">
        {flyer.memberships.map((m, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-raised/50 p-2 ring-1 ring-line/5">
            <select
              aria-label={t('settings.memberOrg')}
              value={m.org}
              onChange={(e) => patch(i, { org: e.target.value as CertOrg })}
              className={FIELD}
            >
              {CERT_ORGS.map((o) => (
                <option key={o} value={o}>
                  {o === 'other' ? t('settings.orgOther') : CERT_ORG_NAMES[o]}
                </option>
              ))}
            </select>
            {m.org === 'other' && (
              <input
                type="text"
                aria-label={t('settings.memberOrgName')}
                placeholder={t('settings.memberOrgName')}
                value={m.orgName}
                maxLength={60}
                onChange={(e) => patch(i, { orgName: e.target.value })}
                className={`w-32 ${FIELD}`}
              />
            )}
            <input
              type="text"
              aria-label={t('settings.memberNumber')}
              placeholder={t('settings.memberNumber')}
              value={m.number}
              maxLength={40}
              onChange={(e) => patch(i, { number: e.target.value })}
              className={`w-32 ${FIELD}`}
            />
            <select
              aria-label={t('settings.memberLevel')}
              value={m.level}
              onChange={(e) => patch(i, { level: Number(e.target.value) as HeldLevel })}
              className={FIELD}
            >
              {CERT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`launchDocs.cert_${l}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMemberships(flyer.memberships.filter((_, j) => j !== i))}
              aria-label={t('settings.removeMembership', { org: orgLabel(m) || t('settings.orgOther') })}
              title={t('settings.removeMembership', { org: orgLabel(m) || t('settings.orgOther') })}
              className={smallButton('xs', 'ink', 'ml-auto')}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setMemberships([...flyer.memberships, { org: 'nar', orgName: '', number: '', level: 0 }])}
        className={smallButton('sm', 'ink')}
      >
        {t('settings.addMembership')}
      </button>
    </>
  );
}
