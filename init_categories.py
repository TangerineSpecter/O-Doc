# init_categories.py
import os

import django

# 设置 Django 环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "o_doc.settings")
django.setup()

from categories.models import Category
from article.models import Article


def init_uncategorized_category():
    print("=" * 60)
    print("正在初始化【未分类】分类...")

    # 定义未分类的属性
    cat_id = 'uncategorized'
    defaults = {
        'name': '未分类',
        'description': '未关联分类的文章',
        'user_id': 'admin',
        'theme_id': 'slate',  # 对应前端 slate 主题 (灰色)
        'icon_key': 'Box',  # 对应前端 Box 图标
        'sort': 0,
        'is_valid': True
    }

    # 1. 创建或获取分类
    category, created = Category.objects.get_or_create(
        category_id=cat_id,
        defaults=defaults
    )

    if created:
        print(f"\033[92m [✔] 分类【{defaults['name']}】创建成功！ \033[0m")
    else:
        print(f" [!] 分类【{defaults['name']}】已存在，正在检查并更新属性...")
        needs_save = False
        for key, value in defaults.items():
            if getattr(category, key) != value:
                setattr(category, key, value)
                needs_save = True
        if needs_save:
            category.save()
            print(f"\033[92m [✔] 分类属性已更新！ \033[0m")
        else:
            print(" [-] 分类属性无需更新。")

    # 2. 迁移旧的未分类文章 (将 category=NULL 的文章关联到此分类)
    print("-" * 60)
    print("正在检查并迁移悬空文章...")

    articles_to_update = Article.objects.filter(
        author='admin',
        is_valid=True,
        category__isnull=True
    )

    count = articles_to_update.count()

    if count > 0:
        rows_updated = articles_to_update.update(category=category)
        print(f"\033[92m [✔] 成功将 {rows_updated} 篇未分类文章迁移至新分类。 \033[0m")
    else:
        print(" [-] 暂无需要迁移的文章。")

    print("=" * 60)


if __name__ == '__main__':
    init_uncategorized_category()
