package api;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.teavm.jso.JSExport;

import info.openrocket.core.aerodynamics.AerodynamicForces;
import info.openrocket.core.aerodynamics.BarrowmanCalculator;
import info.openrocket.core.aerodynamics.RASAeroStabilityCalculator;
import info.openrocket.core.aerodynamics.RASAeroDragCalculator;
import info.openrocket.core.aerodynamics.FlightConditions;
import info.openrocket.core.unit.CaliberUnit;
import info.openrocket.core.unit.PercentageOfLengthUnit;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.logging.WarningSet;
import info.openrocket.core.masscalc.MassCalculator;
import info.openrocket.core.masscalc.RigidBody;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.models.gravity.ConstantGravityModel;
import info.openrocket.core.models.gravity.WGSGravityModel;
import info.openrocket.core.models.wind.PinkNoiseWindModel;
import info.openrocket.core.models.wind.MultiLevelPinkNoiseWindModel;
import info.openrocket.core.models.wind.WindModel;
import info.openrocket.core.motor.IgnitionEvent;
import info.openrocket.core.motor.Manufacturer;
import info.openrocket.core.motor.Motor;
import info.openrocket.core.motor.MotorConfiguration;
import info.openrocket.core.motor.ThrustCurveMotor;
import info.openrocket.core.rocketcomponent.AxialStage;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.ComponentAssembly;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.FlightConfigurationId;
import info.openrocket.core.rocketcomponent.InnerTube;
import info.openrocket.core.rocketcomponent.MassObject;
import info.openrocket.core.rocketcomponent.MotorMount;
import info.openrocket.core.rocketcomponent.NoseCone;
import info.openrocket.core.rocketcomponent.Parachute;
import info.openrocket.core.rocketcomponent.ShockCord;
import info.openrocket.core.rocketcomponent.Rocket;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.rocketcomponent.StageSeparationConfiguration;
import info.openrocket.core.rocketcomponent.Transition;
import info.openrocket.core.rocketcomponent.TrapezoidFinSet;
import info.openrocket.core.simulation.BasicEventSimulationEngine;
import info.openrocket.core.simulation.FlightData;
import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.simulation.FlightEvent;
import info.openrocket.core.simulation.SimulationConditions;
import info.openrocket.core.simulation.SimulationStepperMethod;
import info.openrocket.core.simulation.exception.SimulationException;
import info.openrocket.core.material.Material;
import info.openrocket.core.util.Coordinate;
import info.openrocket.core.utils.MotorCorrelation;
import info.openrocket.core.util.CoordinateIF;
import info.openrocket.core.util.GeodeticComputationStrategy;
import info.openrocket.core.util.WorldCoordinate;

/** All values SI, angles in radians, except launchLatitude/launchLongitude and getAeroSweep's aoaDeg (degrees). */
public final class OpenRocketEngine {

    private static final int MAX_SWEEP_POINTS = 20000;

    private static final Map<Integer, Object> HANDLES = new HashMap<>();
    private static int nextHandle = 1;

    private OpenRocketEngine() {}

    /** Intentionally empty: as TeaVM mainClass it keeps the @JSExport statics alive. */
    public static void main(String[] args) {
    }

    /** Used only by test/parity/parity.mjs. */
    @JSExport
    public static void runParity() {
        parity.ParityMain.main(new String[0]);
    }

    private static int register(Object o) {
        // Never wraps: a wrapped counter would hand out an id still in use.
        if (nextHandle == Integer.MAX_VALUE) {
            throw new IllegalStateException("handle ids exhausted; reload the engine");
        }
        int h = nextHandle++;
        HANDLES.put(h, o);
        return h;
    }

    @JSExport
    public static void free(int handle) {
        if (HANDLES.remove(handle) == null) {
            throw new IllegalArgumentException("Unknown handle " + handle);
        }
    }

    private static boolean isFinite(double v) {
        return !Double.isNaN(v) && !Double.isInfinite(v);
    }

    // Unchecked, a NaN length surfaces as `Error: null` and a negative radius builds a massless part.
    private static double finiteArg(String what, double v) {
        if (!isFinite(v) || Math.abs(v) > ComponentFactory.MAX_MAGNITUDE) {
            throw new IllegalArgumentException(what + " must be a finite number within +/-"
                    + ComponentFactory.MAX_MAGNITUDE + " (got " + v + ")");
        }
        return v;
    }

    private static double positiveArg(String what, double v) {
        if (!(finiteArg(what, v) > 0)) {
            throw new IllegalArgumentException(what + " must be greater than 0 (got " + v + ")");
        }
        return v;
    }

    private static double nonNegativeArg(String what, double v) {
        if (finiteArg(what, v) < 0) {
            throw new IllegalArgumentException(what + " must not be negative (got " + v + ")");
        }
        return v;
    }

    /**
     * Not a safety net on WASM-GC: a wasm trap (e.g. stack overflow) unwinds out of the module,
     * so caller input must be bounded at the boundary (tested by engineBoundary.wasm.test.ts).
     */
    private static String errorJson(Throwable e) {
        String msg = e.getMessage();
        if (msg == null || msg.isEmpty()) {
            msg = e.getClass().getSimpleName();
        }
        return "{\"error\":\"" + escape(msg) + "\"}";
    }

    private static Object get(int handle) {
        Object o = HANDLES.get(handle);
        if (o == null) {
            throw new IllegalArgumentException("Unknown handle: " + handle);
        }
        return o;
    }

    /** Checked, not cast: TeaVM at optimization NONE elides the checkcast. */
    private static <T> T get(int handle, Class<T> kind, String what) {
        Object o = get(handle);
        if (!kind.isInstance(o)) {
            throw new IllegalArgumentException("Handle " + handle + " is not " + what
                    + " (it is a " + o.getClass().getSimpleName() + ")");
        }
        return kind.cast(o);
    }

    public static Rocket getRocketForTesting(int rocketHandle) {
        return get(rocketHandle, RocketCtx.class, "a rocket").rocket;
    }

    @JSExport
    public static void reset() {
        // Do not rewind the counter: a stale handle would silently resolve to the new rocket.
        HANDLES.clear();
    }


    @JSExport
    public static int newRocket() {
        Rocket rocket = new Rocket();
        AxialStage stage = new AxialStage();
        rocket.addChild(stage);
        FlightConfigurationId fcid = new FlightConfigurationId();
        rocket.createFlightConfiguration(fcid);
        rocket.setSelectedConfiguration(fcid);
        rocket.enableEvents();
        return register(new RocketCtx(rocket, stage, fcid));
    }

