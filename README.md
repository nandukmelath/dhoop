# Dhoop: solar for your roof, in your language

Dhoop is a voice guide that takes a household from "can I get the solar subsidy?" to a system on the roof. You talk to it in English, Hindi, Kannada, Tamil, Telugu or Malayalam. It reads your electricity bill through the camera, finds your roof from space, sizes a system from NASA sunshine data, works out the government subsidy and the scheme's bank loan, checks what could hold up your application, keeps track of which of the portal's ten stages you are at, sends your survey to installers, and books the site visit. Everything it does appears on a big screen as it happens.

Built for **Build with Agora, Bengaluru 2026**, Track 5 (Voice AI for Bharat), on **Agora Conversational AI** and **Murf Falcon**.

**Try it live: https://dhoop.onrender.com** Open it in Chrome or Safari, allow the microphone, and press Start talking. It runs on a free server, so if it has been idle the first load can take about a minute.

> "Dhoop" (धूप) means sunlight.

## For mentors and judges: two minutes

Open **https://dhoop.onrender.com**, allow the microphone and press **Start talking**. No quiet place to speak? Tap the prompts under the microphone, or type. Then try these, in any of the six languages:

**No microphone, or one minute only?** Open **https://dhoop.onrender.com/tour**. Dhoop works through one household's plan by itself, with the same tools and the same live data as a call, and no call is made.

1. "My bill is 3,200 rupees a month and I live in Bengaluru."
2. "Show me the Polaris School of Technology", the roof this hackathon sits under. Or "Show me the Vidhana Soudha in Bengaluru", or allow location and say "Find my roof".
3. "What should I install?" and then "Is it worth it in the long run?"
4. "Can I get the subsidy?" and then "Who installs solar here?"
5. "Explain it to my mother in Kannada."

| The brief asks for | In Dhoop |
| --- | --- |
| Real-time conversational AI on Agora | An Agora Conversational AI agent in an RTC call, with RTM for the live transcript and the agent's state. It can be interrupted, it sees the bill and the roof through the camera, and it is replaced in the middle of a call, memory intact, to change language or when speech recognition fails. |
| Natural voice with Murf Falcon | Murf Falcon speaks every reply in six languages, and also the passbook's voice note and the half-minute solar story. |
| Agentic workflows | Twenty-eight tools the agent calls by itself: NASA sunshine, satellite building outlines, this week's weather, the government's registered vendors, installer quotes, a booked visit. |
| A whole journey | Before: it remembers earlier calls and where the home is. During: the conversation. Action: the system designed, quotes asked for and a visit booked, each after a clear yes. After: a passbook with a voice note, the subsidy application tracked stage by stage, and the visit in the person's calendar with a reminder. |
| A working demonstration | It is deployed at the address above. `npm run e2e` checks every tool with no call. |

The three-minute demo, word for word, is in [DEMO.md](DEMO.md). What two days on Agora and Murf taught, with counts and how to see each thing again, is in [FIELD-NOTES.md](FIELD-NOTES.md). The logo is in [brand](brand/README.md).

## Why this exists

The national rooftop solar scheme, PM Surya Ghar: Muft Bijli Yojana, pays up to ₹78,000 towards a home system, and its portal shows the scheme closing on 31 March 2027. On 19 November 2026 the portal counted 68.6 lakh applications and 43.1 lakh installations: about 25 lakh households had applied and did not yet have a system. The way from one to the other is ten stages on a portal, a rule that the name on the bank account must be identical to the name on the electricity bill, a vendor to choose and a price to find, in a language many households are not comfortable in. The portal's own roof tool asks for a consumer number, a sanctioned load, a latitude and a longitude.

Dhoop asks for nothing but a voice. It does the first visit by voice and camera in the household's own language, says plainly what must be put right before applying, remembers where the household has got to, and hands installers a survey they can quote on.

## What happens in a conversation

| Stage | What the person does | What Dhoop does |
| --- | --- | --- |
| Before | Says the monthly bill, or holds the bill to the camera | Reads units and amount, works out the rate per unit |
| During | Allows location, or names their town | Finds the building from space and measures the roof; looks up sunshine from NASA. On stage: reads shade on a model roof and lays panels on the sunlit part |
| Action | Asks "what should I install?" | Sizes the system; shows saving, subsidy, price and payback; compares sizes on request |
| Action | Says "get me quotes" | Sends the survey to installers; speaks up when a quote arrives; books the site visit |
| After | Asks "can I get the subsidy?", or says "I have registered" | Checks the four things that decide it and says what to put right first; tracks the portal's ten stages across calls and explains only the next one; works out the scheme's bank loan beside the saving |

A person can interrupt at any point, switch language mid-conversation, and the conversation carries on with everything remembered.

## What is in the box

