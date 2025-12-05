#!/usr/bin/env python
"""
测试文集表coll_id字段的生成和查询功能
"""

import os
import sys

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 设置Django环境
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'o_doc.settings')

import django
django.setup()

from anthology.models import Anthology


def test_coll_id_generation():
    """测试coll_id自动生成"""
    print("测试coll_id自动生成...")
    
    # 创建一个新的文集
    anthology = Anthology(
        title="测试文集",
        description="这是一个测试文集",
        icon_id="book",
        permission="public"
    )
    anthology.save()
    
    print(f"创建成功！")
    print(f"文集ID: {anthology.id}")
    print(f"文集coll_id: {anthology.coll_id}")
    print(f"coll_id长度: {len(anthology.coll_id)}")
    
    # 验证coll_id格式
    assert len(anthology.coll_id) == 32, f"coll_id长度应为32位，实际为{len(anthology.coll_id)}位"
    print("✓ coll_id格式验证通过")
    
    return anthology.coll_id


def test_coll_id_query(coll_id):
    """测试通过coll_id查询文集"""
    print("\n测试通过coll_id查询文集...")
    
    # 根据coll_id查询文集
    anthology = Anthology.objects.get(coll_id=coll_id)
    
    print(f"查询成功！")
    print(f"文集ID: {anthology.id}")
    print(f"文集标题: {anthology.title}")
    print(f"文集coll_id: {anthology.coll_id}")
    
    assert anthology.coll_id == coll_id, "查询到的coll_id与原始coll_id不匹配"
    print("✓ coll_id查询验证通过")


def test_duplicate_coll_id():
    """测试coll_id的唯一性"""
    print("\n测试coll_id的唯一性...")
    
    # 创建多个文集，验证它们的coll_id都不相同
    coll_ids = set()
    for i in range(5):
        anthology = Anthology(
            title=f"测试文集{i+1}",
            description=f"这是第{i+1}个测试文集",
            icon_id="book",
            permission="public"
        )
        anthology.save()
        coll_ids.add(anthology.coll_id)
    
    print(f"创建了5个文集，生成了{len(coll_ids)}个不同的coll_id")
    assert len(coll_ids) == 5, "coll_id存在重复"
    print("✓ coll_id唯一性验证通过")


if __name__ == "__main__":
    print("开始测试文集表coll_id功能...\n")
    
    try:
        # 测试coll_id生成
        coll_id = test_coll_id_generation()
        
        # 测试coll_id查询
        test_coll_id_query(coll_id)
        
        # 测试coll_id唯一性
        test_duplicate_coll_id()
        
        print("\n🎉 所有测试通过！coll_id功能正常工作！")
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)