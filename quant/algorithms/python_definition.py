"""Ordinary Python algorithm documents. Parsing never imports or executes them."""
import ast
from rest_framework.exceptions import ValidationError


def validate_python(node):
    if not isinstance(node, dict) or set(node) != {'op', 'version', 'code'} or node.get('op') != 'python' or type(node.get('version')) is not int or node.get('version') != 1:
        raise ValidationError('Python算法需包含op=python、version=1和code')
    code = node['code']
    if not isinstance(code, str) or not code.strip():
        raise ValidationError('请提供完整Python计算代码')
    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError, RecursionError) as exc:
        raise ValidationError('Python计算代码存在语法错误：' + str(exc)[:300]) from exc
    if not any(isinstance(item, ast.FunctionDef) and item.name == 'compute' for item in tree.body):
        raise ValidationError('Python算法需提供compute(inputs, parameters=None)入口')
    return node


def qualification(data):
    from quant.research.contracts import digest
    from quant.parameters.domains import kind
    validate_python(data['expression'])
    from quant.verification.structure import qualification as check_declarations
    declarations = check_declarations({**data, 'expression':None})
    return {'version':1, 'candidate_hash':digest(data), 'scope':'portable_expression_declared_contract_only',
        'reuse_status':'reusable', 'checks':[{'code':'python_definition','status':'passed',
            'message':'完整Python实现已保存，可阅读、复用和导出；未在提取服务中执行。'}],
        'blockers':[], 'nodes':[], 'configuration':declarations['configuration'],
        'automatic_ohlcv_mapping':False, 'inputs_requiring_mapping':[], 'automatic_experiment_ready':False,
        'inputs':[{'name':r['name'],'used':True,'availability':r['availability'],'missing_policy':r['missing_policy']} for r in data['inputs']],
        'parameters':[{'name':r['name'],'used':True,'kind':kind(r) or 'unknown'} for r in data['parameters']],
        'external_dependencies':[{'name':name,'status':'declared_unverified_original_context'} for name in data['dependencies']],
        'platform_equivalence':'unverified','economic_effectiveness':'unassessed'}


INSTRUCTION = '''
从源码抽离可复用的计算算法，提供真实数据输入、参数和默认值、计算公式、中文逻辑解释及完整Python实现。
优先提取趋势、动量、波动、震荡、量价和条件算法。源码里的递推状态、历史数组、循环、自定义函数及初始化全部包含在实现中，不能冒充缺失的外部输入。
expression使用 {"op":"python","version":1,"code":"完整Python代码"}，入口def compute(inputs, parameters=None)，inputs是按时间升序的行情列数组字典，parameters覆盖源码默认参数，返回输出序列。
numeric_series每根返回一个数值，boolean_series每根返回一个布尔值；多个字段或字典仅作内部计算，compute选取与当前因子名称、单位对应的主输出。不要将逐根字典列表标成数值序列。价格周期秒数、最小跳动等标量元数据在inputs含义中明确说明，不冒充行情列。
把Pine函数换成真实Python函数，例如math.abs对应abs或math.fabs，不能直接照抄不存在的Python API。
parameters使用已提供参数目录的原名（例如pivotLen，不改成pivot_len），代码通过parameters读取同名键。eqTolPct、logDistMax等按行情或周期推导的内部量应完整计算；若抽成纯函数，其外部值属于inputs，不虚构为源码默认参数。只引用参数时使用{"name":"原名"}，默认值和约束由系统从源码参数记录补齐。
允许普通Python函数、类、循环、数组、递归、标准库、NumPy、Pandas等导入，不受JSON树算子、256步骤、12层分支、2000窗口等受控计算器限制。完整写出辅助函数与更新顺序，不能使用pass、TODO或省略号代替实现。依赖库写入dependencies。
源码中算法可计算就提取；无需先运行原平台、回测、评分或匹配本机实验引擎。不能以DSL不支持、递推、na初始化或未回测为由丢弃算法。
formula给出易读数学公式和步骤，summary解释计算对象与输出意义；code保存完整可复用代码。代码作为算法资产保存和导出，提取时不执行。
Pine的compiled_source_outputs目录给出已经能直接生成完整实现的输出，可使用 {"op":"source","name":"真实源码输出变量"}，由系统展开全部依赖和参数。目录外的计算直接转成Python。
来源引用使用原文。参数与输入遵循源码，保留原始初始化、时序和缺失值处理；不得为了满足某种算子表篡改公式。计算机制用于分类；市场与周期描述源码的计算条件，不虚构最佳收益。
'''
