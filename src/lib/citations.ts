/**
 * Single source of truth for every study cited on screen.
 *
 * Each claim in the UI renders <Cite ids={[...]} /> (components/science/cite.tsx),
 * which shows "Author Year" as a tappable link to the paper. Web and the iOS
 * shell (Capacitor loads the deployed web app) share this, so one edit here
 * updates both.
 *
 * Verified 2026-09-28 against PubMed / Europe PMC / publisher pages. Rule: only
 * cite a paper for what it actually says. If a number is an app default rather
 * than a finding, say so in the UI copy instead of attaching a citation to it.
 * Full notes: research/variable-research.md.
 */
export type Citation = {
  /** On-screen label, e.g. "Moore 2009". */
  short: string;
  /** Full reference (shown as the link's title / tooltip). */
  full: string;
  url: string;
  /** false for books, manuals and preprints — the UI marks these. */
  peerReviewed: boolean;
};

export const CITATIONS = {
  // --- Strength: 1RM estimation ---
  epley1985: {
    short: "Epley 1985",
    full: "Epley B. Poundage Chart. Boyd Epley Workout. Lincoln, NE: Body Enterprises; 1985. (Coaching manual)",
    url: "https://en.wikipedia.org/wiki/One-repetition_maximum#Epley_formula",
    peerReviewed: false,
  },
  reynolds2006: {
    short: "Reynolds 2006",
    full: "Reynolds JM, Gordon TJ, Robergs RA. Prediction of one repetition maximum strength from multiple repetition maximum testing and anthropometry. J Strength Cond Res. 2006;20(3):584-592.",
    url: "https://pubmed.ncbi.nlm.nih.gov/16937972/",
    peerReviewed: true,
  },
  lesuer1997: {
    short: "LeSuer 1997",
    full: "LeSuer DA, McCormick JH, Mayhew JL, Wasserstein RL, Arnold MD. The accuracy of prediction equations for estimating 1-RM performance in the bench press, squat, and deadlift. J Strength Cond Res. 1997;11(4):211-213.",
    url: "https://journals.lww.com/nsca-jscr/abstract/1997/11000/the_accuracy_of_prediction_equations_for.1.aspx",
    peerReviewed: true,
  },
  nuzzo2024: {
    short: "Nuzzo 2024",
    full: "Nuzzo JL, Pinto MD, Nosaka K, Steele J. Maximal number of repetitions at percentages of the one repetition maximum: a meta-regression and moderator analysis. Sports Med. 2024;54:303-321.",
    url: "https://link.springer.com/article/10.1007/s40279-023-01937-7",
    peerReviewed: true,
  },
  zourdos2016: {
    short: "Zourdos 2016",
    full: "Zourdos MC, et al. Novel resistance training-specific rating of perceived exertion scale measuring repetitions in reserve. J Strength Cond Res. 2016;30(1):267-275.",
    url: "https://doi.org/10.1519/JSC.0000000000001049",
    peerReviewed: true,
  },

  // --- Training volume ---
  schoenfeld2017: {
    short: "Schoenfeld 2017",
    full: "Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. J Sports Sci. 2017;35(11):1073-1082.",
    url: "https://doi.org/10.1080/02640414.2016.1210197",
    peerReviewed: true,
  },
  pelland2026: {
    short: "Pelland 2026",
    full: "Pelland JC, et al. The resistance training dose response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gains. Sports Med. 2026;56(2):481-505.",
    url: "https://doi.org/10.1007/s40279-025-02344-w",
    peerReviewed: true,
  },
  israetel2021: {
    short: "Israetel 2021",
    full: "Israetel M, Hoffmann J, Smith CW. Scientific Principles of Hypertrophy Training. Renaissance Periodization; 2021. (Book — practitioner framework, not peer-reviewed)",
    url: "https://rpstrength.com/products/scientific-principles-of-hypertrophy-training",
    peerReviewed: false,
  },

  // --- Deload / fatigue ---
  rogerson2024: {
    short: "Rogerson 2024",
    full: "Rogerson D, et al. Deloading practices in strength and physique sports: a cross-sectional survey. Sports Med Open. 2024;10:26.",
    url: "https://doi.org/10.1186/s40798-024-00691-y",
    peerReviewed: true,
  },
  bell2023: {
    short: "Bell 2023",
    full: "Bell L, et al. Integrating deloading into strength and physique sports training programmes: an international Delphi consensus approach. Sports Med Open. 2023;9:87.",
    url: "https://doi.org/10.1186/s40798-023-00633-0",
    peerReviewed: true,
  },

  // --- HRV ---
  plews2013: {
    short: "Plews 2013",
    full: "Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Med. 2013;43(9):773-781.",
    url: "https://doi.org/10.1007/s40279-013-0071-8",
    peerReviewed: true,
  },
  flatt2017: {
    short: "Flatt 2017",
    full: "Flatt AA, Hornikel B, Esco MR. Heart rate variability and psychometric responses to overload and tapering in collegiate sprint-swimmers. J Sci Med Sport. 2017;20(6):606-610.",
    url: "https://doi.org/10.1016/j.jsams.2016.10.017",
    peerReviewed: true,
  },

  // --- Nutrition ---
  morton2018: {
    short: "Morton 2018",
    full: "Morton RW, et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. Br J Sports Med. 2018;52(6):376-384.",
    url: "https://pubmed.ncbi.nlm.nih.gov/28698222/",
    peerReviewed: true,
  },
  nunes2022: {
    short: "Nunes 2022",
    full: "Nunes EA, et al. Systematic review and meta-analysis of protein intake to support muscle mass and function in healthy adults. J Cachexia Sarcopenia Muscle. 2022;13(2):795-810.",
    url: "https://doi.org/10.1002/jcsm.12922",
    peerReviewed: true,
  },
  helms2014: {
    short: "Helms 2014",
    full: "Helms ER, Zinn C, Rowlands DS, Brown SR. A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes. Int J Sport Nutr Exerc Metab. 2014;24(2):127-138.",
    url: "https://doi.org/10.1123/ijsnem.2013-0054",
    peerReviewed: true,
  },
  moore2009: {
    short: "Moore 2009",
    full: "Moore DR, et al. Ingested protein dose response of muscle and albumin protein synthesis after resistance exercise in young men. Am J Clin Nutr. 2009;89(1):161-168.",
    url: "https://pubmed.ncbi.nlm.nih.gov/19056590/",
    peerReviewed: true,
  },
  trommelen2023: {
    short: "Trommelen 2023",
    full: "Trommelen J, et al. The anabolic response to protein ingestion during recovery from exercise has no upper limit in magnitude and duration in vivo in humans. Cell Rep Med. 2023;4(12):101324.",
    url: "https://doi.org/10.1016/j.xcrm.2023.101324",
    peerReviewed: true,
  },
  loucks2011: {
    short: "Loucks 2011",
    full: "Loucks AB, Kiens B, Wright HH. Energy availability in athletes. J Sports Sci. 2011;29(Suppl 1):S7-S15.",
    url: "https://doi.org/10.1080/02640414.2011.588958",
    peerReviewed: true,
  },
  mountjoy2023: {
    short: "Mountjoy 2023",
    full: "Mountjoy M, et al. 2023 International Olympic Committee's (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs). Br J Sports Med. 2023;57(17):1073-1097.",
    url: "https://pubmed.ncbi.nlm.nih.gov/37752011/",
    peerReviewed: true,
  },
  mifflin1990: {
    short: "Mifflin 1990",
    full: "Mifflin MD, St Jeor ST, et al. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.",
    url: "https://doi.org/10.1093/ajcn/51.2.241",
    peerReviewed: true,
  },
  frankenfield2005: {
    short: "Frankenfield 2005",
    full: "Frankenfield D, Roth-Yousey L, Compher C. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. J Am Diet Assoc. 2005;105(5):775-789.",
    url: "https://doi.org/10.1016/j.jada.2005.02.005",
    peerReviewed: true,
  },

  // --- Cycle phase ---
  hewett2007: {
    short: "Hewett 2007",
    full: "Hewett TE, Zazulak BT, Myer GD. Effects of the menstrual cycle on anterior cruciate ligament injury risk: a systematic review. Am J Sports Med. 2007;35(4):659-668.",
    url: "https://doi.org/10.1177/0363546506295699",
    peerReviewed: true,
  },
  wojtys2002: {
    short: "Wojtys 2002",
    full: "Wojtys EM, et al. The effect of the menstrual cycle on anterior cruciate ligament injuries in women as determined by hormone levels. Am J Sports Med. 2002;30(2):182-188.",
    url: "https://doi.org/10.1177/03635465020300020601",
    peerReviewed: true,
  },
  dossantos2023: {
    short: "Dos'Santos 2023",
    full: "Dos'Santos T, et al. Effects of the menstrual cycle phase on anterior cruciate ligament neuromuscular and biomechanical injury risk surrogates in eumenorrheic and naturally menstruating women: a systematic review. PLoS One. 2023;18(1):e0280800.",
    url: "https://doi.org/10.1371/journal.pone.0280800",
    peerReviewed: true,
  },
} as const satisfies Record<string, Citation>;

export type CitationId = keyof typeof CITATIONS;
