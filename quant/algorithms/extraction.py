"""Close source variables before publishing algorithms; incomplete fragments stay in the source report."""
import copy
import re
from rest_framework.exceptions import ValidationError
from .pine import compile_output
from .presentation import program_text
from .contract import validate_program


def resolve(factors, payload, parameters, *, python_algorithms=False):
    result, failures = [], []
    for original in factors:
        factor = copy.deepcopy(original)
        node = factor.get('expression')
        try:
            if python_algorithms and not node:
                found = re.search(r'```python\s*\n(.*?)```', factor.get('formula', ''), re.S)
                if found:
                    node = factor['expression'] = {'op':'python', 'version':1, 'code':found.group(1)}
            if not node: raise ValueError('本模块未完成算法转换，未收入算法库')
            if python_algorithms and node.get('op') == 'python':
                from .python_definition import validate_python
                validate_python(node)
                result.append(factor)
                continue
            if node.get('op') == 'program' and payload.get('language') == 'pine' and re.fullmatch(r'[A-Za-z_]\w*', str(node.get('output', ''))):
                try:
                    compile_output(payload.get('code', ''), node['output'], factor['output_type'])
                except ValueError:
                    pass  # Explicit model conversion of a construct outside the source compiler.
                else:
                    node = {'op': 'source', 'name': node['output']}
            if node.get('op') == 'source':
                if set(node) != {'op', 'name'} or not isinstance(node['name'], str): raise ValueError('须指定源码输出变量')
                if payload.get('language') != 'pine': raise ValueError('此平台请给出闭合的统一算法步骤')
                program, inputs, required = compile_output(payload.get('code', ''), node['name'], factor['output_type'])
                chosen = []
                for name in required:
                    matches = [row for row in parameters if row.get('source_binding', {}).get('source_name', row['name']) == name]
                    if len(matches) != 1: raise ValueError('参数目录没有唯一对应的源码输入：' + name)
                    chosen.append(copy.deepcopy(matches[0]))
                mapping = {row.get('source_binding', {}).get('source_name', row['name']): row['name'] for row in chosen}
                from .renaming import rename_program
                factor['expression'] = rename_program(program, mapping)
                factor['parameters'] = chosen
                factor['inputs'] = [{'name': name, 'meaning': {'close': 'K线收盘价', 'open': 'K线开盘价', 'high': 'K线最高价', 'low': 'K线最低价', 'volume': 'K线成交量'}[name],
                    'availability': '本根K线数据完成后', 'missing_policy': '按源码的 na/nz、初始化及窗口规则处理'} for name in inputs]
                factor['formula'] = '```python\n' + program_text(factor['expression']) + '\n```'
                factor['dependencies'] = ['统一逐根算法标准函数；全部内部状态已随算法保存']
            declared_in_source = set(re.findall(r'(?m)^\s*(?:(?:var|float|double|int|bool)\s+)*(\w+)\s*(?::=|=(?!=))', payload.get('code', '')))
            internal_inputs = {row['name'] for row in factor['inputs']} & declared_in_source - {'open', 'high', 'low', 'close', 'volume'}
            if internal_inputs:
                raise ValueError('源码内部变量须展开其上游计算，不能作为外部输入：' + '、'.join(sorted(internal_inputs)))
            if factor['expression'].get('op') == 'program':
                validate_program(factor['expression'], {row['name'] for row in factor['inputs']}, {row['name'] for row in factor['parameters']})
            else:
                from quant.factors.expression import validate_expression
                validate_expression(factor['expression'], {row['name'] for row in factor['inputs']}, {row['name'] for row in factor['parameters']})
            result.append(factor)
        except (ValueError, TypeError, KeyError, ValidationError) as exc:
            failures.append(str(factor.get('name', '模块')) + '：' + str(exc))
    return result, failures


INSTRUCTION = '''
本次目标是建立可复用的因子算法库。沿源码向上追踪全部计算依赖，直到行情/外部数据和真正的用户参数。
expression 必须是完整计算定义，不能填 null。递推状态、历史索引、na初始化、EMA/RSI均可由下面的source/program表示，未调用原平台编译器不妨碍提取。
compiled_source_outputs 是系统已从本次源码成功编译的输出目录，列出真实输入、所需参数和输出类型。优先从中选择有独立用途的输出并使用source引用；不能声称这些输出无法转换。目录只是计算事实，不是完整源码能力清单，目录外的实现仍可按源码展开为program。
不能把 estimate、testStatistic、isAnomaly 等源码内部状态当成外部数据，不能只提取告警文案或一个布尔条件而丢掉其上游计算。
优先提取核心的趋势、动量、震荡/均值回复、波动率、量价算法；信号条件保留完整上游计算，图形/标签/订单外壳不作为算法。
每项解释入参、参数默认值、计算步骤、输出含义、单位和实际计算周期。提取完成的算法才收入库；无法转换的模块在 extraction_note 写清具体函数/源码位置与原因。
Pine中相关源码若含自定义函数、数组或循环，应读完已提供的函数体后直接展开为program；不要把函数名当作数据输入。
Pine 的普通命名数值/布尔输出优先用 expression={"op":"source","name":"源码实际输出变量名"}，系统会从完整源码编译其依赖闭包、参数、历史引用和初始化；例如 name="surpriseMeter"，不要自己截断内部状态。
其他语言或需要显式转换的算法可使用统一逐根程序：expression={"op":"program","version":1,"output_type":"numeric_series或boolean_series","output":"输出变量或计算式","steps":[...]}。
步骤为 {"kind":"initialize","name":"跨bar状态名","value":"初始Python计算式"}、{"kind":"assign","name":"变量名","value":"Python计算式"}，或 {"kind":"if","test":"条件计算式","then":[步骤],"else":[步骤]}。
initialize 只在首根执行，其变量随后跨bar保留；assign 按原始顺序逐根执行。先检验后更新的源码必须保留先后次序。
计算式只含有限数值、True/False、na、声明输入/参数/此前已赋值变量、+ - * / % **、大小比较、and/or/not、Python条件表达式，以及标准函数。
标准函数：abs/sqrt/pow/min/max/log/exp/is_na/nz/int/float；history("变量名",正整数或窗口参数)读取前面bar；sma/rolling_sum/std/highest/lowest/ema/rma/rsi(value,window)，crossover/crossunder(a,b)。窗口最多2000。
ema 首个有效值初始化，rma 用完整窗口均值初始化后按1/window递推，rsi 用涨跌的 Wilder 均值；std 为总体标准差。需要其他语义须自行按源码展开为步骤，不用近似函数替代。
steps最多256，条件深度12；无导入、属性、脚本、函数定义、任意循环。program 中的输入/参数使用本项声明的名称；所有当前变量须先定义，history须指向已声明变量。
简单计算也可用树节点 {op:"input",name}、{op:"parameter",name}、{op:"constant",value} 或 {op,args:[节点]}。树算子包括abs/neg/log、add/sub/mul/div/min/max/gt/lt/eq/and/or、lag/sma/sum/std/highest/lowest/ts_rank及gate(value,condition)；窗口第二项为正整数常量或参数，gate条件为假时输出缺失。EMA/RSI/递推使用program，不添加树算子。树最多128节点、深度12。
formula给出易读公式或相同的Python计算步骤，summary用中文解释该算法到底计算什么。family只描述计算机制，不把异常波动强行写成预测上涨。
市场/周期：写清源码实际限制及参数窗口；价格序列通用算法说明可随输入K线周期计算，不捏造最佳市场、最佳周期或收益。
'''
