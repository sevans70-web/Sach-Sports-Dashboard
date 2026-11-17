"""Read-only production TLS smoke check. No insecure flags, proxy changes or CA import.

The managed execution sandbox must grant this command read/write access to the
existing user's NSS directory: Chromium initializes that store read/write.
Grant the directory with the execution tool; do not change HOME or disable TLS.
"""
import argparse, json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
home = Path.home()
legacy = home / '.pki/nssdb'
nss = legacy if legacy.exists() else home / '.local/share/pki/nssdb'
report = {'scope': 'active production fallback TLS only; not R1 candidate acceptance',
          'tlsVerificationEnabled': True, 'nssDirectory': str(nss), 'sessions': []}
try:
    # Merely open/close the existing DB; do not alter its bytes or trust entries.
    with (nss / 'cert9.db').open('r+b'):
        pass
except OSError as error:
    report['blocked'] = 'Existing NSS database needs authorized read/write sandbox access.'
    report['error'] = str(error)
    output.write_text(json.dumps(report, indent=2) + '\n')
    raise SystemExit(report['blocked'])

with sync_playwright() as playwright:
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
    browser = playwright.chromium.launch(
        executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'],
        **({'proxy': {'server': proxy}} if proxy else {}))
    try:
        for label, viewport in [('desktop', {'width': 1440, 'height': 1100}),
                                ('mobile', {'width': 390, 'height': 844})]:
            page = browser.new_page(viewport=viewport, timezone_id='America/Toronto')
            started = time.monotonic()
            response = page.goto('https://sach-sports-cloudflare-test.sevans70.workers.dev/nba',
                                 wait_until='domcontentloaded', timeout=30000)
            assert response.status == 200
            report['sessions'].append({'viewport': label, 'httpStatus': response.status,
                                       'title': page.title(), 'url': page.url,
                                       'seconds': round(time.monotonic() - started, 3)})
            page.close()
    finally:
        browser.close()
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
