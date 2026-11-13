package api;

import java.util.List;
import java.util.Map;

import info.openrocket.core.material.Material;
import info.openrocket.core.motor.MotorConfiguration;
import info.openrocket.core.rocketcomponent.BodyTube;
import info.openrocket.core.rocketcomponent.Bulkhead;
import info.openrocket.core.rocketcomponent.CenteringRing;
import info.openrocket.core.rocketcomponent.ClusterConfiguration;
import info.openrocket.core.rocketcomponent.DeploymentConfiguration;
import info.openrocket.core.rocketcomponent.EllipticalFinSet;
import info.openrocket.core.rocketcomponent.EngineBlock;
import info.openrocket.core.rocketcomponent.ExternalComponent;
import info.openrocket.core.rocketcomponent.FinSet;
import info.openrocket.core.rocketcomponent.FreeformFinSet;
import info.openrocket.core.rocketcomponent.InnerTube;
import info.openrocket.core.rocketcomponent.LaunchLug;
import info.openrocket.core.rocketcomponent.MassComponent;
import info.openrocket.core.rocketcomponent.MotorMount;
import info.openrocket.core.rocketcomponent.NoseCone;
import info.openrocket.core.rocketcomponent.Parachute;
import info.openrocket.core.rocketcomponent.RailButton;
import info.openrocket.core.rocketcomponent.RecoveryDevice;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.rocketcomponent.ShockCord;
import info.openrocket.core.rocketcomponent.Streamer;
import info.openrocket.core.rocketcomponent.StructuralComponent;
import info.openrocket.core.rocketcomponent.Transition;
import info.openrocket.core.rocketcomponent.TrapezoidFinSet;
import info.openrocket.core.rocketcomponent.TubeCoupler;
import info.openrocket.core.rocketcomponent.TubeFinSet;
import info.openrocket.core.rocketcomponent.AxialStage;
import info.openrocket.core.rocketcomponent.ComponentAssembly;
import info.openrocket.core.rocketcomponent.ParallelStage;
import info.openrocket.core.rocketcomponent.PodSet;
import info.openrocket.core.rocketcomponent.LineInstanceable;
import info.openrocket.core.rocketcomponent.MassComponent;
import info.openrocket.core.rocketcomponent.RingComponent;
import info.openrocket.core.rocketcomponent.Bulkhead;
import info.openrocket.core.rocketcomponent.CenteringRing;
import info.openrocket.core.rocketcomponent.EngineBlock;
import info.openrocket.core.rocketcomponent.MassObject;
import info.openrocket.core.rocketcomponent.RecoveryDevice;
import info.openrocket.core.rocketcomponent.RingInstanceable;
import info.openrocket.core.rocketcomponent.position.AngleMethod;
import info.openrocket.core.rocketcomponent.position.AxialMethod;
import info.openrocket.core.rocketcomponent.position.RadiusMethod;
import info.openrocket.core.util.Coordinate;

import static api.JsonLite.bool;
import static api.JsonLite.obj;
import static api.JsonLite.str;

/** All SI, radians. */
final class ComponentFactory {

    // Mirrors web/src/tree/nodeProps.ts MAX_INSTANCE_COUNT; enforced here because orkImport.ts writes raw values.
    static final int MAX_INSTANCE_COUNT = 64;

    static final int MAX_FIN_COUNT = 8;

    // Matches the browser's importLimits.MAX_FIN_POINTS.
    static final int MAX_FIN_POINTS = 10000;

    static final int MAX_LINE_COUNT = 1024;

    // Not a bare (int) dbl(...), which turns NaN into 0 and Infinity into Integer.MAX_VALUE.
    private static int count(Map<String, Object> node, String key, int fallback, int max) {
        return count(node, key, fallback, 1, max);
    }

    private static int count(Map<String, Object> node, String key, int fallback, int min, int max) {
        double v = dbl(node, key, fallback);
        if (Double.isNaN(v) || v != Math.floor(v) || v < min || v > max) {
            throw new IllegalArgumentException(
                    "'" + key + "' must be a whole number in " + min + ".." + max + " (got " + v + ")");
        }
        return (int) v;
    }

    // SI. `"length":1e300` would return every static figure as null with no error.
    static final double MAX_MAGNITUDE = 1e6;

    // The kernel clamps a negative size to 0 silently. Positions, angles, sweep, overhang and offsets stay signed.
    private static final java.util.Set<String> NON_NEGATIVE = new java.util.HashSet<>(java.util.Arrays.asList(
            "length", "thickness", "outerRadius", "innerRadius", "radius", "aftRadius", "foreRadius",
            "height", "rootChord", "tipChord", "diameter", "outerDiameter", "innerDiameter",
            "shoulderLength", "shoulderRadius", "shoulderThickness",
            "foreShoulderLength", "foreShoulderRadius", "foreShoulderThickness",
            "aftShoulderLength", "aftShoulderRadius", "aftShoulderThickness",
            "lineLength", "width", "cordLength", "stripLength", "stripWidth",
            "density", "surfaceDensity", "lineDensity", "filletDensity", "mass", "overrideMass",
            "filletRadius", "finLeRadius", "tabHeight", "tabLength", "flangeHeight", "baseHeight",
            "screwHeight", "instanceSeparation", "deployDelay", "deployAltitude", "cd", "ignitionDelay"));

    private static double dbl(Map<String, Object> node, String key, double fallback) {
        double v = JsonLite.dbl(node, key, fallback);
        if (Math.abs(v) > MAX_MAGNITUDE) {
            throw new IllegalArgumentException(
                    "'" + key + "' is out of range (got " + v + "; the limit is " + MAX_MAGNITUDE + ")");
        }
        if (v < 0 && NON_NEGATIVE.contains(key)) {
            throw new IllegalArgumentException("'" + key + "' must not be negative (got " + v + ")");
        }
        return v;
    }

