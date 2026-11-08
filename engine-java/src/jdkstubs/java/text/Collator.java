package java.text;

import java.util.Locale;

/**
 * SHIM for TeaVM (no Collator); must match JDK 21 Collator.getInstance(Locale.US), checked by ParityMain.collatorScenarios().
 * "H128W" and "H128-W" must compare equal at PRIMARY (DesignationComparator relies on it).
 */
public abstract class Collator implements java.util.Comparator<Object> {

    public static final int PRIMARY = 0;
    public static final int SECONDARY = 1;
    public static final int TERTIARY = 2;
    public static final int IDENTICAL = 3;

    // Ignored, but AlphanumComparator needs them; a missing member fails only at TeaVM link time.
    public static final int NO_DECOMPOSITION = 0;
    public static final int CANONICAL_DECOMPOSITION = 1;
    public static final int FULL_DECOMPOSITION = 2;

    private int strength = TERTIARY;
    private int decomposition = CANONICAL_DECOMPOSITION;

    protected Collator() {}

    /** New instance per call: callers set different strengths. */
    public static Collator getInstance() {
        return getInstance(Locale.getDefault());
    }

    public static Collator getInstance(Locale desiredLocale) {
        return new Collator() {
            @Override
            public int compare(String source, String target) {
                return compareAtStrength(this, source, target);
            }
        };
    }

    public abstract int compare(String source, String target);

    @Override
    public int compare(Object o1, Object o2) {
        return compare((String) o1, (String) o2);
    }

    public void setStrength(int newStrength) {
        this.strength = newStrength;
    }

    public int getStrength() {
        return strength;
    }

    public void setDecomposition(int mode) {
        this.decomposition = mode;
    }

    public int getDecomposition() {
        return decomposition;
    }

    public boolean equals(String source, String target) {
        return compare(source, target) == 0;
    }

    private static boolean isVariable(char c) {
        return c == '-' || c == ' ';
    }

    /** These sort ahead of '0' in the JDK; ignoring them would merge distinct motors. */
    private static char primaryWeight(char c) {
        switch (c) {
            case '_': return '\u0001';
            case '/': return '\u0002';
            case '.': return '\u0003';
            case '\'': return '\u0004';
            default: return Character.toLowerCase(c);
        }
    }

    private static String primaryKey(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!isVariable(c)) b.append(primaryWeight(c));
        }
        return b.toString();
    }

    private static String secondaryKey(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            b.append(c == ' ' ? 'b' : c == '-' ? 'c' : 'a');
        }
        return b.toString();
    }

    /** Lowercase sorts first, the opposite of compareTo. */
    private static String tertiaryKey(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            b.append(Character.isUpperCase(s.charAt(i)) ? '1' : '0');
        }
        return b.toString();
    }

    private static int compareAtStrength(Collator self, String source, String target) {
        int c = primaryKey(source).compareTo(primaryKey(target));
        if (c != 0 || self.strength == PRIMARY) return Integer.signum(c);

        c = secondaryKey(source).compareTo(secondaryKey(target));
        if (c != 0 || self.strength == SECONDARY) return Integer.signum(c);

        c = tertiaryKey(source).compareTo(tertiaryKey(target));
        if (c != 0 || self.strength == TERTIARY) return Integer.signum(c);

        return Integer.signum(source.compareTo(target));
    }
}
