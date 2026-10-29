# 計測用ビルド専用。既存の設定ディレクトリがあれば停止する。
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Exe,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [ValidateRange(1,3)][int]$Runs = 3,
    [string]$SettingsSource
)
$ErrorActionPreference = 'Stop'
$Exe = (Resolve-Path $Exe).Path
if ([IO.Path]::GetFileName($Exe) -ne 'estamp.exe') { throw 'estamp.exe を指定してください' }
if (Get-Process estamp -ErrorAction SilentlyContinue) { throw '既存の estamp を手動で終了してください（自動停止しません）' }
$OutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
if (Test-Path $OutputDirectory) { throw '出力先には未存在のディレクトリを指定してください' }
$settings = Join-Path $env:APPDATA 'jp.tyaro.estamp'
if (Test-Path $settings) { throw '既存設定を保護するため停止しました。設定のない検証専用Windowsユーザーを使ってください' }
$token = [guid]::NewGuid().ToString()
$owned = $false
$started = $null
$oldMetrics = $env:ESTAMP_PR05_METRICS
try {
    New-Item -ItemType Directory $OutputDirectory | Out-Null
    New-Item -ItemType Directory $settings | Out-Null
    $owned = $true
    Set-Content (Join-Path $settings 'pr05-owner.txt') $token -Encoding ASCII
    if ($SettingsSource) {
        Copy-Item -LiteralPath (Resolve-Path $SettingsSource).Path -Destination (Join-Path $settings 'Setting.json')
    } else {
        $config = @{ schema_version=1; stamp_type='dated_stamp'; top_str='部署名'; top_font_size=80;
            mid_font_size=60; btm_str='髙橋 渡邊'; btm_font_size=80; output_size=100;
            date_mode='manual'; date_format='wareki'; manual_date='2025-10-22' }
        [IO.File]::WriteAllText((Join-Path $settings 'Setting.json'), ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    }
    Get-FileHash $Exe | Format-List | Out-File (Join-Path $OutputDirectory 'exe-sha256.txt')
    Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,LastBootUpTime |
        ConvertTo-Json | Set-Content (Join-Path $OutputDirectory 'environment.json') -Encoding UTF8
    $summary = @()
    for ($run=1; $run -le $Runs; $run++) {
        $env:ESTAMP_PR05_METRICS = Join-Path $OutputDirectory "metrics-$run.csv"
        $clock = [Diagnostics.Stopwatch]::StartNew()
        $started = Start-Process -FilePath $Exe -WorkingDirectory (Split-Path $Exe) -PassThru
        $identity = $started.StartTime
        $samples = @()
        $windowMs = $null
        while ($clock.Elapsed.TotalSeconds -lt 15) {
            $started.Refresh()
            if ($started.HasExited) { throw 'estamp が計測中に終了しました' }
            if ($null -eq $windowMs -and $started.MainWindowHandle -ne 0) { $windowMs = $clock.Elapsed.TotalMilliseconds }
            # Root descendants only, including intermediate WebView2 processes.
            $all = @(Get-CimInstance Win32_Process)
            $ids = @([int]$started.Id)
            do {
                $children = @($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids -and $_.CreationDate -ge $identity })
                $ids += @($children | ForEach-Object { [int]$_.ProcessId })
            } while ($children.Count -gt 0)
            $sampleMs = [math]::Round($clock.Elapsed.TotalMilliseconds,1)
            foreach ($entry in $all | Where-Object { $_.ProcessId -in $ids }) {
                if ($entry.ProcessId -ne $started.Id -and $entry.Name -ne 'msedgewebview2.exe') { continue }
                try {
                    $p = Get-Process -Id $entry.ProcessId -ErrorAction Stop
                    if ($p.StartTime -lt $identity) { continue }
                    $samples += [pscustomobject]@{ Run=$run; Ms=$sampleMs;
                        Pid=$p.Id; Name=$p.ProcessName; WorkingSet=$p.WorkingSet64; PrivateBytes=$p.PrivateMemorySize64 }
                } catch { } # A WebView child may exit between enumeration and sampling.
            }
            Start-Sleep -Milliseconds 100
        }
        $samples | Export-Csv (Join-Path $OutputDirectory "memory-$run.csv") -NoTypeInformation -Encoding UTF8
        # Exact sampling-cycle totals; retain raw per-PID samples for audit.
        $totals = @($samples | Group-Object Ms | ForEach-Object {
            $latest = @($_.Group | Group-Object Pid | ForEach-Object { $_.Group | Select-Object -Last 1 })
            [pscustomobject]@{ Ms=[double]$_.Name; PrivateBytes=($latest | Measure-Object PrivateBytes -Sum).Sum;
                WorkingSet=($latest | Measure-Object WorkingSet -Sum).Sum }
        } | Sort-Object Ms)
        $totals | Export-Csv (Join-Path $OutputDirectory "totals-$run.csv") -NoTypeInformation
        $metrics = @{}
        $nativeMetrics = @{}
        if (Test-Path $env:ESTAMP_PR05_METRICS) {
            Get-Content $env:ESTAMP_PR05_METRICS | ForEach-Object {
                $parts = $_ -split ','; $metrics[$parts[0]] = [double]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture)
                if ($parts.Count -ge 3) { $nativeMetrics[$parts[0]] = [double]::Parse($parts[2], [Globalization.CultureInfo]::InvariantCulture) }
            }
        }
        $increase = (($totals | Measure-Object PrivateBytes -Maximum).Maximum - $totals[0].PrivateBytes) / 1MB
        $summary += [pscustomobject]@{ Run=$run; WindowHandleMs=$windowMs; FirstPaintNavigationMs=$metrics['first-window-paint'];
            FontsReadyNavigationMs=$metrics['fonts-ready']; StampRenderNavigationMs=$metrics['first-stamp-render'];
            FirstPaintNativeMainMs=$nativeMetrics['first-window-paint']; FontsReadyNativeMainMs=$nativeMetrics['fonts-ready'];
            StampRenderNativeMainMs=$nativeMetrics['first-stamp-render'];
            BaselinePrivateMB=$totals[0].PrivateBytes/1MB; PeakPrivateMB=($totals | Measure-Object PrivateBytes -Maximum).Maximum/1MB;
            AfterPrivateMB=$totals[-1].PrivateBytes/1MB; IncreaseMB=$increase;
            FlagPaint=($windowMs -gt 1000 -or $nativeMetrics['first-window-paint'] -gt 1000);
            FlagFonts=($nativeMetrics['fonts-ready'] -gt 3000); FlagMemory=($increase -gt 300);
            MissingMetrics=($metrics.Count -ne 3 -or $nativeMetrics.Count -ne 3) }
        if (-not $started.HasExited -and $started.StartTime -eq $identity) {
            [void]$started.CloseMainWindow()
            if (-not $started.WaitForExit(5000)) { $started.Kill(); $started.WaitForExit() }
        }
        $started = $null
        Start-Sleep -Milliseconds 500
    }
    $summary | Export-Csv (Join-Path $OutputDirectory 'summary.csv') -NoTypeInformation -Encoding UTF8
    $summary | Format-Table
} finally {
    if ($started) {
        $started.Refresh()
        if (-not $started.HasExited -and $started.StartTime -eq $identity) {
            [void]$started.CloseMainWindow()
            if (-not $started.WaitForExit(5000)) { $started.Kill(); $started.WaitForExit() }
        }
    }
    $env:ESTAMP_PR05_METRICS = $oldMetrics
    if ($owned -and (Test-Path (Join-Path $settings 'pr05-owner.txt')) -and
        (Get-Content (Join-Path $settings 'pr05-owner.txt') -Raw).Trim() -eq $token) {
        # Only known test files; never recurse through a profile directory.
        foreach ($name in @('Setting.json','Setting.lock','pr05-owner.txt')) {
            $path = Join-Path $settings $name
            if (Test-Path $path -PathType Leaf) { Remove-Item -LiteralPath $path }
        }
        if (@(Get-ChildItem $settings -Force).Count -eq 0) { Remove-Item -LiteralPath $settings }
    }
}
