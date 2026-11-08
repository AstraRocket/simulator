package info.openrocket.core.preferences;

import info.openrocket.core.database.Databases;
import info.openrocket.core.material.Material;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.models.gravity.GravityModelType;
import info.openrocket.core.models.wind.PinkNoiseWindModel;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.simulation.RK4SimulationStepper;
import info.openrocket.core.simulation.SimulationStepperMethod;
import info.openrocket.core.util.GeodeticComputationStrategy;

/** SHIM: returns upstream's stock defaults verbatim; there is no persisted store. */
public class ApplicationPreferences {

    public double getDefaultMach() {
        return 0.3;
    }

    public boolean getMotorNameColumn() {
        return true;
    }

    public String getDefaultFlightConfigName() {
        return FlightConfiguration.DEFAULT_CONFIG_NAME;
    }

    public double getDouble(String key, double defaultValue) {
        return defaultValue;
    }

    public boolean getBoolean(String key, boolean defaultValue) {
        return defaultValue;
    }

    public String getString(String key, String defaultValue) {
        return defaultValue;
    }

    public static final String LAUNCH_ROD_LENGTH = "LaunchRodLength";
    public static final String LAUNCH_INTO_WIND = "LaunchIntoWind";
    public static final String LAUNCH_ROD_ANGLE = "LaunchRodAngle";
    public static final String LAUNCH_ROD_DIRECTION = "LaunchRodDirection";
    public static final String WIND_DIRECTION = "WindDirection";
    public static final String WIND_AVERAGE = "WindAverage";
    public static final String WIND_TURBULENCE = "WindTurbulence";

    private PinkNoiseWindModel averageWindModel;

    public double getLaunchRodLength() {
        return 1;
    }

    public double getLaunchRodAngle() {
        return 0;
    }

    public double getLaunchRodDirection() {
        return Math.PI / 2;
    }

    public double getLaunchAltitude() {
        return 0;
    }

    public double getLaunchLatitude() {
        return 28.61;
    }

    public double getLaunchLongitude() {
        return -80.60;
    }

    public boolean isISAAtmosphere() {
        return true;
    }

    public double getLaunchTemperature() {
        return ExtendedISAModel.STANDARD_TEMPERATURE;
    }

    public double getLaunchRelativeHumidity() {
        return ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY;
    }

    public GravityModelType getGravityModel() {
        return GravityModelType.WGS;
    }

    /** m/s^2 */
    public double getConstantGravityValue() {
        return 9.807;
    }

    public SimulationStepperMethod getSimulationStepperMethodChoice() {
        return SimulationStepperMethod.RK4;
    }

    public void setSimulationStepperMethodChoice(SimulationStepperMethod choice) {
    }

    public double getLaunchPressure() {
        return ExtendedISAModel.STANDARD_PRESSURE;
    }

    public GeodeticComputationStrategy getGeodeticComputation() {
        return GeodeticComputationStrategy.SPHERICAL;
    }

    public double getTimeStep() {
        return RK4SimulationStepper.RECOMMENDED_TIME_STEP;
    }

    public double getMaxSimulationTime() {
        return RK4SimulationStepper.RECOMMENDED_MAX_TIME;
    }

    /** Must be seeded like upstream, not calm: callers use it unmodified. */
    public PinkNoiseWindModel getAverageWindModel() {
        if (averageWindModel == null) {
            averageWindModel = new PinkNoiseWindModel();
            loadWindModelState();
        }
        return averageWindModel;
    }

    protected void loadWindModelState() {
        averageWindModel.setAverage(getDouble(WIND_AVERAGE, 2.0));
        averageWindModel.setTurbulenceIntensity(getDouble(WIND_TURBULENCE, 0.1));
        averageWindModel.setDirection(getDouble(WIND_DIRECTION, Math.PI / 2));
    }

    public Material getDefaultComponentMaterial(
            Class<? extends RocketComponent> componentClass,
            Material.Type type) {
        switch (type) {
            case LINE:
                return Databases.findMaterial(Material.Type.LINE, "Elastic cord (round 2 mm, 1/16 in)");
            case SURFACE:
                return Databases.findMaterial(Material.Type.SURFACE, "Ripstop nylon");
            case BULK:
                return Databases.findMaterial(Material.Type.BULK, "Cardboard");
            default:
                throw new IllegalArgumentException("Unknown material type: " + type);
        }
    }
}
