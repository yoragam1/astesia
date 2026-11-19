import json
from collections import defaultdict

entries = json.load(open("D:/Workspaces/Astesia/.astesia/audit/wave2a.6/p2-fp-noise-analysis.json", encoding="utf-8"))
grouped = defaultdict(list)
for e in entries:
    grouped[e["rule"]].append(e)

for rule, items in sorted(grouped.items()):
    print(f"\n==================== {rule} ({len(items)} items) ====================")
    for it in items:
        file_part = it["id"].split("|")[1]
        line_part = it["id"].split("|")[2]
        print(f"[{it['class']}] {it['project']} | {file_part}:{line_part}")
        print(f"   Quote : {it['quote']}")
        print(f"   Reason: {it['reason']}")
