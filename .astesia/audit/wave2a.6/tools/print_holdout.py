import json

for proj in ['eduNEXA', 'prototype-ami', 'cadetspeak']:
    raw = json.load(open(f'D:/Workspaces/Astesia/.astesia/audit/wave2a.6/holdout/raw/base-{proj}.json', encoding='utf-8'))
    print(f"=== {proj} ({len(raw.get('violations', []))} violations) ===")
    for v in raw.get('violations', []):
        rule = v.get('ruleId')
        sev = v.get('severity')
        f = v.get('file')
        l = v.get('line')
        snip = v.get('snippet', '')
        print(f"  [{sev}] {rule} in {f}:{l}")
        print(f"       Snippet: {repr(snip)}")
