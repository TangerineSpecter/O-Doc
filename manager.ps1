param(
    [ValidateSet('install', 'update', 'uninstall', 'status', 'source', 'menu')]
    [string]$Action = 'menu'
)

$DeployDir = if ($env:ODOC_DEPLOY_DIR) { $env:ODOC_DEPLOY_DIR } else { Join-Path $HOME 'o-doc' }
$ComposeFile = Join-Path $DeployDir 'compose.prod.yml'
$EnvFile = if ($env:ODOC_ENV_FILE) { $env:ODOC_ENV_FILE } else { Join-Path $DeployDir '.env' }
$LegacyEnvFile = Join-Path $DeployDir '.env.deploy'
$RuntimeDir = Join-Path $DeployDir 'runtime'

$OfficialImage = 'ghcr.io/tangerinespecter/o-doc:latest'
$TcrImage = 'ccr.ccs.tencentyun.com/tangerine_specter/o-doc:latest'
$DefaultImage = if ($env:ODOC_IMAGE_NAME) { $env:ODOC_IMAGE_NAME } else { $OfficialImage }
$DefaultContainerName = 'o-doc'
$DefaultHostPort = '11800'
$DefaultAdminEmail = 'admin@example.com'
$DefaultAllowedHosts = '*'
$DefaultPostgresContainerName = 'o-doc-postgres'
$DefaultPostgresImage = 'm.daocloud.io/docker.io/postgres:16-alpine'
$DefaultPostgresDb = 'odoc'
$DefaultPostgresUser = 'odoc'
$DefaultPostgresBindAddress = '0.0.0.0'
$DefaultPostgresHostPort = '15432'

function Write-Color {
    param(
        [string]$Text,
        [ConsoleColor]$Color = [ConsoleColor]::White
    )
    Write-Host $Text -ForegroundColor $Color
}

function Show-Divider {
    Write-Color '========================================' Green
}

function Show-Banner {
    Show-Divider
    Write-Color '   ____        ____   ____   ______    ' Green
    Write-Color '  / __ \      / __ \ / __ \ / ____/    ' Green
    Write-Color ' / / / /_____/ / / // / / // /         ' Green
    Write-Color '/ /_/ /_____/ /_/ // /_/ // /___       ' Green
    Write-Color '\____/      \____/ \____/ \____/       ' Green
    Show-Divider
    Write-Color ' 📚 A modern document platform powered by Django + React ' White
    Write-Color " 🌻 Architecture: $env:PROCESSOR_ARCHITECTURE" Cyan
    Write-Color " 🔥 Deploy Path : $DeployDir" Cyan
    Write-Color " 🐱 GitHub Repo : https://github.com/TangerineSpecter/O-Doc" Cyan
    Write-Color " 🐳 Image Source: $DefaultImage" Cyan
    Write-Color " 🤖 Author: :丢失的橘子" Cyan
    Write-Host ''
}

function Step {
    param(
        [string]$Index,
        [string]$Message
    )
    Write-Color "[ $Index ] $Message" Green
}

function Ensure-Prerequisites {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw '未检测到 docker，请先安装 Docker Desktop。'
    }

    try {
        docker compose version | Out-Null
    } catch {
        throw '未检测到 docker compose，请先安装或启用 Docker Compose。'
    }
}

function New-Secret {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $base64 = [Convert]::ToBase64String($bytes)
    return (($base64 -replace '[^A-Za-z0-9]', '')).Substring(0, 50)
}

function Get-EnvMap {
    $map = @{}
    if (Test-Path $EnvFile) {
        foreach ($line in Get-Content $EnvFile) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $parts = $line -split '=', 2
            if ($parts.Count -eq 2) {
                $map[$parts[0]] = $parts[1]
            }
        }
    }
    return $map
}

function Save-EnvMap {
    param([hashtable]$Map)

    $orderedKeys = @(
        'IMAGE_NAME',
        'CONTAINER_NAME',
        'HOST_PORT',
        'DJANGO_DEBUG',
        'DJANGO_SECRET_KEY',
        'DJANGO_ALLOWED_HOSTS',
        'ADMIN_EMAIL',
        'POSTGRES_CONTAINER_NAME',
        'POSTGRES_IMAGE',
        'POSTGRES_DB',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_BIND_ADDRESS',
        'POSTGRES_HOST_PORT'
    )

    $lines = foreach ($key in $orderedKeys) {
        if ($Map.ContainsKey($key)) {
            "$key=$($Map[$key])"
        }
    }

    Set-Content -Path $EnvFile -Value $lines -Encoding UTF8
}

