from urllib.parse import urlparse


SUPPORTED_PROTOCOLS = ('webdav', 'ftp', 'sftp')
DEFAULT_PORTS = {
    'ftp': 21,
    'sftp': 22,
}


def normalize_protocol(value):
    protocol = (value or 'webdav').strip().lower()
    if protocol not in SUPPORTED_PROTOCOLS:
        raise ValueError(f'不支持的同步协议: {protocol}')
    return protocol


def get_remote_path(config):
    return (config.get('remote_path') or config.get('remotePath') or '').strip()


def parse_host_and_port(config, protocol):
    host = (config.get('host') or '').strip()
    raw_port = config.get('port')
    url = (config.get('url') or '').strip()

    if url:
        parsed = urlparse(url if '://' in url else f'{protocol}://{url}')
        if not host:
            host = parsed.hostname or ''
        if raw_port in (None, '') and parsed.port:
            raw_port = parsed.port
        if not host and parsed.path:
            host = parsed.path.split('/')[0].split(':')[0]

    try:
        port = int(raw_port) if raw_port not in (None, '') else DEFAULT_PORTS.get(protocol)
    except (TypeError, ValueError):
        port = DEFAULT_PORTS.get(protocol)

    return host, port


def default_sync_config():
    return {
        'enabled': False,
        'protocol': 'webdav',
        'url': '',
        'host': '',
        'port': None,
        'username': '',
        'password': '',
        'remote_path': '',
        'interval': 30,
        'use_tls': False,
        'passive': True,
        'private_key': '',
        'passphrase': '',
        'host_key': '',
    }


def normalize_sync_config(data):
    data = data or {}
    protocol = normalize_protocol(data.get('protocol'))
    interval_raw = data.get('interval', 30)
    try:
        interval = max(5, int(interval_raw))
    except (TypeError, ValueError):
        interval = 30

    if 'use_tls' in data:
        use_tls = bool(data.get('use_tls'))
    else:
        use_tls = bool(data.get('useTls', False))

    if 'passive' in data:
        passive = bool(data.get('passive'))
    else:
        passive = True

    config = {
        'enabled': bool(data.get('enabled', False)),
        'protocol': protocol,
        'url': (data.get('url') or '').strip(),
        'host': (data.get('host') or '').strip(),
        'port': data.get('port'),
        'username': data.get('username') or '',
        'password': data.get('password') or '',
        'remote_path': get_remote_path(data),
        'interval': interval,
        'use_tls': use_tls,
        'passive': passive,
        'private_key': data.get('private_key') or data.get('privateKey') or '',
        'passphrase': data.get('passphrase') or '',
        'host_key': data.get('host_key') or data.get('hostKey') or '',
    }

    if protocol in ('ftp', 'sftp'):
        host, port = parse_host_and_port(config, protocol)
        config['host'] = host
        config['port'] = port
        if host and not config['url']:
            scheme = 'ftps' if protocol == 'ftp' and config['use_tls'] else protocol
            config['url'] = f'{scheme}://{host}:{port}'

    if protocol == 'webdav':
        from utils.webdav import WebDavClient
        config['url'] = WebDavClient.normalize_base_url(config['url'])

    return config


def validate_sync_config(config):
    protocol = config.get('protocol') or 'webdav'
    username = (config.get('username') or '').strip()
    password = config.get('password') or ''

    if not (config.get('remote_path') or '').strip():
        raise ValueError('请填写远程路径，不要留空，以免写到错误的备份目录')

    if protocol == 'webdav':
        if not all([config.get('url'), username, password]):
            raise ValueError('请填写完整的 WebDAV 地址、用户名和密码')
        return config

    if protocol == 'ftp':
        if not all([config.get('host'), username, password]):
            raise ValueError('请填写完整的 FTP 主机、用户名和密码')
        return config

    if protocol == 'sftp':
        if not config.get('host') or not username:
            raise ValueError('请填写完整的 SFTP 主机和用户名')
        if not password and not (config.get('private_key') or '').strip():
            raise ValueError('请填写 SFTP 密码或私钥')
        return config

    raise ValueError(f'不支持的同步协议: {protocol}')


def destination_signature(config):
    config = normalize_sync_config(config)
    protocol = config['protocol']
    remote_path = (config.get('remote_path') or '').strip().rstrip('/')
    if protocol == 'webdav':
        return (protocol, config.get('url') or '', remote_path)
    return (protocol, config.get('host') or '', int(config.get('port') or DEFAULT_PORTS.get(protocol) or 0), remote_path)


def create_storage_client(config):
    config = normalize_sync_config(config)
    protocol = config['protocol']

    if protocol == 'webdav':
        from utils.webdav import WebDavClient
        return WebDavClient(config['url'], config['username'], config['password'])

    if protocol == 'ftp':
        from utils.ftp_client import FtpClient
        return FtpClient(
            host=config['host'],
            port=config['port'],
            username=config['username'],
            password=config['password'],
            use_tls=config.get('use_tls', False),
            passive=config.get('passive', True),
        )

    if protocol == 'sftp':
        from utils.sftp_client import SftpClient
        return SftpClient(
            host=config['host'],
            port=config['port'],
            username=config['username'],
            password=config['password'],
            private_key=config.get('private_key') or '',
            passphrase=config.get('passphrase') or '',
            known_host_key=config.get('host_key') or '',
        )

    raise ValueError(f'不支持的同步协议: {protocol}')


def public_sync_config(config):
    value = {**default_sync_config(), **(config or {})}
    value['remotePath'] = value.get('remote_path') or ''
    value['useTls'] = bool(value.get('use_tls', False))
    value['privateKey'] = value.get('private_key') or ''
    value['hostKey'] = value.get('host_key') or ''
    return value


def create_sync_manager(config):
    from utils.sync_manager import SyncManager
    remote_path = get_remote_path(config)
    if not remote_path:
        raise ValueError('请填写远程路径，不要留空，以免写到错误的备份目录')
    return SyncManager(create_storage_client(config), remote_path)
