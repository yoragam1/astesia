import json, os

temp_base = "C:/Users/alta1r/AppData/Local/Temp/astesia-holdout"

files_to_check = [
    ("eduNEXA", "docker-compose.yml", 9),
    ("eduNEXA", "internal/domain/mutu/ami/dto.go", 212),
    ("eduNEXA", "internal/platform/config/config.go", 23),
    ("eduNEXA", "scripts/update_structure.py", 36),
    ("prototype-ami", "src/lib/mock-api.ts", 6),
]

for proj, rel, line in files_to_check:
    full = os.path.join(temp_base, proj, rel)
    if os.path.exists(full):
        lines = open(full, encoding="utf-8", errors="replace").readlines()
        start = max(0, line - 3)
        end = min(len(lines), line + 3)
        print(f"=== {proj} | {rel}:{line} ===")
        for idx in range(start, end):
            prefix = ">>" if idx + 1 == line else "  "
            print(f"{prefix} {idx+1}: {lines[idx].rstrip()}")
