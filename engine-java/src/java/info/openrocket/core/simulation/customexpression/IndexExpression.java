package info.openrocket.core.simulation.customexpression;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.congrace.exp4j.Calculable;
import de.congrace.exp4j.Variable;
import info.openrocket.core.document.OpenRocketDocument;
import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.simulation.SimulationStatus;

public class IndexExpression extends CustomExpression {

	FlightDataType type;
	// PATCH(expression-cache)
	private final BranchSeries series = new BranchSeries();
	private static final Logger log = LoggerFactory.getLogger(IndexExpression.class);

	public IndexExpression(OpenRocketDocument doc, String indexText, String typeText) {
		super(doc);

		setExpression(indexText);
		this.setName("");
		this.setSymbol(typeText);
	}

	@Override
	public Variable evaluate(SimulationStatus status) {
		// PATCH(expression-cache)
		FlightDataBranch dataBranch = status.getFlightDataBranch();
		Calculable calc = getCache().at(dataBranch);
		if (calc == null) {
			return new Variable("Unknown");
		}

		// From the given datatype, get the time and function values and make an
		// interpolator

		// Note: must get in a way that flight data system will figure out units.
		// Otherwise there will be a type conflict when we get the new data.
		FlightDataType myType = FlightDataType.getType(null, getSymbol(), null);

		// PATCH(expression-cache). A series the branch lacks is unknown; upstream throws a NullPointerException.
		if (!series.update(dataBranch, myType)) {
			return new Variable("Unknown");
		}

		// Evaluate this expression to get the t value
		// System.out.println("Evaluating expression to get t value
		// "+this.getExpressionString());
		try {
			double tvalue = calc.calculate().getDoubleValue();
			// System.out.println("t = "+tvalue);
			return new Variable(hash(), series.valueAt(tvalue));
		} catch (java.util.EmptyStackException e) {
			log.info("Unable to calculate time index for indexed expression "
					+ getExpressionString() + " due to empty stack exception");
			return new Variable("Unknown");
		}
	}
}
