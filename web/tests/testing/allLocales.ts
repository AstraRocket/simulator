import i18n from '../../src/i18n';

// The app fetches non-English bundles on demand, so `changeLanguage` settles a tick late.
const bundles = import.meta.glob<{ default: Record<string, unknown> }>('../../src/i18n/locales/*.json', {
  eager: true,
});
for (const [path, bundle] of Object.entries(bundles)) {
  const code = /([^/]+)\.json$/.exec(path)![1]!;
  i18n.addResourceBundle(code, 'translation', bundle.default, true, true);
}