    // Mirror web/src/services/files/ork/importLimits.ts. The kernel's build grows with the square of the part count.
    static final int MAX_COMPONENTS = 1000;
    // Each count is capped alone, but nesting multiplies them: three pod sets of 64 are 262,144 parts.
    static final int MAX_TOTAL_INSTANCES = 20000;
    // Each automatic radius walks back to a sized part, so a long run costs its length squared.
    static final int MAX_AUTO_RADIUS_RUN = 16;

    /** Refuses a tree too large to build in reasonable time, before the kernel sees any of it. */
    static void checkSize(Map<String, Object> root) {
        long[] totals = new long[3]; // parts, instances, current run of automatic radii
        sizeOf(root, 1, totals);
    }

    private static void sizeOf(Map<String, Object> node, long copies, long[] totals) {
        for (Map<String, Object> kid : JsonLite.objList(node, "children")) {
            if (++totals[0] > MAX_COMPONENTS) {
                throw new IllegalArgumentException("The design has more than " + MAX_COMPONENTS + " parts");
            }
            long here = copies * instancesOf(kid);
            totals[1] += here;
            if (totals[1] > MAX_TOTAL_INSTANCES) {
                throw new IllegalArgumentException("The design has more than " + MAX_TOTAL_INSTANCES
                        + " parts once pod, cluster, fin and instance counts are multiplied out");
            }
            Boolean auto = autoRadiusOf(kid);
            if (auto != null) {
                totals[2] = auto ? totals[2] + 1 : 0;
            }
            if (totals[2] > MAX_AUTO_RADIUS_RUN) {
                throw new IllegalArgumentException("The design has more than " + MAX_AUTO_RADIUS_RUN
                        + " automatic-radius parts in a row");
            }
            sizeOf(kid, here, totals);
        }
    }

    /** Null for a part with no radius of its own to size; the flags `create` reads. */
    private static Boolean autoRadiusOf(Map<String, Object> node) {
        switch (str(node, "type", "")) {
            case "nosecone":
                return bool(node, "aftRadiusAuto", false);
            case "bodytube":
                return bool(node, "outerRadiusAuto", false);
            case "transition":
                return bool(node, "foreRadiusAuto", false) || bool(node, "aftRadiusAuto", false)
                        || Double.isNaN(JsonLite.dbl(node, "foreRadius", Double.NaN))
                        || Double.isNaN(JsonLite.dbl(node, "aftRadius", Double.NaN));
            default:
                return null;
        }
    }

    /** How many copies the kernel places of this node, and so of everything inside it. */
    private static int instancesOf(Map<String, Object> node) {
        String type = str(node, "type", "");
        switch (type) {
            case "podset":
            case "parallelstage":
                return count(node, "instanceCount", 2, MAX_INSTANCE_COUNT);
            case "launchlug":
            case "railbutton":
            case "centeringring":
            case "bulkhead":
            case "engineblock":
                return count(node, "instanceCount", 1, MAX_INSTANCE_COUNT);
            case "trapezoidfinset":
            case "ellipticalfinset":
            case "freeformfinset":
                return count(node, "finCount", 3, MAX_FIN_COUNT);
            case "tubefinset":
                return count(node, "finCount", 6, MAX_FIN_COUNT);
            case "innertube": {
                String cluster = str(node, "cluster", null);
                for (ClusterConfiguration known : ClusterConfiguration.CONFIGURATIONS) {
                    if (known.getXMLName().equals(cluster)) return known.getClusterCount();
                }
                return 1; // an unknown name is refused when the tube is built
            }
            default:
                return 1;
        }
    }

    private ComponentFactory() {}

