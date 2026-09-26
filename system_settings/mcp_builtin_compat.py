"""内置 MCP 改名兼容，保留已有服务 ID 和 Agent 绑定。"""
from django.db import transaction

from system_settings.models import Agent, MCPServer


def rename_photo_mcp():
    with transaction.atomic():
        old = MCPServer.objects.select_for_update().filter(name='照片观察 MCP', source='system').first()
        if old is None:
            return
        current = MCPServer.objects.select_for_update().filter(name='照片 MCP').first()
        if current is not None and current.source != 'system':
            return
        if current is not None:
            # 保留旧服务的配置和 ID，将新服务上的绑定转回旧服务。
            for agent in Agent.objects.select_for_update().all():
                bindings = agent.mcp_servers or []
                if current.id not in bindings:
                    continue
                remapped = []
                for value in bindings:
                    value = old.id if value == current.id else value
                    if value not in remapped:
                        remapped.append(value)
                agent.mcp_servers = remapped
                agent.save(update_fields=['mcp_servers', 'updated_at'])
            old.available_in_chat = old.available_in_chat or current.available_in_chat
            old.save(update_fields=['available_in_chat', 'updated_at'])
            current.delete()
        old.name = '照片 MCP'
        old.save(update_fields=['name', 'updated_at'])
