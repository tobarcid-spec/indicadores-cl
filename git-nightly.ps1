$repoPath = "c:\procesos\personal\indicadores-cl"
$logFile  = "$repoPath\git-nightly.log"
$date     = Get-Date -Format "yyyy-MM-dd HH:mm"

Set-Location $repoPath

$status = git status --porcelain 2>&1
if (-not $status) {
    Add-Content $logFile "[$date] Sin cambios, nada que subir."
    exit 0
}

git add -A 2>&1 | Out-Null
git commit -m "chore: actualizacion automatica $date" 2>&1 | Out-Null
$push = git push 2>&1

Add-Content $logFile "[$date] Push OK — $($status.Count) cambios."
