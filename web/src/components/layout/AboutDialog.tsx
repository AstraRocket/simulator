import { useTranslation, Trans } from 'react-i18next';
import { appName, APP_VERSION, CONTRIBUTORS_URL, isPreRelease, UPSTREAM } from '../../services/app/appInfo';
import { catalogInfo, fetchCatalog, type CatalogInfo } from '../../services/app/remoteData';
import { fmtNum } from '../../i18n/format';
import { Dialog } from '../common/Dialog';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { useAsyncLoad } from '../common/useAsyncLoad';

interface Contributor {
  login: string;
  url: string;
  avatar?: string;
}

// Each url becomes an href, so only https is accepted.
const isContributors = (v: unknown): v is { contributors: Contributor[] } =>
  !!v &&
  Array.isArray((v as { contributors?: unknown }).contributors) &&
  (v as { contributors: unknown[] }).contributors.every(
    (c) =>
      !!c &&
      typeof (c as Contributor).login === 'string' &&
      typeof (c as Contributor).url === 'string' &&
      /^https:\/\//.test((c as Contributor).url),
  );

function useContributors(): Contributor[] {
  const { data } = useAsyncLoad(
    () => fetchCatalog<{ contributors: Contributor[] }>('contributors', isContributors),
    'contributors',
  );
  return data?.contributors ?? [];
}

function useCatalogInfo(): { motors?: CatalogInfo; components?: CatalogInfo } {
  const { data } = useAsyncLoad(
    async () => ({ motors: await catalogInfo('motors'), components: await catalogInfo('components') }),
    'catalogInfo',
  );
  return data ?? {};
}

const LINKS: [string, string][] = [
  ['OpenRocket', 'https://openrocket.info'],
  ['TeaVM', 'https://teavm.org'],
  ['React', 'https://react.dev'],
  ['three.js', 'https://threejs.org'],
  ['react-three-fiber', 'https://r3f.docs.pmnd.rs'],
  ['Tailwind CSS', 'https://tailwindcss.com'],
  ['i18next', 'https://www.i18next.com'],
  ['fflate', 'https://github.com/101arrowz/fflate'],
  ['Vite', 'https://vite.dev'],
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const CONTRIBUTORS = useContributors();
  const catalogs = useCatalogInfo();
  return (
    <Dialog id="about" title={appName()} onClose={onClose} layout="pad" size="lg">
      <div className="mb-4 flex flex-col items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" className="h-32 w-32" />
        <p className="text-center text-xs text-ink-muted">
          {t('about.tagline')} · v{APP_VERSION}
        </p>
      </div>

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
        {isPreRelease() && (
          <p className="rounded-lg bg-warn-500/10 px-3 py-2 text-warn-300 ring-1 ring-warn-400/30">{t('about.wip')}</p>
        )}
        <p>{t('about.body', { name: appName() })}</p>
        <p>{t('about.ork')}</p>
        <p>
          <Trans
            i18nKey="about.scope"
            components={{
              orLink: (
                <a // eslint-disable-line jsx-a11y-x/anchor-has-content -- Trans fills the link text from the translation
                  href="https://openrocket.info"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-400 underline"
                />
              ),
            }}
          />
        </p>
      </div>

      <div className="mt-4 border-t border-line/10 pt-3 text-xs leading-relaxed text-ink-faint">
        <p>{t('about.credits')}</p>
        <p className="mt-1">
          <Trans
            i18nKey="about.enginePin"
            values={{ ref: UPSTREAM.shortRef, date: UPSTREAM.date }}
            components={{
              commitLink: (
                <a // eslint-disable-line jsx-a11y-x/anchor-has-content -- Trans fills the link text from the translation
                  href={UPSTREAM.commitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-400 underline"
                />
              ),
            }}
          />
        </p>
        {catalogs.motors?.count !== undefined && (
          <p className="mt-1">
            {t('catalog.motorsInfo', { count: fmtNum(catalogs.motors.count), date: catalogs.motors.updated })}
          </p>
        )}
        {catalogs.components?.count !== undefined && (
          <p>
            {t('catalog.componentsInfo', {
              count: fmtNum(catalogs.components.count),
              date: catalogs.components.updated,
            })}
          </p>
        )}
      </div>

      {CONTRIBUTORS.length > 0 && (
        <div className="mt-4 border-t border-line/10 pt-3 text-xs leading-relaxed text-ink-faint">
          <p>
            {CONTRIBUTORS_URL ? (
              <a
                href={CONTRIBUTORS_URL}
                target="_blank"
                rel="noreferrer"
                title={t('about.contributorsAll')}
                className="text-accent-400 hover:underline"
              >
                {t('about.contributors')}
              </a>
            ) : (
              t('about.contributors')
            )}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
            {CONTRIBUTORS.map((c) => (
              <li key={c.login}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-accent-400 hover:underline"
                >
                  {c.avatar ? (
                    <img src={c.avatar} alt="" aria-hidden className="size-5 rounded-full ring-1 ring-line/10" />
                  ) : (
                    <span
                      aria-hidden
                      className="grid size-5 place-items-center rounded-full bg-raised text-[10px] font-medium text-ink-soft ring-1 ring-line/10"
                    >
                      {c.login.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {c.login}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-line/10 pt-3 text-xs leading-relaxed text-ink-faint">
        <p className="flex flex-wrap gap-x-2 gap-y-1">
          {LINKS.map(([name, href], i) => (
            <span key={name}>
              {i > 0 && <span className="text-ink-dim">· </span>}
              <a href={href} target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">
                {name}
              </a>
            </span>
          ))}
        </p>
      </div>

      <DialogActions>
        <DialogButton onClick={onClose} variant="primary">
          {t('about.close')}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}
