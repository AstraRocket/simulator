package info.openrocket.core.startup;

import info.openrocket.core.formatting.RocketDescriptor;
import info.openrocket.core.rocketcomponent.FlightConfigurationId;
import info.openrocket.core.rocketcomponent.Rocket;

/** SHIM: replaces upstream's Guice-hosted RocketDescriptorImpl. */
public class ShimRocketDescriptor implements RocketDescriptor {

    @Override
    public String format(Rocket rocket, FlightConfigurationId fcid) {
        return format(rocket.getFlightConfiguration(fcid).getNameRaw(), rocket, fcid);
    }

    @Override
    public String format(String name, Rocket rocket, FlightConfigurationId fcid) {
        return name;
    }
}
