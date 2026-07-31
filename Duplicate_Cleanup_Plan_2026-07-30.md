# Duplicate cleanup plan

**Status: COMPLETE. All five batches executed and verified 2026-07-30.**

All 82 duplicate data points are non-live: 81 retired, and 1 superseded to its live equivalent
(see the deviation note below). All five source lineage links are set. Verified afterwards:
zero live data points on every retired record, and all 85 data points preserved and live on the
five kept records. Tier 2 was left alone as recommended.

Deviation from the plan as drafted, in batch 5: `jh717vb8xeq79na71h9jpxtzx587x2mc` was superseded
with `replacementDataPointId` `jh7bd8e5xrs09fysy1s5bemjfd87y1zj` rather than bare-retired, because
the kept record carries an equivalent live claim and curator observation
`j978jrqhbcke5q81dtbs6qv5y588t9s8` cites that claim as the non-coding counterexample scoping its
thesis. The observation still resolves all four of its references.

Drafted 2026-07-30 from the tracker reconciliation.
Every identifier below was read from Convex, which is the source of truth.

## Read this first

**These operations cannot be undone.** `resolveSupersedePatch` refuses to act on a data point that is already superseded or retired, because re-pointing would break append-only (Design Decision 38). There is no unretire call. A mistake is permanent and the only remedy is re-ingesting the source and re-extracting it.

That is why the batches are ordered by blast radius and why batch 1 is a pilot: run it, confirm the corpus behaves as expected, and only then continue.

## Why this is needed

Each cluster below is one source that was ingested twice: a first attempt that ended at status `failed`, and a next-day retry that succeeded at status `extracted`. The failed records still carry data points, and those data points are live in retrieval.

`cm_supersede_source` does not help. It sets lineage and marks the source failed, but never touches data points. Retrieval decides liveness with `isLiveDataPoint`, which counts anything that is not exactly `superseded` or `retired` as active. These rows carry `status: "failed"`, which normalizes to active.

The OpenAI cluster is the proof: its source lineage was set correctly on 2026-06-17 and 18 of its 19 data points are still live today.

## Scope

| Batch | Cluster | Data points to retire | Source call needed |
|---|---|---|---|
| 1 | The last six months in LLMs in five minutes (simonwillison.net) | 16 | yes |
| 2 | Evals are the new PRD (Braintrust) | 16 | yes |
| 3 | Predicting AI job exposure (ben-evans.com) | 18 | yes |
| 4 | The Next Era of Knowledge Work (OpenAI) | 18 | no, already set |
| 5 | How Ramp Used RL to Beat Frontier Models at Spreadsheet Search (Prime Intellect) | 14 | yes |
| | **Total** | **82** | **4 calls** |

Retire, not supersede: pass no `replacementDataPointId`. These are whole-source duplicates rather than claim-level corrections, and the two extractions do not align one to one (for example 16 data points against 20 for Braintrust), so a claim-to-claim mapping would be invented rather than real.

## Batch 1: The last six months in LLMs in five minutes

- Source file: `simonwillisonnet_the-last-six-months-in-llms-in-five-minutes_2026-06-01.md`
- Keep (status extracted): `kd733w70tsj756vd0ehtvan6n587zeba`
- Retire (status failed): `kd7f95pk17jpb2wge6r7we78bh87x7f4`
- Data points to retire: 16

Pilot batch. Neither record carries a position or an observation, so nothing downstream can be disturbed.

**Step A.** For each of the following data point identifiers, call `cm_supersede_data_point` with `dataPointId` set to it, no `replacementDataPointId`, and this `reason`:

> Duplicate extraction from a failed ingest attempt of the same source; the successful re-ingest kd733w70tsj756vd0ehtvan6n587zeba carries the live evidence. Retired during the 2026-07-30 tracker reconciliation.

```
jh7fprv18yyn023wy2egw2f64d87xx2z
jh76jc8kb7bvn124wtpbhvt9z987x2t1
jh72nqyet6d8f1mj36yzjdh16987xtct
jh74v44y4f2408d831q1r0dcg187xth0
jh73yxp7xntgy1r6d93a76hxws87xepa
jh7ebm00z35fnhjzyb6sa1gm3s87xmm6
jh753108jt84xerd2md26qgb2d87x5yp
jh74224ngtkmm4bxyk8nfyp5yd87wrbh
jh7cr3xbb6jr7rjbvjb8s9avt987xd35
jh73hwzcwxna3sqgwt7st7mxdd87xhvn
jh7815kq6wwyn33psjpxb2v3md87wy38
jh7cehbve49zfvsz2ff016gn5n87xb9v
jh72j8b5h3whvt89bfd0xyvzsx87wyv9
jh7eatgkpm7byv8ratjkb5mp8187xdf3
jh7caf8ydm2evpyr2yw284w3kn87w1s3
jh7ccd0rwzssdvqaj959538v3x87wfrk
```

