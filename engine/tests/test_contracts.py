import asyncio
import threading
import unittest

from main import run_executor
from models import AgentConfig
from tools.http_safety import UnsafeUrlError, validate_public_url


class EngineContractTests(unittest.TestCase):
    def test_max_tokens_matches_api_contract(self):
        config = AgentConfig(id="a", name="Agent", max_tokens=8192)
        self.assertEqual(config.max_tokens, 8192)
        with self.assertRaises(ValueError):
            AgentConfig(id="a", name="Agent", max_tokens=8193)

    def test_private_network_targets_are_rejected(self):
        for url in (
            "http://127.0.0.1/admin",
            "http://10.0.0.1/",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/",
        ):
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                validate_public_url(url)

    def test_executor_work_is_offloaded_in_parallel(self):
        lock = threading.Lock()
        both_started = threading.Event()
        started_count = 0

        class FakeExecutor:
            def run(self, _config, message):
                nonlocal started_count
                with lock:
                    started_count += 1
                    if started_count == 2:
                        both_started.set()
                return message, both_started.wait(timeout=1)

        async def run_both():
            return await asyncio.gather(
                run_executor(FakeExecutor(), None, "one"),
                run_executor(FakeExecutor(), None, "two"),
            )

        results = asyncio.run(run_both())
        self.assertEqual(results, [("one", True), ("two", True)])


if __name__ == "__main__":
    unittest.main()
