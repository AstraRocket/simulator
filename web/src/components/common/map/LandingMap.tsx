import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtGroundDistance, type FieldUnit } from '../../../prefs/useUnits';
import { distanceFromPad, trackExtent, type GroundPoint } from '../../../services/flight/groundTrack';
import { ellipsePolygon, type DriftEllipse } from '../../../services/flight/driftEllipse';
import { LandingRing, LinedTrack, SampleDots, ZoneEllipse } from './PlanMarks';
import { PlanView } from './PlanView';
import { useGroundLayer } from './useTileVerdict';
import { useElementResize } from '../useElementResize';
import { token } from '../colorTokens';

export function LandingMap({
  latitudeDeg,
  longitudeDeg,
  path,
  landing,
  samples,
  ellipse,
  distanceUnit,
}: {
  latitudeDeg: number;
  longitudeDeg: number;
  path: readonly GroundPoint[];
  landing: GroundPoint;
  samples: readonly GroundPoint[];
  ellipse: DriftEllipse | null;
  distanceUnit: FieldUnit;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState(320);
  const fitRef = useRef<HTMLDivElement>(null);
  const ground = useGroundLayer(true);

  useElementResize(fitRef, (r) => setSize(Math.max(240, Math.min(r.width, 640))));

  const zone = useMemo(() => (ellipse ? ellipsePolygon(ellipse) : []), [ellipse]);
  const extent = useMemo(
    () => trackExtent([], [...path, ...samples, ...zone, landing]),
    [path, samples, zone, landing],
  );

  const fmtDist = (m: number) => fmtGroundDistance(distanceUnit, m);

  return (
    <div ref={fitRef} className="flex w-full justify-center">
      <PlanView
        size={size}
        extent={extent}
        site={{ lat: latitudeDeg, lon: longitudeDeg }}
        ground={ground}
        fmtDist={fmtDist}
        ariaLabel={t('landing.mapLabel', { distance: fmtDist(distanceFromPad(landing)) })}
        under={({ X, Y, poly, mapOn }) => (
          <>
            {zone.length > 2 && <ZoneEllipse points={poly(zone)} color={token('warn-500')} />}
            <SampleDots samples={samples} color={token('warn-300')} mapOn={mapOn} X={X} Y={Y} />
          </>
        )}
      >
        {({ X, Y, poly, mapOn }) => (
          <>
            <LinedTrack points={poly(path)} color={token('accent-400')} mapOn={mapOn} />
            <LandingRing at={landing} r={5} color={token('accent-400')} mapOn={mapOn} X={X} Y={Y} />
          </>
        )}
      </PlanView>
    </div>
  );
}
