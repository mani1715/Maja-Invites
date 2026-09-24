#!/usr/bin/env bash
#
# deploy/deploy.sh — deploy and manage MAJA Invites on THIS VM.
#
# The single canonical deployment script. The root deploy.sh and deployed.out
# are two-line shims that exec this file — all logic lives here, once.
#
#     ./deploy.sh                 # full deploy (same as --deploy)
#     ./deploy.sh --review        # ALSO serve plain HTTP on the VM's IP
#     ./deploy.sh --no-pull       # deploy the working tree, skip git fetch
#     ./deploy.sh --check         # validate everything, change nothing
#     ./deploy.sh --status        # read-only health probe, changes nothing
#     ./deploy.sh --logs [svc..]  # tail logs (default: core worker caddy)
#     ./deploy.sh --rollback      # redeploy the previous recorded commit
#     ./deploy.sh --help
#
# Idempotent and safe to rerun: it never deletes a volume, never drops a
# database, and never writes deploy/.env. A failure exits non-zero with the
# failing service's logs — it does not report success it did not verify.
#
# Not a replacement for deploy/docker-compose.yml; it is the runbook in
# docs/DEPLOYMENT.md made executable, in the order that runbook prescribes.
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/deploy"
ENV_FILE="$COMPOSE_DIR/.env"
# Outside the repo on purpose: the git stage refuses to run on a dirty tree,
# so a state file living inside the checkout could never be written.
STATE_FILE="$HOME/.maja_deploy_state"

# ----------------------------------------------------------------- logging
if [ -t 1 ]; then B=$'\033[1m'; R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; N=$'\033[0m'
else B=""; R=""; G=""; Y=""; N=""; fi

step()  { printf '\n%s==> %s%s\n' "$B" "$*" "$N"; }
ok()    { printf '    %sok%s   %s\n' "$G" "$N" "$*"; }
warn()  { printf '    %swarn%s %s\n' "$Y" "$N" "$*"; }
die()   { printf '\n%sFAILED:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }

trap 'die "aborted at line $LINENO"' ERR

usage() {
  cat <<'EOF'
deploy/deploy.sh — deploy and manage MAJA Invites on THIS VM.

  ./deploy.sh                 # full deploy (same as --deploy)
  ./deploy.sh --deploy
  ./deploy.sh --check         # validate everything, change nothing
  ./deploy.sh --review        # deploy + ALSO serve plain HTTP on the VM's IP
  ./deploy.sh --status        # read-only probe of the running stack
  ./deploy.sh --logs [svc..]  # tail logs (default: core worker caddy)
  ./deploy.sh --rollback      # redeploy the previous recorded commit
  ./deploy.sh --help

Modifiers:
  --no-pull    deploy the working tree, skip git fetch
  --aws-write  let the AWS integration check exercise the write path too

Idempotent and safe to rerun: it never deletes a volume, never drops a
database, and never writes deploy/.env. Postgres and Redis are never
published to the host, only 80/443 are.
EOF
}

# Read values WITHOUT sourcing the file: `source` would execute whatever is
# in it, and would also splatter secrets into this shell's environment where
# a later `set -x` or a crash dump could print them.
# `tr -d '\r'`: deploy/.env is gitignored, so .gitattributes' eol=lf never
# touches it, and it is routinely authored on Windows or scp'd over. A trailing
# CRLF would ride along on DOMAIN_VALUE into the stage-8 `Host:` header and pass
# the -n/-z presence checks undetected. The rest of the script already strips
# \r from command output; this closes the one path that did not.
envval() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 | tr -d '\r' | sed 's/^"//; s/"$//'; }

fail_with_logs() {
  local svc="$1" msg="$2"
  printf '\n%s--- last 60 log lines from %s ---%s\n' "$Y" "$svc" "$N" >&2
  "${DC[@]}" "${COMPOSE_FILES[@]}" logs --tail 60 "$svc" >&2 || true
  die "$msg"
}

