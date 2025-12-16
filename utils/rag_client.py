# utils/rag_client.py
import os

import chromadb
from chromadb.config import Settings
from django.conf import settings

# 确保有个目录存数据
CHROMA_DB_PATH = os.path.join(settings.BASE_DIR, 'chroma_data')


class RagClient:
    _instance = None

    @classmethod
    def get_client(cls):
        if cls._instance is None:
            # 使用 PersistentClient 实现数据持久化
            cls._instance = chromadb.PersistentClient(
                path=CHROMA_DB_PATH,
                # 可以在这里配置一些参数，比如禁止遥测
                settings=Settings(anonymized_telemetry=False)
            )
        return cls._instance

    @classmethod
    def get_collection(cls, name="odoc_knowledge_base"):
        client = cls.get_client()
        # 获取或创建集合
        return client.get_or_create_collection(name=name)

# 使用示例：
# collection = RagClient.get_collection()
# collection.add(...)
# collection.query(...)
