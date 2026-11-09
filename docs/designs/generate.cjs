// Selected Ledger layout. Run with: node docs/designs/generate.cjs
const fs = require('node:fs'), path = require('node:path');
const style = `<style>text{font:11px 'Segoe UI',Arial,sans-serif;fill:#e1e5eb}.muted{fill:#939da9}.small{font-size:9px}.num{font-variant-numeric:tabular-nums;font-weight:500}.line{stroke:#30353d;stroke-width:1;fill:none;stroke-linecap:round;stroke-linejoin:round}.icon{stroke:#aab4c0;stroke-width:1.2;fill:none;stroke-linecap:round;stroke-linejoin:round}</style>`;
const t=(x,y,value,cls='',anchor='start')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${value}</text>`;
const line=y=>`<path d="M12 ${y}H212" class="line"/>`;
function fire(x,y,active) {return `<g transform="translate(${x} ${y}) scale(.8)" fill="none" stroke="${active?'#c99465':'#939da9'}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5c.8 3-2.8 4.1-2.1 6.4C5 7.4 4.3 6.5 4.2 5.4 2.8 7 2 8.5 2 10a6 6 0 0 0 12 0c0-3-2.4-5.3-5.5-8.5Z"/><path d="M8 9c1.5 1.1 2 2 2 3a2 2 0 0 1-4 0c0-.8.6-1.9 2-3Z"/></g>`;}
function ledger(activeId='You') {
  let body=`<rect x=".5" y=".5" width="223" height="213" rx="7" fill="#181b20" stroke="#30353d"/>`+t(12,21,'GAME 12','small muted')+t(188,21,'07:42','small muted','end')+`<g transform="translate(201 13)" class="icon"><path d="M0 3h10M0 8h10"/><circle cx="3" cy="3" r="1.5" fill="#181b20"/><circle cx="7" cy="8" r="1.5" fill="#181b20"/></g>`+line(32);
  body+=t(12,49,'SQUAD','small muted')+t(156,49,'GAME','small muted','end')+t(212,49,'STREAK','small muted','end');
  [['You',8],['Nova',9],['Ash',6]].forEach(([name,count],i)=>{
    const y=68+i*18,active=name===activeId,run=active?(name==='You'?3:2):0;
    body+=t(12,y,name,name==='You'?'':'muted')+t(156,y,count,'num','end')+fire(180,y-12,active)+`<text x="212" y="${y}" text-anchor="end" class="num" style="fill:${active?'#c99465':'#939da9'}">${run}</text>`;
  });
  body+=line(114)+t(12,132,'CHESTS','small muted')+t(144,132,'YOU','small muted','end')+t(212,132,'TEAM','small muted','end');
  [['This game','8','23'],['Chests / match','13.45','38.73']].forEach(([label,you,team],i)=>{
    const y=154+i*22;body+=t(12,y,label,'muted')+t(144,y,you,'num','end')+t(212,y,team,'num','end');
  });
  return body+line(185)+t(12,202,'Token chance','muted')+t(212,202,'0.3093%','num','end');
}
const active=ledger(),inactive=ledger('Nova');
for(const [name,body] of [['c-ledger',active],['c-ledger-inactive',inactive]]) fs.writeFileSync(path.join(__dirname,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="224" height="214" viewBox="0 0 224 214" role="img" aria-label="Ledger HUD: game chests, current opening streaks, chests per match and one shared token chance">${style}${body}</svg>\n`);
const board=`<svg xmlns="http://www.w3.org/2000/svg" width="572" height="324" viewBox="0 0 572 324" role="img" aria-label="Selected Ledger layout with active and grey inactive streak flames">${style}<rect width="572" height="324" rx="12" fill="#101216"/>${t(28,33,'Ledger · refined')}${t(28,56,'224 × 214px · SVG icons · one shared team token chance','small muted')}<g transform="translate(28 83)">${t(0,0,'Your streak is active','muted')}<g transform="translate(0 15)">${active}</g></g><g transform="translate(320 83)">${t(0,0,'Your streak is inactive','muted')}<g transform="translate(0 15)">${inactive}</g></g></svg>`;
fs.writeFileSync(path.join(__dirname,'minihud-concepts.svg'),board+'\n');