**Step B.** Set source lineage:

`cm_supersede_source` with `oldSourceId` `kd7f95pk17jpb2wge6r7we78bh87x7f4`, `newSourceId` `kd733w70tsj756vd0ehtvan6n587zeba`, and a reason such as: Failed ingest attempt superseded by the successful re-ingest of the same source file; data points retired 2026-07-30.

**Step C.** Verify with `cm_get_source_usage` on `kd7f95pk17jpb2wge6r7we78bh87x7f4`: `supersededDataPointCount` should read 16 and equal `dataPointCount`.

## Batch 2: Evals are the new PRD

- Source file: `braintrust_evals-are-the-new-prd_2026-06-01.md`
- Keep (status extracted): `kd75h5rdyj78ytwbjt4dt1s5tx87zeap`
- Retire (status failed): `kd7426brx25pxjm6868th22vzs87w5f6`
- Data points to retire: 16

No positions and no observations on either record.

**Step A.** For each of the following data point identifiers, call `cm_supersede_data_point` with `dataPointId` set to it, no `replacementDataPointId`, and this `reason`:

> Duplicate extraction from a failed ingest attempt of the same source; the successful re-ingest kd75h5rdyj78ytwbjt4dt1s5tx87zeap carries the live evidence. Retired during the 2026-07-30 tracker reconciliation.

```
jh786f7zap76nqawnk3heqft3587xvgy
jh7ek7drdsbhhvd8pa4m7dh34h87xpya
jh75n15zzjd5x3y1cvngt07kfx87wr93
jh7aky1qjvrkcyyyh293305a9d87wqgk
jh7e7edwt1jm8tq5fvvr4erx7n87wq3v
jh728cd1phbcv979bwhwx9ec7d87w1gg
jh7e71219vjhn93kvq9jep49gs87xykp
jh74qqzqraw83rxn7wts81b75d87w0tg
jh7c3g1zcc9z68v706kbq6p0r587xr08
jh733y9rxat7yxqd131m8h5s6x87xn9d
jh73exdsgm1c776xbrv6twd15d87w5k6
jh7appcyvv02efy9zbn1z59m8d87wbhb
jh799s0qafp9jccqztaa0vnztx87w588
jh72qkt2g8y7dqzvc8tddvg6mn87xztk
jh7ek4k06djsyr6ndydqj56fd987xhz0
jh7djfxv0dnm1rb8jp4ep0eq1n87wszp
```

**Step B.** Set source lineage:

`cm_supersede_source` with `oldSourceId` `kd7426brx25pxjm6868th22vzs87w5f6`, `newSourceId` `kd75h5rdyj78ytwbjt4dt1s5tx87zeap`, and a reason such as: Failed ingest attempt superseded by the successful re-ingest of the same source file; data points retired 2026-07-30.

**Step C.** Verify with `cm_get_source_usage` on `kd7426brx25pxjm6868th22vzs87w5f6`: `supersededDataPointCount` should read 16 and equal `dataPointCount`.

## Batch 3: Predicting AI job exposure

- Source file: `ben-evanscom_predicting-ai-job-exposure_2026-06-01.md`
- Keep (status extracted): `kd751s2err3dpzrz39gtyj09sh87zhh0`
- Retire (status failed): `kd75bhcy7rs1qfhtrzh5g5z21187xx2q`
- Data points to retire: 18

Three positions cite this source, all of them on the record being kept. The record being retired is cited by nothing.

**Step A.** For each of the following data point identifiers, call `cm_supersede_data_point` with `dataPointId` set to it, no `replacementDataPointId`, and this `reason`:

> Duplicate extraction from a failed ingest attempt of the same source; the successful re-ingest kd751s2err3dpzrz39gtyj09sh87zhh0 carries the live evidence. Retired during the 2026-07-30 tracker reconciliation.

```
jh7az4zz7t6xg1c45mmxg575n987xvn0
jh770cwd4mhs1npbk0vfpccw3987w2ba
jh7bzyzge9j18dck3fsa3z4sgx87xnhd
jh7dk4s0aer1tsex7wrgd5yfb587xmxv
jh7763q47s53m19djtkx0f130d87wy7k
jh70nfza7c0cvfpvc327veagzs87xb2z
jh70mkcj8nxa34q6w744c24myx87xwt2
jh7dempew1r991e63a1esz9ayd87wy5j
jh73wch7w6at05kaq7ysw2mz4n87xzr7
jh7ddbvjq29brkb870pn9h4zfn87xyss
jh738jjhwvj0v1x0bhgf97064x87xxjw
jh7dh9rjzqhz4neq4z30jhatah87wa2j
jh79sh26n19kh6dj07d5ydbqts87x43k
jh79r75v0wvm3gk58x6p9ye0vx87wpaj
jh72eznemtxy0gx88ktnn7kx2987xvwh
jh75tqk6fqjpjjsh41awx2jrjs87xmym
jh728namznew719md52fr9d15s87xw7p
jh7a0555djyvepxavccagkq80987xg9z
```