function Ensure-Directories {
    $null = New-Item -ItemType Directory -Force -Path $DeployDir
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeDir 'postgres')
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeDir 'media')
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $RuntimeDir 'chroma_data')
}

function Ensure-EnvFileLocation {
    if (Test-Path $EnvFile) {
        if ((Test-Path $LegacyEnvFile) -and ($EnvFile -ne $LegacyEnvFile)) {
            Write-Color "检测到旧配置文件 $LegacyEnvFile，当前已优先使用 $EnvFile。" Yellow
        }
        return
    }

    if ((Test-Path $LegacyEnvFile) -and ($EnvFile -ne $LegacyEnvFile)) {
        Move-Item -Path $LegacyEnvFile -Destination $EnvFile
        Write-Color "已将旧配置文件迁移为 $EnvFile。" Yellow
    }
}

function Write-ComposeFile {
    $composeContent = @"
services:
  db:
    image: `${POSTGRES_IMAGE:-$DefaultPostgresImage}
    container_name: `${POSTGRES_CONTAINER_NAME:-$DefaultPostgresContainerName}
    restart: unless-stopped
    environment:
      POSTGRES_DB: `${POSTGRES_DB:-$DefaultPostgresDb}
      POSTGRES_USER: `${POSTGRES_USER:-$DefaultPostgresUser}
      POSTGRES_PASSWORD: `${POSTGRES_PASSWORD}
    ports:
      - "`${POSTGRES_BIND_ADDRESS:-$DefaultPostgresBindAddress}:`${POSTGRES_HOST_PORT:-$DefaultPostgresHostPort}:5432"
    volumes:
      - ./runtime/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U `$`${POSTGRES_USER} -d `$`${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 20

  app:
    image: `${IMAGE_NAME:-$DefaultImage}
    container_name: `${CONTAINER_NAME:-$DefaultContainerName}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "`${HOST_PORT:-$DefaultHostPort}:11800"
    environment:
      PORT: 11800
      ADMIN_EMAIL: `${ADMIN_EMAIL:-$DefaultAdminEmail}
      DJANGO_DEBUG: `${DJANGO_DEBUG:-false}
      DJANGO_SECRET_KEY: `${DJANGO_SECRET_KEY}
      DJANGO_ALLOWED_HOSTS: "`${DJANGO_ALLOWED_HOSTS:-$DefaultAllowedHosts}"
      DJANGO_DB_ENGINE: postgresql
      POSTGRES_DB: `${POSTGRES_DB:-$DefaultPostgresDb}
      POSTGRES_USER: `${POSTGRES_USER:-$DefaultPostgresUser}
      POSTGRES_PASSWORD: `${POSTGRES_PASSWORD}
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      DJANGO_MEDIA_ROOT: /app/runtime/media
      DJANGO_STATIC_ROOT: /app/staticfiles
      ODOC_CHROMA_PATH: /app/runtime/chroma_data
    volumes:
      - ./runtime/media:/app/runtime/media
      - ./runtime/chroma_data:/app/runtime/chroma_data
"@

    Set-Content -Path $ComposeFile -Value $composeContent -Encoding UTF8
}

function Initialize-EnvFile {
    if (Test-Path $EnvFile) {
        return
    }

    $secret = Read-Host '请输入 DJANGO_SECRET_KEY（直接回车将自动生成）'
    if ([string]::IsNullOrWhiteSpace($secret)) {
        $secret = New-Secret
    }

    $map = @{
        IMAGE_NAME = $DefaultImage
        CONTAINER_NAME = $DefaultContainerName
        HOST_PORT = $DefaultHostPort
        DJANGO_DEBUG = 'false'
        DJANGO_SECRET_KEY = $secret
        DJANGO_ALLOWED_HOSTS = $DefaultAllowedHosts
        ADMIN_EMAIL = $DefaultAdminEmail
        POSTGRES_CONTAINER_NAME = $DefaultPostgresContainerName
        POSTGRES_IMAGE = $DefaultPostgresImage
        POSTGRES_DB = $DefaultPostgresDb
        POSTGRES_USER = $DefaultPostgresUser
        POSTGRES_PASSWORD = New-Secret
        POSTGRES_BIND_ADDRESS = $DefaultPostgresBindAddress
        POSTGRES_HOST_PORT = $DefaultPostgresHostPort
    }

    Save-EnvMap -Map $map
}

function Ensure-EnvDefaults {
    if (-not (Test-Path $EnvFile)) {
        return
    }

    $map = Get-EnvMap

    if (-not $map.IMAGE_NAME) {
        $map.IMAGE_NAME = $DefaultImage
    }
    if (-not $map.CONTAINER_NAME) { $map.CONTAINER_NAME = $DefaultContainerName }
    if (-not $map.HOST_PORT) { $map.HOST_PORT = $DefaultHostPort }
    if (-not $map.DJANGO_DEBUG) { $map.DJANGO_DEBUG = 'false' }
    if (-not $map.DJANGO_ALLOWED_HOSTS) { $map.DJANGO_ALLOWED_HOSTS = $DefaultAllowedHosts }
    if (-not $map.ADMIN_EMAIL) { $map.ADMIN_EMAIL = $DefaultAdminEmail }
    if (-not $map.POSTGRES_CONTAINER_NAME) { $map.POSTGRES_CONTAINER_NAME = $DefaultPostgresContainerName }
    if (-not $map.POSTGRES_IMAGE) { $map.POSTGRES_IMAGE = $DefaultPostgresImage }
    if (-not $map.POSTGRES_DB) { $map.POSTGRES_DB = $DefaultPostgresDb }
    if (-not $map.POSTGRES_USER) { $map.POSTGRES_USER = $DefaultPostgresUser }
    if (-not $map.POSTGRES_PASSWORD) { $map.POSTGRES_PASSWORD = New-Secret }
    if (-not $map.POSTGRES_BIND_ADDRESS) { $map.POSTGRES_BIND_ADDRESS = $DefaultPostgresBindAddress }
    if (-not $map.POSTGRES_HOST_PORT) { $map.POSTGRES_HOST_PORT = $DefaultPostgresHostPort }

    if (-not $map.DJANGO_SECRET_KEY) {
        $secret = Read-Host '请输入 DJANGO_SECRET_KEY（直接回车将自动生成）'
        if ([string]::IsNullOrWhiteSpace($secret)) {
            $secret = New-Secret
        }
        $map.DJANGO_SECRET_KEY = $secret
    }

    Save-EnvMap -Map $map
}

function Invoke-Compose {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ComposeArgs
    )

    Push-Location $DeployDir
    try {
        & docker compose --env-file $EnvFile -f $ComposeFile @ComposeArgs
    } finally {
        Pop-Location
    }
}

function Get-ServerIp {
    try {
        $addresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and $_.IPAddressToString -ne '127.0.0.1' }
        return ($addresses | Select-Object -First 1).IPAddressToString
    } catch {
        return $null
    }
}

function Show-Intro {
    param([string]$Mode)

    switch ($Mode) {
        'install' {
            Write-Color '正在准备安装流程...' Cyan
            Write-Color '脚本会自动生成配置、拉取镜像并启动服务。' Cyan
        }
        'update' {
            Write-Color '正在准备更新流程...' Cyan
            Write-Color '脚本会自动刷新配置、拉取新镜像并重启服务。' Cyan
        }
        'uninstall' {
            Write-Color '正在准备卸载流程...' Cyan
            Write-Color '脚本会停止并删除容器，可选保留本地数据。' Cyan
        }
    }
    Write-Host ''
}

function Show-Summary {
    $map = Get-EnvMap
    $serverIp = Get-ServerIp
    $containerName = if ($map.CONTAINER_NAME) { $map.CONTAINER_NAME } else { $DefaultContainerName }
    $hostPort = if ($map.HOST_PORT) { $map.HOST_PORT } else { $DefaultHostPort }
    $postgresDb = if ($map.POSTGRES_DB) { $map.POSTGRES_DB } else { $DefaultPostgresDb }
    $postgresUser = if ($map.POSTGRES_USER) { $map.POSTGRES_USER } else { $DefaultPostgresUser }
    $postgresBindAddress = if ($map.POSTGRES_BIND_ADDRESS) { $map.POSTGRES_BIND_ADDRESS } else { $DefaultPostgresBindAddress }
    $postgresHostPort = if ($map.POSTGRES_HOST_PORT) { $map.POSTGRES_HOST_PORT } else { $DefaultPostgresHostPort }

    Write-Host ''
    Show-Divider
    Write-Color 'O-Doc 已启动。' Green
    Write-Color "服务名: $containerName" White
    Write-Color "DJANGO_SECRET_KEY: $($map.DJANGO_SECRET_KEY)" White
    Write-Color "本机访问地址: http://localhost:$hostPort" White
    Write-Color "PostgreSQL: $postgresUser@$postgresBindAddress`:$postgresHostPort/$postgresDb" White
    if ($serverIp) {
        Write-Color "局域网访问地址: http://$serverIp`:$hostPort" White
    }
    Write-Color "部署目录: $DeployDir" White
    Show-Divider
}

