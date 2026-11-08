import { useWorkspaceStore } from './store';
import i18n from '../i18n';
import { errorText } from '../i18n/keyedError';

export function fireAction(result: Promise<unknown> | void): void {
  if (!result) return;
  result.catch((e: unknown) => {
    useWorkspaceStore.getState().setErr(errorText(e, i18n.t));
  });
}