    static RocketComponent create(Map<String, Object> node) {
        String type = str(node, "type", "");
        RocketComponent c;
        switch (type) {
            case "nosecone": {
                // Defaults match NoseCone() (NoseCone.java:27, :34; SymmetricComponent.java:24).
                NoseCone nose = new NoseCone(
                        shapeOf(str(node, "shape", "ogive")),
                        dbl(node, "length", 0.15),
                        dbl(node, "aftRadius", 0.025));
                nose.setThickness(dbl(node, "thickness", 0.002));
                double shapeParam = dbl(node, "shapeParameter", Double.NaN);
                if (!Double.isNaN(shapeParam)) {
                    nose.setShapeParameter(shapeParam);
                }
                nose.setFilled(bool(node, "filled", false));
                // Before the shoulder: setFlipped moves a shoulder through the clamping setter.
                nose.setFlipped(bool(node, "flipped", false));
                // Unclamped, as desktop's .ork loader (DocumentConfig "Transition:aftshoulderradius").
                double shR = dbl(node, "shoulderRadius", Double.NaN);
                if (!Double.isNaN(shR)) {
                    nose.setShoulderRadius(shR, false);
                }
                double shL = dbl(node, "shoulderLength", Double.NaN);
                if (!Double.isNaN(shL)) {
                    nose.setShoulderLength(shL);
                }
                // Always set, after the length: setShoulderLength seeds a new shoulder with the part's wall.
                nose.setShoulderThickness(dbl(node, "shoulderThickness", 0));
                nose.setShoulderCapped(bool(node, "shoulderCapped", false));
                // `aftRadiusAuto` means the base, which is the fore end when flipped.
                if (bool(node, "aftRadiusAuto", false)) {
                    nose.setBaseRadiusAutomatic(true);
                }
                c = nose;
                break;
            }
            case "transition": {
                Transition t = new Transition();
                t.setShapeType(shapeOf(str(node, "shape", "conical")));
                // Must follow setShapeType, which resets it to the default.
                double shapeParam = dbl(node, "shapeParameter", Double.NaN);
                if (!Double.isNaN(shapeParam)) {
                    t.setShapeParameter(shapeParam);
                }
                // Absent keeps setShapeType's default (clipped where clippable), as desktop.
                Object clippedRaw = node.get("clipped");
                if (clippedRaw instanceof Boolean) {
                    t.setClipped((Boolean) clippedRaw);
                }
                // Defaults match Transition() (Transition.java:48; SymmetricComponent.java:25).
                t.setLength(dbl(node, "length", 0.075));
                double fore = dbl(node, "foreRadius", Double.NaN);
                if (bool(node, "foreRadiusAuto", false) || Double.isNaN(fore)) {
                    t.setForeRadiusAutomatic(true);
                } else {
                    t.setForeRadius(fore);
                }
                double aft = dbl(node, "aftRadius", Double.NaN);
                if (bool(node, "aftRadiusAuto", false) || Double.isNaN(aft)) {
                    t.setAftRadiusAutomatic(true);
                } else {
                    t.setAftRadius(aft);
                }
                t.setThickness(dbl(node, "thickness", 0.002));
                t.setFilled(bool(node, "filled", false));
                // Unclamped, as desktop's .ork loader: a clamp would cut an automatic end to DEFAULT_RADIUS.
                double fShR = dbl(node, "foreShoulderRadius", Double.NaN);
                if (!Double.isNaN(fShR)) {
                    t.setForeShoulderRadius(fShR, false);
                }
                double fShL = dbl(node, "foreShoulderLength", Double.NaN);
                if (!Double.isNaN(fShL)) {
                    t.setForeShoulderLength(fShL);
                }
                double aShR = dbl(node, "aftShoulderRadius", Double.NaN);
                if (!Double.isNaN(aShR)) {
                    t.setAftShoulderRadius(aShR, false);
                }
                double aShL = dbl(node, "aftShoulderLength", Double.NaN);
                if (!Double.isNaN(aShL)) {
                    t.setAftShoulderLength(aShL);
                }
                // Always set, after the lengths: they seed a new shoulder with the part's wall.
                t.setForeShoulderThickness(dbl(node, "foreShoulderThickness", 0));
                t.setAftShoulderThickness(dbl(node, "aftShoulderThickness", 0));
                // The nose cone's single `shoulderCapped` key is the aft fallback.
                t.setForeShoulderCapped(bool(node, "foreShoulderCapped", false));
                t.setAftShoulderCapped(bool(node, "aftShoulderCapped", bool(node, "shoulderCapped", false)));
                c = t;
                break;
            }
            case "bodytube": {
                // Defaults match BodyTube() (BodyTube.java:41; SymmetricComponent.java:24-25).
                BodyTube bodyTube = new BodyTube(
                        dbl(node, "length", 0.2),
                        dbl(node, "outerRadius", 0.025),
                        dbl(node, "thickness", 0.002));
                bodyTube.setMotorMount(bool(node, "motorMount", false));
                bodyTube.setMotorOverhang(dbl(node, "motorOverhang", 0));
                defaultIgnition(bodyTube, node);
                bodyTube.setFilled(bool(node, "filled", false));
                // After the constructor, which would turn the flag off.
                if (bool(node, "outerRadiusAuto", false)) {
                    bodyTube.setOuterRadiusAutomatic(true);
                }
                c = bodyTube;
                break;
            }
            case "trapezoidfinset": {
                // Defaults match TrapezoidFinSet() (TrapezoidFinSet.java:43).
                TrapezoidFinSet fins = new TrapezoidFinSet(
                        count(node, "finCount", 3, MAX_FIN_COUNT),
                        dbl(node, "rootChord", 0.05),
                        dbl(node, "tipChord", 0.05),
                        dbl(node, "sweep", 0.025),
                        dbl(node, "height", 0.03));
                fins.setThickness(dbl(node, "thickness", 0.003));
                fins.setCantAngle(dbl(node, "cant", 0));
                fins.setCrossSection(crossSectionOf(str(node, "crossSection", "square")));
                c = fins;
                break;
            }
            case "ellipticalfinset": {
                EllipticalFinSet fins = new EllipticalFinSet();
                fins.setFinCount(count(node, "finCount", 3, MAX_FIN_COUNT));
                // Defaults match EllipticalFinSet() (EllipticalFinSet.java:30-33).
                fins.setLength(dbl(node, "rootChord", 0.05));
                fins.setHeight(dbl(node, "height", 0.05));
                fins.setThickness(dbl(node, "thickness", 0.003));
                fins.setCantAngle(dbl(node, "cant", 0));
                fins.setCrossSection(crossSectionOf(str(node, "crossSection", "square")));
                c = fins;
                break;
            }
            case "freeformfinset": {
                FreeformFinSet fins = new FreeformFinSet();
                fins.setFinCount(count(node, "finCount", 3, MAX_FIN_COUNT));
                fins.setThickness(dbl(node, "thickness", 0.003));
                fins.setCantAngle(dbl(node, "cant", 0));
                fins.setCrossSection(crossSectionOf(str(node, "crossSection", "square")));
                Object rawPoints = node.get("points");
                if (rawPoints instanceof List) {
                    List<?> list = (List<?>) rawPoints;
                    if (list.size() > MAX_FIN_POINTS) {
                        throw new IllegalArgumentException("freeformfinset has " + list.size()
                                + " points; the limit is " + MAX_FIN_POINTS);
                    }
                    Coordinate[] pts = new Coordinate[list.size()];
                    for (int i = 0; i < list.size(); i++) {
                        Object row = list.get(i);
                        if (!(row instanceof List) || ((List<?>) row).size() < 2
                                || !(((List<?>) row).get(0) instanceof Double)
                                || !(((List<?>) row).get(1) instanceof Double)) {
                            throw new IllegalArgumentException(
                                    "freeformfinset points must be [[x,y],...] numbers");
                        }
                        double x = (Double) ((List<?>) row).get(0);
                        double y = (Double) ((List<?>) row).get(1);
                        // As dbl: the kernel snaps only past +2.5 m, so a far negative point reached the
                        // fin's area and inertia sums unchecked.
                        if (Math.abs(x) > MAX_MAGNITUDE || Math.abs(y) > MAX_MAGNITUDE) {
                            throw new IllegalArgumentException("freeformfinset point " + i
                                    + " is out of range (the limit is " + MAX_MAGNITUDE + ")");
                        }
                        pts[i] = new Coordinate(x, y, 0);
                    }
                    if (pts.length < 3) {
                        throw new IllegalArgumentException(
                                "freeformfinset needs at least 3 points");
                    }
                    fins.setPoints(pts);
                    // The kernel silently rolls a self-intersecting outline back to the default fin.
                    if (fins.isOutlineRefused()) {
                        String finName = str(node, "name", "freeform fin set");
                        throw new IllegalArgumentException("Fin set \"" + finName
                                + "\": its outline crosses or touches itself, so it cannot"
                                + " be simulated. Redraw it in the fin editor.");
                    }
                }
                c = fins;
                break;
            }
            case "tubefinset": {
                TubeFinSet fins = new TubeFinSet();
                fins.setFinCount(count(node, "finCount", 6, MAX_FIN_COUNT));
                fins.setLength(dbl(node, "length", 0.1));
                double or = dbl(node, "outerRadius", Double.NaN);
                if (!Double.isNaN(or)) {
                    fins.setOuterRadius(or);
                }
                // TubeFinSet is not a FinSet, so the common rotation below misses it.
                double tubeRot = dbl(node, "rotation", 0);
                if (tubeRot != 0) {
                    fins.setBaseRotation(tubeRot);
                }
                c = fins;
                break;
            }
            case "innertube": {
                InnerTube tube = new InnerTube();
                tube.setLength(dbl(node, "length", 0.07));
                tube.setOuterRadius(dbl(node, "outerRadius", 0.0095));
                tube.setThickness(dbl(node, "thickness", 0.0005));
                tube.setMotorMount(bool(node, "motorMount", false));
                tube.setMotorOverhang(dbl(node, "motorOverhang", 0));
                defaultIgnition(tube, node);
                String clusterName = str(node, "cluster", null);
                if (clusterName != null && !clusterName.isEmpty()) {
                    ClusterConfiguration cc = null;
                    for (ClusterConfiguration known : ClusterConfiguration.CONFIGURATIONS) {
                        if (known.getXMLName().equals(clusterName)) {
                            cc = known;
                            break;
                        }
                    }
                    if (cc == null) {
                        throw new IllegalArgumentException("Unknown cluster configuration: " + clusterName);
                    }
                    tube.setClusterConfiguration(cc);
                    tube.setClusterScale(dbl(node, "clusterScale", 1.0));
                    tube.setClusterRotation(dbl(node, "clusterRotation", 0.0));
                }
                // Applies without a cluster too: desktop's split cluster leaves offset single tubes.
                tube.setRadialPosition(dbl(node, "radialPosition", 0.0));
                tube.setRadialDirection(dbl(node, "radialDirection", 0.0));
                c = tube;
                break;
            }
            case "tubecoupler": {
                // Defaults match TubeCoupler() (TubeCoupler.java:12-14).
                TubeCoupler tc = new TubeCoupler();
                tc.setLength(dbl(node, "length", 0.06));
                double or = dbl(node, "outerRadius", Double.NaN);
                if (Double.isNaN(or)) {
                    tc.setOuterRadiusAutomatic(true);
                } else {
                    tc.setOuterRadius(or);
                }
                tc.setThickness(dbl(node, "thickness", 0.002));
                c = tc;
                break;
            }
            case "centeringring": {
                CenteringRing ring = new CenteringRing();
                ring.setLength(dbl(node, "length", 0.002));
                double or = dbl(node, "outerRadius", Double.NaN);
                if (!Double.isNaN(or)) {
                    ring.setOuterRadius(or);
                }
                double ir = dbl(node, "innerRadius", Double.NaN);
                if (!Double.isNaN(ir)) {
                    ring.setInnerRadius(ir);
                }
                c = ring;
                break;
            }
            case "bulkhead": {
                Bulkhead b = new Bulkhead();
                b.setLength(dbl(node, "length", 0.002));
                double or = dbl(node, "outerRadius", Double.NaN);
                if (!Double.isNaN(or)) {
                    b.setOuterRadius(or);
                }
                c = b;
                break;
            }
            case "engineblock": {
                // Defaults match EngineBlock() (EngineBlock.java:15-17).
                EngineBlock eb = new EngineBlock();
                eb.setLength(dbl(node, "length", 0.005));
                double or = dbl(node, "outerRadius", Double.NaN);
                if (!Double.isNaN(or)) {
                    eb.setOuterRadius(or);
                }
                eb.setThickness(dbl(node, "thickness", 0.005));
                c = eb;
                break;
            }
            case "launchlug": {
                // Defaults match LaunchLug() (LaunchLug.java:35-37).
                LaunchLug lug = new LaunchLug();
                lug.setLength(dbl(node, "length", 0.03));
                lug.setOuterRadius(dbl(node, "outerRadius", 0.005));
                lug.setThickness(dbl(node, "thickness", 0.001));
                lug.setAngleOffset(dbl(node, "angleOffset", Math.PI));
                c = lug;
                break;
            }
            case "railbutton": {
                RailButton rb = new RailButton();
                double od = dbl(node, "outerDiameter", Double.NaN);
                if (!Double.isNaN(od)) {
                    rb.setOuterDiameter(od);
                }
                rb.setAngleOffset(dbl(node, "angleOffset", Math.PI));
                // The height setters clamp against each other: clear base and flange before the total.
                double rbH = dbl(node, "height", rb.getTotalHeight());
                double rbBase = dbl(node, "baseHeight", rb.getBaseHeight());
                double rbFlange = dbl(node, "flangeHeight", rb.getFlangeHeight());
                rb.setBaseHeight(0);
                rb.setFlangeHeight(0);
                rb.setTotalHeight(rbH);
                rb.setBaseHeight(rbBase);
                rb.setFlangeHeight(rbFlange);
                double rbId = dbl(node, "innerDiameter", Double.NaN);
                if (!Double.isNaN(rbId)) {
                    rb.setInnerDiameter(rbId);
                }
                double rbScrew = dbl(node, "screwHeight", Double.NaN);
                if (!Double.isNaN(rbScrew)) {
                    rb.setScrewHeight(rbScrew);
                }
                c = rb;
                break;
            }
            case "parachute": {
                Parachute p = new Parachute();
                p.setLength(dbl(node, "length", 0.025));
                double pR = dbl(node, "radius", Double.NaN);
                if (!Double.isNaN(pR)) {
                    p.setRadius(pR);
                }
                p.setDiameter(dbl(node, "diameter", 0.3));
                double cd = dbl(node, "cd", Double.NaN);
                if (!Double.isNaN(cd)) {
                    p.setCD(cd);
                }
                p.setLineCount(count(node, "lineCount", 6, 0, MAX_LINE_COUNT));
                p.setLineLength(dbl(node, "lineLength", 0.3));
                double chuteSurf = dbl(node, "surfaceDensity", Double.NaN);
                if (!Double.isNaN(chuteSurf)) {
                    p.setMaterial(Material.newMaterial(Material.Type.SURFACE,
                            str(node, "surfaceMaterialName", "custom"), chuteSurf, true));
                }
                double chuteLine = dbl(node, "lineDensity", Double.NaN);
                if (!Double.isNaN(chuteLine)) {
                    p.setLineMaterial(Material.newMaterial(Material.Type.LINE,
                            str(node, "lineMaterialName", "custom"), chuteLine, true));
                }
                p.setDrogue(bool(node, "drogue", false));
                applyDeployment(p, node);
                c = p;
                break;
            }
            case "streamer": {
                Streamer s = new Streamer();
                s.setLength(dbl(node, "length", 0.025));
                double sR = dbl(node, "radius", Double.NaN);
                if (!Double.isNaN(sR)) {
                    s.setRadius(sR);
                }
                s.setStripLength(dbl(node, "stripLength", 0.5));
                s.setStripWidth(dbl(node, "stripWidth", 0.05));
                double cd = dbl(node, "cd", Double.NaN);
                if (!Double.isNaN(cd)) {
                    s.setCD(cd);
                }
                double streamerSurf = dbl(node, "surfaceDensity", Double.NaN);
                if (!Double.isNaN(streamerSurf)) {
                    s.setMaterial(Material.newMaterial(Material.Type.SURFACE,
                            str(node, "surfaceMaterialName", "custom"), streamerSurf, true));
                }
                s.setDrogue(bool(node, "drogue", false));
                applyDeployment(s, node);
                c = s;
                break;
            }
            case "shockcord": {
                ShockCord sc = new ShockCord();
                sc.setLength(dbl(node, "length", 0.025));
                double scR = dbl(node, "radius", Double.NaN);
                if (!Double.isNaN(scR)) {
                    sc.setRadius(scR);
                }
                // Default matches ShockCord() (ShockCord.java:22).
                sc.setCordLength(dbl(node, "cordLength", 0.4));
                double cordLine = dbl(node, "lineDensity", Double.NaN);
                if (!Double.isNaN(cordLine)) {
                    sc.setMaterial(Material.newMaterial(Material.Type.LINE,
                            str(node, "lineMaterialName", "custom"), cordLine, true));
                }
                c = sc;
                break;
            }
            case "masscomponent": {
                // Defaults match MassComponent() (MassComponent.java:17; MassObject.java:38).
                MassComponent m = new MassComponent();
                m.setComponentMass(dbl(node, "mass", 0));
                m.setLength(dbl(node, "length", 0.025));
                m.setRadius(dbl(node, "radius", 0.0125));
                m.setMassComponentType(massComponentTypeOf(str(node, "massComponentType", "masscomponent")));
                c = m;
                break;
            }
            case "podset": {
                // Geometry is applied post-attach (applyAssembly): the setters NPE without a parent.
                c = new PodSet();
                break;
            }
            case "parallelstage": {
                c = new ParallelStage();
                break;
            }
            // App-only element (desktop skips it); a MassComponent has no frontal drag. See ATTRIBUTION.md.
            case "fairing": {
                MassComponent f = new MassComponent();
                f.setComponentMass(dbl(node, "mass", 0.03));
                f.setLength(dbl(node, "length", 0.08));
                double w = dbl(node, "width", 0.025);
                double hgt = dbl(node, "height", 0.02);
                f.setRadius(Math.max(w, hgt) / 2);
                c = f;
                break;
            }
            default:
                throw new IllegalArgumentException("Unknown component type: '" + type + "'");
        }

        String name = str(node, "name", null);
        if (name != null) {
            c.setName(name);
        }
        double density = dbl(node, "density", Double.NaN);
        if (!Double.isNaN(density) && density > 0) {
            Material m = Material.newMaterial(Material.Type.BULK,
                    str(node, "materialName", "custom"), density, true);
            if (c instanceof ExternalComponent) {
                ((ExternalComponent) c).setMaterial(m);
            } else if (c instanceof StructuralComponent) {
                ((StructuralComponent) c).setMaterial(m);
            }
        }
        String finish = str(node, "finish", null);
        if (finish != null && c instanceof ExternalComponent) {
            ((ExternalComponent) c).setFinish(finishOf(finish));
        }
        String comment = str(node, "comment", null);
        if (comment != null) {
            c.setComment(comment);
        }
        if (c instanceof FinSet) {
            FinSet fs = (FinSet) c;
            double rot = dbl(node, "rotation", 0);
            if (rot != 0) {
                fs.setBaseRotation(rot);
            }
            String section = str(node, "airfoilSection", null);
            if (section != null) {
                String s = section.toLowerCase();
                // Otherwise FinSetCalc throws UnsupportedOperationException mid-simulation.
                switch (s) {
                    case "hexagonal":
                    case "naca":
                    case "doublewedge":
                    case "biconvex":
                    case "hexbluntbase":
                    case "singlewedge":
                        break;
                    default:
                        throw new IllegalArgumentException(
                                "Unknown airfoilSection '" + section + "'");
                }
                fs.setAirfoilSection(s);
            }
            fs.setAirfoilLeDiamond(dbl(node, "airfoilLeDiamond", 0));
            fs.setAirfoilTeDiamond(dbl(node, "airfoilTeDiamond", 0));
            fs.setFinLeRadius(dbl(node, "finLeRadius", 0));
            double filletRadius = dbl(node, "filletRadius", 0);
            if (filletRadius > 0) {
                fs.setFilletRadius(filletRadius);
            }
            // Kept even at a 0 radius, as desktop does.
            double filletDensity = dbl(node, "filletDensity", Double.NaN);
            if (!Double.isNaN(filletDensity) && filletDensity > 0) {
                fs.setFilletMaterial(Material.newMaterial(Material.Type.BULK,
                        str(node, "filletMaterialName", "custom"), filletDensity, true));
            }
        }
        // Assemblies are RingInstanceable and are set post-attach in applyAssembly.
        if (c instanceof LineInstanceable && !(c instanceof RingInstanceable)) {
            LineInstanceable line = (LineInstanceable) c;
            line.setInstanceCount(count(node, "instanceCount", 1, MAX_INSTANCE_COUNT));
            double sep = dbl(node, "instanceSeparation", Double.NaN);
            if (!Double.isNaN(sep)) {
                line.setInstanceSeparation(sep);
            }
        }
        if (c instanceof RingComponent) {
            RingComponent rc = (RingComponent) c;
            rc.setRadialPosition(dbl(node, "radialPosition", 0));
            rc.setRadialDirection(dbl(node, "radialDirection", 0));
        } else if (c instanceof MassObject) {
            MassObject mo = (MassObject) c;
            mo.setRadialPosition(dbl(node, "radialPosition", 0));
            mo.setRadialDirection(dbl(node, "radialDirection", 0));
        }
        // After the explicit radii, which turn the flag off. Leaf casts: RingComponent's setters are protected.
        boolean autoOuter = bool(node, "outerRadiusAuto", false);
        if (autoOuter) {
            if (c instanceof CenteringRing) {
                ((CenteringRing) c).setOuterRadiusAutomatic(true);
            } else if (c instanceof Bulkhead) {
                ((Bulkhead) c).setOuterRadiusAutomatic(true);
            } else if (c instanceof TubeCoupler) {
                ((TubeCoupler) c).setOuterRadiusAutomatic(true);
            } else if (c instanceof EngineBlock) {
                ((EngineBlock) c).setOuterRadiusAutomatic(true);
            } else if (c instanceof TubeFinSet) {
                ((TubeFinSet) c).setOuterRadiusAutomatic(true);
            }
        }
        if (c instanceof CenteringRing && bool(node, "innerRadiusAuto", false)) {
            ((CenteringRing) c).setInnerRadiusAutomatic(true);
        }
        if (c instanceof MassObject && bool(node, "radiusAuto", false)) {
            ((MassObject) c).setRadiusAutomatic(true);
        }
        if (c instanceof RecoveryDevice && bool(node, "cdAuto", false)) {
            ((RecoveryDevice) c).setCDAutomatic(true);
        }
        if (c instanceof Parachute && bool(node, "lineLengthAuto", false)) {
            ((Parachute) c).setLineLengthAutomatic(true);
        }
        if (c instanceof ShockCord && bool(node, "cordLengthAuto", false)) {
            ((ShockCord) c).setCordLengthAutomatic(true);
        }
        applyOverrides(c, node);
        Map<String, Object> position = obj(node, "position");
        // Assemblies NPE in setAxialMethod without a parent; applyAssembly places them.
        if (position != null && !(c instanceof ComponentAssembly)) {
            c.setAxialMethod(axialMethodOf(str(position, "method", "top")));
            c.setAxialOffset(dbl(position, "offset", 0));
        }
        return c;
    }

