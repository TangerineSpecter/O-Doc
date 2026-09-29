"""独立进程查询 BaoStock，隔离 SDK 全局 socket；父进程负责硬超时。"""
import contextlib
import io
import json
import socket
import sys


def main():
    socket.setdefaulttimeout(12)
    import baostock as bs
    args = json.loads(sys.stdin.read())
    method = args['method']
    allowed = {'query_trade_dates', 'query_stock_basic', 'query_all_stock', 'query_stock_industry', 'query_history_k_data_plus'}
    if method not in allowed:
        raise ValueError('不支持的行情方法')
    # The SDK prints login/error messages; stdout is reserved for the JSON contract.
    with contextlib.redirect_stdout(io.StringIO()):
        login = bs.login()
        if login.error_code != '0':
            raise ValueError('BaoStock 登录失败')
        try:
            result = getattr(bs, method)(**args.get('arguments', {}))
            rows = []
            while result.error_code == '0' and result.next():
                rows.append(dict(zip(result.fields, result.get_row_data())))
            if result.error_code != '0':
                raise ValueError('BaoStock 查询失败')
        finally:
            bs.logout()
    sys.stdout.write(json.dumps({'rows': rows}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stdout.write(json.dumps({'error': 'BaoStock 行情查询失败'}))
        sys.exit(1)
