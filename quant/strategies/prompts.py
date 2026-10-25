"""Versioned model instructions for explicit reference execution hypotheses."""
INITIAL = '''
本版本可在config选择显式strategy（若无合理执行假设则省略，仍使用旧做多/空仓模型）。strategy完整结构：{version:1,direction:"long_only",boolean_side:"long",short_entry_threshold:-1,long_exit_threshold:0,short_exit_threshold:0,position_fraction:0.5,stop_loss_fraction:null,take_profit_fraction:null,max_holding_bars:0,cooldown_bars:0,max_entries:1000,short_borrow_bps_per_bar:0,same_open_reversal:false}。这些示例数值不是推荐值。根据因子输出尺度、来源与研究假设明确给理由；不能把源码默认值、实际运行配置和AI实验假设混为一谈。
direction可为long_only/short_only/long_short；数值多头入场>config.threshold、退出<=long_exit_threshold；空头入场<short_entry_threshold、退出>=short_exit_threshold。退出阈值形成滞回：多退<=多入、空退>=空入，双向空入<多入。布尔true只触发boolean_side的允许方向，false空仓，不自动反向。必须选择有意义的尺度和信号；不能用原始价格>0冒充有效信号。
position_fraction在(0,1]，开仓按当时净值比例并在持有期保持固定分数数量。止损价格比例在(0,1)、止盈在(0,10)（允许做空时须小于1），停用明确null。持有上限/冷却0–2000柱（持有0不限），每段开仓1–2000次。每根持有柱做空借券费用0–500bps，仅是假设；同开盘反向要求冷却0。先平后开计两次单侧费用。
上一收盘信号在下一开盘决策；同柱止损止盈都触及时止损先行，跳空止损按开盘、止盈保守按目标价再计不利滑点和费用。止损止盈/持有期退出后同柱不重入。资金耗尽停止本段且保留负净值与缺口。它不是原平台策略执行：不模拟手数、保证金强平、借券可用性、停牌、成交量、涨跌停或T+1。无盘中路径不能宣称精确成交或最大回撤。
执行规则在本批固定，公式/参数搜索不优化此规则。若需比较两种仓位/止损/方向设置，提出分开运行和新的数据需求，不能声称本批已比较或得到最佳风控。买入持有对照沿用仓位和费用，停用信号退出、止损止盈、持有期和做空费用。
'''
REVIEW = '''
本实验使用strategy-v1固定执行假设，execution.config.strategy是实际模拟配置，不是源码默认值、原平台或实盘设置。execution.semantics和limitations约束所有结论。训练/验证的execution为完整汇总，留出/各折execution为汇总加有界成交样本，trades_omitted明确剩余数量；不是完整账本，也不能只据样本判断所有交易。金额以本段初始资金1归一，固定分数数量；手续费/借券费用分别报告。负净值、资金缺口、资金耗尽尝试和拒绝原因必须保留，不能截断为0损失。回撤只按开盘采样，不能声称盘中最大回撤、保证金强平、负余额保护或平台等价。
买入持有是同仓位同费用的单次多头对照，停用信号退出、止损止盈和持有期，不是同风险策略。execution的止损/费用记录仅说明按冻结假设模拟，未验证真实成交、借券可用性或风控有效性。公式/参数演化不改变策略规则，不能把收益变化归因于未比较过的止损或仓位。后续proposal继承本批完整执行配置；不同执行规则需要另外准备实验，不得在文本中声称已自动比较。
'''
