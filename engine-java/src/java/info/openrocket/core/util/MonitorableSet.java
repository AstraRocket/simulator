package info.openrocket.core.util;

import java.util.Collection;
import java.util.Iterator;
import java.util.LinkedHashSet;

/**
 * A Set that additionally implements the Monitorable interface.
 *
 * @author Sampo Niskanen <sampo.niskanen@iki.fi>
 */
// PATCH(astrarrocketjs): HashSet -> LinkedHashSet. The only user is
// SimulationStatus.deployedRecoveryDevices, and RecoveryDevice hashes by its id, a
// UUID.randomUUID() minted per component, so HashSet order is random per load.
// BasicLandingStepper.computeCD sums each deployed device's CdA over that order, so
// with three or more devices out at once the descent can move by an ulp from one
// build of the same design to the next. LinkedHashSet iterates in insertion order,
// which is deployment-event order. Same reason as the InstanceMap patch and the
// FlightConfiguration motors map.
public class MonitorableSet<E> extends LinkedHashSet<E> implements Monitorable {

	private ModID modID;

	@Override
	public boolean add(E e) {
		modID = new ModID();
		return super.add(e);
	}

	@Override
	public boolean addAll(Collection<? extends E> c) {
		modID = new ModID();
		return super.addAll(c);
	}

	@Override
	public void clear() {
		modID = new ModID();
		super.clear();
	}

	@Override
	public Iterator<E> iterator() {
		return new MonitorableIterator<>(super.iterator());
	}

	@Override
	public boolean remove(Object o) {
		modID = new ModID();
		return super.remove(o);
	}

	@Override
	public boolean removeAll(Collection<?> c) {
		modID = new ModID();
		return super.removeAll(c);
	}

	@Override
	public boolean retainAll(Collection<?> c) {
		modID = new ModID();
		return super.retainAll(c);
	}

	@Override
	public ModID getModID() {
		return modID;
	}

	@SuppressWarnings("unchecked")
	@Override
	public MonitorableSet<E> clone() {
		return (MonitorableSet<E>) super.clone();
	}

	private class MonitorableIterator<F> implements Iterator<F> {
		private final Iterator<F> iterator;

		public MonitorableIterator(Iterator<F> iterator) {
			this.iterator = iterator;
		}

		@Override
		public boolean hasNext() {
			return iterator.hasNext();
		}

		@Override
		public F next() {
			return iterator.next();
		}

		@Override
		public void remove() {
			iterator.remove();
			modID = new ModID();
		}
	}
}
