# Datenschutz-Plan: Kassenbon für andere Nutzer (Option A: geschlossene Beta)

**Status:** geplant, noch nicht begonnen. Heute nutzt nur der Betreiber die App (persönliche Nutzung).
**Entscheidung (Okt. 2026):** Andere Leute nutzen die App nur als **geschlossene Beta mit Einladung**
(Freunde, Bekannte). Keine offene Registrierung, keine kommerzielle Nutzung.

> **Regel:** Bevor eine weitere Person außer dem Betreiber Zugang bekommt (z. B. eine E-Mail-Adresse zu
> `ALLOWED_EMAILS` hinzugefügt wird), müssen alle Punkte unter „Pflicht vor dem ersten Gast" erledigt sein.
> Bei jeder Arbeit an Nutzern, Konten, Anmeldung, Speicherung, Logs, Gemini oder neuen gespeicherten Feldern
> diesen Plan prüfen und aktuell halten.

Dies ist eine technische Planung, keine Rechtsberatung. Datenschutzerklärung und Verträge vor dem Start von
jemandem mit Datenschutz-Erfahrung gegenlesen lassen.

## Ausgangslage (Stand Code)

| Thema | Heute |
|---|---|
| Zugang | nur Google-Konten aus `ALLOWED_EMAILS` (Umgebungsvariable in Vercel) |
| Trennung der Nutzer | eine Datenbank, jede Zeile gehört über `user_id` zu einem Konto; jede Abfrage filtert danach (`lib/db/store.ts`, Test „keeps users apart" in `tests/unit/db-store.test.ts`) |
| Gespeichert | Kassenbon-Kopf (Shop, gedruckter Shopname, Filialadresse, Datum, Uhrzeit, Summe, Zahlungsart), alle Zeilen mit Kategorie, Geminis Rohantwort (`raw_extraction`), Kategorie-Korrekturen, E-Mail-Adresse |
| Nicht gespeichert | das Foto; Kartennummern, IBAN, Kundenkartennummern (Prompt verbietet sie) |
| Dienstleister | Vercel (Hosting, Funktionen standardmäßig in den USA, `iad1`), Neon (Postgres, Region prüfen), Google Gemini API (kostenloser Tarif: Inhalte dürfen zur Produktverbesserung genutzt werden) |
| Nutzerrechte | Export als Excel ✓; einzelne Kassenbons löschen ✓; **Konto löschen fehlt** |
| Logs | `console.error(...)` in `lib/api.ts`, `lib/page-data.tsx`, `app/api/extract/route.ts` schreibt ganze Fehlerobjekte in die Vercel-Logs; Datenbankfehler können dabei die Abfrage samt Werten (E-Mail, Produkte) enthalten |

## Pflicht vor dem ersten Gast

### Technik (im Code)

- [ ] **T1 EU-Verarbeitung**
  - [ ] Vercel-Funktionen auf Frankfurt: `web/vercel.json` mit `"regions": ["fra1"]`
  - [ ] Neon-Region prüfen (`neon-carmine-button`). Wenn nicht Frankfurt (`aws-eu-central-1`): neue Datenbank in Frankfurt anlegen und Daten umziehen, bevor Gäste Daten eingeben
  - [ ] Gemini über **Vertex AI in `europe-west3` (Frankfurt)** statt kostenlosem API-Schlüssel (`@google/genai` unterstützt Vertex: `vertexai: true, project, location`); Zugangsdaten als Service-Account in Vercel. Fallback-Modelle und Retries (`lib/gemini.ts`) beibehalten
- [ ] **T2 Konto-Seite** (`/account`)
  - [ ] „Alle Daten als Excel" (vorhandener Export)
  - [ ] „Konto und alle Daten löschen": löscht die Zeile in `users`; alles andere hängt per `ON DELETE CASCADE` daran (prüfen und testen: `stores`, `store_aliases`, `receipts`, `receipt_items`, `category_memory`), danach abmelden
- [ ] **T3 Einwilligung bei der ersten Anmeldung**
  - [ ] Spalten `users.consent_version` und `users.consent_at` (Migration)
  - [ ] Ohne aktuelle Einwilligung: Seite mit Kurzinfo, Link zur Datenschutzerklärung und Häkchen; vorher keine App-Nutzung
  - [ ] Neue Version der Datenschutzerklärung führt zu erneuter Abfrage
- [ ] **T4 Einladungen statt `ALLOWED_EMAILS`**
  - [ ] Tabelle `invitations` (E-Mail, eingeladen von, Datum, angenommen am) oder Rolle `admin` für den Betreiber
  - [ ] Seite für den Betreiber: einladen, Einladung zurückziehen, Gast entfernen (= Konto löschen wie T2)
  - [ ] `ALLOWED_EMAILS` bleibt als Liste der Admins
- [ ] **T5 Keine personenbezogenen Daten in Logs**
  - [ ] Eine Log-Funktion, die nur Fehlerart, Meldung ohne Abfragewerte und eine Kennung schreibt; keine Abfrage-Parameter, keine Kassenbon-Inhalte, keine E-Mail-Adressen
  - [ ] Test, dass ein Datenbankfehler keine Parameter ins Log schreibt
- [ ] **T6 Datenschutzerklärung und Kontakt als Seiten** (`/datenschutz`), ohne Anmeldung erreichbar, verlinkt auf der Anmeldeseite und in der Navigation

### Organisatorisch (Betreiber)

- [ ] **O1 Datenschutzerklärung** schreiben (Entwurf kann generiert werden, passend zu dieser App): Verantwortlicher und Kontakt, welche Daten, Zweck, Rechtsgrundlage (Art. 6 Abs. 1 b DSGVO: Bereitstellung der App; Einwilligung für Gemini-Verarbeitung), Empfänger (Vercel, Neon, Google), Drittlandübermittlung, Speicherdauer, Rechte (Auskunft, Löschung, Export, Widerruf, Beschwerde bei Aufsichtsbehörde)
- [ ] **O2 Verträge zur Auftragsverarbeitung (AVV/DPA)** mit Vercel, Neon und Google Cloud abschließen bzw. akzeptieren und ablegen
- [ ] **O3 Drittlandübermittlung** prüfen: Zertifizierung von Vercel, Neon, Google unter dem EU-US Data Privacy Framework (dataprivacyframework.gov), sonst Standardvertragsklauseln (meist Teil des DPA)
- [ ] **O4 Verzeichnis der Verarbeitungstätigkeiten** (kurzes internes Dokument)
- [ ] **O5 Kurze Risikoabwägung**: Kassenbons erlauben Rückschlüsse auf Gewohnheiten, Wohnort (Filiale), ggf. Gesundheit (Drogerie/Apotheke). Bei kleiner Beta voraussichtlich keine Datenschutz-Folgenabschätzung nötig; Abwägung dokumentieren
- [ ] **O6 Ablauf bei Datenpanne**: wer prüft, Meldung an die Aufsichtsbehörde innerhalb von 72 Stunden, Information der Betroffenen

## Empfohlen, aber nicht Pflicht für die Beta

- [ ] **E1 Row Level Security** in Postgres als zweite Absicherung der Nutzertrennung (Policies auf `user_id`; Verbindung setzt pro Anfrage die Nutzer-ID)
- [ ] **E2 Datensparsamkeit**: `raw_extraction` nach 30 Tagen leeren (geplanter Job), Speicherung der Filialadresse abschaltbar
- [ ] **E3 Löschung inaktiver Konten** nach 12 Monaten mit vorheriger E-Mail
- [ ] **E4 Begrenzung**: maximale Scans pro Nutzer und Tag (Kosten, Missbrauch)
- [ ] **E5 Sicherheits-Header** (Content-Security-Policy u. a.) und automatische Abhängigkeits-Updates
- [ ] **E6 Backups**: Neon-Wiederherstellungsfenster in der Datenschutzerklärung nennen (gelöschte Daten verschwinden aus Backups erst nach Ablauf)

## Nicht Teil von Option A

Offene Registrierung, Impressum für eine öffentliche Website, kommerzielle Nutzung (Vercel Hobby ist nur
nicht-kommerziell). Falls das später gewünscht wird: diesen Plan um Option B erweitern.

## Fertig, wenn

Alle Punkte unter „Pflicht vor dem ersten Gast" sind abgehakt, die Tests (Unit und E2E) decken T2–T5 ab, und
die Datenschutzerklärung ist veröffentlicht. Erst dann den ersten Gast einladen.
