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
      { kind: 'hook', text: 'Wie sie die Gastgeber kennt' },
      { kind: 'hook', text: 'Anlass für heute Abend' },
      { kind: 'hook', text: 'Ob sie öfter hier ist' },
    ] },
  { speaker: 'self', text: 'Freut mich, Miriam. Was führt dich heute hierher?', pauseMs: 900 },
  { speaker: 'other', text: 'Ich arbeite bei einem Start-up für Solarspeicher, und unser Gründer hält gleich einen Vortrag.', pauseMs: 2200,
    suggestions: [
      { kind: 'hook', text: 'Ihre Speicher vs. große Anbieter' },
      { kind: 'hook', text: 'Eigene PV-Pläne' },
      { kind: 'hook', text: 'Weg zum Start-up' },
    ] },
  { speaker: 'self', text: 'Spannend. Wie bist du zu dem Start-up gekommen?', pauseMs: 900 },
  { speaker: 'other', text: 'Ehrlich gesagt über das Segeln. Der Gründer war in meinem Segelverein.', pauseMs: 2400,
    suggestions: [
      { kind: 'hook', text: 'Lieblingsreviere beim Segeln' },
      { kind: 'hook', text: 'Deine Ostsee-Erfahrung' },
      { kind: 'hook', text: 'Wie lange sie schon segelt' },
    ] },
  { speaker: 'self', text: 'Du segelst? Wo bist du am liebsten unterwegs?', pauseMs: 900 },
  { speaker: 'other', text: 'Meistens auf dem Bodensee, im Sommer auch mal in Kroatien. Und du, was machst du so?', pauseMs: 3000,
    suggestions: [
      { kind: 'hook', text: 'Dein Beruf, kurz' },
      { kind: 'hook', text: 'Kroatien: Lieblingsecke' },
      { kind: 'topic', text: 'Reisen und Urlaube' },
    ] },
]

const en: ScriptLine[] = [
  { speaker: 'other', text: "Hi, I don't think we've met. I'm Sam.", pauseMs: 1800,
    suggestions: [
      { kind: 'hook', text: 'How Sam knows the hosts' },
      { kind: 'hook', text: 'Reason for tonight' },
      { kind: 'hook', text: 'Regular at these meetups' },
    ] },
  { speaker: 'self', text: 'Nice to meet you, Sam. What brings you here tonight?', pauseMs: 900 },
  { speaker: 'other', text: 'I work at a small robotics company, and a colleague of mine is giving a talk later.', pauseMs: 2200,
    suggestions: [
      { kind: 'hook', text: 'Kinds of robots they build' },
      { kind: 'hook', text: 'A normal robotics workday' },
      { kind: 'hook', text: "Colleague's talk tonight" },
    ] },
  { speaker: 'self', text: 'What kind of robots do you build?', pauseMs: 900 },
  { speaker: 'other', text: 'Mostly warehouse robots. But honestly, my real passion is baking bread on weekends.', pauseMs: 2400,
    suggestions: [
      { kind: 'hook', text: 'Sourdough and baking' },
      { kind: 'hook', text: 'Your failed starter' },
      { kind: 'hook', text: 'Best loaf so far' },
    ] },
  { speaker: 'self', text: 'Sourdough? How long have you been baking?', pauseMs: 900 },
  { speaker: 'other', text: 'About three years now. It started during a long winter. What about you, what do you do?', pauseMs: 3000,
    suggestions: [
      { kind: 'hook', text: 'Your job, briefly' },
      { kind: 'hook', text: 'Baking for the team' },
      { kind: 'topic', text: 'Favourite bakeries in town' },
    ] },
]

const ja: ScriptLine[] = [
  { speaker: 'other', text: 'はじめまして、佐藤です。こちらは初めてですか？', pauseMs: 1800,
    suggestions: [
      { kind: 'hook', text: '初参加であること' },
      { kind: 'hook', text: '誰の紹介か' },
      { kind: 'hook', text: 'イベントの雰囲気' },
    ] },
  { speaker: 'self', text: 'はい、初めてです。佐藤さんはよく来られるんですか？', pauseMs: 900 },
  { speaker: 'other', text: '月に一回くらいですね。普段はデザインの仕事をしています。', pauseMs: 2200,
    suggestions: [
      { kind: 'hook', text: '担当するデザイン' },
      { kind: 'hook', text: '最近気になった作品' },
      { kind: 'hook', text: 'デザインを始めたきっかけ' },
    ] },
  { speaker: 'self', text: 'どんなデザインをされているんですか？', pauseMs: 900 },
  { speaker: 'other', text: '主にアプリの画面です。でも週末は山登りばかりしています。', pauseMs: 2400,
    suggestions: [
      { kind: 'hook', text: '最近登った山' },
      { kind: 'hook', text: '高尾山の経験' },
      { kind: 'hook', text: '初心者向けの山' },
    ] },
]

export const DEMO_SCRIPTS: Record<LanguageCode, ScriptLine[]> = { de, en, ja }
