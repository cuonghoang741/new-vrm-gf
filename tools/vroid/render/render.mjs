import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [,, listFile, posesFile, outDir] = process.argv;
const list = JSON.parse(fs.readFileSync(listFile,'utf8'));
const poses = JSON.parse(fs.readFileSync(posesFile,'utf8'));
fs.mkdirSync(outDir,{recursive:true});
const browser = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage(); await page.setCacheEnabled(true);
await page.setViewport({width:900,height:1400});
page.on('pageerror', e => console.log('pageerror', String(e).slice(0,160)));
for (const c of list) {
  const ps = c.poses ? c.poses.map(i=>[i,poses[i]]) : poses.map((p,i)=>[i,p]);
  if (ps.every(([i]) => fs.existsSync(`${outDir}/${c.key}__${i}.png`))) continue;
  try {
    await page.goto('file://'+process.cwd()+'/render.html');
    await page.waitForFunction('window.ready===true',{timeout:30000});
    await page.evaluate(u=>window.loadVrm(u), c.url);
    for (const [i,p] of ps) {
      const out=`${outDir}/${c.key}__${i}.png`; if (fs.existsSync(out)) continue;
      try { await page.evaluate((f,t,turn,ex)=>window.pose(f,t,turn,ex), p.fbx,p.t,p.turn||0,p.expr||null);
        await (await page.$('canvas')).screenshot({path:out, omitBackground:true}); console.log('ok',c.key,i);
      } catch(e){ console.log('posefail',c.key,i,String(e).slice(0,120)); }
    }
  } catch(e){ console.log('fail',c.key,String(e).slice(0,120)); }
}
await browser.close();
