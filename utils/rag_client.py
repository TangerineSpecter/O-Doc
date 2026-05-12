import os
import chromadb
from chromadb.config import Settings
from django.conf import settings
from system_settings.models import SystemSetting, AIModel
import requests

CHROMA_DB_PATH = str(settings.CHROMA_DB_PATH)


class RagClient:
    collection = None
    _instance = None
    """
    向量数据库采用：ChromaDB
    """

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
        """获取或创建集合"""
        client = cls.get_client()
        # 使用 cosine 相似度，适合大多数 RAG 场景
        return client.get_or_create_collection(name=name, metadata={"hnsw:space": "cosine"})

    @staticmethod
    def get_embedding_model():
        """获取系统配置的 Embedding 模型"""
        try:
            config = SystemSetting.objects.get(key='system_ai_config').value
            model_id = config.get('default_embedding_model_id') or config.get('defaultEmbeddingModelId')
            if not model_id:
                # 如果没配置，可以在这里返回 None 或抛出异常
                print("Warning: 未配置默认 Embedding 模型")
                return None
            return AIModel.objects.get(id=model_id)
        except Exception as e:
            print(f"获取 Embedding 模型失败: {e}")
            return None

    @classmethod
    def create_embeddings(cls, texts):
        """调用硅基流动/OpenAI等接口生成向量"""
        model = cls.get_embedding_model()
        if not model:
            return []

        # 这里复用您原有的 embedding 生成逻辑
        # 假设 provider 是标准的 OpenAI 格式 (硅基流动兼容 OpenAI 格式)
        provider = model.provider
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json"
        }

        # 修正 Base URL
        base_url = provider.base_url.rstrip('/')
        api_url = f"{base_url}/embeddings"

        embeddings = []
        try:
            for text in texts:
                # 简单处理换行符，很多 embedding 模型对换行敏感
                text = text.replace("\n", " ")
                payload = {
                    "model": model.name,
                    "input": text
                }
                response = requests.post(api_url, json=payload, headers=headers, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    # 兼容 OpenAI 格式返回
                    if 'data' in data and len(data['data']) > 0:
                        embeddings.append(data['data'][0]['embedding'])
                    else:
                        print(f"Embedding API返回格式异常: {data}")
                else:
                    print(f"Embedding API Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"生成 Embedding 异常: {e}")

        return embeddings

    @classmethod
    def add_article(cls, article_id, title, content, coll_id):
        """添加文章到向量库"""
        if not content:
            return 0

        collection = cls.get_collection()

        # 【关键步骤】先删除旧数据，防止重复和残留
        # filter 语法可能因 ChromaDB 版本略有差异，通常是 where
        try:
            collection.delete(where={"article_id": str(article_id)})
        except Exception as e:
            print(f"删除旧向量失败(可能是首次同步): {e}")

        # 1. 文本分块 (简单的按字符长度分块，可根据需要优化)
        chunk_size = 500
        chunks = [content[i:i + chunk_size] for i in range(0, len(content), chunk_size)]

        if not chunks:
            return 0

        # 2. 生成向量
        embeddings = cls.create_embeddings(chunks)
        if not embeddings or len(embeddings) != len(chunks):
            print("向量生成失败或数量不匹配，跳过入库")
            return 0

        # 3. 准备元数据 (关键：存入 article_id 和 title)
        metadatas = [{
            "article_id": str(article_id),
            "title": title,
            "coll_id": str(coll_id)
        } for _ in chunks]
        ids = [f"{article_id}_{i}" for i in range(len(chunks))]

        # 4. 入库
        collection = cls.get_collection()
        collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
        return len(chunks)

    @classmethod
    def search(cls, query, n_results=3):
        """检索相关片段 (仅返回文本)"""
        # 1. 生成查询向量
        query_embeddings = cls.create_embeddings([query])
        if not query_embeddings:
            return []

        # 2. 获取集合 (修复 AttributeError)
        collection = cls.get_collection()

        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )

        return results['documents'][0] if results['documents'] else []

    @classmethod
    def search_with_sources(cls, query_text, n_results=4, coll_id=None):
        """
        检索并返回 (文档内容列表, 来源元数据列表)
        """
        # 1. 生成查询向量 (修复：必须使用 create_embeddings，否则无法匹配硅基流动的向量空间)
        query_embeddings = cls.create_embeddings([query_text])
        if not query_embeddings:
            return [], []

        # 2. 获取集合对象 (修复：原代码报错 AttributeError: 'NoneType' object has no attribute 'query')
        collection = cls.get_collection()

        # 3. 执行查询
        query_kwargs = {
            "query_embeddings": query_embeddings,
            "n_results": n_results,
            "include": ['documents', 'metadatas']
        }
        if coll_id:
            query_kwargs["where"] = {"coll_id": str(coll_id)}

        results = collection.query(**query_kwargs)

        docs = []
        sources = []

        if results and results.get('documents'):
            docs = results['documents'][0]
            # 安全获取 metadatas，防止为 None
            metadatas = results['metadatas'][0] if results['metadatas'] else []

            for i in range(len(docs)):
                doc_content = docs[i]
                # 收集文档内容
                docs[i] = doc_content

                # 收集来源信息
                meta = metadatas[i] if i < len(metadatas) else {}
                if meta:  # 确保 meta 不为空
                    sources.append({
                        'id': meta.get('article_id'),
                        'title': meta.get('title', '未命名文档'),
                        'coll_id': meta.get('coll_id')
                    })

        return docs, sources
