/**
 * templates/enforcement/tests/fuzz-truth.ts
 * Ground-truth classification fuzzing oracle (Seed 7001 & 7002, 2,000 files each).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { preprocessSource } from "../astesia-gate";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Segment {
  type: "code" | "string" | "comment" | "regex";
  text: string;
  rxOpenIdx?: number;
  rxCloseIdx?: number;
}

export function runGroundTruthFuzz(
  seed: number,
  fileCount: number = 2000,
  counterexamplesDir: string
): { passed: boolean; filesTested: number; errors: string[] } {
  const rng = mulberry32(seed);
  const profiles = ["ts", "py", "go"] as const;
  const errors: string[] = [];
  const enableRegexJsx = seed >= 7100;

  mkdirSync(counterexamplesDir, { recursive: true });

  for (let i = 0; i < fileCount; i++) {
    const profile = profiles[Math.floor(rng() * profiles.length)];
    const ext = enableRegexJsx && profile === "ts" && i % 2 === 1 ? "tsx" : profile;
    const filename = `truth_${seed}_${i}.${ext}`;
    const segments: Segment[] = [];
    const numSegments = 3 + Math.floor(rng() * 5);

    for (let s = 0; s < numSegments; s++) {
      const rVal = rng();
      const segType: Segment["type"] =
        enableRegexJsx && profile === "ts"
          ? rVal < 0.35
            ? "code"
            : rVal < 0.55
            ? "regex"
            : rVal < 0.8
            ? "string"
            : "comment"
          : rVal < 0.4
          ? "code"
          : rVal < 0.7
          ? "string"
          : "comment";
      let segText = "";

      if (profile === "ts") {
        if (segType === "code") {
          const snippets = enableRegexJsx
            ? [
                "const val = 42;\n",
                "let active = true;\n",
                "function doTask() { return 1; }\n",
                "const view = <div id={val}><span>hello</span></div>;\n",
                "const ratio = (val + 2) / 4;\n"
              ]
            : ["const val = 42;\n", "let active = true;\n", "function doTask() { return 1; }\n"];
          segText = snippets[Math.floor(rng() * snippets.length)];
          segments.push({ type: "code", text: segText });
        } else if (segType === "regex") {
          const rxSnippets: Array<{ text: string; rxOpenIdx: number; rxCloseIdx: number }> = [
            { text: "const rx = /`a`b`/gi;\n", rxOpenIdx: 11, rxCloseIdx: 17 },
            { text: "const rx2 = /[/]`/g;\n", rxOpenIdx: 12, rxCloseIdx: 17 },
            { text: "function chk(s: string) { return /\"q\"/.test(s); }\n", rxOpenIdx: 33, rxCloseIdx: 37 }
          ];
          const chosen = rxSnippets[Math.floor(rng() * rxSnippets.length)];
          segments.push({
            type: "regex",
            text: chosen.text,
            rxOpenIdx: chosen.rxOpenIdx,
            rxCloseIdx: chosen.rxCloseIdx
          });
        } else if (segType === "string") {
          const quotes = ['"simple typescript string"\n', "'single quote ts string'\n", "`simple template literal`\n"];
          segText = quotes[Math.floor(rng() * quotes.length)];
          segments.push({ type: "string", text: segText });
        } else {
          const comments = ["// typescript line comment\n", "/* typescript block comment */\n"];
          segText = comments[Math.floor(rng() * comments.length)];
          segments.push({ type: "comment", text: segText });
        }
      } else if (profile === "py") {
        if (segType === "code") {
          const snippets = ["val = 42\n", "active = True\n", "def do_task():\n    return 1\n"];
          segText = snippets[Math.floor(rng() * snippets.length)];
        } else if (segType === "string") {
          const quotes = ['"simple python string"\n', "'single quote py string'\n", '"""simple docstring"""\n'];
          segText = quotes[Math.floor(rng() * quotes.length)];
        } else {
          segText = "# python line comment\n";
        }
        segments.push({ type: segType, text: segText });
      } else {
        // Go
        if (segType === "code") {
          const snippets = ["var val int = 42\n", "var active bool = true\n", "func DoTask() int { return 1 }\n"];
          segText = snippets[Math.floor(rng() * snippets.length)];
        } else if (segType === "string") {
          const quotes = ['"simple go string"\n', "`simple raw go string`\n"];
          segText = quotes[Math.floor(rng() * quotes.length)];
        } else {
          const comments = ["// go line comment\n", "/* go block comment */\n"];
          segText = comments[Math.floor(rng() * comments.length)];
        }
        segments.push({ type: segType, text: segText });
      }
    }

    // Snippet injection test
    const injectChoice = rng();
    let injectedSnippet: string | null = null;
    let injectedType: "code" | "string" | "comment" = "code";

    if (injectChoice < 0.3) {
      injectedSnippet = "let injectedAny: any = 99;\n";
      injectedType = "code";
      segments.push({ type: "code", text: injectedSnippet });
    } else if (injectChoice < 0.6) {
      injectedSnippet = '"injected string with : any and console.log("\n';
      injectedType = "string";
      segments.push({ type: "string", text: injectedSnippet });
    } else if (injectChoice < 0.8) {
      injectedSnippet = "// injected comment with : any and SELECT * FROM users\n";
      injectedType = "comment";
      segments.push({ type: "comment", text: injectedSnippet });
    }

    // Build full text and character-level oracle map
    const fullText = segments.map((s) => s.text).join("");
    const prep = preprocessSource(fullText, filename);

    const norm = fullText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const expLines = norm.split("\n");

    // Check invariants
    if (
      prep.rawLines.length !== expLines.length ||
      prep.codeLines.length !== expLines.length ||
      prep.codeNoStringsLines.length !== expLines.length ||
      prep.commentLines.length !== expLines.length
    ) {
      const err = `File ${filename}: Line count mismatch (exp: ${expLines.length}, got code: ${prep.codeLines.length})`;
      errors.push(err);
      writeFileSync(join(counterexamplesDir, `counterexample_${seed}_${i}.txt`), fullText);
      break;
    }

    // Build expected line arrays
    const charTypes: Array<"code" | "string_delim" | "string_content" | "comment" | "newline"> = [];
    for (const seg of segments) {
      if (seg.type === "code") {
        for (let c = 0; c < seg.text.length; c++) {
          charTypes.push(seg.text[c] === "\n" ? "newline" : "code");
        }
      } else if (seg.type === "regex") {
        const openIdx = seg.rxOpenIdx ?? 0;
        const closeIdx = seg.rxCloseIdx ?? seg.text.length - 1;
        for (let c = 0; c < seg.text.length; c++) {
          if (seg.text[c] === "\n") {
            charTypes.push("newline");
          } else if (c > openIdx && c < closeIdx) {
            charTypes.push("string_content");
          } else if (c === openIdx || c === closeIdx) {
            charTypes.push("string_delim");
          } else {
            charTypes.push("code");
          }
        }
      } else if (seg.type === "comment") {
        for (let c = 0; c < seg.text.length; c++) {
          charTypes.push(seg.text[c] === "\n" ? "newline" : "comment");
        }
      } else if (seg.type === "string") {
        // String with delimiter at start and end
        const trimmed = seg.text.endsWith("\n") ? seg.text.slice(0, -1) : seg.text;
        const hasNl = seg.text.endsWith("\n");
        const isTriple = trimmed.startsWith('"""') || trimmed.startsWith("'''");
        const delimLen = isTriple ? 3 : 1;
        
        for (let c = 0; c < trimmed.length; c++) {
          if (c < delimLen || c >= trimmed.length - delimLen) {
            charTypes.push("string_delim");
          } else {
            charTypes.push("string_content");
          }
        }
        if (hasNl) charTypes.push("newline");
      }
    }

    // Validate each line
    let pos = 0;
    let lineFailed = false;

    for (let l = 0; l < expLines.length; l++) {
      const lineText = expLines[l];
      const codeNoStr = prep.codeNoStringsLines[l];
      const commentL = prep.commentLines[l];
      const codeL = prep.codeLines[l];

      if (codeNoStr.length !== lineText.length || commentL.length !== lineText.length || codeL.length !== lineText.length) {
        errors.push(`File ${filename} line ${l + 1}: Length mismatch`);
        lineFailed = true;
        break;
      }

      for (let c = 0; c < lineText.length; c++) {
        const expectedType = charTypes[pos + c] || "code";
        const origChar = lineText[c];

        // Oracle rule (a): In code positions and string delims, codeNoStringsLines = original; in string_content/comment = space
        if (expectedType === "code" || expectedType === "string_delim") {
          if (codeNoStr[c] !== origChar) {
            errors.push(`File ${filename} L${l + 1} C${c + 1}: codeNoStringsLines expected '${origChar}', got '${codeNoStr[c]}'`);
            lineFailed = true;
            break;
          }
        } else if (expectedType === "string_content" || expectedType === "comment") {
          if (codeNoStr[c] !== " ") {
            errors.push(`File ${filename} L${l + 1} C${c + 1}: codeNoStringsLines expected space, got '${codeNoStr[c]}'`);
            lineFailed = true;
            break;
          }
        }

        // Oracle rule (b): commentLines = original only in comment positions
        if (expectedType === "comment") {
          if (commentL[c] !== origChar) {
            errors.push(`File ${filename} L${l + 1} C${c + 1}: commentLines expected '${origChar}', got '${commentL[c]}'`);
            lineFailed = true;
            break;
          }
        } else {
          if (commentL[c] !== " ") {
            errors.push(`File ${filename} L${l + 1} C${c + 1}: commentLines expected space, got '${commentL[c]}'`);
            lineFailed = true;
            break;
          }
        }

        // Oracle rule (c): codeLines = original in code + string, space in comment
        if (expectedType === "code" || expectedType === "string_delim" || expectedType === "string_content") {
          if (codeL[c] !== origChar) {
            errors.push(`File ${filename} L${l + 1} C${c + 1}: codeLines expected '${origChar}', got '${codeL[c]}'`);
            lineFailed = true;
            break;
          }
        } else if (expectedType === "comment") {
          if (codeL[c] !== " ") {
            errors.push(`File ${filename} L${l + 1} C${c + 1}: codeLines expected space, got '${codeL[c]}'`);
            lineFailed = true;
            break;
          }
        }
      }

      if (lineFailed) break;
      pos += lineText.length + 1; // +1 for newline
    }

    if (lineFailed) {
      writeFileSync(join(counterexamplesDir, `counterexample_${seed}_${i}.txt`), fullText);
      break;
    }

    // Verify injected snippet detection rules
    if (injectedSnippet) {
      if (injectedType === "code" && injectedSnippet.includes(": any")) {
        const found = prep.codeNoStringsLines.some((l) => l.includes(": any"));
        if (!found) {
          errors.push(`File ${filename}: injected ': any' in code segment was NOT preserved in codeNoStringsLines`);
          writeFileSync(join(counterexamplesDir, `counterexample_${seed}_${i}.txt`), fullText);
          break;
        }
      } else if (injectedType === "string" && injectedSnippet.includes(": any")) {
        const found = prep.codeNoStringsLines.some((l) => l.includes(": any"));
        if (found) {
          errors.push(`File ${filename}: injected ': any' inside string literal LEAKED into codeNoStringsLines`);
          writeFileSync(join(counterexamplesDir, `counterexample_${seed}_${i}.txt`), fullText);
          break;
        }
      } else if (injectedType === "comment" && injectedSnippet.includes("SELECT *")) {
        const found = prep.codeLines.some((l) => l.includes("SELECT *"));
        if (found) {
          errors.push(`File ${filename}: injected 'SELECT *' inside comment LEAKED into codeLines`);
          writeFileSync(join(counterexamplesDir, `counterexample_${seed}_${i}.txt`), fullText);
          break;
        }
      }
    }
  }

  return {
    passed: errors.length === 0,
    filesTested: fileCount,
    errors
  };
}

if (import.meta.main) {
  const counterDir = "D:/Workspaces/Astesia/.astesia/audit/wave2a/counterexamples";
  console.log("Running Ground-Truth Fuzz (Seed 7001)...");
  const res7001 = runGroundTruthFuzz(7001, 2000, counterDir);
  console.log(`Seed 7001: ${res7001.passed ? "PASS (2000/2000)" : "FAIL"} - Errors: ${res7001.errors.slice(0, 3).join("; ")}`);

  console.log("Running Ground-Truth Fuzz (Seed 7002)...");
  const res7002 = runGroundTruthFuzz(7002, 2000, counterDir);
  console.log(`Seed 7002: ${res7002.passed ? "PASS (2000/2000)" : "FAIL"} - Errors: ${res7002.errors.length}`);

  process.exit(res7001.passed && res7002.passed ? 0 : 1);
}