detect_compose() {
  for cmd in git curl docker; do
    command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed"
  done
  docker info >/dev/null 2>&1 \
    || die "the Docker daemon is not reachable (is it running, and is this user in the docker group?)"
  if docker compose version >/dev/null 2>&1; then
    DC=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    DC=(docker-compose)
  else
    die "neither 'docker compose' nor 'docker-compose' is available"
  fi
}

# Never destroys local changes — this is what lets --rollback safely check
# out an older commit, and what stops a normal deploy from clobbering work
# someone made directly on the VM.
require_clean_tree() {
  git -C "$REPO_ROOT" diff --quiet && git -C "$REPO_ROOT" diff --cached --quiet \
    || die "the working tree has uncommitted changes — $1"
}

# Appends "<epoch> <commit>" and keeps the last 20 lines. Used by --rollback
# to find the commit deployed before the current one.
append_state() {
  { [ -f "$STATE_FILE" ] && tail -n 19 "$STATE_FILE"; printf '%s %s\n' "$(date +%s)" "$1"; } > "$STATE_FILE.new"
  mv -f "$STATE_FILE.new" "$STATE_FILE"
}

# --------------------------------------------------------------- 1/10 host
stage_host() {
  step "[1/10] Checking host"
  # "Am I on the intended VM?" — the deploy targets a Linux box running the
  # Docker daemon. A macOS/Windows dev checkout fails at the daemon check
  # anyway; this warning just names the situation before the failure does.
  if [ "$(uname -s 2>/dev/null)" != "Linux" ]; then
    warn "this host is not Linux ($(uname -s 2>/dev/null || echo unknown)) — this looks like a dev box, not the deployment VM"
  fi
  detect_compose
  ok "git, curl, docker present; daemon reachable; compose: ${DC[*]}"
}

# ---------------------------------------------------------- 2/10 repository
stage_git() {
  step "[2/10] Updating repository"
  git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "$REPO_ROOT is not a git checkout"
  BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  if [ "$PULL" -eq 1 ]; then
    # After a --rollback the tree is on a detached HEAD, where rev-parse
    # --abbrev-ref returns the literal "HEAD". A fetch/merge of "origin/HEAD"
    # would merge a STALE tracking ref and silently redeploy the old commit
    # with exit 0. Refuse it and name the fix instead.
    [ "$BRANCH" != "HEAD" ] \
      || die "detached HEAD (you are probably mid-rollback) — run 'git checkout main' first, or deploy this exact commit with --no-pull"
    require_clean_tree "commit, stash, or rerun with --no-pull"
    git -C "$REPO_ROOT" fetch --quiet origin "$BRANCH" \
      || die "git fetch failed (no network, or no 'origin' remote — try --no-pull)"
    if [ "$CHECK_ONLY" -eq 1 ]; then
      # --check must change NOTHING — a fast-forward merge moves the working
      # tree, so under --check we only report how far behind we are.
      local BEHIND
      BEHIND="$(git -C "$REPO_ROOT" rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo '?')"
      ok "would fast-forward: $BEHIND commit(s) behind origin/$BRANCH (not applied under --check)"
    else
      git -C "$REPO_ROOT" merge --ff-only "origin/$BRANCH" \
        || die "cannot fast-forward to origin/$BRANCH — resolve it by hand, this script will not rewrite history"
    fi
  else
    warn "--no-pull: deploying the working tree as-is"
  fi
  DEPLOYED_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  ok "branch $BRANCH @ $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
}

