// Original demonstration; illustrative values are not measurements.
import fs from 'node:fs';
const rows = fs.readFileSync(new URL('../data/illustrative.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map(line => { const [stage, minutes, sourceId] = line.split(','); return { stage, minutes: Number(minutes), sourceId }; });
console.log(JSON.stringify({ label: '仮値', unit: '分', rows }, null, 2));
