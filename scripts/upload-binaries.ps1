# scripts/upload-binaries.ps1
# CI/CD용 바이너리를 GitHub Release 'binaries-latest'에 업로드하는 스크립트.
# 사전 조건: gh CLI 설치 및 로그인 (https://cli.github.com)
#
# 사용법:
#   cd 프로젝트_루트
#   ./scripts/upload-binaries.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$BinariesDir = Join-Path $Root "desktop/src-tauri/binaries"
# .github/workflows/build.yml 의 release-downloader 가 받는 파일명과 일치해야 함
$ZipPath = Join-Path $Root "paperchat-binaries.zip"
$Repo = "KwonCheulJin/paperchat"
$Tag = "binaries-latest"

# .pdb 제외하고 모든 바이너리 수집
$Files = Get-ChildItem $BinariesDir -File | Where-Object { $_.Extension -ne ".pdb" }

Write-Host "`n[1/3] 바이너리 압축 중 ($($Files.Count)개 파일)..."
$Files | ForEach-Object { Write-Host "  + $($_.Name) ($([math]::Round($_.Length / 1MB, 1)) MB)" }

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path ($Files | Select-Object -ExpandProperty FullName) -DestinationPath $ZipPath
$ZipSize = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "  → binaries.zip ($ZipSize MB)"

Write-Host "`n[2/3] 기존 릴리즈 '$Tag' 삭제 중 (없으면 무시)..."
gh release delete $Tag --repo $Repo --yes 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "  (기존 릴리즈 없음, 계속 진행)" }

Write-Host "`n[3/3] GitHub Release '$Tag' 생성 및 업로드 중..."
gh release create $Tag $ZipPath `
    --repo $Repo `
    --title "Pre-built Binaries (CI 전용)" `
    --notes "llama-server, backend.exe, ggml DLL 바이너리. CI/CD 워크플로에서 자동으로 사용됨. 직접 다운로드 불필요." `
    --prerelease

Remove-Item $ZipPath -Force
Write-Host "`n완료! CI/CD에서 자동으로 이 바이너리를 사용합니다."
