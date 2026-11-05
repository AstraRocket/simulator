import { useTranslation } from 'react-i18next';

export function PanelExpandButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const label = expanded ? t('flight.showAllPanels') : t('flight.expandPanel');
  return (
    <button
      onClick={onClick}
      // A press here must not start a pan or move the crosshair on the host.
      onPointerDown={(e) => e.stopPropagation()}
      // No aria-pressed: with a changing name it reads as "Show all panels, pressed".
      aria-label={label}
      title={label}
      className="rounded px-1 text-[11px] leading-none text-ink-muted hover:bg-elevated hover:text-ink-strong"
    >
      {expanded ? '⤡' : '⤢'}
    </button>
  );
}
