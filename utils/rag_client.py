import os

import chromadb
import requests
from chromadb.config import Settings
from django.conf import settings

from system_settings.models import SystemSetting, AIModel

CHROMA_DB_PATH = os.path.join(settings.BASE_DIR, 'chroma_data')


class RagClient:
    _instance = None

    @classmethod
    def get_client(cls):
        if cls._instance is None:
            cls._instance = chromadb.PersistentClient(
                path=CHROMA_DB_PATH,
                settings=Settings(anonymized_telemetry=False)
            )
        return cls._instance

    @classmethod
    def get_collection(cls, name="odoc_knowledge_base"):
        client = cls.get_client()
        # 使用余弦相似度 (cosine) 比较通用
        return client.get_or_create_collection(name=name, metadata={"hnsw:space": "cosine"})

    @staticmethod
    def get_embedding_model():
        """获取系统配置的 Embedding 模型"""
        try:
            config = SystemSetting.objects.get(key='system_ai_config').value
            # 假设你在设置里存的 key 是 default_embedding_model_id
            model_id = config.get('default_embedding_model_id')
            if not model_id:
                raise Exception("未配置默认 Embedding 模型")
            return AIModel.objects.get(id=model_id)
        except Exception as e:
            print(f"获取 Embedding 模型失败: {e}")
            return None

    @staticmethod
    def create_embeddings(texts, model=None):
        """调用厂商 API 生成向量"""
        if not texts:
            return []

        if not model:
            model = RagClient.get_embedding_model()
            if not model:
                raise Exception("找不到可用的 Embedding 模型")

        provider = model.provider
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json"
        }

        # 兼容 OpenAI 格式的 Embedding 接口
        api_url = f"{provider.base_url.rstrip('/')}/embeddings"

        embeddings = []
        # 简单批处理，避免一次发太大
        batch_size = 10
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            payload = {
                "model": model.name,
                "input": batch_texts
            }
            try:
                resp = requests.post(api_url, json=payload, headers=headers, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                # 提取向量，按 index 排序确保顺序一致
                batch_embeddings = [item['embedding'] for item in sorted(data['data'], key=lambda x: x['index'])]
                embeddings.extend(batch_embeddings)
            except Exception as e:
                print(f"Embedding API Error: {e}")
                raise e

        return embeddings

    @classmethod
    def split_text(cls, text, chunk_size=500, overlap=50):
        """简单的文本切片工具"""
        chunks = []
        if not text:
            return chunks

        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start += chunk_size - overlap
        return chunks

    @classmethod
    def add_article(cls, article_id, title, content):
        """将文章切片并存入 ChromaDB"""
        collection = cls.get_collection()

        # 1. 清理旧数据 (如果支持更新，也可以先删后加)
        collection.delete(where={"article_id": str(article_id)})

        # 2. 文本切片
        chunks = cls.split_text(content)
        if not chunks:
            return

        # 3. 生成向量
        embeddings = cls.create_embeddings(chunks)

        # 4. 准备写入数据
        ids = [f"{article_id}_{i}" for i in range(len(chunks))]
        metadatas = [{"article_id": str(article_id), "title": title, "chunk_index": i} for i in range(len(chunks))]

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas
        )
        return len(chunks)

    @classmethod
    def search(cls, query, n_results=3):
        """检索相关片段"""
        # 1. 生成查询向量
        query_embeddings = cls.create_embeddings([query])
        if not query_embeddings:
            return []

        collection = cls.get_collection()
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )

        # 整理返回格式
        documents = results['documents'][0] if results['documents'] else []
        # metadatas = results['metadatas'][0] if results['metadatas'] else []
        return documents
