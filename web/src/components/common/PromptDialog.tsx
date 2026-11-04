import { usePromptStore } from '../../state/promptStore';
import { DesignPropertiesDialog } from '../layout/DesignPropertiesDialog';

export function PromptDialog() {
  const request = usePromptStore((s) => s.request);
  const settle = usePromptStore((s) => s.settle);
  if (!request) return null;
  return (
    <DesignPropertiesDialog
      // A fresh instance per request, or a later prompt reuses the first one's seeded field.
      key={request.initialName}
      title={request.title}
      confirmLabel={request.confirmLabel}
      initialName={request.initialName}
      takenNames={request.takenNames}
      onCancel={() => settle(null)}
      onConfirm={(name) => settle(name)}
    />
  );
}
