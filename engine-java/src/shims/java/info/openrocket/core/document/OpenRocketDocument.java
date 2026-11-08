package info.openrocket.core.document;

import info.openrocket.core.preferences.DocumentPreferences;

/** SHIM: nothing calls Rocket.setDocument, so rocket.getDocument() is always null. */
public class OpenRocketDocument {

    private final DocumentPreferences docPrefs = new DocumentPreferences();

    public DocumentPreferences getDocumentPreferences() {
        return docPrefs;
    }
}