    /** Stage 0 is the sustainer, as on the desktop. */
    @JSExport
    public static int buildRocket(String treeJson) {
        Map<String, Object> tree = JsonLite.parseObject(treeJson);
        Rocket rocket = new Rocket();
        String name = JsonLite.str(tree, "name", null);
        if (name != null) {
            rocket.setName(name);
        }

        Object comps = tree.get("components");
        // Present but not a list is an error: coerced, it would report a healthy all-zero rocket.
        if (comps != null && !(comps instanceof List)) {
            throw new IllegalArgumentException("'components' must be a list, got "
                    + comps.getClass().getSimpleName());
        }
        List<?> topLevel = comps instanceof List ? (List<?>) comps : java.util.Collections.emptyList();
        // Before any kernel work: the size check is what keeps a crafted file from stalling the build.
        Map<String, Object> whole = new java.util.LinkedHashMap<>();
        whole.put("children", topLevel);
        ComponentFactory.checkSize(whole);
        boolean staged = false;
        for (Object o : topLevel) {
            if (o instanceof Map && "stage".equals(((Map<?, ?>) o).get("type"))) {
                staged = true;
                break;
            }
        }

        Map<String, RocketComponent> ids = new HashMap<>();
        Map<AxialStage, Double> nozzleDia = new HashMap<>();
        AxialStage firstStage = null;
        if (staged) {
            for (Object o : topLevel) {
                if (!(o instanceof Map) || !"stage".equals(((Map<?, ?>) o).get("type"))) {
                    throw new IllegalArgumentException(
                            "Top level mixes stage and component nodes: with stages, EVERY top-level node must be a stage");
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> stageNode = (Map<String, Object>) o;
                AxialStage stage = new AxialStage();
                String stageName = JsonLite.str(stageNode, "name", null);
                if (stageName != null) {
                    stage.setName(stageName);
                }
                rocket.addChild(stage);
                if (firstStage == null) {
                    firstStage = stage;
                }
                String stageId = JsonLite.str(stageNode, "id", null);
                if (stageId != null) {
                    ids.put(stageId, stage);
                }
                applySeparationConfig(stage, stageNode, nozzleDia);
                ComponentFactory.attachChildren(stage, stageNode, ids, nozzleDia);
                ComponentFactory.applyOverrides(stage, stageNode);
            }
            if (firstStage == null) {
                throw new IllegalArgumentException("Staged rocket has no stages");
            }
        } else {
            firstStage = new AxialStage();
            rocket.addChild(firstStage);
        }

        FlightConfigurationId fcid = new FlightConfigurationId();
        rocket.createFlightConfiguration(fcid);
        rocket.setSelectedConfiguration(fcid);

        RocketCtx ctx = new RocketCtx(rocket, firstStage, fcid);
        ctx.ids.putAll(ids);
        ctx.nozzleDia.putAll(nozzleDia);
        if (!staged) {
            Map<String, Object> stageNode = new java.util.LinkedHashMap<>();
            stageNode.put("children", tree.get("components"));
            ComponentFactory.attachChildren(firstStage, stageNode, ctx.ids, ctx.nozzleDia);
        }

        rocket.enableEvents();
        settleAutoRadii(rocket);
        // Must follow enableEvents: only then do middle/bottom fin sets sit at their true station.
        if (staged) {
            for (Object o : topLevel) {
                @SuppressWarnings("unchecked")
                Map<String, Object> stageNode = (Map<String, Object>) o;
                ComponentFactory.settleFlippedShoulders(stageNode, ctx.ids);
                ComponentFactory.settleFinTabs(stageNode, ctx.ids);
            }
        } else {
            Map<String, Object> rootNode = new java.util.LinkedHashMap<>();
            rootNode.put("children", tree.get("components"));
            ComponentFactory.settleFlippedShoulders(rootNode, ctx.ids);
            ComponentFactory.settleFinTabs(rootNode, ctx.ids);
        }
        return register(ctx);
    }

    static void applySeparationConfig(AxialStage stage, Map<String, Object> stageNode,
            Map<AxialStage, Double> nozzleDia) {
        // Nozzle exit diameter (m) is per motor upstream; it is applied in applyMotor.
        double nozzleExitDiameter = JsonLite.dbl(stageNode, "nozzleExitDiameter", Double.NaN);
        if (!Double.isNaN(nozzleExitDiameter) && nozzleExitDiameter > 0) {
            nozzleDia.put(stage, nozzleExitDiameter);
        }

        String event = JsonLite.str(stageNode, "separationEvent", null);
        double delay = JsonLite.dbl(stageNode, "separationDelay", Double.NaN);
        double altitude = JsonLite.dbl(stageNode, "separationAltitude", Double.NaN);
        if (event == null && Double.isNaN(delay) && Double.isNaN(altitude)) {
            return;
        }
        // NaN means absent; an infinity would land in the event time.
        if (!Double.isNaN(delay) && !isFinite(delay)) {
            throw new IllegalArgumentException("separationDelay must be finite (got " + delay + ")");
        }
        StageSeparationConfiguration sep = new StageSeparationConfiguration();
        if (event != null) {
            sep.setSeparationEvent(separationEventOf(event));
        }
        if (!Double.isNaN(delay)) {
            sep.setSeparationDelay(delay);
        }
        if (!Double.isNaN(altitude)) {
            sep.setSeparationAltitude(altitude);
        }
        // Default, not per-fcid: the flight configuration is created after the stages.
        stage.getSeparationConfigurations().setDefault(sep);
    }

    private static StageSeparationConfiguration.SeparationEvent separationEventOf(String name) {
        switch (name.toLowerCase().replace("_", "")) {
            case "launch": return StageSeparationConfiguration.SeparationEvent.LAUNCH;
            case "ignition": return StageSeparationConfiguration.SeparationEvent.IGNITION;
            case "burnout": return StageSeparationConfiguration.SeparationEvent.BURNOUT;
            case "ejection": return StageSeparationConfiguration.SeparationEvent.EJECTION;
            case "upperignition": return StageSeparationConfiguration.SeparationEvent.UPPER_IGNITION;
            case "altitudeascending": return StageSeparationConfiguration.SeparationEvent.ALTITUDE_ASCENDING;
            case "apogee": return StageSeparationConfiguration.SeparationEvent.APOGEE;
            case "altitudedescending": return StageSeparationConfiguration.SeparationEvent.ALTITUDE_DESCENDING;
            case "never": return StageSeparationConfiguration.SeparationEvent.NEVER;
            default:
                throw new IllegalArgumentException("Unknown separation event: " + name);
        }
    }

    @JSExport
    public static void setMotorById(int rocketHandle, String componentId, String designation,
            double diameter, double length, double[] times, double[] thrusts,
            double[] masses, double cgX, double ejectionDelay) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        RocketComponent comp = ctx.ids.get(componentId);
        if (!(comp instanceof MotorMount)) {
            throw new IllegalArgumentException(
                    "Component id '" + componentId + "' is not a motor mount");
        }
        applyMotor(ctx, (MotorMount) comp, designation, diameter, length,
                times, thrusts, masses, cgX, ejectionDelay);
    }