# --------------------------------------------------------- 3/10 environment
stage_env() {
  step "[3/10] Checking environment"
  [ -f "$ENV_FILE" ] \
    || die "$ENV_FILE is missing. Copy deploy/.env.example and fill it in — this script will not invent credentials."

  # BACKUP_PASSPHRASE is required because the `backup` service is unconditional
  # in docker-compose.yml and its entrypoint refuses to start without it — a
  # missing value would otherwise crash-loop that container silently under an
  # otherwise-green "Deployment complete".
  REQUIRED=(DOMAIN ACME_EMAIL POSTGRES_PASSWORD SUPABASE_DB_URL JWT_SECRET_KEY
            SUPER_ADMIN_USERNAME SUPER_ADMIN_EMAIL SUPER_ADMIN_PASSWORD
            BACKUP_PASSPHRASE)
  MISSING=()
  for key in "${REQUIRED[@]}"; do
    [ -n "$(envval "$key")" ] || MISSING+=("$key")
  done
  [ ${#MISSING[@]} -eq 0 ] || die "deploy/.env is missing values for: ${MISSING[*]}"
  ok "${#REQUIRED[@]} required keys present (values not printed)"

  DOMAIN_VALUE="$(envval DOMAIN)"
}

# ---------------------------------------------------------------- 4/10 aws
# Static report from deploy/.env only — no container needed, so --check can
# validate it too. AWS is a warning, never a hard failure: the app degrades
# to "media features off" rather than refusing to boot.
stage_aws_env() {
  step "[4/10] Checking AWS"
  local key
  for key in AWS_REGION AWS_S3_PORTFOLIO_BUCKET AWS_S3_INVITATIONS_BUCKET \
             AWS_S3_EVENT_BUCKET AWS_S3_FACE_BUCKET \
             AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_PROFILE; do
    if [ -n "$(envval "$key")" ]; then
      printf '    %-26s SET\n' "$key"
    else
      printf '    %-26s MISSING\n' "$key"
    fi
  done

  if [ -n "$(envval AWS_S3_EVENT_BUCKET)" ] || [ -n "$(envval AWS_PROFILE)" ] || [ -n "$(envval AWS_ACCESS_KEY_ID)" ]; then
    ok "AWS media configuration present"
  else
    warn "no AWS bucket/profile configured — gallery, face match and portfolio media will be disabled"
  fi
}

setup_compose_files() {
  COMPOSE_FILES=(-f "$COMPOSE_DIR/docker-compose.yml")
  if [ "$REVIEW" -eq 1 ]; then
    [ -f "$COMPOSE_DIR/docker-compose.review.yml" ] \
      || die "--review needs deploy/docker-compose.review.yml"
    COMPOSE_FILES+=(-f "$COMPOSE_DIR/docker-compose.review.yml")
    warn "--review: plain HTTP on the VM's IP, in ADDITION to the domain. Do not leave this on for a public launch."
  fi
}

# ----------------------------------------------------------- 5/10 frontend
# The SPA is served by Caddy from a bind mount, so the bundle must exist on
# disk BEFORE the stack comes up — a missing dist/ is a blank white page,
# not a container failure, which is the hardest kind of broken deploy to
# diagnose.
stage_frontend() {
  step "[5/10] Building frontend"
  if command -v yarn >/dev/null 2>&1; then
    ( cd "$REPO_ROOT/frontend-v2" && yarn install --frozen-lockfile >/dev/null && GENERATE_SOURCEMAP=false yarn build >/dev/null ) \
      || die "frontend build failed — run 'cd frontend-v2 && yarn build' to see why"
    ok "frontend-v2/dist built (host yarn)"
  elif command -v npm >/dev/null 2>&1; then
    ( cd "$REPO_ROOT/frontend-v2" && npm ci >/dev/null && GENERATE_SOURCEMAP=false npm run build >/dev/null ) \
      || die "frontend build failed — run 'cd frontend-v2 && npm run build' to see why"
    ok "frontend-v2/dist built (host npm)"
  else
    # No Node on the host — build inside a throwaway Node container. The VM
    # already has Docker (detect_compose proved it), so this means the deploy
    # box needs only git + Docker, never a Node toolchain. The frontend-v2
    # directory is bind-mounted; node_modules and dist land back on the host.
    warn "no host yarn/npm — building the frontend in a Node container instead"
    docker run --rm \
      -v "$REPO_ROOT/frontend-v2":/build -w /build \
      -e GENERATE_SOURCEMAP=false \
      node:20-alpine \
      sh -c "corepack enable && yarn install --frozen-lockfile && yarn build" \
      || die "containerised frontend build failed — see the output above"
    ok "frontend-v2/dist built (node:20-alpine container)"
  fi
  [ -f "$REPO_ROOT/frontend-v2/dist/index.html" ] || die "frontend build produced no dist/index.html"
}

# ------------------------------------------------------------- 6/10 images
stage_build_images() {
  step "[6/10] Building images"
  "${DC[@]}" "${COMPOSE_FILES[@]}" build || die "image build failed"
  ok "images built"
}

# ------------------------------------------------------------ 7/10 startup
stage_start() {
  step "[7/10] Starting services"
  # Postgres applies microservices/db/schema.sql only on a FRESH volume; an
  # existing pgdata volume keeps its data untouched. Nothing here recreates
  # a volume, so a rerun is an update, never a reset.
  "${DC[@]}" "${COMPOSE_FILES[@]}" up -d --remove-orphans || die "compose up failed"
  ok "containers started"
}

# ------------------------------------------------------------- 8/10 health
stage_health() {
  step "[8/10] Health checks"

  # Probed from INSIDE the network so this works before DNS/TLS is in place,
  # and so a firewall gap shows up as a firewall message rather than a false
  # "backend is down".
  local API_OK=0 _i
  for _i in $(seq 1 60); do
    if "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core \
          python -c "import urllib.request,sys; sys.exit(0 if b'\"status\"' in urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=3).read() else 1)" \
          >/dev/null 2>&1; then
      API_OK=1; break
    fi
    sleep 3
  done
  [ "$API_OK" -eq 1 ] || fail_with_logs core "backend never became healthy on :8200"
  ok "core answers /api/health"

  "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T postgres pg_isready -U maja -d maja >/dev/null 2>&1 \
    || fail_with_logs postgres "postgres is not accepting connections"
  ok "postgres accepting connections"

  # /api/health reports db:true only when the app's own pool is usable — a
  # reachable postgres the app cannot authenticate to would otherwise pass.
  "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core \
    python -c "import json,urllib.request,sys; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=5)).get('db') else 1)" \
    >/dev/null 2>&1 || fail_with_logs core "the backend cannot reach its database (health reports db:false)"
  ok "backend's own DB pool is live"

  "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T redis redis-cli ping 2>/dev/null | grep -q PONG \
    || fail_with_logs redis "redis is not responding to PING"
  ok "redis responding to PING"

  local WORKER_ID
  WORKER_ID="$("${DC[@]}" "${COMPOSE_FILES[@]}" ps -q worker | head -n1)"
  [ -n "$WORKER_ID" ] || fail_with_logs worker "the worker container is not running"
  [ "$(docker inspect -f '{{.State.Running}}' "$WORKER_ID" 2>/dev/null)" = "true" ] \
    || fail_with_logs worker "the worker container exited"
  ok "worker running (face-index / face-search queue consumer)"

  local CADDY_ID
  CADDY_ID="$("${DC[@]}" "${COMPOSE_FILES[@]}" ps -q caddy | head -n1)"
  [ -n "$CADDY_ID" ] || fail_with_logs caddy "caddy is not running"
  if [ "$REVIEW" -eq 1 ]; then
    # --review adds a :80 site for any non-domain host (the bare-IP lane the
    # operator actually uses); it serves the SPA directly, so a clean 200 is the
    # proof. Probing the domain here would chase its HTTP->HTTPS redirect to a
    # name that resolves nowhere inside the container. A non-2xx makes wget exit
    # non-zero, so the exit code alone is the check (no busybox -q/-S quirk).
    docker exec "$CADDY_ID" wget -q -O /dev/null --header="Host: localhost" http://127.0.0.1/ \
      || fail_with_logs caddy "caddy is not serving the frontend on the review (:80) site"
  else
    # Production: the only site is the domain, whose :80 redirects to HTTPS by
    # design, so a 200/301/308 status all prove Caddy is up. Use -S alone (NOT
    # -q, which suppresses -S output in busybox) to print the status line.
    docker exec "$CADDY_ID" wget -S -O /dev/null --header="Host: $DOMAIN_VALUE" http://127.0.0.1/ 2>&1 \
      | grep -qE 'HTTP/1.[01] (200|30[128])' \
      || fail_with_logs caddy "caddy is not serving the frontend"
  fi
  ok "caddy serving frontend-v2/dist"
}

