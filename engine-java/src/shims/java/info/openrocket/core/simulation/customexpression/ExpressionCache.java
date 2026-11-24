package info.openrocket.core.simulation.customexpression;

import info.openrocket.core.simulation.FlightDataBranch;
import info.openrocket.core.simulation.FlightDataType;

import de.congrace.exp4j.Calculable;
import de.congrace.exp4j.ExpressionBuilder;
import de.congrace.exp4j.UnknownFunctionException;
import de.congrace.exp4j.UnparsableExpressionException;
import de.congrace.exp4j.Variable;

import java.util.ArrayList;
import java.util.List;

/** SHIM: one built expression, kept between steps. Upstream builds it again and sets every variable at every step. */
final class ExpressionCache {

    private final ExpressionBuilder builder;
    private final List<String> symbols = new ArrayList<>();
    private FlightDataType[] types;
    private Calculable calc;
    private boolean tried;

    ExpressionCache(ExpressionBuilder builder, String expression, List<String> allSymbols) {
        this.builder = builder;
        for (String s : allSymbols) {
            if (expression.contains(s)) {
                symbols.add(s);
            }
        }
    }

    /** Null when the expression does not parse. */
    private Calculable calculable() {
        if (!tried) {
            tried = true;
            try {
                calc = builder.build();
            } catch (UnknownFunctionException | UnparsableExpressionException | RuntimeException e) {
                calc = null;
            }
        }
        return calc;
    }

    /** With the branch's latest values set; null when the expression does not parse. */
    Calculable at(FlightDataBranch branch) {
        Calculable c = calculable();
        if (c == null) {
            return null;
        }
        if (types == null) {
            types = new FlightDataType[symbols.size()];
            for (int i = 0; i < types.length; i++) {
                types[i] = FlightDataType.getType(null, symbols.get(i), null);
            }
        }
        for (int i = 0; i < types.length; i++) {
            String symbol = symbols.get(i);
            // A type the branch lacks stays a placeholder, as in a fresh build.
            c.setVariable(branch.getView(types[i]) == null
                    ? new Variable(symbol)
                    : new Variable(symbol, branch.getLast(types[i])));
        }
        return c;
    }

    /** Whether it parses and every operator and function has its operands. */
    boolean computes() {
        Calculable c = calculable();
        if (c == null) {
            return false;
        }
        try {
            c.calculate();
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }
}