- **Voice agent** on Agora Conversational AI: Agora's own speech recognition, an Agora-managed model, and a Murf Falcon voice, with interruption handling.
- **Twenty-eight tools** the agent calls while you talk (`saveBill`, `setLocation`, `findMyRoof`, `findBuilding`, `changeRoof`, `moveRoof`, `nextBuilding`, `undoRoofChange`, `showNeighbourhood`, `findSolarSite`, `siteDetails`, `findVendors`, `comparePlaces`, `longRunSavings`, `sunForecast`, `powerNow`, `changeLanguage`, `playSolarStory`, `checkEligibility`, `loanPlan`, `getRoofSurvey`, `setRoofManual`, `designSolar`, `compareSizes`, `subsidySteps`, `requestQuotes`, `getQuotes`, `bookVisit`). Each is a small HTTPS endpoint that Agora's engine calls directly.
- **Camera survey.** Point the camera at a roof. On stage this is a small model lit by a desk lamp: move the lamp, the shadow moves, and the panels rearrange. Shade is found with plain image arithmetic, not a language model, so it is fast and predictable.
- **Finds your roof by itself.** With the device's live location allowed, Dhoop goes to where you are as the call starts, picks out the building from open building outlines, measures the roof, and tells you what it found without being asked. It follows you if you move, until you tap a building or name a place yourself. One tap on another building corrects it. Where no building is mapped, search an address and draw the corners instead.
- **The passbook in any of the six languages.** The person who made the call is often not the one who decides, or does not speak the same language at home. A row at the top of the passbook switches the page, and the voice note Murf reads, to any of the six; the link sent on WhatsApp keeps the choice.
- **Solar passbook.** A code on the big screen opens one page on the person's own phone, in their language: a drawing of their roof with the panels on it, the system and the money set out like a ledger, and where their subsidy application stands. **Listen to your plan** reads it out in the same Murf voice as the conversation, for whoever in the family decides and does not read a page of figures. **Send on WhatsApp** passes it on. **Talk to Dhoop about this** carries on the same conversation on that phone, with everything remembered.
- **Made for a phone.** On a phone the roof fills the screen and the voice sits in a dock under the thumb: the sun, the last thing said, the microphone. Pull it up for the whole conversation. On a laptop the same dock stands as a rail down the side. The look is Dhoop's own: paper, ink and marigold, one type family (Anek) across English, Hindi, Kannada and Malayalam, and a sun that swells when it listens, turns when it thinks and reaches out when it speaks.
- **Subsidy application companion.** Ask "can I get the subsidy?" and Dhoop checks the four things that decide it: a home and not a shop, the connection in your name, the bank account in exactly the same name, a roof that is yours to use. A "no" is not the end: it says what to put right and how. It then shows the portal's ten stages, ticks off the ones you say you have done, explains only the next one and who has to act, and remembers it for your next call. Say you cannot pay at once and it works out the scheme's own bank loan beside your monthly saving. It tells you once that nobody from the scheme asks for an OTP or money on the phone.
- **Any building in India, by name.** Say "show me the Vidhana Soudha" or "what about Lulu Mall in Kochi", and Dhoop looks the place up, dives to it and lays panels on its roof: about 3,150 of them on the Vidhana Soudha, 1.7 megawatts. A name the map knows as a building gets that building's true outline. A mall the map knows only through a shop inside it, a campus or a tech park gets the main building there, and Dhoop says the match is not exact. A place that is not on the map takes the screen to its area, and Dhoop asks you to tap the building.
- **Change the roof by talking.** The outline on the screen is a starting point, and the person corrects it in words. "The roof goes further: add 300 square metres on the right and put panels there too." "Leave out 100 square feet at the front for the water tank." "Only the left half is mine." "The outline is a bit off, move it 4 metres up." "Not this building, the next one to the right." "Undo that." Dhoop redraws the outline at once, fits the panels again and sizes the system again if the roof was holding it back. Sides are as the person sees the picture. A roof grows along the building's own walls, so a rectangle stays a rectangle; square feet and "half" are worked out by the tool, not by the model. Checked by voice in a real call: a Murf voice asked for all four and Dhoop did each one.
- **Where to build a solar farm, and why.** "I want to start a one megawatt solar farm. Find me the best area in Tumakuru district." This has no one-number answer, so Dhoop does a consultant's first pass and gives its reasoning. It lays a grid of spots over the district or state named (inside its real border, and on land), reads each spot's long-term yield from the World Bank's Global Solar Atlas, looks closer around the best, counts the buildings around the sunniest few from the open footprint data and prefers open land, then sizes the land and the energy. The map goes to the place with the land marked as a square, and a card lists the best three, the reasons the first one won, and plainly what was not checked: ownership and price, forest or wetland or good farmland, slope, and the nearest substation. Asked about Tumakuru district it picks open country in Pavagada taluk, where the Pavagada solar park stands; asked about Karnataka, Chitradurga.
- **The solar story.** Say "play my solar story" and the whole screen becomes a half-minute film of that household's own plan: the name and the place, the roof drawn with its panels, the system and the bill before and after, the subsidy and what is left to pay, where the application stands. Murf narrates it in the language of the conversation, the figures count up as they are spoken, and each sentence appears as a caption. It is made from what the conversation has already worked out, so nothing is looked up while it plays; the narration is prepared as soon as a system exists, so it starts at once. In the call Dhoop says one line, "Here is your solar story", and keeps quiet, and the microphone is turned down so the narrator is not mistaken for the caller. A button under "Take it home" plays it too.
- **Which place is better.** "My house is in Kochi and my parents' is in Palakkad: which roof should get the panels?" Dhoop sets two to four named places side by side on what the same panels would make in each, from the Global Solar Atlas, and says which is better, by how much and why: more sun on a tilted panel, or cooler air. A card shows them as bars.
- **The year, month by month.** Under the system, twelve bars show what it makes in each month against what the home uses, from NASA's monthly sunshine for the place. The monsoon is the dip. "What about the rains?" is the first thing most households ask, and Dhoop answers it from the same figures: the best month, the poorest, and how many months fall short of the home's use.
- **Right now on your roof.** Ask "what is my roof making right now?" or "can I run my AC on it?" and Dhoop looks up the sunshine reaching the home at this moment: the kilowatts the system is making now, today's curve hour by hour with the present marked on it, and the household things that much power carries together (the fridge, three fans, the TV, the washing machine). For an appliance it says how much of it the sun is covering now and at the best hour of the day, and never that it "cannot run": the home stays on the grid, so everything runs at any hour and the sun decides how much of it is paid for.
- **This week on your roof.** Ask "what will my roof make tomorrow?" and Dhoop fetches the weather forecast for the home and turns it into units for each of the next seven days, with the same sum as the design: seven bars, tomorrow and the best day ahead marked, and a line for a usual day of the month from the long-term average. It says which day to run the washing machine or the pump, and when rain is likely. Everything else Dhoop says about sunshine is an average; this is the one thing that is about tomorrow.
- **Twenty-five years at a glance.** Ask "is it worth it in the long run?" and one line shows where the household stands at the end of every year: behind by the price on the day it is bought, level in the year it has paid for itself, and far ahead by the twenty-fifth. The panels' slow fade is counted. The price of electricity stays as it is today, unless the person asks "what if it gets five percent dearer every year?", and then the line redraws with their figure, called theirs.
- **Change language by asking.** "Explain it to my mother in Kannada." Dhoop says "one moment", comes back speaking Kannada with a Murf voice, and tells her in two sentences where things stand, because it remembers the whole conversation. Any of the six languages, in the middle of a call, by voice or by a tap.
- **The practical side of a solar farm, fetched and not asked for.** Once a place is found, Dhoop has already looked up what a person needs next, and answers "which is the nearest substation?", "who can build it, and what are their numbers?" and "will it make money?" from it. The grid: the three nearest substations on the map, with distance, direction, voltage and who runs them, and whether the nearest is within the five kilometres the scheme prefers. The builders: registered vendors with the contact number, rating and installation count the national rooftop solar portal publishes, from the district's own list where that was read and from the state's otherwise. The money: what the electricity company pays for each unit, what the plant earns a year, what it costs to build, and the years to pay back. Each comes with what is not known, said aloud. For a plot near Kasaragod it found KSEB's 110 kV substation at Manjeshwar 2.9 km away, six registered vendors, and about ₹47 lakh a year against ₹3.5 to 4.5 crore to build.
- **Registered vendors for anywhere in India.** Ask "who installs solar in Jaipur?", or in Shillong, Port Blair or Leh, or just "who can install it here?", and Dhoop puts five registered vendors on the screen with their phone numbers (a tap rings them), consumers' ratings and installation counts, and names the first two aloud. There is a list for each of the 28 states and 8 union territories, the vendors with the most installations there on the national rooftop solar portal, and a district's own list for two districts. Dhoop says which kind it is giving: a state's busiest vendors are not the same as the nearest ones, and it tells the person to ask each whether they work in their district. It is a list, not a recommendation.
- **The whole neighbourhood.** Ask "what could my whole neighbourhood do?" (or street, colony, apartment society, village) and the view pulls back while every roof around the home lights up, outwards from it. The screen adds them up: how many roofs, the power if each were filled, the electricity a year, what it is worth, what it equals in homes like yours, and the carbon dioxide kept out. Around one house in Indiranagar: 501 roofs within 187 m, 5.07 MW, about ₹7.6 crore of electricity a year. It uses the same rule and the same sourced figures as the home's own numbers, and says plainly that it is an upper limit.
- **The roof reveal.** When Dhoop finds your building, the satellite view starts high above the country and dives straight down to it. The outline traces itself, panels drop onto the roof row by row, and the numbers count up: the roof's area, how many panels fit, and the most they could make. When Dhoop then recommends a system, that many panels stay lit, the rest dim, and the numbers change to its size, the yearly saving and the subsidy. All of it is drawn from the session, so the picture and the voice give the same figures.
- **Bill by camera.** The camera is published to the call, and the managed model reads the bill from it.
- **Six languages.** English, Hindi, Kannada, Tamil, Telugu and Malayalam. One Murf voice (Jaya) speaks the first five, and Malayalam has a voice of its own (Nimisha). The start page, the fixed lines, the passbook and its voice note are in each. Switching language restarts the agent in the same call with the conversation so far. Checked by voice in a real call on 20 Nov 2026: in Tamil Dhoop heard a Tamil voice ask for the Meenakshi temple in Madurai, found it and sized a system; in Telugu it found the Charminar.
- **Memory.** Dhoop remembers what was said, not only what was saved. Agora keeps a conversation's history only while its agent is running, so before an agent stops (a language change, the end of a call, a closed tab) Dhoop copies the history into the session and hands it to the next agent. Come back later on the same device and it carries on. **Start a new conversation** begins with nothing remembered.
- **Hears place names.** A speech recogniser trained on everyday talk gets "Vidhana Soudha" or "Koramangala" wrong. Dhoop tells Agora's recogniser which names to expect, waits for the end of the thought and not the first pause, and has the model work out a misheard name from its sound. Measured with the listening test below: a sentence with a pause before the name is no longer cut in two, Hindi and Kannada scored 10 of 10, and English heard "Vidhana Soudha" and "Lulu Mall", which it had missed. The list of names is kept to thirty: with about 114 names English scored 14 of 15, but Agora's recogniser then failed to start in half of the test calls.
- **Loud room: hold to talk.** A switch on the call screen keeps the microphone shut except while the space bar or a button is held, so the people at the next table are not taken for the caller.
- **Recovers by itself.** Agora offers two recognisers without a key: its own (ARES) and Deepgram. Either can fail to start, and the engine then reports it and hears nothing for the rest of the call. When that happens Dhoop brings the agent back inside the call on the other recogniser, with everything remembered, and says "Sorry, I missed that. Could you say it once more?". New calls then stay off the one that failed for twenty minutes. Measured around noon on 20 Nov 2026, when Agora's own failed to start in 8 short calls of 12 (none of 10 that morning) and Deepgram in 3 of 10: with the switch in place, 5 of 6 calls started clean and the sixth recovered by itself. `DHOOP_STT=deepgram` in `.env.local` keeps every call on Deepgram. A line typed or tapped while that was happening is said again to the agent that comes back, so a tap is not lost; a line the agent had already taken up is never said twice.
- **Looks after call time.** Agora counts every minute an agent is in a call, used or not, and a call left open runs for up to an hour: a fifth of the whole free allowance. A call in which nobody has spoken, typed, tapped or pressed a key for four minutes warns for thirty seconds and then ends itself. The start page says so, and "Carry on talking" picks the conversation up where it stopped. An agent left alone in a call (a closed tab) leaves after 45 seconds. `NEXT_PUBLIC_DHOOP_QUIET_MINUTES` changes the four minutes; 0 turns it off.
- **Type instead of talk.** A box under the microphone sends typed text to the agent, for a loud hall or a blocked microphone.
- **Tap to say.** A row marked "Try" under the microphone holds nine things to say, in the order of a conversation: the bill, find my roof, add to the roof, the next building, undo, the whole neighbourhood, a landmark, the subsidy, the loan. A tap sends the words as if they had been spoken. It shows a newcomer what Dhoop can do, and it lets every part be shown in a hall too loud to be heard in. The words are in English; Dhoop answers in the language of the call.
- **Installer inbox** (`/installer`). Installers see incoming surveys and send quotes. When one arrives the agent says so without being asked.
- **Leads rated for installers.** An installer's costliest problem is telling a buyer from a looker, and a conversation with Dhoop shows which is which. Every conversation is rated high, medium or low intent from what the household did and asked: a visit booked, quotes asked for, an application on the portal, the bill, the roof, a designed system, the four subsidy conditions, the loan, the vendors. The inbox puts the likeliest buyers first, each with its reasons, its points, the order value and what to do next. Households still deciding are counted by town and size, with nothing that names them, because they have not agreed to be passed on. It is a plain sum of points an installer can read (`lib/dhoop/lead.ts`), and it is what Dhoop could charge for: a surveyed lead whose intent is known.
- **Hall map** (`/wall` and `/join`). Everyone in a room scans a code, taps in their city and bill, and one shared map and running totals fill up. It uses no voice minutes.
- **Test page** (`/dev`). Runs every tool without voice, so the screens can be checked before any keys are set.

