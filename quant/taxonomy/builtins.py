"""Version-1 catalog is frozen. Future releases must keep this version readable."""
import unicodedata
DIMENSIONS = {'mechanism': '机制', 'structure': '时序与截面', 'asset': '资产', 'frequency': '频率',
              'data': '数据要求', 'usage': '用途', 'platform': '平台', 'tunability': '参数声明', 'evidence': '证据状态'}

ROWS = {
    'mechanism': [
        ('momentum', '动量', ['momentum', '动能', '動量'], '收益或价格延续方向的研究分类；标签不证明有效性。'),
        ('trend', '趋势', ['trend', '趨勢', '趋势跟随'], '趋势相关机制的研究分类。'),
        ('volatility', '波动率', ['volatility', '波動率', '波动'], '波动与离散程度相关研究分类。'),
        ('mean_reversion', '均值回归', ['mean reversion', 'mean_reversion', '反转', '均值回复'], '回归或反转机制的研究分类。'),
        ('volume', '量能', ['volume', '成交量', '量价'], '成交量及量价关系的研究分类。'),
        ('price_structure', '价格结构', ['price structure', 'price_structure', '价位结构'], '价格位置或形态结构相关分类。'),
        ('fundamental', '基本面', ['fundamental', 'fundamentals'], '基本面信息相关分类。'),
        ('other', '其他或未细分机制', ['other', '其他机制'], '既有机制字段尚未细分；不代表识别出明确机制。')],
    'structure': [('time_series', '时序', ['time series', 'time_series', '时间序列'], '分类提议为时序研究，不证明时序安全。'),
                  ('cross_section', '截面', ['cross sectional', 'cross_section', '横截面'], '分类提议为截面研究，不证明样本或数据可得口径。')],
    'asset': [('equity', '股票', ['equity', 'stocks', 'A股', '美股', '港股'], '股票相关材料标签，不证明适用任何具体市场。'),
              ('futures', '期货', ['futures'], '期货相关材料标签。'), ('fx', '外汇', ['forex', 'fx'], '外汇相关材料标签。'),
              ('crypto', '加密资产', ['crypto', 'cryptocurrency', '数字货币'], '加密资产相关材料标签。'),
              ('options', '期权', ['options'], '期权相关材料标签。'), ('fund', '基金', ['fund', 'ETF'], '基金相关材料标签。'),
              ('rates', '利率与债券', ['fixed income', '债券', '利率'], '利率或债券相关材料标签。')],
    'frequency': [('intraday', '日内', ['intraday'], '日内研究频率标签。'), ('daily', '日频', ['daily', '日线', '1d', 'D1'], '日频材料标签，不改变窗口含义。'),
                  ('weekly', '周频', ['weekly', '周线', '1w'], '周频材料标签。'), ('monthly', '月频', ['monthly', '月线'], '月频材料标签。'),
                  ('minute', '分钟级', ['minute', '分钟线'], '分钟级材料标签；具体分钟数仍以来源为准。'), ('tick', '逐笔或Tick', ['tick', '逐笔'], '逐笔相关材料标签。')],
    'data': [('ohlcv', 'OHLCV', ['ohlcv', '行情量价'], '标签声明使用价格和成交量，不证明数据完整性。'),
             ('price', '价格数据', ['price data', '价格'], '价格数据要求标签。'), ('fundamental', '财务基本面数据', ['financial data', '财务数据'], '财务数据要求标签。'),
             ('orderbook', '盘口数据', ['order book', 'orderbook', '盘口'], '盘口或订单簿要求标签。'),
             ('alternative', '另类数据', ['alternative data'], '另类数据要求标签。')],
    'usage': [('factor', '计算因子', ['factor', '计算模块'], '候选声明为独立计算模块。'), ('signal', '交易信号', ['signal', '信号'], '候选声明为信号模块，不等于完整策略。'),
              ('filter', '过滤条件', ['filter', '过滤器'], '候选声明为过滤模块。'), ('risk', '风险管理', ['risk', '风控'], '候选声明为风险相关模块。'),
              ('execution', '交易执行', ['execution', '执行模块'], '候选声明为执行相关模块；不授予下单权限。'), ('display', '可视化', ['display', '绘图'], '候选声明为显示模块。')],
    'platform': [('tradingview', 'TradingView', ['tradingview', 'TV'], '材料中声明的平台，不证明编译或运行通过。'),
                 ('tongdaxin', '通达信', ['tongdaxin', 'TDX'], '材料中声明的平台。'), ('joinquant', '聚宽', ['joinquant', 'JQ'], '材料中声明的平台；不能只凭 Python 语言认定。'),
                 ('mt4', 'MetaTrader 4', ['MT4', 'MetaTrader4'], '材料中声明的平台；不把指标自动归类为 EA。')],
    'tunability': [('signal', '有声明信号参数', [], '定义列出 signal 类参数；不是推荐参数或实际运行配置。'),
                  ('other', '仅列出其他参数', [], '定义列出显示、风险、执行或状态等参数。'),
                  ('none', '未列出参数', [], '候选定义中未列参数，不能据此证明原代码没有常量或动态状态。')],
    'evidence': [('static_unverified', '静态候选，未实证晋级', [], '候选自身是静态提取记录；不汇总或否定独立实验室中的其他证据。'),
                 ('authored_unverified', '作者定义，未实证晋级', [], '本版本是人工定义，不继承祖先源码、评分或实验表现。'),
                 ('local_simulation_unverified_platform', '本机衍生，原平台未验证', [], '本版本来自受控计算；不证明原平台等价、独立样本表现或实盘有效。')],
}


def catalog() -> dict:
    terms = []
    for dimension, rows in ROWS.items():
        for code, label, aliases, definition in rows:
            label = unicodedata.normalize('NFKC', label).strip()
            seen, normalized = {unicodedata.normalize('NFKC', label).casefold()}, []
            for alias in aliases:
                name = unicodedata.normalize('NFKC', alias).strip()
                if name.casefold() not in seen:
                    seen.add(name.casefold()); normalized.append(name)
            terms.append({'id': dimension + ':' + code, 'dimension': dimension, 'label': label,
                'aliases': normalized, 'definition': definition, 'active': True})
    return {'version': 1, 'builtin_version': 1, 'reason': '内置研究分类词表 v1',
        'terms': sorted(terms, key=lambda row: row['id'])}
