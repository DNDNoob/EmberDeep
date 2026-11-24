// Update Log: the player-facing "what's new" blog shown on the lobby terminal.
//
// To add a post, PREPEND an object at the top of NEWS (newest first):
//   {date:'YYYY-MM-DD', title:'Short title', body:'One to three friendly sentences.'}
// The date is the day the change lands. Keep every post spoiler-free: tease, never
// explain what a strange door, glitch, scare, trap, secret or easter egg does, where
// it is, or how to trigger it. No code names, file names, PR numbers or agent names.
// Group small fixes into one post. Rebuild index.html afterwards (npm run build).
export const NEWS=[
  {date:'2026-11-24',title:'Some luck can wait',
    body:'Whatever fate you are dealt at the sanctuary will now hold off while you are behind a strange door, and catch up with you once you step back out. Anyone not in the maze stays out of harm\'s way, too.'},
  {date:'2026-11-24',title:'Something big out back',
    body:'There\'s a lot more room behind the lobby than it first appeared, and you can now see right into it through the glass. Somebody is clearly parked back there. The door is locked, for now.'},
  {date:'2026-11-24',title:'Quieter in the dark',
    body:'Something that lurks in the maze now keeps to itself a little more often. And you\'ll no longer hear your own voice coming back at you from where it shouldn\'t.'},
  {date:'2026-11-24',title:'Update log online',
    body:'This terminal now keeps a running log of what\'s new in Door Simulator. Check back after each update. Nothing here will spoil what\'s waiting behind the doors.'},
  {date:'2026-11-24',title:'Repairs in the deep',
    body:'Squashed a batch of bugs: strange doors that refused to open after an early start, lift stops that remembered a little too much, and a lurker that wasn\'t pulling its weight. A certain village also tidies up after itself now.'},
  {date:'2026-11-23',title:'A curiosity in the lobby',
    body:'Something new has been placed against the rock wall. It keeps very old time. Take a closer look.'},
  {date:'2026-11-22',title:'Try your luck',
    body:'Rumor has it something down there wants you to spin. Fortune is not guaranteed. Also: a new door has been seen among the trees. Mind the way you came in.'},
  {date:'2026-11-22',title:'The Mob Archive grows',
    body:'Creatures you meet behind strange doors are now recorded in the Mob Archive.'},
  {date:'2026-11-21',title:'A lobby worth walking',
    body:'The entrance hall is now a place you can walk around with friends. Visit the archives, ride the shared lift down together, and jump straight to the deepest floor you\'ve reached. The lift got smoother and has music for the ride.'},
  {date:'2026-11-21',title:'Turn it up (or down)',
    body:'Every floor now has its own music, with separate volume sliders for music, voices and your mic, and an option for voices that fade with distance.'},
  {date:'2026-11-20',title:'Something is buzzing',
    body:'A new strange door has started appearing. Bring patience. And maybe repellent.'},
  {date:'2026-11-19',title:'Listen closely',
    body:'Another new door joins the rotation. Some say the stones behind it talk. Strange-door rooms also got a graphics pass, and loading screens now show progress.'},
  {date:'2026-11-18',title:'Doors you\'ll want to talk about',
    body:'Two new strange doors: one for movie lovers, one for people who like to be watched. Movement now feels the same everywhere you go.'},
  {date:'2026-11-17',title:'Deeper and darker',
    body:'New floor types, four looks for every floor type, and a forest that doesn\'t belong underground. Every floor now has its own ambient sound.'}
];
