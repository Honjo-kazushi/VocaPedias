import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PERF diagnostics are opt-in, bounded, and expose copy/clear/voice data", async () => {
  const [app, panel, perf] = await Promise.all([
    read("../src/App.tsx"),
    read("../src/components/PerfDebugPanel.tsx"),
    read("../src/debug/tossaPerf.ts"),
  ]);
  assert.match(app, /isTossaPerfDebugEnabled\(\) && <PerfDebugPanel/);
  assert.match(perf, /const MAX_ENTRIES = 300/);
  assert.match(perf, /if \(!isTossaPerfDebugEnabled\(\)\) return/);
  assert.match(panel, /navigator\.clipboard\.writeText\(report\)/);
  assert.match(panel, /textareaRef\.current\?\.select\(\)/);
  assert.match(panel, /clearTossaPerfEntries\(\)/);
  assert.match(panel, /speechSynthesis\.getVoices\(\)/);
  assert.match(panel, /=== CURRENT VOICE ===/);
  assert.match(panel, /TTS main speak/);
  assert.match(panel, /TTS speak → onstart/);
  assert.match(panel, /TTS onstart → onend/);
  assert.match(panel, /=== VOICES ===/);
});