function Install-App {
    Ensure-Prerequisites
    Show-Intro -Mode install

    Step '1/4' '准备部署目录'
    Ensure-Directories
    Ensure-EnvFileLocation

    Step '2/4' '生成部署配置'
    Write-ComposeFile
    Initialize-EnvFile
    Ensure-EnvDefaults

    Step '3/4' '拉取最新镜像'
    Invoke-Compose pull

    Step '4/4' '启动 O-Doc'
    Invoke-Compose up -d

    Show-Summary
}

function Update-App {
    Ensure-Prerequisites
    Show-Intro -Mode update
    Ensure-Directories
    Ensure-EnvFileLocation

    if (-not (Test-Path $ComposeFile) -or -not (Test-Path $EnvFile)) {
        Write-Color '未检测到已安装的 O-Doc，将转为执行安装流程。' Yellow
        Install-App
        return
    }

    Step '1/3' '刷新部署配置'
    Write-ComposeFile
    Ensure-EnvDefaults

    Step '2/3' '拉取最新镜像'
    Invoke-Compose pull

    Step '3/3' '更新并重启服务'
    Invoke-Compose up -d

    Show-Summary
}

function Uninstall-App {
    Ensure-Prerequisites
    Show-Intro -Mode uninstall
    Ensure-EnvFileLocation

    if (-not (Test-Path $ComposeFile) -or -not (Test-Path $EnvFile)) {
        Write-Color '未检测到已安装的 O-Doc。' Yellow
        return
    }

    Write-Color '即将卸载 O-Doc。' Yellow
    Write-Color '这会停止并删除容器，默认保留数据库和上传数据。' Yellow
    $confirm = Read-Host '确认卸载吗？[y/N]'

    if ($confirm -match '^[yY]$') {
        Invoke-Compose down --remove-orphans
        Write-Color 'O-Doc 容器已删除。' Green

        $removeData = Read-Host "是否同时删除本地数据目录 $RuntimeDir ？[y/N]"
        if ($removeData -match '^[yY]$') {
            if (Test-Path $RuntimeDir) {
                Remove-Item -Recurse -Force $RuntimeDir
            }
            Write-Color '本地数据目录已删除。' Green
        } else {
            Write-Color '已保留本地数据目录。' Yellow
        }
    } else {
        Write-Color '已取消卸载。' Yellow
    }
}

