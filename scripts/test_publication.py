import tempfile
import unittest
from pathlib import Path

from check_publication import check, git


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / '.gitignore').write_text('.env\n*.db\nbackups/\n')

    def test_before_git_init(self):
        (self.root / '.env').write_text('BOT_TOKEN=local-private-value\n')
        (self.root / 'app.db').write_bytes(b'private database')
        (self.root / 'app.py').write_text('print("hello")\n')
        paths, findings = check(self.root)
        self.assertEqual(set(paths), {'.gitignore', 'app.py'})
        self.assertEqual(findings, [])

    def test_copied_secret_and_personal_path(self):
        (self.root / '.env').write_text('BOT_TOKEN=local-private-value\n')
        (self.root / 'app.py').write_text('token = "local-private-value"\n')
        (self.root / 'notes.md').write_text('/' + 'Users/example/private-file')
        _, findings = check(self.root)
        self.assertIn(('app.py', 'value copied from local environment'), findings)
        self.assertIn(('notes.md', 'personal home path'), findings)

    def test_ignored_but_tracked_file(self):
        git(self.root, 'init')
        (self.root / '.env').write_text('BOT_TOKEN=local-private-value\n')
        git(self.root, 'add', '-f', '.env')
        _, findings = check(self.root)
        self.assertTrue(any(path == '.env' for path, _ in findings))

    def test_staged_secret_even_if_working_copy_is_clean(self):
        git(self.root, 'init')
        token = '123456789:' + 'a' * 35
        (self.root / 'app.py').write_text(f'token = "{token}"\n')
        git(self.root, 'add', 'app.py')
        (self.root / 'app.py').write_text('token = ""\n')
        _, findings = check(self.root)
        self.assertIn(('app.py (staged)', 'Telegram bot token'), findings)


if __name__ == '__main__':
    unittest.main()
