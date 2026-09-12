import {chromium} from '../../web/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await page.goto('https://carestead.com:8083');await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Continue as guest',exact:true}).click(); await page.waitForTimeout(2000); console.log(page.url());console.log((await page.locator('body').innerText()).slice(0,4500));
 for (const [view,file] of [['Overview','overview'],['Care Plan','care-plan'],['Responsibilities','responsibilities']]) { await page.getByRole('button',{name:view,exact:true}).click(); await page.waitForTimeout(700); await page.screenshot({path:'docs/pitch-v2/assets/'+file+'.png'}); console.log(view,(await page.locator('body').innerText()).slice(-2000)); }

} finally {await browser.close();}
