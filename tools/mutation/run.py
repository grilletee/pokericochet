"""Mutation harness that works on an isolated copy of the project, never on the working tree.

Why: running mutants in place left mutated source in the author's tree three times (an interrupted
run, overlapping runs). Here the project is copied to a fresh temporary folder (node_modules is a
junction to the real one, read only for this purpose) and every mutant is applied and undone inside
that copy. The real tree is hashed before and after as proof that it was not touched.

Usage (from the project root):
    python tools/mutation/run.py tools/mutation/mutants/4d.py [name-filter ...]

A mutants file defines `M = [(name, [(path, old, new), ...]), ...]` with paths relative to the root.
A mutant is "killed" when `vitest run --bail 1` fails in the copy, "survived" when it passes and
"not found" when `old` is not in the file (the script reports it: a mutant that is not run counts as
a defect of the mutants file, not as a pass).
"""

import hashlib
import os
import re
import runpy
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
COPY = ["src", "tests", "tools", "package.json", "tsconfig.json", "tsconfig.domain.json",
        "vite.config.ts", "vitest.bench.config.ts", "biome.json", "index.html"]
IGNORE = shutil.ignore_patterns("node_modules", "dist", ".cache", "playtest-out", "sprites", "*.png")
FINGERPRINT_DIRS = ["src", "tests", "tools"]


def fingerprint():
    """Hash of every tracked-looking source file of the real tree (src, tests, tools)."""
    h = hashlib.sha256()
    for top in FINGERPRINT_DIRS:
        for base, dirs, files in os.walk(os.path.join(ROOT, top)):
            dirs[:] = sorted(d for d in dirs if d not in ("node_modules", ".cache", "sprites"))
            for name in sorted(files):
                path = os.path.join(base, name)
                h.update(path.encode())
                with open(path, "rb") as f:
                    h.update(f.read())
    return h.hexdigest()[:16]


def make_sandbox():
    box = tempfile.mkdtemp(prefix="pokericochet-mutation-")
    for item in COPY:
        src = os.path.join(ROOT, item)
        dst = os.path.join(box, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore=IGNORE)
        elif os.path.exists(src):
            shutil.copy2(src, dst)
    link = os.path.join(box, "node_modules")
    target = os.path.join(ROOT, "node_modules")
    result = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True)
    if result.returncode != 0:
        raise SystemExit("could not link node_modules: " + result.stdout.decode("utf-8", "replace"))
    return box


def remove_sandbox(box):
    link = os.path.join(box, "node_modules")
    if os.path.isdir(link):
        os.rmdir(link)  # removes the junction only, never the real folder
    shutil.rmtree(box, ignore_errors=True)


def run_tests(box):
    r = subprocess.run("node node_modules/vitest/vitest.mjs run --bail 1", shell=True, cwd=box,
                       capture_output=True, env={**os.environ, "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"})
    out = (r.stdout or b"").decode("utf-8", "replace") + (r.stderr or b"").decode("utf-8", "replace")
    m = re.search(r"Tests\s+(\d+) failed", out)
    failed = int(m.group(1)) if m else 0
    if r.returncode != 0 and failed == 0:
        failed = 1
    return failed, out


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    mutants = runpy.run_path(sys.argv[1])["M"]
    keep = sys.argv[2:]
    if keep:
        mutants = [m for m in mutants if any(k in m[0] for k in keep)]
    before = fingerprint()
    box = make_sandbox()
    survivors, notfound, killed = [], [], 0
    try:
        failed, out = run_tests(box)
        if failed:
            raise SystemExit("the unmutated copy already fails; fix the tests first.\n" + out[-1500:])

        def rd(p):
            with open(os.path.join(box, p), encoding="utf-8", newline="") as f:
                return f.read()

        def wr(p, s):
            with open(os.path.join(box, p), "w", encoding="utf-8", newline="") as f:
                f.write(s)

        for name, edits in mutants:
            backups, ok = {}, True
            for path, old, new in edits:
                s = rd(path)
                backups.setdefault(path, s)
                if old not in s:
                    ok = False
                    break
                wr(path, s.replace(old, new, 1))
            try:
                if not ok:
                    notfound.append(name)
                    print(f"NOT FOUND  {name}", flush=True)
                    continue
                failed, _ = run_tests(box)
            finally:
                for p, s in backups.items():
                    wr(p, s)
            if failed:
                killed += 1
                print(f"killed     {name}", flush=True)
            else:
                survivors.append(name)
                print(f"SURVIVED   {name}", flush=True)
    finally:
        remove_sandbox(box)
    after = fingerprint()
    print(f"\nmutants {len(mutants)}  killed {killed}  survived {len(survivors)}  not found {len(notfound)}")
    print("working tree untouched:", before == after)
    for s in survivors:
        print("  SURVIVOR:", s)
    for s in notfound:
        print("  NOTFOUND:", s)
    if before != after:
        raise SystemExit("the real tree changed during the run (not by this script)")


if __name__ == "__main__":
    main()
