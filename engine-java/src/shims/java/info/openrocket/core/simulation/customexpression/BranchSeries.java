package info.openrocket.core.simulation.customexpression;

import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.util.LinearInterpolator;

import java.util.List;

/**
 * SHIM: a series against time, extended step by step. Upstream copies the whole series into a new
 * {@link LinearInterpolator} at every step; the values returned are the same.
 */
final class BranchSeries {

    private FlightDataBranch branch;
    private double[] x = new double[256];
    private double[] y = new double[256];
    private int n;
    private int read;
    /** Set when the times do not ascend, which the arrays cannot hold. */
    private LinearInterpolator unordered;

    /** False when the branch has no such series, or no points. */
    boolean update(FlightDataBranch from, FlightDataType type) {
        List<Double> time = from.getView(FlightDataType.TYPE_TIME);
        List<Double> data = from.getView(type);
        if (time == null || data == null || time.isEmpty()) {
            return false;
        }
        if (branch != from) {
            branch = from;
            n = 0;
            read = 0;
            unordered = null;
        }
        // The last point read may have been set again since.
        if (n > 0) {
            y[n - 1] = data.get(read - 1);
        }
        while (unordered == null && read < time.size()) {
            double t = time.get(read);
            double v = data.get(read);
            if (n > 0 && t == x[n - 1]) {
                y[n - 1] = v;
            } else if (n == 0 || t > x[n - 1]) {
                append(t, v);
            } else {
                unordered = new LinearInterpolator();
                break;
            }
            read++;
        }
        if (unordered != null) {
            unordered = new LinearInterpolator(time, data);
        }
        return true;
    }

    private void append(double t, double v) {
        if (n == x.length) {
            double[] x2 = new double[n * 2];
            double[] y2 = new double[n * 2];
            System.arraycopy(x, 0, x2, 0, n);
            System.arraycopy(y, 0, y2, 0, n);
            x = x2;
            y = y2;
        }
        x[n] = t;
        y[n] = v;
        n++;
    }

    double valueAt(double t) {
        if (unordered != null) {
            return unordered.getValue(t);
        }
        // The first point at or after t. A NaN is after them all, as in the interpolator.
        int lo = 0;
        int hi = n;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (x[mid] >= t) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return between(lo, t);
    }

    /** For times that ascend, as {@code ArrayUtils.range} makes them. */
    double[] valuesAt(double[] times) {
        double[] out = new double[times.length];
        int at = 0;
        for (int i = 0; i < out.length; i++) {
            if (unordered != null) {
                out[i] = unordered.getValue(times[i]);
                continue;
            }
            while (at < n && !(x[at] >= times[i])) {
                at++;
            }
            out[i] = between(at, times[i]);
        }
        return out;
    }

    /** {@code at} is the first point not before t. */
    private double between(int at, double t) {
        if (at == n) {
            return y[n - 1];
        }
        if (at == 0 || x[at] == t) {
            return y[at];
        }
        double x1 = x[at - 1];
        double y1 = y[at - 1];
        return (t - x1) / (x[at] - x1) * (y[at] - y1) + y1;
    }
}