**Step B.** Set source lineage:

`cm_supersede_source` with `oldSourceId` `kd75bhcy7rs1qfhtrzh5g5z21187xx2q`, `newSourceId` `kd751s2err3dpzrz39gtyj09sh87zhh0`, and a reason such as: Failed ingest attempt superseded by the successful re-ingest of the same source file; data points retired 2026-07-30.

**Step C.** Verify with `cm_get_source_usage` on `kd75bhcy7rs1qfhtrzh5g5z21187xx2q`: `supersededDataPointCount` should read 18 and equal `dataPointCount`.

## Batch 4: The Next Era of Knowledge Work

- Source file: `openai_the-next-era-of-knowledge-work_2026-06-02.md`
- Keep (status extracted): `kd74gc0sek7tj6kmchgbw5gndh88vtgw`
- Retire (status failed): `kd7014cf47f5rcxrw4rpftzqh588p3q6`
- Data points to retire: 18

Source lineage was already set on 2026-06-17, so this batch is data points only. Do NOT call cm_supersede_source; it will throw because the pointer already exists.

**Step A.** For each of the following data point identifiers, call `cm_supersede_data_point` with `dataPointId` set to it, no `replacementDataPointId`, and this `reason`:

> Duplicate extraction from a failed ingest attempt of the same source; the successful re-ingest kd74gc0sek7tj6kmchgbw5gndh88vtgw carries the live evidence. Retired during the 2026-07-30 tracker reconciliation.

```
jh788x0tpvfnjvtq7nksmmzws988qpk5
jh7990kfky3vnawn3w43s5gv6d88qacc
jh729zd2yy2jkfrw4wb98ms29588q3zr
jh71xjrtwqtg9csp0df60jrf1188qapm
jh7affxpcp2rqyp8dyj7fv0q4n88qgmx
jh74b5d2ctrtsfkq2yk9dqxncd88pysz
jh7ayg2zgf8f5rj73vwzqgknx988qb60
jh7dg0azm3k6395pjs6yy6ej3588p36r
jh7czcp65f5f7h367w7ggecev988p3dx
jh7d8fm1xeqs497phkd2884s9s88p9t4
jh77b9xf5s9a8p1d7qr57qgdqh88pp6k
jh7dnaa5a9k5hkszwt997q5zbn88q9gm
jh774eqvcmwz2aq7vd6ay8kfr588pb4v
jh779pmw1nnqbhryv9bc2cjmgx88pxv6
jh7c4cqmbrkyh8k2w6yvk7j7kn88qvrh
jh71st59gzvmv161qfactswjcd88pcqc
jh735wgw0s09d9b5bfn1qyesxn88p0hy
jh72remg17c1nc1s104wja3xns88qh2p
```

**Step B.** None. Source lineage already points `kd7014cf47f5rcxrw4rpftzqh588p3q6` at `kd74gc0sek7tj6kmchgbw5gndh88vtgw`. Calling `cm_supersede_source` again will throw.

**Step C.** Verify with `cm_get_source_usage` on `kd7014cf47f5rcxrw4rpftzqh588p3q6`: `supersededDataPointCount` should read 18 and equal `dataPointCount`.

## Batch 5: How Ramp Used RL to Beat Frontier Models at Spreadsheet Search

- Source file: `prime-intellect_how-ramp-used-rl-to-beat-frontier-models-at-spreadsheet-search_2026-06-01.md`
- Keep (status extracted): `kd73tqe2ht2mbds0txw8n97n2s87zjt7`
- Retire (status failed): `kd76ay8779wk09df3g9e211m3h87xdgy`
- Data points to retire: 14

One curator observation references the data points being retired. See the observation note below. Sequenced last so the mechanism is proven before touching it.

**Step A.** For each of the following data point identifiers, call `cm_supersede_data_point` with `dataPointId` set to it, no `replacementDataPointId`, and this `reason`:

> Duplicate extraction from a failed ingest attempt of the same source; the successful re-ingest kd73tqe2ht2mbds0txw8n97n2s87zjt7 carries the live evidence. Retired during the 2026-07-30 tracker reconciliation.

