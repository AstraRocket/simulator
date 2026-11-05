package api;

import info.openrocket.core.simulation.FlightEvent;
import info.openrocket.core.simulation.MotorClusterState;
import info.openrocket.core.simulation.SimulationStatus;
import info.openrocket.core.simulation.exception.SimulationException;
import info.openrocket.core.simulation.listeners.AbstractSimulationListener;
import info.openrocket.core.util.CoordinateIF;

/** Runs on a separate probe flight so the real flight stays byte-identical to upstream; result is a rod length, not travel. */
final class RailSpeedProbe extends AbstractSimulationListener {

	private final double minSpeed;
	private final boolean guideAware;
	private final double realRodLength;

	private CoordinateIF origin = null;
	private double offset = 0;
	private double prevSpeed = Double.NaN;
	private double prevDistance = Double.NaN;
	private double maxSpeed = 0;
	private boolean done = false;

	/** One-slot array, not a field: listeners are shallow-cloned and must share it. */
	private final double[] result = { Double.NaN };

	/** minSpeed in m/s, realRodLength in m. */
	RailSpeedProbe(double minSpeed, boolean guideAware, double realRodLength) {
		this.minSpeed = minSpeed;
		this.guideAware = guideAware;
		this.realRodLength = realRodLength;
	}

	@Override
	public boolean isSystemListener() {
		return true;
	}

	double railLength() {
		return result[0];
	}

	@Override
	public void startSimulationBranch(SimulationStatus status) throws SimulationException {
		if (origin != null) {
			return;
		}
		origin = status.getRocketPosition();
		if (guideAware) {
			offset = realRodLength - GuideClearanceListener.effectiveRodLength(status.getConfiguration(), realRodLength);
		}
	}

	@Override
	public void postStep(SimulationStatus status) throws SimulationException {
		if (done || origin == null || !status.isLiftoff()) {
			return;
		}
		double speed = status.getRocketVelocity().length();
		double distance = status.getRocketPosition().sub(origin).length();
		if (speed >= minSpeed) {
			double at = distance;
			if (!Double.isNaN(prevSpeed) && speed > prevSpeed) {
				at = prevDistance + (distance - prevDistance) * (minSpeed - prevSpeed) / (speed - prevSpeed);
			}
			result[0] = at + offset;
			end(status);
			return;
		}
		if (speed < maxSpeed && !anyThrusting(status)) {
			end(status);
			return;
		}
		maxSpeed = Math.max(maxSpeed, speed);
		prevSpeed = speed;
		prevDistance = distance;
	}

	private void end(SimulationStatus status) throws SimulationException {
		done = true;
		status.addEvent(new FlightEvent(FlightEvent.Type.SIMULATION_END, status.getSimulationTime()));
	}

	private static boolean anyThrusting(SimulationStatus status) {
		for (MotorClusterState m : status.getMotors()) {
			if (m.isThrusting()) {
				return true;
			}
		}
		return false;
	}
}
