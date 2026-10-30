# pwsh -STA で実行（Windows PowerShell 5.1にも対応）。UTF-8 BOM付きで保存する。
# アプリ権限とは別の検証ツールでクリップボードを読む。
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputDirectory,
      [Parameter(Mandatory=$true)][ValidateRange(1,4096)][int]$ExpectedSize,
      [int]$Left=0, [int]$Top=0, [int]$Width=0, [int]$Height=0)
$ErrorActionPreference = 'Stop'
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw 'pwsh -STA -File（または powershell.exe -STA -File）で実行してください' }
if (Test-Path $OutputDirectory) { throw '出力先は未存在のディレクトリにしてください' }
New-Item -ItemType Directory $OutputDirectory | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$data = [Windows.Forms.Clipboard]::GetDataObject()
if ($null -eq $data) { throw 'クリップボードが空です' }
$data.GetFormats($false) | Set-Content (Join-Path $OutputDirectory 'formats-native.txt') -Encoding UTF8
$data.GetFormats($true) | Set-Content (Join-Path $OutputDirectory 'formats-converted.txt') -Encoding UTF8
$pngPath = Join-Path $OutputDirectory 'clipboard.png'
$nativePng = $data.GetDataPresent('PNG', $false)
if ($nativePng) {
    $stream = $data.GetData('PNG', $false)
    if ($stream -is [IO.Stream]) {
        $stream.Position = 0; $file = [IO.File]::Create($pngPath)
        try { $stream.CopyTo($file) } finally { $file.Dispose() }
    } elseif ($stream -is [byte[]]) { [IO.File]::WriteAllBytes($pngPath, $stream) }
    else { throw 'PNG形式を取得できません。形式と型を記録してください' }
} else {
    $image = [Windows.Forms.Clipboard]::GetImage()
    if ($null -eq $image) { throw '画像を取得できません' }
    try { $image.Save($pngPath, [Drawing.Imaging.ImageFormat]::Png) } finally { $image.Dispose() }
}
$bitmap = New-Object Drawing.Bitmap $pngPath
try {
    $transparent=0; $partial=0; $opaque=0
    for ($y=0; $y -lt $bitmap.Height; $y++) {
        for ($x=0; $x -lt $bitmap.Width; $x++) {
            $alpha = $bitmap.GetPixel($x,$y).A
            if ($alpha -eq 0) { $transparent++ } elseif ($alpha -eq 255) { $opaque++ } else { $partial++ }
        }
    }
    [pscustomobject]@{ Width=$bitmap.Width; Height=$bitmap.Height; ExpectedSize=$ExpectedSize;
        SizePass=($bitmap.Width -eq $ExpectedSize -and $bitmap.Height -eq $ExpectedSize);
        NativePng=$nativePng; PixelFormat=$bitmap.PixelFormat.ToString(); TransparentPixels=$transparent;
        PartialPixels=$partial; OpaquePixels=$opaque; AlphaPass=($transparent -gt 0 -and ($opaque+$partial) -gt 0);
        Note= $(if ($nativePng) { 'native PNG' } else { 'Bitmapから再エンコード。ネイティブPNGの存在・alpha保持は別途判定' }) } |
        ConvertTo-Json | Set-Content (Join-Path $OutputDirectory 'image-result.json') -Encoding UTF8
} finally { $bitmap.Dispose() }
# Optional physical-screen crop. DPI / coordinates are recorded by the operator.
if ($Width -gt 0 -and $Height -gt 0) {
    $capture = New-Object Drawing.Bitmap $Width,$Height
    $graphics = [Drawing.Graphics]::FromImage($capture)
    try {
        $graphics.CopyFromScreen($Left,$Top,0,0,$capture.Size)
        $capture.Save((Join-Path $OutputDirectory 'preview-crop.png'), [Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $capture.Dispose() }
}
Get-Content (Join-Path $OutputDirectory 'image-result.json')
