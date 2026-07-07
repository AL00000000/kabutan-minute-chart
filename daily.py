import subprocess
import sys
from datetime import datetime
from pathlib import Path

import fetch

BASE = Path(__file__).parent
LOG = BASE / "daily.log"


def log(msg):
    line = f"{datetime.now().isoformat(timespec='seconds')} {msg}"
    print(line)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(cmd):
    result = subprocess.run(cmd, cwd=BASE, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} failed: {result.stdout} {result.stderr}")
    return result.stdout.strip()


def main():
    log("=== daily run start ===")
    try:
        fetch.main()
    except Exception as e:
        log(f"ERROR during fetch: {e}")
        sys.exit(1)

    try:
        run(["git", "add", "docs/data"])
        status = run(["git", "status", "--porcelain", "--", "docs/data"])
        if not status:
            log("no changes to commit")
            return
        today = datetime.now().strftime("%Y-%m-%d")
        run(["git", "commit", "-m", f"Add minute chart data for {today}"])
        run(["git", "push"])
        log("pushed to GitHub")
    except Exception as e:
        log(f"ERROR during git push: {e}")
        sys.exit(1)

    log("=== daily run done ===")


if __name__ == "__main__":
    main()
