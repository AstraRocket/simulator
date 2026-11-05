package info.openrocket.core.util;

/** SHIM: TeaVM's UUID lacks the long-based API; methods must keep the JDK algorithms so ids match. */
public final class LongUUID implements Comparable<LongUUID> {

    private static long counter = 0x0123456789ABCDEFL;

    private final long mostSigBits;
    private final long leastSigBits;

    public LongUUID(long mostSigBits, long leastSigBits) {
        this.mostSigBits = mostSigBits;
        this.leastSigBits = leastSigBits;
    }

    /**
     * Deterministic on purpose for parity. The counter must go through mix: raw counters
     * alias MotorConfigurationId and defeat FlightConfigurationId.toShortKey().
     */
    public static LongUUID randomUUID() {
        long a = mix(counter++);
        long b = mix(counter++);
        long msb = (a & ~0xF000L) | 0x4000L;
        long lsb = (b & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new LongUUID(msb, lsb);
    }

    private static long mix(long z) {
        z += 0x9E3779B97F4A7C15L;
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }

    public static LongUUID fromString(String name) {
        String[] components = name.split("-");
        if (components.length != 5) {
            throw new IllegalArgumentException("Invalid UUID string: " + name);
        }
        long mostSigBits = Long.parseLong(components[0], 16);
        mostSigBits <<= 16;
        mostSigBits |= Long.parseLong(components[1], 16);
        mostSigBits <<= 16;
        mostSigBits |= Long.parseLong(components[2], 16);
        long leastSigBits = Long.parseLong(components[3], 16);
        leastSigBits <<= 48;
        leastSigBits |= Long.parseLong(components[4], 16);
        return new LongUUID(mostSigBits, leastSigBits);
    }

    public long getMostSignificantBits() {
        return mostSigBits;
    }

    public long getLeastSignificantBits() {
        return leastSigBits;
    }

    @Override
    public String toString() {
        return (digits(mostSigBits >> 32, 8) + "-"
                + digits(mostSigBits >> 16, 4) + "-"
                + digits(mostSigBits, 4) + "-"
                + digits(leastSigBits >> 48, 4) + "-"
                + digits(leastSigBits, 12));
    }

    private static String digits(long val, int digits) {
        long hi = 1L << (digits * 4);
        return Long.toHexString(hi | (val & (hi - 1))).substring(1);
    }

    @Override
    public int hashCode() {
        long hilo = mostSigBits ^ leastSigBits;
        return ((int) (hilo >> 32)) ^ (int) hilo;
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof LongUUID)) {
            return false;
        }
        LongUUID id = (LongUUID) obj;
        return (mostSigBits == id.mostSigBits && leastSigBits == id.leastSigBits);
    }

    @Override
    public int compareTo(LongUUID val) {
        return (this.mostSigBits < val.mostSigBits ? -1
                : (this.mostSigBits > val.mostSigBits ? 1
                        : (this.leastSigBits < val.leastSigBits ? -1
                                : (this.leastSigBits > val.leastSigBits ? 1 : 0))));
    }
}
