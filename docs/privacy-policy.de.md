# Datenschutzerklärung – SmallTalk Assist

> Vor der Veröffentlichung am besten rechtlich prüfen lassen (siehe Abschnitt 6).

Stand: 24.09.2026

## 1. Verantwortlicher

Smogpaster
Pfleghofstr. 6
72070 Tübingen
Deutschland
E-Mail: peter@greza.de

## 2. Worum es geht

SmallTalk Assist ist eine App für die Smart-Brille Even Realities G2. Sie hört
einem Gespräch zu, lässt es transkribieren und zeigt auf der Brille kurze
Gesprächsvorschläge an. Die App läuft in der Even-Realities-App auf deinem
Smartphone. **Der Anbieter von SmallTalk Assist betreibt keine eigenen Server
und erhält keine Daten aus deiner Nutzung.**

## 3. Welche Daten wohin gehen

### 3.1 Während eines Gesprächs (nur wenn du eines startest)

| Daten | Empfänger | Zweck |
|---|---|---|
| Audio vom Mikrofon der Brille oder des Handys | der von dir gewählte Spracherkennungs-Anbieter (Soniox, Deepgram, Speechmatics oder Gladia) | Umwandlung in Text |
| Text der letzten Gesprächsminuten, dein aktives Profil und ggf. Angaben zu deinem Gegenüber | der von dir gewählte KI-Anbieter (z. B. Anthropic, OpenAI, Google, Mistral oder ein OpenAI-kompatibler Anbieter) | Erzeugung kurzer Vorschläge |

Die Übertragung erfolgt verschlüsselt (HTTPS/WSS) und direkt von deinem
Smartphone an den Anbieter, mit **deinem eigenen API-Key**. Für die
Verarbeitung beim jeweiligen Anbieter gelten dessen Datenschutzbestimmungen
und Vertragsbedingungen; du schließt den Vertrag mit dem Anbieter selbst ab.

Transkripte und Vorschläge werden von SmallTalk Assist **nicht gespeichert**.
Sie existieren nur im Arbeitsspeicher und werden beim Beenden des Gesprächs
verworfen. Das gilt auch für erkannte Namen (Funktion „Namensmerker").

### 3.2 Lokal auf deinem Smartphone

Im Speicher der Even-Realities-App auf deinem Gerät werden abgelegt:
Einstellungen, deine API-Keys, deine Profile, optionale Angaben zu deinem
Gegenüber und ein technisches Diagnose-Protokoll. Das Protokoll enthält
**keine Gesprächsinhalte, keine Vorschläge und keine Keys**, sondern nur
Ereignisse, Zeiten und Fehlerarten; es verlässt das Gerät nur, wenn du es
selbst kopierst und weitergibst.

Du kannst alle diese Daten jederzeit unter *Einstellungen → Daten → Alle
Daten löschen* entfernen.

### 3.3 Keine Analyse, keine Werbung

Es gibt keine Analyse-, Tracking- oder Werbedienste und keine Weitergabe an
andere Stellen.

## 4. Berechtigungen der App

| Berechtigung | Wofür |
|---|---|
| `g2-microphone` | Mikrofon der Brille während eines laufenden Gesprächs; Audio geht nur an deinen Spracherkennungs-Anbieter |
| `phone-microphone` | alternativ das Mikrofon des Handys (in den Einstellungen wählbar), gleiche Verwendung |
| `network` | Verbindungen ausschließlich zu den Servern der auswählbaren Anbieter: api.soniox.com, stt-rt.soniox.com, api.deepgram.com, mp.speechmatics.com, eu.rt.speechmatics.com, api.gladia.io, api.anthropic.com, api.openai.com, generativelanguage.googleapis.com, api.mistral.ai, openrouter.ai, api.groq.com, api.together.xyz, api.deepseek.com, api.cerebras.ai, api.fireworks.ai, api.x.ai |

## 5. Hinweis zu Gesprächspartnern

Bitte informiere die Menschen, mit denen du sprichst, dass ihre Worte
transkribiert und an Dritte übertragen werden. Das Aufnehmen oder Übertragen
nicht öffentlich gesprochener Worte kann gesetzlich geregelt sein (in
Deutschland z. B. § 201 StGB). Dieser Hinweis ist keine Rechtsberatung.

## 6. Rechtsgrundlage

Die Verarbeitung auf deinem Gerät und die Übermittlung an die von dir
gewählten Anbieter erfolgen auf deine Veranlassung zur Nutzung der Funktion
(Art. 6 Abs. 1 lit. b DSGVO bzw. lit. a, soweit du einwilligst).

## 7. Deine Rechte

Da der Anbieter von SmallTalk Assist keine personenbezogenen Daten erhält,
richten sich Auskunfts-, Lösch- und Widerspruchsrechte bezüglich der
Anbieter-Verarbeitung an den jeweiligen Spracherkennungs- bzw. KI-Anbieter.
Lokale Daten kannst du selbst löschen (siehe 3.2). Bei Fragen: peter@greza.de.
Du hast das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.

## 8. Änderungen

Wenn sich die App ändert, passen wir diese Erklärung an. Die jeweils aktuelle
Fassung ist im Even Hub bei der App verlinkt.
