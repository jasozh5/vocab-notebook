# 단어장 · Korean Vocab Notebook

A personal Korean vocabulary notebook:

- **Words**: nouns, verbs, adjectives and other words, each with a topic (Food & drink, Objects, Places…, or make your own). Search, filter by topic or type, and star words to review.
- **All forms**: every verb and adjective gets a generated conjugation table (polite, formal, casual, honorific, negative, requests, expressions, connectors, noun modifiers), including irregulars (ㅂ ㄷ 르 ㅅ ㅎ, ㄹ stems, ㅡ drop, 하다).
- **Quiz**: Korean → English and English → Korean multiple choice, or typed conjugation drills. Words you miss come up more often.

Plain HTML, CSS and JavaScript, with no build step. Open `index.html`, or host the folder on any static host (GitHub Pages, Netlify, Cloudflare Pages).

| File | What it does |
| --- | --- |
| `index.html` | Page shell |
| `style.css` | Styles (light and dark) |
| `conj.js` | Conjugation engine (also runs in Node: `require('./conj.js')`) |
| `words.js` | Starter topics and words, used only the first time the site opens on a device |
| `app.js` | UI, quiz and saving |

Words are saved in the browser's `localStorage`. Use **Export backup** and **Import backup** to back them up or move them between devices.
