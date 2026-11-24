/*
 * A range expression contains two indexExpressions for the beginning and end time index of a range
 */

package info.openrocket.core.simulation.customexpression;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.congrace.exp4j.Calculable;
import de.congrace.exp4j.ExpressionBuilder;
import de.congrace.exp4j.Variable;
import info.openrocket.core.document.OpenRocketDocument;
import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.simulation.SimulationStatus;
import info.openrocket.core.util.ArrayUtils;
import info.openrocket.core.util.MathUtil;
import info.openrocket.core.util.StringUtils;

public class RangeExpression extends CustomExpression {
	private static final Logger log = LoggerFactory.getLogger(RangeExpression.class);

	private ExpressionBuilder startBuilder, endBuilder;
	// PATCH(expression-cache)
	private ExpressionCache startCache, endCache;
	private final BranchSeries series = new BranchSeries();

	public RangeExpression(OpenRocketDocument doc, String startTime, String endTime, String variableType) {
		super(doc);

		if (StringUtils.isEmpty(startTime)) {
			startTime = "0";
		}
		if (StringUtils.isEmpty(endTime)) {
			endTime = "t";
		}

		this.setName("");
		this.setSymbol(variableType);
		this.setExpressions(startTime, endTime);
		this.expression = variableType + startTime + endTime; // this is used just for generating the hash

		log.info("New range expression, " + startTime + " to " + endTime);
	}

	/*
	 * Sets the actual expression string for this expression
	 */
	private void setExpressions(String start, String end) {

		startBuilder = new ExpressionBuilder(start);
		endBuilder = new ExpressionBuilder(end);
		for (String n : getAllSymbols()) {
			startBuilder.withVariable(new Variable(n));
			endBuilder.withVariable(new Variable(n));
		}
		startCache = new ExpressionCache(startBuilder, start, getAllSymbols());
		endCache = new ExpressionCache(endBuilder, end, getAllSymbols());
	}

	/** PATCH(expression-check) */
	@Override
	public boolean checkComputes() {
		return startCache.computes() && endCache.computes();
	}

	@Override
	public Variable evaluate(SimulationStatus status) {

		// PATCH(expression-cache)
		FlightDataBranch dataBranch = status.getFlightDataBranch();
		Calculable startCalc = startCache.at(dataBranch);
		Calculable endCalc = endCache.at(dataBranch);
		if (startCalc == null || endCalc == null) {
			return new Variable("Unknown");
		}

		// From the given datatype, get the time and function values and make an
		// interpolator

		// Note: must get in a way that flight data system will figure out units.
		// Otherwise there will be a type conflict when we get the new data.
		FlightDataType type = FlightDataType.getType(null, getSymbol(), null);

		// PATCH(expression-cache)
		if (!series.update(dataBranch, type)) {
			return new Variable("Unknown");
		}

		// Evaluate the expression to get the start and end of the range
		double startTime, endTime;
		try {
			startTime = startCalc.calculate().getDoubleValue();
			startTime = MathUtil.clamp(startTime, 0, Double.MAX_VALUE);

			endTime = endCalc.calculate().getDoubleValue();
			endTime = MathUtil.clamp(endTime, 0, dataBranch.getLast(FlightDataType.TYPE_TIME));
		} catch (java.util.EmptyStackException e) {
			log.info("Unable to calculate time index for range expression " + getSymbol()
					+ " due to empty stack exception");
			return new Variable("Unknown");
		}

		// A range that runs backwards selects no data at all.  Reporting it as unknown
		// keeps it out of any aggregate built on top of this expression.
		if (startTime > endTime) {
			log.info("Range expression " + getSymbol() + " starts at " + startTime
					+ ", after its end at " + endTime);
			return new Variable("Unknown");
		}

		// generate an array representing the range
		double step = status.getSimulationConditions().getSimulation().getOptions().getTimeStep();
		double[] t = ArrayUtils.range(startTime, endTime, step);
		double[] y = series.valuesAt(t);

		Variable result;
		if (y.length == 0) {
			result = new Variable("Unknown");
		} else {
			result = new Variable(hash(), y, startTime, step);
		}

		return result;
	}
}
