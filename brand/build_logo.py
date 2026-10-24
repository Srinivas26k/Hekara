"""
Builds the Hekara logo files from geometry. Run:  python3 build_logo.py <path-to-Inter-600.woff>

The symbol ("Round the clock") is three rounded arcs, one per 8-hour shift, 120 degrees apart. The wordmark is Inter
SemiBold (SIL Open Font License 1.1) converted to outlines, so no font is needed to display the logo.
Requires: fontTools (pip install fonttools).
"""
import math
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

BLUE, LIME, DEEP, WHITE, BLACK = "#3d63ea", "#d9f15a", "#1c1e29", "#ffffff", "#111111"


def ring(fills, r_out=108.0, thick=52.0, gap_deg=9.0, cx=128.0, cy=128.0):
    """Three rounded arcs. Arc i is centred at -30 + 120*i degrees (blue top right, lime bottom, deep left for the default fills)."""
    r_in, r_mid, cap = r_out - thick, r_out - thick / 2, thick / 2
    cap_deg = math.degrees(cap / r_mid)
    span = 120 - 2 * cap_deg - gap_deg

    def at(r, deg):
        a = math.radians(deg)
        return cx + r * math.cos(a), cy + r * math.sin(a)

    f = lambda p: f"{p[0]:.2f} {p[1]:.2f}"
    out = []
    for i, fill in enumerate(fills):
        a1 = -30 + i * 120 - span / 2
        a2 = a1 + span
        o1, o2, i1, i2 = at(r_out, a1), at(r_out, a2), at(r_in, a1), at(r_in, a2)
        out.append(
            f'<path fill="{fill}" d="M{f(o1)} A{r_out} {r_out} 0 0 1 {f(o2)} A{cap} {cap} 0 0 1 {f(i2)} '
            f'A{r_in} {r_in} 0 0 0 {f(i1)} A{cap} {cap} 0 0 1 {f(o1)} Z"/>'
        )
    return "".join(out)


FONT = TTFont(sys.argv[1] if len(sys.argv) > 1 else "inter-600.woff")
UPM = FONT["head"].unitsPerEm
CAP = FONT["OS/2"].sCapHeight


def wordmark(text, x, size, centre_y, fill, tracking=-4.0):
    """The text as one outlined path. Returns (svg path, advance width). Vertically centres the capital height on centre_y."""
    glyphs, cmap, hmtx = FONT.getGlyphSet(), FONT.getBestCmap(), FONT["hmtx"]
    s = size / UPM
    baseline = centre_y + CAP * s / 2
    pen_x, d = x, []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, pen_x, baseline)))
        d.append(pen.getCommands())
        pen_x += hmtx[name][0] * s + tracking
    return f'<path fill="{fill}" d="{" ".join(d)}"/>', pen_x - tracking - x


def svg(body, w, h, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
            f'aria-labelledby="t"><title id="t">{title}</title>{body}</svg>\n')


def write(name, content):
    with open(name, "w") as fh:
        fh.write(content)
    print("wrote", name)


FILLS = (BLUE, LIME, DEEP)            # arc 0 top right, arc 1 bottom, arc 2 left
REVERSED = (BLUE, LIME, WHITE)        # on dark backgrounds the deep arc becomes white
SIZE = 150                            # wordmark font size against the 256-unit symbol


def horizontal(fills, word, title):
    mark, width = wordmark("Hekara", 256 + 6, SIZE, 128, word)
    return svg(ring(fills) + mark, round(256 + 6 + width + 20), 256, title)


def stacked(fills, word, title):
    _, width = wordmark("Hekara", 0, SIZE, 0, word)
    total = max(256, width)
    mark, _ = wordmark("Hekara", (total - width) / 2, SIZE, 256 + 40 + CAP * SIZE / UPM / 2, word)
    return svg(f'<g transform="translate({(total - 256) / 2:.2f} 0)">{ring(fills)}</g>' + mark, round(total), round(256 + 40 + CAP * SIZE / UPM + 10), title)


# Symbol and wordmark in colour, on dark, and in one colour
write("logo-symbol.svg", svg(ring(FILLS), 256, 256, "Hekara symbol"))
write("logo-symbol-reversed.svg", svg(ring(REVERSED), 256, 256, "Hekara symbol, reversed"))
write("logo-symbol-black.svg", svg(ring((BLACK,) * 3), 256, 256, "Hekara symbol, black"))
write("logo-symbol-white.svg", svg(ring((WHITE,) * 3), 256, 256, "Hekara symbol, white"))
write("logo-horizontal.svg", horizontal(FILLS, DEEP, "Hekara"))
write("logo-horizontal-reversed.svg", horizontal(REVERSED, WHITE, "Hekara"))
write("logo-horizontal-black.svg", horizontal((BLACK,) * 3, BLACK, "Hekara"))
write("logo-horizontal-white.svg", horizontal((WHITE,) * 3, WHITE, "Hekara"))
write("logo-stacked.svg", stacked(FILLS, DEEP, "Hekara"))
write("logo-stacked-reversed.svg", stacked(REVERSED, WHITE, "Hekara"))

# Small-size cut for the favicon and app icon: bolder arcs, wider gaps, so the three shifts stay separate at 16 px.
def tile_icon(size_scale=0.66):
    x, y, w, r = 0, 0, 256, 60
    tile = (f'<rect width="{w}" height="{w}" rx="{r}" fill="{DEEP}"/>')
    small = ring(REVERSED, r_out=120, thick=62, gap_deg=13)
    off = (256 - 256 * size_scale) / 2
    return tile + f'<g transform="translate({off:.2f} {off:.2f}) scale({size_scale})">{small}</g>'

write("app-icon.svg", svg(tile_icon(0.70), 256, 256, "Hekara app icon"))
write("favicon.svg", svg(tile_icon(0.78), 256, 256, "Hekara"))
