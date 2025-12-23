import json
import os
import tempfile
from django.apps import apps
from django.conf import settings
from django.core import serializers
from django.db import transaction
from django.utils.dateparse import parse_datetime


class SyncManager:
    def __init__(self, webdav_client, remote_base_path):
        self.client = webdav_client
        # 确保远程路径以 / 开头，并不以 / 结尾
        path = remote_base_path.strip('/')
        self.base_path = f"/{path}"

        self.data_file = f"{self.base_path}/data_index.json"
        self.media_dir = f"{self.base_path}/media"

    def sync_data_upload_stream(self):
        """
        [生成器] 1. 备份数据库
        """
        # 1. 确保基础目录存在
        self.client.ensure_directory(self.base_path)

        yield json.dumps({"step": "init", "msg": "正在初始化数据库导出..."}) + "\n"

        all_data = []
        target_apps = [
            'article', 'anthology', 'categories', 'tags',
            'assets', 'stats', 'ai_assistant', 'system_settings', 'user'
        ]

        total_count = 0

        # 2. 遍历并序列化数据
        for app_label in target_apps:
            try:
                app_config = apps.get_app_config(app_label)
                for model in app_config.get_models():
                    model_name = model.__name__

                    # 序列化当前模型的所有数据
                    queryset = model.objects.all()
                    count = queryset.count()
                    if count > 0:
                        yield json.dumps({
                            "step": "processing",
                            "msg": f"正在导出 {model_name} ({count}条)..."
                        }) + "\n"

                        json_str = serializers.serialize('json', queryset)
                        data_list = json.loads(json_str)
                        all_data.extend(data_list)
                        total_count += count

            except Exception as e:
                # 遇到个别 APP 错误不中断，记录日志即可
                yield json.dumps({"step": "error", "msg": f"导出 {app_label} 失败: {str(e)}"}) + "\n"

        # 3. 写入临时文件并上传
        yield json.dumps({"step": "processing", "msg": f"正在打包上传 {total_count} 条数据..."}) + "\n"

        try:
            # 创建临时文件
            with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.json') as tmp:
                json.dump(all_data, tmp, ensure_ascii=False)
                tmp_path = tmp.name

            # 上传
            self.client.upload_file(tmp_path, self.data_file)

            # 删除临时文件
            os.remove(tmp_path)

            yield json.dumps({"step": "data_done", "msg": "✅ 数据库备份完成！"}) + "\n"

        except Exception as e:
            yield json.dumps({"step": "error", "msg": f"❌ 数据上传失败: {str(e)}"}) + "\n"

    def sync_assets_upload_stream(self):
        """资源备份"""
        local_media_root = settings.MEDIA_ROOT

        # 1. 重要：先确保 media 根目录存在！
        # 即使 /o-doc-dev 存在，/o-doc-dev/media 此时可能还不存在
        self.client.ensure_directory(self.media_dir)

        # 扫描文件
        file_list = []
        for root, dirs, files in os.walk(local_media_root):
            for file in files:
                # 过滤垃圾文件
                if file.startswith('.') or file == 'Thumbs.db':
                    continue
                file_list.append(os.path.join(root, file))

        total_files = len(file_list)
        yield json.dumps({"step": "scan", "total": total_files, "msg": f"扫描到 {total_files} 个文件"}) + "\n"

        # 遍历上传
        for index, local_path in enumerate(file_list):
            rel_path = os.path.relpath(local_path, local_media_root)
            # 统一路径分隔符为 /
            rel_path_fwd = rel_path.replace('\\', '/')

            # 拼接完整远程路径: /sata1.../o-doc-dev/media/image/xxx.png
            remote_path = f"{self.media_dir}/{rel_path_fwd}"

            # 计算并汇报进度
            progress = int(((index + 1) / total_files) * 100)
            if index % 5 == 0 or index == total_files - 1:
                yield json.dumps({
                    "step": "uploading",
                    "file": rel_path_fwd,
                    "progress": progress,
                    "msg": f"上传: {rel_path_fwd}"
                }) + "\n"

            try:
                # 2. 关键修复：确保这个文件的父文件夹存在！
                # 比如文件是 media/image/1.png，必须确保 media/image 存在
                remote_dir = os.path.dirname(remote_path)
                self.client.ensure_directory(remote_dir)

                # 上传
                self.client.upload_file(local_path, remote_path)
            except Exception as e:
                print(f"Error: {e}")

        yield json.dumps({"step": "assets_done", "msg": "✅ 资源同步完成"}) + "\n"

    # ---------------- 下面是下载/恢复逻辑 (Sync From WebDAV) ----------------

    def sync_data_download(self):
        """下载并恢复数据库"""
        content = self.client.get_file_content(self.data_file)
        if not content:
            return 0

        data_list = json.loads(content)

        # 保存回数据库
        # 注意：这里会覆盖本地同 ID 的数据
        with transaction.atomic():
            for obj in serializers.deserialize('json', json.dumps(data_list)):
                obj.save()

        return len(data_list)

    def sync_assets_download(self):
        """下载缺失的资源文件"""
        # 简单策略：遍历数据库里的 Asset 记录，下载不存在的文件
        # 更好的策略是：遍历云端文件结构下载（webdav list），这里为了简单先只下载数据库里引用了的文件
        from assets.models import Asset
        count = 0
        local_media_root = settings.MEDIA_ROOT

        assets = Asset.objects.all()
        for asset in assets:
            if not asset.file_path:
                continue

            local_path = os.path.join(local_media_root, asset.file_path)
            remote_path = f"{self.media_dir}/{asset.file_path}"

            if not os.path.exists(local_path):
                try:
                    # 确保本地目录存在
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    if self.client.download_file(remote_path, local_path):
                        count += 1
                except Exception as e:
                    print(f"Download failed {asset.file_path}: {e}")

        return count
