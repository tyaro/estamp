[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputDirectory, [string]$Dist = '.\dist')
$ErrorActionPreference = 'Stop'
if (Test-Path $OutputDirectory) { throw '出力先は未存在のディレクトリにしてください' }
New-Item -ItemType Directory $OutputDirectory | Out-Null
$rows = foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
                         'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts')) {
    if (Test-Path $key) {
        $item = Get-ItemProperty $key
        foreach ($property in $item.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' }) {
            [pscustomobject]@{ Registry=$key; Name=$property.Name; File=$property.Value }
        }
    }
}
$rows | Export-Csv (Join-Path $OutputDirectory 'font-registry.csv') -NoTypeInformation -Encoding UTF8
$rows | Where-Object { $_.Name -match 'Shippori|BIZ|estamp' -or $_.File -match 'Shippori|BIZ|estamp' } |
    Format-Table -AutoSize | Out-String | Set-Content (Join-Path $OutputDirectory 'font-matches.txt') -Encoding UTF8
# Font registry plus actual enumerated families (includes loaded/private families).
Add-Type -AssemblyName System.Drawing
$collection = New-Object Drawing.Text.InstalledFontCollection
try { $collection.Families.Name | Sort-Object | Set-Content (Join-Path $OutputDirectory 'installed-families.txt') -Encoding UTF8 }
finally { $collection.Dispose() }
$external = @(Get-ChildItem $Dist -Recurse -File | Where-Object { $_.Extension -in '.css','.js','.html' } |
    Select-String -Pattern '(?i)(?:https?:)?//[^\s"''<>)]*\.(?:ttf|otf|woff2?)(?:[?\s"''<>)]|$)|fonts\.(?:googleapis|gstatic)\.com')
$external | Out-String | Set-Content (Join-Path $OutputDirectory 'external-font-urls.txt') -Encoding UTF8
if ($external.Count) { throw '外部フォントURL候補があります。結果を確認してください' }
Get-ChildItem (Join-Path $Dist 'fonts') -Recurse -File | Get-FileHash |
    Export-Csv (Join-Path $OutputDirectory 'dist-font-hashes.csv') -NoTypeInformation
