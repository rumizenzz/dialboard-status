#!/bin/zsh
# The status page's tests that need no browser (the browser shots: tests/shoot.sh). Time-limited.
cd "$(dirname "$0")/.."
NODE=../../tools/node-v24.21.0-darwin-arm64/bin/node
RC=0
for t in sim checks functions inbound probe syntax; do echo "== $t"; perl -e 'alarm 90; exec @ARGV' $NODE --experimental-vm-modules tests/$t.test.mjs | grep -E "FAIL|passed" || RC=1; done
exit $RC
