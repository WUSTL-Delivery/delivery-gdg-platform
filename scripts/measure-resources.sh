#!/usr/bin/env bash
# Measure how much RAM and disk the platform actually needs, to size a VM.
#
# Runs three experiments against the local Docker engine and prints a summary:
#   1. build   – cold-build (--no-cache) each image one at a time, record the
#                peak memory used inside the Docker VM during each build
#   2. run     – start the full compose stack, wait for health, record peak
#                during startup and per-container steady-state RSS
#   3. kafka   – produce N fixed-size records into a throwaway topic and
#                measure real bytes-on-disk per record + JVM RSS growth
#
# Usage:
#   ./scripts/measure-resources.sh            # all three
#   ./scripts/measure-resources.sh build      # any subset, in order
#   RECORDS=1000000 RECORD_BYTES=64 ./scripts/measure-resources.sh kafka
#
# Requirements: Docker with compose v2, deployments/.env filled in.
# Leaves the stack down when finished. Results land in $OUT (default ./.measure).
#
# "used" below means MemTotal - MemAvailable inside the Docker VM (or the host
# on Linux), which excludes reclaimable page cache. That is the number the OOM
# killer cares about, so it is the number to size against.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/.measure}"
RECORDS="${RECORDS:-300000}"
RECORD_BYTES="${RECORD_BYTES:-128}"
SETTLE_SECS="${SETTLE_SECS:-30}"
mkdir -p "$OUT"

# ── memory sampler ──────────────────────────────────────────────────────────
# Prints "epoch used_MB cached_MB" once a second. nsenter into PID 1's mount
# namespace so /proc/meminfo is the Docker VM's (Docker Desktop) or the host's.
sampler() {
  docker run --rm --privileged --pid=host alpine:3.20 nsenter -t 1 -m -- sh -c '
    while true; do
      awk -v t=$(date +%s) '\''/MemTotal/{tot=$2}/MemAvailable/{av=$2}/^Cached/{c=$2}
        END{printf "%d %d %d\n", t, (tot-av)/1024, c/1024}'\'' /proc/meminfo
      sleep 1
    done'
}
start_sampler() { sampler > "$1" 2>/dev/null & SAMPLER_PID=$!; disown "$SAMPLER_PID"; sleep 2; }
stop_sampler()  { kill "${SAMPLER_PID:-0}" 2>/dev/null || true
                  docker ps -q --filter ancestor=alpine:3.20 | xargs -r docker kill >/dev/null 2>&1 || true; }
peak_between()  { awk -v s="$2" -v e="$3" '$1>=s && $1<=e && $2>m {m=$2} END{print m+0}' "$1"; }
now_used()      { docker run --rm --privileged --pid=host alpine:3.20 nsenter -t 1 -m -- \
                    awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print int((t-a)/1024)}' /proc/meminfo; }

docker pull -q alpine:3.20 >/dev/null
cd "$ROOT/deployments"
docker compose down >/dev/null 2>&1 || true

echo "== environment"
docker info --format '  docker {{.ServerVersion}}, {{.NCPU}} cpus, {{.MemTotal}} bytes in VM' | awk '{printf "%s %s %s %s %.1f GB in VM\n",$1,$2,$3,$4,$5/1073741824}'
BASELINE=$(now_used); echo "  idle baseline: ${BASELINE} MB used"
SUMMARY="$OUT/summary.txt"; : > "$SUMMARY"
echo "baseline_used_mb=$BASELINE" >> "$SUMMARY"

# ── 1. build ────────────────────────────────────────────────────────────────
do_build() {
  echo "== build (cold, --no-cache)"
  start_sampler "$OUT/build_mem.log"
  for svc in web authoritative command; do
    s=$(date +%s)
    docker compose build --no-cache "$svc" > "$OUT/build_$svc.log" 2>&1 || { echo "  $svc build FAILED, see $OUT/build_$svc.log"; }
    e=$(date +%s)
    p=$(peak_between "$OUT/build_mem.log" "$s" "$e")
    printf "  %-14s peak %4d MB used (+%4d over idle)  %3ds\n" "$svc" "$p" "$((p-BASELINE))" "$((e-s))"
    echo "build_${svc}_peak_mb=$p build_${svc}_secs=$((e-s))" >> "$SUMMARY"
  done
  stop_sampler
}

