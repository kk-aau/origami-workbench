from pathlib import Path
s=Path('output/parallel/original-resample-1010/verify-downloads.ts').read_text(encoding='utf8')
s=s.replace("from './src/", "from '../src/")
s=s.replace('`evidence/browser-', '`output/playwright/original-resample-browser-')
s=s.replace("'evidence/browser-", "'output/playwright/original-resample-browser-")
s=s.replace("'evidence/download-readback-report.json'", "'output/original-resample-download-1010.json'")
Path('scripts/verify-original-resample-download-1010.ts').write_text(s,encoding='utf8')
