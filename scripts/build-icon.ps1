#requires -Version 5.1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../build/icons'))
[IO.Directory]::CreateDirectory($iconRoot) | Out-Null
$bitmap = New-Object Drawing.Bitmap(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::FromArgb(31, 80, 62))
$pen = New-Object Drawing.Pen([Drawing.Color]::FromArgb(251, 251, 241), 7)
$graphics.DrawRectangle($pen, 43, 43, 170, 170)
$graphics.DrawLine($pen, 43, 43, 213, 213)
$graphics.DrawLine($pen, 43, 213, 213, 43)
$graphics.DrawLine($pen, 128, 43, 128, 213)
$graphics.DrawLine($pen, 43, 128, 128, 213)
$pngPath = Join-Path $iconRoot 'workbench.png'
$bitmap.Save($pngPath, [Drawing.Imaging.ImageFormat]::Png)
$pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
$pngBytes = [IO.File]::ReadAllBytes($pngPath)
$writer = New-Object IO.BinaryWriter([IO.File]::Create((Join-Path $iconRoot 'workbench.ico')))
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
  $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$pngBytes.Length); $writer.Write([uint32]22); $writer.Write($pngBytes)
} finally { $writer.Dispose() }

# NSIS portable launchers can show a bitmap before Electron is extracted.
# Keep this first-stage screen small and static; the desktop startup window
# provides the live status and real close action after Electron starts.
$startupBitmap = New-Object Drawing.Bitmap(560, 360, ([Drawing.Imaging.PixelFormat]::Format24bppRgb))
$startupGraphics = [Drawing.Graphics]::FromImage($startupBitmap)
$startupIcon = [Drawing.Image]::FromFile($pngPath)
$titleFont = New-Object Drawing.Font('Microsoft YaHei UI', 28, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel))
$subtitleFont = New-Object Drawing.Font('Microsoft YaHei UI', 13, ([Drawing.FontStyle]::Regular), ([Drawing.GraphicsUnit]::Pixel))
$statusFont = New-Object Drawing.Font('Microsoft YaHei UI', 15, ([Drawing.FontStyle]::Regular), ([Drawing.GraphicsUnit]::Pixel))
$detailFont = New-Object Drawing.Font('Microsoft YaHei UI', 12, ([Drawing.FontStyle]::Regular), ([Drawing.GraphicsUnit]::Pixel))
$titleBrush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#263b31'))
$secondaryBrush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#596d60'))
$separatorPen = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#d3ded2'), 1)
try {
  $startupGraphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $startupGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $startupGraphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $startupGraphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $startupGraphics.Clear([Drawing.ColorTranslator]::FromHtml('#fafbf7'))
  $startupGraphics.DrawImage($startupIcon, 40, 64, 88, 88)
  $startupGraphics.DrawString('折纸工坊', $titleFont, $titleBrush, 152, 72)
  $startupGraphics.DrawString('中文折纸设计工作台', $subtitleFont, $secondaryBrush, 154, 120)
  $startupGraphics.DrawLine($separatorPen, 40, 224, 520, 224)
  $startupGraphics.DrawString('正在准备运行环境…', $statusFont, $titleBrush, 40, 245)
  $startupGraphics.DrawString('首次打开可能需要几秒钟，请稍候。', $detailFont, $secondaryBrush, 40, 280)
  $startupBitmap.Save((Join-Path $iconRoot 'startup.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
} finally {
  $separatorPen.Dispose()
  $secondaryBrush.Dispose()
  $titleBrush.Dispose()
  $detailFont.Dispose()
  $statusFont.Dispose()
  $subtitleFont.Dispose()
  $titleFont.Dispose()
  $startupIcon.Dispose()
  $startupGraphics.Dispose()
  $startupBitmap.Dispose()
}
