"""配图主体选择编码到已有提示词中，不新增同步配置或决策字段。"""
ACTOR_PREFIX = '主体选择：包含居民形象。\n'
SCENE_PREFIX = '主体选择：仅场景或物品，不包含居民形象。\n'
CHIBI_STYLE = ('统一采用旅行场景照的Q版手绘风格：角色约2–3头身、大头短身、圆润简化的四肢和五官，'
               '粗而清晰的深褐近黑描边、干净色块、轻柔明暗和少量纸感纹理；'
               '场景与物品保持同款画风，背景细致有层次。避免写实人物、修长成人比例和细线稿。'
               '表情按性格与实际经历决定，不强制开心；输出单张完整画面，不加文字或设定图排版。')


def encode_subject(value: dict) -> None:
    include_actor = value.pop('image_include_actor', False)
    if type(include_actor) is not bool:
        raise ValueError('是否加入居民形象须为布尔值')
    if value.get('action') == 'publish' and value.get('image_choice') == 'generate':
        prompt = value.get('image_prompt')
        # 提示词缺失仍保留生成意图，提交时记录可见的配图失败，文字照常发布。
        if isinstance(prompt, str) and prompt.strip():
            value['image_prompt'] = (ACTOR_PREFIX if include_actor else SCENE_PREFIX) + prompt.strip()


def image_prompt(prompt: str, references: dict) -> tuple[str, list[str]]:
    include_actor = not prompt.startswith(SCENE_PREFIX)
    for prefix in (ACTOR_PREFIX, SCENE_PREFIX):
        if prompt.startswith(prefix):
            prompt = prompt[len(prefix):]
            break
    refs = list(dict.fromkeys(references.values())) if include_actor else []
    subject = '仅表现场景或物品，不出现居民或人物形象。'
    if include_actor:
        subject = '画面包含当前居民，按Q版比例重画；只使用角色外观，不把完整人格写入画面。'
        for role, identity in references.items():
            subject += f'参考图{refs.index(identity)+1}用于' + ('头像身份、发型与五官。' if role == 'avatar' else '服装与配饰。')
        if not refs:
            subject += '没有角色参考图，不臆造具体外貌；使用背影或剪影表现。'
    return prompt + '\n' + CHIBI_STYLE + '\n' + subject + '\n只表现已发生的生活片段，不捏造共同经历。', refs
