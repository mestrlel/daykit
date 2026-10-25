"""Check publishable files without printing credential values."""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    "Telegram bot token": re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{30,}\b"),
    "private key": re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----"),
    "GitHub token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "AWS access key": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "credential in URL": re.compile(r"https?://[^\s/:@]+:[^\s/@]+@"),
    "personal home path": re.compile(r"(?:/Users/|/home/|[A-Z]:\\Users\\)[A-Za-z0-9_.-]+[/\\]"),
}
PRIVATE_PARTS = {".ssh", ".aws", ".cloudflared", "secrets", "credentials", "private",
                 "data", "backups", "exports", "uploads", "node_modules", ".venv", "venv"}
PRIVATE_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx",
                    ".session", ".dump", ".sql", ".csv", ".tsv", ".log", ".zip", ".bak"}


def git(root, *args, git_dir=None):
    command = ["git", "-c", "core.excludesFile=/dev/null"]
    if git_dir:
        command += [f"--git-dir={git_dir}", f"--work-tree={root}"]
    return subprocess.run(command + list(args), cwd=root, check=True, capture_output=True).stdout


def candidates(root):
    try:
        top = Path(git(root, "rev-parse", "--show-toplevel").decode().strip())
    except subprocess.CalledProcessError:
        top = None
    if top and top.resolve() == root.resolve():
        return git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")[:-1]
    with tempfile.TemporaryDirectory(prefix="tgapp-check-") as directory:
        git(root, "init", "--bare", directory)
        return git(root, "ls-files", "--others", "--exclude-standard", "-z", git_dir=directory).decode().split("\0")[:-1]


def private_name(path):
    p = Path(path)
    return (bool(PRIVATE_PARTS.intersection(p.parts)) or p.suffix.lower() in PRIVATE_SUFFIXES
            or (p.name.startswith(".env") and p.name != ".env.example")
            or p.name in {".DS_Store", ".npmrc", ".pypirc"}
            or any(ending in p.name for ending in (".db-", ".sqlite-", ".sqlite3-", ".session-")))


def local_values(root):
    values = set()
    for path in root.glob(".env*"):
        if not path.is_file() or path.name == ".env.example":
            continue
        for line in path.read_text(errors="replace").splitlines():
            key, sep, value = line.strip().removeprefix("export ").partition("=")
            value = value.strip().strip("\"'")
            if sep and len(value) >= 6 and re.search(r"TOKEN|SECRET|PASSWORD|API_KEY|OWNER.*ID|WEBAPP_URL", key):
                values.add(value)
    return values


def check(root):
    findings = []
    paths = sorted(set(candidates(root)))
    values = local_values(root)
    try:
        top = Path(git(root, "rev-parse", "--show-toplevel").decode().strip())
        tracked = set(git(root, "ls-files", "--cached", "-z").decode().split("\0")) if top.resolve() == root.resolve() else set()
    except subprocess.CalledProcessError:
        tracked = set()
    for relative in paths:
        path = root / relative
        if path.is_symlink():
            findings.append((relative, "symlink: inspect its target before publishing"))
            continue
        if private_name(relative):
            findings.append((relative, "private/generated file is publishable or already tracked"))
            continue
        versions = [(relative, path.read_bytes())] if path.is_file() else []
        if relative in tracked:
            versions.append((relative + " (staged)", git(root, "show", f":{relative}")))
        for label, raw in versions:
            if b"\0" in raw:
                findings.append((label, "binary file: inspect manually before publishing"))
                continue
            content = raw.decode("utf-8", errors="replace")
            for reason, pattern in PATTERNS.items():
                if pattern.search(content):
                    findings.append((label, reason))
            if any(value in content for value in values):
                findings.append((label, "value copied from local environment"))
    return paths, findings


def main():
    try:
        paths, findings = check(ROOT)
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"Publication check failed: {type(exc).__name__}", file=sys.stderr)
        return 2
    if findings:
        for path, reason in findings:
            print(f"BLOCKED {path}: {reason}")
        print("Remove private files from Git's index or replace secrets with environment variables.")
        return 1
    print(f"Checked {len(paths)} publishable files: no known secrets or private file types found.")
    print("Review the file list and diff before pushing; arbitrary personal text requires manual review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
