# AETHER

A terminal-compositor concept. **Boundaries by depth, not borders.**

The goal: the best of tiling window managers (a real sense of spatial boundary)
and modern multiplexers (persistent panes), without box-drawing lines or heavy
window chrome — and deeply customizable so it can be made genuinely pretty.

> This is an interactive **design prototype** (HTML/CSS/JS), not a real terminal.
> Terminal output is static styled markup; the "shaders" are CSS gradients
> standing in for a real GPU pipeline.

## Run

Open `index.html` in a browser.

## Ideas it demonstrates

- **Depth-of-field focus** — the active pane is crisp; unfocused panes dim, blur,
  desaturate, and recede. The boundary comes from depth, not borders.
- **Gaps with background bleed** — the animated background shows through the gutters.
- **Animated reflow** — split / close / maximize panes with spring transitions.
- **Semantic panes** — prod glows red, running commands pulse, errors flash.
- **Overview canvas** — zoom out to see all panes spatially, click to dive in.
- **Live appearance panel** — tune gap, radius, translucency, depth-of-field,
  accent, background, font, grain, and CRT — all as live design tokens.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` / arrows | move focus |
| `n` | split (add pane) |
| `x` / `u` | close / undo close |
| `m` | maximize / restore |
| `o` | overview canvas |
| `b` | cycle background |
| `t` | customize panel |
| `e` | demo error flash |
| `?` | shortcuts |

## Next

Wire this aesthetic onto a real terminal core (WezTerm-prototype path), then
decide whether to commit to a custom `wgpu` renderer.
