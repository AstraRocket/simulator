// Held to the source by tests/popupSurfaces.test.ts; a11y.spec.ts scans each surface at least this many times.
export const POPUP_SURFACES = {
  CheckMenu: 1,
  ComponentExportButton: 1,
  ComponentTree: 2,
  FileMenu: 2,
  GroundTrack: 1,
  HelpDialog: 1,
  ImageExportMenu: 1,
  LoadedBanner: 1,
  MotorFilterBar: 1,
  RecoveryBaysPane: 1,
  ResultPicker: 1,
  SafetyCard: 1,
  SimpleHelp: 1,
  StabilityBadge: 1,
} as const;

export type PopupSurface = keyof typeof POPUP_SURFACES;
