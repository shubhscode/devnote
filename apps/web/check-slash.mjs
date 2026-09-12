import { chromium } from 'playwright';

const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://localhost:5173');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.getByPlaceholder('Untitled').click();
await p.keyboard.type('/h1', { delay: 30 });
await p.waitForSelector('.cm-tooltip-autocomplete', { timeout: 3000 });
const icon = p.locator('.cm-completionIcon-i-h1');
console.log('i-h1 ::before content:', JSON.stringify(await icon.evaluate((el) => getComputedStyle(el, '::before').content)));
console.log('className:', await icon.evaluate((el) => el.className));
await p.screenshot({ path: '/tmp/slash-icons.png' });
await b.close();
console.log('done');