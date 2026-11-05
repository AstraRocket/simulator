// Port of OpenRocket's `info.openrocket.core.file.flightpath`.
export {
  WAYPOINT_KINDS,
  WAYPOINT_LABEL_KEY,
  asWaypointKinds,
  asDistanceUnit,
  asAltitudeReference,
  asStageTrackStart,
  defaultExportOptions,
  type WaypointKind,
  type DistanceUnit,
  type Translate,
  type AltitudeReference,
  type StageTrackStart,
  type FlightPathExportOptions,
} from './flightPath/options';
export { defaultBranchColor, defaultGroundColor, defaultPinColor, rgbToHex, hexToRgbInt } from './flightPath/colors';
export type { FlightPathModel } from './flightPath/model';
export { exportBranchNames, buildFlightPathModel, hasLaunchPosition } from './flightPath/buildModel';
export { EXPORT_FORMATS } from './flightPath/formats';
export { mimeForExtension, renderUserTemplate } from './flightPath/userTemplate';
