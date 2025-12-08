import uuid
import hashlib
import time


def generate_unique_id(prefix: str = "") -> str:
    """
    生成唯一ID
    :param prefix: ID前缀（可选）
    :return: 唯一ID字符串
    """
    unique_str = f"{uuid.uuid4()}{time.time()}"
    # 使用MD5哈希生成32位字符串
    md5_hash = hashlib.md5(unique_str.encode('utf-8')).hexdigest()
    # 如果有前缀，加上前缀
    if prefix:
        return f"{prefix}_{md5_hash}"
    return md5_hash


# 为文集生成带coll前缀的ID
def generate_coll_id() -> str:
    """
    生成带coll前缀的文集ID
    :return: 带coll前缀的唯一ID字符串
    """
    return generate_unique_id("coll")

# 为文章生成带art前缀的ID
def generate_article_id() -> str:
    """
    生成带art前缀的文章ID
    :return: 带art前缀的唯一ID字符串
    """
    return generate_unique_id("art")

# 为分类生成带cat前缀的ID
def generate_category_id() -> str:
    """
    生成带cat前缀的分类ID
    :return: 带cat前缀的唯一ID字符串
    """
    return generate_unique_id("cat")

# 为标签生成带tag前缀的ID
def generate_tag_id() -> str:
    """
    生成带tag前缀的标签ID
    :return: 带tag前缀的唯一ID字符串
    """
    return generate_unique_id("tag")
