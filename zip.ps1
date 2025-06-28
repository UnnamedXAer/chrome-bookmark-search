
Remove-Item "./build" -Recurse -Force -ErrorAction Ignore > $null

npm run tsc > $null
mkdir "./build" > $null

mkdir "./build/icons"  > $null
Get-ChildItem "./icons" -Recurse | Where-Object { ($_.name -like "*.png") } | Copy-Item -Destination "./build/icons/"


Copy-Item "./manifest.json" "./build"
Copy-Item "./src" -Recurse "./build"

Get-ChildItem "./build/src" -Recurse | Where-Object { ($_.name -like "*.ts") -or ($_.name -like "*.js.map") } | Remove-Item

$cwd = $pwd
Set-Location "./build"

# if you do not have zip installed:

# http://stahlworks.com/dev/index.php?tool=zipunzip
# ../zip.exe -FSr "../chrome-ext.zip" "./*" -9

#else

zip.exe -FSr "../chrome-ext.zip" "./*" -9
Set-Location $cwd

Remove-Item "./build" -Recurse -Force -ErrorAction Ignore > $null

Write-Output "finished"

