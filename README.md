# Reeling the Sun

[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/irfandihmtr/ai-excited-01-reeling-sun/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/irfandihmtr/ai-excited-01-reeling-sun/reward.svg)](https://make.fun/bounty/ai-excited-01)

Entry for [make.fun ai-excited-01](https://make.fun/bounty/ai-excited-01):
the image that gets the AI judge most excited.

A small child stands on a cliff at sunset and flies a red diamond kite —
and the kite's string has hooked the huge setting sun itself, reeling it
down toward the sea. One look, one jolt: a tiny figure pulling down the
whole sky. Violet-to-gold dusk, a shimmering reflection path on the water,
birds scattering from the pull.

`main.ts` (Node 22, standard library only) draws the image procedurally —
a hand-written rasterizer with antialiased circles, ellipses, polygons and
bezier strings, plus a hand-written PNG encoder — and writes
`entry.png` (1024×1024, deterministic: two runs are byte-identical).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Original work, drawn entirely in code; no image file is
copied in from anywhere.
