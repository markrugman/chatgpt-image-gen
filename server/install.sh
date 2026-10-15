#!/usr/bin/env bash
# Install published images only. Never build source or install Docker on the host.
set -Eeuo pipefail
umask 077
directory="${HOME}/.local/share/chatgpt-image-gen-server"
repository= version= update=false
usage() {
  echo 'Usage: bash install.sh --repository OWNER/chatgpt-image-gen --version X.Y.Z [--directory PATH] [--update]'
  echo 'Rerun the installed script with no options to show status, URL and key.'
}
die() { echo "Error: $*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --repository|--version|--directory)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --repository) repository=$2;; --version) version=$2;; --directory) directory=$2;;
      esac
      shift 2;;
    --update) update=true; shift;;
    --help|-h) usage; exit 0;;
    *) usage; die "Unknown option: $1";;
  esac
done
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || die 'Only Linux x64 is supported.'
for command in docker curl sha256sum ip realpath; do
  command -v "$command" >/dev/null || die "Install $command first. Docker: https://docs.docker.com/engine/install/"
done
docker info >/dev/null 2>&1 || die 'Start Docker and run as a user allowed to use it.'
docker compose version >/dev/null 2>&1 || die 'Install Docker Compose: https://docs.docker.com/compose/install/linux/'
directory=$(realpath -m -- "$directory")
[[ $directory != *$'\n'* && $directory != *','* && $directory != / ]] || die 'Unsupported installation path.'
# A directory lock covers installation, status and updates; traps always release it.
mkdir -p -- "$directory"
chmod 700 "$directory"
mkdir "$directory/.install-lock" 2>/dev/null || die "Another installer is running (lock: $directory/.install-lock)."
stage= stopped=false changed=false backup=
compose() { docker compose --project-directory "$directory" --env-file "$directory/.env" -p chatgpt-image-gen -f "$directory/compose.yaml" "$@"; }
cleanup() {
  result=$?
  trap - EXIT
  if ((result != 0)); then
    if $stopped && ! $changed; then
      compose start imagegen >&2 || echo 'Could not restart the previous server. Start it manually.' >&2
    fi
    if [[ -n $backup ]]; then
      echo "Update did not finish. Private backup and previous configuration: $backup" >&2
      echo 'Do not downgrade against migrated data. See docs/SELF-HOSTED-SERVER.md for recovery.' >&2
    fi
  fi
  [[ -z $stage ]] || rm -rf -- "$stage"
  rmdir "$directory/.install-lock"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
read_setting() { sed -n "s/^$1=//p" "$directory/.env"; }
show_status() {
  compose ps
  echo "Installed version: $(read_setting IMAGEGEN_RELEASE_VERSION)"
  echo "Open: http://$(read_setting IMAGEGEN_BIND_ADDRESS):$(read_setting IMAGEGEN_PORT)"
  if [[ -t 1 && -r /dev/tty && -w /dev/tty ]]; then
    printf 'Server Access Key: ' > /dev/tty
    compose exec -T imagegen sh -c 'if [ -n "$IMAGEGEN_SERVER_TOKEN" ]; then printf "%s\n" "$IMAGEGEN_SERVER_TOKEN"; else cat /data/server-access-key; fi' > /dev/tty
  else
    echo 'Key hidden from redirected output. Rerun interactively to display it.'
  fi
  printf 'Show status/key again: bash %q --directory %q\n' "$directory/install.sh" "$directory"
}
existing=false
if [[ -f $directory/.env ]]; then
  [[ -f $directory/compose.yaml && -f $directory/install.sh ]] || die 'Incomplete installation; restore its configuration before continuing.'
  existing=true
  for container in $(docker ps -aq --filter label=com.docker.compose.project=chatgpt-image-gen); do
    owner_directory=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container")
    [[ $owner_directory == "$directory" ]] || die "This Compose project belongs to $owner_directory; use its original installation directory."
  done
  saved_repository=$(read_setting IMAGEGEN_REPOSITORY)
  [[ -z $repository || $repository == "$saved_repository" ]] || die 'Updates must use the original repository.'
  repository=$saved_repository
  if ! $update; then show_status; exit; fi
  [[ -n $version ]] || die '--update requires an explicit --version X.Y.Z.'
  [[ $version != "$(read_setting IMAGEGEN_RELEASE_VERSION)" ]] || die 'That version is already installed.'
else
  $update && die 'No installation exists here to update.'
  [[ -n $repository && -n $version ]] || { usage; die 'Specify a repository and version.'; }
  for volume in chatgpt-image-gen_imagegen-data chatgpt-image-gen_imagegen-worker; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
      die "Existing volume $volume found. This installer does not adopt existing deployments."
    fi
  done
  if [[ -n $(docker ps -aq --filter label=com.docker.compose.project=chatgpt-image-gen) ]]; then
    die 'An existing chatgpt-image-gen Compose project needs its original installation directory.'
  fi
fi
[[ $repository =~ ^[A-Za-z0-9_.-]+/chatgpt-image-gen$ ]] || die 'Expected OWNER/chatgpt-image-gen.'
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'Use a stable version such as 0.8.0.'
if $existing; then
  current_version=$(read_setting IMAGEGEN_RELEASE_VERSION)
  [[ $(printf '%s\n' "$current_version" "$version" | sort -V | head -n 1) == "$current_version" ]] || die 'Downgrades require restoring a matching full backup; --update only accepts newer versions.'
fi
stage=$(mktemp -d "$directory/.download.XXXXXX")
base="https://github.com/$repository/releases/download/v$version"
for asset in SHA256SUMS compose.release.yaml install.sh server-image.txt; do
  curl --fail --silent --show-error --location --proto '=https' "$base/$asset" -o "$stage/$asset"
done
for asset in compose.release.yaml install.sh server-image.txt; do
  checksum=$(awk -v file="$asset" '$2 == file { print $1 }' "$stage/SHA256SUMS")
  [[ $checksum =~ ^[a-f0-9]{64}$ ]] || die "Missing/duplicate checksum for $asset"
  (cd "$stage"; printf '%s  %s\n' "$checksum" "$asset" | sha256sum --check --status) || die "Checksum failed: $asset"
done
image=$(cat "$stage/server-image.txt")
expected="ghcr.io/${repository,,}"
[[ $image == "$expected"@sha256:* && ${image#*@sha256:} =~ ^[a-f0-9]{64}$ ]] || die 'Release has no verified immutable server image. Its publication may be incomplete.'
bash -n "$stage/install.sh"
if $existing; then
  cp "$directory/.env" "$stage/.env"
  sed -i -e "s|^IMAGEGEN_IMAGE=.*|IMAGEGEN_IMAGE=$image|" -e "s/^IMAGEGEN_RELEASE_VERSION=.*/IMAGEGEN_RELEASE_VERSION=$version/" "$stage/.env"
else
  mapfile -t addresses < <(ip -4 -o addr show scope global | awk '$2 !~ /^(docker|veth|br-|virbr)/ {split($4,a,"/"); if (a[1] ~ /^10\./ || a[1] ~ /^192\.168\./ || a[1] ~ /^172\.(1[6-9]|2[0-9]|3[01])\./) print a[1]}' | sort -u)
  ((${#addresses[@]})) || die 'No private IPv4 address found. Configure a private host address first.'
  if ((${#addresses[@]} == 1)); then bind=${addresses[0]}; else
    echo 'Choose the address your other computers use to reach this host:'
    for index in "${!addresses[@]}"; do echo "$((index+1))) ${addresses[index]}"; done
    read -r -p 'Address number: ' choice < /dev/tty
    [[ $choice =~ ^[1-9][0-9]*$ ]] && ((choice <= ${#addresses[@]})) || die 'Invalid selection.'
    bind=${addresses[choice-1]}
  fi
  read -r -p 'Port [8787]: ' port < /dev/tty
  port=${port:-8787}
  [[ $port =~ ^[1-9][0-9]{0,4}$ ]] && ((port <= 65535)) || die 'Invalid port.'
  read -r -p 'Enable image generation in the browser? [Y/n]: ' answer < /dev/tty
  case "$answer" in ''|y|Y|yes|Yes) worker=true;; n|N|no|No) worker=false;; *) die 'Answer yes or no.';; esac
  printf '%s\n' "IMAGEGEN_REPOSITORY=$repository" "IMAGEGEN_RELEASE_VERSION=$version" "IMAGEGEN_IMAGE=$image" "IMAGEGEN_BIND_ADDRESS=$bind" "IMAGEGEN_PORT=$port" "IMAGEGEN_WORKER_ENABLED=$worker" 'IMAGEGEN_SERVER_TOKEN=' > "$stage/.env"
fi
docker compose --project-directory "$directory" --env-file "$stage/.env" -p chatgpt-image-gen -f "$stage/compose.release.yaml" config --quiet
# Pull before downtime. Pull failure leaves a running installation untouched.
docker pull "$image"
if $existing; then
  backup="$directory/backups/$(date -u +%Y%m%dT%H%M%SZ)-$(read_setting IMAGEGEN_RELEASE_VERSION)"
  mkdir -p "$backup"
  cp "$directory/.env" "$directory/compose.yaml" "$directory/install.sh" "$backup/"
  # Use the already-installed image as the tar helper, without network downloads.
  old_image=$(read_setting IMAGEGEN_IMAGE)
  stopped=true
  compose stop imagegen
  for part in data worker; do
    volume="chatgpt-image-gen_imagegen-$part"
    docker volume inspect "$volume" >/dev/null
    docker run --rm --network none --user 0:0 --entrypoint sh --mount "type=volume,src=$volume,dst=/source,readonly" --mount "type=bind,src=$backup,dst=/backup" "$old_image" -c 'tar -czf "/backup/$1.tar.gz" -C /source . && chown "$2:$3" "/backup/$1.tar.gz"' sh "$part" "$(id -u)" "$(id -g)"
    [[ -s $backup/$part.tar.gz ]] || die "Empty $part backup."
  done
fi
changed=true
cp "$stage/.env" "$directory/.env"
cp "$stage/compose.release.yaml" "$directory/compose.yaml"
cp "$stage/install.sh" "$directory/install.sh"
compose up -d --no-build --pull never imagegen
address=$(read_setting IMAGEGEN_BIND_ADDRESS)
port=$(read_setting IMAGEGEN_PORT)
healthy=false
for ((attempt=0; attempt<60; attempt++)); do
  if response=$(curl --noproxy '*' --fail --silent --max-time 2 "http://$address:$port/health") && [[ $response == *'"service":"image-gen-server"'* && $response == *"\"version\":\"$version\""* ]]; then
    healthy=true; break
  fi
  sleep 2
done
$healthy || die 'Server did not become healthy at the expected version. Inspect docker compose logs; configuration and volumes have been retained.'
show_status
echo 'Browser: sign in with the Server Access Key, then optionally set an owner username/password.'
echo 'For browser generation, open Settings > Server ChatGPT connection and sign in with ChatGPT.'
echo 'Desktop: connect through Settings > workspace server management using the URL above.'
