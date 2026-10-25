"""New history contracts bound raw-input work as well as model-facing output."""
import json
import time

SECONDS=5
MAX_CHARS=20_000_000


class Budget:
    def __init__(self,active):
        self.active=active;self.deadline=time.monotonic()+SECONDS;self.exhausted=False
        self.info={'seconds':SECONDS,'max_chars':MAX_CHARS,'chars_read':0,'budget_limited':False,'size_limited':False}

    def accept(self,*values):
        if not self.active:return True
        if self.exhausted:return False
        if time.monotonic()>=self.deadline:
            self.info['budget_limited']=True;self.exhausted=True;return False
        size=sum(len(json.dumps(value,ensure_ascii=False,allow_nan=False)) for value in values)
        if self.info['chars_read']+size>MAX_CHARS:
            self.info['size_limited']=True;self.exhausted=True;return False
        self.info['chars_read']+=size;return True
