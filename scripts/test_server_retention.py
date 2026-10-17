import hashlib
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('retention',Path(__file__).with_name('server-retention.py'))
retention=importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class ArchiveVerification(unittest.TestCase):
    def test_requires_complete_matching_archive_before_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'original';source.write_bytes(b'preserve this backup')
            archive=root/'archive.tar.gz'
            with tarfile.open(archive,'w:gz') as target:target.add(source,arcname='original')
            record={'/original':{'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'size':source.stat().st_size}}
            retention.validate_archive(archive,record)
            with self.assertRaises(AssertionError):retention.validate_archive(archive,{})
            with self.assertRaises(AssertionError):retention.validate_archive(archive,{**record,'/missing':{'directory':True}})
            with self.assertRaises(AssertionError):retention.validate_archive(archive,{'/original':{'sha256':'0'*64}})

    def test_root_helper_defaults_to_read_only_without_network(self):
        script=retention.root_code('print(1)')
        self.assertIn('dst=/host,readonly',script)
        self.assertIn("'--network','none'",script)
        self.assertIn("'--log-driver','none'",script)
        self.assertIn('dst=/host\'',retention.root_code('print(1)',True))

    def test_private_configuration_links_are_preserved_without_following_them(self):
        with tempfile.TemporaryDirectory() as temp:
            archive=Path(temp)/'archive.tar.gz'
            with tarfile.open(archive,'w:gz') as target:
                link=tarfile.TarInfo('release/.env');link.type=tarfile.SYMTYPE
                link.linkname='/shared/.env';target.addfile(link)
            retention.validate_archive(archive,{'/release/.env':{'link':'/shared/.env'}})
            with self.assertRaises(AssertionError):
                retention.validate_archive(archive,{'/release/.env':{'link':'/wrong/.env'}})


if __name__=='__main__':unittest.main()
