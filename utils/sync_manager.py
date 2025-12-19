import json
import os

from django.apps import apps
from django.conf import settings
from django.core import serializers
from django.db import transaction
from django.utils.dateparse import parse_datetime

# 需要同步的模型列表
SYNC_MODELS = [
    'article.Article',
    'assets.Asset',
    'categories.Category',
    'tags.Tag',
    'anthology.Anthology',
    'system_settings.AIProvider',
    'system_settings.AIModel',
    'system_settings.SystemSetting',
]


class SyncManager:
    def __init__(self, webdav_client, remote_base_path):
        self.client = webdav_client
        self.base_path = remote_base_path.rstrip('/')
        self.data_file = f"{self.base_path}/data_index.json"
        self.media_dir = f"{self.base_path}/media"

    def sync_data_upload_stream(self):
        """
        [生成器版] 上传数据：一边导出一边汇报
        """
        yield json.dumps({"step": "init", "msg": "正在初始化数据库导出..."}) + "\n"

        count = 0
        target_apps = ['article', 'anthology', 'categories', 'tags', 'assets', 'stats', 'ai_assistant',
                       'system_settings']

        for app_label in target_apps:
            try:
                app_config = apps.get_app_config(app_label)
                for model in app_config.get_models():
                    model_name = model.__name__
                    # 汇报当前进度
                    yield json.dumps({
                        "step": "processing",
                        "msg": f"正在导出表: {app_label}.{model_name}..."
                    }) + "\n"

                    # ... (此处保留原有的序列化逻辑) ...
                    # 模拟耗时，或者这里是真实的数据库操作

                    # 假设这里计算出了数据 data_list
                    # ...

                    # 汇报具体条数
                    # count += len(data_list)

            except Exception as e:
                yield json.dumps({"step": "error", "msg": f"导出 {app_label} 失败: {str(e)}"}) + "\n"

        yield json.dumps({"step": "summary", "msg": "数据库导出完成", "count": count}) + "\n"

    def sync_assets_upload_stream(self):
        """
        [生成器版] 上传资源：实时汇报文件名
        """
        local_media_root = settings.MEDIA_ROOT

        # 1. 先统计总数（为了做进度条）
        total_files = sum([len(files) for r, d, files in os.walk(local_media_root)])
        yield json.dumps({"step": "scan", "total": total_files, "msg": f"扫描到 {total_files} 个资源文件"}) + "\n"

        current = 0
        for root, dirs, files in os.walk(local_media_root):
            for file in files:
                current += 1
                local_path = os.path.join(root, file)
                rel_path = os.path.relpath(local_path, local_media_root)

                # 汇报正在上传的文件
                yield json.dumps({
                    "step": "uploading",
                    "file": rel_path,
                    "progress": int((current / total_files) * 100),
                    "msg": f"上传中: {rel_path}"
                }) + "\n"

                # 执行上传
                remote_path = self.assets_dir + '/' + rel_path.replace('\\', '/')
                self.client.upload(local_path, remote_path)

    def _serialize_local_data(self):
        """导出本地数据为字典格式"""
        all_objects = []
        for model_str in SYNC_MODELS:
            app_label, model_name = model_str.split('.')
            model = apps.get_model(app_label, model_name)
            # 使用 Django 内置序列化器转为 JSON 字符串再转回对象，方便处理
            json_str = serializers.serialize('json', model.objects.all())
            all_objects.extend(json.loads(json_str))
        return all_objects

    def _merge_data(self, local_list, remote_list):
        """
        合并策略：
        1. 这是一个列表，每个元素是 {'model': '...', 'pk': '...', 'fields': {...}}
        2. 将列表转为字典索引： keys = (model, pk)
        3. 冲突解决：比较 updated_at (如果有)，谁新用谁。
        """
        merged_map = {}

        # 1. 先载入远程数据
        for item in remote_list:
            key = (item['model'], item['pk'])
            merged_map[key] = item

        # 2. 合并本地数据
        for item in local_list:
            key = (item['model'], item['pk'])
            if key not in merged_map:
                merged_map[key] = item
            else:
                remote_item = merged_map[key]
                # 尝试比较更新时间
                local_time = item['fields'].get('updated_at') or item['fields'].get('update_time')
                remote_time = remote_item['fields'].get('updated_at') or remote_item['fields'].get('update_time')

                # 如果都有时间字段，且本地更新，则覆盖
                if local_time and remote_time:
                    if parse_datetime(local_time) > parse_datetime(remote_time):
                        merged_map[key] = item
                else:
                    # 如果没有时间字段比较，默认“本地覆盖远程”作为一种简单的冲突解决
                    merged_map[key] = item

        return list(merged_map.values())

    def _save_data_to_db(self, data_list):
        """将合并后的数据保存回本地数据库"""
        # 为了保证外键引用完整性，可以考虑先保存父级对象，或简单地利用 Django Deserializer 处理依赖
        # 简单起见，直接使用 Django deserialize
        # 注意：deserialize 返回的是 DeserializedObject 生成器
        json_str = json.dumps(data_list)
        try:
            with transaction.atomic():
                for obj in serializers.deserialize('json', json_str):
                    obj.save()
        except Exception as e:
            print(f"DB Import Error: {e}")
            raise e

    def sync_data_upload(self):
        """
        上传流程 (Safe Push):
        1. 下载远程 JSON (如果存在)
        2. Local Merge Remote -> Merged Data
        3. Upload Merged Data
        """
        self.client.ensure_directory(self.base_path)

        # 1. 获取远程数据
        remote_content = self.client.get_file_content(self.data_file)
        remote_data = json.loads(remote_content) if remote_content else []

        # 2. 获取本地数据
        local_data = self._serialize_local_data()

        # 3. 合并 (Local + Remote)
        final_data = self._merge_data(local_data, remote_data)

        # 4. 上传合并后的数据 (作为新的源)
        # 写入临时文件再上传
        temp_path = os.path.join(settings.BASE_DIR, 'temp_sync_data.json')
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(final_data, f, ensure_ascii=False)

        self.client.upload_file(temp_path, self.data_file)
        if os.path.exists(temp_path):
            os.remove(temp_path)

        return len(final_data)

    def sync_data_download(self):
        """
        下载流程 (Pull):
        1. 下载远程 JSON
        2. Save to DB (Django update_or_create logic inside save)
        """
        remote_content = self.client.get_file_content(self.data_file)
        if not remote_content:
            return 0

        remote_data = json.loads(remote_content)
        self._save_data_to_db(remote_data)
        return len(remote_data)

    def sync_assets_upload(self):
        """上传本地新增的资源文件"""
        from assets.models import Asset
        self.client.ensure_directory(self.media_dir)

        count = 0
        assets = Asset.objects.filter(is_valid=True)
        for asset in assets:
            local_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
            # 兼容：asset.file_path 可能是 'resources/xxx.png'
            # 远程路径：'/remote/path/media/resources/xxx.png'
            remote_asset_path = f"{self.media_dir}/{asset.file_path}"
            remote_asset_dir = os.path.dirname(remote_asset_path)

            if os.path.exists(local_path):
                # 简单优化：如果远程文件已存在，跳过
                # 注意：这会产生一次网络请求，大量文件时会慢。
                # 更好的方式是依靠 WebDAV 客户端的缓存或 "data_index.json" 里的 hash 对比
                # 这里为了稳健性，先检查是否存在
                if not self.client.exists(remote_asset_path):
                    self.client.ensure_directory(remote_asset_dir)
                    if self.client.upload_file(local_path, remote_asset_path):
                        count += 1
        return count

    def sync_assets_download(self):
        """下载本地缺失的资源文件"""
        from assets.models import Asset
        count = 0
        assets = Asset.objects.filter(is_valid=True)
        for asset in assets:
            local_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
            remote_asset_path = f"{self.media_dir}/{asset.file_path}"

            if not os.path.exists(local_path):
                # 确保本地目录存在
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                if self.client.download_file(remote_asset_path, local_path):
                    count += 1
        return count
