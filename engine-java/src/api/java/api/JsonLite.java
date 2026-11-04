package api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Untrusted input (a stranger's .ork); the JS-side caps protect only the orkImport.ts path. */
public final class JsonLite {

    // Stack overflow traps under WASM-GC (uncatchable), so depth must be prevented, not caught.
    public static final int MAX_DEPTH = 64;

    public static final int MAX_INPUT_CHARS = 8 * 1024 * 1024;

    private final String src;
    private int pos;
    private int depth;

    private JsonLite(String src) {
        this.src = src;
    }

    public static Object parse(String json) {
        if (json == null) throw new IllegalArgumentException("JSON: input is null");
        if (json.length() > MAX_INPUT_CHARS) {
            throw new IllegalArgumentException(
                    "JSON: input of " + json.length() + " chars exceeds the " + MAX_INPUT_CHARS + " limit");
        }
        JsonLite p = new JsonLite(json);
        p.ws();
        Object v = p.value();
        p.ws();
        if (p.pos != json.length()) {
            throw new IllegalArgumentException("Trailing content at " + p.pos);
        }
        return v;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String json) {
        Object v = parse(json);
        if (!(v instanceof Map)) {
            throw new IllegalArgumentException("Expected a JSON object");
        }
        return (Map<String, Object>) v;
    }

    private Object value() {
        char c = peek();
        switch (c) {
            case '{': return object();
            case '[': return array();
            case '"': return string();
            case 't': expect("true"); return Boolean.TRUE;
            case 'f': expect("false"); return Boolean.FALSE;
            case 'n': expect("null"); return null;
            default: return number();
        }
    }

    private Map<String, Object> object() {
        Map<String, Object> map = new LinkedHashMap<>();
        enter();
        consume('{');
        ws();
        if (peek() == '}') {
            pos++;
            depth--;
            return map;
        }
        while (true) {
            ws();
            String key = string();
            ws();
            consume(':');
            ws();
            if (map.containsKey(key)) {
                throw new IllegalArgumentException("JSON: duplicate key '" + key + "' at " + pos);
            }
            map.put(key, value());
            ws();
            char c = next();
            if (c == '}') {
                depth--;
                return map;
            }
            if (c != ',') throw err("',' or '}'");
        }
    }

    private List<Object> array() {
        List<Object> list = new ArrayList<>();
        enter();
        consume('[');
        ws();
        if (peek() == ']') {
            pos++;
            depth--;
            return list;
        }
        while (true) {
            ws();
            list.add(value());
            ws();
            char c = next();
            if (c == ']') {
                depth--;
                return list;
            }
            if (c != ',') throw err("',' or ']'");
        }
    }

    private void enter() {
        if (++depth > MAX_DEPTH) {
            throw new IllegalArgumentException(
                    "JSON: nesting deeper than " + MAX_DEPTH + " at " + pos);
        }
    }

    private String string() {
        consume('"');
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = next();
            if (c == '"') return sb.toString();
            if (c == '\\') {
                char e = next();
                switch (e) {
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'b': sb.append('\b'); break;
                    case 'f': sb.append('\f'); break;
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    case 'u':
                        // Not Integer.parseInt(..., 16): it accepts a sign ("\\u-123").
                        int cp = hex4();
                        // A lone surrogate would make the output malformed UTF-8.
                        if (Character.isLowSurrogate((char) cp)) throw err("a high surrogate before \\u" + Integer.toHexString(cp));
                        sb.append((char) cp);
                        if (Character.isHighSurrogate((char) cp)) {
                            if (!src.startsWith("\\u", pos)) throw err("a low surrogate after a high one");
                            pos += 2;
                            int low = hex4();
                            if (!Character.isLowSurrogate((char) low)) throw err("a low surrogate after a high one");
                            sb.append((char) low);
                        }
                        break;
                    default: throw err("escape");
                }
            } else {
                sb.append(c);
            }
        }
    }

    private int hex4() {
        if (pos + 4 > src.length()) throw err("4 hex digits after \\u");
        int cp = 0;
        for (int k = 0; k < 4; k++) {
            int d = Character.digit(src.charAt(pos + k), 16);
            if (d < 0) throw err("4 hex digits after \\u");
            cp = (cp << 4) | d;
        }
        pos += 4;
        return cp;
    }

    private Double number() {
        int start = pos;
        while (pos < src.length() && "+-0123456789.eE".indexOf(src.charAt(pos)) >= 0) {
            pos++;
        }
        if (start == pos) throw err("number");
        final String text = src.substring(start, pos);
        // JSON's grammar, not Double.parseDouble's: `01`, `+0.3` and `.3` must fail.
        if (!isJsonNumber(text)) {
            throw new IllegalArgumentException("JSON: bad number '" + text + "' at " + start);
        }
        final double d;
        try {
            d = Double.parseDouble(text);
        } catch (NumberFormatException e) {
            // Its message can be null, which would reach the UI as "null".
            throw new IllegalArgumentException("JSON: bad number '" + text + "' at " + start);
        }
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw new IllegalArgumentException("JSON: non-finite number '" + text + "' at " + start);
        }
        return Double.valueOf(d);
    }

    private static boolean isJsonNumber(String t) {
        int i = 0;
        final int n = t.length();
        if (i < n && t.charAt(i) == '-') i++;
        if (i >= n) return false;
        if (t.charAt(i) == '0') {
            i++;
        } else if (t.charAt(i) >= '1' && t.charAt(i) <= '9') {
            while (i < n && Character.isDigit(t.charAt(i))) i++;
        } else {
            return false;
        }
        if (i < n && t.charAt(i) == '.') {
            i++;
            final int digits = i;
            while (i < n && Character.isDigit(t.charAt(i))) i++;
            if (i == digits) return false;
        }
        if (i < n && (t.charAt(i) == 'e' || t.charAt(i) == 'E')) {
            i++;
            if (i < n && (t.charAt(i) == '+' || t.charAt(i) == '-')) i++;
            final int digits = i;
            while (i < n && Character.isDigit(t.charAt(i))) i++;
            if (i == digits) return false;
        }
        return i == n;
    }

    private void ws() {
        while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
            pos++;
        }
    }

    private char peek() {
        if (pos >= src.length()) throw err("value");
        return src.charAt(pos);
    }

    private char next() {
        if (pos >= src.length()) throw err("more input");
        return src.charAt(pos++);
    }

    private void consume(char c) {
        if (next() != c) throw err("'" + c + "'");
    }

    private void expect(String word) {
        if (!src.startsWith(word, pos)) throw err(word);
        pos += word.length();
    }

    private IllegalArgumentException err(String expected) {
        return new IllegalArgumentException("JSON: expected " + expected + " at " + pos);
    }

    // Refused, not defaulted: `"length":"0.9"` would silently build the default length.
    private static IllegalArgumentException wrongType(String key, Object v, String want) {
        return new IllegalArgumentException(
                "JSON: key '" + key + "' should be " + want + ", got " + v.getClass().getSimpleName());
    }

    public static double dbl(Map<String, Object> m, String key, double fallback) {
        Object v = m.get(key);
        if (v == null) return fallback;
        if (!(v instanceof Double)) throw wrongType(key, v, "a number");
        return (Double) v;
    }

    public static boolean bool(Map<String, Object> m, String key, boolean fallback) {
        Object v = m.get(key);
        if (v == null) return fallback;
        if (!(v instanceof Boolean)) throw wrongType(key, v, "a boolean");
        return (Boolean) v;
    }

    public static String str(Map<String, Object> m, String key, String fallback) {
        Object v = m.get(key);
        if (v == null) return fallback;
        if (!(v instanceof String)) throw wrongType(key, v, "a string");
        return (String) v;
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> objList(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v == null) return new ArrayList<>();
        if (!(v instanceof List)) throw wrongType(key, v, "a list");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : (List<Object>) v) {
            if (!(o instanceof Map)) {
                throw new IllegalArgumentException("JSON: every entry of '" + key + "' should be an object, got "
                        + (o == null ? "null" : o.getClass().getSimpleName()));
            }
            out.add((Map<String, Object>) o);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> obj(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof Map ? (Map<String, Object>) v : null;
    }
}
