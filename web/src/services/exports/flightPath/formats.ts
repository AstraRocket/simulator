import { CSV_MIME } from '../csvExport';
import type { FlightPathModel } from './model';
import { renderUserTemplate } from './userTemplate';

// ---------------------------------------------------------------------------
// Built-in renderers
// ---------------------------------------------------------------------------
//
// Each built-in format renders through the shared Mustache path using its own
// template source (EXPORT_FORMATS[].source). There is no hand-written renderer
// to drift from the template: the file you download and re-import is what
// produces the built-in output. Templates live next to the format registry.

/** Render the model as KML (Google Earth). */
export function renderKml(model: FlightPathModel): string {
  return renderUserTemplate(KML_TEMPLATE_SOURCE, 'kml', model);
}

/** Render the model as a GPX 1.1 track. */
export function renderGpx(model: FlightPathModel): string {
  return renderUserTemplate(GPX_TEMPLATE_SOURCE, 'gpx', model);
}

/** Render the model as a waypoint CSV (one row per waypoint). */
export function renderWaypointCsv(model: FlightPathModel): string {
  return renderUserTemplate(WAYPOINTS_CSV_TEMPLATE_SOURCE, 'csv', model);
}

// ---------------------------------------------------------------------------
// Format registry
// ---------------------------------------------------------------------------

export interface ExportFormat {
  id: 'kml' | 'gpx' | 'waypoints-csv';
  /** Output file extension without a dot. */
  extension: string;
  /** MIME type for the download blob. */
  mime: string;
  render: (model: FlightPathModel) => string;
  /** The Mustache template source, offered for download as a starting point for
   *  custom templates. The built-in renderer renders this same source through
   *  {@link renderUserTemplate}. */
  source: string;
  /** Suggested filename when downloading {@link ExportFormat.source}. */
  templateFilename: string;
}

