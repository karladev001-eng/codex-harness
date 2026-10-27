import fs from 'node:fs';
const rows=fs.readFileSync(new URL('../data/measurements.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
const methods=['現行','改善案'];
const means=methods.map(method=>{const values=rows.filter(r=>r[0]===method).map(r=>Number(r[2]));return {method,n:values.length,meanSeconds:values.reduce((a,b)=>a+b,0)/values.length,minSeconds:Math.min(...values),maxSeconds:Math.max(...values)};});
const result={means,differenceSeconds:means[0].meanSeconds-means[1].meanSeconds,reductionPercent:100*(means[0].meanSeconds-means[1].meanSeconds)/means[0].meanSeconds};
fs.writeFileSync(new URL('../data/summary.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 340"><rect width="640" height="340" fill="#ffffff"/><text x="30" y="38" font-family="sans-serif" font-size="24" fill="#172a3a">平均処理時間（秒・仮想値）</text>'+means.map((m,i)=>'<text x="30" y="'+(112+i*110)+'" font-family="sans-serif" font-size="20">'+m.method+'</text><rect x="150" y="'+(75+i*110)+'" width="'+(m.meanSeconds*9)+'" height="55" fill="'+(i?'#137e75':'#8292a4')+'"/><text x="'+(160+m.meanSeconds*9)+'" y="'+(110+i*110)+'" font-family="sans-serif" font-size="24">'+m.meanSeconds+'</text>').join('')+'<text x="30" y="310" font-family="sans-serif" font-size="18">同じPC・各方式3回／演習用、実運用の測定結果ではない</text></svg>';
fs.writeFileSync(new URL('../assets/comparison.svg',import.meta.url),svg);
console.log(JSON.stringify(result));
