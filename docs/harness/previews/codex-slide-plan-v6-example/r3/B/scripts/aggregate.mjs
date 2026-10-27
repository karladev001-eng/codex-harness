// Exercise values, not measurements. This module does not execute on import.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

export function aggregate(root = path.dirname(here)) {
  const lines = fs.readFileSync(path.join(root, 'data/measurements.csv'), 'utf8').trim().split(/\r?\n/);
  if (lines.shift() !== 'method,run,seconds') throw new Error('Unexpected CSV columns');
  const groups = new Map();
  for (const line of lines) {
    const [method, run, raw] = line.split(',');
    const value = Number(raw);
    if (!['現行', '改善案'].includes(method) || !/^[1-3]$/.test(run) || !Number.isFinite(value) || value < 0) throw new Error('Invalid exercise row');
    const rows = groups.get(method) ?? [];
    if (rows.some(row => row.run === Number(run))) throw new Error('Duplicate run');
    rows.push({ run: Number(run), seconds: value }); groups.set(method, rows);
  }
  const methods = ['現行', '改善案'].map(method => {
    const rows = groups.get(method) ?? [];
    if (rows.length !== 3) throw new Error('Expected three runs per method');
    const values = rows.map(row => row.seconds);
    return { method, count: rows.length, mean: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
  });
  const difference = methods[0].mean - methods[1].mean;
  return { label: '演習用仮想値・実測ではない', unit: '秒', conditions: '同じPC・各3回', methods, difference, reductionPercent: difference / methods[0].mean * 100 };
}

export function comparisonSVG(summary) {
  const origin = 140, width = 640, max = 50;
  const axis = [0, 10, 20, 30, 40, 50].map(value => `<line x1="${origin + value / max * width}" y1="55" x2="${origin + value / max * width}" y2="225" stroke="#d9e3e8"/><text x="${origin + value / max * width}" y="257" text-anchor="middle">${value}</text>`).join('');
  const bars = summary.methods.map((method, i) => `<text x="115" y="${104 + i * 90}" text-anchor="end">${method.method}</text><rect x="${origin}" y="${72 + i * 90}" width="${method.mean / max * width}" height="48" rx="3" fill="${i ? '#137e75' : '#728696'}"/><text x="${origin + method.mean / max * width + 16}" y="${104 + i * 90}" font-weight="700">${method.mean}秒</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 300"><title>平均時間：現行40秒、改善案25秒（演習用仮想値）</title><rect width="900" height="300" fill="#ffffff"/><g font-family="Arial, sans-serif" font-size="25" fill="#172a3a">${axis}${bars}<text x="780" y="290" text-anchor="end" font-size="20">平均処理時間（秒）</text></g></svg>`;
}

export function regenerate(root = path.dirname(here)) {
  const summary = aggregate(root);
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'assets/comparison.svg'), comparisonSVG(summary) + '\n');
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(regenerate(), null, 2));
