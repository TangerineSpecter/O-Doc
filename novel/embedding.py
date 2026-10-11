"""Use the configured embedding provider with the same real usage ledger."""
from openai import OpenAI
from utils.ai_service import AIService
from utils.token_usage import usage_context
from system_settings.token_usage.capture import Capture
from utils.rag_client import RagClient


def embeddings(texts):
    model = RagClient.get_embedding_model()
    if model is None:
        return []
    config = AIService.get_client_config_for_model(model.pk)
    client = OpenAI(api_key=config['api_key'], base_url=config['base_url'], timeout=30, max_retries=0)
    output = []
    try:
        for start in range(0, len(texts), 16):
            capture = Capture(config) if usage_context() else None
            try:
                result = client.embeddings.create(model=model.name, input=texts[start:start + 16])
                items = sorted(result.data, key=lambda item: item.index)
                if len(items) != len(texts[start:start + 16]):
                    raise ValueError('向量结果不完整')
                output += [item.embedding for item in items]
                if capture:
                    capture.usage(result.usage)
                    capture.finish('success')
            except Exception:
                if capture:
                    capture.finish('failed')
                raise
    finally:
        client.close()
    return output
