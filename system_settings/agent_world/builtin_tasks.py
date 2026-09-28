"""内置行为定义由代码提供，数据库只在保存时记录配置。"""
POST_INTERACTION_ID = 'builtin-post-interaction'
POST_INTERACTION_NAME = '阅读帖子并评论打分'

POST_PUBLISH_ID = 'builtin-post-publish'
POST_PUBLISH_NAME = '自主选题并发帖'
TRAVEL_ID = 'builtin-travel'
TRAVEL_NAME = '旅行'
FARM_ID = 'builtin-farm'
FARM_NAME = '农场经营'
SYSTEM_TASK_KINDS = ('post_interaction', 'post_publish', 'travel', 'farm')
