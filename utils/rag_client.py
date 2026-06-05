import os
import math
import chromadb
from chromadb.config import Settings
from django.conf import settings
from system_settings.models import SystemSetting, AIModel
import requests

CHROMA_DB_PATH = str(settings.CHROMA_DB_PATH)


class RagSyncError(Exception):
    """Raised when content cannot be embedded or written to the vector store."""


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

    @classmethod
    def get_memo_collection(cls):
        """获取 Memos 专用向量集合"""
        return cls.get_collection(name="odoc_memos")

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
    def create_embeddings(cls, texts, *, strict=False):
        """调用硅基流动/OpenAI等接口生成向量"""
        model = cls.get_embedding_model()
        if not model:
            if strict:
                raise RagSyncError("未配置默认 Embedding 模型，请先在系统设置中配置向量模型")
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
            for index, text in enumerate(texts):
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
                        message = f"Embedding API 返回格式异常: {data}"
                        print(message)
                        if strict:
                            raise RagSyncError(message)
                else:
                    message = f"Embedding API Error: {response.status_code} - {response.text}"
                    print(message)
                    if strict:
                        raise RagSyncError(f"第 {index + 1} 个分块向量生成失败：{response.status_code}")
        except Exception as e:
            if isinstance(e, RagSyncError):
                raise
            message = f"生成 Embedding 异常: {e}"
            print(message)
            if strict:
                raise RagSyncError(message) from e

        return embeddings

    @classmethod
    def add_article(cls, article_id, title, content, coll_id):
        """添加文章到向量库"""
        if not content or not content.strip():
            raise RagSyncError("文章内容为空，无法生成知识库向量")

        # 1. 文本分块 (简单的按字符长度分块，可根据需要优化)
        chunk_size = 500
        chunks = [content[i:i + chunk_size] for i in range(0, len(content), chunk_size)]

        if not chunks:
            raise RagSyncError("文章内容为空，无法生成知识库向量")

        # 2. 生成向量
        embeddings = cls.create_embeddings(chunks, strict=True)
        if not embeddings or len(embeddings) != len(chunks):
            raise RagSyncError("向量生成失败或数量不匹配，已跳过入库")

        # 3. 准备元数据 (关键：存入 article_id 和 title)
        metadatas = [{
            "article_id": str(article_id),
            "title": title,
            "coll_id": str(coll_id)
        } for _ in chunks]
        ids = [f"{article_id}_{i}" for i in range(len(chunks))]

        # 4. 确认新向量生成成功后，再替换旧数据，避免失败时破坏已有知识库内容。
        collection = cls.get_collection()
        try:
            collection.delete(where={"article_id": str(article_id)})
        except Exception as e:
            print(f"删除旧向量失败(可能是首次同步): {e}")

        collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
        return len(chunks)

    @classmethod
    def delete_article(cls, article_id):
        """从向量库删除一篇文章的所有分块"""
        try:
            cls.get_collection().delete(where={"article_id": str(article_id)})
        except Exception as e:
            print(f"删除文章向量失败: {e}")

    @classmethod
    def add_memo(cls, memo):
        """添加或更新一条闪念到向量库"""
        content = (memo.content or '').strip()
        if not content:
            return 0

        embeddings = cls.create_embeddings([content])
        if not embeddings:
            print(f"Memo {memo.memo_id} 向量生成失败，跳过入库")
            return 0

        collection = cls.get_memo_collection()
        collection.upsert(
            documents=[content],
            embeddings=embeddings,
            metadatas=[{
                "memo_id": str(memo.memo_id),
                "user_id": str(memo.user_id),
                "tag": memo.tag or "",
                "is_pinned": bool(memo.is_pinned),
                "created_at": memo.created_at.isoformat() if memo.created_at else "",
                "updated_at": memo.updated_at.isoformat() if memo.updated_at else "",
            }],
            ids=[str(memo.memo_id)]
        )
        return 1

    @classmethod
    def delete_memo(cls, memo_id):
        """从向量库删除一条闪念"""
        try:
            cls.get_memo_collection().delete(ids=[str(memo_id)])
        except Exception as e:
            print(f"删除 Memo 向量失败: {e}")

    @classmethod
    def sync_memos(cls, memos):
        """补齐或刷新闪念向量，返回成功同步数量"""
        collection = cls.get_memo_collection()
        memo_list = list(memos)
        if not memo_list:
            return 0

        try:
            existing = collection.get(
                ids=[str(memo.memo_id) for memo in memo_list],
                include=['metadatas']
            )
            existing_meta = {
                str(item_id): metadata or {}
                for item_id, metadata in zip(existing.get('ids', []), existing.get('metadatas', []))
            }
        except Exception:
            existing_meta = {}

        synced_count = 0
        for memo in memo_list:
            memo_id = str(memo.memo_id)
            current_updated_at = memo.updated_at.isoformat() if memo.updated_at else ""
            if existing_meta.get(memo_id, {}).get("updated_at") == current_updated_at:
                continue
            try:
                synced_count += cls.add_memo(memo)
            except Exception as e:
                print(f"同步 Memo 向量失败: {memo_id} - {e}")

        return synced_count

    @staticmethod
    def cosine_similarity(vector_a, vector_b):
        dot = sum(a * b for a, b in zip(vector_a, vector_b))
        norm_a = math.sqrt(sum(a * a for a in vector_a))
        norm_b = math.sqrt(sum(b * b for b in vector_b))
        if norm_a == 0 or norm_b == 0:
            return 0
        return dot / (norm_a * norm_b)

    @classmethod
    def build_memo_similarity_links(cls, memos, threshold=0.72, max_neighbors=4):
        """基于已入库的 memo embedding 构建相似关系"""
        memo_ids = [str(memo.memo_id) for memo in memos]
        if len(memo_ids) < 2:
            return []

        collection = cls.get_memo_collection()
        try:
            results = collection.get(ids=memo_ids, include=['embeddings'])
        except Exception as e:
            print(f"读取 Memo 向量失败: {e}")
            return []

        embeddings_by_id = {
            str(item_id): embedding
            for item_id, embedding in zip(results.get('ids', []), results.get('embeddings', []))
            if embedding is not None
        }

        scored_links = []
        for index, source_id in enumerate(memo_ids):
            source_embedding = embeddings_by_id.get(source_id)
            if source_embedding is None:
                continue

            neighbors = []
            for target_id in memo_ids[index + 1:]:
                target_embedding = embeddings_by_id.get(target_id)
                if target_embedding is None:
                    continue
                score = cls.cosine_similarity(source_embedding, target_embedding)
                if score >= threshold:
                    neighbors.append((target_id, score))

            for target_id, score in sorted(neighbors, key=lambda item: item[1], reverse=True)[:max_neighbors]:
                scored_links.append({
                    "source": source_id,
                    "target": target_id,
                    "relation": "相似",
                    "similarity": round(score, 4),
                    "value": max(1, round(score * 5, 2)),
                })

        return scored_links

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
