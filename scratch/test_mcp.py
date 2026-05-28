import os
import django
import sys
import requests
import json

# Setup django environment
sys.path.append('/Users/zhouliangjun/Desktop/web_code/O-Doc')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'o_doc.settings')
django.setup()

url = "https://api.dev.tenfuli.tech/roadshow-management-service/mcp/meeting"
headers = {
    "x-api-key": "mcp_org_e5e61646c6f1a3f8c9fd508be7f2f526ebc085fd5c6b0fc68b17235b210308c3",
    "Accept": "text/event-stream, application/json"
}

session = requests.Session()
session.headers.update(headers)

print("POST initialize")
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

try:
    res = session.post(url, json=init_req, timeout=5)
    session_id = None
    for k, v in res.headers.items():
        if k.lower() == 'mcp-session-id':
            session_id = v
            break
            
    if session_id:
        # initialized
        notif_req = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}}
        session.headers.update({"Mcp-Session-Id": session_id})
        session.post(url, json=notif_req, timeout=5)
        
        # tools/list
        tools_req = {"jsonrpc": "2.0", "method": "tools/list", "id": 2, "params": {}}
        res_tools = session.post(url, json=tools_req, timeout=5)
        
        # FORCE UTF-8
        res_tools.encoding = 'utf-8'
        
        print("\nDecoded lines in body:")
        lines = res_tools.text.splitlines()
        print(f"Total lines: {len(lines)}")
        for idx, l in enumerate(lines):
            print(f"Line {idx}: Length {len(l)} | Start: {l[:100]} ... End: {l[-50:]}")
            
        # Try to parse
        def extract_json_from_sse_body(body_text):
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
                
        data = extract_json_from_sse_body(res_tools.text)
        if data:
            tools = data.get("result", {}).get("tools", [])
            print(f"\nSUCCESS! {len(tools)} tools found:")
            for t in tools:
                print(f"  - {t['name']}: {t.get('description', '')}")
        else:
            print("\nFAIL to parse.")
except Exception as e:
    print(f"Failed: {e}")