```
jh75e8snwasmz22b766ygmqs2d87w8gq
jh78vv7ysn7d67k3f2qb0dvvx987w234
jh7ffe62xysmf7tjt5xaqbc1w987w08z
jh7azs15rt0pgtba3bdxa0m7px87xx42
jh73xfvfsjng9q0k33rycvn9bd87xssw
jh730rg2fyx1nsjpvqeb1gdt0x87xfn7
jh74ymzye4cs422tsrjpvqgxt187xya9
jh71s7fg5hyagqyzwzz9hgkq3187xda0
jh71ant5834pp4ssafptkfcqtn87wcvw
jh72gz3r72hagbcsakfzf0hjpd87x9e1
jh717vb8xeq79na71h9jpxtzx587x2mc
jh7eyatw4485rp5wr4v05ptntd87xgt0
jh75tjz7acyn2hf6ke39kk9pms87xbp4
jh785qx00999wsesnxm8mnx67n87xf42
```

**Step B.** Set source lineage:

`cm_supersede_source` with `oldSourceId` `kd76ay8779wk09df3g9e211m3h87xdgy`, `newSourceId` `kd73tqe2ht2mbds0txw8n97n2s87zjt7`, and a reason such as: Failed ingest attempt superseded by the successful re-ingest of the same source file; data points retired 2026-07-30.

**Step C.** Verify with `cm_get_source_usage` on `kd76ay8779wk09df3g9e211m3h87xdgy`: `supersededDataPointCount` should read 14 and equal `dataPointCount`.

## The one judgment call: the Ramp observation

Batch 5 retires data points that one curator observation references ("Automated optimization is beginning to commoditize the hand-engineering of agent harnesses..."). The record being kept carries a different observation.

This is softer than it first looks. `getObservation` resolves referenced data points directly by identifier with no liveness filter, so the observation keeps rendering and its claim text stays readable. Retired data points remain fetchable by id by design. What changes is that the observation's evidence no longer surfaces through live retrieval paths.

Curator observations are immutable: `convex/observations.ts` exposes only `createObservation`, with no update, no delete, and no lifecycle field. So the observation cannot be re-pointed or retired. The options are:

1. Accept it. The observation survives and stays readable. Simplest, and reversible in the sense that nothing is lost.
2. Before running batch 5, write a fresh observation with `cm_add_curator_observation` carrying the same insight but referencing the equivalent data points on `kd73tqe2ht2mbds0txw8n97n2s87zjt7`. Append-only and consistent with the immutability rule. Leaves two observations saying the same thing.

Recommendation: option 1, unless that observation is one you expect to lean on.

## Tier 2: optional, zero retrieval impact

Nine further records are abandoned ingest shells: status `failed`, **zero data points**, no file on disk, nothing referencing them. They cannot affect any query. Setting lineage is cosmetic and safe to defer indefinitely.

| Cluster | Keep | Retire |
|---|---|---|
| LLM based Human Simulations Have Not Yet Been Reliable | `kd7akdw56zcqnf6qr83z23gej187c5za` | `kd70cezxkd1ehg7q06a5vmmhhx87cka0`, `kd77mp157wrmr58tkfjb923hr587czkj` |
| The Prompt Makes the Person(a) | `kd7e1smxnxv93rpst25fea98n187dkea` | `kd7expkpxvb60h493c38ezkh3n87d4nr`, `kd72dabsj17t759rccwxg2tdd987cz1y` |
| We Need Strong Preconditions For Using Simulations In Policy | `kd7ch1wtq6faetzh08svr7m8z587d0gy` | `kd75zdzfaprpsh26hykypaz1n187c192`, `kd78x3jjevxfv8wgamzmrfne3187d89t` |
| What Makes LLM Agent Simulations Useful for Policy Practice? | `kd76kwzdg7b38v9t7d81he2px987dhag` | `kd776z629qykhads9rwx5h7x9x87db92`, `kd7301yygfxt7dwyh15wq3xqd587d1y8` |
| Tech CEOs are apparently suffering from AI psychosis | `kd77d9508wrj7hytrwc20kw4c587xr14` | `kd7ev1np72fdbap8kkhryrp0p587xqjf` |

The Verge cluster ("Hackers are learning to exploit chatbot 'personalities'") is already fully superseded with zero data points on the retired record. No action.

## Suggested sequencing

1. Run batch 1 only. Confirm with `cm_get_source_usage`, then ask the corpus something the Simon Willison piece would answer and check that the evidence no longer appears twice.
2. If that behaves, run batches 2, 3 and 4.
3. Decide the observation question, then run batch 5.
4. Leave Tier 2 alone unless the duplicate rows bother you in `cm_list_sources`.

## After the cleanup

Update `needsReview` in `sources/2026-05/2026-05-31_to_06-06/review-status.json` and `sources/2026-05/2026-05-24_to_30/review-status.json` to record what was done. Those trackers currently describe the problem, not the resolution.

Worth considering separately: the root cause is that a failed ingest leaves its partial data points live, because the pipeline status field and the lifecycle status field share a name and `normalizeStatus` treats an unrecognized value as active. Any future failed extraction will do this again.
