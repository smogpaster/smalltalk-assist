import type { LanguageCode, Suggestion } from '../core/types'

export interface ScriptLine {
  speaker: 'self' | 'other'
  text: string
  /** Silence after this line, in ms. */
  pauseMs: number
  /** Canned suggestions the mock LLM returns after this line (other speaker only). */
  suggestions?: Suggestion[]
}

const de: ScriptLine[] = [
  { speaker: 'other', text: 'Hallo, ich glaube, wir kennen uns noch nicht. Ich bin Miriam.', pauseMs: 1800,
    suggestions: [
      { kind: 'reply', text: 'Freut mich, Miriam! Ich bin neu hier – woher kennst du die Gastgeber?' },
      { kind: 'question', text: 'Was führt dich heute Abend hierher?' },
      { kind: 'question', text: 'Bist du öfter bei diesen Treffen?' },
    ] },
  { speaker: 'self', text: 'Freut mich, Miriam. Was führt dich heute hierher?', pauseMs: 900 },
  { speaker: 'other', text: 'Ich arbeite bei einem Start-up für Solarspeicher, und unser Gründer hält gleich einen Vortrag.', pauseMs: 2200,
    suggestions: [
      { kind: 'question', text: 'Was macht eure Speicher anders als die großen Anbieter?' },
      { kind: 'reply', text: 'Spannend – ich habe gerade selbst über eine PV-Anlage nachgedacht.' },
      { kind: 'question', text: 'Wie bist du zu dem Start-up gekommen?' },
    ] },
  { speaker: 'self', text: 'Spannend. Wie bist du zu dem Start-up gekommen?', pauseMs: 900 },
  { speaker: 'other', text: 'Ehrlich gesagt über das Segeln. Der Gründer war in meinem Segelverein.', pauseMs: 2400,
    suggestions: [
      { kind: 'question', text: 'Du segelst? Wo bist du am liebsten unterwegs?' },
      { kind: 'reply', text: 'Ich war einmal auf der Ostsee – bei Windstärke 5 war ich froh über festen Boden.' },
      { kind: 'question', text: 'Seit wann segelst du schon?' },
    ] },
  { speaker: 'self', text: 'Du segelst? Wo bist du am liebsten unterwegs?', pauseMs: 900 },
  { speaker: 'other', text: 'Meistens auf dem Bodensee, im Sommer auch mal in Kroatien. Und du, was machst du so?', pauseMs: 3000,
    suggestions: [
      { kind: 'reply', text: 'Kurz zu mir: Beruf in einem Satz, dann eine Gegenfrage stellen.' },
      { kind: 'question', text: 'Kroatien klingt toll – welche Ecke gefällt dir dort am besten?' },
      { kind: 'topic', text: 'Übergang: Reisen – was war dein schönster Urlaub bisher?' },
    ] },
]

const en: ScriptLine[] = [
  { speaker: 'other', text: "Hi, I don't think we've met. I'm Sam.", pauseMs: 1800,
    suggestions: [
      { kind: 'reply', text: "Nice to meet you, Sam! I'm new here – how do you know the hosts?" },
      { kind: 'question', text: 'What brings you here tonight?' },
      { kind: 'question', text: 'Do you come to these meetups often?' },
    ] },
  { speaker: 'self', text: 'Nice to meet you, Sam. What brings you here tonight?', pauseMs: 900 },
  { speaker: 'other', text: 'I work at a small robotics company, and a colleague of mine is giving a talk later.', pauseMs: 2200,
    suggestions: [
      { kind: 'question', text: 'What kind of robots do you build?' },
      { kind: 'reply', text: "Robotics! I've always wondered what a normal workday there looks like." },
      { kind: 'question', text: "What's your colleague's talk about?" },
    ] },
  { speaker: 'self', text: 'What kind of robots do you build?', pauseMs: 900 },
  { speaker: 'other', text: 'Mostly warehouse robots. But honestly, my real passion is baking bread on weekends.', pauseMs: 2400,
    suggestions: [
      { kind: 'question', text: 'Sourdough? How long have you been baking?' },
      { kind: 'reply', text: 'I tried sourdough once – my starter did not survive the week.' },
      { kind: 'question', text: "What's the best loaf you've ever made?" },
    ] },
  { speaker: 'self', text: 'Sourdough? How long have you been baking?', pauseMs: 900 },
  { speaker: 'other', text: 'About three years now. It started during a long winter. What about you, what do you do?', pauseMs: 3000,
    suggestions: [
      { kind: 'reply', text: 'Your job in one sentence, then ask something back.' },
      { kind: 'question', text: 'Do you ever bake for your team at work?' },
      { kind: 'topic', text: 'Bridge to food: any favourite bakery in town?' },
    ] },
]

const ja: ScriptLine[] = [
  { speaker: 'other', text: 'はじめまして、佐藤です。こちらは初めてですか？', pauseMs: 1800,
    suggestions: [
      { kind: 'reply', text: 'はじめまして！はい、今日が初めてです。佐藤さんはよく来られるんですか？' },
      { kind: 'question', text: '今日はどなたのご紹介で？' },
      { kind: 'question', text: 'このイベントはどんな雰囲気ですか？' },
    ] },
  { speaker: 'self', text: 'はい、初めてです。佐藤さんはよく来られるんですか？', pauseMs: 900 },
  { speaker: 'other', text: '月に一回くらいですね。普段はデザインの仕事をしています。', pauseMs: 2200,
    suggestions: [
      { kind: 'question', text: 'どんなデザインを手がけているんですか？' },
      { kind: 'reply', text: 'デザインいいですね。最近気になった作品はありますか？' },
      { kind: 'question', text: 'デザインの仕事を始めたきっかけは？' },
    ] },
  { speaker: 'self', text: 'どんなデザインをされているんですか？', pauseMs: 900 },
  { speaker: 'other', text: '主にアプリの画面です。でも週末は山登りばかりしています。', pauseMs: 2400,
    suggestions: [
      { kind: 'question', text: '山登り！最近はどの山に登りましたか？' },
      { kind: 'reply', text: '私も高尾山なら登ったことがあります。' },
      { kind: 'question', text: 'おすすめの初心者向けの山はありますか？' },
    ] },
]

export const DEMO_SCRIPTS: Record<LanguageCode, ScriptLine[]> = { de, en, ja }
