# Reeling the Sun

[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/irfandihmtr/ai-excited-01-reeling-sun/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/irfandihmtr/ai-excited-01-reeling-sun/reward.svg)](https://make.fun/bounty/ai-excited-01)

A small child stands alone on a dark cliff at dusk and flies a big
red diamond kite — and the kite's string has caught the huge setting
sun, hook and all, and is reeling it down toward the sea. Violet
dusk melts into gold, the sun's glitter path shivers across the
water, and birds wheel away from the impossible catch. It is the
one moment a child would never forget: fishing the sun out of the
sky with nothing but a kite, a string, and total belief.

The image is painted from scratch by `main.ts`: a hand-rolled
rasterizer (discs, ellipses, polygons, bezier curves) and a
hand-rolled PNG encoder, Node 22 standard library only. Every
star, sparkle and wave comes from a fixed hash, so two runs
produce byte-identical output.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024x1024, deterministic).

## License

MIT
