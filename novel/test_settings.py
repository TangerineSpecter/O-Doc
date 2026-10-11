import os
os.environ['ODOC_ENABLE_LEARNING'] = 'false'
os.environ['ODOC_ENABLE_NOVEL'] = 'false'
from book_analysis.test_settings import *  # noqa: F403,E402
NOVEL_DISABLE_WORKERS = True

