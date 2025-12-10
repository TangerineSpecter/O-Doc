from nanoid import generate

alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'


def generate_unique_id(prefix: str = "") -> str:
    """
    :param prefix: 资源类型前缀，如 'art'(文章), 'cat'(分类), 'tag'(标签)
    """
    # 使用 URL 安全的字符集
    # 生成 10 位随机字符
    nid = generate(alphabet=alphabet, size=10)

    if prefix:
        return f"{prefix}_{nid}"
    return nid


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
