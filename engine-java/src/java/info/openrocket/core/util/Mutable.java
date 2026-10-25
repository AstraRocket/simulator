package info.openrocket.core.util;

/**
 * A utility class helping an object to be made immutable after a certain point
 * of time.
 * An object should contain an instance of Mutable and an immute() method which
 * calls
 * {@link #immute()}. Additionally, every method that changes the state of the
 * object
 * should call {@link #check()} before modification.
 * 
 * @author Sampo Niskanen <sampo.niskanen@iki.fi>
 */
public class Mutable implements Cloneable {

	// PATCH(teavm-mutable-trace): a flag, not a Throwable recording where
	// immute() was called. TeaVM turns each Throwable into a JS Error, and V8
	// keeps the objects on its captured stack alive, so a frozen branch held its
	// whole finished simulation in memory. The trace carried no Java frames
	// under TeaVM anyway. check() keeps upstream's message; the exception has no
	// cause.
	private boolean immuted = false;

	/**
	 * Mark the object immutable. Once the object has been called the object
	 * cannot be made mutable again. Repeated calls to this method have no effect.
	 */
	public void immute() {
		immuted = true;
	}

	/**
	 * Check that the object is still mutable, and throw an exception if it is not.
	 * 
	 * @throws IllegalStateException if {@link #immute()} has been called for this
	 *                               object.
	 */
	public void check() {
		if (immuted) {
			throw new IllegalStateException("Object has been made immutable at null");
		}
	}

	/**
	 * Check whether this object is still mutable.
	 * 
	 * @return whether this object is still mutable.
	 */
	public boolean isMutable() {
		return !immuted;
	}

	/**
	 * Return a new Mutable instance with the same state as the current object.
	 */
	@Override
	public Mutable clone() {
		try {
			return (Mutable) super.clone();
		} catch (CloneNotSupportedException e) {
			throw new BugException("CloneNotSupportedException", e);
		}
	}
}
