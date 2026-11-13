import type { FlightPathModel } from './model';
import { mimeForExtension, renderUserTemplate } from './userTemplate';

export function renderKml(model: FlightPathModel): string {
  return renderUserTemplate(KML_TEMPLATE_SOURCE, 'kml', model);
}

export function renderGpx(model: FlightPathModel): string {
  return renderUserTemplate(GPX_TEMPLATE_SOURCE, 'gpx', model);
}

export function renderWaypointCsv(model: FlightPathModel): string {
  return renderUserTemplate(WAYPOINTS_CSV_TEMPLATE_SOURCE, 'csv', model);
}

export interface ExportFormat {
  id: 'kml' | 'gpx' | 'waypoints-csv';
  /** Without a dot. */
  extension: string;
  mime: string;
  render: (model: FlightPathModel) => string;
  source: string;
  templateFilename: string;
}

// Balloon HTML is pre-escaped, not CDATA: escapes inside CDATA are not decoded and `]]>` would break it.
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

const WAYPOINTS_CSV_TEMPLATE_SOURCE =
  '"altitude({{altitudeUnit}})","latitude","longitude","label","symbol","color","label_color","name"\r\n' +
  '{{#branches}}{{#waypoints}}"{{altitude}}","{{latitudeStr}}","{{longitudeStr}}","{{type}}","pushpin","{{csvPinColor}}","white","{{rocketName}} {{motor}} {{label}} - {{altitude}} {{altitudeUnit}} - {{distance}} {{distanceUnit}} @ {{bearing}} deg"\r\n' +
  '{{/waypoints}}{{/branches}}\r\n';

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'kml',
    extension: 'kml',
    mime: mimeForExtension('kml'),
    render: renderKml,
    source: KML_TEMPLATE_SOURCE,
    templateFilename: 'flightpath.kml.mustache',
  },
  {
    id: 'gpx',
    extension: 'gpx',
    mime: mimeForExtension('gpx'),
    render: renderGpx,
    source: GPX_TEMPLATE_SOURCE,
    templateFilename: 'flightpath.gpx.mustache',
  },
  {
    id: 'waypoints-csv',
    extension: 'csv',
    mime: mimeForExtension('csv'),
    render: renderWaypointCsv,
    source: WAYPOINTS_CSV_TEMPLATE_SOURCE,
    templateFilename: 'waypoints.csv.mustache',
  },
];
