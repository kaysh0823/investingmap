/** KRX CSV exports are usually CP949 (EUC-KR), not UTF-8. */
import fs from 'fs';
import { TextDecoder } from 'util';

export function readKrxCsvFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const utf8 = buf.toString('utf8');
  if (utf8.includes('\uFFFD')) {
    return new TextDecoder('euc-kr').decode(buf);
  }
  const sample = utf8.split(/\r?\n/).slice(1, 40).join('\n');
  if (!/[\uAC00-\uD7AF]/.test(sample) && /"KOSPI"|"KOSDAQ"/.test(sample)) {
    return new TextDecoder('euc-kr').decode(buf);
  }
  return utf8;
}
