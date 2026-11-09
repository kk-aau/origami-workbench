import java.io.File;
import oriedita.editor.export.FoldImporter;

/** Use the original application's complete FOLD import path, including conversion to Save. */
class ValidateExportedFold {
    public static void main(String[] args) throws Exception {
        System.setProperty("java.awt.headless", "true");
        int total = 0;
        for (String path : args) {
            var save = new FoldImporter().importFile(new File(path));
            int count = save.getLineSegments().size();
            System.out.println(new File(path).getName() + " edges=" + count);
            total += count;
        }
        System.out.println("FOLD_ORIGINAL_TOOL_IMPORT_OK files=" + args.length + " edges=" + total);
    }
}
