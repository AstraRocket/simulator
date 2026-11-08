package parity;

import info.openrocket.core.masscalc.MassCalculator;
import info.openrocket.core.masscalc.RigidBody;
import info.openrocket.core.material.Material;
import info.openrocket.core.models.atmosphere.AtmosphericConditions;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.rocketcomponent.AxialStage;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.InnerTube;
import info.openrocket.core.rocketcomponent.NoseCone;
import info.openrocket.core.rocketcomponent.Parachute;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.rocketcomponent.Transition;
import info.openrocket.core.rocketcomponent.TrapezoidFinSet;
import info.openrocket.core.util.Coordinate;
import info.openrocket.core.util.CoordinateIF;
import info.openrocket.core.util.Quaternion;

/** Ships via OpenRocketEngine.runParity() so parity checks the files the app loads. */
public final class ParityMain {
    public static void main(String[] args) {
        atmosphereScenarios();
        quaternionScenarios();
        massScenarios();
        aeroScenarios();
        randomScenarios();
        flightScenarios();
        treeApiScenarios();
        conditionsScenarios();
        finVariantScenarios();
        dualDeployScenarios();
        clusterScenarios();
        splitClusterScenarios();
        stagingScenarios();
        podScenarios();
        aeroSweepScenarios();
        minDiameterScenarios();
        airfoilSectionScenarios();
        rogersKbfScenarios();
        supersonicAeroScenarios();
        rollScenarios();
        collatorScenarios();
        uuidScenarios();
        preferencesScenarios();
        mutableScenarios();
        // Order matters from here (process-wide UUID counter): add new scenarios at the end.
        atmosphereProfileScenarios();
        railLengthScenarios();
        stepperScenarios();
    }

    private static void rollScenarios() {
        double[] cantsDeg = { 0.0, 0.5, 2.0, -2.0 };
        double[] machs = { 0.3, 0.8, 1.5 };
        double[] rollRates = { 0.0, 5.0, 20.0 };

        for (double cantDeg : cantsDeg) {
            Rocket rocket = buildReferenceRocket();
            TrapezoidFinSet fins = null;
            for (info.openrocket.core.rocketcomponent.RocketComponent c : rocket) {
                if (c instanceof TrapezoidFinSet) {
                    fins = (TrapezoidFinSet) c;
                    break;
                }
            }
            if (fins == null) {
                line("roll.missingFinSet", cantDeg);
                continue;
            }
            fins.setCantAngle(Math.toRadians(cantDeg));
            line("roll.cant", cantDeg, fins.getCantAngle());

            FlightConfiguration config = rocket.getSelectedConfiguration();
            info.openrocket.core.aerodynamics.BarrowmanCalculator calc =
                    new info.openrocket.core.aerodynamics.BarrowmanCalculator();
            info.openrocket.core.logging.WarningSet warnings =
                    new info.openrocket.core.logging.WarningSet();

            for (double mach : machs) {
                for (double rollRate : rollRates) {
                    info.openrocket.core.aerodynamics.FlightConditions conditions =
                            new info.openrocket.core.aerodynamics.FlightConditions(config);
                    conditions.setMach(mach);
                    conditions.setAOA(0.0);
                    conditions.setRollRate(rollRate);

                    warnings.clear();
                    info.openrocket.core.aerodynamics.AerodynamicForces forces =
                            calc.getAerodynamicForces(config, conditions, warnings);

                    line("roll.forces", cantDeg, mach, rollRate,
                            forces.getCrollForce(), forces.getCrollDamp(), forces.getCroll());
                    line("roll.lateral", cantDeg, mach, rollRate,
                            forces.getCside(), forces.getCyaw());
                }
            }
        }
    }

    /** Collator is a jdkstub under TeaVM but the real JDK class on the JVM: a mismatch means the stub is wrong. */
    private static void collatorScenarios() {
        String[] names = {
                "H128W", "H128-W", "AeroTech", "A-P", "K550W", "k550w",
                "A10-3T", "A10 3T", "Pro38", "Pro-38", "1/2A3", "-5",
                "C11-3", "C11 3", "Estes", "Cesaroni", "Loki", "LOKI", "loki",
                "H128.W", "H128'W", "H128_W", "H128/W", "A.T.", "1/4A3", "LOC/Precision",
                "A-10 3T", "A 10-3T",
        };
        int[] strengths = {
                java.text.Collator.PRIMARY, java.text.Collator.SECONDARY,
                java.text.Collator.TERTIARY, java.text.Collator.IDENTICAL,
        };
        for (int s = 0; s < strengths.length; s++) {
            java.text.Collator coll = java.text.Collator.getInstance(java.util.Locale.US);
            coll.setStrength(strengths[s]);
            StringBuilder row = new StringBuilder();
            for (String a : names) {
                for (String b : names) {
                    int sign = coll.compare(a, b);
                    row.append(sign < 0 ? '<' : sign > 0 ? '>' : '=');
                }
            }
            System.out.println("collator.matrix|" + strengths[s] + "|" + row);
        }
        java.text.Collator primary = java.text.Collator.getInstance(java.util.Locale.US);
        primary.setStrength(java.text.Collator.PRIMARY);
        java.text.Collator identical = java.text.Collator.getInstance(java.util.Locale.US);
        identical.setStrength(java.text.Collator.IDENTICAL);
        line("collator.independent",
                primary.compare("H128W", "H128-W"),
                identical.compare("H128W", "H128-W"),
                primary.getStrength(), identical.getStrength());
    }

    private static void uuidScenarios() {
        java.util.Set<Long> msbs = new java.util.HashSet<>();
        java.util.Set<String> prefixes = new java.util.HashSet<>();
        String first = null;
        for (int i = 0; i < 4096; i++) {
            info.openrocket.core.util.LongUUID u = info.openrocket.core.util.LongUUID.randomUUID();
            msbs.add(u.getMostSignificantBits());
            String s8 = u.toString().substring(0, 8);
            prefixes.add(s8);
            if (i == 0) first = u.toString();
        }
        // A raw counter would give 2048 and 1.
        line("uuid.spread", msbs.size(), prefixes.size());
        System.out.println("uuid.first|" + first);
    }

    /** PATCH(teavm-mutable-trace): a cause on the refusal means the patch was lost. */
    private static void mutableScenarios() {
        info.openrocket.core.util.Mutable m = new info.openrocket.core.util.Mutable();
        boolean before = m.isMutable();
        m.immute();
        m.immute();
        info.openrocket.core.util.Mutable copy = m.clone();
        System.out.println("mutable.state|" + before + "|" + m.isMutable() + "|" + copy.isMutable());
        mutableRefusal("mutable.check", m::check);

        info.openrocket.core.simulation.FlightDataBranch branch =
                new info.openrocket.core.simulation.FlightDataBranch("parity",
                        info.openrocket.core.simulation.FlightDataType.TYPE_TIME);
        branch.addPoint();
        branch.setValue(info.openrocket.core.simulation.FlightDataType.TYPE_TIME, 0.0);
        branch.immute();
        mutableRefusal("mutable.branch", () -> branch.setValue(
                info.openrocket.core.simulation.FlightDataType.TYPE_TIME, 1.0));
    }

    private static void mutableRefusal(String tag, Runnable write) {
        try {
            write.run();
            System.out.println(tag + "|accepted");
        } catch (IllegalStateException e) {
            System.out.println(tag + "|" + e.getMessage() + "|cause=" + e.getCause());
        }
    }

    private static void preferencesScenarios() {
        info.openrocket.core.preferences.ApplicationPreferences prefs =
                info.openrocket.core.startup.Application.getPreferences();
        info.openrocket.core.models.wind.PinkNoiseWindModel wind = prefs.getAverageWindModel();
        line("prefs.wind", wind.getAverage(), wind.getTurbulenceIntensity(),
                wind.getDirection(), wind.getStandardDeviation());
        line("prefs.launch", prefs.getLaunchRodLength(), prefs.getLaunchRodAngle(),
                prefs.getLaunchRodDirection(), prefs.getLaunchAltitude(),
                prefs.getLaunchLatitude(), prefs.getLaunchLongitude());
        line("prefs.atmos", prefs.getLaunchTemperature(), prefs.getLaunchPressure(),
                prefs.getLaunchRelativeHumidity(), prefs.getConstantGravityValue());
        line("prefs.sim", prefs.getTimeStep(), prefs.getMaxSimulationTime(),
                prefs.getDefaultMach());
    }

