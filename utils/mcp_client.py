import os
import json
import time
import subprocess
import select
import shutil
import queue
import threading
import requests

def readline_with_timeout(stream, timeout):
    """
    Read a line from stream with a given timeout using select.
    Only works on POSIX (Mac/Linux), which is fine for the user's Mac environment.
    """
    ready_to_read, _, _ = select.select([stream], [], [], timeout)
    if ready_to_read:
        return stream.readline()
    return None

def extract_json_from_sse_body(body_text):
    """
    Extracts the JSON payload from SSE event stream raw text or returns raw JSON if not SSE.
    """
    if not body_text:
        return None
    for line in body_text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                return json.loads(line[5:].strip())
            except json.JSONDecodeError:
                pass
    try:
        return json.loads(body_text)
    except json.JSONDecodeError:
        return None

def fetch_stdio_tools(command, args, env=None, timeout=6):
    if not command:
        return [], "启动命令为空"

    resolved_command = shutil.which(command) or command
    cmd = [resolved_command] + args

    proc_env = os.environ.copy()
    if env:
        proc_env.update({k: str(v) for k, v in env.items() if v is not None})

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1, # Line buffered
            env=proc_env
        )
    except FileNotFoundError:
        try:
            cmd_str = f"{command} " + " ".join([f'"{arg}"' if " " in arg else arg for arg in args])
            proc = subprocess.Popen(
                cmd_str,
                shell=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=proc_env
            )
        except Exception as e:
            return [], f"启动命令失败: {str(e)}"
    except Exception as e:
        return [], f"启动命令失败: {str(e)}"

    tools = []
    error_msg = None
    try:
        init_req = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "id": 1,
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "O-Doc-Client", "version": "1.0.0"}
            }
        }
        proc.stdin.write(json.dumps(init_req) + "\n")
        proc.stdin.flush()

        init_success = False
        start_time = time.time()
        while time.time() - start_time < timeout:
            line = readline_with_timeout(proc.stdout, 1.0)
            if not line:
                if proc.poll() is not None:
                    err = proc.stderr.read()
                    error_msg = f"服务启动异常退出 (code {proc.returncode})，错误信息: {err.strip()}"
                    break
                continue
            
            try:
                data = json.loads(line)
                if data.get("id") == 1:
                    init_success = True
                    break
            except json.JSONDecodeError:
                continue

        if not init_success:
            if not error_msg:
                r, _, _ = select.select([proc.stderr], [], [], 0.1)
                stderr_content = proc.stderr.read() if r else ""
                if stderr_content:
                    error_msg = f"服务响应初始化超时，错误日志: {stderr_content.strip()}"
                else:
                    error_msg = "初始化响应超时或无效，请检查命令及参数配置是否正确。"
        else:
            init_notif = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            }
            proc.stdin.write(json.dumps(init_notif) + "\n")
            proc.stdin.flush()

            list_req = {
                "jsonrpc": "2.0",
                "method": "tools/list",
                "id": 2,
                "params": {}
            }
            proc.stdin.write(json.dumps(list_req) + "\n")
            proc.stdin.flush()

            list_success = False
            start_time = time.time()
            while time.time() - start_time < timeout:
                line = readline_with_timeout(proc.stdout, 1.0)
                if not line:
                    if proc.poll() is not None:
                        err = proc.stderr.read()
                        error_msg = f"服务在获取 Tools 时退出，错误: {err.strip()}"
                        break
                    continue

                try:
                    data = json.loads(line)
                    if data.get("id") == 2:
                        tools = data.get("result", {}).get("tools", [])
                        list_success = True
                        break
                except json.JSONDecodeError:
                    continue

            if not list_success and not error_msg:
                error_msg = "获取 Tools 列表超时"

    except Exception as e:
        error_msg = f"与 MCP 服务通信异常: {str(e)}"
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=1.5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    formatted_tools = []
    for tool in tools:
        if isinstance(tool, dict) and 'name' in tool:
            formatted_tools.append({
                'name': tool['name'],
                'description': tool.get('description') or '',
                'inputSchema': tool.get('inputSchema') or {},
                'enabled': True
            })

    return formatted_tools, error_msg