    static void applyOverrides(RocketComponent c, Map<String, Object> node) {
        double overrideMass = dbl(node, "overrideMass", Double.NaN);
        if (!Double.isNaN(overrideMass)) {
            c.setOverrideMass(overrideMass);
            c.setMassOverridden(true);
        }
        double overrideCGX = dbl(node, "overrideCGX", Double.NaN);
        if (!Double.isNaN(overrideCGX)) {
            c.setOverrideCGX(overrideCGX);
            c.setCGOverridden(true);
        }
        double overrideCD = dbl(node, "overrideCD", Double.NaN);
        if (!Double.isNaN(overrideCD)) {
            c.setOverrideCD(overrideCD);
            c.setCDOverridden(true);
        }
        if (bool(node, "overrideSubcomponentsMass", false)) {
            c.setSubcomponentsOverriddenMass(true);
        }
        if (bool(node, "overrideSubcomponentsCG", false)) {
            c.setSubcomponentsOverriddenCG(true);
        }
        if (bool(node, "overrideSubcomponentsCD", false)) {
            c.setSubcomponentsOverriddenCD(true);
        }
    }

    // deployAltitude is m AGL.
    private static void applyDeployment(RecoveryDevice device, Map<String, Object> node) {
        DeploymentConfiguration config = device.getDeploymentConfigurations().getDefault();
        String event = str(node, "deployEvent", null);
        if (event != null) {
            config.setDeployEvent(deployEventOf(event));
        }
        double altitude = dbl(node, "deployAltitude", Double.NaN);
        if (!Double.isNaN(altitude)) {
            config.setDeployAltitude(altitude);
        }
        double delay = dbl(node, "deployDelay", Double.NaN);
        if (!Double.isNaN(delay)) {
            config.setDeployDelay(delay);
        }
    }