    private static void supersonicAeroScenarios() {
        Rocket rocket = buildReferenceRocket();
        info.openrocket.core.rocketcomponent.FlightConfiguration config =
                rocket.getSelectedConfiguration();
        info.openrocket.core.logging.WarningSet w =
                new info.openrocket.core.logging.WarningSet();
        double[] machs = { 1.2, 2.0, 4.0, 8.0 };
        for (double mach : machs) {
            info.openrocket.core.aerodynamics.BarrowmanCalculator off =
                    new info.openrocket.core.aerodynamics.BarrowmanCalculator();
            info.openrocket.core.aerodynamics.FlightConditions cOff =
                    new info.openrocket.core.aerodynamics.FlightConditions(config);
            cOff.setMach(mach);
            cOff.setAOA(Math.toRadians(2));
            CoordinateIF cpOff = off.getCP(config, cOff, w);

            info.openrocket.core.aerodynamics.RASAeroStabilityCalculator stab =
                    new info.openrocket.core.aerodynamics.RASAeroStabilityCalculator();
            stab.setSupersonicAero(true);
            info.openrocket.core.aerodynamics.RASAeroDragCalculator drag =
                    new info.openrocket.core.aerodynamics.RASAeroDragCalculator();
            drag.setSupersonicAero(true);
            info.openrocket.core.aerodynamics.BarrowmanCalculator on =
                    new info.openrocket.core.aerodynamics.BarrowmanCalculator(stab, drag);
            info.openrocket.core.aerodynamics.FlightConditions cOn =
                    new info.openrocket.core.aerodynamics.FlightConditions(config);
            cOn.setMach(mach);
            cOn.setAOA(Math.toRadians(2));
            CoordinateIF cpOn = on.getCP(config, cOn, w);

            line("ssaero." + mach, cpOff.getX(), cpOff.getWeight(), cpOn.getX(), cpOn.getWeight());

            info.openrocket.core.aerodynamics.AerodynamicForces fOn =
                    on.getAerodynamicForces(config, cOn, w);
            line("ssaerocd." + mach, fOn.getCD(), fOn.getFrictionCD(),
                    fOn.getPressureCD(), fOn.getBaseCD());
        }
    }

