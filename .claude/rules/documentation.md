---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Komentar fungsi (TSDoc)

Sumber: spec 14.3. Keberadaan komentar ditegakkan `eslint-plugin-jsdoc` (`jsdoc/require-jsdoc`) untuk deklarasi fungsi, method, arrow function yang ditugaskan ke variabel, dan function expression. Mutu komentar diperiksa agent Reviewer.

- Setiap fungsi dan method diawali komentar `/** ... */` dalam **Bahasa Indonesia**.
- Baris pertama menjelaskan **apa dan mengapa**, bukan mengulang nama fungsi.
- Gunakan `@param nama - penjelasan` dan `@returns` bila nilai kembalian tidak jelas dari tipenya; `@throws` bila fungsi sengaja melempar error.
- Callback inline (misalnya argumen `.map(...)`) tidak perlu komentar.
- Berkas `*.test.ts`, `*.spec.ts`, dan `*.e2e.ts` dikecualikan dari kewajiban ini.
- Komentar menjelaskan niat dan batasan. Jangan menulis komentar yang hanya menerjemahkan kode baris demi baris.