## How it uses Agora and Murf

| Capability | Where |
| --- | --- |
| Agora Conversational AI Engine, started with the `agora-agents` SDK | `lib/dhoop/agent.ts`, `app/api/invite-agent/route.ts` |
| Agora ARES speech recognition in `en-IN`, `hi-IN`, `kn-IN`, told which place names to expect: up to 128 keywords, in English and in the language's own script | `lib/dhoop/hotwords.ts`, `lib/dhoop/agent.ts` |
| Agora's semantic end-of-turn detection, so a pause before a name does not cut the sentence in two | `lib/dhoop/agent.ts` |
| Deepgram nova-3 speech recognition, run by Agora, with keyterms, for Malayalam, which Agora's own recogniser does not offer | `lib/dhoop/agent.ts` |
| Agora-managed model with camera input (`input_modalities: text, image`) | `lib/dhoop/agent.ts` |
| Inline REST tools (`enable_tools`) with a shared secret | `lib/dhoop/tools.ts`, `app/api/tools/[name]/route.ts` |
| Agora RTC for microphone and camera; RTM for transcripts, agent state and latency | `components/ConversationComponent.tsx` |
| The speak API, so the agent announces a new quote by itself | `lib/dhoop/quotes.ts` |
| The history API, read before every stop, so memory survives a language change and a later call | `lib/dhoop/memory.ts` |
| Text sent to the agent over RTM, as a typed fallback | `components/ConversationComponent.tsx` |
| Agent error events, used to restart a failed recogniser inside the call | `components/ConversationComponent.tsx`, `components/dhoop/DhoopApp.tsx` |
| Optional speaker lock for loud rooms. Tested and left off: see Honest limits | `DHOOP_SPEAKER_LOCK=1` |
| Murf voices as stand-in callers for the listening test | `scripts/listen-test.mjs` |
| Murf Falcon text to speech in six languages | `lib/dhoop/agent.ts` |

