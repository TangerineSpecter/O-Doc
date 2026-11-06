"""Forward async iteration and closure to the iterator owned by the response."""
import asyncio
import logging
import time

from asgiref.sync import async_to_sync
from .instrumentation import active, finish, outcome

logger = logging.getLogger(__name__)


class AsyncResponseStream:
    def __init__(self, content, response, event, status):
        self.iterator = content.__aiter__()
        self.response = response
        self.event = event
        self.status = status
        self.closed = False
        self.loop = None

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.closed:
            raise StopAsyncIteration
        self.loop = asyncio.get_running_loop()
        try:
            with active(self.event):
                chunk = await self.iterator.__anext__()
        except StopAsyncIteration:
            await self._close(self.status)
            raise
        except BaseException as exc:
            try:
                await self._close(outcome(exc))
            except BaseException:
                logger.warning('Async response cleanup failed after an interrupted stream')
            raise
        if chunk and 'first_chunk_ms' not in self.event:
            self.event['first_chunk_ms'] = (time.monotonic() - self.event['_clock']) * 1000
        return self.response.make_bytes(chunk)

    async def _close(self, status):
        if self.closed:
            return
        self.closed = True
        try:
            closer = getattr(self.iterator, 'aclose', None)
            if closer is not None:
                with active(self.event):
                    await closer()
        except BaseException as exc:
            status = outcome(exc)
            raise
        finally:
            finish(self.event, status)

    async def aclose(self):
        await self._close('cancelled')

    def close(self):
        # Django's response.close() is synchronous, including under ASGI. Keep
        # cleanup on the iterator's running loop when called from another thread.
        if self.closed:
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is not None:
            task = running.create_task(self.aclose())
            task.add_done_callback(self._cleanup_result)
        elif self.loop is not None and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.aclose(), self.loop).result(timeout=2)
        else:
            async_to_sync(self.aclose)()

    @staticmethod
    def _cleanup_result(task):
        if not task.cancelled() and task.exception() is not None:
            logger.warning('Async response cleanup failed')