    private static void airfoilSectionScenarios() {
        String base = "{\"components\":[{\"type\":\"stage\",\"name\":\"S\",\"children\":["
                + "{\"type\":\"nosecone\",\"shape\":\"conical\",\"length\":0.085,\"aftRadius\":0.015,\"thickness\":0.0015},"
                + "{\"type\":\"bodytube\",\"length\":0.215,\"outerRadius\":0.015,\"thickness\":0.0015,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":4,\"rootChord\":0.03,\"tipChord\":0.03,\"sweep\":0,\"height\":0.03,\"thickness\":0.0024,%FIN%"
                + "\"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + "]}]}]}";
        String[][] variants = {
                { "wedge", "\"airfoilSection\":\"singlewedge\"," },
                { "hexle", "\"airfoilSection\":\"hexagonal\",\"airfoilLeDiamond\":0.008,\"airfoilTeDiamond\":0.008,\"finLeRadius\":0.0004," },
        };
        for (String[] v : variants) {
            int r = api.OpenRocketEngine.buildRocket(base.replace("%FIN%", v[1]));
            String sweep = api.OpenRocketEngine.getAeroSweep(r, "{\"machMin\":0.5,\"machMax\":3.5,\"machStep\":1.0}");
            java.util.Map<String, Object> parsed = api.JsonLite.parseObject(sweep);
            java.util.Map<String, Object> off = asMap(parsed.get("powerOff"));
            java.util.List<?> total = (java.util.List<?>) off.get("total");
            java.util.List<?> press = (java.util.List<?>) off.get("pressure");
            line("finsection." + v[0],
                    ((Number) total.get(0)).doubleValue(), ((Number) press.get(0)).doubleValue(),
                    ((Number) total.get(2)).doubleValue(), ((Number) press.get(2)).doubleValue());
        }
    }

    private static void minDiameterScenarios() {
        String json = "{\"name\":\"MinDia\",\"components\":[{\"type\":\"stage\",\"name\":\"S\",\"nozzleExitDiameter\":0.014,\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.10,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"id\":\"body\",\"length\":0.45,\"outerRadius\":0.012,\"thickness\":0.0005,\"density\":950,\"motorMount\":true,\"motorOverhang\":0.006,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.025,\"thickness\":0.003},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30}"
                + "]}]}]}";
        int r = api.OpenRocketEngine.buildRocket(json);
        api.OpenRocketEngine.setMotorById(r, "body", "C6", 0.018, 0.070,
                new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                0.035, 5.0);
        lineStaticInfo("mindia.info", api.OpenRocketEngine.getStaticInfo(r));

        String result = api.OpenRocketEngine.simulateJson(r, "{\"rodLength\":1.0}");
        java.util.Map<String, Object> parsed = api.JsonLite.parseObject(result);
        java.util.Map<String, Object> summary = asMap(parsed.get("summary"));
        line("flight.mindia",
                api.JsonLite.dbl(summary, "maxAltitude", Double.NaN),
                api.JsonLite.dbl(summary, "maxVelocity", Double.NaN),
                api.JsonLite.dbl(summary, "timeToApogee", Double.NaN));
    }

    private static void railLengthScenarios() {
        String json = "{\"name\":\"Rail\",\"components\":[{\"type\":\"stage\",\"name\":\"S\",\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.10,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"id\":\"body\",\"length\":0.45,\"outerRadius\":0.012,\"thickness\":0.0005,\"density\":950,\"motorMount\":true,\"motorOverhang\":0.006,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.025,\"thickness\":0.003},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30}"
                + "]}]}]}";
        int r = api.OpenRocketEngine.buildRocket(json);
        api.OpenRocketEngine.setMotorById(r, "body", "C6", 0.018, 0.070,
                new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                0.035, 5.0);
        for (double min : new double[] { 5.0, 20.0, 500.0 }) {
            java.util.Map<String, Object> summary = asMap(api.JsonLite.parseObject(api.OpenRocketEngine.simulateJson(
                    r, "{\"rodLength\":1.0,\"railExitMinSpeed\":" + min + "}")).get("summary"));
            line("rail.needed." + (int) min,
                    api.JsonLite.dbl(summary, "railLengthNeeded", Double.NaN),
                    api.JsonLite.dbl(summary, "launchRodVelocity", Double.NaN),
                    api.JsonLite.dbl(summary, "maxAltitude", Double.NaN));
        }
    }

    private static void stepperScenarios() {
        String json = "{\"name\":\"Stepper\",\"components\":[{\"type\":\"stage\",\"name\":\"S\",\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.10,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"id\":\"body\",\"length\":0.45,\"outerRadius\":0.012,\"thickness\":0.0005,\"density\":950,\"motorMount\":true,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.025,\"thickness\":0.003},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30}"
                + "]}]}]}";
        int r = api.OpenRocketEngine.buildRocket(json);
        api.OpenRocketEngine.setMotorById(r, "body", "C6", 0.018, 0.070,
                new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                0.035, 5.0);
        for (String stepper : new String[] { "rk4", "rk6" }) {
            java.util.Map<String, Object> summary = asMap(api.JsonLite.parseObject(api.OpenRocketEngine.simulateJson(
                    r, "{\"rodLength\":1.0,\"windAverage\":4.0,\"stepper\":\"" + stepper + "\"}")).get("summary"));
            line("flight.stepper." + stepper,
                    api.JsonLite.dbl(summary, "maxAltitude", Double.NaN),
                    api.JsonLite.dbl(summary, "maxVelocity", Double.NaN),
                    api.JsonLite.dbl(summary, "timeToApogee", Double.NaN));
        }
        Object error = api.JsonLite.parseObject(
                api.OpenRocketEngine.simulateJson(r, "{\"rodLength\":1.0,\"stepper\":\"euler\"}")).get("error");
        line("flight.stepper.unknown", error != null ? 1 : 0);
    }

    private static void atmosphereProfileScenarios() {
        String json = "{\"name\":\"Atmo\",\"components\":[{\"type\":\"stage\",\"name\":\"S\",\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.10,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"id\":\"body\",\"length\":0.45,\"outerRadius\":0.012,\"thickness\":0.0005,\"density\":950,\"motorMount\":true,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.025,\"thickness\":0.003},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30}"
                + "]}]}]}";
        int r = api.OpenRocketEngine.buildRocket(json);
        api.OpenRocketEngine.setMotorById(r, "body", "C6", 0.018, 0.070,
                new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                0.035, 5.0);
        String levels = "[{\"altitude\":0,\"temperature\":268.15,\"pressure\":99000,\"relativeHumidity\":0.8},"
                + "{\"altitude\":150,\"temperature\":266.0,\"pressure\":97200,\"relativeHumidity\":0.7},"
                + "{\"altitude\":400,\"temperature\":270.0,\"pressure\":94300,\"relativeHumidity\":0.5},"
                + "{\"altitude\":1500,\"temperature\":262.0,\"pressure\":82500,\"relativeHumidity\":0.3}]";
        atmosphereFlight("flight.atmo.levels", r, "{\"rodLength\":1.0,\"atmosphereLevels\":" + levels + "}");
        atmosphereFlight("flight.atmo.anchored", r, "{\"rodLength\":1.0,\"launchAltitude\":100,"
                + "\"temperature\":271.0,\"pressure\":97800,\"atmosphereLevels\":" + levels + "}");
        atmosphereFlight("flight.atmo.pasttop", r, "{\"rodLength\":1.0,\"atmosphereLevels\":"
                + "[{\"altitude\":0,\"temperature\":268.15,\"pressure\":99000,\"relativeHumidity\":0.8},"
                + "{\"altitude\":120,\"temperature\":267.0,\"pressure\":97600,\"relativeHumidity\":0.8}]}");
    }

    private static void atmosphereFlight(String tag, int rocket, String options) {
        java.util.Map<String, Object> summary =
                asMap(api.JsonLite.parseObject(api.OpenRocketEngine.simulateJson(rocket, options)).get("summary"));
        line(tag,
                api.JsonLite.dbl(summary, "maxAltitude", Double.NaN),
                api.JsonLite.dbl(summary, "maxVelocity", Double.NaN),
                api.JsonLite.dbl(summary, "timeToApogee", Double.NaN));
    }

    private static void rogersKbfScenarios() {
        Rocket rocket = buildReferenceRocket();
        info.openrocket.core.rocketcomponent.FlightConfiguration config =
                rocket.getSelectedConfiguration();
        info.openrocket.core.logging.WarningSet w =
                new info.openrocket.core.logging.WarningSet();
        double[] machs = { 0.3, 0.8 };
        for (double mach : machs) {
            info.openrocket.core.aerodynamics.BarrowmanCalculator off =
                    new info.openrocket.core.aerodynamics.BarrowmanCalculator();
            info.openrocket.core.aerodynamics.FlightConditions cOff =
                    new info.openrocket.core.aerodynamics.FlightConditions(config);
            cOff.setMach(mach);
            cOff.setAOA(Math.toRadians(2));
            CoordinateIF cpOff = off.getCP(config, cOff, w);

            info.openrocket.core.aerodynamics.RASAeroStabilityCalculator stab =
                    new info.openrocket.core.aerodynamics.RASAeroStabilityCalculator();
            stab.setRogersKbf(true);
            info.openrocket.core.aerodynamics.RASAeroDragCalculator drag =
                    new info.openrocket.core.aerodynamics.RASAeroDragCalculator();
            drag.setRogersKbf(true);
            info.openrocket.core.aerodynamics.BarrowmanCalculator on =
                    new info.openrocket.core.aerodynamics.BarrowmanCalculator(stab, drag);
            info.openrocket.core.aerodynamics.FlightConditions cOn =
                    new info.openrocket.core.aerodynamics.FlightConditions(config);
            cOn.setMach(mach);
            cOn.setAOA(Math.toRadians(2));
            CoordinateIF cpOn = on.getCP(config, cOn, w);

            line("rogerskbf." + mach, cpOff.getX(), cpOff.getWeight(), cpOn.getX(), cpOn.getWeight());
        }
    }

    /** Stage nozzle but no motor, so power-on equals power-off. */
    private static void aeroSweepScenarios() {
        String json = "{\"components\":[{\"type\":\"stage\",\"name\":\"S\",\"nozzleExitDiameter\":0.016,\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0005,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003}"
                + "]}]}]}";
        int r = api.OpenRocketEngine.buildRocket(json);
        String sweep = api.OpenRocketEngine.getAeroSweep(r, "{\"machMin\":0.3,\"machMax\":1.5,\"machStep\":0.6}");
        java.util.Map<String, Object> parsed = api.JsonLite.parseObject(sweep);
        java.util.List<?> machs = (java.util.List<?>) parsed.get("machs");
        java.util.Map<String, Object> off = asMap(parsed.get("powerOff"));
        java.util.Map<String, Object> on = asMap(parsed.get("powerOn"));
        java.util.List<?> offTotal = (java.util.List<?>) off.get("total");
        java.util.List<?> onTotal = (java.util.List<?>) on.get("total");
        java.util.List<?> offBase = (java.util.List<?>) off.get("base");
        java.util.List<?> onBase = (java.util.List<?>) on.get("base");
        for (int i = 0; i < machs.size(); i++) {
            line("dragsweep." + i,
                    (Double) machs.get(i),
                    (Double) offTotal.get(i), (Double) onTotal.get(i),
                    (Double) offBase.get(i), (Double) onBase.get(i));
        }
        java.util.List<?> comps = (java.util.List<?>) parsed.get("components");
        System.out.println("dragsweep.compcount|" + comps.size());
    }

    private static void podScenarios() {
        String podJson = "{\"name\":\"Pod\",\"components\":[{\"type\":\"stage\",\"name\":\"Core\",\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"podset\",\"id\":\"pod\",\"instanceCount\":2,\"radiusMethod\":\"relative\",\"radiusOffset\":0.005,"
                + "   \"angleOffset\":0,\"position\":{\"method\":\"bottom\",\"offset\":0},\"children\":["
                + "    {\"type\":\"bodytube\",\"length\":0.10,\"outerRadius\":0.008,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "      {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.03,\"tipChord\":0.02,\"sweep\":0.01,\"height\":0.02,\"thickness\":0.002}"
                + "    ]}"
                + "  ]}"
                + "]}]}]}";
        int r = api.OpenRocketEngine.buildRocket(podJson);

        info.openrocket.core.rocketcomponent.Rocket rocket =
                (info.openrocket.core.rocketcomponent.Rocket) getRocketFromInfo(r);
        info.openrocket.core.rocketcomponent.PodSet pod = null;
        for (info.openrocket.core.rocketcomponent.RocketComponent comp : rocket) {
            if (comp instanceof info.openrocket.core.rocketcomponent.PodSet) {
                pod = (info.openrocket.core.rocketcomponent.PodSet) comp;
            }
        }
        CoordinateIF[] offs = pod.getInstanceOffsets();
        double[] geom = new double[2 + offs.length * 2];
        geom[0] = pod.getInstanceCount();
        geom[1] = pod.getAngleOffset();
        for (int i = 0; i < offs.length; i++) {
            geom[2 + i * 2] = offs[i].getY();
            geom[3 + i * 2] = offs[i].getZ();
        }
        line("pod.geometry", geom);
        lineStaticInfo("pod.info", api.OpenRocketEngine.getStaticInfo(r));
        lineComponentInfo("pod.comp", api.OpenRocketEngine.getComponentInfo(r, "pod"));

        RigidBody podStruct = MassCalculator.calculateStructure(rocket.getSelectedConfiguration());
        line("mass.pod.structure", podStruct.getMass(),
                podStruct.getCM().getX(),podStruct.getCM().getY(),podStruct.getCM().getZ(),
                podStruct.getIxx(), podStruct.getIyy(), podStruct.getIzz(),
                podStruct.getLongitudinalInertia(), podStruct.getRotationalInertia());

        int r1 = api.OpenRocketEngine.buildRocket(podJson.replace("\"instanceCount\":2", "\"instanceCount\":1"));
        RigidBody s1 = MassCalculator.calculateStructure(
                ((info.openrocket.core.rocketcomponent.Rocket) getRocketFromInfo(r1)).getSelectedConfiguration());
        line("mass.pod1.offaxis", s1.getMass(), s1.getCM().getX(),s1.getCM().getY(),s1.getCM().getZ(),
                s1.getIxx(), s1.getIyy(), s1.getIzz());

        String boosterJson = "{\"name\":\"Booster\",\"components\":[{\"type\":\"stage\",\"name\":\"Core\",\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003},"
                + "  {\"type\":\"innertube\",\"id\":\"cmount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true,\"position\":{\"method\":\"bottom\",\"offset\":0}},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30},"
                + "  {\"type\":\"parallelstage\",\"id\":\"boost\",\"instanceCount\":2,\"radiusMethod\":\"relative\",\"radiusOffset\":0,"
                + "   \"angleOffset\":0,\"angleMethod\":\"relative\",\"separationEvent\":\"burnout\",\"separationDelay\":0,\"position\":{\"method\":\"bottom\",\"offset\":0},\"children\":["
                + "    {\"type\":\"bodytube\",\"length\":0.12,\"outerRadius\":0.010,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "      {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.04,\"tipChord\":0.02,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003},"
                + "      {\"type\":\"innertube\",\"id\":\"bmount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true,\"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + "    ]}"
                + "  ]}"
                + "]}]}]}";
        int rb = api.OpenRocketEngine.buildRocket(boosterJson);
        double[] times = { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 };
        double[] thrusts = { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 };
        double[] masses = { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 };
        api.OpenRocketEngine.setMotorById(rb, "cmount", "C6", 0.018, 0.070, times, thrusts, masses, 0.035, 5.0);
        api.OpenRocketEngine.setMotorById(rb, "bmount", "C6", 0.018, 0.070, times, thrusts, masses, 0.035, 0.0);
        lineStaticInfo("para.info", api.OpenRocketEngine.getStaticInfo(rb));

        // maxTime cap: a long descent drifts in row count by ULP noise.
        String result = api.OpenRocketEngine.simulateJson(rb, "{\"rodLength\":1.2,\"maxTime\":6}");
        java.util.Map<String, Object> parsed = api.JsonLite.parseObject(result);
        Object branchesObj = parsed.get("branches");
        StringBuilder names = new StringBuilder("para.branches|");
        if (branchesObj instanceof java.util.List) {
            java.util.List<?> branches = (java.util.List<?>) branchesObj;
            names.append(branches.size());
            for (Object b : branches) names.append('|').append(asMap(b).get("name"));
        } else {
            names.append("MISSING");
        }
        System.out.println(names);
        java.util.Map<String, Object> summary = asMap(parsed.get("summary"));
        line("flight.para.summary",
                api.JsonLite.dbl(summary, "maxAltitude", Double.NaN),
                api.JsonLite.dbl(summary, "maxVelocity", Double.NaN),
                api.JsonLite.dbl(summary, "timeToApogee", Double.NaN));
    }

    private static void stagingScenarios() {
        runStagingScenario("auto", null, 0.0, false);
        runStagingScenario("timed", "burnout", 1.0, true);
    }

    private static void runStagingScenario(String name, String sustainerIgnition,
            double ignitionDelay, boolean boosterChute) {
        String sustainer = "{\"type\":\"stage\",\"name\":\"Sustainer\",\"children\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.025,\"thickness\":0.003},"
                + "  {\"type\":\"innertube\",\"id\":\"smount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true,"
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0}},"
                + "  {\"type\":\"parachute\",\"name\":\"SustainerChute\",\"diameter\":0.35}"
                + "]}]}";
        String booster = "{\"type\":\"stage\",\"name\":\"Booster\","
                + "\"separationEvent\":\"" + (sustainerIgnition == null ? "ejection" : "burnout") + "\",\"children\":["
                + "{\"type\":\"bodytube\",\"length\":0.12,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.025,\"height\":0.035,\"thickness\":0.003},"
                + "  {\"type\":\"innertube\",\"id\":\"bmount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true,"
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + (boosterChute ? ",{\"type\":\"parachute\",\"name\":\"BoosterChute\",\"diameter\":0.25}" : "")
                + "]}]}";
        int r = api.OpenRocketEngine.buildRocket(
                "{\"name\":\"TwoStage\",\"components\":[" + sustainer + "," + booster + "]}");

        double[] times = { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 };
        double[] thrusts = { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 };
        double[] masses = { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 };
        api.OpenRocketEngine.setMotorById(r, "smount", "C6", 0.018, 0.070, times, thrusts, masses, 0.035, 5.0);
        api.OpenRocketEngine.setMotorById(r, "bmount", "C6", 0.018, 0.070, times, thrusts, masses, 0.035, 0.0);
        if (sustainerIgnition != null) {
            api.OpenRocketEngine.setMotorIgnitionById(r, "smount", sustainerIgnition, ignitionDelay);
        }

        String result = api.OpenRocketEngine.simulateJson(r, "{\"rodLength\":1.0}");
        java.util.Map<String, Object> parsed = api.JsonLite.parseObject(result);
        Object branchesObj = parsed.get("branches");
        if (!(branchesObj instanceof java.util.List)) {
            System.out.println("staging." + name + ".branches|MISSING");
            return;
        }
        java.util.List<?> branches = (java.util.List<?>) branchesObj;
        StringBuilder names = new StringBuilder("staging." + name + ".branches|" + branches.size());
        for (Object b : branches) {
            names.append('|').append(asMap(b).get("name"));
        }
        System.out.println(names);

        for (int i = 0; i < branches.size(); i++) {
            java.util.Map<String, Object> b = asMap(branches.get(i));
            StringBuilder evs = new StringBuilder("staging." + name + ".b" + i + ".events");
            for (Object e : (java.util.List<?>) b.get("events")) {
                java.util.Map<String, Object> ev = asMap(e);
                evs.append('|').append(ev.get("type"));
                Object src = ev.get("source");
                if (src != null) evs.append('@').append(src);
            }
            System.out.println(evs);

            java.util.Map<String, Object> series = asMap(b.get("series"));
            java.util.List<?> alt = (java.util.List<?>) series.get("altitude");
            double maxAlt = 0;
            for (Object v : alt) {
                if (v instanceof Double && (Double) v > maxAlt) maxAlt = (Double) v;
            }
            // Not the end time: a ~3-minute chute descent accumulates ULP noise.
            double sepTime = Double.NaN;
            for (Object e : (java.util.List<?>) b.get("events")) {
                java.util.Map<String, Object> ev = asMap(e);
                if ("STAGE_SEPARATION".equals(ev.get("type"))) {
                    sepTime = api.JsonLite.dbl(ev, "time", Double.NaN);
                    break;
                }
            }
            line("flight.staging." + name + ".b" + i, maxAlt, sepTime);
        }
    }

    private static void clusterScenarios() {
        for (String pattern : new String[] { null, "3-ring" }) {
            String name = pattern == null ? "single" : "ring3";
            String clusterAttrs = pattern == null ? ""
                    : ",\"cluster\":\"" + pattern + "\",\"clusterScale\":1.0,\"clusterRotation\":0.5235987755982988";
            String json = "{\"name\":\"Cluster\",\"components\":["
                    + "{\"type\":\"nosecone\",\"length\":0.12,\"aftRadius\":0.033,\"thickness\":0.002},"
                    + "{\"type\":\"bodytube\",\"length\":0.45,\"outerRadius\":0.033,\"thickness\":0.001,\"density\":950,\"children\":["
                    + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.09,\"tipChord\":0.05,\"sweep\":0.04,\"height\":0.06,\"thickness\":0.003},"
                    + "  {\"type\":\"innertube\",\"id\":\"mount\",\"length\":0.075,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true"
                    + clusterAttrs + ",\"position\":{\"method\":\"bottom\",\"offset\":0}},"
                    + "  {\"type\":\"parachute\",\"diameter\":0.45}"
                    + "]}]}";
            int r = api.OpenRocketEngine.buildRocket(json);

            info.openrocket.core.rocketcomponent.Rocket rocket =
                    (info.openrocket.core.rocketcomponent.Rocket) getRocketFromInfo(r);
            info.openrocket.core.rocketcomponent.InnerTube mount = null;
            for (info.openrocket.core.rocketcomponent.RocketComponent comp : rocket) {
                if (comp instanceof info.openrocket.core.rocketcomponent.InnerTube) {
                    mount = (info.openrocket.core.rocketcomponent.InnerTube) comp;
                }
            }
            CoordinateIF[] offsets = mount.getInstanceOffsets();
            double[] geom = new double[1 + offsets.length * 2];
            geom[0] = mount.getInstanceCount();
            for (int i = 0; i < offsets.length; i++) {
                geom[1 + i * 2] = offsets[i].getY();
                geom[2 + i * 2] = offsets[i].getZ();
            }
            line("cluster." + name + ".geometry", geom);

            api.OpenRocketEngine.setMotorById(r, "mount", "C6", 0.018, 0.070,
                    new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                    new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                    new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                    0.035, 4.0);
            lineStaticInfo("cluster." + name + ".info", api.OpenRocketEngine.getStaticInfo(r));

            String result = api.OpenRocketEngine.simulateJson(r, "{\"rodLength\":1.0}");
            java.util.Map<String, Object> parsed = api.JsonLite.parseObject(result);
            java.util.Map<String, Object> summary = asMap(parsed.get("summary"));
            line("flight.cluster." + name,
                    api.JsonLite.dbl(summary, "maxAltitude", Double.NaN),
                    api.JsonLite.dbl(summary, "maxVelocity", Double.NaN),
                    api.JsonLite.dbl(summary, "maxAcceleration", Double.NaN),
                    api.JsonLite.dbl(summary, "timeToApogee", Double.NaN),
                    api.JsonLite.dbl(summary, "flightTime", Double.NaN));
        }
    }

    /** "split" and "double" place the same mass, so Ixx must agree; upstream gives the split pair no m * r^2. */
    private static void splitClusterScenarios() {
        String head = "{\"name\":\"Split\",\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.12,\"aftRadius\":0.033,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.45,\"outerRadius\":0.033,\"thickness\":0.001,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.09,\"tipChord\":0.05,\"sweep\":0.04,\"height\":0.06,\"thickness\":0.003},";
        String tail = "  {\"type\":\"parachute\",\"diameter\":0.45}"
                + "]}]}";
        String tube = "{\"type\":\"innertube\",\"length\":0.075,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true,"
                + "\"position\":{\"method\":\"bottom\",\"offset\":0}";
        String[][] designs = {
            { "split", head
                + "  " + tube + ",\"id\":\"m1\",\"radialPosition\":0.015,\"radialDirection\":0},"
                + "  " + tube + ",\"id\":\"m2\",\"radialPosition\":0.015,\"radialDirection\":3.141592653589793},"
                + tail },
            { "double", head
                + "  " + tube + ",\"id\":\"m1\",\"cluster\":\"double\",\"clusterScale\":" + (0.015 / 0.0095)
                + ",\"clusterRotation\":0},"
                + tail },
            { "axis", head
                + "  " + tube + ",\"id\":\"m1\"},"
                + tail },
        };
        double[] times = { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 };
        double[] thrusts = { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 };
        double[] masses = { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 };
        for (String[] d : designs) {
            int r = api.OpenRocketEngine.buildRocket(d[1]);
            api.OpenRocketEngine.setMotorById(r, "m1", "C6", 0.018, 0.070, times, thrusts, masses, 0.035, 4.0);
            if ("split".equals(d[0])) {
                api.OpenRocketEngine.setMotorById(r, "m2", "C6", 0.018, 0.070, times, thrusts, masses, 0.035, 4.0);
            }
            FlightConfiguration config = ((info.openrocket.core.rocketcomponent.Rocket) getRocketFromInfo(r))
                    .getSelectedConfiguration();
            RigidBody structure = MassCalculator.calculateStructure(config);
            line("mass.split." + d[0] + ".structure", structure.getMass(),
                    structure.getCM().getX(), structure.getCM().getY(), structure.getCM().getZ(),
                    structure.getIxx(), structure.getIyy());
            RigidBody launch = MassCalculator.calculateLaunch(config);
            line("mass.split." + d[0] + ".launch", launch.getMass(),
                    launch.getCM().getX(), launch.getCM().getY(), launch.getCM().getZ(),
                    launch.getIxx(), launch.getIyy());
        }

        String offAxisTube = "\"length\":0.05,\"outerRadius\":0.0095,\"thickness\":0.0005,\"density\":1200,"
                + "\"radialPosition\":0.015,\"radialDirection\":0.7,\"position\":{\"method\":\"top\",\"offset\":0.1}}";
        for (String type : new String[] { "tubecoupler", "innertube" }) {
            int r = api.OpenRocketEngine.buildRocket(head + "  {\"type\":\"" + type + "\"," + offAxisTube + "," + tail);
            RigidBody structure = MassCalculator.calculateStructure(
                    ((info.openrocket.core.rocketcomponent.Rocket) getRocketFromInfo(r)).getSelectedConfiguration());
            line("mass.offaxis." + type, structure.getMass(), structure.getCM().getX(), structure.getIxx(),
                    structure.getIyy());
        }
    }

    private static void dualDeployScenarios() {
        String rocket = "{\"name\":\"DualDeploy\",\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003},"
                + "  {\"type\":\"innertube\",\"id\":\"mount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true},"
                + "  {\"type\":\"parachute\",\"name\":\"Drogue\",\"diameter\":0.15,\"deployEvent\":\"apogee\"},"
                + "  {\"type\":\"parachute\",\"name\":\"Main\",\"diameter\":0.45,\"deployEvent\":\"altitude\",\"deployAltitude\":150}"
                + "]}]}";
        int r = api.OpenRocketEngine.buildRocket(rocket);
        api.OpenRocketEngine.setMotorById(r, "mount", "C6", 0.018, 0.070,
                new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                0.035, 5.0);
        String result = api.OpenRocketEngine.simulateJson(r, "{\"rodLength\":1.0}");
        java.util.Map<String, Object> parsed = api.JsonLite.parseObject(result);
        Object events = parsed.get("events");
        StringBuilder sources = new StringBuilder("flight.dualdeploy.sources");
        java.util.List<Double> times = new java.util.ArrayList<>();
        if (events instanceof java.util.List) {
            for (Object e : (java.util.List<?>) events) {
                if (!(e instanceof java.util.Map)) continue;
                java.util.Map<String, Object> ev = asMap(e);
                if ("RECOVERY_DEVICE_DEPLOYMENT".equals(ev.get("type"))) {
                    sources.append('|').append(ev.get("source"));
                    times.add(api.JsonLite.dbl(ev, "time", Double.NaN));
                }
            }
        }
        System.out.println(sources);
        double[] t = new double[times.size()];
        for (int i = 0; i < times.size(); i++) t[i] = times.get(i);
        line("flight.dualdeploy.times", t);
    }

    @SuppressWarnings("unchecked")
    private static java.util.Map<String, Object> asMap(Object o) {
        return (java.util.Map<String, Object>) o;
    }

    private static void finVariantScenarios() {
        for (String cs : new String[] { "square", "rounded", "airfoil" }) {
            String json = "{\"components\":["
                    + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                    + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                    + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003,\"crossSection\":\"" + cs + "\"}"
                    + "]}]}";
            int r = api.OpenRocketEngine.buildRocket(json);
            info.openrocket.core.rocketcomponent.FlightConfiguration config =
                    ((info.openrocket.core.rocketcomponent.Rocket)
                            getRocketFromInfo(r)).getSelectedConfiguration();
            info.openrocket.core.aerodynamics.BarrowmanCalculator calc =
                    new info.openrocket.core.aerodynamics.BarrowmanCalculator();
            info.openrocket.core.aerodynamics.FlightConditions cond =
                    new info.openrocket.core.aerodynamics.FlightConditions(config);
            cond.setMach(0.3);
            cond.setAOA(0);
            info.openrocket.core.logging.WarningSet w = new info.openrocket.core.logging.WarningSet();
            info.openrocket.core.aerodynamics.AerodynamicForces f =
                    calc.getAerodynamicForces(config, cond, w);
            line("fins.crosssection." + cs, f.getCD(), f.getFrictionCD(), f.getPressureCD());
        }

        String freeform = "{\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"freeformfinset\",\"finCount\":3,\"thickness\":0.003,\"crossSection\":\"airfoil\","
                + "   \"points\":[[0,0],[0.03,0.035],[0.055,0.035],[0.06,0.0]],"
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + "]}]}";
        int r2 = api.OpenRocketEngine.buildRocket(freeform);
        lineStaticInfo("fins.freeform.info", api.OpenRocketEngine.getStaticInfo(r2));

        String tubeFins = "{\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"tubefinset\",\"finCount\":6,\"length\":0.06,\"outerRadius\":0.006,"
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + "]}]}";
        componentAeroLines("fins.tube", api.OpenRocketEngine.buildRocket(tubeFins));

        String railButtons = "{\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003},"
                + "  {\"type\":\"railbutton\",\"outerDiameter\":0.0097,\"height\":0.0097,\"instanceCount\":2,\"instanceSeparation\":0.15,"
                + "   \"position\":{\"method\":\"top\",\"offset\":0.08}}"
                + "]}]}";
        componentAeroLines("railbutton", api.OpenRocketEngine.buildRocket(railButtons));

        finTabScenarios();
    }

    private static void componentAeroLines(String tag, int handle) {
        lineStaticInfo(tag + ".info", api.OpenRocketEngine.getStaticInfo(handle));
        info.openrocket.core.rocketcomponent.FlightConfiguration config =
                ((info.openrocket.core.rocketcomponent.Rocket) getRocketFromInfo(handle)).getSelectedConfiguration();
        info.openrocket.core.aerodynamics.BarrowmanCalculator calc =
                new info.openrocket.core.aerodynamics.BarrowmanCalculator();
        for (double mach : new double[] { 0.3, 0.8 }) {
            info.openrocket.core.aerodynamics.FlightConditions cond =
                    new info.openrocket.core.aerodynamics.FlightConditions(config);
            cond.setMach(mach);
            cond.setAOA(0);
            info.openrocket.core.aerodynamics.AerodynamicForces f =
                    calc.getAerodynamicForces(config, cond, new info.openrocket.core.logging.WarningSet());
            line(tag + ".aero." + mach, f.getCD(), f.getFrictionCD(), f.getPressureCD(), f.getBaseCD(),
                    f.getCP().getWeight(), f.getCP().getX());
        }
    }

    private static void finTabScenarios() {
        String noTab = "{\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"id\":\"body\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"id\":\"fins\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003,\"density\":680,"
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + "]}]}";
        int rPlain = api.OpenRocketEngine.buildRocket(noTab);
        lineStaticInfo("fins.tab.none", api.OpenRocketEngine.getStaticInfo(rPlain));
        lineComponentInfo("fins.tab.none.comp", api.OpenRocketEngine.getComponentInfo(rPlain, "fins"));

        String withTab = noTab.replace("\"position\":{\"method\":\"bottom\",\"offset\":0}}",
                "\"position\":{\"method\":\"bottom\",\"offset\":0},"
                + "\"tabHeight\":0.010,\"tabLength\":0.030,\"tabOffset\":0,\"tabOffsetMethod\":\"middle\"}");
        int rTab = api.OpenRocketEngine.buildRocket(withTab);
        lineStaticInfo("fins.tab.10mm", api.OpenRocketEngine.getStaticInfo(rTab));
        lineComponentInfo("fins.tab.10mm.comp", api.OpenRocketEngine.getComponentInfo(rTab, "fins"));
        lineComponentInfo("fins.tab.10mm.body", api.OpenRocketEngine.getComponentInfo(rTab, "body"));

        String clamped = noTab.replace("\"position\":{\"method\":\"bottom\",\"offset\":0}}",
                "\"position\":{\"method\":\"bottom\",\"offset\":0},"
                + "\"tabHeight\":0.5,\"tabLength\":0.030}");
        int rClamp = api.OpenRocketEngine.buildRocket(clamped);
        lineComponentInfo("fins.tab.clamped.comp", api.OpenRocketEngine.getComponentInfo(rClamp, "fins"));

        String ffTab = "{\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"freeformfinset\",\"id\":\"ff\",\"finCount\":3,\"thickness\":0.003,\"crossSection\":\"airfoil\",\"density\":680,"
                + "   \"points\":[[0,0],[0.03,0.035],[0.055,0.035],[0.06,0.0]],"
                + "   \"tabHeight\":0.008,\"tabLength\":0.025,\"tabOffset\":0,\"tabOffsetMethod\":\"middle\","
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0}}"
                + "]}]}";
        int rFf = api.OpenRocketEngine.buildRocket(ffTab);
        lineStaticInfo("fins.tab.freeform", api.OpenRocketEngine.getStaticInfo(rFf));
        lineComponentInfo("fins.tab.freeform.comp", api.OpenRocketEngine.getComponentInfo(rFf, "ff"));
    }

    private static void lineComponentInfo(String tag, String json) {
        java.util.Map<String, Object> info = api.JsonLite.parseObject(json);
        line(tag,
                api.JsonLite.dbl(info, "length", Double.NaN),
                api.JsonLite.dbl(info, "mass", Double.NaN),
                api.JsonLite.dbl(info, "sectionMass", Double.NaN),
                api.JsonLite.dbl(info, "cgX", Double.NaN),
                api.JsonLite.dbl(info, "positionX", Double.NaN));
    }

    private static Object getRocketFromInfo(int handle) {
        return api.OpenRocketEngine.getRocketForTesting(handle);
    }

    private static void conditionsScenarios() {
        String reference = "{\"name\":\"Ref\",\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002,\"shape\":\"ogive\"},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003},"
                + "  {\"type\":\"innertube\",\"id\":\"mount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30}"
                + "]}]}";
        int r = api.OpenRocketEngine.buildRocket(reference);
        api.OpenRocketEngine.setMotorById(r, "mount", "C6", 0.018, 0.070,
                new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 },
                new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 },
                new double[] { 0.0240, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132 },
                0.035, 5.0);

        // maxTime 8 s: over a long descent ULP noise flips the adaptive stepper's row count.
        String result = api.OpenRocketEngine.simulateJson(r, "{"
                + "\"rodLength\":1.2,\"rodAngle\":0.087,\"windAverage\":3.0,"
                + "\"windStdDeviation\":0.6,\"launchAltitude\":1400,"
                + "\"temperature\":303.15,\"pressure\":86000,\"randomSeed\":7,"
                + "\"maxTime\":8}");
        java.util.Map<String, Object> parsed = api.JsonLite.parseObject(result);
        java.util.Map<String, Object> summary = api.JsonLite.obj(parsed, "summary");
        line("flight.conditions.summary",
                api.JsonLite.dbl(summary, "maxAltitude", Double.NaN),
                api.JsonLite.dbl(summary, "maxVelocity", Double.NaN),
                api.JsonLite.dbl(summary, "timeToApogee", Double.NaN),
                api.JsonLite.dbl(summary, "groundHitVelocity", Double.NaN));
        line("flight.conditions.summaryext",
                api.JsonLite.dbl(summary, "maxMachNumber", Double.NaN),
                api.JsonLite.dbl(summary, "launchRodVelocity", Double.NaN),
                api.JsonLite.dbl(summary, "deploymentVelocity", Double.NaN),
                api.JsonLite.dbl(summary, "optimumDelay", Double.NaN));

        java.util.Map<String, Object> series = api.JsonLite.obj(parsed, "series");
        String[] keys = { "time", "altitude", "velocity", "acceleration", "mass",
                "thrust", "drag", "mach", "stability", "cpLocation", "cgLocation", "aoa" };
        double[] sizes = new double[keys.length];
        for (int i = 0; i < keys.length; i++) {
            Object arr = series.get(keys[i]);
            sizes[i] = arr instanceof java.util.List ? ((java.util.List<?>) arr).size() : -1;
        }
        line("flight.conditions.serieslens", sizes);
    }

    private static void treeApiScenarios() {
        String reference = "{\"name\":\"Ref\",\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.07,\"aftRadius\":0.012,\"thickness\":0.002,\"shape\":\"ogive\"},"
                + "{\"type\":\"bodytube\",\"length\":0.30,\"outerRadius\":0.012,\"thickness\":0.0003,\"density\":950,\"children\":["
                + "  {\"type\":\"trapezoidfinset\",\"finCount\":3,\"rootChord\":0.05,\"tipChord\":0.03,\"sweep\":0.02,\"height\":0.03,\"thickness\":0.003},"
                + "  {\"type\":\"innertube\",\"id\":\"mount\",\"length\":0.07,\"outerRadius\":0.0095,\"thickness\":0.0005,\"motorMount\":true},"
                + "  {\"type\":\"parachute\",\"diameter\":0.30}"
                + "]}]}";
        int r1 = api.OpenRocketEngine.buildRocket(reference);
        line("tree.api.ref", 1);
        lineStaticInfo("tree.info.ref", api.OpenRocketEngine.getStaticInfo(r1));

        String extended = "{\"name\":\"Extended\",\"components\":["
                + "{\"type\":\"nosecone\",\"length\":0.1,\"aftRadius\":0.0125,\"thickness\":0.002,\"shape\":\"haack\"},"
                + "{\"type\":\"bodytube\",\"length\":0.35,\"outerRadius\":0.0125,\"thickness\":0.0005,\"density\":950,\"children\":["
                + "  {\"type\":\"ellipticalfinset\",\"finCount\":4,\"rootChord\":0.06,\"height\":0.04,\"thickness\":0.003},"
                + "  {\"type\":\"launchlug\",\"length\":0.05,\"outerRadius\":0.0025,\"thickness\":0.0004,"
                + "   \"position\":{\"method\":\"middle\",\"offset\":0}},"
                + "  {\"type\":\"innertube\",\"id\":\"mount\",\"length\":0.08,\"outerRadius\":0.012,\"thickness\":0.0005,\"motorMount\":true,"
                + "   \"position\":{\"method\":\"bottom\",\"offset\":0},\"children\":["
                + "    {\"type\":\"engineblock\",\"length\":0.005,\"thickness\":0.001,\"position\":{\"method\":\"top\",\"offset\":0}}"
                + "  ]},"
                + "  {\"type\":\"centeringring\",\"length\":0.002,\"position\":{\"method\":\"bottom\",\"offset\":-0.01}},"
                + "  {\"type\":\"centeringring\",\"length\":0.002,\"position\":{\"method\":\"bottom\",\"offset\":-0.07}},"
                + "  {\"type\":\"streamer\",\"stripLength\":0.6,\"stripWidth\":0.05,\"position\":{\"method\":\"top\",\"offset\":0.02}},"
                + "  {\"type\":\"shockcord\",\"cordLength\":0.4,\"position\":{\"method\":\"top\",\"offset\":0.01}},"
                + "  {\"type\":\"masscomponent\",\"mass\":0.015,\"length\":0.02,\"radius\":0.006,\"position\":{\"method\":\"top\",\"offset\":0.05}}"
                + "]},"
                + "{\"type\":\"transition\",\"length\":0.04,\"foreRadius\":0.0125,\"aftRadius\":0.009,\"thickness\":0.001,\"shape\":\"conical\",\"density\":680}"
                + "]}";
        int r2 = api.OpenRocketEngine.buildRocket(extended);
        lineStaticInfo("tree.info.ext", api.OpenRocketEngine.getStaticInfo(r2));
    }

    private static void lineStaticInfo(String tag, String json) {
        java.util.Map<String, Object> info = api.JsonLite.parseObject(json);
        line(tag,
                api.JsonLite.dbl(info, "length", Double.NaN),
                api.JsonLite.dbl(info, "mass", Double.NaN),
                api.JsonLite.dbl(info, "cg", Double.NaN),
                api.JsonLite.dbl(info, "cp", Double.NaN),
                api.JsonLite.dbl(info, "cna", Double.NaN),
                api.JsonLite.dbl(info, "stabilityCalibers", Double.NaN),
                api.JsonLite.dbl(info, "warnings", Double.NaN));
    }

    private static void randomScenarios() {
        java.util.Random r = new java.util.Random(42);
        line("random.seeded42", r.nextDouble(), r.nextDouble(), r.nextGaussian(), r.nextGaussian());
    }

    private static void flightScenarios() {
        Rocket rocket = buildReferenceRocket();
        // Motors cannot attach to the default config.
        info.openrocket.core.rocketcomponent.FlightConfigurationId fcid =
                new info.openrocket.core.rocketcomponent.FlightConfigurationId(
                        "00000001-0001-4001-8001-000000000001");
        rocket.createFlightConfiguration(fcid);
        rocket.setSelectedConfiguration(fcid);

        info.openrocket.core.motor.ThrustCurveMotor motor =
                new info.openrocket.core.motor.ThrustCurveMotor.Builder()
                        .setManufacturer(info.openrocket.core.motor.Manufacturer.getManufacturer("Estes"))
                        .setDesignation("C6")
                        .setCommonName("C6")
                        .setMotorType(info.openrocket.core.motor.Motor.Type.SINGLE)
                        .setStandardDelays(new double[] { 3, 5, 7 })
                        .setDiameter(0.018)
                        .setLength(0.070)
                        .setTimePoints(new double[] { 0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0 })
                        .setThrustPoints(new double[] { 0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0 })
                        .setCGPoints(new Coordinate[] {
                                new Coordinate(0.035, 0, 0, 0.0240), new Coordinate(0.035, 0, 0, 0.0231),
                                new Coordinate(0.035, 0, 0, 0.0215), new Coordinate(0.035, 0, 0, 0.0202),
                                new Coordinate(0.035, 0, 0, 0.0174), new Coordinate(0.035, 0, 0, 0.0147),
                                new Coordinate(0.035, 0, 0, 0.0133), new Coordinate(0.035, 0, 0, 0.0132) })
                        .setDigest("harness-c6")
                        .build();

        InnerTube mount = null;
        for (info.openrocket.core.rocketcomponent.RocketComponent c
                : rocket.getSelectedConfiguration().getAllComponents()) {
            if (c instanceof InnerTube) {
                mount = (InnerTube) c;
            }
        }
        mount.setMotorMount(true);
        info.openrocket.core.motor.MotorConfiguration mc =
                new info.openrocket.core.motor.MotorConfiguration(mount, fcid);
        mc.setMotor(motor);
        mc.setEjectionDelay(5.0);
        mount.setMotorConfig(mc, fcid);

        info.openrocket.core.simulation.SimulationConditions conditions =
                new info.openrocket.core.simulation.SimulationConditions();
        conditions.setSimulation(new info.openrocket.core.document.Simulation(rocket, fcid));
        conditions.setLaunchRodLength(1.0);
        conditions.setLaunchRodAngle(0.0);
        conditions.setLaunchRodDirection(Math.PI / 2);
        conditions.setLaunchSite(new info.openrocket.core.util.WorldCoordinate(28.61, -80.60, 0));
        conditions.setGeodeticComputation(info.openrocket.core.util.GeodeticComputationStrategy.SPHERICAL);
        conditions.setAtmosphericModel(new ExtendedISAModel());
        conditions.setGravityModel(new info.openrocket.core.models.gravity.WGSGravityModel());
        info.openrocket.core.models.wind.PinkNoiseWindModel wind =
                new info.openrocket.core.models.wind.PinkNoiseWindModel();
        wind.setAverage(0.0);
        wind.setStandardDeviation(0.0);
        conditions.setWindModel(wind);
        conditions.setAerodynamicCalculator(new info.openrocket.core.aerodynamics.BarrowmanCalculator());
        conditions.setMassCalculator(new MassCalculator());
        conditions.setTimeStep(0.05);
        conditions.setMaxSimulationTime(1200);
        conditions.setRandomSeed(42);

        try {
            info.openrocket.core.simulation.BasicEventSimulationEngine engine =
                    new info.openrocket.core.simulation.BasicEventSimulationEngine();
            engine.simulate(conditions);
            info.openrocket.core.simulation.FlightData data = engine.getFlightData();

            line("flight.summary", data.getMaxAltitude(), data.getMaxVelocity(),
                    data.getMaxAcceleration(), data.getTimeToApogee(),
                    data.getFlightTime(), data.getGroundHitVelocity(), data.getBranchCount());

            info.openrocket.core.simulation.FlightDataBranch branch = data.getBranch(0);
            for (info.openrocket.core.simulation.FlightEvent ev : branch.getEvents()) {
                line("flight.event." + ev.getType().name(), ev.getTime());
                if (ev.getData() != null) {
                    System.out.println("flight.eventdata|" + ev.getType().name() + "|" + ev.getData());
                }
            }

            java.util.List<Double> t = branch.get(
                    info.openrocket.core.simulation.FlightDataType.TYPE_TIME);
            java.util.List<Double> alt = branch.get(
                    info.openrocket.core.simulation.FlightDataType.TYPE_ALTITUDE);
            java.util.List<Double> vel = branch.get(
                    info.openrocket.core.simulation.FlightDataType.TYPE_VELOCITY_TOTAL);
            java.util.List<Double> acc = branch.get(
                    info.openrocket.core.simulation.FlightDataType.TYPE_ACCELERATION_TOTAL);
            line("flight.rows", t.size());
            if (alt != null && vel != null && acc != null) {
                for (int i = 0; i < t.size(); i += 25) {
                    line("flight.sample." + i, t.get(i), alt.get(i), vel.get(i), acc.get(i));
                }
            }
        } catch (info.openrocket.core.simulation.exception.SimulationException e) {
            line("flight.exception", -1);
            System.out.println("EXCEPTION: " + e);
        }
    }

    private static void aeroScenarios() {
        Rocket rocket = buildReferenceRocket();
        FlightConfiguration config = rocket.getSelectedConfiguration();
        info.openrocket.core.aerodynamics.BarrowmanCalculator calc =
                new info.openrocket.core.aerodynamics.BarrowmanCalculator();
        info.openrocket.core.logging.WarningSet warnings =
                new info.openrocket.core.logging.WarningSet();

        double[] machs = { 0.1, 0.3, 0.5, 0.8, 0.95, 1.05, 1.5, 2.0 };
        double[] aoasDeg = { 0, 2, 5, 15 };

        for (double mach : machs) {
            for (double aoaDeg : aoasDeg) {
                info.openrocket.core.aerodynamics.FlightConditions conditions =
                        new info.openrocket.core.aerodynamics.FlightConditions(config);
                conditions.setMach(mach);
                conditions.setAOA(Math.toRadians(aoaDeg));

                warnings.clear();
                CoordinateIF cp = calc.getCP(config, conditions, warnings);
                info.openrocket.core.aerodynamics.AerodynamicForces forces =
                        calc.getAerodynamicForces(config, conditions, warnings);

                line("aero.cp", mach, aoaDeg, cp.getX(), cp.getWeight());
                line("aero.forces", mach, aoaDeg,
                        forces.getCN(), forces.getCm(), forces.getCD(),
                        forces.getCDaxial(), forces.getPressureCD(),
                        forces.getBaseCD(), forces.getFrictionCD());
            }
        }
        line("aero.warnings", warnings.size());

        for (double m : machs) {
            line("aero.staticCD", m,
                    info.openrocket.core.aerodynamics.BarrowmanCalculator.calculateStagnationCD(m),
                    info.openrocket.core.aerodynamics.BarrowmanCalculator.calculateBaseCD(m));
        }
    }

    private static Rocket buildReferenceRocket() {
        Rocket rocket = new Rocket();
        AxialStage stage = new AxialStage();
        rocket.addChild(stage);

        NoseCone nose = new NoseCone(Transition.Shape.OGIVE, 0.07, 0.012);
        nose.setThickness(0.002);
        stage.addChild(nose);

        BodyTube body = new BodyTube(0.30, 0.012, 0.0003);
        body.setMaterial(Material.newMaterial(Material.Type.BULK, "Kraft phenolic", 950, false));
        stage.addChild(body);

        TrapezoidFinSet fins = new TrapezoidFinSet(3, 0.05, 0.03, 0.02, 0.03);
        fins.setThickness(0.003);
        body.addChild(fins);

        InnerTube mount = new InnerTube();
        mount.setLength(0.07);
        mount.setOuterRadius(0.0095);
        mount.setThickness(0.0005);
        body.addChild(mount);

        Parachute chute = new Parachute();
        chute.setDiameter(0.30);
        body.addChild(chute);

        rocket.enableEvents();
        return rocket;
    }

    private static void massScenarios() {
        Rocket rocket = buildReferenceRocket();
        FlightConfiguration config = rocket.getSelectedConfiguration();

        // Forces TeaVM to link every bounds impl (it under-links impls reached only via map-key dispatch).
        int bi = 0;
        for (info.openrocket.core.rocketcomponent.RocketComponent c : config.getAllComponents()) {
            double boundsSize = c.getComponentBounds().size();
            double instBox = (c instanceof info.openrocket.core.rocketcomponent.BoxBounded)
                    ? ((info.openrocket.core.rocketcomponent.BoxBounded) c).getInstanceBoundingBox().span().getX()
                    : -1;
            line("comp.bounds." + (bi++), boundsSize, instBox);
        }

        line("tree.counts", rocket.getChildCount(), config.getAllComponents().size(),
                config.getActiveComponents().size(), config.getActiveStages().size(),
                config.getStageCount(), config.getActiveInstances().size());

        // Indexed tag, not getSimpleName(): TeaVM strips class name metadata.
        int ci = 0;
        for (info.openrocket.core.rocketcomponent.RocketComponent c : config.getAllComponents()) {
            line("comp.mass." + (ci++), c.getMass(), c.getLength());
        }

        java.util.List<Integer> ctxCounts = new java.util.ArrayList<>();
        for (java.util.ArrayList<info.openrocket.core.rocketcomponent.InstanceContext> v
                : config.getActiveInstances().values()) {
            ctxCounts.add(v.size());
        }
        java.util.Collections.sort(ctxCounts);
        double[] sortedCounts = new double[ctxCounts.size()];
        for (int i = 0; i < ctxCounts.size(); i++) {
            sortedCounts[i] = ctxCounts.get(i);
        }
        line("tree.ctx.sorted", sortedCounts);

        TrapezoidFinSet finProbe = null;
        for (info.openrocket.core.rocketcomponent.RocketComponent c : config.getAllComponents()) {
            if (c instanceof TrapezoidFinSet) {
                finProbe = (TrapezoidFinSet) c;
            }
        }
        line("fins.instances", finProbe.getFinCount(), finProbe.getInstanceCount(),
                finProbe.getInstanceAngles().length, finProbe.getInstanceOffsets().length);

        info.openrocket.core.rocketcomponent.RocketComponent rcRef = finProbe;
        line("fins.virtual", rcRef.getInstanceCount(), rcRef.getInstanceAngles().length);

        // InstanceMap extends LinkedHashMap where upstream uses ConcurrentHashMap (see patches/LEDGER.md).
        info.openrocket.core.rocketcomponent.InstanceMap im =
                new info.openrocket.core.rocketcomponent.InstanceMap();
        im.emplace(finProbe, 0, info.openrocket.core.util.Transformation.IDENTITY);
        im.emplace(finProbe, 1, info.openrocket.core.util.Transformation.IDENTITY);
        im.emplace(finProbe, 2, info.openrocket.core.util.Transformation.IDENTITY);
        line("im.count", im.count(finProbe), im.size());

        line("fins.ctx.before", config.getActiveInstances().count(finProbe));
        finProbe.setFinCount(4);
        line("fins.ctx.after4", config.getActiveInstances().count(finProbe));
        finProbe.setFinCount(3);
        line("fins.ctx.after3", config.getActiveInstances().count(finProbe));

        RigidBody structure = MassCalculator.calculateStructure(config);
        line("mass.structure", structure.getMass(),
                structure.getCM().getX(),structure.getCM().getY(),structure.getCM().getZ(),
                structure.getIxx(), structure.getIyy(), structure.getIzz(),
                structure.getLongitudinalInertia(), structure.getRotationalInertia());

        RigidBody burnout = MassCalculator.calculateBurnout(config);
        line("mass.burnout", burnout.getMass(),
                burnout.getCM().getX(),burnout.getCM().getY(),burnout.getCM().getZ(),
                burnout.getLongitudinalInertia(), burnout.getRotationalInertia());

        line("rocket.length", rocket.getLength());
    }

    private static void atmosphereScenarios() {
        ExtendedISAModel std = new ExtendedISAModel();
        double[] alts = { -100, 0, 1, 250, 499, 500, 501, 1234.56, 5000, 10999, 11000,
                11001, 15000, 20000, 32000, 47000, 51000, 71000, 84852, 90000 };
        for (double alt : alts) {
            AtmosphericConditions c = std.getConditions(alt);
            line("isa.std", alt, c.getTemperature(), c.getPressure(), c.getDensity(),
                    c.getMachSpeed(), c.getKinematicViscosity());
        }
        ExtendedISAModel site = new ExtendedISAModel(1400, 285.15, 86000,
                ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY);
        for (double alt : new double[] { 0, 1400, 1401, 3000, 11000, 20000 }) {
            AtmosphericConditions c = site.getConditions(alt);
            line("isa.site1400", alt, c.getTemperature(), c.getPressure(), c.getDensity());
        }
    }

    private static void quaternionScenarios() {
        double[][] rotVecs = {
                { Math.PI / 2, 0, 0 }, { 0, Math.PI / 2, 0 }, { 0, 0, Math.PI / 2 },
                { 0.1, -0.2, 0.3 }, { 1e-9, 0, 0 }, { Math.PI, Math.PI / 3, -Math.PI / 5 },
        };
        Coordinate[] vecs = {
                new Coordinate(1, 0, 0), new Coordinate(0, 1, 0), new Coordinate(0, 0, 1),
                new Coordinate(1.5, -2.5, 3.5),
        };
        for (double[] rv : rotVecs) {
            Quaternion q = Quaternion.rotation(new Coordinate(rv[0], rv[1], rv[2]));
            for (Coordinate v : vecs) {
                CoordinateIF r = q.rotate(v);
                line("quat.rot", rv[0], rv[1], rv[2], v.x, v.y, v.z, r.getX(), r.getY(), r.getZ());
            }
        }
    }

    private static void line(String tag, double... values) {
        StringBuilder sb = new StringBuilder(tag);
        for (double v : values) {
            sb.append('|').append(v);
        }
        System.out.println(sb);
    }

    private ParityMain() {}
}
