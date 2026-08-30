ALTER TABLE "SystemConfiguration"
  ADD COLUMN "deploymentHostName" TEXT,
  ADD COLUMN "deploymentExpectedIp" TEXT,
  ADD COLUMN "deploymentGateway" TEXT,
  ADD COLUMN "deploymentDnsServers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "deploymentNtpServers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "deploymentAllowedNetworks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "deploymentProxyUrl" TEXT,
  ADD COLUMN "deploymentCertificateMode" TEXT NOT NULL DEFAULT 'INTERNAL_CA';
