# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/anemomonimo12-sys/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/anemomonimo12-sys/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free ES module (`solve.js`) whose `run(input)` returns exactly what csv-reader 1.0.0 returns for broken CSV input — same columns, rows and error list — at roughly 2.3x the speed. Unquoted fields are scanned to their terminator and sliced once; quoted fields are scanned quote to quote with literal runs sliced whole, so the common shapes never pay per-character costs. `main.ts` is the harness driver: it reads `/input/cases.json` and writes `/output/answers.json`.

## Run it

```sh
node main.ts   # reads /input/cases.json, writes /output/answers.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=pqs0bqkp&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
