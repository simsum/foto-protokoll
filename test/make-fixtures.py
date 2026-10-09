"""Erzeugt Testfotos mit EXIF-Daten in test/fixtures/ (benötigt: pip install pillow piexif)."""
import random
from pathlib import Path

import piexif
from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(exist_ok=True)


def dms(v):
    v = abs(v)
    d = int(v)
    m = int((v - d) * 60)
    s = round(((v - d) * 60 - m) * 60 * 100)
    return ((d, 1), (m, 1), (s, 100))


def photo(name, size, dt, gps=None, orientation=1, make=None, noise=False):
    w, h = size
    im = Image.new("RGB", size, (90, 140, 170))
    d = ImageDraw.Draw(im)
    rnd = random.Random(name)
    for _ in range(1500 if noise else 3):
        x0, x1 = sorted(rnd.randint(0, w) for _ in range(2))
        y0, y1 = sorted(rnd.randint(0, h) for _ in range(2))
        d.rectangle([x0, y0, x1, y1], fill=tuple(rnd.randint(0, 255) for _ in range(3)))
    exif = {"0th": {piexif.ImageIFD.Orientation: orientation}, "Exif": {piexif.ExifIFD.DateTimeOriginal: dt.encode()}, "GPS": {}}
    if make:
        exif["0th"][piexif.ImageIFD.Make] = make.encode()
    if gps:
        exif["GPS"] = {1: b"N" if gps[0] >= 0 else b"S", 2: dms(gps[0]), 3: b"E" if gps[1] >= 0 else b"W", 4: dms(gps[1])}
    im.save(OUT / name, quality=92, exif=piexif.dump(exif))


photo("IMG_0001.JPG", (3000, 2000), "2026:09:14 08:12:44", (49.8917, 10.8869))            # Bamberg
photo("IMG_0002.JPG", (2000, 3000), "2026:09:14 08:15:02", (55.6761, 12.5683))            # Kopenhagen, hochkant
photo("IMG_0003.JPG", (3000, 2000), "2026:09:13 17:40:10", None, orientation=6)           # ohne GPS, gedreht
photo("BIG_0004.JPG", (4032, 3024), "2026:09:20 10:01:02", (43.7228, 10.4017), 6, "TestCam", noise=True)  # Pisa
print("Fixtures in", OUT)
