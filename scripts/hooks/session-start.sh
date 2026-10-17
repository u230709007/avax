#!/usr/bin/env bash
# SessionStart hook: Claude'a önce haritayı ve dersleri verir; repoyu baştan taramasın.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "=== CLAUDE.md (proje haritası; önce bunu kullan, tüm repoyu tarama) ==="
cat CLAUDE.md 2>/dev/null
echo
echo "=== LEARN.md (geçmiş hatalardan kurallar) ==="
cat LEARN.md 2>/dev/null
lines=$(wc -l < LEARN.md 2>/dev/null || echo 0)
rules=$(grep -c '^\[L-[0-9]\{3\}\]' LEARN.md 2>/dev/null || echo 0)
if [ "$lines" -gt 120 ] || [ "$rules" -gt 40 ]; then
  echo
  echo "UYARI: LEARN.md sınırı aştı ($lines satır, $rules kural). Başka işe geçmeden önce LEARN.md başındaki sıkıştırma adımlarını uygula."
fi
exit 0
