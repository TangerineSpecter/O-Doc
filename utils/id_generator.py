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

# 为 AI 提供商生成带 prov 前缀的 ID
def generate_provider_id() -> str:
    """
    生成带 prov 前缀的提供商ID
    :return: 带 prov 前缀的唯一ID字符串
    """
    return generate_unique_id("prov")


# 为 AI 模型生成带 mod 前缀的 ID
def generate_model_id() -> str:
    """
    生成带 mod 前缀的模型ID
    :return: 带 mod 前缀的唯一ID字符串
    """
    return generate_unique_id("mod")


# 为 Agent 生成带 agent 前缀的 ID
def generate_agent_id() -> str:
    """
    生成带 agent 前缀的 Agent ID
    :return: 带 agent 前缀的唯一ID字符串
    """
    return generate_unique_id("agent")


def generate_agent_task_id() -> str:
    """
    生成带 task 前缀的 Agent 任务ID
    :return: 带 task 前缀的唯一ID字符串
    """
    return generate_unique_id("task")


def generate_agent_run_id() -> str:
    """
    生成带 run 前缀的 Agent 执行记录ID
    :return: 带 run 前缀的唯一ID字符串
    """
    return generate_unique_id("run")


def generate_agent_im_message_id() -> str:
    """
    生成带 aim 前缀的 Agent IM 消息记录 ID
    :return: 带 aim 前缀的唯一ID字符串
    """
    return generate_unique_id("aim")


def generate_agent_im_session_id() -> str:
    """
    生成带 ims 前缀的 Agent IM 会话 ID
    :return: 带 ims 前缀的唯一ID字符串
    """
    return generate_unique_id("ims")


def generate_agent_long_term_memory_id() -> str:
    """
    生成带 alm 前缀的 Agent 长期记忆 ID
    :return: 带 alm 前缀的唯一ID字符串
    """
    return generate_unique_id("alm")


def generate_agent_short_term_memory_id() -> str:
    """
    生成带 asm 前缀的 Agent 短期记忆 ID
    :return: 带 asm 前缀的唯一ID字符串
    """
    return generate_unique_id("asm")


def generate_agent_conversation_id() -> str:
    """
    生成带 acv 前缀的 Agent IM 对话线程 ID
    :return: 带 acv 前缀的唯一ID字符串
    """
    return generate_unique_id("acv")


# 为 MCP 服务生成带 mcp 前缀的 ID
def generate_mcp_server_id() -> str:
    """
    生成带 mcp 前缀的 MCP 服务ID
    :return: 带 mcp 前缀的唯一ID字符串
    """
    return generate_unique_id("mcp")


def generate_skill_id() -> str:
    """
    生成带 skill 前缀的技能ID
    :return: 带 skill 前缀的唯一ID字符串
    """
    return generate_unique_id("skill")


# 为地理位置生成带 loc 前缀的 ID
def generate_location_id() -> str:
    """
    生成带 loc 前缀的地理位置ID
    :return: 带 loc 前缀的唯一ID字符串
    """
    return generate_unique_id("loc")

# 为 消息 生成带 msg 前缀的 ID
def generate_msg_id() -> str:
    """
    生成带 msg 前缀的模型ID
    :return: 带 msg 前缀的唯一ID字符串
    """
    return generate_unique_id("msg")


# 为闪念备忘生成带 memo 前缀的 ID
def generate_memo_id() -> str:
    """
    生成带 memo 前缀的备忘ID
    :return: 带 memo 前缀的唯一ID字符串
    """
    return generate_unique_id("memo")


# 为图片生成带img前缀的ID
def generate_image_id() -> str:
    """
    生成带img前缀的图片ID
    :return: 带img前缀的唯一ID字符串
    """
    return generate_unique_id("img")


def generate_article_annotation_id() -> str:
    """
    生成带 ann 前缀的文章批注 ID
    :return: 带 ann 前缀的唯一ID字符串
    """
    return generate_unique_id("ann")


def generate_article_annotation_comment_id() -> str:
    """
    生成带 anc 前缀的文章批注评论 ID
    :return: 带 anc 前缀的唯一ID字符串
    """
    return generate_unique_id("anc")


def generate_article_post_comment_id() -> str:
    """
    生成带 apc 前缀的 Agent 帖子评论 ID
    :return: 带 apc 前缀的唯一ID字符串
    """
    return generate_unique_id("apc")


def generate_article_post_rating_id() -> str:
    """
    生成带 apr 前缀的 Agent 帖子评分 ID
    :return: 带 apr 前缀的唯一ID字符串
    """
    return generate_unique_id("apr")
