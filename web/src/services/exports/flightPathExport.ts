/**
 * Templated flight-path export: a TypeScript port of OpenRocket's
 * `info.openrocket.core.file.flightpath` subsystem (KML / GPX / waypoint CSV).
 *
 * Positions are the kernel's own latitude and longitude (`φ`, `λ`), which it
 * records at every step with the Earth model the simulation chose, as the
 * desktop version reads them. A result saved without them is projected from its
 * drift (`Px` east, `Py` north, meters from the pad) about the launch site with
 * the kernel's default spherical model (services/map/geodesy.ts), so the export
 * and the in-app landing agree. MSL altitude is the AGL altitude plus the
 * launch altitude.
 *
 * A {@link FlightPathModel} is built once, then rendered by the chosen format.
 * The three built-in renderers reproduce the reference Mustache templates.
 *
 * This is the public entry point. The parts live in ./flightPath/:
 *
 * - `options.ts`: the export options, their defaults and the label table.
 * - `colors.ts`: the per-branch track, ground and pin palettes.
 * - `model.ts`: the format-agnostic {@link FlightPathModel} the templates read.
 * - `buildModel.ts`: builds that model from a flight result.
 * - `formats.ts`: the built-in KML / GPX / CSV templates and their renderers.
 * - `userTemplate.ts`: rendering a user-supplied Mustache template.
 */
//
// Named rather than `export *`, so a helper one part exports for another (the
// KML color literal, the branch and waypoint shapes) does not become part of the
// export's public surface.
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
