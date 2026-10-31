"""Frozen workflow 31/32 extraction prompt."""
PROGRAM_INSTRUCTION = '''
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
