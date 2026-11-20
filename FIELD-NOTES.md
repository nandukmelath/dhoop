# Field notes for the Agora and Murf teams

Dhoop was built in two days on Agora Conversational AI and Murf Falcon. These are the things it learnt that are not in the documents, each with how often it happened and how to see it again. They are from one account, one region and 19 to 20 November 2026, so they are observations and not verdicts. Where the app had to work round something, the place in the code is named.

Everything here was measured in real calls. `npm run listen:test` has a Murf voice speak test sentences into a real Agora call through a browser nobody sees, and counts what the agent heard.

## What worked well

- **Replacing the agent in the middle of a call.** Dhoop stops one agent and starts another in the same channel to change language, and again when speech recognition fails. With the conversation so far handed to the new agent, the person keeps talking and nothing is asked twice. This is what makes "Explain it to my mother in Kannada" possible.
- **`semantic` end of speech.** With plain silence detection, a one-second pause before a place name ("I live in ... Tumakuru") split every such sentence in two. `semantic` with `silence_duration_ms: 480` and `max_wait_ms: 2500` fixed it.
- **A Falcon voice that grew up in the language.** One voice speaking six languages sounds like a visitor in five of them. A voice per language (`murfVoice` in `lib/dhoop/agent.ts`) is the single change that listeners noticed most.
- **Falcon outside the call.** The same key speaks the passbook's voice note and the half-minute solar story through Murf's own API, so the voice a household heard in the call is the voice on the page they take home.

## What to watch for

| What happened | How often | How to see it | What Dhoop does |
| --- | --- | --- | --- |
| One word in ARES `keywords` stops recognition for the whole call. With "Patna" in the list, alone or among a hundred others, the engine sends "The speech recognition service failed" (asr, code 1000) every ten seconds and hears nothing. | 5 runs in 6 | `badName` in `buildAgent` adds the word for a test | `lib/dhoop/hotwords.ts` leaves the word out; the listening test is run after any name is added |
| A long keyword list makes the recogniser fail to start more often. | about 114 keywords: 2 of 4 calls. 30 keywords: 0 of 10. | `npm run listen:test` with each list | The list is capped at 30 (`SAFE_HOTWORDS`), with the names that were misheard first |
| On one afternoon neither recogniser was safe by itself: "Connection timeout after 10 seconds", then the same failure message. | ARES 4 of 6 calls on both lists, after 0 of 10 that morning. Deepgram 3 of 10. | Short calls, a few minutes apart | `recoverListening` in `components/dhoop/DhoopApp.tsx` restarts the agent on the other recogniser, up to four times a call. The new agent opens with "Sorry, I missed that" |
| While recognition is failed, a typed message gets no answer either. The agent's state still changes, so the state cannot be taken as a sign that it answered. | every time | Refuse the microphone, start a call, type | The call screen keeps the line and says it again to the next agent (`unanswered` in `components/ConversationComponent.tsx`) |
| Muting the microphone track with `setMuted` brings the same failure, because no sound reaches Agora at all. | every time | Hold-to-talk built on `setMuted` | Hold-to-talk turns the volume to nothing with `setVolume(0)` |
| With `pause_state_enabled`, a sentence that trails off is taken as "hold on" and the agent waits in silence. In Indian languages, where the verb comes last and people think aloud, the call looks stuck. | seen once, in Malayalam | Trail off in the middle of a sentence | The setting is off |
| The speaker lock (`sal`) in its seamless mode locks onto whoever speaks clearly first. In a hall that is a neighbour, and then the caller is not heard. With a voice sample it kept the neighbours out but cut the place names from the caller's sentences. | each time it was tried | Two people near one microphone | Off. A "Loud room" switch with hold-to-talk does the job |
| A message typed in the first seconds is lost: the greeting is on the screen before the agent has joined. | every time | Type the moment the greeting shows | The prompts under the microphone stay disabled until the agent is in |
| Deepgram's `keyterm` is one string in Agora's API. Several joined with `&keyterm=` are accepted. | every time | `keyterms` in `lib/dhoop/hotwords.ts` | Used for place names in Malayalam, which ARES does not listen in |

## Three things that would have saved a day

1. A line in the ARES documents on what a keyword may be, or an error that names the keyword that was refused.
2. A different error for "no sound is arriving" and "the recogniser failed". They need opposite cures: the first needs the person, the second needs a restart.
3. An event that says the agent is ready to be spoken to. Without one, every client guesses.

## A way to test listening with no microphone

For anyone building a voice agent on Agora: Chrome will play a sound file as its microphone with `--use-file-for-fake-audio-capture`, but only together with `--disable-features=AudioServiceSandbox` (otherwise the call hears silence), and only for files under about 10 MB, hence 16 kHz. Have Murf speak the test sentences into that file and a real call can be measured by a script. `scripts/listen-test.mjs` is the whole rig. A run takes about two minutes of agent time.
