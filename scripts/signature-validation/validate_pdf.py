"""Local PDF validation. No document, certificate or URL is sent to a remote service."""
import hashlib
import json
import logging
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from pyhanko.keys import load_cert_from_pemder
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.status import SignatureCoverageLevel
from pyhanko_certvalidator import ValidationContext

logging.disable(logging.CRITICAL)
MAX_BYTES = 25 * 1024 * 1024
MAX_SIGNATURES = 20


def validate(data, trust_directory=""):
    checked_at = datetime.now(timezone.utc)
    result = {"validator": "pyHanko 0.33.0", "validatedAt": checked_at.isoformat(),
              "checksumSha256": hashlib.sha256(data).hexdigest(),
              "status": "INDETERMINATE", "scope": "LOCAL_CRYPTOGRAPHIC_CHECK",
              "networkFetching": False, "signatures": [], "warnings": []}
    if not data.startswith(b"%PDF-") or len(data) > MAX_BYTES:
        raise ValueError("Invalid PDF")
    roots, intermediates, crls, ocsps = [], [], [], []
    if trust_directory:
        root = Path(trust_directory)
        for folder, target in (("roots", roots), ("intermediates", intermediates)):
            for cert in sorted((root / folder).glob("*")):
                if cert.suffix.lower() in (".pem", ".crt", ".cer", ".der"):
                    target.append(load_cert_from_pemder(str(cert)))
        for file in sorted((root / "crls").glob("*.crl")):
            crls.append(file.read_bytes())
        for file in sorted((root / "ocsps").glob("*.der")):
            ocsps.append(file.read_bytes())
    reader = PdfFileReader(BytesIO(data), strict=True)
    signatures = reader.embedded_regular_signatures
    if not signatures:
        result["status"] = "NOT_SIGNED"
        result["warnings"].append("Nenhuma assinatura digital embarcada encontrada.")
        return result
    if len(signatures) > MAX_SIGNATURES:
        raise ValueError("Too many signatures")
    for signature in signatures:
        cert = signature.signer_cert
        # Do not treat embedded certificates as trusted roots. Revocation evidence is
        # supplied by the administrator or embedded in the signed document (DSS).
        from pyhanko.sign.validation.dss import DocumentSecurityStore
        try:
            dss = DocumentSecurityStore.read_dss(reader)
            vc = dss.as_validation_context({"trust_roots": roots, "other_certs": intermediates,
                 "allow_fetching": False, "revocation_mode": "require", "crls": crls, "ocsps": ocsps})
        except Exception:
            vc = ValidationContext(trust_roots=roots, other_certs=intermediates,
                 crls=crls, ocsps=ocsps, allow_fetching=False, revocation_mode="require")
        entry = {"fieldName": signature.field_name, "signerName": str(cert.subject.native.get("common_name", "Assinante")),
                 "issuerName": str(cert.issuer.native.get("common_name", "Emissor")),
                 "certificateSha256": hashlib.sha256(cert.dump()).hexdigest(),
                 "certificateNotBefore": cert.not_valid_before.isoformat(),
                 "certificateNotAfter": cert.not_valid_after.isoformat(),
                 "claimedSigningTime": signature.self_reported_timestamp.isoformat() if signature.self_reported_timestamp else None,
                 "status": "INDETERMINATE", "intact": None, "cryptographicallyValid": None,
                 "trusted": False, "revoked": None, "coversCurrentDocument": False, "modificationsAllowed": None}
        try:
            status = validate_pdf_signature(signature, signer_validation_context=vc, ts_validation_context=vc)
            complete_coverage = status.coverage in (SignatureCoverageLevel.ENTIRE_FILE, SignatureCoverageLevel.ENTIRE_REVISION)
            entry.update({"intact": status.intact, "cryptographicallyValid": status.valid,
                          "trusted": status.trusted, "revoked": status.revoked,
                          "coversCurrentDocument": complete_coverage, "modificationsAllowed": status.docmdp_ok,
                          "coverage": status.coverage.name if status.coverage else "UNKNOWN"})
            if not status.intact or not status.valid or status.revoked or not complete_coverage or status.docmdp_ok is False:
                entry["status"] = "INVALID"
            elif status.bottom_line and roots:
                entry["status"] = "VALID"
        except Exception:
            entry["diagnostic"] = "Não foi possível concluir a validação desta assinatura."
        result["signatures"].append(entry)
    states = [entry["status"] for entry in result["signatures"]]
    result["status"] = "INVALID" if "INVALID" in states else "VALID" if all(state == "VALID" for state in states) else "INDETERMINATE"
    if not roots:
        result["warnings"].append("Raízes de confiança não configuradas: a confiança do certificado não foi confirmada.")
    if result["status"] == "INDETERMINATE":
        result["warnings"].append("Validação inconclusiva. Verifique cadeia, validade e evidências de revogação; use o VALIDAR/ITI quando necessário.")
    result["warnings"].append("O horário informado pelo assinante não equivale a um carimbo do tempo confiável. Esta análise não certifica conformidade jurídica ICP-Brasil/GOV.BR.")
    return result


if __name__ == "__main__":
    try:
        # Bound resources even for hostile compressed PDF streams.
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        data = sys.stdin.buffer.read(MAX_BYTES + 1)
        print(json.dumps(validate(data, sys.argv[1] if len(sys.argv) > 1 else ""), ensure_ascii=False))
    except Exception:
        print(json.dumps({"error": "PDF ou configuração de validação inválidos"}))
        sys.exit(2)
