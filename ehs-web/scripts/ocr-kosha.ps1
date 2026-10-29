# KOSHA GUIDE PDF 중 본문이 그림(스캔)인 파일 → Windows 내장 한국어 OCR 로 글자 읽기
#   powershell -ExecutionPolicy Bypass -File scripts/ocr-kosha.ps1
#   - 대상 : ..\절차서_위험성평가\위험성평가\KOSHA 의 PDF 중 쪽당 글자가 적은 것 (import-risk-refs.mjs 가 만든 .cache\kosha-ocr-list.txt)
#   - 결과 : .cache\kosha-ocr\<파일 이름>.txt (쪽마다 OCR 줄) → import-risk-refs.mjs 가 글자 대신 사용
#   - 인터넷 · 외부 프로그램 없이 Windows.Data.Pdf(쪽 그림) + Windows.Media.Ocr(ko) 사용
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}
function AwaitAction($op) {
  $m = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
  $m.Invoke($null, @($op)).Wait() | Out-Null
}

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path (Split-Path -Parent $root) "절차서_위험성평가\위험성평가\KOSHA"
$out = Join-Path $root ".cache\kosha-ocr"
New-Item -ItemType Directory -Force $out | Out-Null
$list = Get-Content -Encoding utf8 (Join-Path $root ".cache\kosha-ocr-list.txt") | Where-Object { $_.Trim() }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("ko"))
if (-not $engine) { throw "한국어 OCR 을 쓸 수 없습니다 (Windows 설정 → 언어에 한국어 필요)" }

foreach ($name in $list) {
  $dest = Join-Path $out ($name -replace '\.pdf$', '.txt')
  if (Test-Path $dest) { Write-Output "건너뜀 (이미 있음) : $name"; continue }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Join-Path $dir $name))) ([Windows.Storage.StorageFile])
  $pdf = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  $pages = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $pdf.PageCount; $i++) {
    $page = $pdf.GetPage($i)
    $opt = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
    $opt.DestinationWidth = [uint32][Math]::Min(2400, $page.Size.Width * 2.5)
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    AwaitAction ($page.RenderToStreamAsync($stream, $opt))
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $pages.Add((($res.Lines | ForEach-Object { $_.Text }) -join "`n"))
    $page.Dispose(); $stream.Dispose()
  }
  [System.IO.File]::WriteAllText($dest, ($pages -join "`f"), [System.Text.UTF8Encoding]::new($false))
  Write-Output ("OCR {0}쪽 : {1}" -f $pdf.PageCount, $name)
}
