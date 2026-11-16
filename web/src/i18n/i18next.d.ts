// i18next 27 turned `strictInterpolationChecks` on by default, which makes the
// options argument of `t()` required. The resources are untyped, so keys are
// plain strings and the check can't tell which keys take variables; it only
// stops `t` from fitting the `(key, values?) => string` helpers it is passed to.
import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    strictInterpolationChecks: false;
  }
}
