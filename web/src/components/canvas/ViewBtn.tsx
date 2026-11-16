import { useTranslation } from 'react-i18next';
import { ToggleButton } from '../common/ToggleButton';
import { Segmented } from '../common/Segmented';

const SIDE_AFT = ['side', 'aft'] as const;

/** Reset, then the side and aft picker, in the 2D and 3D toolbars. */
export function SideAftPresets({
  value,
  onChange,
  onReset,
  resetTitle,
}: {
  value: (typeof SIDE_AFT)[number];
  onChange: (v: (typeof SIDE_AFT)[number]) => void;
  onReset: () => void;
  resetTitle?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ViewBtn onClick={onReset} title={resetTitle}>
        {t('view.reset')}
      </ViewBtn>
      <Segmented
        size="bar"
        options={SIDE_AFT}
        value={value}
        onChange={onChange}
        fmt={(v) => t(`view.${v}`)}
        title={(v) => t(`view.${v}Title`)}
      />
      <ToolDivider />
    </>
  );
}

export function ToolDivider() {
  return <span aria-hidden className="hidden h-4 w-px shrink-0 bg-line/20 @[63rem]/bar:block" />;
}

export function ToolGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md ring-1 ring-line/10">
      {children}
    </div>
  );
}

export const JOINED = 'inline-flex h-7 items-center justify-center px-2 text-xs font-medium';
export function ViewBtn({
  active,
  onClick,
  title,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const shape = 'inline-flex h-7 items-center rounded-md px-2 text-xs font-medium ring-1 ring-line/10';
  if (active !== undefined) {
    return (
      <ToggleButton active={active} onClick={onClick} title={title} label={label} className={shape}>
        {children}
      </ToggleButton>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className={`${shape} bg-raised text-ink-soft hover:bg-elevated`}
    >
      {children}
    </button>
  );
}
