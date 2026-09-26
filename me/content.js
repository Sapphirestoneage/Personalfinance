/* ==========================================================================
   Everything the site says lives in this one file. Edit the words between
   the quotes, save, and the page redraws itself. No code anywhere else needs
   to change.

   Rules of thumb:
     - Keep each item to a line or two. The page is a shop window, not a book.
     - Leave a link out ("url": "") and the card shows with no link.
     - Delete an item by removing its { ... } block, comma and all.
     - Entries marked "example: true" carry a small tag on the page so you
       can see what is still a placeholder. Remove that line once it is real.
   ========================================================================== */
window.ME = {

  /* ---- Who --------------------------------------------------------------- */
  name: "Eliz Saperstein",
  handle: "sapphirestoneage",
  tagline: "I build small tools that make big questions answerable.",
  location: "",                       /* "Portland, OR" or leave blank */
  photo: "",                          /* "photo.jpg" placed in this folder, or blank for initials */
  about: [
    "I make things: small web tools that run in the browser, a personal finance app with a few dozen rooms, and a Dungeons & Dragons character sheet that turns your money into a class and a level.",
    "This page is the one place where all of it lives: what I do, what I make, what I am into, and how to reach me."
  ],

  /* ---- Where to find me --------------------------------------------------- */
  links: [
    { label: "GitHub",   url: "https://github.com/Sapphirestoneage" },
    { label: "Email",    url: "mailto:elizsaperstein@gmail.com" },
    { label: "LinkedIn", url: "", example: true },
    { label: "Instagram", url: "", example: true }
  ],

  /* ---- Projects: the things I built and want people to try -------------- */
  projects: [
    {
      title: "SPARKS: Money Rooms",
      blurb: "Thirty-some small personal-finance tools that all read from one household model. Type a number once and it follows you into every room. No server, no account, nothing leaves your browser.",
      url: "https://sapphirestoneage.github.io/Personalfinance/map.html",
      tags: ["personal finance", "vanilla JS", "no build step"],
      status: "live"
    },
    {
      title: "Dungeons & Dividends",
      blurb: "A personal-finance RPG character sheet. Answer eighteen questions and get your class. Add five numbers and get your Level, Hit Points and Armour Class.",
      url: "https://sapphirestoneage.github.io/Personalfinance/dnd/",
      tags: ["D&D", "game design", "finance"],
      status: "live"
    },
    {
      title: "The FOO Calculator",
      blurb: "Every threshold ratio as one shape: altitude, fuel, engine load and thrust. The front door of the whole suite.",
      url: "https://sapphirestoneage.github.io/Personalfinance/",
      tags: ["visualisation", "SVG"],
      status: "live"
    },
    {
      title: "Coach Mode",
      blurb: "A money coach's console: a roster of clients, a live session down a path of stops, and a view the client sees.",
      url: "https://sapphirestoneage.github.io/Personalfinance/coach/",
      tags: ["coaching", "console"],
      status: "in progress"
    }
  ],

  /* ---- Hobbies: what I am into when I am not building ------------------- */
  hobbies: [
    { title: "Dungeons & Dragons", blurb: "Long campaigns, homebrew monsters, and a soft spot for rules lawyering in a good cause." },
    { title: "Personal finance", blurb: "Not the spreadsheets. The shape of a household's money and how to draw it so anyone can read it." },
    { title: "Your hobby here", blurb: "Two lines on what it is and why you love it.", example: true },
    { title: "Another one", blurb: "Photos, climbing, cooking, whatever fills the weekends.", example: true }
  ],

  /* ---- Tools: small things I made for myself and now share -------------- */
  tools: [
    { title: "Household backup", blurb: "Export every number the money rooms hold to one file and read it back in another browser.", url: "https://sapphirestoneage.github.io/Personalfinance/rooms/settings.html" },
    { title: "Planets", blurb: "Six planets by ten bands: the whole of a household's money as one map you can walk.", url: "https://sapphirestoneage.github.io/Personalfinance/rooms/ledger.html#planets" },
    { title: "A tool you use daily", blurb: "A script, a spreadsheet, a bookmarklet. Name it and say what it saves you.", url: "", example: true }
  ],

  /* ---- Resume ------------------------------------------------------------ */
  resume: {
    headline: "Builder of small, honest software.",
    summary: "I design and ship browser tools end to end: the data model, the calculations, the words on the page. I care about plain language, empty states that say nothing is entered, and screens that get simpler over time.",
    file: "",                         /* "Eliz-Saperstein-Resume.pdf" placed in this folder, or blank to hide the button */
    experience: [
      {
        role: "Maker, SPARKS and Dungeons & Dividends",
        org: "Independent",
        dates: "2026 to now",
        points: [
          "Designed a single household data model with one owner per field and a decision log of 340 entries.",
          "Cut a 93-room app to 37 rooms without losing a number anyone had typed.",
          "Wrote a test suite of 28,000 checks that runs on every push and gates the deploy."
        ]
      },
      {
        role: "Your last job title",
        org: "Company",
        dates: "2022 to 2026",
        points: ["One line on what you owned.", "One line on a result with a number in it."],
        example: true
      }
    ],
    skills: [
      "HTML, CSS and vanilla JavaScript",
      "Data modelling",
      "Plain-language writing",
      "Testing and CI",
      "Product design",
      "Your skill here"
    ],
    education: [
      { school: "Your school", detail: "Degree, year", example: true }
    ]
  },

  /* ---- Contact ------------------------------------------------------------ */
  contact: {
    lead: "Want to talk about a project, a campaign, or a tool you wish existed?",
    email: "elizsaperstein@gmail.com"
  }
};
