/**
 * The list of dances the menus read from, and which tutorials are finished.
 *
 * One source of truth so the Latin Dances list, the Tracker list and the detail
 * page can't drift apart. Completion is recorded per dance and per stage: a
 * dance only counts as complete once every stage of its tutorial is, which for
 * Bachata means both the side basic and the forward/back basic.
 */

export type DanceEntry = {
  /** Short label for a list row, and the key used to record progress. */
  name: string
  /** Heading on the detail page. Longer than the row label where it needs to be. */
  title: string
  /** Where the dance is from, shown under the title. */
  region: string
  /** How many tutorial stages must be finished for it to count as complete. */
  stages: number
  origin: string
  movement: string
  tempo: string
}

export const DANCES: DanceEntry[] = [
  {
    name: "Bachata",
    title: "Bachata",
    region: "Dominican Republic",
    stages: 2,
    origin:
      "Bachata emerged in the rural Cibao region of the Dominican Republic during the early 1960s, developing out of Cuban bolero and Puerto Rican and Dominican guitar traditions among working-class and Afro-Dominican communities, where it was long dismissed by elites as \"musica de amargue\" (music of bitterness) before gaining national and then global respectability in the 1990s.",
    movement:
      "Dancers move through a four-beat lateral basic in which three steps are taken side to side and the fourth count is marked by a hip pop or tap of the free foot, held in a close or semi-close partner embrace that allows for compact turns, body waves, and the shoulder and hip isolations that characterize the modern sensual and urban styles.",
    tempo:
      "Bachata songs typically run between roughly 108 and 140 beats per minute, with the bulk of contemporary commercial recordings clustering around 120 to 130 BPM, while older bachata tipica tends to sit at the faster end of that range."
  },
  {
    name: "Merengue",
    title: "Merengue",
    region: "Dominican Republic",
    stages: 2,
    origin:
      "Merengue is the national music and dance of the Dominican Republic, consolidated in the nineteenth century from a blend of African rhythmic practice, European contradanse forms, and Indigenous instrumentation, and it was aggressively promoted as a symbol of national identity under the Trujillo regime in the mid-twentieth century.",
    movement:
      "The dance is built on a deceptively simple marching step in which dancers transfer weight from one foot to the other on every beat, producing a continuous hip figure-eight as the pelvis responds to the weight change, and partners in closed position layer on turns, arm wraps, and traveling patterns while the feet never stop their steady alternation.",
    tempo:
      "Merengue commonly falls between 120 and 160 beats per minute, though the accordion-driven merengue tipico of the Cibao frequently pushes past 180 BPM, making it one of the fastest partner dances in the Latin American repertoire."
  },
  {
    name: "Mambo",
    title: "Mambo (Dominican Street Mambo)",
    region: "Dominican Republic",
    stages: 2,
    origin:
      "Dominican street mambo, sometimes labeled mambo violento or grouped with merengue de calle, arose in the barrios of Santo Domingo in the late 1990s and 2000s as a hard-edged urban offshoot of merengue, and it should not be confused with the Cuban mambo of Perez Prado and the 1950s ballroom era, to which it is unrelated in both rhythm and lineage.",
    movement:
      "Dancers execute rapid, percussive footwork with pronounced hip, shoulder, and chest isolations, often performing solo or in loose informal groups rather than in a fixed partner hold, and the style favors improvisation, dramatic stops that answer breaks in the track, and full-body grounded energy over structured partnering.",
    tempo:
      "The genre is notably fast, generally running from about 160 to well over 200 beats per minute, with many tracks sitting near 180 BPM and the most aggressive productions exceeding that considerably."
  },
  {
    name: "Salsa",
    title: "Salsa",
    region: "Puerto Rico, Cuba, and the New York Caribbean diaspora",
    stages: 2,
    origin:
      "Salsa grew primarily out of Cuban son montuno and mambo, with substantial contributions from Puerto Rican bomba and plena, and was commercially codified in New York City during the 1960s and 1970s by Puerto Rican and Cuban musicians whose recordings for labels such as Fania turned a regional Caribbean sound into a pan-Latin genre.",
    movement:
      "The basic pattern consists of three weight changes across four beats, with the fourth beat marked by a pause or tap, danced either On1 or On2 in the linear New York and Los Angeles styles or in the continuously circular casino style of Cuba, and partners are connected through a lead-and-follow frame that generates cross-body leads, multiple spins, and intricate arm work.",
    tempo:
      "Salsa recordings generally range from about 150 to 250 beats per minute when counted at the clave-driven tempo, with most social dancing occurring between 180 and 220 BPM."
  },
  {
    name: "Cumbia",
    title: "Cumbia (Colombian)",
    region: "Colombia's Caribbean coast",
    stages: 2,
    origin:
      "Cumbia originated on the Caribbean coast of Colombia as a tri-ethnic fusion in which Indigenous gaita and caña de millo flutes, African drumming brought by enslaved people, and Spanish melodic and lyrical conventions combined into a courtship form, later spreading across virtually all of Latin America and spawning dozens of national variants.",
    movement:
      "Traditionally it is danced as a courtship ritual in which women take small shuffling steps while holding a long pollera skirt in one hand and often a bundle of lit candles in the other, keeping the upper body relatively still, while men circle them with more animated footwork, hats in hand, in a pursuit that never quite closes the distance.",
    tempo:
      "Traditional Colombian cumbia sits in a moderate range of roughly 80 to 110 beats per minute, with the classic orchestral recordings of the mid-twentieth century generally falling near 95 to 105 BPM."
  },
  {
    name: "Samba",
    title: "Samba",
    region: "Brazil",
    stages: 2,
    origin:
      "Samba developed among Afro-Brazilian communities, with roots in the Angolan and Congolese semba and batuque traditions carried to Bahia and then to Rio de Janeiro, where in the early twentieth century it was formalized in the hillside neighborhoods and escolas de samba that made it the centerpiece of Carnival and, eventually, a state-sanctioned emblem of Brazilian identity.",
    movement:
      "Samba no pe, the solo form, uses a rapid three-step pattern distributed across a two-beat measure, creating a distinctive bounce as the knees flex and the hips counter-rotate while the torso stays comparatively lifted, and the partnered samba de gafieira adds a ballroom-derived frame with sweeping travels, leg hooks, and dramatic dips.",
    tempo:
      "Samba tempos vary by subgenre, with samba-cancao and bossa-adjacent forms sitting around 90 to 110 beats per minute and the samba-enredo performed by Carnival parade schools driving up to roughly 130 to 150 BPM."
  },
  {
    name: "Punta",
    title: "Punta",
    region: "Garifuna communities of Honduras, Belize, Guatemala, and Nicaragua",
    stages: 2,
    origin:
      "Punta belongs to the Garifuna people, an Afro-Indigenous population descended from West African and Island Carib and Arawak ancestors who were exiled from St. Vincent to the Central American coast in 1797, and the dance is traditionally performed at wakes, festivals, and celebrations as an assertion of cultural continuity.",
    movement:
      "The feet remain nearly stationary and close to the ground while the dancer drives an extremely rapid rotation and isolation of the hips and buttocks, with the upper body held relatively steady, and the form is frequently competitive, with dancers taking turns in a circle answering the primera and segunda drums directly.",
    tempo:
      "Traditional punta is typically played between about 90 and 130 beats per minute, while the electrified punta rock popularized from the 1980s onward often runs faster, commonly in the 130 to 160 BPM range."
  },
  {
    name: "Corrido",
    title: "Corrido",
    region: "Mexico and the U.S.-Mexico borderlands",
    stages: 2,
    origin:
      "The corrido is a narrative ballad form descended from the Spanish romance tradition, which took its recognizable Mexican shape in the nineteenth century and flourished during the Mexican Revolution as a means of circulating news, mourning the dead, and mythologizing figures such as Pancho Villa, later evolving into the narcocorrido and, most recently, the corridos tumbados of the 2020s.",
    movement:
      "Because the corrido is primarily a storytelling song form, its associated dancing is borrowed from the norteño and banda contexts in which it is performed, meaning couples move through a polka-derived two-step or a walking zapateado with turns under the arm, and in more rural traditions the emphasis falls on percussive heel and toe work rather than partner figures.",
    tempo:
      "Polka- and norteño-based corridos generally run between roughly 100 and 140 beats per minute, whereas the guitar-led corridos tumbados that dominate contemporary charts are markedly slower, often sitting between 70 and 100 BPM."
  },
  {
    name: "Mexican Cumbia",
    title: "Mexican Cumbia",
    region: "Mexico, particularly Monterrey and Mexico City",
    stages: 2,
    origin:
      "Mexican cumbia arrived from Colombia in the mid-twentieth century and was rapidly localized, slowing in tempo and absorbing local instrumentation to produce distinct strains including cumbia sonidera, the accordion-heavy cumbia norteña, and the Monterrey cumbia rebajada, in which sound-system operators deliberately pitched records down to a syrupy crawl.",
    movement:
      "The Mexican style is more grounded and less ornamental than its Colombian ancestor, using a compact shuffling step with a slight hop or drag on the offbeat, and it is danced in a relaxed closed hold in which partners travel less and instead emphasize a steady swaying bounce punctuated by simple underarm turns.",
    tempo:
      "Mexican cumbia is generally slower than the Colombian original, most often falling between 85 and 105 beats per minute, and the rebajada variant can drop well below 80 BPM by design."
  },
  {
    name: "Tamborito",
    title: "Tamborito",
    region: "Panama",
    stages: 2,
    origin:
      "Tamborito is Panama's national dance, formed during the colonial period from the convergence of African drumming traditions, Spanish melodic and poetic structures, and Indigenous elements, and it is performed most prominently during Carnival and patron saint festivals as a communal rather than a strictly theatrical event.",
    movement:
      "A single couple dances inside a ring of singers and drummers, with the woman displaying an ornate pollera skirt through controlled sweeping movements and small measured steps while the man pursues her with hat gestures and lifted knees, and notably the pair never touch, the tension of the courtship being carried entirely through proximity and eye contact.",
    tempo:
      "Tamborito is typically performed between roughly 100 and 130 beats per minute, its pace set live by the caller-and-chorus singing and the interlocking pujador, repicador, and caja drums rather than by a fixed recorded tempo."
  },
  {
    name: "Tango",
    title: "Tango",
    region: "Argentina and Uruguay (Río de la Plata)",
    stages: 2,
    origin:
      "Tango took shape in the working-class and immigrant neighborhoods of Buenos Aires and Montevideo in the late nineteenth century, drawing on Afro-Argentine candombe, Cuban habanera, and European immigrant musical traditions, and after being exported to Paris in the 1910s it returned home with the respectability that had previously been withheld from it.",
    movement:
      "Partners connect in a close embrace and move primarily through a walking vocabulary, with the follower stepping backward as the leader advances, and the dance is fundamentally improvised, drawing on figures such as the ocho, the gancho, the boleo, and the parada, all executed with a grounded weight transfer and a characteristic pause-and-release phrasing.",
    tempo:
      "Tango recordings generally sit between about 108 and 132 beats per minute, with the golden-age orchestras of the 1930s and 1940s typically near 120 BPM, while the related milonga is faster and the vals cruzado is felt in three."
  },
  {
    name: "Cha-cha-chá",
    title: "Cha-cha-chá",
    region: "Cuba",
    stages: 2,
    origin:
      "The cha-cha-chá was created in Havana in 1953 by violinist and composer Enrique Jorrín, who slowed and simplified the danzón-mambo so that the social dancers at Cuban clubs could keep up with it, and the genre takes its onomatopoeic name from the sound of dancers' feet on the triple step.",
    movement:
      "The pattern spans four beats of music but contains five weight changes, with two slow steps followed by a quick triple step often counted as \"two, three, cha-cha-cha,\" and the style calls for compact footwork kept under the body, straight supporting legs, and a distinct hip settle on each completed weight transfer.",
    tempo:
      "Cha-cha-chá is usually played between roughly 110 and 130 beats per minute, with competitive ballroom tempo standardized at approximately 120 to 128 BPM."
  }
]

