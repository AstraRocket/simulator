package api;

import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.LaunchLug;
import info.openrocket.core.rocketcomponent.RailButton;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.simulation.FlightEvent;
import info.openrocket.core.simulation.SimulationStatus;
import info.openrocket.core.simulation.exception.SimulationException;
import info.openrocket.core.simulation.listeners.AbstractSimulationListener;
import info.openrocket.core.util.Coordinate;
import info.openrocket.core.util.CoordinateIF;

import java.util.ArrayList;
import java.util.List;

// Relies on firePostStep running before the engine's own clearance check, guarded on !isLaunchRodCleared().
final class GuideClearanceListener extends AbstractSimulationListener {

	private double effectiveLength = Double.NaN;

	private CoordinateIF origin = null;

	// So touching the status does not raise Warning.LISTENERS_AFFECTED.
	@Override
	public boolean isSystemListener() {
		return true;
	}

	@Override
	public void startSimulationBranch(SimulationStatus status) throws SimulationException {
		// The engine takes its origin from the same position right after this hook.
		origin = status.getRocketPosition();
		effectiveLength = effectiveRodLength(
				status.getConfiguration(),
				status.getSimulationConditions().getLaunchRodLength());
	}

	@Override
	public void postStep(SimulationStatus status) throws SimulationException {
		if (origin == null || Double.isNaN(effectiveLength)) {
			return;
		}
		if (!status.isLiftoff() || status.isLaunchRodCleared()) {
			return;
		}
		if (status.getRocketPosition().sub(origin).length() > effectiveLength) {
			status.addEvent(new FlightEvent(FlightEvent.Type.LAUNCHROD, status.getSimulationTime(), null));
		}
	}

	private static final double SAME_LINE_RADIANS = Math.toRadians(1);

	private static final double SAME_STATION_M = 0.0005;

	/** Where the rocket's guides sit: the lug's aft end, a button line's guiding station, the tail. */
	private static final class Guides {
		double lugX = Double.NaN;
		double buttonX = Double.NaN;
		double maxX = 0;
		boolean hasButtons = false;
	}

	// Buttons need two in the rail, so a line guides until its second-to-last station leaves.
	// A button's origin is its axial center (no length), so its aft edge is center + outerDiameter / 2.
	private static Guides survey(FlightConfiguration configuration) {
		Guides g = new Guides();
		List<Double> angles = new ArrayList<>();
		List<Double> centers = new ArrayList<>();
		List<Double> aftEdges = new ArrayList<>();

		for (RocketComponent c : configuration.getActiveComponents()) {
			if (c instanceof LaunchLug) {
				for (CoordinateIF p : c.toAbsolute(new Coordinate(c.getLength()))) {
					if (Double.isNaN(g.lugX) || p.getX() > g.lugX) {
						g.lugX = p.getX();
					}
				}
			} else if (c instanceof RailButton) {
				RailButton b = (RailButton) c;
				double radius = b.getOuterDiameter() / 2.0;
				for (CoordinateIF p : c.toAbsolute(new Coordinate(0))) {
					angles.add(b.getAngleOffset());
					centers.add(p.getX());
					aftEdges.add(p.getX() + radius);
				}
			}
		}

		for (CoordinateIF c : configuration.getBounds()) {
			if (c.getX() > g.maxX) {
				g.maxX = c.getX();
			}
		}
		g.buttonX = railGuideX(angles, centers, aftEdges);
		g.hasButtons = !angles.isEmpty();
		return g;
	}

	static double effectiveRodLength(FlightConfiguration configuration, double rodLength) {
		Guides g = survey(configuration);
		double lugLength = Double.isNaN(g.lugX) ? Double.NaN : travel(rodLength, g.maxX, g.lugX);
		double buttonLength = Double.isNaN(g.buttonX) ? Double.NaN : travel(rodLength, g.maxX, g.buttonX);

		if (!Double.isNaN(lugLength) && !Double.isNaN(buttonLength)) {
			return Math.min(lugLength, buttonLength);
		}
		if (!Double.isNaN(lugLength)) {
			return lugLength;
		}
		if (!Double.isNaN(buttonLength)) {
			return buttonLength;
		}
		return g.hasButtons ? 0 : rodLength;
	}

	/**
	 * How much rod lies past the last guide when it leaves: what a guided travel adds to make a rod length.
	 * Takes no rod, so it is not clamped by a short one. 0 with no guide at all; NaN when buttons stand in no
	 * two-station line, which no rod guides. For any rod, effectiveRodLength is max(0, rod - this).
	 */
	static double guideOffset(FlightConfiguration configuration) {
		Guides g = survey(configuration);
		double lug = Double.isNaN(g.lugX) ? Double.NaN : overhang(g.maxX, g.lugX);
		double button = Double.isNaN(g.buttonX) ? Double.NaN : overhang(g.maxX, g.buttonX);
		if (!Double.isNaN(lug) && !Double.isNaN(button)) {
			return Math.max(lug, button);
		}
		if (!Double.isNaN(lug)) {
			return lug;
		}
		if (!Double.isNaN(button)) {
			return button;
		}
		return g.hasButtons ? Double.NaN : 0;
	}

	private static double overhang(double maxX, double guideX) {
		return maxX >= guideX ? maxX - guideX : 0;
	}

	private static double travel(double rodLength, double maxX, double guideX) {
		// Clamped at 0: a negative distance would always satisfy the comparison.
		return Math.max(0, rodLength - overhang(maxX, guideX));
	}

	private static double railGuideX(List<Double> angles, List<Double> centers, List<Double> aftEdges) {
		double best = Double.NaN;
		boolean[] taken = new boolean[angles.size()];
		for (int i = 0; i < angles.size(); i++) {
			if (taken[i]) {
				continue;
			}
			List<Double> lineCenters = new ArrayList<>();
			List<Double> lineAftEdges = new ArrayList<>();
			for (int j = i; j < angles.size(); j++) {
				if (taken[j] || !sameLine(angles.get(i), angles.get(j))) {
					continue;
				}
				taken[j] = true;
				lineCenters.add(centers.get(j));
				lineAftEdges.add(aftEdges.get(j));
			}
			double x = secondStationFromAft(lineCenters, lineAftEdges);
			if (!Double.isNaN(x) && (Double.isNaN(best) || x > best)) {
				best = x;
			}
		}
		return best;
	}

	private static boolean sameLine(double a, double b) {
		double d = Math.abs(a - b) % (2 * Math.PI);
		if (d > Math.PI) {
			d = 2 * Math.PI - d;
		}
		return d <= SAME_LINE_RADIANS;
	}

	private static double secondStationFromAft(List<Double> centers, List<Double> aftEdges) {
		double last = Double.NaN;
		for (int i = 0; i < centers.size(); i++) {
			if (Double.isNaN(last) || centers.get(i) > last) {
				last = centers.get(i);
			}
		}
		if (Double.isNaN(last)) {
			return Double.NaN;
		}
		double second = Double.NaN;
		double secondAftEdge = Double.NaN;
		for (int i = 0; i < centers.size(); i++) {
			double c = centers.get(i);
			if (last - c <= SAME_STATION_M) {
				continue;
			}
			if (Double.isNaN(second) || c > second) {
				second = c;
				secondAftEdge = aftEdges.get(i);
			}
		}
		return secondAftEdge;
	}
}