// The built-in Mustache templates, mirroring OpenRocket's bundled templates.
// They are the "download to modify" starting points; the model field names match
// so an edited copy re-imports and renders through renderUserTemplate.
//
// The KML balloons' HTML is written pre-escaped (`&lt;b&gt;`, not `<b>`), and
// not wrapped in CDATA. `escaperFor('kml')` escapes every value this template
// substitutes, because they are user-supplied names that would otherwise break
// the XML, and inside a CDATA block the XML parser does not
// decode those escapes, so a rocket named `Bill & Ted` would reach the balloon
// as the literal text `Bill &amp; Ted`. A CDATA block is breakable too: a name
// containing `]]>` would close it early and produce an invalid document.
// A balloon is HTML after the XML decode, so a value inside one is escaped
// twice: `{{#htmlBalloon}}` escapes for HTML and then for XML, and the viewer
// shows `<img src=x>` in a rocket's name as text rather than running it as
// markup. The template's own markup is escaped once, so it decodes to the tags
// it means. The degree sign is a literal UTF-8 character rather than `&deg;`:
// one layer of entity decoding for the markup, not two.
const KML_TEMPLATE_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
	<Document>
		<name>{{title}}</name>
		<open>1</open>
{{#includeDescriptions}}
		<description>{{#htmlBalloon}}&lt;b&gt;{{labels.rocket}}:&lt;/b&gt; {{rocketName}}&lt;br/&gt;
{{#configuration}}&lt;b&gt;{{labels.configuration}}:&lt;/b&gt; {{configuration}}&lt;br/&gt;
{{/configuration}}&lt;b&gt;{{labels.launchSite}}:&lt;/b&gt; {{launchLatitudeStr}}, {{launchLongitudeStr}} {{labels.latLon}}{{#launchAltitudeMeters}}, {{launchAltitude}} {{altitudeUnit}} {{labels.aboveSeaLevel}}{{/launchAltitudeMeters}}&lt;br/&gt;
&lt;b&gt;{{labels.maxAltitude}}:&lt;/b&gt; {{maxAltitude}} {{altitudeUnit}}&lt;br/&gt;
&lt;b&gt;{{labels.maxVelocity}}:&lt;/b&gt; {{maxVelocity}} {{velocityUnit}}&lt;br/&gt;
&lt;b&gt;{{labels.maxAcceleration}}:&lt;/b&gt; {{maxAcceleration}} {{accelerationUnit}}&lt;br/&gt;
&lt;b&gt;{{labels.maxRange}}:&lt;/b&gt; {{maxRange}} {{distanceUnit}} {{labels.fromThePad}}&lt;br/&gt;
{{#timeToApogee}}&lt;b&gt;{{labels.timeToApogee}}:&lt;/b&gt; {{timeToApogee}} s&lt;br/&gt;
{{/timeToApogee}}{{#flightTime}}&lt;b&gt;{{labels.flightTime}}:&lt;/b&gt; {{flightTime}} s&lt;br/&gt;
{{/flightTime}}{{#branches}}{{#hasLanding}}&lt;b&gt;{{landingHeading}}:&lt;/b&gt; {{landingLatitudeStr}}, {{landingLongitudeStr}} {{labels.latLon}}; {{landingText}} {{labels.fromThePad}}; T+{{landingTime}} s&lt;br/&gt;
{{/hasLanding}}{{/branches}}{{/htmlBalloon}}</description>
{{/includeDescriptions}}
{{#branches}}
		<Style id="flightPath{{index}}"><LineStyle><color>{{pathColorKml}}</color><width>3</width></LineStyle></Style>
		<Style id="groundTrack{{index}}"><LineStyle><color>{{groundColorKml}}</color><width>2</width></LineStyle></Style>
{{#waypointStyled}}
		<Style id="waypoint{{index}}">
{{#colorWaypointPins}}
			<IconStyle>
				<color>{{pinColorKml}}</color>
				<Icon><href>https://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png</href></Icon>
				<hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/>
			</IconStyle>
{{/colorWaypointPins}}
{{^showWaypointLabels}}
			<LabelStyle><scale>0</scale></LabelStyle>
{{/showWaypointLabels}}
		</Style>
{{/waypointStyled}}
{{/branches}}
{{#branches}}
		<Folder>
			<name>{{name}}</name>
{{#includeDescriptions}}
			<description>{{#htmlBalloon}}&lt;b&gt;{{labels.maxRange}}:&lt;/b&gt; {{maxRange}} {{distanceUnit}} {{labels.fromThePad}}&lt;br/&gt;
{{#hasLanding}}&lt;b&gt;{{labels.landing}}:&lt;/b&gt; {{landingLatitudeStr}}, {{landingLongitudeStr}} {{labels.latLon}}; {{landingText}} {{labels.fromThePad}}; T+{{landingTime}} s&lt;br/&gt;
{{/hasLanding}}{{/htmlBalloon}}</description>
{{/includeDescriptions}}
{{#waypoints}}
			<Placemark>
				<name>{{qualifiedLabel}}</name>
{{#includeDescriptions}}
				<description>{{#htmlBalloon}}&lt;b&gt;{{labels.time}}:&lt;/b&gt; T+{{timeText}} s&lt;br/&gt;
&lt;b&gt;{{labels.altitude}}:&lt;/b&gt; {{altitude}} {{altitudeUnit}} {{labels.abovePad}}{{#launchAltitudeMeters}}, {{altitudeMsl}} {{altitudeUnit}} {{labels.aboveSeaLevel}}{{/launchAltitudeMeters}}&lt;br/&gt;
&lt;b&gt;{{labels.position}}:&lt;/b&gt; {{rangeText}} {{labels.fromThePad}}&lt;br/&gt;
&lt;b&gt;{{labels.coordinates}}:&lt;/b&gt; {{latitudeStr}}, {{longitudeStr}} {{labels.latLon}}{{#device}}&lt;br/&gt;
&lt;b&gt;{{labels.device}}:&lt;/b&gt; {{device}}{{/device}}{{/htmlBalloon}}</description>
{{/includeDescriptions}}
{{#waypointStyled}}				<styleUrl>#waypoint{{index}}</styleUrl>
{{/waypointStyled}}
				<Point>
{{#extrudeWaypoints}}					<extrude>1</extrude>
{{/extrudeWaypoints}}					<altitudeMode>{{kmlWaypointAltitudeMode}}</altitudeMode>
					<coordinates>{{longitude}},{{latitude}},{{altitudeKmlMeters}}</coordinates>
				</Point>
			</Placemark>
{{/waypoints}}
{{#includeFlightPath}}
{{#hasPath}}
			<Placemark>
				<name>{{name}} {{labels.flightPath}}</name>
				<styleUrl>#flightPath{{index}}</styleUrl>
				<LineString>
{{#extrudePath}}					<extrude>1</extrude>
{{/extrudePath}}{{#tessellatePath}}					<tessellate>1</tessellate>
{{/tessellatePath}}					<altitudeMode>{{kmlAltitudeMode}}</altitudeMode>
					<coordinates>
{{#path}}						{{longitude}},{{latitude}},{{altitudeKmlMeters}}
{{/path}}					</coordinates>
				</LineString>
			</Placemark>
{{/hasPath}}
{{/includeFlightPath}}
{{#includeGroundTrack}}
{{#hasPath}}
			<Placemark>
				<name>{{name}} {{labels.groundTrack}}</name>
				<styleUrl>#groundTrack{{index}}</styleUrl>
				<LineString>
					<tessellate>1</tessellate>
					<altitudeMode>clampToGround</altitudeMode>
					<coordinates>
{{#path}}						{{longitude}},{{latitude}},{{altitudeMslMeters}}
{{/path}}					</coordinates>
				</LineString>
			</Placemark>
{{/hasPath}}
{{/includeGroundTrack}}
		</Folder>
{{/branches}}
	</Document>
</kml>
`;

const GPX_TEMPLATE_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OpenRocket" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>{{title}}</name>
  </metadata>
{{#branches}}
{{#waypoints}}
  <wpt lat="{{latitude}}" lon="{{longitude}}">
    <ele>{{altitudeMslMeters}}</ele>
    <name>{{label}}</name>
  </wpt>
{{/waypoints}}
{{/branches}}
{{#branches}}
{{#hasPath}}
  <trk>
    <name>{{name}}</name>
    <trkseg>
{{#path}}    <trkpt lat="{{latitude}}" lon="{{longitude}}"><ele>{{altitudeMslMeters}}</ele></trkpt>
{{/path}}    </trkseg>
  </trk>
{{/hasPath}}
{{/branches}}
</gpx>
`;

// CRLF line endings, matching the app's other CSV exports (Excel-friendly).
const WAYPOINTS_CSV_TEMPLATE_SOURCE =
  '"altitude({{altitudeUnit}})","latitude","longitude","label","symbol","color","label_color","name"\r\n' +
  '{{#branches}}{{#waypoints}}"{{altitude}}","{{latitudeStr}}","{{longitudeStr}}","{{type}}","pushpin","{{csvPinColor}}","white","{{rocketName}} {{motor}} {{label}} - {{altitude}} {{altitudeUnit}} - {{distance}} {{distanceUnit}} @ {{bearing}} deg"\r\n' +
  '{{/waypoints}}{{/branches}}\r\n';

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'kml',
    extension: 'kml',
    mime: 'application/vnd.google-earth.kml+xml',
    render: renderKml,
    source: KML_TEMPLATE_SOURCE,
    templateFilename: 'flightpath.kml.mustache',
  },
  {
    id: 'gpx',
    extension: 'gpx',
    mime: 'application/gpx+xml',
    render: renderGpx,
    source: GPX_TEMPLATE_SOURCE,
    templateFilename: 'flightpath.gpx.mustache',
  },
  {
    id: 'waypoints-csv',
    extension: 'csv',
    mime: CSV_MIME,
    render: renderWaypointCsv,
    source: WAYPOINTS_CSV_TEMPLATE_SOURCE,
    templateFilename: 'waypoints.csv.mustache',
  },
];
