// Port of OpenRocket's `info.openrocket.core.file.flightpath`.
export {
  WAYPOINT_KINDS,
  WAYPOINT_LABEL_KEY,
  resolveAltitudeReference,
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
export {
  EXPORT_FALLBACK_LATITUDE,
  EXPORT_FALLBACK_LONGITUDE,
  exportBranchNames,
  buildFlightPathModel,
  hasLaunchPosition,
} from './flightPath/buildModel';
export { renderKml, renderGpx, renderWaypointCsv, EXPORT_FORMATS } from './flightPath/formats';
export { mimeForExtension, renderUserTemplate } from './flightPath/userTemplate';