# ----------------------------------------------------- 9/10 aws integration
stage_aws_integration() {
  step "[9/10] AWS integration check"

  # Reports what the app itself resolved, so a typo'd bucket name surfaces
  # here rather than as a broken upload three days later. Never prints a
  # secret.
  "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core python -c "
import media_storage, aws_service
cfg = aws_service.bucket_config()
print('    credential source:', aws_service.credential_source())
for cat in ('portfolio', 'event', 'invitation', 'face'):
    print(f'    {cat:11s} -> {cfg.get(cat) or chr(45)}')
if not cfg.get('face'):
    print('    note: face bucket unset -> face match disabled (never falls back to a shared bucket)')
" 2>/dev/null || warn "could not read the media configuration (media features may be disabled)"

  local CRED_SOURCE
  CRED_SOURCE="$("${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core \
    python -c "import aws_service; print(aws_service.credential_source())" 2>/dev/null | tr -d '\r\n')"
  [ -n "$CRED_SOURCE" ] || CRED_SOURCE="none"

  if [ "$CRED_SOURCE" = "none" ]; then
    warn "SKIP: no AWS credentials configured in the running container — media features disabled, smoke test skipped"
    return 0
  fi

  ok "AWS credentials present (source: $CRED_SOURCE)"

  # Runtime identity gate. The smoke test only WARNS on an account mismatch
  # (deliberate — standalone runs against a sandbox are legitimate), but a
  # DEPLOY against the wrong AWS account is a misconfiguration, so it fails
  # here. Prints only the account number and the ARN's trailing name — never
  # a key. The runtime identity should be maja-backend, never maja-admin:
  # admin credentials in the application container would hand every request
  # handler administrative AWS access.
  local IDENT
  IDENT="$("${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core python -c "
import boto3, aws_service
ident = boto3.client('sts', **aws_service._aws_kwargs()).get_caller_identity()
arn = ident.get('Arn', '')
name = arn.rsplit('/', 1)[-1] if '/' in arn else arn
print(ident.get('Account', '?'), name)
" 2>/dev/null | tr -d '\r')" || IDENT=""
  if [ -z "$IDENT" ]; then
    die "the runtime AWS credentials in deploy/.env are not valid (sts get-caller-identity failed inside the container) — check AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are the real maja-backend keys, not placeholders"
  fi
  local ACCT NAME
  ACCT="${IDENT%% *}"; NAME="${IDENT#* }"
  [ "$ACCT" = "655671523450" ] \
    || die "runtime AWS account is $ACCT, expected 655671523450 — the container is holding the wrong credentials"
  ok "runtime AWS account 655671523450, identity: $NAME"
  case "$NAME" in
    *maja-backend*) : ;;
    *maja-admin*)   die "the container is running as maja-admin — administrative credentials must never be the application runtime identity" ;;
    *)              warn "runtime identity is '$NAME', expected maja-backend — verify this is intentional" ;;
  esac

  ok "running the live smoke test"
  local SMOKE_ARGS=()
  [ "$AWS_WRITE" -eq 1 ] && SMOKE_ARGS+=(--write)
  # Runtime AWS is required once configured: a non-zero exit here fails the
  # deployment. SKIP-AUDIT findings are already folded into the script's own
  # exit code, so its exit code is simply propagated, not reinterpreted.
  "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core python /app/scripts/aws_smoke_test.py "${SMOKE_ARGS[@]}" \
    || die "AWS smoke test failed — runtime AWS is required when credentials are configured"
  ok "AWS smoke test passed"
}

