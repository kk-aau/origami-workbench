import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.swing.KeyStroke;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;

/** Prints fixtures, never modifies files or the Oriedita configuration directory. */
class GenerateOriconfigFixture {
    static void entry(ZipOutputStream zip, String name, byte[] bytes, boolean stored) throws Exception {
        ZipEntry entry = new ZipEntry(name);
        entry.setTime(1700000000000L);
        if (stored) {
            CRC32 crc = new CRC32(); crc.update(bytes);
            entry.setMethod(ZipEntry.STORED); entry.setSize(bytes.length);
            entry.setCompressedSize(bytes.length); entry.setCrc(crc.getValue());
        }
        zip.putNextEntry(entry); zip.write(bytes); zip.closeEntry();
    }
    static void emit(String name, boolean stored, boolean latin) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            zip.setComment("Oriedita-compatible configuration fixture / 中文");
            entry(zip, "config.json", "{\"lineWidth\":2,\"displayComments\":true,\"fixtureLabel\":\"中文\"}".getBytes(StandardCharsets.UTF_8), stored);
            String hotkeys = (latin ? "# café\n" : "# 快捷键\n")
                + "drawCreaseFreeAction=Q\nselectAction=V\nperpendicularDrawAction="
                + KeyStroke.getKeyStroke(KeyEvent.VK_P, InputEvent.SHIFT_DOWN_MASK).toString() + "\n";
            entry(zip, "hotkey.properties", hotkeys.getBytes(latin ? StandardCharsets.ISO_8859_1 : StandardCharsets.UTF_8), stored);
            entry(zip, "ignored-说明.txt", "Not applied".getBytes(StandardCharsets.UTF_8), stored);
        }
        System.out.println(name + "|" + Base64.getEncoder().encodeToString(output.toByteArray()));
    }
    public static void main(String[] args) throws Exception {
        System.out.println("javaVersion|" + System.getProperty("java.version"));
        emit("deflatedUtf8", false, false);
        emit("storedLatin1", true, true);
    }
}
