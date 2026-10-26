"""Python 3.11 syntax facts: function defaults and uppercase module literals."""
import ast
from itertools import islice
from .source_values import python_node, UNKNOWN


class DeclarationLimit(ValueError):
    pass


def parse(code: str) -> tuple[list[dict],list[str],str]:
    try:tree=ast.parse(code,feature_version=(3,11))
    except (SyntaxError,ValueError,RecursionError,MemoryError):
        return [],['Python语法无法完整解析；所有运行参数保持未解决，不执行源码。'],'unparsed'
    nodes=list(islice(ast.walk(tree),20001))
    if len(nodes)>20000:return [],['Python语法节点超过20000项；不使用截断声明。'],'limited'
    rows=[]
    def add(name,default,scope,role,quote_node,annotation=None,span_end=None):
        value=python_node(default) if default is not None else dict(UNKNOWN)
        hinted=annotation.id if isinstance(annotation,ast.Name) and annotation.id in ('int','float','bool','str') else ''
        kind={'str':'string'}.get(hinted,hinted) or value['kind']
        raw=ast.get_source_segment(code,default) if default is not None else ''
        span=quote_node
        if span_end is not None:
            span=ast.Constant(value=None,lineno=quote_node.lineno,col_offset=quote_node.col_offset,
                end_lineno=span_end.end_lineno,end_col_offset=span_end.end_col_offset)
        quote=ast.get_source_segment(code,span) or ''
        rows.append({'name':name,'type':kind,'declaration':'python_default' if role=='function_default' else 'python_assignment',
            'default_raw':raw or '', 'line':quote_node.lineno,'quote':quote,'binding_kind':role,'scope':scope,
            'default_value':value,'declared_constraints':{},'type_basis':'annotation_hint' if hinted else 'literal_syntax'})
        if len(rows)>300:raise DeclarationLimit()
    try:
        for node in tree.body:
            if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
                args=[*node.args.posonlyargs,*node.args.args]
                for arg,default in zip(args[len(args)-len(node.args.defaults):],node.args.defaults):
                    add(arg.arg,default,node.name,'function_default',arg,arg.annotation,default)
                for arg,default in zip(node.args.kwonlyargs,node.args.kw_defaults):
                    if default is not None:add(arg.arg,default,node.name,'function_default',arg,arg.annotation,default)
            elif isinstance(node,(ast.Assign,ast.AnnAssign)):
                targets=node.targets if isinstance(node,ast.Assign) else [node.target]
                for target in targets:
                    if isinstance(target,ast.Name) and target.id.isupper():
                        add(target.id,node.value,'<module>','module_literal',node,getattr(node,'annotation',None))
    except DeclarationLimit:
        return [],['Python声明超过300项；不使用截断结果判断参数匹配。'],'limited'
    # A second write or a binding with the same spelling remains ambiguous. We
    # do not infer runtime order, global/nonlocal effects or shadowing semantics.
    for row in list(rows):
        if row['binding_kind']!='module_literal':continue
        writes=[node for node in nodes if isinstance(node,ast.Name) and isinstance(node.ctx,ast.Store) and node.id==row['name']]
        if len(writes)>1 and not any(other['name']==row['name'] and other is not row for other in rows):
            rows.append({**row,'binding_kind':'unresolved_write','default_raw':'','default_value':dict(UNKNOWN)})
    if len(rows)>300:return [],['Python声明和重写线索超过300项；不使用截断结果。'],'limited'
    return rows,['只读取顶层函数默认参数和全大写模块赋值；赋值仅是初始字面值，不表示公开可调输入或运行时不变。',
        '类型注解仅为静态提示；动态调用、装饰器、条件初始化、g对象配置、外部配置和运行时修改未求值。'],'partial'
