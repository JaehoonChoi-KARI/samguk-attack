# Takes a screenshot of a ?shot= scene with headless Edge (the local server must be on :8000).
#   pwsh -File tools/shot.ps1 -Query "shot=battle&n=4"                    -> shots/battle.png
#   pwsh -File tools/shot.ps1 -Query "shot=battle&n=4&touch=1" -Name touch -Size "844,390"
param([string]$Query = "shot=battle&n=4", [string]$Name = "", [string]$Size = "1180,820", [int]$Budget = 8000)
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not $Name) { $Name = ($Query -split '&')[0] -replace '^shot=', '' }
$dir = Join-Path $env:TEMP "jw-game-shots"
New-Item -ItemType Directory -Force $dir | Out-Null
$png = Join-Path $dir "$Name.png"
$url = "http://localhost:8000/?$Query"
$a = @('--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', "--user-data-dir=$dir\edge-$Name", '--hide-scrollbars',
  "--window-size=$Size", "--virtual-time-budget=$Budget", "--screenshot=$png", "`"$url`"")
Start-Process -FilePath $edge -ArgumentList $a -Wait -NoNewWindow -RedirectStandardError "$dir\$Name-log.txt" | Out-Null
Select-String -Path "$dir\$Name-log.txt" -Pattern 'Uncaught|SyntaxError|TypeError|ReferenceError' | Select-Object -First 5 | ForEach-Object { $_.Line }
$png