# ------------------------------------------------------------ 10/10 summary
stage_summary() {
  step "[10/10] Deployment summary"
  "${DC[@]}" "${COMPOSE_FILES[@]}" ps

  VM_IP="$(curl -s -m 4 -H 'Metadata-Flavor: Google' \
            http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)"
  [ -n "$VM_IP" ] || VM_IP="$(curl -s -m 4 https://api.ipify.org 2>/dev/null || true)"

  printf '\nDEPLOYED_COMMIT=%s\n' "$DEPLOYED_COMMIT"
  printf 'HTTPS_URL=https://%s\n' "$DOMAIN_VALUE"
  [ -n "$VM_IP" ] && printf 'HTTP_URL=http://%s\n' "$VM_IP"

  printf '\n%sReview URLs%s\n' "$B" "$N"
  printf '  https://%s\n' "$DOMAIN_VALUE"
  if [ "$REVIEW" -eq 1 ]; then
    if [ -n "$VM_IP" ]; then
      printf '  http://%s        (plain HTTP, --review mode)\n' "$VM_IP"
    else
      printf '  http://<VM_EXTERNAL_IP>   (could not detect the external IP from here)\n'
    fi
    printf '\n%sGCP firewall rule needed for the IP URL%s\n' "$B" "$N"
    printf '  gcloud compute firewall-rules create maja-allow-http \\\n'
    printf '      --allow=tcp:80 --direction=INGRESS --target-tags=maja \\\n'
    printf '      --source-ranges=0.0.0.0/0 --description="MAJA review over HTTP"\n'
    printf '  (then: gcloud compute instances add-tags <INSTANCE> --tags=maja)\n'
  elif [ -n "$VM_IP" ]; then
    printf '  VM external IP: %s  (rerun with --review to serve plain HTTP on it)\n' "$VM_IP"
  fi

  printf '\n  Postgres and Redis are NOT published to the host — only 80/443 are.\n'
  printf '  Logs:     ./deploy.sh --logs\n'
  printf '  Status:   ./deploy.sh --status\n'
  printf '  Rollback: ./deploy.sh --rollback\n'
  printf '  Stop:     cd deploy && %s down          (volumes are preserved)\n' "${DC[*]}"
  printf '\n%sDeployment complete.%s\n' "$G" "$N"

  # A rollback deploy must not push its target back onto the stack — do_rollback
  # already popped the current commit so the file describes where we are.
  [ "$ROLLBACK" -eq 1 ] || append_state "$DEPLOYED_COMMIT"
}

