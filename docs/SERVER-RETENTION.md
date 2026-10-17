# Private server storage retention

Approved 2026-10-18 for `192.168.178.96`. This policy covers Image Gen, Novel Studio and Tales Past Midnight. It does not publish or deploy application changes.

## Retained on the server

- The running application release and one immediately preceding rollback release per app, including its Docker image and configuration/source folder.
- The two newest complete backup entries per app, and the two newest Image Gen automatic `before-v*.zip` recovery archives.
- All live databases, artwork, design/image versions, shared runtime files, encryption keys, credentials, worker conversations and Docker volumes.

Older release folders, staged archives/binaries and backup files move to the Windows workstation's `%LOCALAPPDATA%\ImageGenBuild\server-retention\` before deletion. Existing Image Gen full backups also have separately checksum-verified copies in `%LOCALAPPDATA%\ImageGenBuild\server-backups\`. Off-server archives are not automatically expired. They contain private data and must never be committed or published.

## Maintenance

From the repository on the Windows workstation:

```powershell
python scripts/server-retention.py             # show the retention plan
python scripts/server-retention.py --apply     # archive, verify, then clean
python scripts/server-retention.py --preflight # require deployment headroom
python scripts/server-retention.py --register  # after verifying a newly deployed release
```

The existing SSH identity is required. A server lock prevents concurrent maintenance. The tool verifies the current release agrees with the running container, requires rollback images to exist, fingerprints every retired artifact, streams it directly off-server, reads back and verifies every archived file/link, rechecks the source and current-release pointers, then deletes only explicitly allowed artifact paths. Helpers have Docker logging disabled to prevent binary archive streams filling server logs. If verification fails, deletion does not proceed. It never stops/removes live containers or deletes volumes. Every container's image is protected, including other applications. Unprotected old images and unused build cache are removed after archiving. Evidence is saved beside the off-server archive.

Run maintenance before and after each qualified deployment. Before downloading/building images or stopping any service for backup, run `--preflight`: it requires at least 5 GiB free, or twice the current Image Gen volume size plus 2 GiB, whichever is larger. A failed preflight blocks the deployment until space is available. After the new deployment passes its health and user-flow qualification, run `--register` to promote the former current version to rollback, then run `--apply`. Pins are kept privately in `~/imagegen-server/retention-pins.json`. Routine maintenance refuses cleanup if the current release changes without registration; an arbitrary staged release cannot displace the known rollback. Keep a matching full data backup for application rollback; do not assume older code can read a migrated database.

All three applications' deployment commands must hold the same server-side `~/imagegen-server/.retention.lock` with `flock` for image pulls/builds, staging, backups and cutover. Release the lock before invoking workstation registration/maintenance, which acquires it itself. This serialises maintenance with deployment and protects new images between staging and startup.

Tales Past Midnight's historical image tag was overwritten. Its retained previous source release was rebuilt and separately tagged `imagegen-retained/tpm-rollback:20260925-200257`, without replacing the running service. Future TPM deployments must keep a separately tagged image for the previous source release before maintenance; a missing rollback image deliberately blocks cleanup.

Daily maintenance is attached to this chat and runs on the workstation; it requires the workstation and server to be available. It stays quiet on successful routine runs and reports failures or verification problems. This is additional protection; deployment preflight remains required.

## Build policy

Build new backend releases from the maintained clean runtime base, using the repository Dockerfile. Do not repeatedly base a full application replacement on its previous application image: hidden old layers remain in the running image even after old tags are removed. Small frontend preview layers are acceptable temporarily, but consolidate them into the next clean build. Novel Studio's existing current/rollback images contain historical layers; they remain intact in this cleanup and should be consolidated on its next qualified deployment.

No public release, application upgrade or scheduled artwork generation is part of retention.
