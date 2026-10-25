"""Trusted PID 1. Never imports or evaluates uploaded source in this process."""
import hashlib
import json
import os
from pathlib import Path
import platform
import resource
import selectors
import signal
import subprocess
import sys
import time

PROTOCOL='python-source-process-v1'
MAX_INPUT=8*1024*1024
MAX_OUTPUT=1024*1024
CHILD=Path('/opt/odoc-native/source_child.py')


def environment():
    import importlib.metadata
    return {'protocol':PROTOCOL,'python':platform.python_version(),'machine':platform.machine(),
        'numpy':importlib.metadata.version('numpy'),'pandas':importlib.metadata.version('pandas'),
        'supervisor_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'child_sha256':hashlib.sha256(CHILD.read_bytes()).hexdigest()}


def emit(value):
    sys.stdout.write(json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n')


def execute(raw,seconds):
    # Root retains only SETUID/SETGID/KILL. Popen drops all child identities;
    # no-new-privileges prevents setuid executables from raising them again.
    process=subprocess.Popen([sys.executable,'-I',str(CHILD)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
        user=65532,group=65532,extra_groups=[],start_new_session=True,close_fds=True,umask=0o077)
    selector=selectors.DefaultSelector();sent=0;buffers={'stdout':bytearray(),'stderr':bytearray()}
    for name in buffers:
        stream=getattr(process,name);os.set_blocking(stream.fileno(),False)
        selector.register(stream,selectors.EVENT_READ,name)
    os.set_blocking(process.stdin.fileno(),False);selector.register(process.stdin,selectors.EVENT_WRITE,'stdin')
    deadline=time.monotonic()+seconds
    try:
        while selector.get_map():
            if time.monotonic()>=deadline:return {'status':'timed_out','reason':'source_wall_time_exceeded'}
            for key,_ in selector.select(timeout=.05):
                if key.data=='stdin':
                    try:
                        sent+=os.write(key.fd,raw[sent:sent+65536])
                    except BrokenPipeError:sent=len(raw)
                    if sent==len(raw):selector.unregister(key.fileobj);key.fileobj.close()
                else:
                    chunk=os.read(key.fd,65536)
                    if not chunk:selector.unregister(key.fileobj);continue
                    buffers[key.data].extend(chunk)
                    if sum(map(len,buffers.values()))>MAX_OUTPUT:return {'status':'output_limited','reason':'source_output_exceeded'}
        code=process.wait(timeout=max(.01,deadline-time.monotonic()))
        if code:return {'status':'failed','reason':'source_process_failed','exit_code':code}
        try:
            result=json.loads(buffers['stdout'])
        except (ValueError,UnicodeError):return {'status':'failed','reason':'invalid_source_output'}
        return {'status':'completed','result':result}
    except subprocess.TimeoutExpired:return {'status':'timed_out','reason':'source_wall_time_exceeded'}
    finally:
        # If source descendants escape their process group, PID 1 exiting still
        # destroys this private PID namespace; nothing survives the container.
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        process.wait();selector.close()


def main():
    if sys.argv[1:]==['--probe']:emit(environment());return
    raw=sys.stdin.buffer.read(MAX_INPUT+1)
    if len(raw)>MAX_INPUT:emit({'protocol':PROTOCOL,'status':'failed','reason':'input_exceeded'});return
    try:
        request=json.loads(raw);seconds=request['seconds']
        if type(seconds) is not int or not 1<=seconds<=30:raise ValueError('invalid budget')
        result=execute(raw,seconds)
    except (KeyError,ValueError,TypeError):result={'status':'failed','reason':'invalid_request'}
    emit({'protocol':PROTOCOL,**result})


if __name__=='__main__':main()
