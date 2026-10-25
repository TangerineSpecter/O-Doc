"""Bounded Docker client. No shell, host mounts, image pulls or source imports."""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
import uuid

PROTOCOL='python-source-process-v1'
DEFAULT_IMAGE='odoc-quant-python:1'
IMAGE=Path(__file__).with_name('image')
MAX_INPUT=8*1024*1024
MAX_OUTPUT=1024*1024
LIMITS={'memory_mib':256,'cpus':1,'pids':32,'tmp_mib':32,'maximum_seconds':30,
    'network':'none','root_filesystem':'read_only','source_uid':65532,'host_mounts':False}


class RuntimeUnavailable(Exception):pass


def _docker(arguments,seconds=5):
    try:
        result=subprocess.run(['docker',*arguments],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=seconds,check=False)
    except (OSError,subprocess.TimeoutExpired) as error:raise RuntimeUnavailable('docker_unavailable') from error
    if result.returncode or len(result.stdout)>MAX_OUTPUT:raise RuntimeUnavailable('docker_operation_unavailable')
    return result.stdout


def image_info(name=DEFAULT_IMAGE):
    if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,199}',name):raise RuntimeUnavailable('invalid_image_reference')
    try:values=json.loads(_docker(['image','inspect',name]))
    except (ValueError,RuntimeUnavailable) as error:raise RuntimeUnavailable('runner_image_unavailable') from error
    if (not isinstance(values,list) or len(values)!=1 or values[0].get('Os')!='linux'
            or not re.fullmatch(r'sha256:[0-9a-f]{64}',values[0].get('Id',''))
            or values[0].get('Config',{}).get('Labels',{}).get('org.odoc.quant.native.protocol')!=PROTOCOL):
        raise RuntimeUnavailable('runner_image_contract_mismatch')
    return {'image_id':values[0]['Id'],'os':'linux','architecture':values[0]['Architecture']}


def command(image_id,name,token,*,probe=False):
    if (not re.fullmatch(r'sha256:[0-9a-f]{64}',image_id) or not re.fullmatch(r'odoc-native-[0-9a-f]{32}',name)
            or not re.fullmatch(r'[0-9a-f]{32}',token)):raise ValueError('Invalid local execution identity')
    return ['docker','run','--rm','--pull=never','--name',name,'--label',f'org.odoc.quant.native.token={token}',
        '--label',f'org.odoc.quant.native.protocol={PROTOCOL}','--network=none','--read-only','--ipc=none',
        '--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID','--cap-add=KILL',
        '--security-opt=no-new-privileges:true','--pids-limit=32','--cpus=1','--memory=256m','--memory-swap=256m',
        '--ulimit','nofile=128:128','--ulimit','core=0:0','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
        '--log-driver=none','--entrypoint','python','-i',image_id,'-I','/opt/odoc-native/supervisor.py',*(['--probe'] if probe else [])]


def cleanup(name,token):
    """Never remove a container merely because its name has our prefix."""
    if not re.fullmatch(r'odoc-native-[0-9a-f]{32}',name) or not re.fullmatch(r'[0-9a-f]{32}',token):return
    try:
        values=json.loads(_docker(['container','inspect',name],seconds=3))
        labels=values[0].get('Config',{}).get('Labels',{})
        if labels.get('org.odoc.quant.native.token')==token and labels.get('org.odoc.quant.native.protocol')==PROTOCOL:
            _docker(['container','rm','--force',name],seconds=5)
    except (RuntimeUnavailable,ValueError,IndexError,KeyError):pass


def _communicate(arguments,raw,name,token,seconds,check):
    process=subprocess.Popen(arguments,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,close_fds=True)
    selector=selectors.DefaultSelector();buffers={'stdout':bytearray(),'stderr':bytearray()};sent=0
    for field in buffers:
        stream=getattr(process,field);os.set_blocking(stream.fileno(),False);selector.register(stream,selectors.EVENT_READ,field)
    os.set_blocking(process.stdin.fileno(),False);selector.register(process.stdin,selectors.EVENT_WRITE,'stdin')
    deadline=time.monotonic()+seconds
    try:
        while selector.get_map():
            check()
            if time.monotonic()>=deadline:raise TimeoutError('native_host_wall_time_exceeded')
            for key,_ in selector.select(timeout=.1):
                if key.data=='stdin':
                    try:sent+=os.write(key.fd,raw[sent:sent+65536])
                    except BrokenPipeError:sent=len(raw)
                    except BlockingIOError:continue
                    if sent==len(raw):selector.unregister(key.fileobj);key.fileobj.close()
                else:
                    chunk=os.read(key.fd,65536)
                    if not chunk:selector.unregister(key.fileobj);continue
                    buffers[key.data].extend(chunk)
                    if sum(map(len,buffers.values()))>MAX_OUTPUT:raise ValueError('native_container_output_exceeded')
        code=process.wait(timeout=max(.01,deadline-time.monotonic()))
        if code:raise RuntimeUnavailable('native_container_failed')
        try:return json.loads(buffers['stdout'])
        except (ValueError,UnicodeError) as error:raise RuntimeUnavailable('native_runner_invalid_output') from error
    finally:
        cleanup(name,token)
        if process.poll() is None:process.kill()
        process.wait();selector.close()


def probe(name=DEFAULT_IMAGE):
    info=image_info(name);token=uuid.uuid4().hex;container='odoc-native-'+token
    try:value=_communicate(command(info['image_id'],container,token,probe=True),b'',container,token,8,lambda:None)
    except (OSError,ValueError,TimeoutError,subprocess.TimeoutExpired) as error:raise RuntimeUnavailable('runner_probe_unavailable') from error
    expected={name:hashlib.sha256((IMAGE/file).read_bytes()).hexdigest() for name,file in
        [('supervisor_sha256','supervisor.py'),('child_sha256','source_child.py')]}
    if (not isinstance(value,dict) or value.get('protocol')!=PROTOCOL or not str(value.get('python','')).startswith('3.11.')
            or value.get('numpy')!='2.3.4' or value.get('pandas')!='2.3.3'
            or any(value.get(key)!=digest for key,digest in expected.items())):
        raise RuntimeUnavailable('runner_rebuild_required')
    return {**info,'runtime':value,'limits':LIMITS.copy()}


def run(payload,environment,*,check=lambda:None):
    raw=json.dumps(payload,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()
    if len(raw)>MAX_INPUT or type(payload.get('seconds')) is not int or not 1<=payload['seconds']<=30:
        raise ValueError('Invalid native payload size or wall budget')
    token=uuid.uuid4().hex;name='odoc-native-'+token
    check()
    value=_communicate(command(environment['image_id'],name,token),raw,name,token,payload['seconds']+8,check)
    if not isinstance(value,dict) or value.get('protocol')!=PROTOCOL:raise RuntimeUnavailable('native_runner_invalid_output')
    return value
