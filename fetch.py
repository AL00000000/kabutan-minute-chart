import json
import urllib.request
from datetime import datetime
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

SYMBOLS = [
    ("0000", "日経平均"),
    ("0010", "TOPIX"),
    ("0012", "グロース250"),
    ("285A", "キオクシア"),
    ("6976", "太陽誘電"),
    ("3436", "SUMCO"),
]

BASE = Path(__file__).parent
DOCS = BASE / "docs"
DATA_DIR = DOCS / "data"


def fetch(code):
    url = f"https://kabutan.jp/stock/read?c={code}&m=4&k=1"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        text = resp.read().decode("utf-8")

    lines = text.strip().split("\n")
    bars = []
    trade_date = None
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) < 7 or not parts[0]:
            continue
        tstr = parts[0]  # "07.07/15:30"
        try:
            o = float(parts[1]) / 100
            h = float(parts[2]) / 100
            l = float(parts[3]) / 100
            c = float(parts[4]) / 100
            v = int(parts[5])
        except ValueError:
            continue
        date_part = parts[6]  # "2026.07.07"
        if trade_date is None:
            trade_date = date_part.replace(".", "-")
        time_part = tstr.split("/")[1]
        bars.append({"t": time_part, "o": o, "h": h, "l": l, "c": c, "v": v})

    bars.reverse()  # chronological ascending
    return trade_date, bars


def main():
    manifest_path = DATA_DIR / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "symbols": [{"code": c, "name": n} for c, n in SYMBOLS],
            "dates": [],
        }

    trade_date = None
    for code, name in SYMBOLS:
        d, bars = fetch(code)
        if not bars:
            print(f"WARN: no data for {code} {name}")
            continue
        trade_date = d
        out_dir = DATA_DIR / code
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / f"{d}.json").write_text(
            json.dumps(bars, ensure_ascii=False), encoding="utf-8"
        )
        print(f"{code} {name}: {len(bars)} bars saved for {d}")

    if trade_date and trade_date not in manifest["dates"]:
        manifest["dates"].append(trade_date)
        manifest["dates"] = sorted(set(manifest["dates"]), reverse=True)

    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"manifest updated: {len(manifest['dates'])} dates -> {manifest_path}")


if __name__ == "__main__":
    main()
