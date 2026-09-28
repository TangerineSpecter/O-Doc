"""通用生图工具契约；场景、画风和参考图选择由调用方提供。"""

IMAGE_GENERATION_TOOLS = [
    {
        'name': 'get_image_generation_options',
        'description': '查询默认生图模型支持的比例、分辨率、参考图能力，以及当前 Agent 可用的形象参考资源 ID。不生成图片。',
        'inputSchema': {'type': 'object', 'properties': {}, 'additionalProperties': False},
        'annotations': {'readOnlyHint': True, 'openWorldHint': False},
    },
    {
        'name': 'generate_image',
        'description': (
            '使用默认生图模型生成一张图片。prompt 原样传递；可选 reference_image_ids 用于以图生图。'
            '不会自动选择角色参考或添加画风。返回 task_id 和状态，未完成时调用 get_image_generation_result；'
            '不要反复调用本工具等待出图。同一次生成重试时务必复用 request_id，以避免重复付费。'
            '成功返回 asset_id、image_url 和可插入正文的 Markdown，不会自动发帖。'
        ),
        'inputSchema': {
            'type': 'object',
            'properties': {
                'prompt': {'type': 'string', 'minLength': 1, 'maxLength': 8000, 'description': '完整生图提示词，由 Skill 决定内容和画风。'},
                'reference_image_ids': {'type': 'array', 'items': {'type': 'string', 'minLength': 1}, 'maxItems': 4,
                                        'uniqueItems': True, 'description': '按顺序提供已有图片的资源 ID；省略或空数组表示文生图。当前以图生图仅支持 Grsai。最多 4 张为本工具限制。'},
                'aspect_ratio': {'type': 'string', 'description': '模型支持的比例，例如 3:4；先查询 get_image_generation_options。'},
                'image_size': {'type': 'string', 'enum': ['1K', '2K', '4K'], 'description': '模型支持的分辨率，默认优先 1K；不支持时按能力查询结果选择。'},
                'request_id': {'type': 'string', 'minLength': 1, 'maxLength': 80,
                               'description': '调用方生成的唯一请求标识。同一生成意图的重复调用必须复用；相同标识配不同参数会报错。'},
            },
            'required': ['prompt'],
            'additionalProperties': False,
        },
        'annotations': {'readOnlyHint': False, 'destructiveHint': False, 'idempotentHint': False, 'openWorldHint': True},
    },
    {
        'name': 'get_image_generation_result',
        'description': '查询 generate_image 返回的 task_id。必要时重试下载并保存已有生成结果，不重新提交生图。返回状态与成功图片的资源 ID、地址和 Markdown。生成中建议至少间隔 5 秒查询。',
        'inputSchema': {'type': 'object', 'properties': {
            'task_id': {'type': 'string', 'minLength': 1, 'maxLength': 32, 'description': '本系统生成任务 ID，不是服务商任务 ID。'},
        }, 'required': ['task_id'], 'additionalProperties': False},
        'annotations': {'readOnlyHint': False, 'destructiveHint': False, 'idempotentHint': True, 'openWorldHint': True},
    },
]
