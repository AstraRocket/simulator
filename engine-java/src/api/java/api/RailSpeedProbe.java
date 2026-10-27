package api;

import info.openrocket.core.simulation.FlightEvent;
import info.openrocket.core.simulation.MotorClusterState;
import info.openrocket.core.simulation.SimulationStatus;
import info.openrocket.core.simulation.exception.SimulationException;
import info.openrocket.core.simulation.listeners.AbstractSimulationListener;
import info.openrocket.core.util.CoordinateIF;

/**
 * How long a launch rod or rail has to be for this rocket to leave it at a
 * given speed: the "rail length needed" figure.
 * <p>
 * It rides a probe flight of the same rocket, motors and conditions as the
 * real one, flown on a rod far longer than any real one. While the rocket is
 * held on the rod the probe's motion is the real flight's, step for step, so
 * the distance at which the kernel's speed first reaches the minimum is the
 * answer whether that happens inside the real rod's length or past it. The
 * real flight carries no listener for this; it stays byte-identical to
 * upstream, as {@link GuideClearanceListener} keeps the default flight.
 * <p>
 * The probe ends as soon as it has an answer: the speed reached, between the
 * two steps that straddle it, by straight-line interpolation of distance
 * against speed. It also ends once no motor is thrusting and the speed has
 * started to fall, because on a rod nothing else can push it faster again,
 * and that probe's answer is NaN: no rod is long enough.
 * <p>
 * The answer is a rod length, not a distance traveled. Upstream counts travel
 * against the whole rod, so for the default flight they are the same. With
 * guide-aware clearance the rocket stops being guided before its tail reaches
 * the rod's end, so the distance the guides leave unused is added back: the
 * rod that would let this rocket's guides carry it to the speed.
 */
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

	/**
	 * The answer, in a one-slot holder rather than a field. The simulation
	 * conditions clone their listeners, and the clone that flies is not this
	 * object; a shallow clone shares the array, so whichever copy reaches the
	 * answer writes it where {@link #railLength()} reads it.
	 */
	private final double[] result = { Double.NaN };

	/**
	 * @param minSpeed      the speed the rocket must have when it leaves the rod, m/s
	 * @param guideAware    whether the flight uses guide-aware rod clearance
	 * @param realRodLength the flight's own rod length, m, to measure the guides' offset on
	 */
	RailSpeedProbe(double minSpeed, boolean guideAware, double realRodLength) {
		this.minSpeed = minSpeed;
		this.guideAware = guideAware;
		this.realRodLength = realRodLength;
	}

	/** A system listener: part of how the probe is run, not a user extension. */
	@Override
	public boolean isSystemListener() {
		return true;
	}

	/** The rod length needed, m, or NaN when the rocket never reaches the speed on a rod. */
	double railLength() {
		return result[0];
	}

	@Override
	public void startSimulationBranch(SimulationStatus status) throws SimulationException {
		if (origin != null) {
			return; // only the first branch starts on the rod
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
