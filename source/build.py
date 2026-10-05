"""Build Two Paydays.

  python3 source/build.py            # the Mac app, written to the repository root (served by GitHub Pages)
  python3 source/build.py --online   # also the single-page version for claude.ai, written to source/online/

Version and what's-new notes come from source/macapp/release.json. Bump the version for every release:
the installed apps see the new version and offer an "Update now" button.
The planner's data is never part of a build or of this repository: it lives only in each person's app.
"""
import json, pathlib, re, shutil, subprocess, sys

SOURCE = pathlib.Path(__file__).resolve().parent
REPO = SOURCE.parent
SRC, MAC, VENDOR, FONTS = SOURCE / 'src', SOURCE / 'macapp', SOURCE / 'vendor', SOURCE / 'fonts'
JS_FILES = ['engine.js', 'core.js', 'charts.js', 'ui1.js', 'ui2.js', 'ui3.js', 'ui4.js']

def parse_check(path):
    code = "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');const m=[...s.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)];m.forEach(x=>new Function(x[1]));console.log(m.length+' scripts parse')"
    r = subprocess.run(['node', '-e', code, str(path)], capture_output=True, text=True)
    if r.returncode: sys.exit('Script error in ' + str(path) + ':\n' + r.stderr)
    return r.stdout.strip()

def build_app(out=REPO):
    release = json.loads((MAC / 'release.json').read_text())
    version = release['version']
    head = (SRC / 'head.html').read_text()
    style = re.search(r'<style>.*?</style>', head, re.S).group(0)
    shell = re.search(r'<div id="app">.*?</div>\s*<div id="tip"[^>]*></div>', head, re.S).group(0)
    js = '\n'.join((SRC / f).read_text() for f in JS_FILES)
    vendor = (VENDOR / 'htm-preact-standalone.umd.js').read_text()
    updates = (MAC / 'updates.js').read_text()
    fonts_css = """<style>
@font-face { font-family: "Bricolage Grotesque"; font-style: normal; font-display: swap; font-weight: 200 800;
  src: url(fonts/bricolage-grotesque-latin-wght.woff2) format("woff2-variations"), url(fonts/bricolage-grotesque-latin-wght.woff2) format("woff2"); }
@font-face { font-family: "Manrope"; font-style: normal; font-display: swap; font-weight: 200 800;
  src: url(fonts/manrope-latin-wght.woff2) format("woff2-variations"), url(fonts/manrope-latin-wght.woff2) format("woff2"); }
</style>"""
    app_meta = json.dumps({'version': version, 'released': release.get('released', '')})
    index = f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Two Paydays: a household money planner for two paydays. Everything you enter stays on your computer.">
<meta name="theme-color" content="#0b6b5c" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a1210" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Two Paydays">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<title>Two Paydays</title>
{fonts_css}
{style}
</head>
<body>
{shell}
<script>{vendor}</script>
<script>window.TP_APP = {app_meta};</script>
<script>
{js}
</script>
<script>
{updates}
</script>
</body>
</html>
"""
    out.mkdir(parents=True, exist_ok=True)
    (out / 'index.html').write_text(index)
    (out / 'fonts').mkdir(exist_ok=True)
    for f in FONTS.iterdir():
        shutil.copy(f, out / 'fonts' / f.name)
    if (out / 'icons').exists(): shutil.rmtree(out / 'icons')
    shutil.copytree(MAC / 'icons', out / 'icons')
    manifest = {
        'id': './', 'name': 'Two Paydays', 'short_name': 'Two Paydays',
        'description': 'Household money planner for two paydays. Everything stays on this computer.',
        'start_url': './', 'scope': './', 'display': 'standalone',
        'background_color': '#eef3f1', 'theme_color': '#0b6b5c',
        'icons': [
            {'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
            {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
            {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }
    (out / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2))
    (out / 'version.json').write_text(json.dumps(release, indent=2))
    files = ['./', './index.html', './manifest.webmanifest', './version.json',
             './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
             './fonts/manrope-latin-wght.woff2', './fonts/bricolage-grotesque-latin-wght.woff2']
    sw = (MAC / 'sw.template.js').read_text().replace('__VERSION__', version).replace('__FILES__', json.dumps(files))
    (out / 'sw.js').write_text(sw)
    (out / '.nojekyll').write_text('')
    print(parse_check(out / 'index.html'), '· Mac app', version, '·', round(len(index) / 1024), 'KB')

def build_online():
    head = (SRC / 'head.html').read_text()
    js = '\n'.join((SRC / f).read_text() for f in JS_FILES)
    out = SOURCE / 'online' / 'two-paydays.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(head + '\n<script>\n' + js + '\n</script>\n')
    print(parse_check(out), '· online page', round(out.stat().st_size / 1024), 'KB')

if __name__ == '__main__':
    build_app()
    if '--online' in sys.argv: build_online()
