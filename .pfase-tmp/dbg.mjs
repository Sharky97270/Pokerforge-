import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const exe=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const b=await puppeteer.launch({executablePath:exe,headless:'new',defaultViewport:{width:1600,height:1200}});
const page=await b.newPage();
await page.goto('http://localhost:7788',{waitUntil:'networkidle2'});
const click=(t)=>page.evaluate(x=>{const el=[...document.querySelectorAll('button,.ntab,div,span')].filter(e=>e.children.length===0||e.tagName==='BUTTON').find(e=>e.textContent.trim()===x);if(el){el.click();return true}return false},t);
for(let i=0;i<12;i++){ if(await click('SharkSolver')) break; await new Promise(r=>setTimeout(r,500)); }
await new Promise(r=>setTimeout(r,1500));
const info=await page.evaluate(()=>{
  const els=[...document.querySelectorAll('[data-pfase="panel"]')];
  return {count:els.length, texts:els.map(e=>e.innerText.slice(0,90)), rects:els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}), scrollY:window.scrollY, docH:document.documentElement.scrollHeight};
});
console.log(JSON.stringify(info,null,1));
await page.evaluate(()=>document.querySelector('[data-pfase="panel"]')?.scrollIntoView({block:'start'}));
await new Promise(r=>setTimeout(r,500));
const after=await page.evaluate(()=>{const r=document.querySelector('[data-pfase="panel"]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,scrollY:window.scrollY}});
console.log('après scroll',JSON.stringify(after));
await page.screenshot({path:'design-qa-evidence/dbg-full.png'});
await b.close();
