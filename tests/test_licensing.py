import sys
import types
import unittest
from unittest.mock import patch, MagicMock

import licensing


class MachineCodeTests(unittest.TestCase):
    def test_stable_code_from_windows_identity(self):
        winreg = types.SimpleNamespace(HKEY_LOCAL_MACHINE=1, OpenKey=MagicMock(), QueryValueEx=MagicMock())
        winreg.OpenKey.return_value.__enter__.return_value = object()
        with patch.object(sys, 'platform', 'win32'), patch.dict(sys.modules, {'winreg': winreg}):
            winreg.QueryValueEx.return_value = ('sample-windows-guid', 1)
            first = licensing.machine_code()
            self.assertEqual(first, licensing.machine_code())
            self.assertRegex(first, r'^[A-F0-9]{32}$')
            winreg.QueryValueEx.return_value = ('another-install', 1)
            self.assertNotEqual(first, licensing.machine_code())


if __name__ == '__main__':
    unittest.main()
