package ref;

import java.util.Collections;
import java.util.Locale;
import java.util.Set;

import com.google.inject.AbstractModule;
import com.google.inject.Guice;
import com.google.inject.Injector;
import com.google.inject.Module;
import com.google.inject.util.Modules;

import info.openrocket.core.formatting.RocketDescriptor;
import info.openrocket.core.formatting.RocketDescriptorImpl;
import info.openrocket.core.l10n.ResourceBundleTranslator;
import info.openrocket.core.l10n.Translator;
import info.openrocket.core.material.Material;
import info.openrocket.core.models.atmosphere.ExtendedISAModel;
import info.openrocket.core.plugin.PluginModule;
import info.openrocket.core.preferences.ApplicationPreferences;
import info.openrocket.core.preset.ComponentPreset;
import info.openrocket.core.startup.Application;

/** Mirrors upstream's {@code ServicesForTesting} Guice wiring (core/src/test, outside the sparse checkout). */
public final class Bootstrap {

    private Bootstrap() {
    }

    private static boolean done;

    public static synchronized void init() {
        if (done) {
            return;
        }
        // As upstream's test translator does; also avoids a Turkish-locale toLowerCase.
        Locale.setDefault(Locale.US);

        Module application = new AbstractModule() {
            @Override
            protected void configure() {
                bind(ApplicationPreferences.class).to(ReferencePreferences.class);
                bind(Translator.class).toInstance(new ResourceBundleTranslator("l10n.messages"));
                bind(RocketDescriptor.class).to(RocketDescriptorImpl.class);
            }
        };
        Injector injector = Guice.createInjector(Modules.override(application).with(new PluginModule()));
        Application.setInjector(injector);
        done = true;
    }

    /** Matches upstream's PreferencesForTesting, except unknown keys return the default, not 0. */
    public static class ReferencePreferences extends ApplicationPreferences {

        private static java.util.prefs.Preferences root;

        @Override
        public boolean getBoolean(String key, boolean defaultValue) {
            return defaultValue;
        }

        @Override
        public void putBoolean(String key, boolean value) {
        }

        @Override
        public int getInt(String key, int defaultValue) {
            return defaultValue;
        }

        @Override
        public void putInt(String key, int value) {
        }

        @Override
        public double getDouble(String key, double defaultValue) {
            if (ApplicationPreferences.LAUNCH_TEMPERATURE.equals(key)) {
                return ExtendedISAModel.STANDARD_TEMPERATURE;
            }
            if (ApplicationPreferences.LAUNCH_PRESSURE.equals(key)) {
                return ExtendedISAModel.STANDARD_PRESSURE;
            }
            if (ApplicationPreferences.LAUNCH_RELATIVE_HUMIDITY.equals(key)) {
                return ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY;
            }
            if (ApplicationPreferences.CONSTANT_GRAVITY_VALUE.equals(key)) {
                return 9.807;
            }
            return defaultValue;
        }

        @Override
        public void putDouble(String key, double value) {
        }

        @Override
        public String getString(String key, String defaultValue) {
            return defaultValue;
        }

        @Override
        public void putString(String key, String value) {
        }

        @Override
        public String getString(String directory, String key, String defaultValue) {
            return defaultValue;
        }

        @Override
        public void putString(String directory, String key, String value) {
        }

        @Override
        public void addUserMaterial(Material m) {
        }

        @Override
        public Set<Material> getUserMaterials() {
            return Collections.emptySet();
        }

        @Override
        public void removeUserMaterial(Material m) {
        }

        @Override
        public void setComponentFavorite(ComponentPreset preset, ComponentPreset.Type type, boolean favorite) {
        }

        @Override
        public Set<String> getComponentFavorites(ComponentPreset.Type type) {
            return Collections.emptySet();
        }

        @Override
        public java.util.prefs.Preferences getNode(String nodeName) {
            return base().node(nodeName);
        }

        @Override
        public java.util.prefs.Preferences getPreferences() {
            return base();
        }

        // A scratch node, so a real OpenRocket install's preferences are never touched.
        private static synchronized java.util.prefs.Preferences base() {
            if (root == null) {
                root = java.util.prefs.Preferences.userRoot()
                        .node("OpenRocket-reference-" + System.nanoTime());
            }
            return root;
        }
    }
}
