# ADR 004 — Kalıcı durum için node:sqlite

- **Karar:** Kalıcı durum için node:sqlite
- **Neden:** Native derleme gerektirmez, Node 22 ile gelir; limitler restart'ta sıfırlanmaz.
- **Değerlendirilen alternatifler:** better-sqlite3 (native build riski), bellek içi durum (restart ile limit aşımı).
- **Tarih:** 2026-10-16