# Bootstrap the super-admin so the site is LOGIN-ready from the one command,
# not just serving. init_super_admin.py is idempotent (create-or-update from
# the SUPER_ADMIN_* env the compose file already requires) and runs inside the
# container against the in-stack Postgres. Its stdout is discarded on purpose:
# the script prints the password, and that must never reach the deploy log —
# stderr still flows, so a real failure is visible.
stage_bootstrap() {
  step "Bootstrapping the super-admin account"
  if "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core python init_super_admin.py >/dev/null; then
    ok "super-admin ensured (credentials come from deploy/.env; not printed here)"
  else
    warn "super-admin bootstrap failed — the site is up regardless. Retry with:
        cd deploy && ${DC[*]} exec core python init_super_admin.py"
  fi
}

run_deploy() {
  stage_host
  stage_git
  stage_env
  stage_aws_env
  if [ "$CHECK_ONLY" -eq 1 ]; then
    printf '\n%s--check: configuration is valid; nothing was changed.%s\n' "$G" "$N"
    exit 0
  fi
  setup_compose_files
  stage_frontend
  stage_build_images
  stage_start
  stage_health
  stage_bootstrap
  stage_aws_integration
  stage_summary
}

do_status() {
  detect_compose
  COMPOSE_FILES=(-f "$COMPOSE_DIR/docker-compose.yml")
  "${DC[@]}" "${COMPOSE_FILES[@]}" ps

  local healthy=1
  if "${DC[@]}" "${COMPOSE_FILES[@]}" exec -T core \
        python -c "import urllib.request,sys; sys.exit(0 if b'\"status\"' in urllib.request.urlopen('http://127.0.0.1:8200/api/health', timeout=3).read() else 1)" \
        >/dev/null 2>&1; then
    ok "core answers /api/health"
  else
    warn "core does not answer /api/health"
    healthy=0
  fi

  local worker_id
  worker_id="$("${DC[@]}" "${COMPOSE_FILES[@]}" ps -q worker 2>/dev/null | head -n1)"
  if [ -n "$worker_id" ] && [ "$(docker inspect -f '{{.State.Running}}' "$worker_id" 2>/dev/null)" = "true" ]; then
    ok "worker running"
  else
    warn "worker not running"
    healthy=0
  fi

  [ -f "$STATE_FILE" ] && printf 'DEPLOYED_COMMIT=%s\n' "$(tail -n 1 "$STATE_FILE" | awk '{print $2}')"
  [ "$healthy" -eq 1 ]
}

