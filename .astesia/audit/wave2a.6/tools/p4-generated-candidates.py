import os, re, json

PROJECTS = {
    "design": ["eunectes", "ifrit", "flora-smk"],
    "regression": ["arene", "SIA", "pustaka-sekolah-pwa", "terminal-portfolio"],
    "holdout": ["eduNEXA", "prototype-ami", "cadetspeak"]
}

MIN_REGEX = re.compile(r"\.min\.(js|mjs|cjs|css)$", re.IGNORECASE)
HEADER_MARKERS = ["@generated", "DO NOT EDIT", "Code generated"]

def is_v1_generated(path, lines, content):
    base = os.path.basename(path)
    if MIN_REGEX.search(base):
        return True, "min_basename"
    for l in lines:
        if len(l) >= 5000:
            return True, "long_line_5000"
    for l in lines[:10]:
        for m in HEADER_MARKERS:
            if m.lower() in l.lower():
                return True, f"header_{m}"
    return False, "not_generated"

def is_v2_generated(path, lines, content_crlf_normalized):
    base = os.path.basename(path)
    if MIN_REGEX.search(base):
        return True, "min_basename"
    has_5000 = any(len(l) >= 5000 for l in lines)
    if not has_5000:
        return False, "no_line_5000"
    
    total_bytes = len(content_crlf_normalized.encode("utf-8"))
    if total_bytes == 0:
        return False, "empty_file"
    
    long_line_bytes = sum(len((l + "\n").encode("utf-8")) for l in lines if len(l) >= 1000)
    ratio = long_line_bytes / total_bytes
    if ratio >= 0.50:
        return True, f"ratio_{ratio:.4f}"
    return False, f"ratio_{ratio:.4f}_under_0.50"

def has_header_marker(lines):
    for idx, l in enumerate(lines[:10]):
        for m in HEADER_MARKERS:
            if m.lower() in l.lower():
                return True, m, idx + 1
    return False, None, 0

results = []

for group, projs in PROJECTS.items():
    for proj in projs:
        proj_dir = os.path.join("D:/Workspaces", proj)
        if not os.path.exists(proj_dir):
            continue
        for root, dirs, files in os.walk(proj_dir):
            if any(k in root for k in ["node_modules", ".git", ".svelte-kit"]):
                continue
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext not in [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".php", ".json", ".yaml", ".yml", ".env", ".html", ".blade.php", ".css"]:
                    continue
                path = os.path.join(root, f)
                rel_path = os.path.relpath(path, proj_dir).replace("\\", "/")
                try:
                    with open(path, "r", encoding="utf-8", errors="replace") as fh:
                        raw = fh.read()
                except Exception:
                    continue
                norm = raw.replace("\r\n", "\n")
                lines = norm.split("\n")
                
                v1_match, v1_reason = is_v1_generated(path, lines, raw)
                v2_match, v2_reason = is_v2_generated(path, lines, norm)
                has_hdr, hdr_name, hdr_line = has_header_marker(lines)
                
                if v1_match or v2_match or has_hdr:
                    results.append({
                        "group": group,
                        "project": proj,
                        "file": rel_path,
                        "v1_match": v1_match,
                        "v1_reason": v1_reason,
                        "v2_match": v2_match,
                        "v2_reason": v2_reason,
                        "has_header": has_hdr,
                        "header_marker": hdr_name,
                        "header_line": hdr_line,
                        "status_change": "v1_only" if (v1_match and not v2_match) else ("v2_only" if (v2_match and not v1_match) else ("both" if v1_match and v2_match else "header_only"))
                    })

os.makedirs("D:/Workspaces/Astesia/.astesia/audit/wave2a.6", exist_ok=True)
with open("D:/Workspaces/Astesia/.astesia/audit/wave2a.6/p4-generated-candidates.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print(f"Total files examined with generated characteristics: {len(results)}")
changes = [r for r in results if r["status_change"] == "v1_only"]
print(f"Files changing from generated in v1 to scanned in v2 (v1_only): {len(changes)}")
for c in changes:
    print(f"  [{c['group']}] {c['project']} : {c['file']} (v1={c['v1_reason']} -> v2={c['v2_reason']}, header={c['header_marker']})")
