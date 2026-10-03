param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectDirectory
$localUrl = 'http://127.0.0.1:5173/'
try {
    $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
        if (-not $NoBrowser) { Start-Process $localUrl }
        Write-Output "Already available: $localUrl"
        exit 0
    }
} catch {}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeExecutable = $nodeCommand.Source }
else {
    $nodeExecutable = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js 22.13 or newer is required.' }
}
New-Item -ItemType Directory -Path '.local' -Force | Out-Null
$server = Start-Process -FilePath $nodeExecutable -ArgumentList @('scripts/run-framework.mjs','dev','--hostname','127.0.0.1','--port','5173') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput '.local/server.log' -RedirectStandardError '.local/server-errors.log' -PassThru
Set-Content -LiteralPath '.local/server.pid' -Value $server.Id
$ready = $false
for ($attempt = 0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) { throw 'The local server stopped. See .local/server-errors.log.' }
    try { $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}
}
if (-not $ready) { throw 'The server is still starting. See .local/server.log.' }
Write-Output "Ready: $localUrl"
if (-not $NoBrowser) { Start-Process $localUrl }
