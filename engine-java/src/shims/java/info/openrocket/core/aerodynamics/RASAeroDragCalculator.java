package info.openrocket.core.aerodynamics;

import static info.openrocket.core.util.MathUtil.pow2;

import info.openrocket.core.aerodynamics.barrowman.FinSetCalc;
import info.openrocket.core.aerodynamics.barrowman.RocketComponentCalc;
import info.openrocket.core.aerodynamics.barrowman.SymmetricComponentCalc;
import info.openrocket.core.rocketcomponent.RocketComponent;
import info.openrocket.core.util.MathUtil;

/**
 * Original work of the mmrocket-sim project; see engine-java/ATTRIBUTION.md.
 * With every flag off it must stay bit-identical to {@link BarrowmanDragCalculator}.
 */
public class RASAeroDragCalculator extends BarrowmanDragCalculator {

	private boolean supersonicAero = false;
	private boolean rogersKbf = false;
	private boolean stubbyNoseFloor = false;

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

	public void setStubbyNoseFloor(boolean enabled) {
		this.stubbyNoseFloor = enabled;
	}

	@Override
	public DragCalculator newInstance() {
		RASAeroDragCalculator copy = new RASAeroDragCalculator();
		copy.supersonicAero = this.supersonicAero;
		copy.rogersKbf = this.rogersKbf;
		copy.stubbyNoseFloor = this.stubbyNoseFloor;
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
			((SymmetricComponentCalc) calc).setStubbyNoseFloor(stubbyNoseFloor);
		}
		return calc;
	}

	/** Above M1, cap base CD at 1.2/M^2 (HB-2 base-drag trend). */
	@Override
	protected double effectiveBaseCD(double mach) {
		double cd = super.effectiveBaseCD(mach);
		if (supersonicAero && mach > 1) {
			cd = Math.min(cd, 1.2 / (mach * mach));
		}
		return cd;
	}

	/** Fades M3.5 to M4.5 into Van Driest II (Hopkins & Inouye, NASA TN D-6945). */
	@Override
	protected double turbulentCompressibility(double mach) {
		double c2 = super.turbulentCompressibility(mach);
		if (supersonicAero && mach > 3.5) {
			double cVD = 1 / Math.pow(1 + 0.144 * pow2(mach), 0.65);
			double t = MathUtil.clamp((mach - 3.5) / 1.0, 0, 1);
			c2 = c2 * (1 - t) + cVD * t;
		}
		return c2;
	}
}