function Show-Status {
    Ensure-Prerequisites
    Ensure-EnvFileLocation

    if (-not (Test-Path $ComposeFile) -or -not (Test-Path $EnvFile)) {
        Write-Color '未检测到已安装的 O-Doc。' Yellow
        return
    }

    Invoke-Compose ps
}

function Switch-ImageSource {
    Ensure-Directories
    Ensure-EnvFileLocation
    Write-ComposeFile
    if (-not (Test-Path $EnvFile)) {
        Initialize-EnvFile
    }
    Ensure-EnvDefaults

    Write-Host '请选择镜像源：'
    Write-Host '1. GitHub Container Registry（默认）'
    Write-Host '2. 腾讯云 TCR'
    Write-Host '3. 自定义镜像地址'
    $choice = Read-Host '请输入选项编号'

    switch ($choice) {
        '1' { $image = $OfficialImage }
        '2' { $image = $TcrImage }
        '3' { $image = Read-Host '请输入完整镜像地址' }
        default {
            Write-Color '无效镜像源选项。' Red
            return
        }
    }

    if ([string]::IsNullOrWhiteSpace($image)) {
        Write-Color '镜像地址不能为空。' Red
        return
    }

    $map = Get-EnvMap
    $map.IMAGE_NAME = $image
    Save-EnvMap -Map $map
    Write-Color "镜像源已切换为：$image" Green
}

function Show-Menu {
    Show-Banner
    Write-Host '请选择操作：'
    Write-Host '1. 安装'
    Write-Host '2. 更新'
    Write-Host '3. 卸载'
    Write-Host '4. 查看状态'
    Write-Host '5. 切换镜像源'
    Write-Host '0. 退出'
}

function Start-Menu {
    while ($true) {
        Show-Menu
        $choice = Read-Host '请输入选项编号'

        switch ($choice) {
            '1' { Install-App }
            '2' { Update-App }
            '3' { Uninstall-App }
            '4' { Show-Status }
            '5' { Switch-ImageSource }
            '0' { return }
            default { Write-Color '无效选项，请重新输入。' Red }
        }

        Write-Host ''
    }
}

switch ($Action) {
    'install' { Install-App }
    'update' { Update-App }
    'uninstall' { Uninstall-App }
    'status' { Show-Status }
    'source' { Switch-ImageSource }
    default { Start-Menu }
}
