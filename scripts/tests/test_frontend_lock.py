import json
from pathlib import Path
import unittest


class FrontendLockTests(unittest.TestCase):
    def test_native_build_dependencies_include_all_platform_variants(self):
        lockfile = Path(__file__).resolve().parents[2] / "frontend_react/package-lock.json"
        packages = json.loads(lockfile.read_text())["packages"]
        for parent, prefix in (("esbuild", "@esbuild/"), ("rollup", "@rollup/")):
            optional_dependencies = packages[f"node_modules/{parent}"]["optionalDependencies"]
            for name, version in optional_dependencies.items():
                if not name.startswith(prefix):
                    continue
                with self.subTest(package=name):
                    entry = packages.get(f"node_modules/{name}")
                    self.assertIsNotNone(entry, f"{name} is missing from package-lock.json")
                    self.assertEqual(entry["version"], version)
                    self.assertTrue(entry.get("optional"))


if __name__ == "__main__":
    unittest.main()
