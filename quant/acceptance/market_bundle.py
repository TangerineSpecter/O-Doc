"""Pinned public market data, bounded retrieval, and lossless UTC conversion.

Run only explicitly: python -m quant.acceptance.market_bundle --output NEW_DIR.
Ordinary tests never fetch this data.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen
import zipfile

ARCHIVE_SHA = 'cf873a185bd5b24b8e00034e49583fcb49928e0c3a45c6fc27a632a683655417'
CSV_SHA = '14b48319e5e446d15d8add8f3cc5d9728c0d96469591265f8e9efbe61eb05b68'
SOURCE = 'https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2024-01.zip'


def bounded_file(path, limit=2_000_000):
    with path.open('rb') as stream:
        value = stream.read(limit+1)
    if len(value) > limit:
        raise ValueError('固定行情文件超过上限')
    return value


def original_rows(archive):
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA:
        raise ValueError('真实行情归档与固定校验和不一致')
    with zipfile.ZipFile(io.BytesIO(archive)) as stored:
        if stored.namelist() != ['BTCUSDT-1h-2024-01.csv']:
            raise ValueError('行情归档成员不一致')
        return list(csv.reader(io.StringIO(stored.read(stored.namelist()[0]).decode())))


def normalize(archive):
    text = io.StringIO()
    writer = csv.writer(text, lineterminator='\n')
    writer.writerow(('timestamp','open','high','low','close','volume'))
    for row in original_rows(archive):
        stamp = datetime.fromtimestamp(int(row[0])//1000, timezone.utc).isoformat()
        writer.writerow((stamp, *row[1:6]))
    result = text.getvalue().encode()
    if hashlib.sha256(result).hexdigest() != CSV_SHA:
        raise ValueError('规范化结果与固定校验和不一致')
    return result


def read_bundle(location):
    root = Path(location).resolve(strict=True)
    archive = bounded_file(root/'source.zip')
    normalized = bounded_file(root/'normalized.csv')
    if normalize(archive) != normalized:
        raise ValueError('规范化 CSV 改变了源价格、成交量或时间')
    if bounded_file(root/'source.zip.CHECKSUM', 1024).decode().split()[0] != ARCHIVE_SHA:
        raise ValueError('发布校验文件不一致')
    rows = list(csv.DictReader(io.StringIO(normalized.decode())))
    original = original_rows(archive)
    if len(rows) != 744 or len(original) != len(rows):
        raise ValueError('固定月份必须包含 744 根小时行情')
    for index, raw in enumerate(original):
        timestamp = 1704067200000 + index*3600000
        if len(raw) != 12 or int(raw[0]) != timestamp or int(raw[6]) != timestamp+3599999:
            raise ValueError('原始时间或字段数量不一致')
    return root, normalized.decode(), rows


def fetch(location):
    def download(url):
        with urlopen(Request(url, headers={'User-Agent':'O-Doc-research-acceptance/1'}), timeout=20) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError('行情下载超过上限')
            return raw
    with ThreadPoolExecutor(max_workers=2) as pool:
        archive, checksum = pool.map(download, (SOURCE, SOURCE+'.CHECKSUM'))
    if checksum.decode().split()[0] != ARCHIVE_SHA:
        raise ValueError('发布校验文件不一致')
    normalized = normalize(archive)
    root = Path(location).resolve()
    root.mkdir(mode=0o700, parents=False, exist_ok=False)
    for name, value in (('source.zip',archive),('source.zip.CHECKSUM',checksum),('normalized.csv',normalized)):
        with (root/name).open('xb') as stream:
            stream.write(value)
    (root/'provenance.json').write_text(json.dumps({'source':SOURCE,'checksum_url':SOURCE+'.CHECKSUM',
        'archive_sha256':ARCHIVE_SHA,'normalized_csv_sha256':CSV_SHA,
        'downloaded_at':datetime.now(timezone.utc).isoformat()}, indent=2)+'\n')
    read_bundle(root)
    return root


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='尚不存在的目录；不覆盖已有验收材料')
    destination = fetch(parser.parse_args().output)
    print(json.dumps({'bundle':str(destination),'rows':744,'checksum_verified':True}))
