#!/bin/zsh
# tests/shoot.sh: the status page's browser shots. One headless browser at a time (the shared lock
# dialboard-work/videos/.browser-lock, owner status-page), time-limited, foreground; Edge's folders deleted after.
cd "$(dirname "$0")"
LOCK="../../../videos/.browser-lock"
N=0; until mkdir "$LOCK" 2>/dev/null; do perl -e 'select(undef,undef,undef,5)'; N=$((N+1)); if [ $N -gt 360 ]; then echo "lock busy: $(cat "$LOCK/owner" 2>/dev/null)"; exit 9; fi; done
echo status-page > "$LOCK/owner"
# fresh fixtures now (their times are relative to now, and the wait for the lock may have been long)
perl -e 'alarm 60; exec @ARGV' ../../../tools/node-v24.21.0-darwin-arm64/bin/node sim.test.mjs > out/sim.log || { echo "sim tests failed"; }
BEFORE=(${TMPDIR%/}/db-*(N:t))
perl -e 'alarm shift; exec @ARGV' 240 ../../../tools/node-v24.21.0-darwin-arm64/bin/node shoot.mjs
RC=$?
[ "$(cat "$LOCK/owner" 2>/dev/null)" = "status-page" ] && { rm -f "$LOCK/owner"; rmdir "$LOCK" 2>/dev/null; }
for d in ${TMPDIR%/}/db-*(N); do b=${d:t}; (( ${BEFORE[(Ie)$b]} )) && continue; pgrep -f "user-data-dir=.*$b" >/dev/null && continue; rm -rf "$d"; done
exit $RC
