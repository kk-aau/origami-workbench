"""Verify final NSIS EXEs carry one identical, CRC-valid solid 64-MiB 7z payload.

All writable evidence and extraction paths remain below this project's output/.
The embedded archive range comes from a validated 7z start header and next header,
not merely from locating a signature in an EXE.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import traceback
import uuid
import zlib

ROOT = Path(__file__).resolve().parent.parent
SIGNATURE = b'7z\xbc\xaf\x27\x1c'
CHUNK = 1024 * 1024


def digest_region(file, offset=0, length=None):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        stream.seek(offset)
        remaining = file.stat().st_size - offset if length is None else length
        while remaining:
            data = stream.read(min(CHUNK, remaining))
            if not data:
                raise ValueError('Truncated file while hashing a declared archive range')
            result.update(data)
            remaining -= len(data)
    return result.hexdigest()


def crc_region(file, offset, length):
    result = 0
    with file.open('rb') as stream:
        stream.seek(offset)
        while length:
            data = stream.read(min(CHUNK, length))
            if not data:
                raise ValueError('Truncated 7z next header')
            result = zlib.crc32(data, result)
            length -= len(data)
    return result & 0xffffffff


def inspect_header(file, offset):
    size = file.stat().st_size
    with file.open('rb') as stream:
        stream.seek(offset)
        header = stream.read(32)
    if len(header) != 32 or header[:6] != SIGNATURE:
        raise ValueError('Missing complete 7z signature header')
    if header[6] != 0:
        raise ValueError('Unsupported 7z major version')
    start_crc = struct.unpack('<I', header[8:12])[0]
    actual_start_crc = zlib.crc32(header[12:32]) & 0xffffffff
    if start_crc != actual_start_crc:
        raise ValueError('7z start-header CRC mismatch')
    next_offset, next_size, next_crc = struct.unpack('<QQI', header[12:32])
    next_start = offset + 32 + next_offset
    end = next_start + next_size
    if next_size == 0 or next_start < offset + 32 or end > size:
        raise ValueError('7z next-header declaration exceeds the containing file')
    actual_next_crc = crc_region(file, next_start, next_size)
    if actual_next_crc != next_crc:
        raise ValueError('7z next-header CRC mismatch')
    return {'offset': offset, 'signatureVersion': [header[6], header[7]],
            'startHeaderCRC32': f'{start_crc:08x}', 'startHeaderCRCVerified': True,
            'nextHeaderRelativeOffset': next_offset, 'nextHeaderSize': next_size,
            'nextHeaderCRC32': f'{next_crc:08x}', 'nextHeaderCRCVerified': True,
            'nextHeaderAbsoluteOffset': next_start, 'archiveEnd': end,
            'archiveBytes': end - offset, 'rangeWithinFile': True}


def signature_offsets(file):
    with file.open('rb') as stream:
        tail, position = b'', 0
        while True:
            data = stream.read(CHUNK)
            if not data:
                return
            block = tail + data
            base = position - len(tail)
            cursor = 0
            while True:
                found = block.find(SIGNATURE, cursor)
                if found < 0:
                    break
                yield base + found
                cursor = found + 1
            position += len(data)
            tail = block[-(len(SIGNATURE)-1):]


def require_pe(file):
    with file.open('rb') as stream:
        dos = stream.read(64)
        if len(dos) != 64 or dos[:2] != b'MZ':
            raise ValueError(f'{file.name} is not a Windows executable')
        pe = struct.unpack('<I', dos[60:64])[0]
        if pe + 4 > file.stat().st_size:
            raise ValueError('Invalid PE offset')
        stream.seek(pe)
        if stream.read(4) != b'PE\0\0':
            raise ValueError('Invalid PE signature')


def extract_matching_archive(executable, destination, expected_hash, expected_size):
    require_pe(executable)
    valid, rejected, matches = [], [], []
    for offset in signature_offsets(executable):
        try:
            item = inspect_header(executable, offset)
            item['sha256'] = digest_region(executable, offset, item['archiveBytes'])
            valid.append(item)
            if item['archiveBytes'] == expected_size and item['sha256'] == expected_hash:
                matches.append(item)
        except ValueError as error:
            rejected.append({'offset': offset, 'reason': str(error)})
    if len(matches) != 1:
        raise ValueError(f'{executable.name}: expected exactly one complete matching payload; got {len(matches)}')
    chosen = matches[0]
    with executable.open('rb') as source, destination.open('xb') as target:
        source.seek(chosen['offset'])
        remaining = chosen['archiveBytes']
        while remaining:
            data = source.read(min(CHUNK, remaining))
            if not data:
                raise ValueError('Embedded payload became truncated')
            target.write(data)
            remaining -= len(data)
    if digest_region(destination) != expected_hash:
        raise ValueError('Extracted payload hash mismatch')
    return {'executable': str(executable), 'executableBytes': executable.stat().st_size,
            'executableSha256': digest_region(executable), 'peVerified': True,
            'embeddedPayload': chosen, 'matchingPayloadCount': len(matches),
            'otherValidHeaders': [v for v in valid if v is not chosen],
            'rejectedSignatureCandidates': rejected,
            'extractedArchive': str(destination)}


def safe_relative(raw):
    if not isinstance(raw, str) or not raw:
        raise ValueError('Empty archive/manifest path')
    value = raw.replace('\\', '/')
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in ('', '.', '..') or ':' in p for p in value.split('/')):
        raise ValueError(f'Unsafe archive path: {raw}')
    return path.as_posix()


def slt_properties(text):
    properties = {}
    for line in text.splitlines():
        if ' = ' in line:
            key, value = line.split(' = ', 1)
            properties[key] = value
    return properties


def run_seven(seven, parameters, log, environment):
    process = subprocess.run([str(seven), *parameters, '-sccUTF-8'], cwd=ROOT,
                             env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding='utf-8', errors='replace', stdin=subprocess.DEVNULL, timeout=600,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    log.write_text(process.stdout, encoding='utf-8')
    if process.returncode != 0:
        raise ValueError(f'7za failed ({process.returncode}); see {log}')
    return process.stdout


def archive_listing(seven, archive, log, environment):
    text = run_seven(seven, ['l', '-slt', str(archive)], log, environment)
    if '\n----------\n' not in text:
        raise ValueError('7za did not emit an archive metadata section')
    metadata, records = text.split('\n----------\n', 1)
    properties = slt_properties(metadata)
    if properties.get('Type') != '7z' or properties.get('Solid') != '+':
        raise ValueError('Payload is not a solid 7z archive')
    if not re.search(r'\bLZMA2:26\b', properties.get('Method', '')):
        raise ValueError(f'Actual payload method is not LZMA2 with 64-MiB dictionary: {properties.get("Method")}')
    files, seen = {}, set()
    for block in re.split(r'\n\s*\n', records):
        row = slt_properties(block)
        if not row.get('Path'):
            continue
        name = safe_relative(row['Path'])
        if name.casefold() in seen:
            raise ValueError(f'Duplicate/case-colliding archive path: {name}')
        seen.add(name.casefold())
        if row.get('Symbolic Link') or row.get('Hard Link') or row.get('Encrypted') == '+':
            raise ValueError('Payload contains a link or encrypted member')
        if row.get('Folder') == '+' or row.get('Attributes', '').startswith('D'):
            continue
        files[name] = int(row['Size'])
    return properties, files


def inventory(directory):
    rows = []
    def walk(folder):
        for entry in os.scandir(folder):
            file = Path(entry.path)
            info = entry.stat(follow_symlinks=False)
            if entry.is_symlink() or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise ValueError('Extracted payload contains a reparse point')
            if entry.is_dir(follow_symlinks=False):
                walk(file)
            elif entry.is_file(follow_symlinks=False):
                rows.append({'path': file.relative_to(directory).as_posix(), 'bytes': info.st_size, 'sha256': digest_region(file)})
            else:
                raise ValueError('Unexpected extracted filesystem entry')
    walk(directory)
    return sorted(rows, key=lambda row: row['path'])


def normalized_manifest(data):
    rows = data if isinstance(data, list) else data.get('files')
    if not isinstance(rows, list) or not rows:
        raise ValueError('Manifest needs a nonempty files array')
    result, seen = [], set()
    for row in rows:
        name = safe_relative(row['path'])
        if name.casefold() in seen:
            raise ValueError('Duplicate/case-colliding manifest path')
        seen.add(name.casefold())
        if not isinstance(row['bytes'], int) or row['bytes'] < 0 or not re.fullmatch(r'[a-fA-F0-9]{64}', row['sha256']):
            raise ValueError('Invalid manifest size/hash')
        result.append({'path': name, 'bytes': row['bytes'], 'sha256': row['sha256'].lower()})
    return sorted(result, key=lambda row: row['path'])


def runtime_policy(rows):
    banned_parts = {'node_modules', 'profile', '.runtime', '.toolchain', '.venv', 'target', '__pycache__'}
    bad = [r['path'] for r in rows if {p.casefold() for p in PurePosixPath(r['path']).parts} & banned_parts
           or r['path'].lower().endswith(('.map', '.pdb'))
           or PurePosixPath(r['path']).name.lower() in {'activity.ndjson', 'recovery.json', 'preferences.json'}]
    if bad:
        raise ValueError(f'Development/private files entered runtime payload: {bad[:12]}')
    allowed_files = {'zhezhi-workbench-tauri.exe', '使用说明.txt', 'resources/LICENSE',
                     'resources/THIRD_PARTY_NOTICES.md', 'resources/workbench.ico', 'resources/runtime-layout.json'}
    unexpected = [r['path'] for r in rows if r['path'] not in allowed_files
                  and not r['path'].startswith(('resources/dist/', 'resources/engine/', 'resources/legal/'))]
    if unexpected:
        raise ValueError(f'Unexpected source/development tree entered runtime: {unexpected[:12]}')
    development_trees = [r['path'] for r in rows if not r['path'].startswith('resources/legal/')
                         and re.search(r'(^|/)(src-tauri|desktop-tauri|\.cargo)(/|$)|(^|/)third-party/(rust|npm|additional)(/|$)', r['path'], re.I)]
    if development_trees:
        raise ValueError(f'Corresponding-source dependency/build tree entered runtime: {development_trees[:12]}')
    sources = [r['path'] for r in rows if r['path'].lower().startswith('resources/source/')
               or re.search(r'(^|/)(zhezhi-corresponding-source|[^/]*-Source)\.(7z|zip)$', r['path'], re.I)
               or r['path'].startswith('resources/legal/') and
               (r['path'].lower().endswith(('.7z', '.zip')) or PurePosixPath(r['path']).name in {'BUILD-INFO.json', 'SOURCE-MANIFEST.json'})]
    if sources:
        raise ValueError(f'Runtime must not embed corresponding source archives or source build records: {sources[:12]}')
    names = {r['path'] for r in rows}
    for required in ['zhezhi-workbench-tauri.exe', 'resources/runtime-layout.json', 'resources/dist/index.html',
                     'resources/engine/zhezhi-tess.exe', 'resources/legal/LICENSE',
                     'resources/legal/THIRD_PARTY_NOTICES.md', 'resources/legal/SOURCE-AVAILABILITY.json',
                     'resources/legal/SOURCE-AVAILABILITY.txt', 'resources/legal/licenses/RUST-PACKAGES.json',
                     'resources/legal/licenses/NPM-PACKAGES.json']:
        if required not in names:
            raise ValueError(f'Required runtime resource missing: {required}')
    return 'resources/legal/SOURCE-AVAILABILITY.json'


def verify_source_delivery(unpacked, metadata_path):
    availability = json.loads((unpacked / metadata_path).read_text(encoding='utf-8-sig'))
    release_id = availability.get('id', '')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*', release_id):
        raise ValueError('Invalid corresponding-source release identifier')
    layout = json.loads((unpacked/'resources/runtime-layout.json').read_text(encoding='utf-8-sig'))
    if release_id != f"{layout['version']}-{layout['candidate']}" or availability.get('runtimeRequiresSource') is not False:
        raise ValueError('Runtime and independent source versions do not match')
    if availability.get('distribution') != 'same-release-location':
        raise ValueError('Missing equivalent source delivery instructions')
    directory = ROOT/'build/source-tauri'/release_id
    report = json.loads((directory/'SOURCE-VERIFICATION.json').read_text(encoding='utf-8-sig'))
    if not report.get('zipAnd7zVerified') or report.get('sourceDelivery') != 'separate-release-attachments':
        raise ValueError('Independent source archives have not been verified')
    expected = [{'format': fmt, **{key: entry[key] for key in ['file', 'bytes', 'sha256']}}
                for fmt, entry in report['archives'].items()]
    if sorted(availability.get('archives', []), key=lambda a: a['format']) != sorted(expected, key=lambda a: a['format']):
        raise ValueError('Bundled source references differ from independently verified attachments')
    for entry in expected:
        name = safe_relative(entry['file'])
        if '/' in name or '\\' in name:
            raise ValueError('Source attachment must have a flat release filename')
        archive = directory/name
        if archive.stat().st_size != entry['bytes'] or digest_region(archive) != entry['sha256']:
            raise ValueError('Source attachment no longer matches the application reference')
    if inventory(unpacked/'resources/legal') != normalized_manifest(report['legalFiles']):
        raise ValueError('Application license files differ from the complete verified license collection')
    return availability


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['payload', 'setup', 'portable', 'manifest', 'output']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--seven', default=str(ROOT/'node_modules/7zip-bin/win/x64/7za.exe'))
    parser.add_argument('--engine-report', help='Verified current engine report, required when the engine was rebuilt')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if not output.is_relative_to(ROOT/'output'):
        raise ValueError('Evidence output must remain below the migration project output/')
    output.parent.mkdir(parents=True, exist_ok=True)
    extraction = output.parent / ('bundle-extraction-' + uuid.uuid4().hex[:12])
    extraction.mkdir()
    report = {'passed': False, 'extractionDirectory': str(extraction), 'checks': []}
    try:
        inputs = {name: Path(getattr(args, name)).resolve() for name in ['payload', 'setup', 'portable', 'manifest']}
        for name, file in inputs.items():
            if not file.is_file():
                raise ValueError(f'Missing {name}: {file}')
        seven = Path(args.seven).resolve()
        if not seven.is_file():
            raise ValueError('7za tool missing')
        environment = dict(os.environ, TEMP=str(extraction), TMP=str(extraction))
        expected = normalized_manifest(json.loads(inputs['manifest'].read_text(encoding='utf-8-sig')))
        source_metadata = runtime_policy(expected)
        external = inspect_header(inputs['payload'], 0)
        if external['archiveBytes'] != inputs['payload'].stat().st_size:
            raise ValueError('External payload contains bytes beyond the declared 7z archive range')
        payload_hash = digest_region(inputs['payload'])
        report['payload'] = {'path': str(inputs['payload']), 'sha256': payload_hash, **external}
        report['manifest'] = {'path': str(inputs['manifest']), 'sha256': digest_region(inputs['manifest']), 'files': len(expected), 'totalBytes': sum(r['bytes'] for r in expected)}
        properties, listed = archive_listing(seven, inputs['payload'], extraction/'payload-list.log', environment)
        if listed != {r['path']: r['bytes'] for r in expected}:
            raise ValueError('7z listing paths/sizes differ from frozen payload manifest')
        report['compression'] = properties
        report['checks'].append('external payload start/next-header CRC, declared range and actual solid LZMA2:26 verified')
        run_seven(seven, ['t', str(inputs['payload'])], extraction/'payload-test.log', environment)
        report['bundles'] = {}
        original_engine = inventory(ROOT/'build/tessellation/zhezhi-tess')
        if args.engine_report:
            engine_report = json.loads(Path(args.engine_report).read_text(encoding='utf-8-sig'))
            if not engine_report.get('passed') or normalized_manifest(engine_report['engineManifest']) != original_engine:
                raise ValueError('Current engine differs from verified engine report')
        elif len(original_engine) != 195:
            raise ValueError('Engine file count changed; provide a verified current engine report')
        groups = {'host': 0, 'frontend': 0, 'engine': 0, 'legal': 0, 'other': 0}
        for row in expected:
            name = row['path']
            group = 'host' if name == 'zhezhi-workbench-tauri.exe' else 'frontend' if name.startswith('resources/dist/') else 'engine' if name.startswith('resources/engine/') else 'legal' if name.startswith('resources/legal/') else 'other'
            groups[group] += row['bytes']
        report['unpackedGroupsBytes'] = groups
        for kind in ['setup', 'portable']:
            archive = extraction / (kind + '-embedded.7z')
            detail = extract_matching_archive(inputs[kind], archive, payload_hash, external['archiveBytes'])
            report['bundles'][kind] = detail
            run_seven(seven, ['t', str(archive)], extraction/(kind+'-test.log'), environment)
            unpacked = extraction / (kind + '-unpacked')
            unpacked.mkdir()
            run_seven(seven, ['x', str(archive), '-o'+str(unpacked), '-y'], extraction/(kind+'-extract.log'), environment)
            actual = inventory(unpacked)
            if actual != expected:
                by_expected = {r['path']: r for r in expected}
                by_actual = {r['path']: r for r in actual}
                differences = [name for name in sorted(by_expected.keys() | by_actual.keys()) if by_expected.get(name) != by_actual.get(name)]
                raise ValueError(f'{kind} extraction differs from frozen manifest: {differences[:12]}')
            runtime_policy(actual)
            source_delivery = verify_source_delivery(unpacked, source_metadata)
            engine = inventory(unpacked/'resources/engine')
            if engine != original_engine:
                raise ValueError(f'{kind} engine differs from complete validated build engine')
            detail.update({'unpacked': str(unpacked), 'filesVerified': len(actual), 'bytesVerified': sum(r['bytes'] for r in actual),
                           'allFileSHA256Match': True, 'engineFilesVerified': len(engine), 'engineByteIdentical': True,
                           'sourceAvailability': source_delivery, 'sourceArchiveCount': 0,
                           'independentSourceAttachmentsVerified': True, 'runtimePolicyPassed': True})
            report['checks'].append(f'{kind}: exactly one CRC-valid embedded payload matches external SHA256; 7za test and full extraction manifest verified')
        report['samePayloadInBothExecutables'] = True
        report['passed'] = True
        print(json.dumps({'passed': True, 'compression': properties.get('Method'), 'solid': properties.get('Solid'), 'files': len(expected), 'unpackedBytes': sum(r['bytes'] for r in expected), 'payloadSha256': payload_hash, 'evidence': str(output)}, ensure_ascii=False, indent=2))
    except Exception as error:
        report['error'] = str(error)
        report['traceback'] = traceback.format_exc()
        print(report['error'], file=sys.stderr)
        raise
    finally:
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
