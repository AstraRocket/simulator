import i18n from '../i18n';
import { createRequestStore } from './requestStore';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export const useConfirmStore = createRequestStore<ConfirmOptions, boolean>(false);

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(opts);
}

/** Every delete prompt: a red Delete button, never the generic Confirm. */
export function confirmDelete(message: string): Promise<boolean> {
  return confirm({ message, confirmLabel: i18n.t('common.delete'), danger: true });
}