    // Changes no flight: setMotorById ignores it, so the app copies it into each motor itself.
    private static void defaultIgnition(MotorMount mount, Map<String, Object> node) {
        MotorConfiguration config = mount.getDefaultMotorConfig();
        String event = str(node, "ignitionEvent", null);
        if (event != null) {
            config.setIgnitionEvent(OpenRocketEngine.ignitionEventOf(event));
        }
        double delay = dbl(node, "ignitionDelay", Double.NaN);
        if (!Double.isNaN(delay)) {
            config.setIgnitionDelay(delay);
        }
    }

    // Desktop writes `lowerstageseparation`.
    private static String enumKey(String name) {
        return name.toLowerCase().replace("_", "");
    }

    private static DeploymentConfiguration.DeployEvent deployEventOf(String name) {
        switch (enumKey(name)) {
            case "launch": return DeploymentConfiguration.DeployEvent.LAUNCH;
            case "ejection": return DeploymentConfiguration.DeployEvent.EJECTION;
            case "apogee": return DeploymentConfiguration.DeployEvent.APOGEE;
            case "altitude": return DeploymentConfiguration.DeployEvent.ALTITUDE;
            case "lowerstageseparation": return DeploymentConfiguration.DeployEvent.LOWER_STAGE_SEPARATION;
            case "never": return DeploymentConfiguration.DeployEvent.NEVER;
            default:
                throw new IllegalArgumentException("Unknown deploy event: '" + name + "' (expected one of launch, ejection, apogee, altitude, lower_stage_separation, never)");
        }
    }

