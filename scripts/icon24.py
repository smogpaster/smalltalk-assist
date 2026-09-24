"""Draws the 24x24 monochrome store icon (white on transparent) as PNG.

Usage: python3 scripts/icon24.py  -> store/icon-24.png, store/icon-24-preview.png
No dependencies: writes the PNG with zlib.
"""
import struct
import zlib

N = 24
px = [[0] * N for _ in range(N)]


def rounded_rect(x0, y0, x1, y1, fill):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            corner = (x in (x0, x1)) and (y in (y0, y1))
            edge = x in (x0, x1) or y in (y0, y1)
            if corner:
                continue
            if fill or edge:
                px[y][x] = 1


# Back bubble: outline, tail at the bottom left.
rounded_rect(1, 2, 14, 12, fill=False)
for x, y in [(4, 13), (5, 13), (4, 14)]:
    px[y][x] = 1

# Clear a 1px gap around the front bubble.
for y in range(7, 19):
    for x in range(8, 24):
        px[y][x] = 0

# Front bubble: filled, tail at the bottom right, three dots cut out.
rounded_rect(9, 8, 22, 16, fill=True)
for x, y in [(18, 17), (19, 17), (19, 18)]:
    px[y][x] = 1
for dx in (11, 15, 19):
    for y in (11, 12):
        for x in (dx, dx + 1):
            px[y][x] = 0


# Centre vertically (the drawing spans rows 2-18).
px = [[0] * N for _ in range(2)] + px[:-2]


def write_png(path, rows, width, height, color_type, channels):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, color_type, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


# Grey + alpha: white pixels, everything else transparent.
write_png('store/icon-24.png', [[v for p in row for v in ((255, 255) if p else (0, 0))] for row in px], N, N, 4, 2)

# Preview, 16x, white on the portal's dark grey.
S = 16
rows = []
for y in range(N * S):
    rows.append([255 if px[y // S][x // S] else 40 for x in range(N * S)])
write_png('store/icon-24-preview.png', rows, N * S, N * S, 0, 1)

for row in px:
    print(''.join('#' if p else '.' for p in row))
