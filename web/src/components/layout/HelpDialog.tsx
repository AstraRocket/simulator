import { useTranslation } from 'react-i18next';
import { docPageUrl, helpUrlFor } from '../../services/app/appInfo';
import { Dialog } from '../common/Dialog';
import { HelpPageFrame } from './HelpPageFrame';
import { HelpRail } from './HelpRail';
import { useFrameHighlight } from './useFrameHighlight';
import { useHelpContents } from './useHelpContents';
import { useHelpFrame } from './useHelpFrame';
import { useHelpNavigation } from './useHelpNavigation';
import { useHelpPage } from './useHelpPage';
import { useHelpSearch } from './useHelpSearch';

// Loads `docs/<slug>/index.html`: the directory form does not resolve from the offline precache.
export function HelpDialog({ page, onClose }: { page: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { target, canGoBack, open, goBack } = useHelpNavigation(page, i18n.language);
  const { frameRef, ready, activeHash, navigate, onFrameLoad } = useHelpFrame(target, i18n.language, open);
  const { contentsOpen, toggleContents, pick, activeRow } = useHelpContents(navigate, activeHash);
  const { probed, pages } = useHelpPage(target);
  const search = useHelpSearch(pages, i18n.language, pick);
  useFrameHighlight(frameRef, ready, search.highlight, target);

  const status = probed === null ? 'probing' : !probed.page ? 'missing' : ready ? 'ready' : 'rendering';

  const siteHref = docPageUrl(helpUrlFor(i18n.language), target.slug);
  const heading = probed?.page?.title || t('help.title');
  const headings = probed?.page?.contents.headings ?? [];

  return (
    <Dialog
      id="help"
      title={heading}
      name={t('help.title')}
      eyebrow={probed?.page?.title ? t('help.title') : undefined}
      onClose={onClose}
      layer="top"
      size="4xl"
      layout="fill"
      leading={
        <>
          {pages.length > 0 && (
            <button
              onClick={toggleContents}
              aria-expanded={contentsOpen}
              aria-label={t('help.contents')}
              title={t('help.contents')}
              className="shrink-0 rounded-lg bg-raised px-2 py-1 text-sm text-ink-soft ring-1 ring-line/10 hover:bg-elevated"
            >
              ☰
            </button>
          )}
          <button
            onClick={goBack}
            disabled={!canGoBack}
            aria-label={t('help.back')}
            title={t('help.back')}
            className="shrink-0 rounded-lg bg-raised px-2 py-1 text-sm text-ink-soft ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:text-ink-dim disabled:hover:bg-raised"
          >
            &lsaquo;
          </button>
        </>
      }
      actions={
        siteHref && (
          <a
            href={siteHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('help.openOnSite')}
            title={t('help.openOnSite')}
            className="shrink-0 rounded-lg bg-raised px-2 py-1 text-xs text-ink-soft ring-1 ring-line/10 hover:bg-elevated"
          >
            <span className="hidden sm:inline">{t('help.openOnSite')}</span>
            <span className="sm:hidden" aria-hidden>
              ↗
            </span>
          </a>
        )
      }
    >
      <div className="relative flex min-h-0 flex-1">
        {pages.length > 0 && contentsOpen && (
          <HelpRail
            search={search}
            pages={pages}
            headings={headings}
            slug={target.slug}
            activeHash={activeHash}
            activeRow={activeRow}
            pick={pick}
          />
        )}

        <HelpPageFrame status={status} src={target.src} siteHref={siteHref} frameRef={frameRef} onLoad={onFrameLoad} />
      </div>
    </Dialog>
  );
}
