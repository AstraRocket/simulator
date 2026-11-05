package info.openrocket.core.document;

import info.openrocket.core.rocketcomponent.FlightConfigurationId;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.simulation.SimulationOptions;

/** SHIM: minimal parent-simulation holder. */
public class Simulation {

    private final Rocket rocket;
    private final FlightConfigurationId fcid;
    private SimulationOptions options;

    public Simulation(Rocket rocket, FlightConfigurationId fcid) {
        this.rocket = rocket;
        this.fcid = fcid;
    }

    public Rocket getRocket() {
        return rocket;
    }

    public FlightConfigurationId getId() {
        return fcid;
    }

    /** SHIM: not the options that built the conditions; only the stepper is set (by buildConditions), anything else read here is silently default. */
    public SimulationOptions getOptions() {
        if (options == null) {
            options = new SimulationOptions();
        }
        return options;
    }
}
