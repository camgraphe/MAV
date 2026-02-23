# FFmpeg LGPL-only Compliance Checklist

Build-time checks:
- [ ] Configure includes `--disable-gpl`.
- [ ] Configure includes `--disable-nonfree`.
- [ ] Build does not enable `libx264`, `libx265`, `libfdk-aac`.
- [ ] Build scripts and configure logs are archived.

Release artifact checks:
- [ ] Save `ffmpeg -version` output.
- [ ] Save `ffmpeg -buildconf` output.
- [ ] Save `ffmpeg -encoders` output.
- [ ] Attach SBOM and image digest.
- [ ] Ship FFmpeg license and copyright notices.
- [ ] Publish matching FFmpeg source reference for distributed binaries.

Runtime boundary checks:
- [ ] FFmpeg only runs in isolated render-worker service.
- [ ] Core/editor bundle does not include FFmpeg binaries.
- [ ] Service invoked by API contract, not by static linking.
