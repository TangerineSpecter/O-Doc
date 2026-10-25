"""Translate only language-neutral syntax for a synthetic broker control-flow check.

This does not parse MQL4 or prove native compilation, tester behavior or equivalence.
"""
import re
from pathlib import Path


def cpp_source(code: str, main: str) -> str:
    code=re.sub(r'^#property[^\n]*\n','',code,flags=re.M)
    code=re.sub(r'const double &(\w+)\[\]',r'const std::vector<double>& \1',code)
    code=re.sub(r'(double|MqlRates) ((?:\w+\[\],?)+);',
        lambda match:f'std::vector<{match[1]}> '+match[2].replace('[]','')+';',code)
    # MQL4 allows calls before declarations. The C++ harness needs prototypes.
    prototypes=re.findall(r'^(?:int|bool|void|double|string) \w+\([^\n]*\) (?=\{)',code,flags=re.M)
    return Path(__file__).with_name('broker_stub.hpp').read_text()+'\n'+';\n'.join(prototypes)+';\n'+code+'\n'+main
