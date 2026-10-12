"""Cryptographic regression tests using certificates generated only during the test."""
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from io import BytesIO

from asn1crypto import keys, x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.writer import PdfFileWriter
from pyhanko.sign.signers import SimpleSigner, PdfSignatureMetadata, sign_pdf
from pyhanko_certvalidator.registry import SimpleCertificateStore
from validate_pdf import validate


def fixture(revoked=False):
    now = datetime.now(timezone.utc)
    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "SAGEP test root")])
    root = (x509.CertificateBuilder().subject_name(root_name).issuer_name(root_name)
            .public_key(root_key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=30))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True)
            .sign(root_key, hashes.SHA256()))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Assinante de teste")])
    leaf = (x509.CertificateBuilder().subject_name(name).issuer_name(root_name)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=15))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
            .sign(root_key, hashes.SHA256()))
    crl_builder = x509.CertificateRevocationListBuilder().issuer_name(root_name).last_update(now - timedelta(hours=1)).next_update(now + timedelta(days=1))
    if revoked:
        crl_builder = crl_builder.add_revoked_certificate(x509.RevokedCertificateBuilder().serial_number(leaf.serial_number).revocation_date(now - timedelta(minutes=5)).build())
    crl = crl_builder.sign(root_key, hashes.SHA256())
    store = SimpleCertificateStore()
    store.register(asn1_x509.Certificate.load(root.public_bytes(serialization.Encoding.DER)))
    signer = SimpleSigner(asn1_x509.Certificate.load(leaf.public_bytes(serialization.Encoding.DER)), keys.PrivateKeyInfo.load(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())), store)
    writer = PdfFileWriter()
    stream = writer.add_object(generic.StreamObject(stream_data=b"q 1 0 0 1 0 0 cm Q"))
    writer.insert_page(generic.DictionaryObject({generic.pdf_name("/Type"): generic.pdf_name("/Page"), generic.pdf_name("/MediaBox"): generic.ArrayObject([generic.NumberObject(v) for v in [0, 0, 200, 200]]), generic.pdf_name("/Resources"): generic.DictionaryObject(), generic.pdf_name("/Contents"): stream}))
    output = sign_pdf(writer, PdfSignatureMetadata(field_name="Signature"), signer=signer)
    return output.getvalue(), root, crl


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.signed, self.root, self.crl = fixture()
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "roots").mkdir()
        (root / "crls").mkdir()
        (root / "roots" / "root.pem").write_bytes(self.root.public_bytes(serialization.Encoding.PEM))
        (root / "crls" / "root.crl").write_bytes(self.crl.public_bytes(serialization.Encoding.DER))
    def tearDown(self):
        self.directory.cleanup()
    def test_valid_signature_with_trust_and_revocation_evidence(self):
        result = validate(self.signed, self.directory.name)
        self.assertEqual(result["status"], "VALID", result)
        self.assertTrue(result["signatures"][0]["intact"])
    def test_unconfigured_trust_is_inconclusive(self):
        result = validate(self.signed)
        self.assertEqual(result["status"], "INDETERMINATE", result)
        self.assertTrue(result["signatures"][0]["cryptographicallyValid"])
    def test_tampered_signed_bytes_are_invalid(self):
        changed = self.signed.replace(b"/MediaBox [ 0 0 200 200 ]", b"/MediaBox [ 0 0 201 200 ]", 1)
        self.assertNotEqual(changed, self.signed)
        self.assertEqual(validate(changed, self.directory.name)["status"], "INVALID")
    def test_missing_revocation_information_is_inconclusive(self):
        (Path(self.directory.name) / "crls" / "root.crl").unlink()
        self.assertEqual(validate(self.signed, self.directory.name)["status"], "INDETERMINATE")
    def test_revoked_certificate_is_invalid(self):
        data, root, crl = fixture(revoked=True)
        folder = Path(self.directory.name)
        (folder / "roots" / "root.pem").write_bytes(root.public_bytes(serialization.Encoding.PEM))
        (folder / "crls" / "root.crl").write_bytes(crl.public_bytes(serialization.Encoding.DER))
        self.assertEqual(validate(data, self.directory.name)["status"], "INVALID")


if __name__ == "__main__":
    unittest.main()
