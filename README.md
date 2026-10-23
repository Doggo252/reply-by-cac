<p align="center">
  <img src="docs/readme-title.png" alt="ReplyBy" width="420">
</p>

<p align="center">
  Helping seniors keep Medi-Cal coverage.
  <br>
  <b>Live site: <a href="https://reply-by-cac.web.app">reply-by-cac.web.app</a></b>
</p>

The app works best on a phone. If you're on a computer, tap "No letter handy? Try a sample one" to try it with a made-up letter.

Made by Neil Patil for the 2026 Congressional App Challenge (CA-16).

### About

My grandparents struggled with Medi-Cal. My grandfather had Lewy body dementia and my grandmother was his caregiver. Even with a social worker, they didn't understand the letters and forms they had to answer, and my mom had to guide them through it. Without her they would have lost their health insurance.

About 69% of people who lost Medicaid during the 2023 to 2024 renewals lost it because of paperwork, not because they didn't qualify anymore ([KFF](https://www.kff.org/medicaid/medicaid-enrollment-and-unwinding-tracker/)). Starting in 2026, seniors on Medi-Cal also have to report their assets again (DHCS ACWDL 25-14), so there is even more paperwork to miss.

### How It Works

1. The senior picks their language and whether they want AI help. If they pick AI, the phone removes their name, address and case number before anything is sent.
2. They take a picture of the letter. The app figures out which letter it is and reads the dates, names, phone number and case number. The senior checks each one.
3. The app shows their deadlines with a plain explanation: when to send the form, when to ask for a hearing, and the last day to send papers if their coverage already stopped.
4. The app fills out the forms. For a renewal, it reads the pages the county already filled in, so the senior just taps "Still right" or "It changed". It reads amounts from their papers (Social Security letter, bank statement) and fills in the official 17-page renewal form (MC 210 RV).
5. The app checks everything against the letter and shows every page before they sign. Then they print it and mail it. The app never sends anything by itself.

It supports three letters for Santa Clara and San Mateo counties: the renewal form (MC 210 RV), the discontinuance letter (MC 239 A), and the request for information (MC 355). If someone scans a different letter, the app tells them it isn't supported.

### Features

- Reads the letter two ways, with my Naive Bayes classifier and with Gemini, and asks the senior to double check if they don't match.
- Catches county mistakes, like someone getting cut off after sending their papers on time, and writes a letter asking the county to restore their Medi-Cal (DHCS MEDIL I15-22).
- Won't let you sign if a date on the forms doesn't match the letter.
- An AI helper (Gemini with 14 tools) can put the whole reply together, and it asks for the senior's OK at every step.
- Works completely on the phone and offline if you don't want AI.
- Full Spanish support and a read-out-loud button.

### Testing

I tested the app with real users. Through the tests, I changed the app to ask the questions one by one and fill in the real form, and to catch address and date of birth. Some photos only worked on the second try, and the photos in the packet came out sideways, which are fixed as well.

I tested both readers on 640 fake letters they had never seen, from photos that were tilted, shadowed, folded or cut off:

- Naive Bayes classifier: 98.1% right
- Gemini: 96.7% right (it was 81% before I rewrote the prompt)
- Both agreed: 95.9%, and only 3 of 640 where both agreed but were wrong

There are also 346 automated tests (pytest and Vitest). Full results are in `core/eval/`.

### Known Issues

- Gemini isn't reliable to find dates. It only found the notice date on 68% of letters.
- The renewal's property page can't be filled in yet because there's no fillable version of it.

### Future Plans

- More letters, more counties, and more languages like Vietnamese, Chinese and Hindi
- CalFresh support
- A downloadable phone app with deadline notifications
- Uploading finished forms straight to BenefitsCal
- More testing with seniors

### Tech Stack

- App: React, TypeScript, Vite (installable as a web app)
- Reading photos: Tesseract.js, on the phone
- Forms: pdf-lib to fill them, pdf.js to show them
- Server: Python, FastAPI, Gemini API
- Hosting: Firebase for the site, Google Cloud Run for the server (Render as a backup at replyby.onrender.com)

### Try It

Open the live site and tap "No letter handy? Try a sample one". To try the camera, print one of these and take a picture:

- `data/synthetic/test-letters.pdf`: one of each letter
- `data/synthetic/denial-kit.pdf`: a discontinuance letter with the renewal packet and papers
- `data/synthetic/test-kit.pdf`: a renewal packet with papers

Everything in these are made up. The `-answers.txt` files say what the app should find.

### Run the app locally

You need Node 22 and Python 3.13. A Gemini API key is optional (phone-only mode works without one).

```bash
make setup
cp backend/.env.example backend/.env
make dev-backend
make dev-app
```

On Windows, use `.venv\Scripts\python` instead of `.venv/bin/python`.

Tests:

```bash
make test-py
make test-js
```