    @JSExport
    public static int addNoseCone(int rocketHandle, double length, double aftRadius,
            double thickness, String shape, double materialDensity) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        if (shape == null) throw new IllegalArgumentException("addNoseCone: shape is required");
        positiveArg("addNoseCone length", length);
        positiveArg("addNoseCone aftRadius", aftRadius);
        nonNegativeArg("addNoseCone thickness", thickness);
        finiteArg("addNoseCone materialDensity", materialDensity);
        NoseCone nose = new NoseCone(ComponentFactory.shapeOf(shape), length, aftRadius);
        nose.setThickness(thickness);
        setBulkMaterial(nose, materialDensity);
        ctx.stage.addChild(nose);
        return register(nose);
    }

    @JSExport
    public static int addBodyTube(int rocketHandle, double length, double outerRadius,
            double thickness, double materialDensity) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        positiveArg("addBodyTube length", length);
        positiveArg("addBodyTube outerRadius", outerRadius);
        nonNegativeArg("addBodyTube thickness", thickness);
        finiteArg("addBodyTube materialDensity", materialDensity);
        BodyTube tube = new BodyTube(length, outerRadius, thickness);
        setBulkMaterial(tube, materialDensity);
        ctx.stage.addChild(tube);
        return register(tube);
    }

    @JSExport
    public static int addTrapezoidFins(int parentHandle, int finCount, double rootChord,
            double tipChord, double sweep, double height, double thickness, double materialDensity) {
        RocketComponent parent = get(parentHandle, RocketComponent.class, "a component");
        if (finCount < 1 || finCount > ComponentFactory.MAX_FIN_COUNT) {
            throw new IllegalArgumentException("addTrapezoidFins finCount must be a whole number in 1.."
                    + ComponentFactory.MAX_FIN_COUNT + " (got " + finCount + ")");
        }
        positiveArg("addTrapezoidFins rootChord", rootChord);
        nonNegativeArg("addTrapezoidFins tipChord", tipChord);
        finiteArg("addTrapezoidFins sweep", sweep);
        positiveArg("addTrapezoidFins height", height);
        nonNegativeArg("addTrapezoidFins thickness", thickness);
        finiteArg("addTrapezoidFins materialDensity", materialDensity);
        TrapezoidFinSet fins = new TrapezoidFinSet(finCount, rootChord, tipChord, sweep, height);
        fins.setThickness(thickness);
        setBulkMaterial(fins, materialDensity);
        parent.addChild(fins);
        return register(fins);
    }

    @JSExport
    public static int addInnerTube(int parentHandle, double length, double outerRadius,
            double thickness, double materialDensity) {
        RocketComponent parent = get(parentHandle, RocketComponent.class, "a component");
        positiveArg("addInnerTube length", length);
        positiveArg("addInnerTube outerRadius", outerRadius);
        nonNegativeArg("addInnerTube thickness", thickness);
        finiteArg("addInnerTube materialDensity", materialDensity);
        InnerTube tube = new InnerTube();
        tube.setLength(length);
        tube.setOuterRadius(outerRadius);
        tube.setThickness(thickness);
        setBulkMaterial(tube, materialDensity);
        parent.addChild(tube);
        tube.setMotorMount(true);
        return register(tube);
    }

    @JSExport
    public static int addParachute(int parentHandle, double diameter, double dragCoefficient) {
        RocketComponent parent = get(parentHandle, RocketComponent.class, "a component");
        positiveArg("addParachute diameter", diameter);
        finiteArg("addParachute dragCoefficient", dragCoefficient);
        Parachute chute = new Parachute();
        chute.setDiameter(diameter);
        if (dragCoefficient > 0) {
            chute.setCD(dragCoefficient);
        }
        parent.addChild(chute);
        return register(chute);
    }


    /** cgX is a constant CG, m from the motor's nose. */
    @JSExport
    public static void setMotor(int rocketHandle, int mountHandle, String designation,
            double diameter, double length, double[] times, double[] thrusts,
            double[] masses, double cgX, double ejectionDelay) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        MotorMount mount = get(mountHandle, MotorMount.class, "a motor mount");
        applyMotor(ctx, mount, designation, diameter, length,
                times, thrusts, masses, cgX, ejectionDelay);
    }

    private static void applyMotor(RocketCtx ctx, MotorMount mount, String designation,
            double diameter, double length, double[] times, double[] thrusts,
            double[] masses, double cgX, double ejectionDelay) {
        // A short masses array would otherwise throw out of TeaVM with no envelope.
        if (times == null || thrusts == null || masses == null) {
            throw new IllegalArgumentException("motor " + designation + ": times/thrusts/masses are required");
        }
        if (times.length < 2 || thrusts.length != times.length || masses.length != times.length) {
            throw new IllegalArgumentException("motor " + designation + ": times/thrusts/masses must be the same"
                    + " length and at least 2 (got " + times.length + "/" + thrusts.length + "/" + masses.length + ")");
        }
        if (!(diameter > 0) || !(length > 0) || !isFinite(cgX)) {
            throw new IllegalArgumentException("motor " + designation + ": diameter/length must be > 0 and cgX finite");
        }
        for (int i = 0; i < times.length; i++) {
            if (!isFinite(times[i]) || !isFinite(thrusts[i]) || !isFinite(masses[i]) || masses[i] < 0) {
                throw new IllegalArgumentException("motor " + designation + ": non-finite or negative sample at " + i);
            }
            if (i > 0 && times[i] < times[i - 1]) {
                throw new IllegalArgumentException("motor " + designation + ": times must be non-decreasing at " + i);
            }
        }
        Coordinate[] cgPoints = new Coordinate[times.length];
        for (int i = 0; i < times.length; i++) {
            cgPoints[i] = new Coordinate(cgX, 0, 0, masses[i]);
        }
        ThrustCurveMotor motor = new ThrustCurveMotor.Builder()
                .setManufacturer(Manufacturer.getManufacturer("custom"))
                .setDesignation(designation)
                .setCommonName(designation)
                .setMotorType(Motor.Type.SINGLE)
                .setStandardDelays(new double[] { ejectionDelay })
                .setDiameter(diameter)
                .setLength(length)
                .setTimePoints(times)
                .setThrustPoints(thrusts)
                .setCGPoints(cgPoints)
                .setDigest("api-" + designation)
                .build();

        MotorConfiguration mc = new MotorConfiguration(mount, ctx.fcid);
        mc.setMotor(motor);
        mc.setEjectionDelay(ejectionDelay);
        // Upstream rejects a nozzle wider than the motor, so clamp rather than throw.
        Double nozzle = ctx.nozzleDia.get(((RocketComponent) mount).getStage());
        if (nozzle != null && nozzle > 0) {
            mc.setNozzleExitDiameter(Math.min(nozzle, diameter));
        }
        mount.setMotorConfig(mc, ctx.fcid);
        // setMotorConfig leaves the active-motor list stale; without this on-pad CG ignores the motor.
        ctx.rocket.getSelectedConfiguration().update();
    }

    /** Call after setMotorById. */
    @JSExport
    public static void setMotorIgnitionById(int rocketHandle, String componentId,
            String ignitionEvent, double ignitionDelay) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        RocketComponent comp = ctx.ids.get(componentId);
        if (!(comp instanceof MotorMount)) {
            throw new IllegalArgumentException(
                    "Component id '" + componentId + "' is not a motor mount");
        }
        MotorConfiguration mc = ((MotorMount) comp).getMotorConfig(ctx.fcid);
        if (mc == null || mc.getMotor() == null) {
            throw new IllegalArgumentException(
                    "No motor loaded on mount '" + componentId + "'; call setMotorById first");
        }
        if (!isFinite(ignitionDelay)) {
            throw new IllegalArgumentException("ignitionDelay must be finite (got " + ignitionDelay + ")");
        }
        mc.setIgnitionEvent(ignitionEventOf(ignitionEvent));
        mc.setIgnitionDelay(ignitionDelay);
    }

    static IgnitionEvent ignitionEventOf(String name) {
        switch (name.toLowerCase().replace("_", "")) {
            case "automatic": return IgnitionEvent.AUTOMATIC;
            case "launch": return IgnitionEvent.LAUNCH;
            case "ejectioncharge": return IgnitionEvent.EJECTION_CHARGE;
            case "burnout": return IgnitionEvent.BURNOUT;
            case "never": return IgnitionEvent.NEVER;
            default:
                throw new IllegalArgumentException("Unknown ignition event: " + name);
        }
    }

    /** By id, not stage number: a nested parallel booster shifts the numbers after it. */
    @JSExport
    public static void setStageActiveById(int rocketHandle, String componentId, boolean active) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        RocketComponent comp = ctx.ids.get(componentId);
        if (!(comp instanceof AxialStage)) {
            throw new IllegalArgumentException(
                    "Component id '" + componentId + "' is not a stage");
        }
        FlightConfiguration config = ctx.rocket.getSelectedConfiguration();
        config._setStageActive(((AxialStage) comp).getStageNumber(), active);
        config.update();
    }


    @JSExport
    public static void setRogersModifiedBarrowman(int rocketHandle, boolean enabled) {
        get(rocketHandle, RocketCtx.class, "a rocket").rogersKbf = enabled;
    }

    @JSExport
    public static void setStubbyNoseDrag(int rocketHandle, boolean enabled) {
        get(rocketHandle, RocketCtx.class, "a rocket").stubbyNoseFloor = enabled;
    }

    @JSExport
    public static void setSupersonicAero(int rocketHandle, boolean enabled) {
        get(rocketHandle, RocketCtx.class, "a rocket").supersonicAero = enabled;
    }

    /** Shared by getStaticInfo, getAeroSweep and simulateJson so they agree. */
    private static BarrowmanCalculator rasAeroCalculator(RocketCtx ctx) {
        RASAeroStabilityCalculator stab = new RASAeroStabilityCalculator();
        stab.setSupersonicAero(ctx.supersonicAero);
        stab.setRogersKbf(ctx.rogersKbf);
        RASAeroDragCalculator drag = new RASAeroDragCalculator();
        drag.setSupersonicAero(ctx.supersonicAero);
        drag.setRogersKbf(ctx.rogersKbf);
        drag.setStubbyNoseFloor(ctx.stubbyNoseFloor);
        return new BarrowmanCalculator(stab, drag);
    }

    @JSExport
    public static String getStaticInfo(int rocketHandle) {
        try {
            return getStaticInfoImpl(rocketHandle);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static String getStaticInfoImpl(int rocketHandle) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        RigidBody structure = MassCalculator.calculateLaunch(ctx.rocket.getSelectedConfiguration());
        RigidBody empty = MassCalculator.calculateStructure(ctx.rocket.getSelectedConfiguration());

        BarrowmanCalculator calc = rasAeroCalculator(ctx);
        FlightConditions conditions = new FlightConditions(ctx.rocket.getSelectedConfiguration());
        conditions.setMach(0.3);
        conditions.setAOA(0);
        WarningSet warnings = new WarningSet();
        CoordinateIF cp = calc.getCP(ctx.rocket.getSelectedConfiguration(), conditions, warnings);
        // getCP does not raise the geometry warnings; upstream's UI calls both.
        calc.checkGeometry(ctx.rocket.getSelectedConfiguration(), ctx.rocket, warnings);

        double refDiameter = conditions.getRefLength(); // a diameter, despite the name
        double cg = structure.getCM().getX();

        // OpenRocket's unit classes, not our arithmetic: desktop divides by getLengthAerodynamic(), not getLength().
        FlightConfiguration config = ctx.rocket.getSelectedConfiguration();
        // A NaN would serialize as null, which the app paints as a healthy empty rocket.
        requireFinite("length", ctx.rocket.getLength());
        requireFinite("mass", structure.getMass());
        double margin = cp.getX() - cg;
        double stabilityCal = new CaliberUnit(config).toUnit(margin);
        double stabilityPct = new PercentageOfLengthUnit(config).toUnit(margin);

        StringBuilder sb = new StringBuilder("{");
        num(sb, "length", ctx.rocket.getLength()).append(',');
        num(sb, "lengthAerodynamic", config.getLengthAerodynamic()).append(',');
        num(sb, "stabilityPercent", stabilityPct).append(',');
        num(sb, "mass", structure.getMass()).append(',');
        num(sb, "massEmpty", empty.getMass()).append(',');
        num(sb, "cgEmpty", empty.getCM().getX()).append(',');
        num(sb, "cg", cg).append(',');
        num(sb, "cp", cp.getX()).append(',');
        num(sb, "cna", cp.getWeight()).append(',');
        num(sb, "stabilityCalibers", stabilityCal).append(',');
        num(sb, "refDiameter", refDiameter).append(',');
        num(sb, "rollInertia", structure.getRotationalInertia()).append(',');
        num(sb, "pitchInertia", structure.getLongitudinalInertia()).append(',');
        num(sb, "warnings", warnings.size()).append(',');
        sb.append("\"warningTexts\":[");
        boolean first = true;
        for (info.openrocket.core.logging.Warning w : warnings) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(escape(String.valueOf(w))).append('"');
        }
        sb.append(']');
        return sb.append('}').toString();
    }

    /**
     * As `RockSimSaver.setStageOverrides`: each of the first three stages weighed alone, and the CG of the stack
     * from the sustainer through it, in configurations of their own. Toggling the selected configuration instead
     * changes the rocket's length, and with it an automatic shock cord's length and mass.
     */
    @JSExport
    public static String getRockSimStageFigures(int rocketHandle) {
        try {
            Rocket rocket = get(rocketHandle, RocketCtx.class, "a rocket").rocket;
            StringBuilder sb = new StringBuilder("{\"stages\":[");
            FlightConfiguration stack = new FlightConfiguration(rocket);
            stack.clearAllStages();
            int done = 0;
            for (RocketComponent child : rocket.getChildren()) {
                if (!(child instanceof AxialStage) || done == 3) continue;
                int stageNumber = ((AxialStage) child).getStageNumber();
                FlightConfiguration single = new FlightConfiguration(rocket);
                single.clearAllStages();
                single._setStageActive(stageNumber, true);
                stack._setStageActive(stageNumber, true);
                if (done++ > 0) sb.append(',');
                sb.append('{');
                num(sb, "mass", MassCalculator.calculateStructure(single).getMass()).append(',');
                num(sb, "stackCg", MassCalculator.calculateStructure(stack).getCM().getX());
                sb.append('}');
            }
            return sb.append("]}").toString();
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    /** cgX is from the component's own front; positionX is from the nose. */
    @JSExport
    public static String getComponentInfo(int rocketHandle, String componentId) {
        try {
            return getComponentInfoImpl(rocketHandle, componentId);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static String getComponentInfoImpl(int rocketHandle, String componentId) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        RocketComponent c = ctx.ids.get(componentId);
        if (c == null) {
            throw new IllegalArgumentException("Unknown component id: '" + componentId + "'");
        }
        // Only getRadius() settles an auto radius and the length that follows it.
        if (c instanceof MassObject) {
            ((MassObject) c).getRadius();
        }
        CoordinateIF[] locations = c.getComponentLocations();
        double absX = locations.length > 0 ? locations[0].getX() : Double.NaN;
        StringBuilder sb = new StringBuilder("{");
        num(sb, "length", c.getLength()).append(',');
        num(sb, "mass", c.getMass()).append(',');
        num(sb, "sectionMass", c.getSectionMass()).append(',');
        num(sb, "cgX", c.getCG().getX()).append(',');
        num(sb, "positionX", absX);
        if (c instanceof ShockCord) {
            sb.append(',');
            num(sb, "cordLength", ((ShockCord) c).getCordLength());
        } else if (c instanceof Parachute) {
            sb.append(',');
            num(sb, "lineLength", ((Parachute) c).getLineLength());
        }
        if (c instanceof info.openrocket.core.rocketcomponent.RecoveryDevice) {
            sb.append(',');
            num(sb, "cd", ((info.openrocket.core.rocketcomponent.RecoveryDevice) c).getCD());
        }
        return sb.append('}').toString();
    }

    @JSExport
    public static String getComponentFields(int rocketHandle, String componentId) {
        try {
            RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
            RocketComponent c = ctx.ids.get(componentId);
            if (c == null) {
                throw new IllegalArgumentException("Unknown component id: '" + componentId + "'");
            }
            return ComponentFields.of(c);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    /** Through the kernel setter, as desktop does: a shoulder grown from 0 is seeded from its neighbor. */
    @JSExport
    public static String setShoulderLength(int rocketHandle, String componentId, String side, double length) {
        try {
            RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
            RocketComponent c = ctx.ids.get(componentId);
            if (c instanceof NoseCone && side.isEmpty()) {
                ((NoseCone) c).setShoulderLength(length);
            } else if (c instanceof Transition && !(c instanceof NoseCone) && "fore".equals(side)) {
                ((Transition) c).setForeShoulderLength(length);
            } else if (c instanceof Transition && !(c instanceof NoseCone) && "aft".equals(side)) {
                ((Transition) c).setAftShoulderLength(length);
            } else {
                throw new IllegalArgumentException("No '" + side + "' shoulder on component id: '" + componentId + "'");
            }
            return ComponentFields.of(c);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    /**
     * Auto tubes remember their last sizing neighbor, so it can take one pass per symmetric part plus one.
     * Stops at the first pass that moves no radius, as the app's resolver does.
     */
    private static void settleAutoRadii(Rocket rocket) {
        List<info.openrocket.core.rocketcomponent.SymmetricComponent> parts = new ArrayList<>();
        for (RocketComponent c : rocket) {
            if (c instanceof info.openrocket.core.rocketcomponent.SymmetricComponent) {
                parts.add((info.openrocket.core.rocketcomponent.SymmetricComponent) c);
            }
        }
        double[] last = null;
        for (int pass = 0; pass <= parts.size(); pass++) {
            double[] radii = new double[parts.size() * 2];
            for (int i = 0; i < parts.size(); i++) {
                radii[2 * i] = parts.get(i).getForeRadius();
                radii[2 * i + 1] = parts.get(i).getAftRadius();
            }
            if (java.util.Arrays.equals(radii, last)) return;
            last = radii;
        }
    }

    private static final int PROFILE_SAMPLES = 11;

    @JSExport
    public static String getComponentGeometry(int rocketHandle, String componentId) {
        try {
            return getComponentGeometryImpl(rocketHandle, componentId);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static String getComponentGeometryImpl(int rocketHandle, String componentId) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        RocketComponent c = ctx.ids.get(componentId);
        if (c == null) {
            throw new IllegalArgumentException("Unknown component id: '" + componentId + "'");
        }
        StringBuilder sb = new StringBuilder("{");
        num(sb, "length", c.getLength());
        if (c instanceof info.openrocket.core.rocketcomponent.SymmetricComponent) {
            info.openrocket.core.rocketcomponent.SymmetricComponent s =
                    (info.openrocket.core.rocketcomponent.SymmetricComponent) c;
            sb.append(',');
            num(sb, "foreRadius", s.getForeRadius()).append(',');
            num(sb, "aftRadius", s.getAftRadius()).append(',');
            double[] outer = new double[PROFILE_SAMPLES];
            double[] inner = new double[PROFILE_SAMPLES];
            for (int i = 0; i < PROFILE_SAMPLES; i++) {
                double x = s.getLength() * i / (PROFILE_SAMPLES - 1);
                outer[i] = s.getRadius(x);
                inner[i] = s.getInnerRadius(x);
            }
            sb.append("\"profile\":");
            nums(sb, outer).append(",\"innerProfile\":");
            nums(sb, inner);
        }
        if (c instanceof BodyTube) {
            sb.append(',');
            num(sb, "outerRadius", ((BodyTube) c).getOuterRadius()).append(',');
            num(sb, "innerRadius", ((BodyTube) c).getInnerRadius());
        }
        if (c instanceof info.openrocket.core.rocketcomponent.RingComponent) {
            info.openrocket.core.rocketcomponent.RingComponent r =
                    (info.openrocket.core.rocketcomponent.RingComponent) c;
            sb.append(',');
            num(sb, "outerRadius", r.getOuterRadius()).append(',');
            num(sb, "innerRadius", r.getInnerRadius());
        }
        if (c instanceof info.openrocket.core.rocketcomponent.TubeFinSet) {
            info.openrocket.core.rocketcomponent.TubeFinSet t = (info.openrocket.core.rocketcomponent.TubeFinSet) c;
            sb.append(',');
            num(sb, "outerRadius", t.getOuterRadius()).append(',');
            num(sb, "innerRadius", t.getInnerRadius());
        }
        if (c instanceof info.openrocket.core.rocketcomponent.FinSet) {
            info.openrocket.core.rocketcomponent.FinSet f = (info.openrocket.core.rocketcomponent.FinSet) c;
            sb.append(',');
            num(sb, "maxTabHeight", f.getMaxTabHeight());
            // Fin frame: x from the fin front, y from the body surface there.
            sb.append(",\"finPoints\":");
            points(sb, f.getFinPoints());
            sb.append(",\"rootPoints\":");
            points(sb, f.getRootPoints());
            if (f.hasTab()) {
                sb.append(",\"tabPoints\":");
                points(sb, f.getTabPoints());
            }
        }
        if (c instanceof info.openrocket.core.rocketcomponent.InnerTube) {
            sb.append(",\"clusterPoints\":[");
            CoordinateIF[] offsets = c.getInstanceOffsets();
            for (int i = 0; i < offsets.length; i++) {
                if (i > 0) sb.append(',');
                nums(sb, new double[] { offsets[i].getY(), offsets[i].getZ() });
            }
            sb.append(']');
        }
        if (c instanceof info.openrocket.core.rocketcomponent.MassObject) {
            sb.append(',');
            num(sb, "radius", ((info.openrocket.core.rocketcomponent.MassObject) c).getRadius());
        }
        if (c instanceof info.openrocket.core.rocketcomponent.RailButton) {
            info.openrocket.core.rocketcomponent.RailButton b = (info.openrocket.core.rocketcomponent.RailButton) c;
            sb.append(',');
            num(sb, "outerDiameter", b.getOuterDiameter()).append(',');
            num(sb, "innerDiameter", b.getInnerDiameter()).append(',');
            num(sb, "totalHeight", b.getTotalHeight()).append(',');
            num(sb, "baseHeight", b.getBaseHeight()).append(',');
            num(sb, "flangeHeight", b.getFlangeHeight());
        }
        if (c instanceof ComponentAssembly
                && c instanceof info.openrocket.core.rocketcomponent.position.RadiusPositionable) {
            info.openrocket.core.rocketcomponent.position.RadiusPositionable p =
                    (info.openrocket.core.rocketcomponent.position.RadiusPositionable) c;
            sb.append(',');
            num(sb, "instanceRadius", p.getRadiusMethod().getRadius(c.getParent(), c, p.getRadiusOffset()));
        }
        return sb.append('}').toString();
    }

    /** Mirrors desktop MassCalculator.getCMAnalysis; kept out of getStaticInfo, which runs per keystroke. */
    @JSExport
    public static String getComponentMasses(int rocketHandle) {
        try {
            return getComponentMassesImpl(rocketHandle);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static String getComponentMassesImpl(int rocketHandle) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        java.util.Map<Integer, info.openrocket.core.masscalc.CMAnalysisEntry> analysis =
                info.openrocket.core.masscalc.MassCalculator.getCMAnalysis(
                        ctx.rocket.getSelectedConfiguration());

        // Map order differs per run and between JVM and TeaVM, so emit in tree order.
        java.util.Map<String, info.openrocket.core.masscalc.CMAnalysisEntry> byKey =
                new java.util.LinkedHashMap<>();
        java.util.List<info.openrocket.core.masscalc.CMAnalysisEntry> motorRows = new java.util.ArrayList<>();
        for (info.openrocket.core.masscalc.CMAnalysisEntry e : analysis.values()) {
            if (e.name == null) {
                continue;
            }
            if (e.source instanceof RocketComponent) {
                byKey.put(((RocketComponent) e.source).getID().toString(), e);
            } else {
                motorRows.add(e);
            }
        }
        java.util.List<info.openrocket.core.masscalc.CMAnalysisEntry> ordered = new java.util.ArrayList<>();
        java.util.Iterator<RocketComponent> walk = ctx.rocket.iterator(true);
        while (walk.hasNext()) {
            info.openrocket.core.masscalc.CMAnalysisEntry e = byKey.remove(walk.next().getID().toString());
            if (e != null) {
                ordered.add(e);
            }
        }
        ordered.addAll(byKey.values());        motorRows.sort(java.util.Comparator.comparing(x -> x.name));
        ordered.addAll(motorRows);

        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (info.openrocket.core.masscalc.CMAnalysisEntry e : ordered) {
            CoordinateIF cm = e.totalCM;
            double mass = (cm == null || cm.isNaN()) ? 0 : cm.getWeight();
            double cg = (cm == null || cm.isNaN()) ? 0 : cm.getX();
            if (!first) sb.append(',');
            first = false;
            // Same key as the aero sweep, so rows join even when names collide.
            String key = (e.source instanceof RocketComponent) ? ((RocketComponent) e.source).getID().toString() : "";
            sb.append("{\"key\":\"").append(escape(key)).append('"');
            sb.append(",\"name\":\"").append(escape(e.name)).append('"');
            sb.append(",\"eachMass\":").append(num(zeroIfNaN(e.eachMass)));
            sb.append(",\"mass\":").append(num(zeroIfNaN(mass)));
            sb.append(",\"cg\":").append(num(zeroIfNaN(cg)));
            sb.append('}');
        }
        return sb.append(']').toString();
    }

    private static String num(double v) {
        return (Double.isNaN(v) || Double.isInfinite(v)) ? "0" : Double.toString(v);
    }

    /** Degrees in and out; getWorstCP writes its answer into the conditions it is handed. */
    @JSExport
    public static double getWorstThetaDeg(int rocketHandle, double machValue, double aoaDeg) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        // A NaN Mach would return 0 degrees, a plausible-looking answer to a broken question.
        nonNegativeArg("getWorstThetaDeg mach", machValue);
        finiteArg("getWorstThetaDeg aoaDeg", aoaDeg);
        FlightConfiguration config = ctx.rocket.getSelectedConfiguration();
        FlightConditions conditions = new FlightConditions(config);
        conditions.setMach(machValue);
        conditions.setAOA(Math.toRadians(aoaDeg));
        rasAeroCalculator(ctx).getWorstCP(config, conditions, new WarningSet());
        return Math.toDegrees(conditions.getTheta());
    }

    /** Kernel warnings compare display strings in this unit, so it must match the user's. */
    @JSExport
    public static void setLengthUnit(String symbol) {
        try {
            info.openrocket.core.unit.UnitGroup.UNITS_LENGTH.setDefaultUnit(symbol);
        } catch (IllegalArgumentException e) {
        }
    }

    /** Pa at altitude in meters above sea level. */
    @JSExport
    public static double getStandardPressure(double altitude) {
        finiteArg("getStandardPressure altitude", altitude);
        return new ExtendedISAModel().getConditions(altitude).getPressure();
    }

    @JSExport
    public static double getMotorSimilarity(double[] times1, double[] thrusts1, double[] times2, double[] thrusts2) {
        return MotorCorrelation.similarity(curveMotor("a", times1, thrusts1), curveMotor("b", times2, thrusts2));
    }

    /** Desktop ThrustCurveMotor.computeStatistics: burn time is between 5%-of-peak crossings. */
    @JSExport
    public static String getMotorStatistics(double[] times, double[] thrusts) {
        try {
            ThrustCurveMotor m = curveMotor("statistics", times, thrusts);
            StringBuilder sb = new StringBuilder("{");
            num(sb, "burnTime", m.getBurnTimeEstimate()).append(',');
            num(sb, "averageThrust", m.getAverageThrustEstimate()).append(',');
            num(sb, "maxThrust", m.getMaxThrustEstimate()).append(',');
            num(sb, "totalImpulse", m.getTotalImpulseEstimate());
            return sb.append('}').toString();
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static ThrustCurveMotor curveMotor(String name, double[] times, double[] thrusts) {
        if (times == null || thrusts == null || times.length < 2 || thrusts.length != times.length) {
            throw new IllegalArgumentException("motor curve " + name + ": times/thrusts must be the same length and at least 2");
        }
        Coordinate[] cg = new Coordinate[times.length];
        for (int i = 0; i < times.length; i++) {
            if (!isFinite(times[i]) || !isFinite(thrusts[i]) || thrusts[i] < 0) {
                throw new IllegalArgumentException("motor curve " + name + ": non-finite or negative sample at " + i);
            }
            if (i > 0 && times[i] < times[i - 1]) {
                throw new IllegalArgumentException("motor curve " + name + ": times must be non-decreasing at " + i);
            }
            cg[i] = new Coordinate(0.05, 0, 0, 0.1);
        }
        return new ThrustCurveMotor.Builder()
                .setManufacturer(Manufacturer.getManufacturer("custom"))
                .setDesignation(name)
                .setCommonName(name)
                .setMotorType(Motor.Type.SINGLE)
                .setStandardDelays(new double[] { 0 })
                .setDiameter(0.029)
                .setLength(0.1)
                .setTimePoints(times)
                .setThrustPoints(thrusts)
                .setCGPoints(cg)
                .setDigest("similarity-" + name)
                .build();
    }

    @JSExport
    public static String getAeroSweep(int rocketHandle, String optionsJson) {
        try {
            return getAeroSweepImpl(rocketHandle, optionsJson);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static String getAeroSweepImpl(int rocketHandle, String optionsJson) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        FlightConfiguration config = ctx.rocket.getSelectedConfiguration();
        Map<String, Object> o = JsonLite.parseObject(optionsJson);
        double machMin = JsonLite.dbl(o, "machMin", 0.05);
        double machMax = JsonLite.dbl(o, "machMax", 3.0);
        double machStep = JsonLite.dbl(o, "machStep", 0.05);
        double aoa = Math.toRadians(JsonLite.dbl(o, "aoaDeg", 0));
        // Roll damping is proportional to roll rate, so it reads zero without one.
        double theta = Math.toRadians(JsonLite.dbl(o, "thetaDeg", 0));
        double rollRate = JsonLite.dbl(o, "rollRate", 0);
        // Non-positive means "use the default"; the JS side relies on it.
        if (Double.isNaN(machStep) || machStep <= 0) {
            machStep = 0.05;
        }
        // Unchecked, {"machMax":1e9} exhausts the heap with no error.
        if (!isFinite(machMin) || !isFinite(machMax) || machMax < machMin) {
            throw new IllegalArgumentException(
                    "aero sweep needs finite machMin <= machMax (got " + machMin + ".." + machMax + ")");
        }
        // Count points as an integer: machMin == machMax passes any span-only check.
        if (!isFinite(machStep) || machStep <= 0) {
            throw new IllegalArgumentException("aero sweep needs a finite machStep > 0 (got " + machStep + ")");
        }
        // Check before casting: `(long) Infinity` + 1 wraps negative past the guard.
        final double quotient = (machMax - machMin) / machStep;
        if (!isFinite(quotient) || quotient > MAX_SWEEP_POINTS) {
            throw new IllegalArgumentException("aero sweep of " + machMin + ".." + machMax
                    + " step " + machStep + " needs "
                    + (isFinite(quotient) ? "about " + quotient : "an infinite number of")
                    + " points, over the " + MAX_SWEEP_POINTS + " limit");
        }
        final long points = (long) Math.floor(quotient) + 1;
        if (points > MAX_SWEEP_POINTS) {
            throw new IllegalArgumentException("aero sweep of " + machMin + ".." + machMax
                    + " step " + machStep + " needs " + points + " points, over the "
                    + MAX_SWEEP_POINTS + " limit");
        }

        int n = (int) points;
        java.util.List<Double> machList = new java.util.ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            machList.add(machMin + i * machStep);
        }

        // "machAlt": [[mach, altitude_m], ...]; absent means ISA sea level.
        double[] maMach = null;
        double[] maAlt = null;
        Object maRaw = o.get("machAlt");
        if (maRaw != null && !(maRaw instanceof java.util.List)) {
            throw new IllegalArgumentException("'machAlt' should be a list of [mach, altitude] rows");
        }
        if (maRaw != null && !((java.util.List<?>) maRaw).isEmpty()) {
            java.util.List<?> rows = (java.util.List<?>) maRaw;
            maMach = new double[rows.size()];
            maAlt = new double[rows.size()];
            for (int i = 0; i < rows.size(); i++) {
                // Checked, not cast: TeaVM's cast failure names neither field nor row.
                Object row = rows.get(i);
                if (!(row instanceof java.util.List) || ((java.util.List<?>) row).size() < 2
                        || !(((java.util.List<?>) row).get(0) instanceof Double)
                        || !(((java.util.List<?>) row).get(1) instanceof Double)) {
                    throw new IllegalArgumentException(
                            "'machAlt' row " + i + " should be [mach, altitude] numbers");
                }
                maMach[i] = (Double) ((java.util.List<?>) row).get(0);
                maAlt[i] = (Double) ((java.util.List<?>) row).get(1);
            }
        }
        ExtendedISAModel isa = (maMach != null) ? new ExtendedISAModel() : null;

        // Mirrors AbstractSimulationStepper.setThrustingNozzleExitAreas; read off the mounts, the motors map can be stale.
        java.util.Map<ComponentAssembly, Double> nozzleAreas = new java.util.HashMap<>();
        for (RocketComponent c : ctx.rocket) {
            if (!(c instanceof MotorMount) || !((MotorMount) c).isMotorMount()) {
                continue;
            }
            MotorConfiguration mc = ((MotorMount) c).getMotorConfig(ctx.fcid);
            if (mc == null) {
                continue;
            }
            double d = mc.getNozzleExitDiameter();
            if (d <= 0) {
                continue;
            }
            double area = mc.getMotorCount() * Math.PI * (d / 2) * (d / 2);
            nozzleAreas.merge(((MotorMount) c).getAssembly(), area, Double::sum);
        }
        boolean hasNozzle = !nozzleAreas.isEmpty();

        BarrowmanCalculator calc = rasAeroCalculator(ctx);
        WarningSet warnings = new WarningSet();

        double[] offTotal = new double[n], offFric = new double[n], offPress = new double[n], offBase = new double[n];
        double[] onTotal = new double[n], onFric = new double[n], onPress = new double[n], onBase = new double[n];
        // CP (m from nose) and CNa (per rad) come from fOff: thrust only changes base drag.
        double[] cp = new double[n], cna = new double[n];
        java.util.LinkedHashMap<String, double[]> byComp = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompInstance = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, Integer> byCompCount = new java.util.LinkedHashMap<>();
        // Keyed on UUID, not name: two unnamed tubes would merge into one row.
        java.util.LinkedHashMap<String, String> byCompName = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, String> byCompType = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompFric = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompPress = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompBase = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompRollF = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompRollD = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompCna = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<String, double[]> byCompCp = new java.util.LinkedHashMap<>();

        int nonFinite = 0;

        for (int i = 0; i < n; i++) {
            double mach = machList.get(i);

            info.openrocket.core.models.atmosphere.AtmosphericConditions atm = null;
            if (isa != null) {
                double alt;
                if (mach <= maMach[0]) {
                    alt = maAlt[0];
                } else if (mach >= maMach[maMach.length - 1]) {
                    alt = maAlt[maAlt.length - 1];
                } else {
                    int j = 1;
                    while (maMach[j] < mach) {
                        j++;
                    }
                    double t = (mach - maMach[j - 1]) / (maMach[j] - maMach[j - 1]);
                    alt = maAlt[j - 1] + t * (maAlt[j] - maAlt[j - 1]);
                }
                atm = isa.getConditions(alt);
            }

            FlightConditions off = new FlightConditions(config);
            if (atm != null) {
                off.setAtmosphericConditions(atm);
            }
            off.setMach(mach);
            off.setAOA(aoa);
            off.setTheta(theta);
            off.setRollRate(rollRate);
            AerodynamicForces fOff = calc.getAerodynamicForces(config, off, warnings);
            offTotal[i] = fOff.getCD();
            offFric[i] = fOff.getFrictionCD();
            offPress[i] = fOff.getPressureCD();
            offBase[i] = fOff.getBaseCD();
            CoordinateIF cpc = fOff.getCP();
            cp[i] = cpc.getX();
            cna[i] = cpc.getWeight();

            FlightConditions on = new FlightConditions(config);
            if (atm != null) {
                on.setAtmosphericConditions(atm);
            }
            on.setMach(mach);
            on.setAOA(aoa);
            on.setTheta(theta);
            on.setRollRate(rollRate);
            on.setThrustingNozzleExitAreas(nozzleAreas);
            AerodynamicForces fOn = calc.getAerodynamicForces(config, on, warnings);
            onTotal[i] = fOn.getCD();
            onFric[i] = fOn.getFrictionCD();
            onPress[i] = fOn.getPressureCD();
            onBase[i] = fOn.getBaseCD();

            Map<RocketComponent, AerodynamicForces> offMap = calc.getForceAnalysis(config, off, warnings);
            for (Map.Entry<RocketComponent, AerodynamicForces> e : offMap.entrySet()) {
                RocketComponent c = e.getKey();
                if (!c.isAerodynamic() || c instanceof ComponentAssembly) {
                    continue;
                }
                AerodynamicForces f = e.getValue();
                String name = c.getID().toString();
                byCompName.put(name, c.getName());
                // getCD() is per instance; `cd` must be getCDTotal() (desktop CAParameterSweep).
                nonFinite += countNonFinite(f.getCDTotal(), f.getCD(), f.getFrictionCD(),
                        f.getPressureCD(), f.getBaseCD(), f.getCrollForce(), f.getCrollDamp());
                series(byComp, name, n)[i] += f.getCDTotal();
                series(byCompInstance, name, n)[i] += f.getCD();
                byCompCount.put(name, c.getInstanceCount());
                byCompType.put(name, c.getClass().getSimpleName());
                series(byCompFric, name, n)[i] += f.getFrictionCD();
                series(byCompPress, name, n)[i] += f.getPressureCD();
                series(byCompBase, name, n)[i] += f.getBaseCD();
                series(byCompRollF, name, n)[i] += f.getCrollForce();
                series(byCompRollD, name, n)[i] += f.getCrollDamp();
                // CP is a position: accumulate the CNa-weighted moment, divide out later.
                CoordinateIF fcp = f.getCP();
                nonFinite += countNonFinite(fcp.getWeight(), fcp.getX());
                double ccna = fcp.getWeight();
                series(byCompCna, name, n)[i] += ccna;
                series(byCompCp, name, n)[i] += fcp.getX() * ccna;
            }
        }

        double[] machArr = new double[n];
        for (int i = 0; i < n; i++) {
            machArr[i] = machList.get(i);
        }

        StringBuilder sb = new StringBuilder("{\"machs\":");
        nums(sb, machArr);
        sb.append(",\"hasNozzle\":").append(hasNozzle);
        sb.append(",\"nonFinite\":").append(nonFinite);
        sb.append(",\"cp\":");
        nums(sb, cp);
        sb.append(",\"cna\":");
        nums(sb, cna);
        sb.append(",\"powerOff\":");
        dragBlock(sb, offTotal, offFric, offPress, offBase);
        sb.append(",\"powerOn\":");
        dragBlock(sb, onTotal, onFric, onPress, onBase);
        sb.append(",\"components\":[");
        boolean first = true;
        for (Map.Entry<String, double[]> e : byComp.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            String name = e.getKey();
            sb.append("{\"key\":\"").append(escape(name)).append('"');
            sb.append(",\"name\":\"").append(escape(byCompName.get(name))).append("\",\"cd\":");
            nums(sb, e.getValue());
            sb.append(",\"cdInstance\":");
            nums(sb, byCompInstance.get(name));
            sb.append(",\"instances\":").append(byCompCount.getOrDefault(name, 1));
            sb.append(",\"type\":\"").append(escape(byCompType.getOrDefault(name, ""))).append('"');
            sb.append(",\"friction\":");
            nums(sb, byCompFric.get(name));
            sb.append(",\"pressure\":");
            nums(sb, byCompPress.get(name));
            sb.append(",\"base\":");
            nums(sb, byCompBase.get(name));
            sb.append(",\"rollForce\":");
            nums(sb, byCompRollF.get(name));
            sb.append(",\"rollDamp\":");
            nums(sb, byCompRollD.get(name));
            sb.append(",\"cna\":");
            nums(sb, byCompCna.get(name));
            sb.append(",\"cp\":");
            double[] cnaRow = byCompCna.get(name);
            double[] cpRow = byCompCp.get(name);
            double[] cpOut = new double[n];
            for (int i = 0; i < n; i++) {
                cpOut[i] = cnaRow[i] != 0 ? cpRow[i] / cnaRow[i] : 0;
            }
            nums(sb, cpOut);
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    private static double[] series(java.util.Map<String, double[]> map, String name, int n) {
        double[] row = map.get(name);
        if (row == null) {
            row = new double[n];
            map.put(name, row);
        }
        return row;
    }

    private static int countNonFinite(double... vs) {
        int k = 0;
        for (double v : vs) {
            if (Double.isNaN(v) || Double.isInfinite(v)) k++;
        }
        return k;
    }

    private static double zeroIfNaN(double v) {
        return (Double.isNaN(v) || Double.isInfinite(v)) ? 0 : v;
    }

    private static void dragBlock(StringBuilder sb, double[] total, double[] fric, double[] press, double[] base) {
        sb.append("{\"total\":");
        nums(sb, total);
        sb.append(",\"friction\":");
        nums(sb, fric);
        sb.append(",\"pressure\":");
        nums(sb, press);
        sb.append(",\"base\":");
        nums(sb, base);
        sb.append('}');
    }

    private static StringBuilder points(StringBuilder sb, CoordinateIF[] values) {
        sb.append('[');
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            nums(sb, new double[] { values[i].getX(), values[i].getY() });
        }
        return sb.append(']');
    }

    private static StringBuilder nums(StringBuilder sb, double[] values) {
        sb.append('[');
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            double v = values[i];
            sb.append((Double.isNaN(v) || Double.isInfinite(v)) ? "null" : Double.toString(v));
        }
        return sb.append(']');
    }


    @JSExport
    public static String simulate(int rocketHandle, double launchRodLength, double launchRodAngle,
            double windAverage, double windStdDeviation, double launchAltitude, double timeStep) {
        double[] opts = { launchRodLength, launchRodAngle, windAverage, windStdDeviation, launchAltitude, timeStep };
        for (double v : opts) {
            if (!isFinite(v)) {
                return errorJson(new IllegalArgumentException("simulate: every option must be a finite number"));
            }
        }
        return simulateJson(rocketHandle, "{"
                + "\"rodLength\":" + launchRodLength + ",\"rodAngle\":" + launchRodAngle
                + ",\"windAverage\":" + windAverage + ",\"windStdDeviation\":" + windStdDeviation
                + ",\"launchAltitude\":" + launchAltitude + ",\"timeStep\":" + timeStep + "}");
    }

    /** temperature (K) and pressure (Pa) are launch-site values. */
    @JSExport
    public static String simulateJson(int rocketHandle, String optionsJson) {
        try {
            return simulateJsonImpl(rocketHandle, optionsJson);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    private static String simulateJsonImpl(int rocketHandle, String optionsJson) {
        RocketCtx ctx = get(rocketHandle, RocketCtx.class, "a rocket");
        Map<String, Object> o = JsonLite.parseObject(optionsJson);

        String seriesMode = JsonLite.str(o, "series", "summary");
        if (!"summary".equals(seriesMode) && !"full".equals(seriesMode)) {
            throw new IllegalArgumentException("Unknown series mode: " + seriesMode);
        }
        boolean fullSeries = "full".equals(seriesMode);

        SimulationConditions conditions = buildConditions(ctx, o);

        // m/s.
        double railExitMinSpeed = JsonLite.dbl(o, "railExitMinSpeed", Double.NaN);
        boolean railAsked = isFinite(railExitMinSpeed) && railExitMinSpeed > 0;

        try {
            BasicEventSimulationEngine engine = new BasicEventSimulationEngine();
            engine.simulate(conditions);
            FlightData data = engine.getFlightData();
            double railNeeded = railAsked ? railLengthNeeded(ctx, o, railExitMinSpeed) : Double.NaN;
            return flightDataToJson(data, fullSeries, appIds(ctx), railAsked, railNeeded);
        } catch (SimulationException e) {
            return errorJson(e);
        } catch (RuntimeException e) {
            return errorJson(e);
        }
    }

    /** The rail-length probe must fly the same conditions. */
    private static SimulationConditions buildConditions(RocketCtx ctx, Map<String, Object> o) {
        double launchAltitude = JsonLite.dbl(o, "launchAltitude", 0);
        double temperature = JsonLite.dbl(o, "temperature", Double.NaN);
        double pressure = JsonLite.dbl(o, "pressure", Double.NaN);
        // A fraction (0..1), like the kernel's field.
        double humidity = JsonLite.dbl(o, "relativeHumidity", Double.NaN);
        double timeStep = JsonLite.dbl(o, "timeStep", 0.05);
        SimulationConditions conditions = new SimulationConditions();
        Simulation simulation = new Simulation(ctx.rocket, ctx.fcid);
        // The engine reads the stepper from the simulation's options, not the conditions.
        simulation.getOptions().setSimulationStepperMethodChoice(stepperOf(JsonLite.str(o, "stepper", "rk4")));
        conditions.setSimulation(simulation);
        conditions.setLaunchRodLength(JsonLite.dbl(o, "rodLength", 1.0));
        conditions.setLaunchRodAngle(JsonLite.dbl(o, "rodAngle", 0));
        conditions.setLaunchRodDirection(JsonLite.dbl(o, "rodDirection", Math.PI / 2));
        conditions.setLaunchSite(new WorldCoordinate(
                JsonLite.dbl(o, "launchLatitude", 28.61),
                JsonLite.dbl(o, "launchLongitude", -80.60),
                launchAltitude));
        conditions.setGeodeticComputation(geodeticOf(JsonLite.str(o, "geodetic", "spherical")));
        List<Map<String, Object>> atmosphereLevels = JsonLite.objList(o, "atmosphereLevels");
        if (atmosphereLevels != null && !atmosphereLevels.isEmpty()) {
            conditions.setAtmosphericModel(
                    atmosphereProfileOf(atmosphereLevels, launchAltitude, temperature, pressure, humidity));
        } else if (!Double.isNaN(temperature) || !Double.isNaN(pressure) || !Double.isNaN(humidity)) {
            // The 4-arg form bases the values at the launch altitude; the 3-arg has none.
            conditions.setAtmosphericModel(new ExtendedISAModel(
                    launchAltitude,
                    Double.isNaN(temperature) ? ExtendedISAModel.STANDARD_TEMPERATURE : temperature,
                    Double.isNaN(pressure) ? ExtendedISAModel.STANDARD_PRESSURE : pressure,
                    Double.isNaN(humidity) ? ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY : humidity));
        } else {
            conditions.setAtmosphericModel(new ExtendedISAModel());
        }
        if ("constant".equalsIgnoreCase(JsonLite.str(o, "gravityModel", "wgs"))) {
            conditions.setGravityModel(new ConstantGravityModel(JsonLite.dbl(o, "constantGravity", 9.80665)));
        } else {
            conditions.setGravityModel(new WGSGravityModel());
        }
        double maxAngleStep = JsonLite.dbl(o, "maxAngleStep", Double.NaN);
        if (!Double.isNaN(maxAngleStep) && maxAngleStep > 0) {
            conditions.setMaximumAngleStep(maxAngleStep);
        }
        BarrowmanCalculator aeroCalc = rasAeroCalculator(ctx);
        int randomSeed = (int) JsonLite.dbl(o, "randomSeed", 42);
        List<Map<String, Object>> windLevels = JsonLite.objList(o, "windLevels");
        if (windLevels != null && !windLevels.isEmpty()) {
            // clearLevels() drops the constructor's default level 0.
            MultiLevelPinkNoiseWindModel ml = new MultiLevelPinkNoiseWindModel();
            ml.clearLevels();
            List<Double> seen = new ArrayList<>();
            for (int i = 0; i < windLevels.size(); i++) {
                Map<String, Object> lvl = windLevels.get(i);
                // Do not default altitude to 0: it is the level's key and would overwrite the surface wind.
                double altitude = JsonLite.dbl(lvl, "altitude", Double.NaN);
                if (!isFinite(altitude)) {
                    throw new IllegalArgumentException(
                            "wind level " + (i + 1) + " of " + windLevels.size() + " has no usable altitude");
                }
                if (seen.contains(Double.valueOf(altitude))) {
                    throw new IllegalArgumentException("wind levels repeat the altitude " + altitude
                            + " m (level " + (i + 1) + "); each level needs its own altitude");
                }
                seen.add(Double.valueOf(altitude));
                ml.addWindLevel(
                        altitude,
                        JsonLite.dbl(lvl, "speed", 0),
                        JsonLite.dbl(lvl, "direction", Math.PI / 2),
                        JsonLite.dbl(lvl, "stddev", 0));
            }
            // Seed after every level is added (setSeed walks the list), as upstream SimulationOptions.toSimulationConditions does.
            ml.setSeed(randomSeed);
            ml.setAltitudeReference("agl".equalsIgnoreCase(JsonLite.str(o, "windAltitudeReference", "msl"))
                    ? WindModel.AltitudeReference.AGL
                    : WindModel.AltitudeReference.MSL);
            conditions.setWindModel(ml);
        } else {
            PinkNoiseWindModel wind = new PinkNoiseWindModel(randomSeed);
            wind.setAverage(JsonLite.dbl(o, "windAverage", 0));
            wind.setStandardDeviation(JsonLite.dbl(o, "windStdDeviation", 0));
            wind.setDirection(JsonLite.dbl(o, "windDirection", Math.PI / 2));
            conditions.setWindModel(wind);
        }
        conditions.setAerodynamicCalculator(aeroCalc);
        conditions.setMassCalculator(new MassCalculator());
        conditions.setTimeStep(timeStep > 0 ? timeStep : 0.05);
        conditions.setMaxSimulationTime(JsonLite.dbl(o, "maxTime", 1200));
        conditions.setRandomSeed(randomSeed);
        // drogueLowSpeed is read via PATCH(drogue-low-speed) in BasicEventSimulationEngine.
        conditions.setRecoverySpeedWarning(JsonLite.dbl(o, "recoverySpeedWarn", 20.0));
        conditions.setDrogueLowSpeedWarning(JsonLite.dbl(o, "drogueLowSpeedWarn", 3.048));
        conditions.setRecoveryDrogueMainHighSpeedWarning(JsonLite.dbl(o, "mainHighSpeedWarn", 30.48));
        conditions.setRecoveryDrogueMainLowSpeedWarning(JsonLite.dbl(o, "mainLowSpeedWarn", 15.24));

        // Absent when off, so the default flight stays byte-identical to upstream.
        if (JsonLite.bool(o, "guideAwareRodClearance", false)) {
            conditions.getSimulationListenerList().add(new GuideClearanceListener());
        }

        return conditions;
    }

    private static final double PROBE_ROD_M = 1.0e6;

    private static final double PROBE_MAX_TIME_S = 60;

    private static double railLengthNeeded(RocketCtx ctx, Map<String, Object> o, double minSpeed)
            throws SimulationException {
        SimulationConditions probe = buildConditions(ctx, o);
        double rod = probe.getLaunchRodLength();
        probe.setLaunchRodLength(PROBE_ROD_M);
        probe.setMaxSimulationTime(Math.min(probe.getMaxSimulationTime(), PROBE_MAX_TIME_S));
        RailSpeedProbe listener = new RailSpeedProbe(minSpeed, JsonLite.bool(o, "guideAwareRodClearance", false), rod);
        probe.getSimulationListenerList().add(listener);
        new BasicEventSimulationEngine().simulate(probe);
        return listener.railLength();
    }


    /** Levels: altitude (m MSL), temperature (K), pressure (Pa), relativeHumidity (fraction). */
    private static AtmosphereProfile atmosphereProfileOf(List<Map<String, Object>> levels,
            double launchAltitude, double temperature, double pressure, double humidity) {
        List<double[]> rows = new ArrayList<>();
        for (int i = 0; i < levels.size(); i++) {
            Map<String, Object> l = levels.get(i);
            rows.add(new double[] {
                    JsonLite.dbl(l, "altitude", Double.NaN),
                    JsonLite.dbl(l, "temperature", Double.NaN),
                    JsonLite.dbl(l, "pressure", Double.NaN),
                    JsonLite.dbl(l, "relativeHumidity", ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY) });
        }
        rows.sort((a, b) -> Double.compare(a[0], b[0]));
        boolean anchored = !Double.isNaN(temperature) && !Double.isNaN(pressure);
        if (anchored) {
            rows.removeIf(r -> r[0] <= launchAltitude || !(r[2] < pressure));
            double siteHumidity = !Double.isNaN(humidity) ? humidity
                    : rows.isEmpty() ? ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY : rows.get(0)[3];
            rows.add(0, new double[] { launchAltitude, temperature, pressure, siteHumidity });
        }
        int n = rows.size();
        double[] alt = new double[n], t = new double[n], p = new double[n], rh = new double[n];
        for (int i = 0; i < n; i++) {
            double[] r = rows.get(i);
            alt[i] = r[0];
            t[i] = r[1];
            p[i] = r[2];
            rh[i] = r[3];
        }
        return new AtmosphereProfile(alt, t, p, rh);
    }

    private static GeodeticComputationStrategy geodeticOf(String name) {
        switch (name == null ? "" : name.toLowerCase()) {
            case "flat": return GeodeticComputationStrategy.FLAT;
            case "wgs84": return GeodeticComputationStrategy.WGS84;
            case "spherical":
            default: return GeodeticComputationStrategy.SPHERICAL;
        }
    }

    /** Unknown names are refused: a silent RK4 fallback would look identical. */
    private static SimulationStepperMethod stepperOf(String name) {
        switch (name == null ? "" : name.toLowerCase()) {
            case "rk4": return SimulationStepperMethod.RK4;
            case "rk6": return SimulationStepperMethod.RK6;
            default: throw new IllegalArgumentException("Unknown stepper: " + name + " (expected rk4 or rk6)");
        }
    }

    private static final class RocketCtx {
        final Rocket rocket;
        final AxialStage stage;
        final FlightConfigurationId fcid;
        final Map<String, RocketComponent> ids = new HashMap<>();
        /** Meters, per stage; handed to the stage's motor in applyMotor. */
        final Map<AxialStage, Double> nozzleDia = new HashMap<>();
        boolean rogersKbf = false;
        boolean supersonicAero = false;
        boolean stubbyNoseFloor = false;

        RocketCtx(Rocket rocket, AxialStage stage, FlightConfigurationId fcid) {
            this.rocket = rocket;
            this.stage = stage;
            this.fcid = fcid;
        }
    }

    private static void setBulkMaterial(RocketComponent c, double density) {
        if (density <= 0) {
            return;
        }
        Material m = Material.newMaterial(Material.Type.BULK, "custom", density, true);
        if (c instanceof info.openrocket.core.rocketcomponent.ExternalComponent) {
            ((info.openrocket.core.rocketcomponent.ExternalComponent) c).setMaterial(m);
        } else if (c instanceof info.openrocket.core.rocketcomponent.StructuralComponent) {
            ((info.openrocket.core.rocketcomponent.StructuralComponent) c).setMaterial(m);
        }
    }

    /** Keyed by ID: the simulation flies a copyWithOriginalID copy, so sources are different objects. */
    private static Map<String, String> appIds(RocketCtx ctx) {
        Map<String, String> out = new HashMap<>();
        for (Map.Entry<String, RocketComponent> e : ctx.ids.entrySet()) {
            out.put(e.getValue().getID().toString(), e.getKey());
        }
        return out;
    }

    private static String appId(Map<String, String> appIds, RocketComponent c) {
        return c == null ? null : appIds.get(c.getID().toString());
    }

    private static String flightDataToJson(FlightData data, boolean fullSeries, Map<String, String> appIds,
            boolean railAsked, double railNeeded) {
        StringBuilder sb = new StringBuilder("{\"summary\":{");
        num(sb, "maxAltitude", data.getMaxAltitude()).append(',');
        num(sb, "maxVelocity", data.getMaxVelocity()).append(',');
        num(sb, "maxAcceleration", data.getMaxAcceleration()).append(',');
        num(sb, "maxMachNumber", data.getMaxMachNumber()).append(',');
        num(sb, "timeToApogee", data.getTimeToApogee()).append(',');
        num(sb, "flightTime", data.getFlightTime()).append(',');
        num(sb, "groundHitVelocity", data.getGroundHitVelocity()).append(',');
        num(sb, "launchRodVelocity", data.getLaunchRodVelocity()).append(',');
        num(sb, "deploymentVelocity", data.getDeploymentVelocity()).append(',');
        num(sb, "optimumDelay", data.getOptimumDelay());
        // No key means "not computed"; null means "no rod is long enough".
        if (railAsked) {
            sb.append(',');
            num(sb, "railLengthNeeded", railNeeded);
        }
        sb.append("},\"warnings\":");
        appendWarnings(sb, data.getWarningSet(), appIds);
        sb.append(",\"warningTexts\":");
        appendWarningTexts(sb, data.getWarningSet());
        sb.append(",\"events\":");
        appendEvents(sb, data.getBranch(0), appIds);
        sb.append(",\"series\":");
        appendBranchSeries(sb, data.getBranch(0), fullSeries);
        if (data.getBranchCount() > 1) {
            sb.append(",\"branches\":[");
            for (int i = 0; i < data.getBranchCount(); i++) {
                if (i > 0) sb.append(',');
                FlightDataBranch b = data.getBranch(i);
                sb.append("{\"name\":\"").append(escape(String.valueOf(b.getName())))
                        .append("\",\"events\":");
                appendEvents(sb, b, appIds);
                sb.append(",\"series\":");
                appendBranchSeries(sb, b, fullSeries);
                sb.append('}');
            }
            sb.append(']');
        }
        return sb.append('}').toString();
    }

    private static void appendWarnings(StringBuilder sb, WarningSet warnings, Map<String, String> appIds) {
        sb.append('[');
        boolean first = true;
        for (info.openrocket.core.logging.Warning w : warnings) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"key\":\"").append(escape(warningKey(w)))
                    .append("\",\"message\":\"").append(escape(String.valueOf(w)))
                    .append("\",\"priority\":\"")
                    .append(w.getPriority().getExportLabel()).append('"');
            RocketComponent[] sources = w.getSources();
            boolean anyId = false;
            if (sources != null) {
                for (RocketComponent src : sources) {
                    String id = appId(appIds, src);
                    if (id == null) continue;
                    sb.append(anyId ? "," : ",\"sourceIds\":[").append('"').append(escape(id)).append('"');
                    anyId = true;
                }
            }
            if (anyId) sb.append(']');
            sb.append('}');
        }
        sb.append(']');
    }

    private static void appendWarningTexts(StringBuilder sb, WarningSet warnings) {
        sb.append('[');
        boolean first = true;
        for (info.openrocket.core.logging.Warning w : warnings) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(escape(String.valueOf(w))).append('"');
        }
        sb.append(']');
    }

    /** No reflection: TeaVM class metadata must not leak into parity output. */
    private static String warningKey(info.openrocket.core.logging.Warning w) {
        if (w instanceof info.openrocket.core.logging.Warning.LargeAOA) {
            return "LargeAOA";
        }
        if (w instanceof info.openrocket.core.logging.Warning.RecoveryHighSpeedDeployment) {
            return "HighSpeedDeployment";
        }
        if (w instanceof info.openrocket.core.logging.Warning.EventAfterLanding) {
            return "EventAfterLanding";
        }
        if (w instanceof info.openrocket.core.logging.Warning.MissingMotor) {
            return "MissingMotor";
        }
        String text = w.getMessageDescription();
        final String prefix = "[Warning.";
        if (text != null && text.startsWith(prefix)) {
            int end = text.indexOf(']');
            if (end > prefix.length()) {
                return text.substring(prefix.length(), end);
            }
        }
        return "Other";
    }

    private static void appendEvents(StringBuilder sb, FlightDataBranch branch, Map<String, String> appIds) {
        sb.append('[');
        boolean first = true;
        for (FlightEvent ev : branch.getEvents()) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"type\":\"").append(ev.getType().name()).append('"').append(',');
            num(sb, "time", ev.getTime());
            RocketComponent src = ev.getSource();
            if (src != null && src.getName() != null) {
                sb.append(",\"source\":\"").append(escape(src.getName())).append('"');
            }
            String srcId = appId(appIds, src);
            if (srcId != null) {
                sb.append(",\"sourceId\":\"").append(escape(srcId)).append('"');
            }
            sb.append('}');
        }
        sb.append(']');
    }

    private static final java.util.Set<FlightDataType> FRIENDLY_NAMED_TYPES =
            new java.util.HashSet<>(java.util.Arrays.asList(
                    FlightDataType.TYPE_TIME, FlightDataType.TYPE_ALTITUDE,
                    FlightDataType.TYPE_VELOCITY_TOTAL, FlightDataType.TYPE_ACCELERATION_TOTAL,
                    FlightDataType.TYPE_MASS, FlightDataType.TYPE_THRUST_FORCE,
                    FlightDataType.TYPE_DRAG_FORCE, FlightDataType.TYPE_MACH_NUMBER,
                    FlightDataType.TYPE_STABILITY, FlightDataType.TYPE_CP_LOCATION,
                    FlightDataType.TYPE_CG_LOCATION, FlightDataType.TYPE_AOA));

    private static final java.util.Set<FlightDataType> SUMMARY_SYMBOL_TYPES =
            new java.util.HashSet<>(java.util.Arrays.asList(
                    FlightDataType.TYPE_POSITION_XY, FlightDataType.TYPE_POSITION_DIRECTION,
                    FlightDataType.TYPE_POSITION_X, FlightDataType.TYPE_POSITION_Y,
                    FlightDataType.TYPE_ROLL_RATE));

    private static void appendBranchSeries(StringBuilder sb, FlightDataBranch branch, boolean fullSeries) {
        sb.append('{');
        appendSeries(sb, "time", branch.get(FlightDataType.TYPE_TIME)).append(',');
        appendSeries(sb, "altitude", branch.get(FlightDataType.TYPE_ALTITUDE)).append(',');
        appendSeries(sb, "velocity", branch.get(FlightDataType.TYPE_VELOCITY_TOTAL)).append(',');
        appendSeries(sb, "acceleration", branch.get(FlightDataType.TYPE_ACCELERATION_TOTAL)).append(',');
        appendSeries(sb, "mass", branch.get(FlightDataType.TYPE_MASS)).append(',');
        appendSeries(sb, "thrust", branch.get(FlightDataType.TYPE_THRUST_FORCE)).append(',');
        appendSeries(sb, "drag", branch.get(FlightDataType.TYPE_DRAG_FORCE)).append(',');
        appendSeries(sb, "mach", branch.get(FlightDataType.TYPE_MACH_NUMBER)).append(',');
        appendSeries(sb, "stability", branch.get(FlightDataType.TYPE_STABILITY)).append(',');
        appendSeries(sb, "cpLocation", branch.get(FlightDataType.TYPE_CP_LOCATION)).append(',');
        appendSeries(sb, "cgLocation", branch.get(FlightDataType.TYPE_CG_LOCATION)).append(',');
        appendSeries(sb, "aoa", branch.get(FlightDataType.TYPE_AOA));
        // TYPE_COMPUTATION_TIME is wall-clock noise that would break parity.
        for (FlightDataType type : branch.getTypes()) {
            if (fullSeries
                    ? (type.equals(FlightDataType.TYPE_COMPUTATION_TIME)
                            || FRIENDLY_NAMED_TYPES.contains(type))
                    : !SUMMARY_SYMBOL_TYPES.contains(type)) {
                continue;
            }
            List<Double> values = branch.get(type);
            if (values == null) {
                continue;
            }
            sb.append(',');
            appendSeries(sb, escape(type.getSymbol()), values);
        }
        sb.append('}');
    }

    private static StringBuilder appendSeries(StringBuilder sb, String name, List<Double> values) {
        sb.append('"').append(escape(name)).append("\":[");
        if (values != null) {
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) sb.append(',');
                Double v = values.get(i);
                sb.append(v == null || v.isNaN() || v.isInfinite() ? "null" : v.toString());
            }
        }
        return sb.append(']');
    }

    private static void requireFinite(String what, double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new IllegalStateException("The design's " + what + " is not a finite number (" + value
                    + "); a dimension is probably out of range.");
        }
    }

    private static StringBuilder num(StringBuilder sb, String key, double value) {
        sb.append('"').append(key).append("\":");
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return sb.append("null");
        }
        return sb.append(value);
    }

    private static String escape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"': sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        // Not String.format: see PATCH(teavm-format-g) in patches/LEDGER.md.
                        sb.append("\\u00");
                        sb.append(Character.forDigit((c >> 4) & 0xF, 16));
                        sb.append(Character.forDigit(c & 0xF, 16));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.toString();
    }
}