/**
 * How a dance should be labelled in a list.
 *
 * Plain name in the ordinary case; name and region where two entries share a
 * name, since two rows reading the same thing give the reader nothing to choose
 * between. Computed from the catalogue rather than hard-coded, so adding a
 * shared name later disambiguates itself.
 */
export function danceLabel(index: number): string {
  const dance = DANCES[index]
  if (!dance) {
    return ""
  }
  const shared = DANCES.filter((other) => other.name === dance.name).length > 1
  return shared ? dance.name + "  —  " + dance.region : dance.name
}

/**
 * Stages completed so far, keyed by dance name.
 *
 * Keyed by name rather than by index, so the record survives the catalogue
 * being reordered or added to.
 */
const completedStages: {[name: string]: number} = {}

/**
 * Where a player's progress lives between sessions.
 *
 * Written as one integer per dance rather than a single blob, so a dance that
 * is renamed or dropped from the catalogue just leaves an orphaned key behind
 * instead of corrupting everyone else's record.
 */
const STORE_PREFIX = "danceProgress."

let loaded: boolean = false

function store(): GeneralDataStore | null {
  // Not guaranteed to exist in every context the Lens can run in, and a
  // missing store should cost the player their history, not the whole menu.
  const system = global.persistentStorageSystem
  return system ? system.store : null
}

