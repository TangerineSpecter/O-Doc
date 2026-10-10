"""Opt-in local acceptance server: temporary SQLite/media, fake preparation, no external calls."""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
os.environ['DJANGO_SETTINGS_MODULE']='book_analysis.test_settings'
from django.conf import settings


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=11809);args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='combat-acceptance-') as directory:
        root=Path(directory).resolve()
        settings.DATABASES['default']['NAME']=str(root/'acceptance.sqlite3')
        settings.MEDIA_ROOT=root/'media';settings.ODOC_WORLD_LOCK_PATH=str(root/'world.lock')
        assert Path(settings.MEDIA_ROOT).resolve().is_relative_to(root)
        import django
        django.setup()
        from django.core.management import call_command
        call_command('migrate',verbosity=0)
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token
        from system_settings.models import Agent,AIProvider,AIModel,SystemSetting
        from system_settings.agent_world.combat.store import install
        install()
        user=User.objects.create_superuser('admin','test@example.invalid','fixture-only')
        token=Token.objects.create(user=user).key
        provider=AIProvider.objects.create(name='fixture',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='fixture',type='chat',provider=provider)
        agents=[Agent.objects.create(pk='combat-fixture-'+str(i),name=name,model=model,money=1000) for i,name in enumerate(('探险者','观察员'))]
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        from system_settings.agent_world.combat import preparation
        def fake(agent,instruction,context):
            if 'options' in context:return {'job_id':context['options'][0]['id'],'reason':'隔离验收'}
            return {**{'dungeon_id':'dungeon.moss_cave','style_id':'style.balanced','duration_seconds':1800},**context['constraints'],
                'equipment':{},'purchases':{'potion.heal.1':10},'potions':{'potion.heal.1':10},'reason':'隔离验收准备'}
        preparation.ask=fake
        Path('/tmp/combat-acceptance-context.json').write_text(json.dumps({'token':token,'agents':[{'id':r.pk,'name':r.name} for r in agents]}))
        from django.db import close_old_connections
        from system_settings.agent_world.combat.worker import advance
        stop=threading.Event()
        def loop():
            while not stop.wait(5):
                close_old_connections()
                try:advance()
                finally:close_old_connections()
        threading.Thread(target=loop,daemon=True).start()
        from django.core.wsgi import get_wsgi_application
        from wsgiref.simple_server import make_server
        print(f'Isolated acceptance server at http://127.0.0.1:{args.port}',flush=True)
        try:
            with make_server('127.0.0.1',args.port,get_wsgi_application()) as server:server.serve_forever()
        finally:stop.set()


if __name__=='__main__':main()
