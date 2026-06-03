#!/usr/bin/env bash
# Local test harness: build SBF (with local-admin feature), (re)start validator with
# program at fixed address, run ts-mocha. NOT committed.
# Usage: ./run-tests.sh [test-file-glob]
set -e
cd "$(dirname "$0")"

PROGRAM_ID="Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L"
SO="target/deploy/verdict.so"
ADMIN_WALLET="$(pwd)/tests/fixtures/admin.json"
TESTS="${1:-tests/verdict.ts}"

echo "==> building SBF (local-admin)"
cargo build-sbf -- --features local-admin

echo "==> restarting validator"
pkill -f solana-test-validator 2>/dev/null || true
sleep 2
rm -rf test-ledger
nohup solana-test-validator --bpf-program "$PROGRAM_ID" "$SO" --reset --ledger test-ledger > validator.log 2>&1 &
sleep 9
solana config set --url http://127.0.0.1:8899 >/dev/null 2>&1
# Fund the admin/deployer test wallet (used as provider wallet == PROTOCOL_ADMIN under local-admin)
solana airdrop 500 "$ADMIN_WALLET" >/dev/null 2>&1 || true
solana airdrop 500 "$ADMIN_WALLET" >/dev/null 2>&1 || true

echo "==> running tests: $TESTS"
export ANCHOR_PROVIDER_URL=http://127.0.0.1:8899
export ANCHOR_WALLET="$ADMIN_WALLET"
yarn run ts-mocha -p ./tsconfig.json -t 1000000 $TESTS