function load(): void {
  if (loaded) {
    return
  }
  loaded = true

  const data = store()
  if (!data) {
    return
  }
  for (const dance of DANCES) {
    const key = STORE_PREFIX + dance.name
    if (data.has(key)) {
      completedStages[dance.name] = data.getInt(key)
    }
  }
}

function save(dance: string, stages: number): void {
  const data = store()
  if (data) {
    data.putInt(STORE_PREFIX + dance, stages)
  }
}

export class DanceProgress {
  /**
   * Record that one more stage of a dance's tutorial is finished.
   *
   * Never moves a dance backwards: replaying stage one after finishing stage
   * two should not un-finish the dance.
   */
  public static completeStage(dance: string, stageIndex: number): void {
    load()
    const reached = stageIndex + 1
    if (!completedStages[dance] || completedStages[dance] < reached) {
      completedStages[dance] = reached
      save(dance, reached)
    }
  }

  /** Mark every stage of a dance done at once, for a finished lesson. */
  public static complete(dance: string): void {
    const entry = DANCES.find((d) => d.name === dance)
    if (entry) {
      DanceProgress.completeStage(dance, entry.stages - 1)
    }
  }

  public static stagesDone(dance: string): number {
    load()
    return completedStages[dance] ?? 0
  }

  /** True once every stage of that dance's tutorial has been finished. */
  public static isComplete(dance: string): boolean {
    const entry = DANCES.find((d) => d.name === dance)
    if (!entry) {
      return false
    }
    return DanceProgress.stagesDone(dance) >= entry.stages
  }

  /** Wipe the record, on disk as well as in memory. */
  public static reset(): void {
    load()
    const data = store()
    for (const key of Object.keys(completedStages)) {
      delete completedStages[key]
      if (data) {
        data.remove(STORE_PREFIX + key)
      }
    }
  }
}
