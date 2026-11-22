// 画面に出る言葉に、小学校で習わない漢字が入っていないかを数える（メインの遊び手は小学6年生）。
// コメントの中と、AIへの指示（server/）は数えない。使い方：npm run check:kanji
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// フォルダ名に日本語（デスクトップなど）があっても読めるように、fileURLToPath で戻す
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = fs.readFileSync(path.join(root, 'src/game/kanji.ts'), 'utf8');
const school = new Set([...list.match(/const GRADES = \[([\s\S]*?)\];/)[1].replace(/[^㐀-鿿]/g, '')]);
if (school.size !== 1026) throw new Error(`漢字の表が ${school.size} 字（1026字のはず）`);

const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f.name) && f.name !== 'kanji.ts') files.push(p);
  }
};
walk(path.join(root, 'src'));
files.push(path.join(root, 'index.html'));

let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/(^|\s)\/\/.*$/, '').replace(/<!--.*?-->/g, '');
    const hard = [...new Set([...code].filter((c) => /[㐀-鿿]/.test(c) && !school.has(c)))];
    if (hard.length) {
      bad++;
      console.log(`${path.relative(root, f)}:${i + 1}  ${hard.join('')}  ｜ ${code.trim().slice(0, 90)}`);
    }
  });
}
console.log(bad ? `小学校で習わない漢字：${bad} 行` : '小学校で習わない漢字：0 行');
process.exit(bad ? 1 : 0);