# ── 2. run ──────────────────────────────────────────────────────────────────
do_run() {
  echo "== run (full stack)"
  start_sampler "$OUT/run_mem.log"
  s=$(date +%s)
  docker compose up -d > "$OUT/up.log" 2>&1
  for _ in $(seq 1 60); do
    k=$(docker inspect -f '{{.State.Health.Status}}' kafka 2>/dev/null || true)
    w=$(docker inspect -f '{{.State.Health.Status}}' web 2>/dev/null || true)
    [ "$k" = healthy ] && [ "$w" = healthy ] && break
    sleep 2
  done
  echo "  healthy after $(( $(date +%s) - s ))s; settling ${SETTLE_SECS}s"
  sleep "$SETTLE_SECS"
  e=$(date +%s)
  p=$(peak_between "$OUT/run_mem.log" "$s" "$e"); u=$(now_used)
  echo "  startup peak ${p} MB used (+$((p-BASELINE))), settled ${u} MB used (+$((u-BASELINE)))"
  echo "run_peak_mb=$p run_settled_mb=$u" >> "$SUMMARY"
  echo "  per-container RSS:"
  docker compose ps -q | xargs docker stats --no-stream --format '    {{.Name}}\t{{.MemUsage}}' | tee -a "$SUMMARY"
  stop_sampler
}

# ── 3. kafka ────────────────────────────────────────────────────────────────
do_kafka() {
  echo "== kafka ($RECORDS records x $RECORD_BYTES B)"
  docker compose up -d kafka > /dev/null 2>&1
  for _ in $(seq 1 30); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' kafka 2>/dev/null)" = healthy ] && break; sleep 2
  done
  T=robot-updates-loadtest
  docker exec kafka kafka-topics --bootstrap-server localhost:9093 --create --if-not-exists \
    --topic "$T" --partitions 1 --replication-factor 1 > /dev/null 2>&1
  rss0=$(docker exec kafka sh -c "ps -o rss= -C java | awk '{print int(\$1/1024)}'")
  d0=$(docker exec kafka du -sk /var/lib/kafka/data | cut -f1)
  docker exec kafka kafka-producer-perf-test --topic "$T" --num-records "$RECORDS" \
    --record-size "$RECORD_BYTES" --throughput -1 \
    --producer-props bootstrap.servers=localhost:9093 acks=1 2>&1 | tail -1 | sed 's/^/  /'
  sleep 5
  d1=$(docker exec kafka du -sk /var/lib/kafka/data | cut -f1)
  rss1=$(docker exec kafka sh -c "ps -o rss= -C java | awk '{print int(\$1/1024)}'")
  bpr=$(( (d1-d0)*1024 / RECORDS ))
  echo "  disk +$(( (d1-d0)/1024 )) MB  => ~${bpr} bytes/record on disk (payload $RECORD_BYTES B)"
  echo "  kafka JVM RSS ${rss0} -> ${rss1} MB (heap cap: $(docker exec kafka sh -c 'ps -o args= -C java' | grep -o '\-Xmx[0-9A-Za-z]*'))"
  echo "kafka_bytes_per_record=$bpr kafka_rss_before_mb=$rss0 kafka_rss_after_mb=$rss1" >> "$SUMMARY"
  echo "  projected disk for 2 robots, 7-day retention (default), ${bpr} B/record:"
  for hz in 1 10 50 100; do
    gb=$(awk -v hz=$hz -v b=$bpr 'BEGIN{printf "%.2f", 2*hz*86400*7*b/1e9}')
    printf "    %3d Hz/robot  -> %6s GB per week\n" "$hz" "$gb"
  done
  docker exec kafka kafka-topics --bootstrap-server localhost:9093 --delete --topic "$T" > /dev/null 2>&1 || true
}

STEPS=("$@"); [ ${#STEPS[@]} -eq 0 ] && STEPS=(build run kafka)
for step in "${STEPS[@]}"; do "do_$step"; done

docker compose down > /dev/null 2>&1 || true
echo "== done. raw logs in $OUT, summary in $SUMMARY"
