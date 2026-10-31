import unittest
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class StaticBuildTests(unittest.TestCase):
    def test_build_is_deterministic(self):
        cmd=[sys.executable,str(ROOT/"build_worker.py")]
        subprocess.run(cmd,cwd=ROOT,check=True,capture_output=True)
        first=(ROOT/"dist/brandicade.worker.js").read_bytes()
        subprocess.run(cmd,cwd=ROOT,check=True,capture_output=True)
        self.assertEqual(first,(ROOT/"dist/brandicade.worker.js").read_bytes())
    def test_license_conflict_remains_explicit(self):
        self.assertTrue((ROOT/"LICENSE").read_text().startswith("MIT License"))
        self.assertIn("GPLv3-licensed source",(ROOT/"build_worker.py").read_text())
        readme=(ROOT/"README.md").read_text()
        self.assertIn("discrepancy",readme)
        self.assertIn("cloud-save",readme)
        self.assertIn("Do not deploy",readme)
if __name__=="__main__":
    unittest.main()
