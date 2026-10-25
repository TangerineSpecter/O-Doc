import os
os.environ['ODOC_ENABLE_LEARNING'] = 'false'
os.environ['ODOC_ENABLE_NOVEL'] = 'false'
os.environ['ODOC_ENABLE_MEMO_SPROUT'] = 'false'
from book_analysis.test_settings import *  # noqa: F403,E402

if 'quant' not in INSTALLED_APPS and 'quant.apps.QuantConfig' not in INSTALLED_APPS:  # noqa: F405
    INSTALLED_APPS = [*INSTALLED_APPS, 'quant.apps.QuantConfig']  # noqa: F405
QUANT_DISABLE_WORKERS = True
SYSTEM_LOG_ENABLED = False
SYSTEM_LOG_DIR = MEDIA_ROOT.parent / 'system_logs'  # noqa: F405
