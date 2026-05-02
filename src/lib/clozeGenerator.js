// src/lib/clozeGenerator.js
// Pure JS cloze-deletion flashcard generation from pasted text notes.
// Zero API calls, zero network, works fully offline. Instant generation.

const MCAT_TERMS = [
  'glycolysis','pyruvate','acetyl-CoA','NADH','FADH2','ATP','ADP','phosphate',
  'enzyme','substrate','inhibitor','Km','Vmax','catalyst','equilibrium',
  'enthalpy','entropy','Gibbs','oxidation','reduction','electrode','cathode','anode',
  'aldosterone','cortisol','insulin','glucagon','epinephrine','dopamine','serotonin',
  'acetylcholine','GABA','glutamate','nephron','glomerulus','renal','filtration',
  'hemoglobin','myoglobin','pH','buffer','acid','base','enantiomer','stereoisomer',
  'chirality','elimination','attribution','reinforcement','punishment','schema',
  'meiosis','mitosis','replication','transcription','translation','Hardy-Weinberg',
  'natural selection','speciation','alveoli','sarcomere','actin','myosin',
  'depolarization','repolarization','synapse','neurotransmitter','receptor','allosteric',
  'competitive','noncompetitive','uncompetitive','Michaelis','Krebs','citric',
  'oxidative','phosphorylation','proton','gradient','membrane','potential','osmosis',
  'diffusion','facilitated diffusion','endocytosis','exocytosis','mitochondria',
  'ribosome','endoplasmic','Golgi','lysosome','nucleus','chromosome','cofactor',
  'coenzyme','vitamin','hormone','protein','lipid','carbohydrate','nucleotide',
  'sigmoid','cooperativity','Hill coefficient','feedback inhibition','operon',
  'Le Chatelier','Nernst','Henderson-Hasselbalch','Faraday','Boyle','Avogadro',
  'hydrophobic','hydrophilic','amphipathic','micelle','bilayer','electronegativity',
  'ionic bond','covalent bond','hydrogen bond','carbonyl','carboxyl','amine',
  'hydroxyl','thiol','tautomer','aromaticity','resonance','enantiomer','diastereomer',
  'aldehyde','ketone','carboxylic','ester','amide','alcohol','alkene','alkyne',
  'nucleophile','electrophile','carbocation','radical','stereocenter','chirality',
  'isotonic','hypotonic','hypertonic','osmolarity','tonicity','solute','solvent',
  'tidal volume','compliance','surfactant','alveolar','bronchiole','pneumonia',
  'glomerular filtration','tubular reabsorption','tubular secretion','loop of Henle',
  'collecting duct','ADH','aldosterone','renin','angiotensin','RAAS',
  'action potential','resting potential','saltatory conduction','myelin','node of Ranvier',
  'synapse','neurotransmitter','receptor','second messenger','cAMP','cGMP',
  'G protein','tyrosine kinase','phospholipase','diacylglycerol','inositol',
  'MHC','T cell','B cell','antibody','antigen','complement','cytokine','interleukin',
  'natural killer','phagocyte','macrophage','dendritic cell','lymphocyte',
  'Hardy-Weinberg','allele frequency','genetic drift','natural selection','mutation',
  'recombination','crossing over','linkage','epistasis','pleiotropy','penetrance',
  'expressivity','imprinting','epigenetics','methylation','acetylation','chromatin',
];

const DEFINITION_PATTERNS = [
  /(.+?)\s+(?:is defined as|is|are|refers to|means?|represents?)\s+(.+)/i,
  /(.+?):\s+(.+)/,
  /(.+?)\s*[=—–]\s*(.+)/,
];

/**
 * Generate cloze-deletion flashcards from pasted MCAT study notes.
 * Three strategies: definition detection → MCAT term cloze → mid-sentence blank.
 * @param {string} text - Cleaned note text
 * @param {number} maxCards - Maximum cards to generate (default 14)
 * @returns {Array<{front: string, back: string}>}
 */
export function generateClozeFromNotes(text, maxCards = 14) {
  if (!text || text.trim().length < 40) return [];

  const sentences = text
    .replace(/\n{2,}/g, '\n')
    .split(/(?<=[.!?])\s+|\n/)
    .map(s => s.trim())
    .filter(s => s.length > 35 && s.length < 450);

  const cards = [];
  const usedTerms = new Set();

  // ── Strategy 1: Definition pattern detection ────────────────────────────────
  for (const sentence of sentences) {
    if (cards.length >= maxCards) break;
    for (const pattern of DEFINITION_PATTERNS) {
      const match = sentence.match(pattern);
      if (match && match[1].length < 80 && match[2].length > 10) {
        const term = match[1].trim();
        const definition = match[2].trim();
        const key = term.toLowerCase().slice(0, 24);
        if (!usedTerms.has(key) && term.split(' ').length <= 5) {
          usedTerms.add(key);
          cards.push({
            front: `What is ${term}?`,
            back: `${definition}\n\nContext: ${sentence}`,
          });
          break;
        }
      }
    }
  }

  // ── Strategy 2: MCAT term cloze deletion ────────────────────────────────────
  for (const sentence of sentences) {
    if (cards.length >= maxCards) break;
    const termFound = MCAT_TERMS.find(term => {
      const rx = new RegExp(`\\b${term.replace(/[-]/g, '[-]')}\\b`, 'i');
      return rx.test(sentence) && !usedTerms.has(term.toLowerCase());
    });
    if (!termFound) continue;
    usedTerms.add(termFound.toLowerCase());
    const rx = new RegExp(`\\b${termFound.replace(/[-]/g, '[-]')}\\b`, 'i');
    const match = sentence.match(rx);
    if (!match) continue;
    cards.push({
      front: sentence.replace(rx, '___________'),
      back: `${match[0]}\n\nFull sentence: ${sentence}`,
    });
  }

  // ── Strategy 3: Mid-sentence blank fallback ─────────────────────────────────
  if (cards.length < 4) {
    for (const sentence of sentences.slice(0, 20)) {
      if (cards.length >= maxCards) break;
      const words = sentence.split(/\s+/);
      if (words.length < 10) continue;
      const mid = Math.floor(words.length * 0.35);
      const len = Math.min(3, Math.floor(words.length * 0.18));
      const answer = words.slice(mid, mid + len).join(' ');
      if (answer.length < 3) continue;
      const blanked = [...words.slice(0, mid), '___________', ...words.slice(mid + len)].join(' ');
      cards.push({ front: blanked, back: `${answer}\n\nFull: ${sentence}` });
    }
  }

  return cards.slice(0, maxCards);
}

/**
 * Clean pasted text: remove URLs, page numbers, excess whitespace.
 * @param {string} text
 * @returns {string}
 */
export function cleanNotesText(text) {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/^[A-Z\s]{10,}$/gm, '')
    .replace(/\s{3,}/g, ' ')
    .trim();
}
