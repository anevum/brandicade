#!/usr/bin/env python3
"""Build a deterministic, standalone Cloudflare Worker for BRANDICADE static assets.

This contains no secrets or backend and is a reproducible deploy artifact.
Run from the repository root: python3 build_worker.py
"""
import base64
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'dist' / 'brandicade.worker.js'
ASSETS = {
    '/index.html': ('index.html','text/html; charset=utf-8'),
    '/src/styles.css': ('src/styles.css','text/css; charset=utf-8'),
    '/src/app.mjs': ('src/app.mjs','text/javascript; charset=utf-8'),
    '/src/engine.mjs': ('src/engine.mjs','text/javascript; charset=utf-8'),
    '/src/progression.mjs': ('src/progression.mjs','text/javascript; charset=utf-8'),
    '/sw.js': ('sw.js','text/javascript; charset=utf-8'),
    '/manifest.webmanifest': ('manifest.webmanifest','application/manifest+json; charset=utf-8'),
    '/assets/atrium.svg': ('assets/atrium.svg','image/svg+xml'),
    '/assets/mark.svg': ('assets/mark.svg','image/svg+xml'),
    '/assets/icon.svg': ('assets/icon.svg','image/svg+xml'),
    '/assets/icon-192.png': ('assets/icon-192.png','image/png'),
    '/assets/icon-512.png': ('assets/icon-512.png','image/png'),
    '/assets/icon-1024.png': ('assets/icon-1024.png','image/png'),
    '/assets/share.jpg': ('assets/share.jpg','image/jpeg'),
}

def main():
    entries={}
    for route,(file,mime) in ASSETS.items():
        content=(ROOT / file).read_bytes()
        zipped=gzip.compress(content,compresslevel=9,mtime=0)
        use_gzip=len(zipped)<len(content)*.93
        payload=zipped if use_gzip else content
        entries[route]={'m':mime,'g':int(use_gzip),'b':base64.b64encode(payload).decode('ascii')}
    source = '''/* BRANDICADE — The Living Arcade | v1.0.1 | standalone static Cloudflare Worker
 * Generated from GPLv3-licensed source by build_worker.py. No tracking, secrets, or backend.
 * Keep Brandle and ANEVUM deployments independent. Do not edit this generated file.
 */
const FILES = __ASSETS__;
const SEC = {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy':"default-src 'self' data: blob:; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
};
function decodeBase64(b) { return Uint8Array.from(atob(b), c => c.charCodeAt(0)); }
export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    const url = new URL(request.url);
    let route;
    try { route=decodeURIComponent(url.pathname); } catch { return new Response('Bad Request',{status:400}); }
    if (route === '/') route='/index.html';
    const entry=FILES[route];
    if (!entry) return new Response('Not Found',{status:404,headers:{'X-Content-Type-Options':'nosniff'}});
    const hdr = new Headers(SEC);
    hdr.set('Content-Type',entry.m);
    hdr.set('Cache-Control',route==='/index.html'||route==='/sw.js'?'no-cache, must-revalidate':'public, max-age=3600');
    if(route==='/sw.js') hdr.set('Service-Worker-Allowed','/');
    let body=null;
    if(request.method !== 'HEAD') {
      const bytes=decodeBase64(entry.b);
      body=entry.g ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')) : bytes;
    }
    return new Response(body,{status:200,headers:hdr});
  }
};
'''
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(source.replace('__ASSETS__',json.dumps(entries,separators=(',',':'),ensure_ascii=True)),encoding='utf8')
    print('Built',OUT,'size',OUT.stat().st_size,'bytes,',len(entries),'routes')

if __name__=='__main__':main()