`npm run show:agent -- kn` prints the exact settings sent to Agora, using made-up credentials and without contacting Agora.

## Run it

You need Node 22 or newer, an Agora project and a Murf API key.

```bash
npm install
```

```bash
cp env.local.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000/setup and add the keys there:

1. **Agora.** With Agora's command-line tool (`agora`) installed, press **Sign in to Agora**. Its sign-in page opens in your browser, and once you are signed in Dhoop creates a project called `dhoop` (or reuses it) and saves its App ID and App Certificate. Without the CLI, paste the two values from Agora Console.
2. **Murf.** Paste a Murf API key. Without one Dhoop falls back to Agora's default voice and says so on screen.

The page writes to `.env.local` and never shows a saved key again. It answers only on this computer, at localhost, while developing: not through a tunnel and not in a built copy. You can also edit `.env.local` by hand:

- `NEXT_PUBLIC_AGORA_APP_ID` and `NEXT_AGORA_APP_CERTIFICATE` from Agora Console.
- `MURF_API_KEY` from Murf.
- `DHOOP_TOOL_SECRET`: any long random string.
- `PUBLIC_BASE_URL`: the public HTTPS address of this app (see below).

Then open http://localhost:3000 and press **Start talking**.

### The public address

Agora's cloud calls Dhoop's tools, so the app must be reachable from the internet. Without `PUBLIC_BASE_URL` the agent still talks, but it has no tools and the screen says so.

- **On your laptop:** run the app and open a tunnel to port 3000 with any tunnelling tool, then put the tunnel's HTTPS address in `PUBLIC_BASE_URL` and restart. The same address opens Dhoop on a phone, with its microphone, camera and GPS. The development copy allows this for Cloudflare quick tunnels (`*.trycloudflare.com`); name other hosts in `DHOOP_DEV_ORIGINS`. For a demo, run the built copy behind the tunnel (`npm run build`, then `npm run start`, after the keys are in): it is faster, and the development shortcuts are switched off.
- **On a host:** deploy as a normal Node app (`npm run build`, then `npm run start`) on a host that runs **one long-lived instance**.
- **On Render, free:** the repository carries `render.yaml`. In Render choose New, then Blueprint, pick this repository, and enter the three values it asks for: the Agora App ID, the Agora certificate and the Murf key. It makes up the tool secret itself, and the app learns its own public address from Render, so `PUBLIC_BASE_URL` is not set by hand. A free server sleeps after fifteen minutes without a visitor and takes about a minute to wake; with `DHOOP_KEEP_AWAKE=1`, which the file sets, the server visits its own status page every ten minutes and stays awake.

Session state is held in the memory of one Node process (with a best-effort backup in `.data/`). That is right for a laptop or a single-instance host. It is **not** right for serverless hosts that run many short-lived instances, where tool calls and screens can land on different instances. To use one, put a shared store behind the functions in `lib/dhoop/store.ts`.

### Check it without keys

```bash
npm run test:dhoop
```

```bash
npm run typecheck
```

```bash
npm run build
```

Then open http://localhost:3000/dev and press the numbered buttons. Each one calls a tool the way Agora would.

The roof reveal is animation, so it has a check of its own:

```bash
npm run film:reveal
```

This plays the reveal on the test page in a headless copy of Chrome, checks each stage (the dive, the outline, the panels, the numbers, a roof in another town, a building next door) and saves contact sheets of the frames. It needs the app running and Google Chrome installed. It uses no agent time.

### Check everything without a call

```bash
npm run e2e
```

With the app running (`npm run dev`), this runs every tool the way the agent does, reads the session back, opens the passbook and its voice note in all six languages, loads every page, and tries the doors that must stay shut. About seventy checks in under a minute. It starts no agent, so it uses none of Agora's call minutes.

### Check it with keys

With the keys saved and the app running:

```bash
npm run smoke
```

To measure how well Dhoop hears:

```bash
npm run listen:test -- en
```

A Murf voice speaks ten sentences full of place names into a real call, through a headless Chrome whose microphone is a sound file, and the script prints what the agent heard beside what was said. `hi`, `kn`, `ml` and `pause` are the other sets, and adding `hall` mixes in three other people talking. About two minutes of agent time a run. Run it after adding a name to `lib/dhoop/hotwords.ts`: one keyword can stop the recogniser altogether, as "Patna" did.

`npm run smoke` starts a real agent in each language in turn, reads its status from Agora, asks it to speak, and stops it. Nobody is in the call, so it uses a few seconds of agent time per language. Run it before a demo.

The Agora packages are pinned to exact versions in `package.json`, because a newer `agora-token` builds sign-in tokens that expire after one second with this SDK. `npm run test:dhoop` checks the token's lifetime.

## Demo day

```bash
npm run demo
```

One command for the day itself. It builds Dhoop, starts it, opens a public address for it (a free Cloudflare quick tunnel, new every time) and checks what a call needs before anyone is watching: the keys, the built app, the public address as a phone on another network sees it, and a tool call coming in from outside the way Agora's cloud makes them. Then it prints the laptop's address, the phone's address and a code to scan, keeps the laptop awake, and stays up until Ctrl+C.

- `npm run demo -- --check` is a rehearsal: it does all of that, reports, and stops again.
- `npm run demo -- --skip-build` starts the last build as it is.
- If port 3000 is taken, by a dev server for one, it uses the next free port and says which.

It needs `cloudflared` on the machine. No secret is printed.

## The stage demo

No slides. About three minutes.

0. **This building.** Start a call with location allowed and say only the bill. The satellite view dives from above the country onto the hall's own building, traces its outline and lays panels on its roof, while Dhoop says what it found and asks whether it is yours. Tap another building to show the correction. When Dhoop recommends a system, that system's panels stay lit.
0a. **Change it by voice.** Say "the roof is bigger than that, add 300 square metres on the right and fit panels there too". The outline grows and the panels fill it. Then "not this building, the next one to the left", and "undo that". Nobody touches the screen.
0c. **Take it home.** When the system is on screen, point at the code. A judge scans it and holds the solar passbook: their roof, the figures, a voice note, and Dhoop on their own phone.
0b. **A judge's building.** Ask a judge to name any building they know: their office, their college, a landmark. Say "show me" and its name with the city. Dhoop dives there and covers its roof in panels. If the name is not on the map, Dhoop says so and goes to the area.
1. **The model roof.** Open the **Camera survey** tab. A cardboard box with a matchbox "tank" sits under a desk lamp. Point the camera at it (use **Switch camera** for an external camera). Panels appear on the sunlit slots.
2. **Move the sun.** A judge moves the lamp. The shadow moves and the panels rearrange. Say "the sun has moved, check the roof again".
3. **A real bill.** Hold an electricity bill to the camera, or say the amount. Ask "what should I install?"
4. **Interrupt it** mid-sentence with "what about a smaller one?" It stops and compares two sizes.
4d. **The solar story.** Say, or tap, "play my solar story". The screen goes dark and a narrated film of the home just talked about plays for half a minute. With a judge's own building on screen, this is the moment to stop talking.
4c. **A bigger question.** Say, or tap, "find the best place for a one megawatt solar farm in Tumakuru district". Dhoop compares places, goes to the best, marks the land and says why: here it lands in Pavagada taluk, where one of the world's largest solar parks was built.
4b. **The whole neighbourhood.** Say, or tap, "what could my whole neighbourhood do?" The view pulls back, hundreds of roofs light up, and the megawatts and crores roll up over the map. This is the picture to leave on screen.
5. **Switch language** to Kannada, Hindi, Tamil, Telugu or Malayalam with the chips at the top (ask a judge which they speak at home) and ask how to get the subsidy. Dhoop carries on without asking for anything twice. To show memory on its own, end the call and press **Carry on talking**.
6. **Get quotes.** Say "send it to installers". Someone opens `/installer` and sends a quote; Dhoop speaks up when it lands. Book the visit.
7. **The hall.** Put `/wall` on the screen. Everyone scans the code and adds their home.

For the submission video, film step 1 on a real terrace as well.

## Where the numbers come from

| Number | Source |
| --- | --- |
| Subsidy: ₹30,000 per kW up to 2 kW, ₹18,000 for the third kW, capped at ₹78,000 | National Portal for Rooftop Solar, https://pmsuryaghar.gov.in/, read 19 Nov 2026 |
| Scheme closing date, 31 March 2027 | Same page |
| The ten stages of an application, and the rule that the bank account and the electricity bill carry the same name | The portal's "Application Journey" and FAQ, read 20 Nov 2026 |
| The bank loan: up to ₹2 lakh, repo rate plus half a percent (6.00% a year when read), up to 10 years, a tenth of the cost paid by the borrower | The portal's "Financing Options" page, read 20 Nov 2026 |
| 68.6 lakh applications, 43.1 lakh installations | The counters on the portal's home page, as on 19 Nov 2026 |
| Sunshine at a location | NASA POWER long-term averages (free, no key), with a national fallback |
| Rate per unit | Worked out from the person's own bill (amount divided by units) |
| This week's sunshine, day by day | Open-Meteo's weather forecast (free, no key): the day's sunshine reaching the ground, in megajoules a square metre, divided by 3.6 to give sun hours |
| The same, when Open-Meteo will not answer | MET Norway's cloud forecast (api.met.no, free, no key) and arithmetic: where the sun stands, what a clear sky delivers (Haurwitz), and the share cloud takes (Kasten and Czeplak). An estimate, and the screen says so |
| What the roof is making at this moment, and today hour by hour | Open-Meteo's current and hourly sunshine reaching the ground, in watts a square metre, with the design's own share lost to heat and wiring |
| What an appliance draws (AC 1,500 W, geyser 2,000 W, fridge 150 W and so on) | Typical ratings, in `APPLIANCES` in `lib/dhoop/config.ts`. The label on the appliance has the real figure |
| Panels making 0.8% less each year, in the 25-year view | The usual panel warranty of at least 80% of rated output after 25 years, taken as a straight line: its floor, so a cautious figure |
| Everything in `lib/dhoop/config.ts` under `ASSUMPTIONS` | Engineering rules of thumb, shown on screen as estimates |

The installed price is an assumption (₹60,000 per kW, changeable) until an installer quotes. When a quote arrives, the price and payback are redone from it. Savings assume net metering credits each unit at the household's current rate.

## Honest limits

- **The forecast on the hosted copy is an estimate.** Open-Meteo counts requests by address, and a free host shares its address, so the hosted copy is often refused and falls back to working the sunshine out from MET Norway's cloud forecast. Compared over six towns on 20 Nov 2026, the two differed by a sixth on a typical day and by far more on days of broken cloud. Sunrise and sunset agreed to two minutes. The screen names the source it used.
- **"Right now" is the sky's figure, not a meter's.** It is worked out from the sunshine a weather model gives for the area in the last quarter of an hour. A real system's meter will differ, most of all under passing cloud or shade. The appliance figures are typical ratings, so "covers the AC" means an AC of the usual size.
- **A forecast is a forecast.** The week ahead comes from a weather model for a square some kilometres across. It changes from hour to hour, and it knows nothing of a tree or a water tank beside one roof.
- **The 25-year figure leaves things out, and says which.** Cleaning, a new inverter after ten years or so and the interest on a loan are not counted, so the true figure is somewhat lower. A yearly rise in the price of electricity is only ever the person's own "what if", held to ten percent; Dhoop does not forecast prices.
- **Changing language takes a few seconds.** An agent listens and speaks in one language for its whole life, so Dhoop's agent leaves and another takes its seat. What was being said in that moment is not heard.
- **Estimates, not a quotation.** The camera and satellite readings are a pre-survey. An installer confirms on site.
- **A found building is a suggestion.** A laptop works out where it is from nearby Wi-Fi and can be 50 metres or more out, so Dhoop may outline a neighbour's building. A phone, with GPS, is usually right to a few metres: open Dhoop's public address on one for a better fix. Dhoop says how far off the location may be, shows that as a circle, and asks. When a device knows only its neighbourhood (more than 150 metres out), Dhoop goes there but does not guess a building. The outlines were drawn by machine from satellite pictures, so a roof's edge can be a metre or two out and some buildings are missing.
- **The passbook is as private as its address.** Anyone with the link or the code can open it. It holds a roof outline, a bill and a plan, and no name unless the person gave one for the installers.
- **Five of the six languages are unchecked by a native speaker.** The Hindi, Kannada, Tamil, Telugu and Malayalam on the start page, the passbook and in its voice note were written with care but have not been read by someone who grew up in them. Tamil and Telugu were added on 20 Nov 2026, the day before the event.
- **Dhoop cannot see the portal.** It does not log in, apply or check a status. The stage it shows is the one the person says they have reached, and the eligibility check is four questions, not a ruling: the electricity company and the portal decide.
- **The loan is the scheme's standard product, not an offer.** The rate floats and the bank decides whether to lend. Dhoop names no bank.
- **A call can open with a missed sentence.** When a recogniser fails to start, Agora's engine takes about ten seconds to say so. What the person says in that time is lost, and Dhoop asks for it again on the other recogniser. Around noon on 20 Nov 2026 this happened in as many as two calls of three; that morning, in none of ten. English place names on Deepgram have not been measured cleanly; Hindi heard 6 of 7 and Kannada 5 of 5 in short runs.
- **A loud hall is still hard.** With three other voices a few metres away, the listening test heard 7 of 15 names and wrote the neighbours' words into the caller's sentences. A headset microphone close to the mouth is the real fix, and hold-to-talk keeps the neighbours from starting turns of their own. Agora's speaker lock was tried for this and left off: its automatic mode locked onto a neighbour who spoke first, and with a sample of the caller's voice it silenced the neighbours but also dropped the place names from the caller's own sentences.
- **The listening test uses synthetic voices.** They are clearer than a person, so its scores compare setups and are not a promise of what a person will get.
- **The neighbourhood figure is a ceiling.** It fills every mapped roof as far as it goes, at the same share of usable roof as the home's. Real roofs have tanks, stairs and shade, some are tin sheets that cannot carry panels, and not every owner will agree. The outlines come from open footprint data that sometimes draws one house as two. At most 500 roofs are drawn, the nearest; when there are more, the reach shrinks to fit and the screen says how far it looked. No subsidy is claimed for it: the scheme's rules for housing societies were not read.
- **An outline can sit a few metres off the roof in the picture.** The outlines and the satellite pictures come from different sources and do not always line up, most of all outside the big cities. Dhoop cannot see the difference. The person can: "move the outline 4 metres up" slides it over, and "Draw the corners" replaces it.
- **The vendor lists are a dated copy, and a state's list is not a list of who is near.** The national portal's registered-vendor list sits behind its own access check, and Dhoop's server does not go round it. The lists were read in a browser on 20 Nov 2026, as any visitor sees them: for every state and union territory, the vendors with the most installations in the state (the portal lists nothing without a district, so each was read under the state's main district, ordered by installations across the state), and for Kasaragod and Bengaluru Urban the district's own six. Every number and figure was then checked against the portal page by checksum. So Dhoop can name vendors anywhere in India, but outside those two districts they are the state's busiest, which Dhoop says, and they may not work in the person's district. Three entries whose "vendor name" was only a person's name were passed over, and proprietors' names were dropped. The figures will drift: read the portal again before relying on them. They are rooftop vendors; a megawatt on the ground is a different job, and Dhoop says to ask each.
- **A substation on the map is not a connection.** Substations come from OpenStreetMap by way of OpenInfraMap's map tiles. Small ones are often missing, so a nearer one may exist, and nothing on the map says whether a substation has room for more power: the electricity company publishes that and has to be asked.
- **The money is a first sum, not a business plan.** The price a unit is Karnataka's benchmark for megawatt-scale solar (₹3.07, July 2025 to June 2026) in Karnataka, and elsewhere the range other states' regulators have set (₹2.9 to 3.1), named as a range: Kerala's own figure was not found. The cost to build (₹3.5 to 4.5 crore a megawatt, land not counted) is an industry estimate, not a regulator's. Running costs, land, interest and the slow fall in output are left out. Whether PM-KUSUM Component A is still open in a state must be checked: its last date has been moved more than once.
- **A solar farm's site is where to start looking, not where to buy.** Dhoop compares 20 to 40 spots, not every field, on two things it can read: long-term yield and how many buildings stand nearby. It cannot see who owns the land, what it costs, whether it is forest, wetland or good farmland, the slope, or the grid. It says so each time. The yield is read from the Global Solar Atlas's own service a spot at a time, which is fine for a demonstration; anything larger should download the Atlas's free data layers. The 4.5 acres a megawatt is a planning figure.
- **A roof changed by voice is the person's word, not a measurement.** Dhoop draws what it is told: a strip of the area asked for along the side asked for. "The front" is taken as the bottom of the picture, and Dhoop says which side it moved so the person can correct it. "The next building" is the nearest outline that way in the open footprint data, which sometimes draws one house as two or two as one.
- **A named building is only as good as the map.** Names are looked up on OpenStreetMap through two free services. Famous and public buildings are there, with their true outlines. A small office or a new apartment block often is not, and then Dhoop goes to the area and asks for a tap. Where the map has the name but not the outline, the outline comes from machine-drawn footprints, which can show a large building in pieces. A roof too large to draw panel by panel is drawn in 240 blocks, each standing for several panels.
- **The panels on the roof are a picture of what fits.** How many fit is worked out from the roof's area. Where they are drawn is an illustration, in rows along the roof's longest wall. It knows nothing of water tanks, stairwells or parapets, and it is not an installer's layout.
- **The picture is only as close as the pictures go.** Where the imagery service has its sharpest level, Dhoop shows a roof two levels closer than that. Where it stops a level short, as at the science park in Kerala where this was found, two levels closer is a smear, so Dhoop goes one level closer and the roof is smaller on the screen. The + button still goes further.
- **Satellite pictures vary.** Big cities have pictures sharp enough to pick out one roof. Smaller towns are a level or two less sharp, and the screen says so and suggests telling Dhoop the roof size instead. A place search prefers the town to its district and, once the home's city is known, nearby landmarks to famous ones far away. It can still pick the wrong place for a vague name.
- **The model roof is a demonstration.** The same shade reading works on a real terrace but is rougher there, because real shade changes through the day.
- **Dhoop does not apply for the subsidy.** The person applies on the official portal themselves. The later steps shown are a summary; people should confirm each on the portal.
- **The official portal has its own assistant and calculator.** Dhoop differs by working by voice in the household's language, reading the bill and the roof by camera, and getting installer quotes.
- **Hindi, Kannada, Tamil, Telugu and Malayalam wording** was written without a native-speaker review.
- **Listening in those five languages** was checked with synthetic speech (a Murf voice played into a call in place of a microphone), which each time came back transcribed and answered. It has not been tried with many real voices or accents.
- **The lead rating is a first judgement.** Its points were set by reasoning about what separates a buyer from a looker. No sales exist yet to check them against, and they should be set again from real outcomes. How many questions a person asked is counted from what Dhoop was asked to do, not from every sentence.
- **Installers.** Quotes come from whoever opens `/installer`. With `DHOOP_SAMPLE_QUOTES=1`, two quotes labelled as samples arrive on their own for solo runs.
- **Free tier.** Agora's free allowance is 300 agent-minutes in total. The hall map uses none.

## Privacy

- Dhoop never asks for passwords, OTPs, bank details or Aadhaar numbers, and takes no payments.
- The camera picture goes to Agora for the conversation and is not stored by this app.
- Location is used only if the person leaves that box ticked and the browser allows it. It is kept in the session to find the building. Installers see the name of the area, never the coordinates.
- The hall map stores a city and a bill amount per dot, with the position scattered slightly. No names.
- Sessions live in server memory and a local file, and vanish when the data file is deleted.
- A session keeps the saved facts and up to 40 recent turns of what was said, so that Dhoop can carry on. The words go only into the next agent's instructions and are not sent to any screen. The browser remembers which conversation was its last for 12 hours.

## Layout

```
app/
  page.tsx                     start screen and the conversation
  dev/ installer/ join/ wall/  the other screens
  api/invite-agent/            starts the agent
  api/tools/[name]/            the agent's tools, called by Agora
  api/session/[sid]/           what the screens read and the camera reports
  api/hall/ api/installer/ api/geocode/ api/status/
