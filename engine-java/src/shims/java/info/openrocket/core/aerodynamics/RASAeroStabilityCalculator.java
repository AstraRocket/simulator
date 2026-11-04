package info.openrocket.core.aerodynamics;

import info.openrocket.core.aerodynamics.barrowman.FinSetCalc;
import info.openrocket.core.aerodynamics.barrowman.RocketComponentCalc;
import info.openrocket.core.aerodynamics.barrowman.SymmetricComponentCalc;
import info.openrocket.core.rocketcomponent.RocketComponent;

/**
 * Original work of the mmrocket-sim project; see engine-java/ATTRIBUTION.md.
 * With both flags off it must stay bit-identical to {@link BarrowmanStabilityCalculator}.
 */
public class RASAeroStabilityCalculator extends BarrowmanStabilityCalculator {

	private boolean supersonicAero = false;
	private boolean rogersKbf = false;

	public void setSupersonicAero(boolean enabled) {
		this.supersonicAero = enabled;
	}

	public boolean isSupersonicAero() {
		return supersonicAero;
	}

	public void setRogersKbf(boolean enabled) {
		this.rogersKbf = enabled;
	}

	public boolean isRogersKbf() {
		return rogersKbf;
	}

	@Override
	public StabilityCalculator newInstance() {
		RASAeroStabilityCalculator copy = new RASAeroStabilityCalculator();
		copy.supersonicAero = this.supersonicAero;
		copy.rogersKbf = this.rogersKbf;
		return copy;
	}

	@Override
	protected RocketComponentCalc createCalcObject(RocketComponent comp) {
		RocketComponentCalc calc = super.createCalcObject(comp);
		if (calc instanceof FinSetCalc) {
			((FinSetCalc) calc).setRogersKbf(rogersKbf);
			((FinSetCalc) calc).setSupersonicAero(supersonicAero);
		} else if (calc instanceof SymmetricComponentCalc) {
			((SymmetricComponentCalc) calc).setSupersonicAero(supersonicAero);
		}
		return calc;
	}
}