def fetch_sse_tools(url, headers=None, timeout=8):
    # First, try Streamable HTTP direct POST flow, which works for Spring AI and other HTTP-based MCP servers
    session = requests.Session()
    if headers:
        session.headers.update(headers)
    session.headers.update({
        "Accept": "text/event-stream, application/json"
    })

    try:
        init_req = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "id": 1,
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "O-Doc-Client", "version": "1.0.0"}
            }
        }
        res = session.post(url, json=init_req, timeout=timeout)
        res.encoding = 'utf-8'
        
        session_id = None
        for k, v in res.headers.items():
            if k.lower() == 'mcp-session-id':
                session_id = v
                break
        
        if res.status_code == 200 and session_id:
            # Step 2: POST notifications/initialized
            notif_req = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            }
            session.headers.update({"Mcp-Session-Id": session_id})
            session.post(url, json=notif_req, timeout=timeout)

            # Step 3: POST tools/list
            tools_req = {
                "jsonrpc": "2.0",
                "method": "tools/list",
                "id": 2,
                "params": {}
            }
            res_tools = session.post(url, json=tools_req, timeout=timeout)
            res_tools.encoding = 'utf-8'
            
            data = extract_json_from_sse_body(res_tools.text)
            if data:
                tools = data.get("result", {}).get("tools", [])
                formatted_tools = []
                for tool in tools:
                    if isinstance(tool, dict) and 'name' in tool:
                        formatted_tools.append({
                            'name': tool['name'],
                            'description': tool.get('description') or '',
                            'inputSchema': tool.get('inputSchema') or {},
                            'enabled': True
                        })
                return formatted_tools, None
    except Exception as e:
        # Fallback to standard Server-Sent Events stream listener if direct POST fails
        pass

    # Standard SSE Fallback flow
    session = requests.Session()
    if headers:
        session.headers.update(headers)

    msg_queue = queue.Queue()
    stop_event = threading.Event()
    post_url_container = [None]

    def sse_listener():
        try:
            # Enforce Accept event-stream
            response = session.get(url, headers={"Accept": "text/event-stream"}, stream=True, timeout=timeout)
            response.raise_for_status()
            
            current_event = None
            for line in response.iter_lines():
                if stop_event.is_set():
                    break
                if not line:
                    continue
                # Enforce UTF-8 line decoding
                line_str = line.decode('utf-8', errors='ignore').strip()
                if line_str.startswith('event:'):
                    current_event = line_str[6:].strip()
                elif line_str.startswith('data:'):
                    data_str = line_str[5:].strip()
                    if current_event == 'endpoint':
                        from urllib.parse import urljoin
                        post_url_container[0] = urljoin(url, data_str)
                    elif current_event == 'message' or not current_event:
                        try:
                            msg_data = json.loads(data_str)
                            msg_queue.put(msg_data)
                        except json.JSONDecodeError:
                            pass
                    current_event = None
        except Exception as e:
            msg_queue.put({"error": str(e)})

    t = threading.Thread(target=sse_listener)
    t.daemon = True
    t.start()

    # Wait for endpoint url
    start_time = time.time()
    while post_url_container[0] is None and time.time() - start_time < 4:
        try:
            msg = msg_queue.get_nowait()
            if "error" in msg:
                stop_event.set()
                return [], f"SSE 建立连接失败: {msg['error']}"
        except queue.Empty:
            pass
        time.sleep(0.1)

    post_url = post_url_container[0]
    if not post_url:
        stop_event.set()
        return [], "无法获取 SSE 消息发送端点(endpoint)"

    tools = []
    error_msg = None
    try:
        # Step 1: initialize
        init_req = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "id": 1,
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "O-Doc-Client", "version": "1.0.0"}
            }
        }
        res = session.post(post_url, json=init_req, timeout=timeout)
        res.raise_for_status()

        init_success = False
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                msg = msg_queue.get(timeout=0.5)
                if "error" in msg:
                    error_msg = f"SSE 连接意外断开: {msg['error']}"
                    break
                if msg.get("id") == 1:
                    init_success = True
                    break
            except queue.Empty:
                continue

        if not init_success:
            if not error_msg:
                error_msg = "初始化 SSE 握手响应超时"
        else:
            # Step 2: notifications/initialized
            init_notif = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            }
            session.post(post_url, json=init_notif, timeout=timeout)

            # Step 3: tools/list
            list_req = {
                "jsonrpc": "2.0",
                "method": "tools/list",
                "id": 2,
                "params": {}
            }
            res = session.post(post_url, json=list_req, timeout=timeout)
            res.raise_for_status()

            list_success = False
            start_time = time.time()
            while time.time() - start_time < timeout:
                try:
                    msg = msg_queue.get(timeout=0.5)
                    if "error" in msg:
                        error_msg = f"SSE 连接意外断开: {msg['error']}"
                        break
                    if msg.get("id") == 2:
                        tools = msg.get("result", {}).get("tools", [])
                        list_success = True
                        break
                except queue.Empty:
                    continue

            if not list_success and not error_msg:
                error_msg = "拉取 SSE Tools 列表超时"
    except Exception as e:
        error_msg = f"与 SSE 服务交互失败: {str(e)}"
    finally:
        stop_event.set()

    formatted_tools = []
    for tool in tools:
        if isinstance(tool, dict) and 'name' in tool:
            formatted_tools.append({
                'name': tool['name'],
                'description': tool.get('description') or '',
                'inputSchema': tool.get('inputSchema') or {},
                'enabled': True
            })

    return formatted_tools, error_msg

def fetch_mcp_tools(mcp_server):
    """
    Connect to the MCP server described by the mcp_server instance and return (tools, error_message).
    """
    transport = mcp_server.transport
    if transport == 'stdio':
        return fetch_stdio_tools(
            command=mcp_server.command,
            args=mcp_server.args or [],
            env=mcp_server.env or {}
        )
    elif transport in ('sse', 'streamableHttp'):
        # Both SSE and StreamableHttp might point to standard http endpoints, 
        # so we unify their handling with our smart HTTP client.
        return fetch_sse_tools(
            url=mcp_server.url,
            headers=mcp_server.headers or {}
        )
    
    return [], f"不支持的传输方式: {transport}"