components/
  ConversationComponent.tsx    voice, camera and transcript (from Agora's starter, extended)
  dhoop/                       Stage, ModelRoof, SatelliteRoof, DhoopApp
lib/dhoop/
  config.ts                    every number, with its source
  solar.ts  shade.ts           the maths, with tests
  tools.ts  prompt.ts  agent.ts
  memory.ts                    what was said, kept across agent restarts and calls
  store.ts  quotes.ts  steps.ts  server.ts
  places.ts                    towns, named buildings and sunshine, looked up from free services
  imagery.ts                   how close the satellite picture can go at a spot
  hotwords.ts                  the names the speech recogniser is told to expect
  passbook.ts                  the take-home page's words in six languages, and its voice note
  buildings.ts  findroof.ts    picking out the building at a spot and measuring its roof
  panels.ts                    where the panels are drawn on a found roof
  voice.ts                     Murf's clips: the passbook's note and the story's narration, kept and made ahead
  reshape.ts  roofedit.ts      the roof changed by voice: grow a side, leave a part out, the next building, undo
  street.ts                    the whole neighbourhood added up, and its roofs for the map to light
  site.ts                      where to build a solar farm: places compared on sun and land, with reasons, grid, vendors and money
  grid.ts                      the electricity substations near a spot
  vendors.ts                   registered vendors for every state and two districts: a dated copy of the national portal's list
  quiet.ts                     when a call nobody is using should end itself
scripts/
  test-dhoop.ts                checks for the maths and the tools
  show-agent-config.ts         prints the settings sent to Agora
  smoke-agent.ts               live check: starts and stops a real agent per language
  film-reveal.mjs              films the roof reveal in headless Chrome and checks each stage
  listen-test.mjs              speaks place names into a real call and prints what was heard
  demo.mjs                     demo day in one command: build, start, public address, checks
```

## Credits

- Built on Agora's [agent-quickstart-nextjs](https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs) (MIT).
- Building outlines from Google Open Buildings, Microsoft Building Footprints and OpenStreetMap contributors, as combined and published by VIDA on Source Cooperative.
- Satellite imagery by Esri and its data providers. Place search by OpenStreetMap Nominatim. Sunshine data by NASA POWER. Weather forecast by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Cloud forecast by [MET Norway](https://api.met.no/) (CC BY 4.0).
- Scheme facts from the National Portal for Rooftop Solar. Dhoop is not affiliated with the Government of India.
