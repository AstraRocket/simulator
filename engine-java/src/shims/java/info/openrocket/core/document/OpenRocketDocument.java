package info.openrocket.core.document;

import info.openrocket.core.preferences.DocumentPreferences;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.simulation.customexpression.CustomExpression;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** SHIM: nothing calls Rocket.setDocument, so rocket.getDocument() is always null. Custom expressions resolve here. */
public class OpenRocketDocument {

    private final DocumentPreferences docPrefs = new DocumentPreferences();
    private final List<CustomExpression> customExpressions = new ArrayList<>();

    public DocumentPreferences getDocumentPreferences() {
        return docPrefs;
    }

    public void addCustomExpression(CustomExpression expression) {
        customExpressions.add(expression);
    }

    public List<CustomExpression> getCustomExpressions() {
        return customExpressions;
    }

    /** SHIM: upstream also adds simulation extensions' types; there are no extensions here. */
    public Set<FlightDataType> getFlightDataTypes() {
        Set<FlightDataType> allTypes = new LinkedHashSet<>();
        Collections.addAll(allTypes, FlightDataType.ALL_TYPES);
        for (CustomExpression exp : customExpressions) {
            allTypes.add(exp.getType());
        }
        return allTypes;
    }
}
