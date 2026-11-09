import java.io.ByteArrayInputStream;
import java.util.Base64;
import java.util.PropertyResourceBundle;
import javax.swing.KeyStroke;

/** Read-only cross-runtime check. Pass exported properties as Base64; writes only stdout. */
class ValidateExportedHotkeys {
    public static void main(String[] args) throws Exception {
        var bundle = new PropertyResourceBundle(new ByteArrayInputStream(Base64.getDecoder().decode(args[0])));
        int count = 0;
        for (String action : bundle.keySet()) {
            String value = bundle.getString(action);
            KeyStroke key = KeyStroke.getKeyStroke(value);
            if (!value.isEmpty() && key == null) throw new IllegalArgumentException(action + ": " + value);
            System.out.println(action + "=" + (key == null ? "UNBOUND" : key.toString()));
            count++;
        }
        System.out.println("validated=" + count);
    }
}
