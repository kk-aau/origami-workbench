import java.io.ByteArrayInputStream;
import java.util.Base64;
import java.util.PropertyResourceBundle;
import java.util.TreeSet;
import java.util.zip.ZipInputStream;
import javax.swing.KeyStroke;

/** Read-only Oriedita import-primitive check, not a replacement for its UI acceptance test. */
class ValidateExportedOriconfig {
    public static void main(String[] args) throws Exception {
        int entries = 0;
        boolean nativeSeen = false;
        try (var zip = new ZipInputStream(new ByteArrayInputStream(Base64.getDecoder().decode(args[0])))) {
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                // Oriedita skips this JSON entry. Consume it to exercise Java's CRC check.
                if (entry.getName().equals("workbench.json") && args.length > 1 && args[1].equals("native")) {
                    if (nativeSeen) throw new IllegalArgumentException("Duplicate native preferences");
                    nativeSeen = true;
                    zip.readAllBytes();
                    zip.closeEntry();
                    continue;
                }
                if (!entry.getName().equals("hotkey.properties")) throw new IllegalArgumentException("Unexpected entry: " + entry.getName());
                if (++entries != 1) throw new IllegalArgumentException("Duplicate entry");
                // Reading through the end also validates the entry CRC in java.util.zip.
                byte[] data = zip.readAllBytes();
                var bundle = new PropertyResourceBundle(new ByteArrayInputStream(data));
                if (bundle.keySet().isEmpty()) throw new IllegalArgumentException("Empty shortcuts");
                for (String action : new TreeSet<>(bundle.keySet())) {
                    String value = bundle.getString(action);
                    KeyStroke key = KeyStroke.getKeyStroke(value);
                    if (!value.isEmpty() && key == null) throw new IllegalArgumentException("Invalid keystroke: " + action);
                    System.out.println(action + "=" + (key == null ? "UNBOUND" : key.toString()));
                }
                zip.closeEntry();
            }
        }
        if (entries != 1) throw new IllegalArgumentException("Missing hotkeys");
    }
}