    private static ExternalComponent.Finish finishOf(String name) {
        switch (enumKey(name)) {
            case "rough": return ExternalComponent.Finish.ROUGH;
            case "roughunfinished": return ExternalComponent.Finish.ROUGHUNFINISHED;
            case "unfinished": return ExternalComponent.Finish.UNFINISHED;
            case "normal":
            case "regular": return ExternalComponent.Finish.NORMAL;
            case "smooth": return ExternalComponent.Finish.SMOOTH;
            case "polished": return ExternalComponent.Finish.POLISHED;
            case "finishpolished": return ExternalComponent.Finish.FINISHPOLISHED;
            case "optimum": return ExternalComponent.Finish.OPTIMUM;
            case "mirror": return ExternalComponent.Finish.MIRROR;
            default:
                throw new IllegalArgumentException("Unknown surface finish: '" + name + "' (expected one of rough, roughunfinished, unfinished, normal, smooth, polished, finishpolished, optimum, mirror)");
        }
    }

    static void attachChildren(RocketComponent parent, Map<String, Object> node,
            Map<String, RocketComponent> idIndex, Map<AxialStage, Double> nozzleDia) {
        List<Map<String, Object>> kids = JsonLite.objList(node, "children");
        for (Map<String, Object> kid : kids) {
            RocketComponent child = create(kid);
            parent.addChild(child);
            applyWallThickness(child, kid);
            // Not RingInstanceable: FinSet and SymmetricComponent are too, and would get the pod count.
            if (child instanceof ComponentAssembly) {
                applyAssembly(child, kid, nozzleDia);
            }
            if (child instanceof FinSet) {
                applyFinTabs((FinSet) child, kid);
            }
            String id = str(kid, "id", null);
            if (id != null) {
                idIndex.put(id, child);
            }
            attachChildren(child, kid, idIndex, nozzleDia);
        }
    }

