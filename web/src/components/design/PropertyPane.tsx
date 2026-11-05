import { PropertyPanel } from './PropertyPanel';
import { useSelectedComponent } from './useSelectedComponent';

export function PropertyPane() {
  const sel = useSelectedComponent();

  return (
    <div className="space-y-4 p-3">
      {/* Keyed on the part, so a pending await lands on an unmounted panel,
          not the newly selected part. */}
      <PropertyPanel key={sel.node?.id ?? ''} {...sel} />
    </div>
  );
}
