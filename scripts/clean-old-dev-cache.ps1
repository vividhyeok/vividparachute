param([switch]$Apply)
$ErrorActionPreference='Stop'
$cutoff=[DateTimeOffset]::Parse('2026-08-23T00:00:00+09:00').UtcDateTime
$roots=@((Join-Path $env:LOCALAPPDATA 'npm-cache'),(Join-Path $env:LOCALAPPDATA 'pip/Cache'),(Join-Path $env:LOCALAPPDATA 'Yarn/Cache'),(Join-Path $env:USERPROFILE '.cache/pip'))
$candidates=@()
foreach($root in $roots){
 if(-not(Test-Path -LiteralPath $root)){continue}
 $resolved=(Resolve-Path -LiteralPath $root).Path
 if(((Get-Item -LiteralPath $resolved).Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0){continue}
 foreach($file in (Get-ChildItem -LiteralPath $resolved -File -Recurse -Force -ErrorAction SilentlyContinue)){
  if($file.LastWriteTimeUtc-ge$cutoff-or$file.CreationTimeUtc-ge$cutoff-or(($file.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0)){continue}
  $absolute=[IO.Path]::GetFullPath($file.FullName)
  if(-not$absolute.StartsWith($resolved+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Path escaped the selected cache directory'}
  $candidates+=$file
 }
}
$total=($candidates|Measure-Object Length -Sum).Sum
Write-Host ('Found {0} old cache files, {1:N2} GB. Cutoff: 2026-08-23. Recent files and project folders are excluded.'-f$candidates.Count,($total/1GB))
if(-not$Apply){Write-Host 'Preview only. Run this script with -Apply to remove the listed old cache files.';return}
$removed=0L;$failures=0
foreach($candidate in $candidates){
 try{
  $file=Get-Item -LiteralPath $candidate.FullName -Force -ErrorAction Stop
  if($file.LastWriteTimeUtc-ge$cutoff-or$file.CreationTimeUtc-ge$cutoff-or(($file.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0)){continue}
  $bytes=$file.Length
  Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
  $removed+=$bytes
 }catch{$failures++}
}
Write-Host ('Removed {0:N2} GB; {1} locked or inaccessible files skipped. Project/source/personal files were not targeted.'-f($removed/1GB),$failures)
Get-PSDrive C|Select-Object Name,@{Name='FreeGB';Expression={[math]::Round($_.Free/1GB,2)}}
