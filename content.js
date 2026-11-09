// All content is written for Pause. Nothing here is fetched from a server.

// [FILL] Add the counselor's contact details here if available.
export const COUNSELOR = { name: "Sir Rauf Malick", contact: "" };

export const BITES = [
  { t: "Tip", h: "The 2-minute start", b: "Stuck on a task? Promise yourself just two minutes. Starting is the hard part; most of the time you will keep going." },
  { t: "Fact", h: "Why scrolling has no end", b: "Feeds never show a 'finished' sign, so your brain never gets a cue to stop. A cue you set yourself, like a timer, works better than willpower." },
  { t: "Try this today", h: "Phone in another room", b: "For your next study hour, leave the phone in another room. Even a phone face-down on the desk pulls at your attention." },
  { t: "Tip", h: "One tab, one goal", b: "Write one sentence about what you will finish: 'Read pages 10 to 14.' A clear goal is easier to hold onto than 'study'." },
  { t: "Fact", h: "Boredom is useful", b: "A bored mind starts to wander, plan and invent. Not filling every gap with a screen gives ideas room to appear." },
  { t: "Story", h: "The 20-minute walk", b: "A student felt stuck on an essay for days. She walked around the hostel for twenty minutes without her phone. Halfway round, the opening line came to her. Walks do not fix everything, but they often unstick us." },
  { t: "Study advice", h: "Test yourself, don't re-read", b: "Close the book and write what you remember. It feels harder than re-reading, and that effort is what makes it stick." },
  { t: "Tip", h: "Name the feeling", b: "Before you reach for the phone, finish this sentence: 'I am feeling ___.' Bored, tired, lonely or stressed each need a different answer." },
  { t: "Try this today", h: "Message one person properly", b: "Instead of liking ten posts, send one real message to one friend: 'How is your week going?' It takes a minute and it counts." },
  { t: "Fact", h: "Online life shows highlights", b: "People post their best moments, edited. Comparing your normal day to someone else's highlight is not a fair comparison." },
  { t: "Skill", h: "Box breathing", b: "Breathe in for 4, hold for 4, out for 4, hold for 4. Repeat four times. It slows a racing mind." },
  { t: "Study advice", h: "Short sessions, real breaks", b: "25 minutes of focus and a 5 minute break beats two hours of half-attention. Make the break a stretch or water, not a feed." },
  { t: "Story", h: "The notification that took an hour", b: "Rayan opened his phone to reply to one study group message. An hour later he was still on the app next to it. He now mutes everything except the study group. Same reply, no lost hour." },
  { t: "Tip", h: "Charge it away from your bed", b: "A phone across the room means you cannot scroll 'just five more minutes' at night. Buy a cheap alarm clock if you need one." },
  { t: "Skill", h: "The 5-4-3-2-1 reset", b: "Name 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste. It brings you back to the room when your mind is racing." },
  { t: "Fact", h: "Sleep helps memory", b: "Your brain files what you learned while you sleep. Staying up late scrolling can undo the study you just did." },
  { t: "Try this today", h: "Learn one new thing offline", b: "Pick one small skill: a knot, a card trick, three chords, a few words in a new language. Ten minutes a day adds up." },
  { t: "Tip", h: "Curate who you follow", b: "If an account leaves you feeling worse, you are allowed to mute or unfollow it. Your feed should work for you." },
  { t: "Skill", h: "Write the top 3", b: "Tonight, write the three most important things for tomorrow. Your mind stops holding them, and the morning starts clearly." },
  { t: "Study advice", h: "Start with the hardest 20 minutes", b: "Do the task you are avoiding first, for just twenty minutes. The rest of the day then feels lighter." },
  { t: "Fact", h: "Being lonely is common", b: "Many students feel lonely, especially in the first year or far from home. It is a feeling many people share, not a flaw in you." },
  { t: "Try this today", h: "Ask someone for a walk", b: "'Want to get chai after class?' is a small ask that often gets a yes. Most people are glad to be asked." },
  { t: "Skill", h: "Look 20 meters away", b: "Every 20 minutes, look at something far away for 20 seconds. Your eyes and your head will thank you." },
  { t: "Tip", h: "Say it out loud", b: "Struggling with a hard idea? Explain it out loud to an imaginary friend. Gaps in understanding show up fast." },
];

export const GROUPS = ["Move", "Create", "Learn", "Connect", "Calm"];

export const CHALLENGES = [
  { id: "m1", g: "Move", t: "Walk around the block or the hostel grounds", m: 15 },
  { id: "m2", g: "Move", t: "Do a 5-minute full body stretch", m: 5 },
  { id: "m3", g: "Move", t: "Take a 30-minute walk, no phone in hand", m: 30 },
  { id: "m4", g: "Move", t: "Play a quick sport or game with friends", m: 30 },
  { id: "m5", g: "Move", t: "Do 10 squats, 10 push-ups, then drink water", m: 5 },
  { id: "c1", g: "Create", t: "Draw whatever is in front of you", m: 15 },
  { id: "c2", g: "Create", t: "Write three lines about your day", m: 5 },
  { id: "c3", g: "Create", t: "Cook or make something simple to eat", m: 30 },
  { id: "c4", g: "Create", t: "Tidy one small space: your desk or a shelf", m: 15 },
  { id: "c5", g: "Create", t: "Write a short list: 10 things you are glad about", m: 5 },
  { id: "l1", g: "Learn", t: "Learn one new skill from a book or notes", m: 15 },
  { id: "l2", g: "Learn", t: "Teach a friend something you know", m: 30 },
  { id: "l3", g: "Learn", t: "Read ten pages of a book you chose", m: 15 },
  { id: "l4", g: "Learn", t: "Learn five words in a new language", m: 5 },
  { id: "l5", g: "Learn", t: "Make a summary of today's lecture on paper", m: 15 },
  { id: "n1", g: "Connect", t: "Message a friend and ask how they are", m: 5, together: true },
  { id: "n2", g: "Connect", t: "Ask someone to go for a walk or chai", m: 30, together: true },
  { id: "n3", g: "Connect", t: "Find a society, sports team or study group to join", m: 15 },
  { id: "n4", g: "Connect", t: "Call a family member for a few minutes", m: 15 },
  { id: "n5", g: "Connect", t: "Study with a classmate for a session", m: 30, together: true },
  { id: "a1", g: "Calm", t: "Box breathing: 4 in, 4 hold, 4 out, 4 hold", m: 5 },
  { id: "a2", g: "Calm", t: "Make tea and drink it slowly, no screen", m: 15 },
  { id: "a3", g: "Calm", t: "Prayer or quiet time, in your own way", m: 15 },
  { id: "a4", g: "Calm", t: "Sit by a window or outside and just notice", m: 5 },
  { id: "a5", g: "Calm", t: "Listen to one full album track with your eyes closed", m: 15 },
];