    // setThickness clamps against an automatic outer radius that resolves only after addChild.
    private static void applyWallThickness(RocketComponent child, Map<String, Object> node) {
        if (child instanceof TubeCoupler) {
            ((TubeCoupler) child).setThickness(dbl(node, "thickness", 0.002));
        } else if (child instanceof EngineBlock) {
            ((EngineBlock) child).setThickness(dbl(node, "thickness", 0.005));
        } else if (child instanceof TubeFinSet) {
            double th = dbl(node, "thickness", Double.NaN);
            if (!Double.isNaN(th)) {
                ((TubeFinSet) child).setThickness(th);
            }
        }
    }

    // Post-attach: setTabHeight() clamps against the parent body radius.
    private static void applyFinTabs(FinSet fins, Map<String, Object> node) {
        double tabHeight = dbl(node, "tabHeight", 0);
        double tabLength = dbl(node, "tabLength", 0);
        if (tabHeight <= 0 || tabLength <= 0) {
            return;
        }
        fins.setTabOffsetMethod(axialMethodOf(str(node, "tabOffsetMethod", "middle")));
        fins.setTabLength(tabLength);
        fins.setTabOffset(dbl(node, "tabOffset", 0));
        fins.setTabHeight(tabHeight);
    }

    // Desktop parity: its .ork loader reads `<isflipped>` last, after attach.
    static void settleFlippedShoulders(Map<String, Object> node, Map<String, RocketComponent> idIndex) {
        for (Map<String, Object> kid : JsonLite.objList(node, "children")) {
            String id = str(kid, "id", null);
            RocketComponent c = id == null ? null : idIndex.get(id);
            if (c instanceof NoseCone && ((NoseCone) c).isFlipped()) {
                NoseCone nose = (NoseCone) c;
                double r = dbl(kid, "shoulderRadius", Double.NaN);
                if (!Double.isNaN(r)) nose.setShoulderRadius(r);
                nose.setShoulderThickness(dbl(kid, "shoulderThickness", 0));
            }
            settleFlippedShoulders(kid, idIndex);
        }
    }