do_logs() {
  detect_compose
  COMPOSE_FILES=(-f "$COMPOSE_DIR/docker-compose.yml")
  "${DC[@]}" "${COMPOSE_FILES[@]}" logs --tail 120 "${LOG_SERVICES[@]}"
}

do_rollback() {
  detect_compose
  require_clean_tree "commit or stash before rolling back — rollback never touches volumes or the database"

  local manual="Manual rollback procedure:\n  git log --oneline\n  git checkout <hash>\n  ./deploy.sh --no-pull\n"
  if [ ! -s "$STATE_FILE" ]; then
    printf 'No prior deployed commit recorded in %s.\n' "$STATE_FILE" >&2
    printf '%b' "$manual" >&2
    exit 1
  fi
  local n
  n="$(wc -l < "$STATE_FILE" | tr -d ' ')"
  if [ "$n" -lt 2 ]; then
    printf 'Only one deployed commit recorded in %s — nothing to roll back to.\n' "$STATE_FILE" >&2
    printf '%b' "$manual" >&2
    exit 1
  fi

  local target
  target="$(tail -n 2 "$STATE_FILE" | head -n 1 | awk '{print $2}')"

  # Pop the current commit off the stack so the state file keeps describing
  # where we ACTUALLY are: after this, `target` is the newest entry. Without
  # this, stage_summary would re-append target and the next --rollback would
  # pick the commit we just left, bouncing between two commits forever instead
  # of walking further back. ROLLBACK=1 tells stage_summary not to re-append.
  sed '$d' "$STATE_FILE" > "$STATE_FILE.new" && mv -f "$STATE_FILE.new" "$STATE_FILE"

  step "Rolling back to $target"
  git -C "$REPO_ROOT" checkout --detach "$target" || die "checkout of $target failed"
  ok "checked out $target (detached HEAD)"
  printf '    note: to return to the latest code, run:  git checkout main && ./deploy.sh\n'

  PULL=0
  CHECK_ONLY=0
  ROLLBACK=1
  run_deploy
}

# --------------------------------------------------------------- arg parsing
MODE="deploy"
PULL=1
REVIEW=0
CHECK_ONLY=0
AWS_WRITE=0
ROLLBACK=0
LOG_SERVICES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --deploy)    MODE="deploy" ;;
    --check)     MODE="deploy"; CHECK_ONLY=1 ;;
    --review)    MODE="deploy"; REVIEW=1 ;;
    --status)    MODE="status" ;;
    --logs)
      MODE="logs"
      shift
      # Everything after --logs is taken as a service name, up to the next
      # arg — this subcommand does not mix with other flags after it.
      while [ $# -gt 0 ]; do LOG_SERVICES+=("$1"); shift; done
      continue
      ;;
    --rollback)  MODE="rollback" ;;
    --no-pull)   PULL=0 ;;
    --aws-write) AWS_WRITE=1 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done
[ ${#LOG_SERVICES[@]} -eq 0 ] && LOG_SERVICES=(core worker caddy)

# Serialise the mutating modes on a lock so two concurrent runs on the VM
# cannot interleave a fetch/merge across each other's clean-tree check, or lose
# a state-file entry to a read-modify-write race, or drive two `compose up`s at
# the same project. Read-only modes (status, logs) need no lock. flock is
# util-linux (present on the VM); if it is somehow absent, proceed unlocked
# rather than refuse to deploy.
_run_locked() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$STATE_FILE.lock"
    flock -n 9 || die "another deploy/rollback is already running (lock: $STATE_FILE.lock)"
  fi
  "$@"
}

case "$MODE" in
  deploy)   _run_locked run_deploy ;;
  status)   if do_status; then exit 0; else exit 1; fi ;;
  logs)     do_logs ;;
  rollback) _run_locked do_rollback ;;
esac
