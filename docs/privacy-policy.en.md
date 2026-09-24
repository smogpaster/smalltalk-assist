# Privacy Policy – SmallTalk Assist

Last updated: 24 September 2026

## 1. Controller

Smogpaster
Pfleghofstr. 6
72070 Tübingen
Germany
Email: peter@greza.de

## 2. What the app does

SmallTalk Assist is an app for Even Realities G2 smart glasses. It listens to
a conversation, has it transcribed and shows short conversation suggestions
on the glasses. It runs inside the Even Realities app on your phone. **The
publisher of SmallTalk Assist runs no servers and receives no data from your
use of the app.**

## 3. What data goes where

### 3.1 During a conversation (only when you start one)

| Data | Recipient | Purpose |
|---|---|---|
| Audio from the glasses or phone microphone | the speech-recognition provider you chose (Soniox, Deepgram, Speechmatics or Gladia) | turning speech into text |
| Text of the last minutes of the conversation, your active profile and optional notes about the other person | the AI provider you chose (e.g. Anthropic, OpenAI, Google, Mistral or an OpenAI-compatible provider) | generating short suggestions |

Data is sent encrypted (HTTPS/WSS), directly from your phone to the provider,
using **your own API key**. The provider's own privacy policy and terms
apply to its processing; you contract with the provider yourself.

SmallTalk Assist **does not store** transcripts or suggestions. They exist in
memory only and are discarded when the conversation ends. This includes names
noted by the "remember names" feature.

### 3.2 On your phone

The Even Realities app's storage on your device holds: settings, your API
keys, your profiles, optional notes about the other person and a technical
diagnostics log. The log contains **no conversation content, no suggestions
and no keys** – only events, timings and error types – and leaves the device
only if you copy and share it yourself.

You can remove all of this at any time under *Settings → Data → Delete all
data*.

### 3.3 No analytics, no ads

There are no analytics, tracking or advertising services and no sharing with
anyone else.

## 4. App permissions

| Permission | Used for |
|---|---|
| `g2-microphone` | glasses microphone during a running conversation; audio goes only to your speech-recognition provider |
| `phone-microphone` | the phone microphone as an alternative (selectable in settings), same use |
| `network` | connections only to the servers of the selectable providers: api.soniox.com, stt-rt.soniox.com, api.deepgram.com, mp.speechmatics.com, eu.rt.speechmatics.com, api.gladia.io, api.anthropic.com, api.openai.com, generativelanguage.googleapis.com, api.mistral.ai, openrouter.ai, api.groq.com, api.together.xyz, api.deepseek.com, api.cerebras.ai, api.fireworks.ai, api.x.ai |

## 5. The people you talk to

Please tell the people you talk to that their words are transcribed and sent
to third parties. Recording or transmitting privately spoken words may be
regulated by law (in Germany e.g. Section 201 of the Criminal Code). This
note is not legal advice.

## 6. Legal basis

Processing on your device and the transfer to the providers you selected
happen at your request to use the feature (Art. 6(1)(b) GDPR, or (a) where
you consent).

## 7. Your rights

As the publisher receives no personal data, requests about access, deletion
or objection regarding provider processing go to the respective provider.
You can delete local data yourself (see 3.2). Questions: peter@greza.de. You
have the right to lodge a complaint with a data protection authority.

## 8. Changes

We update this policy when the app changes. The current version is linked
from the app's Even Hub listing.
