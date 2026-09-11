#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PACKAGE_FILE="$PROJECT_ROOT/frontend_react/package.json"
LOCK_FILE="$PROJECT_ROOT/frontend_react/package-lock.json"
README_FILE="$PROJECT_ROOT/README.md"

REMOTE="${ODOC_RELEASE_REMOTE:-origin}"
DRY_RUN=false

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() {
    printf "%b\n" "${CYAN}$1${NC}"
}

success() {
    printf "%b\n" "${GREEN}$1${NC}"
}

warn() {
    printf "%b\n" "${YELLOW}$1${NC}"
}

fail() {
    printf "%b\n" "${RED}$1${NC}" >&2
    exit 1
}

usage() {
    cat <<'EOF'
用法：
  ./scripts/release.sh [版本号]
  ./scripts/release.sh --dry-run [版本号]

示例：
  ./scripts/release.sh 0.9.5
  ./scripts/release.sh --dry-run 0.9.5

说明：
  - 版本号可以写成 0.9.5 或 v0.9.5，脚本最终使用 v0.9.5 作为 Git tag。
  - 发布提交会包含当前工作区全部已跟踪和未跟踪改动；工作区有改动时会先要求确认。
  - 可通过 ODOC_RELEASE_REMOTE 指定 Git 远端，默认使用 origin。
  - --dry-run 只执行检查和展示计划，不修改文件、不提交、不打 tag、不推送。
EOF
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "未检测到 ${1}，请先安装或将其加入 PATH。"
}

