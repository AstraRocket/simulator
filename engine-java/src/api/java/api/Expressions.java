package api;

import info.openrocket.core.document.OpenRocketDocument;
import info.openrocket.core.simulation.FlightDataType;
import info.openrocket.core.simulation.customexpression.CustomExpression;
import info.openrocket.core.simulation.customexpression.CustomExpressionSimulationListener;
import info.openrocket.core.simulation.customexpression.Functions;
import info.openrocket.core.simulation.listeners.SimulationListener;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Desktop's custom expressions (`<datatypes>`), parsed and flown by the kernel's own classes. */
final class Expressions {

    /** First in every expression's kernel name and series key: no built-in name or symbol starts with it. */
    private static final String MARK = "$";

    private static final String[] EXP4J_FUNCTIONS = {"abs", "acos", "asin", "atan", "cbrt", "ceil", "cos", "cosh",
            "exp", "expm1", "floor", "round", "random", "log", "sin", "sinh", "sqrt", "tan", "tanh", "log10"};

    private final OpenRocketDocument doc = new OpenRocketDocument();
    private final List<CustomExpression> flown = new ArrayList<>();
    /** Per entry: what is wrong with its symbol and its formula, or null. */
    private final List<String[]> faults = new ArrayList<>();

    /** In list order, as a `.ork` loads: an expression sees the ones before it. */
    Expressions(List<Map<String, Object>> specs) {
        for (Map<String, Object> spec : specs) {
            String symbol = JsonLite.str(spec, "symbol", "").trim();
            String formula = JsonLite.str(spec, "expression", "");
            // The kernel's types are equal by name, ignoring case, and a design may repeat one: this name is ours.
            CustomExpression e = new CustomExpression(doc, MARK + faults.size(), symbol, "", formula);
            String symbolFault = symbolFault(e);
            String formulaFault = formulaFault(e);
            faults.add(new String[] {symbolFault, formulaFault});
            // A bad symbol in the document breaks every formula after it, and a built-in's would replace that type.
            if (symbolFault != null) {
                continue;
            }
            doc.addCustomExpression(e);
            if (formulaFault == null) {
                flown.add(e);
            }
        }
    }

    SimulationListener listener() {
        return new CustomExpressionSimulationListener(flown);
    }

    String faultsJson() {
        StringBuilder sb = new StringBuilder("{\"faults\":[");
        for (int i = 0; i < faults.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"symbol\":").append(quoted(faults.get(i)[0]))
                    .append(",\"expression\":").append(quoted(faults.get(i)[1])).append('}');
        }
        return sb.append("]}").toString();
    }

    private static String quoted(String code) {
        return code == null ? "null" : "\"" + code + "\"";
    }

    /** The series key of a custom expression's type, or null for a built-in type. */
    static String seriesKey(FlightDataType type) {
        return type.getName().startsWith(MARK) ? MARK + type.getSymbol() : null;
    }

    /** What upstream's checkSymbol is for, and the names its tokenizer cannot read. */
    private String symbolFault(CustomExpression e) {
        String symbol = e.getSymbol();
        if (symbol.isEmpty()) {
            return "empty";
        }
        for (int i = 0; i < symbol.length(); i++) {
            char c = symbol.charAt(i);
            if (!Character.isLetter(c) && c != '_') {
                return "characters";
            }
        }
        String lower = symbol.toLowerCase(Locale.ENGLISH);
        for (String name : EXP4J_FUNCTIONS) {
            if (name.equals(lower)) {
                return "function";
            }
        }
        for (String operator : Functions.AVAILABLE_OPERATORS.keySet()) {
            int bracket = operator.indexOf('(');
            if (bracket > 0 && operator.substring(0, bracket).equals(lower)) {
                return "function";
            }
        }
        // Not checkSymbol: upstream leaves the symbol's own name out of the list it looks in, so none is ever taken.
        for (FlightDataType type : doc.getFlightDataTypes()) {
            if (type.getSymbol().equals(symbol)) {
                return "taken";
            }
        }
        return null;
    }

    private static String formulaFault(CustomExpression e) {
        String formula = e.getExpressionString();
        if (formula.trim().isEmpty()) {
            return "empty";
        }
        // exp4j reads braces as brackets and upstream does not balance them.
        if (formula.indexOf('{') >= 0 || formula.indexOf('}') >= 0) {
            return "characters";
        }
        return e.checkExpression() && e.checkComputes() ? null : "formula";
    }
}
