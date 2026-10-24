"""Builds assets/data/threadex-stations.json, the ThreadEx climate stations used by the
almanac page, with the location of each one's current station.

ThreadEx stations merge a city's long-term records into one history, but ACIS doesn't give
them a location. Their IDs start with the code of the airport or site they're based on
(MSPthr is Minneapolis-St Paul), so the location comes from looking that code up.

Run from the repo root: python tools/build-threadex-stations.py
"""
import json
import urllib.parse
import urllib.request

ACIS = 'https://data.rcc-acis.org/StnMeta'
STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH '
          'NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY').split()


def acis(params):
    url = ACIS + '?params=' + urllib.parse.quote(json.dumps(params))
    request = urllib.request.Request(url, headers={'User-Agent': 'retrocast-build'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)['meta']


stations = []
for state in STATES:
    for meta in acis({'state': state, 'meta': 'name,sids', 'elems': 'maxt'}):
        sid = next((s.split()[0] for s in meta['sids'] if s.endswith(' 9')), None)
        if sid:
            stations.append({'id': sid, 'name': meta['name'], 'state': state})

# Look up the location of each station's base site by its code, in batches
codes = sorted({s['id'][:-3] for s in stations})
located = {}
for i in range(0, len(codes), 50):
    for meta in acis({'sids': ','.join(codes[i:i + 50]), 'meta': 'sids,ll'}):
        if not meta.get('ll'):
            continue
        for sid in meta['sids']:
            code = sid.split()[0]
            if code in codes:
                located.setdefault(code, meta['ll'])

output = []
missing = []
for s in stations:
    ll = located.get(s['id'][:-3])
    if ll:
        output.append({'id': s['id'], 'name': s['name'], 'lon': round(ll[0], 3), 'lat': round(ll[1], 3)})
    else:
        missing.append(s['id'])

with open('assets/data/threadex-stations.json', 'w') as f:
    json.dump(sorted(output, key=lambda s: s['id']), f, separators=(',', ':'))
print(f'{len(output)} stations written, {len(missing)} without a location: {" ".join(missing)}')