export const MEET_TIPS = [
  "Join a society that matches something you enjoy.",
  "Start or join a study group for one subject.",
  "Try a sports session, even just as a beginner.",
  "Volunteer for a campus event. Shared work makes friends quickly.",
  "Say hello to one new person in class this week.",
];

export const BREAKS = ["Stretch your arms and back", "Drink some water", "Look out of a window, far away", "Step outside for fresh air"];

export const SAFE = [
  { id: "scams", icon: "🛡️", h: "Scams and hacked accounts", s: "Protect WhatsApp and your other accounts", steps: [
    "Open WhatsApp, then Settings, Account, Two-step verification, and turn it on. Pick a PIN only you know.",
    "Never share a 6-digit code with anyone, even a friend. Friends who ask for it may be hacked.",
    "Be careful with links and 'you won a prize' messages. If it is too good to be true, it is a scam.",
    "If you can, check with the person by calling them before sending money or codes.",
  ] },
  { id: "hacked", icon: "🔐", h: "What to do if hacked or scammed", s: "Calm steps, in order", steps: [
    "Stay calm. It happens to many people and it is not your fault.",
    "Change your password right away, and turn on two-step verification.",
    "Log out of other devices in your account settings.",
    "Tell your contacts not to trust messages from you for a while.",
    "If money was taken, tell your bank and a trusted adult or the campus office.",
  ] },
  { id: "privacy", icon: "🔒", h: "Privacy and app permissions", s: "Know what apps keep", steps: [
    "Open your phone Settings, then Apps, then Permissions.",
    "Turn off camera, microphone, location and contacts for apps that do not need them.",
    "Set location to 'only while using the app' or 'never'.",
    "In Instagram, TikTok and others, set your account to private and limit who can message you.",
    "Delete apps you no longer use.",
  ] },
  { id: "content", icon: "🚫", h: "Unwanted content", s: "Mute, filter and report", steps: [
    "On Instagram: tap the three dots on a post, then 'Not interested'. Use Settings, then 'Sensitive content', to see less.",
    "On YouTube: tap the three dots, then 'Don't recommend this channel'. Turn on Restricted Mode in Settings.",
    "Mute or block accounts that keep showing things you did not ask for.",
    "Use Report on anything harmful. It helps you and others.",
    "If something upset you, take a break and talk to someone you trust.",
  ] },
  { id: "harass", icon: "🧱", h: "Online harassment", s: "You are not alone", steps: [
    "Take screenshots and save them. Do not delete the evidence.",
    "Block the person, then use Report on the app.",
    "Do not reply in anger. Replying often makes it worse.",
    "Tell someone you trust: a friend, family member or the campus counselor.",
    "If you feel unsafe, contact campus security.",
  ] },
  { id: "notif", icon: "🔕", h: "Notifications guide", s: "Keep study, mute the rest", steps: [
    "Open Settings, then Notifications. Look at the apps near the top.",
    "Keep: class groups, study groups, family and the people you really need.",
    "Turn off: likes, suggested posts, game offers and 'someone posted'.",
    "In WhatsApp, mute large groups. You can still open them when you choose.",
    "Use Do Not Disturb during study and sleep.",
  ] },
  { id: "compare", icon: "🪞", h: "Comparison reset", s: "Online life shows the highlights", steps: [
    "People post their best moments. Their normal days look like yours.",
    "Unfollow or mute accounts that make you feel behind or not enough.",
    "Follow people and pages that teach you something or make you smile.",
    "If you feel FOMO, text a friend and plan something small in real life.",
    "Take a day off from posting or checking now and then. Nothing breaks.",
  ] },
  { id: "tools", icon: "📱", h: "Use your phone's own tools", s: "Android and iPhone", steps: [
    "Android: Settings, then Digital Wellbeing. Set app timers and Bedtime mode.",
    "iPhone: Settings, then Screen Time. Set App Limits and Downtime.",
    "Turn on grayscale. A colourless screen is less tempting.",
    "Keep your phone in another room while studying or sleeping.",
    "Keep WhatsApp and study apps. Limit only the ones that eat your time.",
  ] },
];

export const FRIEND_MSGS = [
  "I've been feeling low lately, can we talk?",
  "Hey, are you free for a chat today? I could use a friend.",
  "I'm having a tough week. Can we get chai and talk?",
  "Can I call you in a bit? Nothing urgent, I'd just like to hear a friendly voice.",
];

export const CHECKLIST = [
  "Charge the phone away from my bed",
  "Write tomorrow's top 3 tasks",
  "Read or breathe for a few minutes",
  "Dim the lights",
];
