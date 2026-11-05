import { LANGUAGES } from '../../i18n';

/** One `<option>` per language the app ships, valued by its code. */
export function LanguageOptions() {
  return (
    <>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </>
  );
}