confirm() {
    local answer
    read -r -p "$1 [y/N] " answer
    [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

normalize_version() {
    local input="$1"
    if [[ "$input" == v* ]]; then
        input="${input#v}"
    fi

    if [[ ! "$input" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
        fail "版本号格式无效：${1}。请输入类似 0.9.5 的三段式版本号。"
    fi

    printf '%s\n' "$input"
}

version_is_lower() {
    local left="$1"
    local right="$2"
    local left_major left_minor left_patch
    local right_major right_minor right_patch

    IFS=. read -r left_major left_minor left_patch <<< "$left"
    IFS=. read -r right_major right_minor right_patch <<< "$right"

    if ((10#$left_major < 10#$right_major)); then
        return 0
    fi
    if ((10#$left_major > 10#$right_major)); then
        return 1
    fi
    if ((10#$left_minor < 10#$right_minor)); then
        return 0
    fi
    if ((10#$left_minor > 10#$right_minor)); then
        return 1
    fi
    ((10#$left_patch < 10#$right_patch))
}

read_recorded_versions() {
    node - "$PACKAGE_FILE" "$LOCK_FILE" "$README_FILE" <<'NODE'
const fs = require('fs');

const [packageFile, lockFile, readmeFile] = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const lockJson = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
const readme = fs.readFileSync(readmeFile, 'utf8');
const readmeMatch = readme.match(/https:\/\/img\.shields\.io\/badge\/version-([0-9]+\.[0-9]+\.[0-9]+)-blue\.svg/);

if (!readmeMatch) {
    throw new Error('README.md 中未找到标准版本徽章。');
}

process.stdout.write([
    packageJson.version || '',
    lockJson.version || '',
    lockJson.packages?.['']?.version || '',
    readmeMatch[1],
].join('\t'));
NODE
}

assert_version_consistency() {
    local expected="$1"
    local package_version lock_version lock_root_version readme_version

    IFS=$'\t' read -r package_version lock_version lock_root_version readme_version \
        <<< "$(read_recorded_versions)"

    if [[ "$package_version" != "$expected" || \
          "$lock_version" != "$expected" || \
          "$lock_root_version" != "$expected" || \
          "$readme_version" != "$expected" ]]; then
        fail "版本记录不一致：package.json=${package_version}，package-lock.json=${lock_version}，package-lock 根包=${lock_root_version}，README=${readme_version}，期望=${expected}。"
    fi
}

update_version_files() {
    local version="$1"

    node - "$PACKAGE_FILE" "$LOCK_FILE" "$README_FILE" "$version" <<'NODE'
const fs = require('fs');

const [packageFile, lockFile, readmeFile, version] = process.argv.slice(2);

function updateJson(file, update) {
    const original = fs.readFileSync(file, 'utf8');
    const value = JSON.parse(original);
    update(value);
    const updated = `${JSON.stringify(value, null, 2)}\n`;
    if (updated !== original) {
        fs.writeFileSync(file, updated, 'utf8');
    }
}

updateJson(packageFile, (packageJson) => {
    packageJson.version = version;
});

updateJson(lockFile, (lockJson) => {
    lockJson.version = version;
    if (!lockJson.packages || !lockJson.packages['']) {
        throw new Error('package-lock.json 中未找到根项目 packages[""] 记录。');
    }
    lockJson.packages[''].version = version;
});

const originalReadme = fs.readFileSync(readmeFile, 'utf8');
const readmePattern = /(https:\/\/img\.shields\.io\/badge\/version-)([0-9]+\.[0-9]+\.[0-9]+)(-blue\.svg)/;
if (!readmePattern.test(originalReadme)) {
    throw new Error('README.md 中未找到标准版本徽章。');
}
const updatedReadme = originalReadme.replace(readmePattern, `$1${version}$3`);
if (updatedReadme !== originalReadme) {
    fs.writeFileSync(readmeFile, updatedReadme, 'utf8');
}
NODE
}

local_tag_exists() {
    git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null 2>&1
}

remote_tag_info() {
    git ls-remote "$REMOTE" "refs/tags/$TAG" "refs/tags/$TAG^{}"
}

remote_tag_exists() {
    [[ -n "$(remote_tag_info)" ]]
}

remote_tag_commit() {
    local tag_info
    tag_info="$(remote_tag_info)"
    printf '%s\n' "$tag_info" | awk \
        -v tag_ref="refs/tags/$TAG" \
        -v peeled_ref="refs/tags/$TAG^{}" '
        $2 == peeled_ref { print $1; found = 1; exit }
        $2 == tag_ref { fallback = $1 }
        END { if (!found && fallback) print fallback }
    '
}

cd "$PROJECT_ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
fi

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    shift
fi

if [[ "$#" -gt 1 ]]; then
    usage >&2
    exit 1
fi

require_command git
require_command node

git rev-parse --show-toplevel >/dev/null 2>&1 || fail "当前目录不在 Git 仓库中。"
[[ -f "$PACKAGE_FILE" ]] || fail "未找到 ${PACKAGE_FILE}。"
[[ -f "$LOCK_FILE" ]] || fail "未找到 ${LOCK_FILE}。"
[[ -f "$README_FILE" ]] || fail "未找到 ${README_FILE}。"
git remote get-url "$REMOTE" >/dev/null 2>&1 || fail "Git 远端不存在：${REMOTE}。"

BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
[[ -n "$BRANCH" ]] || fail "当前处于 detached HEAD，无法确定要推送的分支。"

CURRENT_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$PACKAGE_FILE', 'utf8')).version || ''")"
CURRENT_VERSION="$(normalize_version "$CURRENT_VERSION")"

if [[ "$#" -eq 1 ]]; then
    VERSION_INPUT="$1"
else
    read -r -p "请输入要发布的版本号（当前版本 ${CURRENT_VERSION}）：" VERSION_INPUT
fi

VERSION="$(normalize_version "$VERSION_INPUT")"
TAG="v$VERSION"

if version_is_lower "$VERSION" "$CURRENT_VERSION"; then
    fail "目标版本 ${VERSION} 低于当前版本 ${CURRENT_VERSION}，禁止发布。"
fi

LOCAL_TAG_EXISTS=false
REMOTE_TAG_EXISTS=false
if local_tag_exists; then
    LOCAL_TAG_EXISTS=true
fi
if ! remote_tag_info >/dev/null 2>&1; then
    fail "无法查询远端 ${REMOTE} 的标签 ${TAG}，请检查网络和 Git 权限。"
fi
if remote_tag_exists; then
    REMOTE_TAG_EXISTS=true
fi

if [[ "$LOCAL_TAG_EXISTS" == true || "$REMOTE_TAG_EXISTS" == true ]]; then
    warn "标签 ${TAG} 已存在：本地=${LOCAL_TAG_EXISTS}，远端=${REMOTE_TAG_EXISTS}。"
    if ! confirm "是否仍然继续，并将该标签移动到本次发布提交？"; then
        info "已取消发布。"
        exit 0
    fi
fi

INITIAL_STATUS="$(git status --porcelain)"
STAGE_ALL=false
if [[ -n "$INITIAL_STATUS" ]]; then
    warn "当前工作区存在改动，本次发布提交会包含以下全部改动："
    printf '%s\n' "$INITIAL_STATUS"
    if ! confirm "是否继续并将这些改动全部纳入发布提交？"; then
        info "已取消发布，工作区未修改。"
        exit 0
    fi
    STAGE_ALL=true
fi

info "发布计划："
printf '  版本：%s -> %s\n' "$CURRENT_VERSION" "$VERSION"
printf '  提交：chore: release %s\n' "$TAG"
printf '  分支：%s -> %s/%s\n' "$BRANCH" "$REMOTE" "$BRANCH"
printf '  标签：%s -> %s/%s\n' "$TAG" "$REMOTE" "$TAG"

if [[ "$DRY_RUN" == true ]]; then
    info "dry-run 模式：未修改文件、未提交、未打 tag、未推送。"
    exit 0
fi

update_version_files "$VERSION"
assert_version_consistency "$VERSION"

if [[ "$STAGE_ALL" == true ]]; then
    git add -A
else
    git add -- "$PACKAGE_FILE" "$LOCK_FILE" "$README_FILE"
fi

git diff --cached --check

COMMIT_CREATED=false
if git diff --cached --quiet; then
    info "没有需要提交的文件，跳过创建空提交。"
else
    git commit -m "chore: release $TAG"
    COMMIT_CREATED=true
fi

TARGET_COMMIT="$(git rev-parse HEAD)"

if [[ "$LOCAL_TAG_EXISTS" == true ]]; then
    git tag -fa "$TAG" -m "Release $TAG" "$TARGET_COMMIT"
else
    git tag -a "$TAG" -m "Release $TAG" "$TARGET_COMMIT"
fi

if [[ "$COMMIT_CREATED" == true ]]; then
    git push "$REMOTE" "HEAD:$BRANCH"
else
    info "本次没有新的代码提交，跳过分支 push。"
fi

if [[ "$REMOTE_TAG_EXISTS" == true ]]; then
    REMOTE_TARGET_COMMIT="$(remote_tag_commit || true)"
    if [[ "$REMOTE_TARGET_COMMIT" == "$TARGET_COMMIT" ]]; then
        info "远端标签 $TAG 已经指向当前提交，跳过 tag push。"
    else
        git push "$REMOTE" "refs/tags/$TAG:refs/tags/$TAG" --force
    fi
else
    git push "$REMOTE" "refs/tags/$TAG"
fi

success "发布完成：$TAG -> $TARGET_COMMIT"
