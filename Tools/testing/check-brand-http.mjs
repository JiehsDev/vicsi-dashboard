// Anonymous smoke check against the running app, including its real auth proxy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.argv[2]??'http://127.0.0.1:3000';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=hash(await readFile('public/brand/vicsi-logo.png'));
for(const path of ['/login','/signup']){
  const page=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.equal(page.status,200,`${path} must be accessible while signed out`);
  const html=await page.text();
  const href=html.match(/<image\b[^>]*href="([^"]+)"/)?.[1];
  assert.ok(href,`${path} should render the shared logo`);
  const logo=await fetch(new URL(href.replaceAll('&amp;','&'),base),{redirect:'manual',signal:AbortSignal.timeout(10000)});
  assert.equal(logo.status,200,`${path}: logo must not redirect to login`);
  assert.match(logo.headers.get('content-type'),/^image\/png/);
  assert.equal(hash(Buffer.from(await logo.arrayBuffer())),expected,'Served logo must match the supplied artwork');
  console.log(`PASS ${path}: anonymous logo request returns the correct PNG`);
}
for(const path of ['/classes','/class-results','/results']){
  const page=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(10000)});
  assert.equal(page.status,307);
  assert.equal(new URL(page.headers.get('location'),base).pathname,'/login');
  console.log(`PASS ${path}: authentication still required`);
}
