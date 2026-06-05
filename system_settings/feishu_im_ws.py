import logging
import os
import socket
import threading
import asyncio

from django.db import OperationalError, ProgrammingError, close_old_connections

from .feishu_im import handle_feishu_sdk_message_event
from .models import Agent
from .sync_scheduler import _env_flag, _is_server_process, get_scheduler_initial_delay_seconds

logger = logging.getLogger(__name__)


def should_start_feishu_im_ws_manager():
    if not _env_flag('ODOC_ENABLE_FEISHU_IM_WS', 'true'):
        return False

    if _env_flag('ODOC_FORCE_FEISHU_IM_WS', 'false'):
        return True

    return _is_server_process()


class FeishuIMWebSocketManager:
    """管理 Agent 绑定飞书应用后的 SDK 长连接。"""

    def __init__(self):
        self._started = False
        self._lock = threading.RLock()
        self._start_lock = threading.Lock()
        self._connections = {}
        self._loop = None
        self._loop_thread = None
        self.runner_id = f"{socket.gethostname()}:{os.getpid()}"

    def start(self):
        with self._start_lock:
            if self._started:
                return
            self._started = True

            threading.Thread(
                target=self._delayed_initial_sync,
                name='feishu-im-ws-initial-sync',
                daemon=True,
            ).start()

    def _delayed_initial_sync(self):
        threading.Event().wait(get_scheduler_initial_delay_seconds())
        self.sync_enabled_agents()

    def sync_enabled_agents(self):
        close_old_connections()
        try:
            agents = list(Agent.objects.filter(feishu_im_enabled=True))
        except (OperationalError, ProgrammingError) as exc:
            logger.warning('Feishu IM WS manager skipped before database is ready: %s', exc)
            return
        finally:
            close_old_connections()

        enabled_ids = {agent.id for agent in agents}
        with self._lock:
            for agent_id in list(self._connections.keys()):
                if agent_id not in enabled_ids:
                    self.stop_agent(agent_id)

        for agent in agents:
            self.start_agent(agent)

    def sync_agent(self, agent_id):
        close_old_connections()
        try:
            agent = Agent.objects.filter(id=agent_id).first()
        finally:
            close_old_connections()

        if not agent or not agent.feishu_im_enabled:
            self.stop_agent(agent_id)
            return

        self.start_agent(agent)

    def start_agent(self, agent, restart=False):
        if not agent.feishu_app_id or not agent.feishu_app_secret:
            logger.warning('Feishu IM WS skipped for %s: missing app_id/app_secret', agent.id)
            return

        with self._lock:
            current = self._connections.get(agent.id)
            signature = self._signature(agent)
            if current and current.get('signature') == signature and not restart:
                return
            if current:
                self.stop_agent(agent.id)

            try:
                client = self._build_client(agent)
                loop = self._ensure_loop()
            except ImportError:
                logger.exception('Feishu IM WS requires lark-oapi. Please install requirements.txt.')
                return
            except Exception:
                logger.exception('Failed to build Feishu IM WS client for agent %s', agent.id)
                return

            future = asyncio.run_coroutine_threadsafe(
                self._start_client(agent.id, client),
                loop,
            )
            self._connections[agent.id] = {
                'client': client,
                'future': future,
                'ping_task': None,
                'signature': signature,
            }
            logger.info('Feishu IM WS started for agent %s on %s', agent.id, self.runner_id)

    def stop_agent(self, agent_id):
        with self._lock:
            current = self._connections.pop(agent_id, None)
        if not current:
            return

        client = current.get('client')
        if not client:
            return

        client._auto_reconnect = False
        ping_task = current.get('ping_task')
        loop = self._loop
        if loop and ping_task:
            loop.call_soon_threadsafe(ping_task.cancel)

        try:
            disconnect = getattr(client, '_disconnect', None)
            if callable(disconnect) and loop and loop.is_running():
                future = asyncio.run_coroutine_threadsafe(disconnect(), loop)
                future.result(timeout=10)
        except Exception:
            logger.exception('Failed to stop Feishu IM WS client for agent %s', agent_id)

    def _ensure_loop(self):
        import lark_oapi.ws.client as ws_client

        loop = ws_client.loop
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            ws_client.loop = loop
        self._loop = loop
        if loop.is_running():
            return loop

        if self._loop_thread and self._loop_thread.is_alive():
            return loop

        def run_loop():
            asyncio.set_event_loop(loop)
            loop.run_forever()

        self._loop_thread = threading.Thread(
            target=run_loop,
            name='feishu-im-ws-loop',
            daemon=True,
        )
        self._loop_thread.start()
        return loop

    @staticmethod
    def _signature(agent):
        return (
            agent.feishu_app_id,
            agent.feishu_app_secret,
            agent.feishu_encrypt_key,
            agent.feishu_verification_token,
        )

    @staticmethod
    def _build_client(agent):
        import lark_oapi as lark

        def on_message(event):
            threading.Thread(
                target=FeishuIMWebSocketManager._handle_sdk_event,
                args=(agent.id, event),
                name=f'feishu-im-event-{agent.id}',
                daemon=True,
            ).start()

        event_handler = (
            lark.EventDispatcherHandler
            .builder(agent.feishu_encrypt_key or '', agent.feishu_verification_token or '')
            .register_p2_im_message_receive_v1(on_message)
            .register_p2_im_message_message_read_v1(
                lambda event: logger.debug('Ignored Feishu message_read event for agent %s', agent.id)
            )
            .register_p2_im_message_reaction_created_v1(
                lambda event: logger.debug('Ignored Feishu reaction_created event for agent %s', agent.id)
            )
            .register_p2_im_message_reaction_deleted_v1(
                lambda event: logger.debug('Ignored Feishu reaction_deleted event for agent %s', agent.id)
            )
            .build()
        )
        return lark.ws.Client(
            agent.feishu_app_id,
            agent.feishu_app_secret,
            event_handler=event_handler,
            auto_reconnect=True,
        )

    @staticmethod
    def _handle_sdk_event(agent_id, event):
        close_old_connections()
        try:
            handle_feishu_sdk_message_event(agent_id, event)
        except Exception:
            logger.exception('Failed to handle Feishu IM event for agent %s', agent_id)
        finally:
            close_old_connections()

    async def _start_client(self, agent_id, client):
        try:
            await client._connect()
            ping_task = asyncio.create_task(client._ping_loop())
            with self._lock:
                current = self._connections.get(agent_id)
                if current:
                    current['ping_task'] = ping_task
        except Exception:
            logger.exception('Feishu IM WS client failed to start for agent %s', agent_id)


_feishu_im_ws_manager = FeishuIMWebSocketManager()


def start_feishu_im_ws_manager():
    if should_start_feishu_im_ws_manager():
        _feishu_im_ws_manager.start()
