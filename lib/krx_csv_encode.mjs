/** KRX CSV exports are usually CP949 (EUC-KR), not UTF-8. */
import fs from 'fs';
import { join } from 'path';
import { TextDecoder } from 'util';
import iconv from 'iconv-lite';

export function detectKrxCsvEncoding(buf) {
  const utf8 = buf.toString('utf8');
  if (utf8.includes('\uFFFD')) return 'euc-kr';
  const sample = utf8.split(/\r?\n/).slice(1, 40).join('\n');
  if (!/[\uAC00-\uD7AF]/.test(sample) && /"KOSPI"|"KOSDAQ"/.test(sample)) return 'euc-kr';
  return 'utf8';
}

export function readKrxCsvFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (detectKrxCsvEncoding(buf) === 'euc-kr') {
    return new TextDecoder('euc-kr').decode(buf);
  }
  return buf.toString('utf8');
}

/** Match encoding of latest data_4937_* / data_4848_* in dataDir (default euc-kr). */
export function resolveKrxCsvWriteEncoding(dataDir) {
  for (const prefix of ['data_4937_', 'data_4848_']) {
    let names;
    try {
      names = fs.readdirSync(dataDir).filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith('.csv'));
    } catch {
      continue;
    }
    if (!names.length) continue;
    names.sort((a, b) => fs.statSync(join(dataDir, b)).mtimeMs - fs.statSync(join(dataDir, a)).mtimeMs);
    return detectKrxCsvEncoding(fs.readFileSync(join(dataDir, names[0])));
  }
  return 'euc-kr';
}

export function writeKrxCsvFile(filePath, text, encoding = 'euc-kr') {
  const payload = encoding === 'utf8' ? Buffer.from(text, 'utf8') : iconv.encode(text, 'cp949');
  fs.writeFileSync(filePath, payload);
}
