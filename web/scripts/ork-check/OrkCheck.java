import com.google.inject.Guice;
import com.google.inject.Injector;
import info.openrocket.core.document.OpenRocketDocument;
import info.openrocket.core.document.Simulation;
import info.openrocket.core.simulation.FlightData;
import info.openrocket.core.file.GeneralRocketLoader;
import info.openrocket.core.logging.Warning;
import info.openrocket.core.motor.MotorConfiguration;
import info.openrocket.core.plugin.PluginModule;
import info.openrocket.core.rocketcomponent.FlightConfiguration;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.startup.Application;
import info.openrocket.core.startup.CoreModule;

import java.io.File;

/**
 * Open a `.ork` or a RockSim `.rkt` in a real OpenRocket and print what it made
 * of it. GeneralRocketLoader picks the reader from the file's contents.
 *
 * The only check that asks the thing we are trying to satisfy. Our own tests can
 * prove the writer puts a part link or a motor digest in the file; they cannot
 * prove the desktop ACCEPTS it. A `<preset>` without the digest the desktop
 * computes is rejected, and a motor without one resolves to whichever entry
 * comes first; both are invisible from this side of the boundary and show up
 * only as a warning dialog on somebody's screen.
 *
 * Prints every component that came back carrying a catalog part, every motor
 * that resolved and the digest it resolved to, every simulation with the status
 * the loader gave it, and then the loader's own warning set. Exit code 1 if
 * there are any warnings, so this can gate a change.
 */
public class OrkCheck {
    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: OrkCheck <file.ork|file.rkt> [...]");
            System.exit(2);
        }
        CoreModule core = new CoreModule();
        Injector injector = Guice.createInjector(core, new PluginModule());
        Application.setInjector(injector);
        core.startLoader();

        int failed = 0;
        for (String path : args) {
            System.out.println("== " + path);
            GeneralRocketLoader loader = new GeneralRocketLoader(new File(path));
            OpenRocketDocument doc = loader.load();
            // A reader that understood none of the parts can still finish with
            // no warnings, so a rocket with nothing but stages fails too.
            int parts = 0;
            for (RocketComponent c : doc.getRocket()) {
                if (!(c instanceof info.openrocket.core.rocketcomponent.Rocket)
                        && !(c instanceof info.openrocket.core.rocketcomponent.AxialStage)) {
                    parts++;
                }
            }
            System.out.println("  " + parts + " components");
            if (parts == 0) {
                System.out.println("  FAILED: no components");
                failed++;
            }
            for (RocketComponent c : doc.getRocket()) {
                if (c.getPresetComponent() != null) {
                    System.out.println("  part  " + c.getName() + " -> "
                            + c.getPresetComponent().getManufacturer() + " "
                            + c.getPresetComponent().getPartNo());
                }
            }
            for (FlightConfiguration fc : doc.getRocket().getFlightConfigurations()) {
                for (MotorConfiguration mc : fc.getActiveMotors()) {
                    System.out.println("  motor " + mc.getMotor().getDesignation()
                            + " (" + mc.getMotor().getDigest() + ")");
                }
            }
            // Each simulation, with the status the loader gave it: LOADED means it
            // read a result summary, NOT_SIMULATED that there was none.
            for (Simulation sim : doc.getSimulations()) {
                FlightData d = sim.getSimulatedData();
                System.out.println("  sim   " + sim.getName() + " [" + sim.getStatus() + "] config "
                        + sim.getFlightConfigurationId().key
                        + (d != null ? " apogee " + d.getMaxAltitude() + " m" : ""));
            }
            if (loader.getWarnings().isEmpty()) {
                System.out.println("  no warnings");
            } else {
                for (Warning w : loader.getWarnings()) {
                    System.out.println("  WARNING: " + w);
                }
                failed++;
            }
        }
        System.exit(failed == 0 ? 0 : 1);
    }
}