    // Reapplied once built: the build clamp used a radius that may not have settled.
    static void settleFinTabs(Map<String, Object> node, Map<String, RocketComponent> idIndex) {
        for (Map<String, Object> kid : JsonLite.objList(node, "children")) {
            String id = str(kid, "id", null);
            RocketComponent c = id == null ? null : idIndex.get(id);
            // Zeroed first: setTabHeight returns early on an unchanged depth.
            if (c instanceof FinSet && dbl(kid, "tabHeight", 0) > 0 && dbl(kid, "tabLength", 0) > 0) {
                ((FinSet) c).setTabHeight(0, false);
                ((FinSet) c).setTabHeight(dbl(kid, "tabHeight", 0));
            }
            settleFinTabs(kid, idIndex);
        }
    }

    // After addChild: these setters NPE with no parent. Never setRadius(method,value): it double-subtracts the parent radius.
    private static void applyAssembly(RocketComponent child, Map<String, Object> node,
            Map<AxialStage, Double> nozzleDia) {
        RingInstanceable ring = (RingInstanceable) child;
        ring.setInstanceCount(count(node, "instanceCount", 2, MAX_INSTANCE_COUNT));
        ring.setRadiusMethod(radiusMethodOf(str(node, "radiusMethod", "relative")));
        ring.setRadiusOffset(dbl(node, "radiusOffset", 0));
        ring.setAngleOffset(dbl(node, "angleOffset", 0));
        if (child instanceof ParallelStage) {
            ring.setAngleMethod(angleMethodOf(str(node, "angleMethod", "relative")));
        }
        Map<String, Object> position = obj(node, "position");
        if (position != null) {
            child.setAxialMethod(axialMethodOf(str(position, "method", "bottom")));
            child.setAxialOffset(dbl(position, "offset", 0));
        }
        if (child instanceof ParallelStage) {
            OpenRocketEngine.applySeparationConfig((AxialStage) child, node, nozzleDia);
        }
    }

    private static RadiusMethod radiusMethodOf(String name) {
        switch (enumKey(name)) {
            case "free": return RadiusMethod.FREE;
            case "surface": return RadiusMethod.SURFACE;
            case "coaxial": return RadiusMethod.COAXIAL;
            case "relative": return RadiusMethod.RELATIVE;
            default:
                throw new IllegalArgumentException("Unknown radius method: '" + name + "' (expected one of relative, free, surface, coaxial)");
        }
    }

    private static AngleMethod angleMethodOf(String name) {
        switch (enumKey(name)) {
            case "relative": return AngleMethod.RELATIVE;
            case "fixed": return AngleMethod.FIXED;
            case "mirrorxy": return AngleMethod.MIRROR_XY;
            default:
                throw new IllegalArgumentException("Unknown angle method: '" + name + "' (expected one of relative, fixed, mirror_xy)");
        }
    }

    static Transition.Shape shapeOf(String name) {
        switch (enumKey(name)) {
            case "conical": return Transition.Shape.CONICAL;
            case "ogive": return Transition.Shape.OGIVE;
            case "ellipsoid": return Transition.Shape.ELLIPSOID;
            case "power": return Transition.Shape.POWER;
            case "parabolic": return Transition.Shape.PARABOLIC;
            case "haack": return Transition.Shape.HAACK;
            default:
                throw new IllegalArgumentException("Unknown nose or transition shape: '" + name + "' (expected one of conical, ogive, ellipsoid, power, parabolic, haack)");
        }
    }

    private static MassComponent.MassComponentType massComponentTypeOf(String name) {
        switch (enumKey(name)) {
            case "masscomponent": return MassComponent.MassComponentType.MASSCOMPONENT;
            case "altimeter": return MassComponent.MassComponentType.ALTIMETER;
            case "flightcomputer": return MassComponent.MassComponentType.FLIGHTCOMPUTER;
            case "deploymentcharge": return MassComponent.MassComponentType.DEPLOYMENTCHARGE;
            case "tracker": return MassComponent.MassComponentType.TRACKER;
            case "payload": return MassComponent.MassComponentType.PAYLOAD;
            case "recoveryhardware": return MassComponent.MassComponentType.RECOVERYHARDWARE;
            case "battery": return MassComponent.MassComponentType.BATTERY;
            default:
                throw new IllegalArgumentException("Unknown mass component type: '" + name + "' (expected one of masscomponent, altimeter, flightcomputer, deploymentcharge, tracker, payload, recoveryhardware, battery)");
        }
    }

    private static FinSet.CrossSection crossSectionOf(String name) {
        switch (enumKey(name)) {
            case "square": return FinSet.CrossSection.SQUARE;
            case "rounded": return FinSet.CrossSection.ROUNDED;
            case "airfoil": return FinSet.CrossSection.AIRFOIL;
            default:
                throw new IllegalArgumentException("Unknown fin cross-section: '" + name + "' (expected one of square, rounded, airfoil)");
        }
    }

    private static AxialMethod axialMethodOf(String name) {
        switch (enumKey(name)) {
            case "top": return AxialMethod.TOP;
            case "middle": return AxialMethod.MIDDLE;
            case "bottom": return AxialMethod.BOTTOM;
            case "absolute": return AxialMethod.ABSOLUTE;
            case "after": return AxialMethod.AFTER;
            default:
                throw new IllegalArgumentException("Unknown position method: '" + name + "' (expected one of top, middle, bottom, absolute, after)");
        }
    }
}
