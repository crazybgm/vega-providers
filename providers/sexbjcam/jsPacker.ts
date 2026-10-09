/**
 * Dean Edwards 式 `eval(function(p,a,c,k,e,d){…}(payload, radix, count, 'w1|w2|…'))`
 * 的**纯字符串还原**。
 *
 * 合规说明：这不是绕过验证，而是把站点自己排版过的字符串还原成普通文本。
 * 全程只做正则与字符串替换，**不 eval、不执行任何页面脚本**，
 * 不访问 DOM，也不使用 Node API —— 因此可以原样放进 Vega 沙盒。
 * 站点把地址放进压缩包是它的排版习惯，不是一道需要绕过的门。
 */

/**
 * 取出载荷与其词典。
 *
 * 注意 `eval` 后面紧跟的是**函数本身的参数括号** `(p,a,c,k,e,d){…}`，
 * 载荷在函数体**之后**：`}(payload, radix, count, 'w1|w2|…')`。
 * 跳过函数体才能取到真正的载荷。
 */
function readCall(
  source: string,
  start: number,
): {payload: string; radix: number; words: string[]} | null {
  // 1) 跳过函数体：找到与之配对的 `}`（这里函数体不含嵌套花括号）。
  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) return null;
  const bodyEnd = source.indexOf('}', bodyStart);
  if (bodyEnd < 0) return null;

  // 2) 函数体之后应是 `(`。
  let index = bodyEnd + 1;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  if (source[index] !== '(') return null;
  index += 1;
  while (index < source.length && /\s/.test(source[index])) index += 1;

  // 3) 第一个参数：载荷（单引号或双引号字符串）。
  const quote = source[index];
  if (quote !== "'" && quote !== '"') return null;

  let payload = '';
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      payload += source[cursor + 1] ?? '';
      cursor += 2;
      continue;
    }
    if (char === quote) break;
    payload += char;
    cursor += 1;
  }
  if (cursor >= source.length) return null;

  // 4) 之后依次是 `,radix,count,'w1|w2|…'`。
  const after = source.indexOf(')', cursor);
  const args = source.slice(cursor + 1, after < 0 ? source.length : after);
  const radix = Number.parseInt(args.trim().split(',')[0] || '36', 10) || 36;
  const wordsMatch = /'([^']*)'|"([^"]*)"/.exec(args);
  const words = (wordsMatch?.[1] ?? wordsMatch?.[2] ?? '').split('|');

  return {payload, radix, words};
}

/** 还原一次 packer 调用。 */
export function unpackCall(source: string, start: number): string {
  const parsed = readCall(source, start);
  if (!parsed || parsed.words.length < 2) return '';
  const {payload, radix, words} = parsed;

  let output = payload;
  // ⚠️ 必须**从大到小**替换。若从小到大，低编号的两位数词会先被
  // 词边界吃掉（例如 `1` 先替掉 `10` 的前半段），结果是错的脚本。
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    if (!word) continue;
    output = output.replace(new RegExp(`\\b${index.toString(radix)}\\b`, 'g'), word);
  }
  return output;
}

/** 还原整段文本里的所有 packer 调用。 */
export function unpackAll(source: string): string {
  if (!source) return '';
  const pattern = /eval\s*\(\s*function\s*\([^)]*\)\s*\{/g;
  let output = source;
  let match = pattern.exec(source);
  while (match !== null) {
    const unpacked = unpackCall(source, match.index);
    if (unpacked) {
      // 用还原结果替换整个 eval(...) 调用。
      // 不靠「数括号」定位结束位置——函数体与词典里都可能带括号。
      const bodyStart = source.indexOf('{', match.index);
      const bodyEnd = source.indexOf('}', bodyStart);
      const end = source.indexOf(';', bodyEnd);
      const slice = source.slice(match.index, end > 0 ? end + 1 : bodyEnd + 1);
      if (slice) output = output.replace(slice, unpacked);
    }
    pattern.lastIndex = match.index + match[0].length;
    match = pattern.exec(source);
  }
  return output;
}