package api;

import info.openrocket.core.models.atmosphere.AtmosphericConditions;
import info.openrocket.core.models.atmosphere.AtmosphericModel;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.util.ModID;

final class AtmosphereProfile implements AtmosphericModel {

    private static final ExtendedISAModel STANDARD = new ExtendedISAModel();

    private final double[] altitude;
    private final double[] temperature;
    private final double[] logPressure;
    private final double[] humidity;

    // Meters above sea level, kelvin, pascals, humidity as a 0..1 fraction.
    AtmosphereProfile(double[] altitude, double[] temperature, double[] pressure, double[] humidity) {
        int n = altitude.length;
        if (n == 0) {
            throw new IllegalArgumentException("an atmosphere profile needs at least one level");
        }
        if (temperature.length != n || pressure.length != n || humidity.length != n) {
            throw new IllegalArgumentException("atmosphere profile columns differ in length");
        }
        this.altitude = altitude.clone();
        this.temperature = temperature.clone();
        this.logPressure = new double[n];
        this.humidity = humidity.clone();
        for (int i = 0; i < n; i++) {
            String which = "atmosphere level " + (i + 1) + " of " + n;
            if (!Double.isFinite(altitude[i])) {
                throw new IllegalArgumentException(which + " has no usable altitude");
            }
            if (i > 0 && !(altitude[i] > altitude[i - 1])) {
                throw new IllegalArgumentException(which + " is not above the level before it");
            }
            if (!(temperature[i] > 0) || !Double.isFinite(temperature[i])) {
                throw new IllegalArgumentException(which + " needs a positive temperature in kelvin");
            }
            if (!(pressure[i] > 0) || !Double.isFinite(pressure[i])) {
                throw new IllegalArgumentException(which + " needs a positive pressure in pascals");
            }
            if (i > 0 && !(pressure[i] < pressure[i - 1])) {
                throw new IllegalArgumentException(which + " has a pressure no lower than the level below it");
            }
            if (!(humidity[i] >= 0 && humidity[i] <= 1)) {
                throw new IllegalArgumentException(which + " needs a relative humidity between 0 and 1");
            }
            logPressure[i] = Math.log(pressure[i]);
        }
    }

    @Override
    public AtmosphericConditions getConditions(double alt) {
        int last = altitude.length - 1;
        if (alt <= altitude[0]) {
            return standardShapeFrom(0, alt);
        }
        if (alt >= altitude[last]) {
            return standardShapeFrom(last, alt);
        }
        int i = 0;
        while (altitude[i + 1] < alt) {
            i++;
        }
        double f = (alt - altitude[i]) / (altitude[i + 1] - altitude[i]);
        return new AtmosphericConditions(
                lerp(temperature[i], temperature[i + 1], f),
                Math.exp(lerp(logPressure[i], logPressure[i + 1], f)),
                lerp(humidity[i], humidity[i + 1], f));
    }

    private AtmosphericConditions standardShapeFrom(int level, double alt) {
        AtmosphericConditions atLevel = STANDARD.getConditions(altitude[level]);
        AtmosphericConditions atAlt = STANDARD.getConditions(alt);
        return new AtmosphericConditions(
                temperature[level] + (atAlt.getTemperature() - atLevel.getTemperature()),
                Math.exp(logPressure[level]) * atAlt.getPressure() / atLevel.getPressure(),
                humidity[level]);
    }

    private static double lerp(double a, double b, double f) {
        return a + (b - a) * f;
    }

    @Override
    public ModID getModID() {
        return ModID.ZERO;
    }
}
