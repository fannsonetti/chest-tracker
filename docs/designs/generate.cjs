// Editable, deterministic SVG proposals. Run from the repository root.
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
const style = `<style>text{font:11px 'Segoe UI',Arial,sans-serif;fill:#e1e5eb}.muted{fill:#939da9}.small{font-size:9px}.num{font-variant-numeric:tabular-nums;font-weight:500}.line{stroke:#30353d;stroke-width:1;fill:none;stroke-linecap:round;stroke-linejoin:round}.icon{stroke:#aab4c0;stroke-width:1.2;fill:none;stroke-linecap:round;stroke-linejoin:round}</style>`;
const text = (x,y,value,cls='',anchor='start') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${value}</text>`;
const line = (x,y,x2,y2) => `<path d="M${x} ${y}H${x2}" class="line"/>`;
const chest = (x,y) => `<g transform="translate(${x} ${y})" class="icon"><path d="M1 5h12v8H1zM1 5V4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1M1 7h12M7 5v4"/></g>`;
const gear = x => `<g transform="translate(${x} 13)" class="icon"><path d="M0 3h10M0 8h10"/><circle cx="3" cy="3" r="1.5" fill="#181b20"/><circle cx="7" cy="8" r="1.5" fill="#181b20"/></g>`;
const frame = (w,h,body) => `<rect x=".5" y=".5" width="${w-1}" height="${h-1}" rx="7" fill="#181b20" stroke="#30353d"/>${body}`;
const head = w => text(12,21,'GAME 12','small muted') + text(w-36,21,'07:42','small muted','end') + gear(w-23);
const rows = [['This game','8','23'],['Lifetime','148','426'],['Session','20','60'],['Chests / match','13.45','38.73'],['Chests / hour','12.0','36.0'],['Token chance','0.1076%','0.3093%']];
function matrix(y,w,step=22) {
  let s = text(12,y,'CHESTS','small muted')+text(w-80,y,'YOU','small muted','end')+text(w-12,y,'TEAM','small muted','end');
  rows.forEach(([label,you,team],i)=> {const r=y+22+i*step;s+=text(12,r,label,'muted')+text(w-80,r,you,'num','end')+text(w-12,r,team,'num','end');});
  return s;
}
function roster(y,w) {
  let s=text(12,y,'SQUAD','small muted')+text(w-72,y,'GAME','small muted','end')+text(w-12,y,'TOTAL','small muted','end');
  [['You','8','148'],['Nova','9','167'],['Ash','6','111']].forEach(([name,game,total],i)=> {let r=y+19+i*18;s+=text(12,r,name,name==='You'?'':'muted')+text(w-72,r,game,'num','end')+text(w-12,r,total,'num','end');});return s;
}
const a = frame(224,344,head(224)+line(12,32,212)+matrix(49,224,21)+line(12,190,212)+text(12,207,'Your streak','muted')+text(212,207,'3 now · 5 best','num','end')+text(12,225,'11 completed · session 1h 40m','small muted')+line(12,237,212)+roster(254,224)+text(12,333,'Team includes you','small muted'));
let b = head(248)+line(12,32,236);
[['THIS GAME',8,23,44],['LIFETIME',148,426,103]].forEach(([label,you,team,y])=>{
  b+=text(12,y+9,label,'small muted')+chest(12,y+21)+text(36,y+19,'YOU','small muted')+text(130,y+19,'TEAM','small muted')+`<text x="36" y="${y+40}" class="num" style="font-size:20px">${you}</text><text x="130" y="${y+40}" class="num" style="font-size:20px">${team}</text>`;
});
b+=line(12,154,236)+text(12,171,'YOU / TEAM','small muted');
[['Session','20 / 60'],['Chests / match','13.45 / 38.73'],['Chests / hour','12.0 / 36.0'],['Token chance','0.1076% / 0.3093%'],['Your streak','3 now · 5 best']].forEach(([l,v],i)=> {b+=text(12,190+i*20,l,'muted')+text(236,190+i*20,v,'num','end');});
b+=line(12,282,236)+text(12,299,'You 8 · Nova 9 · Ash 6','small')+text(12,317,'Squad totals: 148 · 167 · 111','small muted')+text(12,336,'11 completed · session 1h 40m','small muted');
b=frame(248,348,b);
const c = frame(224,344,head(224)+line(12,32,212)+roster(49,224)+line(12,114,212)+matrix(132,224,21)+line(12,273,212)+text(12,291,'Your streak','muted')+text(212,291,'3 now · 5 best','num','end')+text(12,312,'11 completed · session 1h 40m','small muted')+text(12,333,'Team includes you','small muted'));
const variants = [['a-outline',224,344,a],['b-inline',248,348,b],['c-ledger',224,344,c]];
for(const [name,w,h,body] of variants) fs.writeFileSync(path.join(out,`${name}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${name}: current game and lifetime personal and team chests, session counts, rates, token chance, streaks and squad">${style}${body}</svg>\n`);
const board=`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="554" viewBox="0 0 840 554" role="img" aria-label="Three compact SVG MiniHUD proposals with complete personal and team statistics">${style}<rect width="840" height="554" rx="12" fill="#101216"/>${text(28,35,'More stats. Still quiet.','')}${text(28,59,'All three show game, lifetime and session chests — personal and team.','muted')}${text(28,80,'Same information, different hierarchy. Actual overlay widths: 224–248px.','small muted')}<g transform="translate(28 109)">${text(0,0,'A · Outline')}${text(0,19,'Stats first · 224 × 344','small muted')}<g transform="translate(0 34)">${a}</g></g><g transform="translate(296 109)">${text(0,0,'B · Inline')}${text(0,19,'Game + lifetime emphasis · 248 × 348','small muted')}<g transform="translate(0 34)">${b}</g></g><g transform="translate(588 109)">${text(0,0,'C · Ledger')}${text(0,19,'Squad first · 224 × 344','small muted')}<g transform="translate(0 34)">${c}</g></g>${text(28,518,'Team includes you. Lifetime counts persist across games; session counts reset with the session.','small muted')}${text(28,538,'All rows are configurable. These are design proposals, pending your selection.','small muted')}</svg>`;
fs.writeFileSync(path.join(out,'minihud-concepts.svg'),board+'\n');
