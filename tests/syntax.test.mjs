// The app-side TypeScript (app-patch/) parses once its types are stripped (Node's own stripper, as tests/help-note does).
import { stripTypeScriptTypes } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app-patch/supabase/functions');
let bad = 0, good = 0;
for (const f of ['dialboard-status-probe/index.ts', 'dialboard-support-inbound/index.ts', '_shared/status-check.ts']) {
  try { new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(path.join(P, f), 'utf8'), { mode: 'strip' }), { identifier: f }); good++; console.log('  ok   ' + f); }
  catch (e) { bad++; console.log('  FAIL ' + f + ' :: ' + e.message); }
}
console.log('\n' + good + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
