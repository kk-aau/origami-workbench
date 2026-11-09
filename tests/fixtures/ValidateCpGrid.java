import java.io.File;
import oriedita.editor.export.CpImporter;
import oriedita.editor.drawing.Grid;

/** Use the original tool's actual CP reader and default grid, not a copied parser. */
public class ValidateCpGrid {
    public static void main(String[] args) throws Exception {
        Grid grid = new Grid();
        grid.setGridSize(8);
        int checked = 0;
        for (String filename : args) {
            var save = new CpImporter().doImport(new File(filename));
            if (save.getLineSegments().size() != 5) throw new AssertionError("line count");
            double loX=Double.POSITIVE_INFINITY,hiX=Double.NEGATIVE_INFINITY;
            double loY=Double.POSITIVE_INFINITY,hiY=Double.NEGATIVE_INFINITY;
            for (var line : save.getLineSegments()) {
                for (var point : new origami.crease_pattern.element.Point[]{line.getA(),line.getB()}) {
                    var nearest=grid.closestGridPoint(point);
                    if (point.distance(nearest)>1e-7) throw new AssertionError("off grid: "+point);
                    loX=Math.min(loX,point.getX());hiX=Math.max(hiX,point.getX());
                    loY=Math.min(loY,point.getY());hiY=Math.max(hiY,point.getY());
                    checked++;
                }
            }
            if (loX!=-200 || hiX!=200 || loY!=-200 || hiY!=200) throw new AssertionError("paper extent");
        }
        System.out.println("CP_ORIGINAL_TOOL_GRID_OK endpoints="+checked);
    }
}
