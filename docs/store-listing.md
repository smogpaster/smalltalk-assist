# Even Hub store listing – SmallTalk Assist

Assets in `store/` (all greyscale, checked):

| File | Use |
|---|---|
| `icon-foreground.png` / `-1024.png` | icon foreground (transparent) |
| `icon-background.png` | icon background (solid) |
| `icon.png` / `icon-1024.png` | composed icon, for previews |
| `background.png` (1280×720) | store background image |
| `screenshots/*.png` (576×288) | English, captured with the simulator's screenshot API, demo mode |

The portal did not document pixel sizes; SVG sources are next to the PNGs, so
other sizes are one `rsvg-convert -w <n> -h <n>` away.

---

## Deutsch

**Name:** SmallTalk Assist

**Kurzbeschreibung:** Gesprächsideen live auf der Brille – mit deinen eigenen KI-Keys.

**Beschreibung:**
SmallTalk Assist hilft dir, im Gespräch nie um Worte verlegen zu sein. Die App
hört zu, lässt das Gespräch transkribieren und blendet kurze Vorschläge auf
deiner G2 ein: passende Fragen und Ideen für Antworten – besonders dann, wenn
dein Gegenüber dich gerade etwas fragt.

- Vorschläge im Vorbeischauen, 1–3 gleichzeitig, durchblättern per Wischen
- wahlweise Antwortideen oder nur Stichpunkte und Fragen – du formulierst selbst
- Profile (Networking, Familienfeier, Kundentermin …) mit Ton, Themen zum Vermeiden und Zielen
- Infos zu deinem Gegenüber für das nächste Gespräch
- erkennt, wer spricht – Vorschläge reagieren auf dein Gegenüber
- Zusatzfunktionen: Themenwechsel, Namensmerker, Rückbezug, Begriffserklärer, Ausstiegs-Satz, Zusammenfassung, Flaute-Erkennung, Redeanteil-Hinweis
- Deutsch, Englisch, Japanisch und weitere Gesprächssprachen
- Demo-Modus zum Ausprobieren ohne Keys

Bring your own key: Du wählst einen Spracherkennungs-Anbieter (Soniox,
Deepgram, Speechmatics, Gladia) und einen KI-Anbieter (Claude, OpenAI, Gemini,
Mistral oder OpenAI-kompatible) und nutzt deine eigenen API-Keys. Die App
zeigt eine Kostenschätzung pro Gesprächsstunde.

Datenschutz: keine eigenen Server, keine Analyse. Transkripte und Vorschläge
werden nicht gespeichert. Bitte informiere dein Gegenüber.

**Release Notes 1.0.0:** Live-Gesprächsvorschläge auf der G2 mit eigenen
Spracherkennungs- und KI-Keys, Profilen und optionalen Zusatzfunktionen.

## English

**Name:** SmallTalk Assist

**Tagline:** Live conversation ideas on your glasses – with your own AI keys.

**Description:**
SmallTalk Assist makes sure you never run out of things to say. It listens,
has the conversation transcribed and shows short suggestions on your G2:
questions to ask and ideas for replies – especially when the other person has
just asked you something.

- Glanceable suggestions, 1–3 at a time, swipe to page
- Reply ideas, or just keywords and questions – you do the talking
- Profiles (networking, family party, client meeting …) with tone, topics to avoid and goals
- Notes about the person you're meeting
- Knows who is speaking – suggestions react to the other person
- Extras: change topic, remember names, callbacks, term explainer, exit line, recap, lull detection, talk-share hint
- English, German, Japanese and more conversation languages
- Demo mode to try it without keys

Bring your own key: choose a speech-recognition provider (Soniox, Deepgram,
Speechmatics, Gladia) and an AI provider (Claude, OpenAI, Gemini, Mistral or
OpenAI-compatible) and use your own API keys. The app shows a cost estimate
per hour of conversation.

Privacy: no servers of our own, no analytics. Transcripts and suggestions are
not stored. Please tell the people you talk to.

**Release notes 1.0.0:** Live conversation suggestions on the G2 with your own
speech and AI keys, profiles and optional extras.

## 日本語

**名前：** SmallTalk Assist

**キャッチコピー：** 会話のヒントをグラスにリアルタイム表示。あなた自身のAIキーで。

**説明：**
SmallTalk Assist は会話を聞き取り、G2 に短い提案を表示します。相手への質問や
返答のアイデアを、特に相手から質問されたときにすぐ提案します。

- ひと目で読める提案（同時に1〜3件、スワイプで切り替え）
- 返答案か、キーワードと質問だけかを選択可能
- プロフィール（ネットワーキング、家族の集まり、商談など）：トーン、避けたい話題、目的
- 会話相手のメモ
- 話者を判別し、相手の発言に反応
- 追加機能：話題を変える、名前メモ、振り返り、用語の説明、切り上げの一言、要約、沈黙の検知、発言量のヒント
- 日本語・英語・ドイツ語ほか多言語の会話に対応
- キー不要のデモモード

ご自身のAPIキーを使用：音声認識（Soniox、Deepgram、Speechmatics、Gladia）と
AI（Claude、OpenAI、Gemini、Mistral、OpenAI互換）を選べます。1時間あたりの
費用の目安も表示されます。

プライバシー：独自サーバーなし、分析なし。文字起こしと提案は保存されません。
会話の相手にお知らせください。

**リリースノート 1.0.0：** 自分の音声認識・AIキーで使える、G2向けリアルタイム
会話提案。プロフィールと追加機能付き。

---

## Permission texts (as in app.json)

- **g2-microphone:** Listens to the conversation while a session is running so it can be transcribed and short suggestions can be shown. Audio is streamed to the speech provider you chose and never stored.
- **phone-microphone:** Optional alternative to the glasses microphone, selectable in settings. Audio is streamed to the speech provider you chose and never stored.
- **network:** Sends audio and transcript text only to the speech and AI providers you selected, using your own API keys. No other servers, no analytics.
