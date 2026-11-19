import os

t_dir = "D:/Workspaces/Astesia/templates/enforcement/tests"
for f in os.listdir(t_dir):
    if f.endswith(".ts"):
        full = os.path.join(t_dir, f)
        content = open(full, encoding="utf-8").read()
        lines = content.split("\n")
        for i, l in enumerate(lines):
            if '.astesia/audit/tmp' in l and '__dirname' not in l:
                print(f"{f}:{i+1} -> {l.strip()}")
            if 'resolve("templates/' in l or 'resolve(\'templates/' in l:
                print(f"{f}:{i+1} -> {l.strip()}")
