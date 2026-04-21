// All non-quiz, non-elib constants

// ── LEARNING PATHS ────────────────────────────────────────────────────────────
export const PATHS = {
  surgeon: {
    label:'Surgeon', accent:'#ef4444', quizCats:['Bio/Biochem','Chem/Phys'],
    units:[
      { id:'su1', title:'Biochemistry Foundations', quizCat:'Bio/Biochem', lessons:[
        { id:'su1l1', title:'Enzyme Kinetics & Metabolism', url:'https://www.youtube.com/watch?v=4eLjRcHnMCk', src:'YouTube' },
        { id:'su1l2', title:'Glycolysis & Energy Production', url:'https://www.youtube.com/watch?v=8awy84ZyBaU', src:'YouTube' },
        { id:'su1l3', title:'TCA Cycle & Oxidative Phosphorylation', url:'https://www.youtube.com/watch?v=juM2ROSLWfw', src:'YouTube' },
      ]},
      { id:'su2', title:'Cardiovascular & Respiratory', quizCat:'Bio/Biochem', lessons:[
        { id:'su2l1', title:'Cardiac Physiology & the Heart', url:'https://www.youtube.com/watch?v=X9ZZ6tcxArI', src:'YouTube' },
        { id:'su2l2', title:'Fluids & Hemodynamics', url:'https://www.youtube.com/watch?v=fJFFjQ0A2M4', src:'YouTube' },
        { id:'su2l3', title:'Respiratory System Overview', url:'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle/introduction-to-cell-signaling/v/cell-signaling', src:'Khan Academy' },
      ]},
      { id:'su3', title:'Musculoskeletal & Imaging Physics', quizCat:'Chem/Phys', lessons:[
        { id:'su3l1', title:'Nuclear Physics & Radiation', url:'https://www.youtube.com/watch?v=cwXCILesK-k', src:'YouTube' },
        { id:'su3l2', title:'Optics & Medical Imaging', url:'https://www.youtube.com/watch?v=7cIihTvlx80', src:'YouTube' },
        { id:'su3l3', title:'Kinematics & Biomechanics', url:'https://www.youtube.com/watch?v=xZMwK2HwJ7c', src:'YouTube' },
      ]},
    ]
  },
  internist: {
    label:'Internist', accent:'#3b82f6', quizCats:['Bio/Biochem','Chem/Phys','Psych/Soc'],
    units:[
      { id:'in1', title:'Endocrinology & Metabolism', quizCat:'Bio/Biochem', lessons:[
        { id:'in1l1', title:'Endocrine Glands & Hormones', url:'https://www.youtube.com/watch?v=erAQg0E34C0', src:'YouTube' },
        { id:'in1l2', title:'Gluconeogenesis & Fasting States', url:'https://www.khanacademy.org/science/ap-biology', src:'Khan Academy' },
        { id:'in1l3', title:'Kidney & Nephron Physiology', url:'https://www.youtube.com/watch?v=vNvZaGcLzEo', src:'YouTube' },
      ]},
      { id:'in2', title:'Pharmacology & Acid-Base', quizCat:'Chem/Phys', lessons:[
        { id:'in2l1', title:'Acid-Base Chemistry & Henderson-Hasselbalch', url:'https://www.youtube.com/watch?v=eB1qG5EEDk0', src:'YouTube' },
        { id:'in2l2', title:'Electrochemistry & Galvanic Cells', url:'https://www.youtube.com/watch?v=7b34XYgADlM', src:'YouTube' },
        { id:'in2l3', title:'Thermodynamics & Gibbs Free Energy', url:'https://www.youtube.com/watch?v=Tj-w1W_pZ8M', src:'YouTube' },
      ]},
      { id:'in3', title:'Behavior & Doctoring', quizCat:'Psych/Soc', lessons:[
        { id:'in3l1', title:'Social Psychology & Cognition', url:'https://www.youtube.com/playlist?list=PL8dPuuaLjXtOPRKzVLY0jJY-uHOH9KVU6', src:'Crash Course' },
        { id:'in3l2', title:'Patient Communication & Ethics', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
        { id:'in3l3', title:'Health Disparities & Social Determinants', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
      ]},
    ]
  },
  psychiatrist: {
    label:'Psychiatrist', accent:'#8b5cf6', quizCats:['Bio/Biochem','Psych/Soc'],
    units:[
      { id:'ps1', title:'Neuroscience Fundamentals', quizCat:'Bio/Biochem', lessons:[
        { id:'ps1l1', title:'Action Potentials & Neural Signaling', url:'https://www.youtube.com/watch?v=cn8DxevTQlU', src:'YouTube' },
        { id:'ps1l2', title:'Neurotransmitters & Receptors', url:'https://www.khanacademy.org/science/ap-biology', src:'Khan Academy' },
        { id:'ps1l3', title:'Brain Structures & Functions', url:'https://www.youtube.com/playlist?list=PL8dPuuaLjXtOPRKzVLY0jJY-uHOH9KVU6', src:'Crash Course' },
      ]},
      { id:'ps2', title:'Psychology & Behavioral Science', quizCat:'Psych/Soc', lessons:[
        { id:'ps2l1', title:'Learning Theory & Conditioning', url:'https://www.youtube.com/playlist?list=PL8dPuuaLjXtOPRKzVLY0jJY-uHOH9KVU6', src:'Crash Course' },
        { id:'ps2l2', title:'Memory & Cognition', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
        { id:'ps2l3', title:'Personality & Development', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
      ]},
      { id:'ps3', title:'Social Science & Sociology', quizCat:'Psych/Soc', lessons:[
        { id:'ps3l1', title:'Social Stratification & Inequality', url:'https://www.youtube.com/playlist?list=PL8dPuuaLjXtMJ-AfB_7J1538YKWkZAnGA', src:'Crash Course' },
        { id:'ps3l2', title:'Cultural Influences on Health', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
        { id:'ps3l3', title:'Socialization & Identity', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
      ]},
    ]
  },
  researcher: {
    label:'Researcher', accent:'#f59e0b', quizCats:['Bio/Biochem','Chem/Phys','Psych/Soc'],
    units:[
      { id:'re1', title:'Molecular Biology', quizCat:'Bio/Biochem', lessons:[
        { id:'re1l1', title:'DNA Replication & Repair', url:'https://www.youtube.com/watch?v=Qqe4thU-os8', src:'YouTube' },
        { id:'re1l2', title:'Transcription & Translation', url:'https://www.youtube.com/watch?v=bKIpDtJdK8Q', src:'YouTube' },
        { id:'re1l3', title:'Gene Regulation — The Lac Operon', url:'https://www.youtube.com/watch?v=h_1QLdtF8d0', src:'YouTube' },
      ]},
      { id:'re2', title:'Physical Chemistry', quizCat:'Chem/Phys', lessons:[
        { id:'re2l1', title:'Chemical Kinetics & Rate Laws', url:'https://www.youtube.com/watch?v=Ue2m_l91W2w', src:'YouTube' },
        { id:'re2l2', title:'Thermodynamics & Free Energy', url:'https://www.youtube.com/watch?v=Tj-w1W_pZ8M', src:'YouTube' },
        { id:'re2l3', title:'IR & NMR Spectroscopy', url:'https://www.youtube.com/watch?v=2Tz8N0_Y4w0', src:'YouTube' },
      ]},
      { id:'re3', title:'Epidemiology & Research Methods', quizCat:'Psych/Soc', lessons:[
        { id:'re3l1', title:'Study Design & Bias', url:'https://www.khanacademy.org/math/statistics-probability', src:'Khan Academy' },
        { id:'re3l2', title:'Statistics & Hypothesis Testing', url:'https://www.youtube.com/c/joshstarmer', src:'StatQuest' },
        { id:'re3l3', title:'Epidemiology & Public Health', url:'https://pubmed.ncbi.nlm.nih.gov/', src:'PubMed' },
      ]},
    ]
  },
  pediatrician: {
    label:'Pediatrician', accent:'#10b981', quizCats:['Bio/Biochem','Psych/Soc'],
    units:[
      { id:'pe1', title:'Developmental Biology & Genetics', quizCat:'Bio/Biochem', lessons:[
        { id:'pe1l1', title:'Molecular Biology & Genetics', url:'https://www.youtube.com/watch?v=Qqe4thU-os8', src:'YouTube' },
        { id:'pe1l2', title:'Amino Acids & Protein Structure', url:'https://www.youtube.com/watch?v=PmbcA1Sav7s', src:'YouTube' },
        { id:'pe1l3', title:'Metabolic Disorders & Pediatric Biochem', url:'https://www.khanacademy.org/science/ap-biology', src:'Khan Academy' },
      ]},
      { id:'pe2', title:'Immunology & Infectious Disease', quizCat:'Bio/Biochem', lessons:[
        { id:'pe2l1', title:'Immune System Overview', url:'https://www.youtube.com/watch?v=GIJK3dwCWCw', src:'YouTube' },
        { id:'pe2l2', title:'Vaccines & Immunization', url:'https://www.khanacademy.org/science/ap-biology', src:'Khan Academy' },
        { id:'pe2l3', title:'Microbiology & Infectious Agents', url:'https://www.khanacademy.org/science/ap-biology', src:'Khan Academy' },
      ]},
      { id:'pe3', title:'Child Development & Behavior', quizCat:'Psych/Soc', lessons:[
        { id:'pe3l1', title:'Developmental Psychology (Piaget, Erikson, Vygotsky)', url:'https://www.youtube.com/playlist?list=PL8dPuuaLjXtOPRKzVLY0jJY-uHOH9KVU6', src:'Crash Course' },
        { id:'pe3l2', title:'Attachment Theory & Early Childhood', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
        { id:'pe3l3', title:'Learning & Behavior in Children', url:'https://www.khanacademy.org/test-prep/mcat', src:'Khan Academy' },
      ]},
    ]
  },
  emergency_doc: {
    label:'Emergency Medicine', accent:'#f97316', quizCats:['Bio/Biochem','Chem/Phys'],
    units:[
      { id:'em1', title:'Cardiopulmonary Emergencies', quizCat:'Bio/Biochem', lessons:[
        { id:'em1l1', title:'Cardiac Physiology & Arrhythmias', url:'https://www.youtube.com/watch?v=X9ZZ6tcxArI', src:'YouTube' },
        { id:'em1l2', title:'Action Potentials & Electrophysiology', url:'https://www.youtube.com/watch?v=cn8DxevTQlU', src:'YouTube' },
        { id:'em1l3', title:'Fluid Dynamics & Shock States', url:'https://www.youtube.com/watch?v=fJFFjQ0A2M4', src:'YouTube' },
      ]},
      { id:'em2', title:'Toxicology & Pharmacology', quizCat:'Chem/Phys', lessons:[
        { id:'em2l1', title:'Acid-Base in Critical Care', url:'https://www.youtube.com/watch?v=eB1qG5EEDk0', src:'YouTube' },
        { id:'em2l2', title:'Organic Chemistry of Drug Mechanisms', url:'https://www.youtube.com/watch?v=wX-y00bZ4qI', src:'YouTube' },
        { id:'em2l3', title:'MCAT Math for Quick Calculations', url:'https://www.youtube.com/watch?v=8l-6n1v30Yg', src:'YouTube' },
      ]},
      { id:'em3', title:'Neurological Emergencies', quizCat:'Bio/Biochem', lessons:[
        { id:'em3l1', title:'Neurotransmitters & Signaling', url:'https://www.youtube.com/watch?v=cn8DxevTQlU', src:'YouTube' },
        { id:'em3l2', title:'TCA Cycle & Energy in the Brain', url:'https://www.youtube.com/watch?v=juM2ROSLWfw', src:'YouTube' },
        { id:'em3l3', title:'Sound, Doppler & Diagnostic Imaging', url:'https://www.youtube.com/watch?v=qVNEbcZGAi8', src:'YouTube' },
      ]},
    ]
  },
};

// ── FLASHCARD DECKS ───────────────────────────────────────────────────────────
export const FLASH_DECKS = {
  'Enzyme Kinetics': [
    { front:'What does Km represent?', back:'Substrate concentration at which v = Vmax/2. Lower Km = higher enzyme affinity.' },
    { front:'Effect of competitive inhibitor on Km and Vmax?', back:'Increases apparent Km; Vmax unchanged. Can be overcome by excess substrate.' },
    { front:'Effect of uncompetitive inhibitor?', back:'Decreases both apparent Km and Vmax proportionally. Produces parallel lines on Lineweaver-Burk.' },
    { front:'kcat/Km is called?', back:'The specificity constant — measure of enzyme catalytic efficiency.' },
    { front:'Lineweaver-Burk: x-intercept and y-intercept?', back:'x-intercept = -1/Km; y-intercept = 1/Vmax.' },
  ],
  'Cardiovascular Physiology': [
    { front:'What determines cardiac output?', back:'CO = Heart Rate × Stroke Volume. Normal ~5 L/min at rest.' },
    { front:'Starling law of the heart?', back:'Increased venous return → increased end-diastolic volume → increased stroke volume (Frank-Starling mechanism).' },
    { front:'What is the QRS complex on ECG?', back:'Ventricular depolarization — the electrical event triggering ventricular contraction.' },
    { front:'Normal blood pressure?', back:'Systolic 90-120 mmHg; Diastolic 60-80 mmHg. Pulse pressure = systolic - diastolic.' },
    { front:'Factors increasing heart rate (chronotropy)?', back:'Sympathetic stimulation (β1), catecholamines, decreased baroreceptor firing, hyperthyroidism.' },
  ],
  'Respiratory Physiology': [
    { front:'What is FEV1/FVC ratio?', back:'Fraction of vital capacity exhaled in 1 second. Normal >0.7. Reduced in obstructive disease; may be normal/elevated in restrictive.' },
    { front:'Oxygen-hemoglobin dissociation curve — right shift causes?', back:'Decreased O2 affinity (increased O2 delivery to tissues). Caused by: increased CO2, H+, temperature, 2,3-BPG (CADET mnemonic).' },
    { front:'What is tidal volume?', back:'Volume of air moved per normal breath. Normal ~500 mL at rest.' },
    { front:'Hypoxic pulmonary vasoconstriction?', back:'Pulmonary vessels constrict in response to local hypoxia, diverting blood to better-ventilated areas to optimize V/Q matching.' },
    { front:'Carbonic anhydrase reaction?', back:'CO2 + H2O ⇌ H2CO3 ⇌ HCO3- + H+. CO2 transported mainly as bicarbonate in blood.' },
  ],
  'Renal Physiology': [
    { front:'What is GFR and its normal value?', back:'Glomerular filtration rate — volume of plasma filtered per minute. Normal ~120 mL/min (125 mL/min = 180 L/day).' },
    { front:'Where is most sodium reabsorbed?', back:'~67% in the proximal convoluted tubule (PCT) via cotransport. Also in loop of Henle, DCT (aldosterone-regulated).' },
    { front:'How does aldosterone affect the kidney?', back:'Stimulates principal cells of collecting duct to insert Na+ channels and Na+/K+ ATPase, increasing Na+ reabsorption and K+ excretion.' },
    { front:'Renin-angiotensin-aldosterone system (RAAS) trigger?', back:'Decreased renal perfusion → renin release → angiotensin I → ACE converts to Ang II → aldosterone release → Na+/water retention.' },
    { front:'What is the countercurrent multiplier?', back:'Loop of Henle mechanism creating medullary hyperosmotic gradient, enabling concentrated urine production in collecting ducts (ADH-dependent).' },
  ],
  'Acid-Base Balance': [
    { front:'Normal arterial blood gas values?', back:'pH 7.35-7.45; PaCO2 35-45 mmHg; HCO3- 22-26 mEq/L; PaO2 80-100 mmHg.' },
    { front:'Metabolic acidosis compensatory response?', back:'Hyperventilation (increased respiratory rate) to lower PaCO2. Winters formula: expected PaCO2 = 1.5[HCO3-] + 8 ± 2.' },
    { front:'Causes of elevated anion gap metabolic acidosis?', back:'MUDPILES: Methanol, Uremia, DKA, Propylene glycol, Isoniazid/Iron, Lactic acidosis, Ethylene glycol, Salicylates.' },
    { front:'Respiratory alkalosis — common cause?', back:'Hyperventilation from anxiety, high altitude, pain, or mechanical ventilation → decreased PaCO2 → increased pH.' },
    { front:'Henderson-Hasselbalch equation for blood pH?', back:'pH = 6.1 + log([HCO3-] / 0.03 × PaCO2). At normal values: pH = 6.1 + log(24/1.2) = 6.1 + log(20) ≈ 7.4.' },
  ],
  'Immunology': [
    { front:'MHC class I vs. MHC class II presentation?', back:'MHC I: presents intracellular peptides to CD8+ T cells (all nucleated cells). MHC II: presents extracellular peptides to CD4+ T cells (APCs only — dendritic cells, macrophages, B cells).' },
    { front:'What do CD4+ helper T cells do?', back:'Activate B cells, cytotoxic T cells, and macrophages via cytokines. Critical for adaptive immunity coordination. Depleted in HIV/AIDS.' },
    { front:'Primary vs. secondary immune response?', back:'Primary: slow (days-weeks), IgM dominant, lower titer. Secondary: rapid (hours-days), IgG dominant, higher titer, longer lasting — due to memory B cells.' },
    { front:'Complement system functions?', back:'Opsonization (C3b), chemotaxis (C5a), membrane attack complex (MAC = C5b-9) lysis, mast cell degranulation. Activated by classical, lectin, or alternative pathways.' },
    { front:'What is a type IV hypersensitivity reaction?', back:'Delayed-type hypersensitivity (DTH). T-cell mediated (NOT antibody). Examples: TB skin test, contact dermatitis, transplant rejection. Peaks 48-72 hours.' },
  ],
  'Endocrinology': [
    { front:'Insulin effects on metabolism?', back:'Anabolic: stimulates glucose uptake, glycogen synthesis, protein synthesis, fatty acid synthesis. Inhibits: gluconeogenesis, glycogenolysis, lipolysis, ketogenesis.' },
    { front:'Cortisol effects?', back:'Anti-inflammatory, immunosuppressive. Metabolic: increases gluconeogenesis, protein catabolism, lipolysis. Released from adrenal cortex (zona fasciculata) in response to ACTH.' },
    { front:'Thyroid hormone synthesis requires?', back:'Iodine, thyroglobulin, thyroid peroxidase (TPO), and hydrogen peroxide. T4 → T3 by 5-deiodinase (peripheral conversion). T3 is the active form.' },
    { front:'ADH (vasopressin) mechanism?', back:'Acts on V2 receptors in collecting duct → cAMP → insertion of aquaporin-2 (AQP2) channels → water reabsorption. Deficiency → diabetes insipidus.' },
    { front:'What causes Addison disease?', back:'Primary adrenal insufficiency — destruction of adrenal cortex (autoimmune most common in developed countries). Low cortisol, low aldosterone, high ACTH → hyperpigmentation.' },
  ],
  'Pharmacology Fundamentals': [
    { front:'First-order kinetics in pharmacology?', back:'Rate of elimination proportional to drug concentration. Constant fraction eliminated per unit time. Most drugs follow first-order kinetics. t1/2 is constant.' },
    { front:'Volume of distribution (Vd) formula?', back:'Vd = Dose / Cp0 (initial plasma concentration). High Vd = drug distributes widely into tissues (lipophilic). Low Vd = drug stays in plasma (hydrophilic/large protein-bound).' },
    { front:'Therapeutic index (TI)?', back:'TI = LD50/ED50. Drugs with narrow TI (e.g., lithium, digoxin, warfarin) require monitoring. High TI = safer drug with wide therapeutic window.' },
    { front:'Cytochrome P450 inducers vs inhibitors?', back:'Inducers (increase metabolism, reduce drug effect): rifampin, phenytoin, carbamazepine, barbiturates, St. John\'s Wort. Inhibitors (decrease metabolism, increase drug effect): azole antifungals, macrolides, quinidine, grapefruit juice.' },
    { front:'Beta-blocker mechanism and uses?', back:'Competitive antagonists at β-adrenergic receptors. Uses: hypertension, angina, arrhythmias, heart failure, post-MI, anxiety. Contraindicated in asthma (β2 blockade → bronchoconstriction).' },
  ],
  'Neuroscience Basics': [
    { front:'Resting membrane potential of neurons?', back:'Approximately -70 mV (inside negative relative to outside). Maintained by Na+/K+-ATPase (3 Na+ out, 2 K+ in) and selective K+ permeability.' },
    { front:'Threshold potential for action potential?', back:'Approximately -55 mV. Depolarization to threshold triggers all-or-nothing action potential via voltage-gated Na+ channel opening.' },
    { front:'Function of myelin sheath?', back:'Insulates axons, enabling saltatory conduction (jumping from node to node at Nodes of Ranvier). Increases conduction velocity 50-100x without requiring larger axon diameter.' },
    { front:'Glutamate vs. GABA in the CNS?', back:'Glutamate: main excitatory neurotransmitter (AMPA, NMDA, kainate receptors). GABA: main inhibitory neurotransmitter (GABA-A ionotropic Cl- channels, GABA-B metabotropic). Imbalance in epilepsy.' },
    { front:'Dopamine pathways?', back:'Mesolimbic (reward/motivation — DA dysfunction in addiction/schizophrenia), Mesocortical (cognition/emotion), Nigrostriatal (movement — depleted in Parkinson\'s), Tuberoinfundibular (inhibits prolactin).' },
  ],
  'CARS Strategies': [
    { front:'What is the CARS section testing?', back:'Critical Analysis and Reasoning Skills — reading comprehension of humanities and social science passages. No prior knowledge required; all answers in or supported by the passage.' },
    { front:'Most common CARS mistake?', back:'Bringing in outside knowledge or personal opinions. Every answer must be directly supported by the passage text. Wrong choices often use "too extreme" language.' },
    { front:'How to handle difficult CARS passages?', back:'Read actively for the author\'s main point, tone, and structure. Do not reread extensively. Move on if struggling with a question — mark it and return. Time management is critical (passage + questions = ~8-9 min).' },
    { front:'Types of CARS question stems?', back:'Main Idea, Inference, Strengthen/Weaken, Apply, Evaluate, Clarification, New Information. Categorize the stem before answering to select the right approach.' },
    { front:'Tone words in CARS — what to watch for?', back:'Author\'s attitude: words like "unfortunately," "however," "importantly," "merely," "ironically" signal opinion. Absolute words ("always," "never," "must") in answer choices are often wrong in CARS.' },
  ],
  'Vitamins & Cofactors': [
    { front:'Water-soluble vitamins?', back:'B vitamins (B1 thiamine, B2 riboflavin, B3 niacin, B5 pantothenic acid, B6 pyridoxine, B7 biotin, B9 folate, B12 cobalamin) + Vitamin C. Excreted in urine — toxicity less common.' },
    { front:'Thiamine (B1) deficiency?', back:'Beriberi (peripheral neuropathy, cardiac failure) and Wernicke-Korsakoff syndrome (ophthalmoplegia, ataxia, confusion, memory loss — seen in alcoholics). Cofactor for pyruvate dehydrogenase, alpha-KG dehydrogenase.' },
    { front:'Folate vs. B12 deficiency?', back:'Both cause macrocytic megaloblastic anemia. Only B12 deficiency causes subacute combined degeneration of spinal cord (neurological symptoms). Folate deficiency → neural tube defects in pregnancy.' },
    { front:'Fat-soluble vitamins?', back:'A, D, E, K (mnemonic: ADEK or "DEAK of cards"). Stored in fat and liver; toxicity more common than water-soluble. Absorbed with dietary fat; deficiency in fat malabsorption.' },
    { front:'Vitamin D synthesis and function?', back:'Skin: 7-dehydrocholesterol + UV → cholecalciferol (D3). Liver: → 25-OH-D3. Kidney: → 1,25(OH)2-D3 (calcitriol, active form). Function: increases intestinal Ca2+ and phosphate absorption.' },
  ],
  'MCAT Test Strategy': [
    { front:'How long is the MCAT and what are the sections?', back:'7.5 hours total (with breaks). 4 sections: Chem/Phys (95 min, 59 Qs), CARS (90 min, 53 Qs), Bio/Biochem (95 min, 59 Qs), Psych/Soc (95 min, 59 Qs). Total 230 questions.' },
    { front:'MCAT scoring?', back:'Each section scored 118-132; total score 472-528. Mean score ~500-501. Scores above 511 are ~80th percentile. Top medical schools average 517-520+.' },
    { front:'How to approach passage-based questions?', back:'Skim passage for structure and main idea first, then read questions. Most MCAT questions require applying content knowledge to passage context — do not expect pure memorization questions.' },
    { front:'When to use process of elimination?', back:'Always. Even on hard questions, identifying 2 wrong answers gives 50% chance. Wrong choices typically: use extreme language, contradict the passage, are too specific, or reverse a relationship.' },
    { front:'Recommended practice timeline?', back:'Full-length exams under timed, test-day conditions (6-8 total, mostly in the final 4-6 weeks). Review every wrong answer thoroughly. Start content review 3-6 months out; active practice in final 2 months.' },
  ],
};

// ── SCHOOL DATA ───────────────────────────────────────────────────────────────
export const SCHOOL_DATA = [
  { name:'Harvard Medical School', gpa:3.9, mcat:522, accept:3.4, state:'MA', type:'Private' },
  { name:'Johns Hopkins School of Medicine', gpa:3.9, mcat:522, accept:6.0, state:'MD', type:'Private' },
  { name:'Stanford School of Medicine', gpa:3.8, mcat:519, accept:3.0, state:'CA', type:'Private' },
  { name:'UCSF School of Medicine', gpa:3.8, mcat:517, accept:3.4, state:'CA', type:'Public' },
  { name:'Perelman School of Medicine (Penn)', gpa:3.9, mcat:522, accept:5.0, state:'PA', type:'Private' },
  { name:'Columbia Vagelos College of P&S', gpa:3.8, mcat:522, accept:4.0, state:'NY', type:'Private' },
  { name:'Duke University School of Medicine', gpa:3.8, mcat:519, accept:5.0, state:'NC', type:'Private' },
  { name:'Washington University School of Medicine', gpa:3.9, mcat:522, accept:9.0, state:'MO', type:'Private' },
  { name:'Mayo Clinic Alix School of Medicine', gpa:3.9, mcat:520, accept:2.4, state:'MN', type:'Private' },
  { name:'Vanderbilt University School of Medicine', gpa:3.8, mcat:521, accept:7.0, state:'TN', type:'Private' },
  { name:'University of Michigan Medical School', gpa:3.8, mcat:517, accept:8.0, state:'MI', type:'Public' },
  { name:'Northwestern Feinberg School of Medicine', gpa:3.8, mcat:519, accept:8.0, state:'IL', type:'Private' },
  { name:'Weill Cornell Medical College', gpa:3.8, mcat:521, accept:6.0, state:'NY', type:'Private' },
  { name:'Yale School of Medicine', gpa:3.8, mcat:521, accept:6.0, state:'CT', type:'Private' },
  { name:'Emory University School of Medicine', gpa:3.7, mcat:517, accept:8.0, state:'GA', type:'Private' },
  { name:'UCLA David Geffen School of Medicine', gpa:3.8, mcat:517, accept:3.2, state:'CA', type:'Public' },
  { name:'UT Southwestern Medical Center', gpa:3.8, mcat:517, accept:7.0, state:'TX', type:'Public' },
  { name:'UNC School of Medicine', gpa:3.7, mcat:515, accept:7.0, state:'NC', type:'Public' },
  { name:'Baylor College of Medicine', gpa:3.8, mcat:518, accept:7.0, state:'TX', type:'Private' },
  { name:'University of Pittsburgh School of Medicine', gpa:3.7, mcat:516, accept:6.0, state:'PA', type:'Public' },
  { name:'Boston University School of Medicine', gpa:3.7, mcat:515, accept:4.0, state:'MA', type:'Private' },
  { name:'Georgetown University School of Medicine', gpa:3.6, mcat:514, accept:3.0, state:'DC', type:'Private' },
  { name:'Thomas Jefferson University Sidney Kimmel', gpa:3.6, mcat:513, accept:6.0, state:'PA', type:'Private' },
  { name:'Temple University Lewis Katz', gpa:3.5, mcat:512, accept:5.0, state:'PA', type:'Public' },
  { name:'Tulane University School of Medicine', gpa:3.6, mcat:512, accept:8.0, state:'LA', type:'Private' },
  { name:'Case Western Reserve School of Medicine', gpa:3.7, mcat:515, accept:7.0, state:'OH', type:'Private' },
  { name:'University of Virginia School of Medicine', gpa:3.7, mcat:516, accept:9.0, state:'VA', type:'Public' },
  { name:'University of Colorado School of Medicine', gpa:3.7, mcat:515, accept:6.0, state:'CO', type:'Public' },
  { name:'Indiana University School of Medicine', gpa:3.7, mcat:511, accept:11.0, state:'IN', type:'Public' },
  { name:'University of South Carolina School of Medicine', gpa:3.6, mcat:510, accept:12.0, state:'SC', type:'Public' },
];

// ── MMI QUESTIONS ─────────────────────────────────────────────────────────────
export const MMI_QS = [
  { q:`A 16-year-old patient requests contraception without parental notification. How do you handle this situation?`, type:'Ethics', points:['Patient autonomy vs. parental rights','Mature minor doctrine and state laws','Confidentiality exceptions and duty to warn'] },
  { q:`You witness a colleague accepting a gift from a pharmaceutical representative before making a prescribing decision. What do you do?`, type:'Professionalism', points:['Conflict of interest in medicine','Appropriate channels for reporting','Balancing collegiality with integrity'] },
  { q:`Describe a time you failed at something important and what you learned from it.`, type:'Personal', points:['Self-awareness and honesty','Growth mindset and resilience','Applying lessons to future situations'] },
  { q:`Why do you want to be a physician rather than another healthcare professional (nurse, PA, etc.)?`, type:'Motivation', points:['Role differentiation in healthcare','Depth of training and scope of practice','Specific physician skills you want to develop'] },
  { q:`The United States ranks poorly in health outcomes compared to other developed nations despite high spending. What are the main causes?`, type:'Policy', points:['Access and insurance system fragmentation','Social determinants of health','Preventive vs. acute care emphasis'] },
  { q:`A patient from a different cultural background refuses a blood transfusion that you believe is medically necessary. How do you proceed?`, type:'Cultural Competency', points:['Religious and cultural beliefs in healthcare decisions','Informed refusal vs. informed consent','Role of family and community in medical decisions'] },
  { q:`You are in a patient room when their family member begins to cry and says they cannot understand why their loved one is not getting better. What do you say?`, type:'Communication', points:['Empathetic listening without false reassurance','Breaking difficult news compassionately','When to involve additional support (chaplain, social worker)'] },
  { q:`You discover that a close friend is engaging in academic dishonesty during your medical school exams. What do you do?`, type:'Ethics', points:['Honesty as foundational medical value','Personal loyalty vs. professional integrity','Institutional reporting processes'] },
  { q:`What does the concept of "justice" mean in bioethics, and how does it apply to resource allocation in medicine?`, type:'Ethics', points:['Distributive justice — fair allocation of scarce resources','Triage principles and utilitarian vs. egalitarian approaches','Health disparities and systemic inequity'] },
  { q:`A competent patient with terminal cancer is requesting an unusually high dose of opioids for pain management. The dose concerns you. How do you approach this?`, type:'Situational', points:['Adequate pain management as ethical obligation','Risk of abuse vs. under-treatment of pain','Multidisciplinary palliative care approach'] },
  { q:`Describe a moment when you had to work with a team where there was significant conflict. How did you handle it?`, type:'Communication', points:['Conflict resolution strategies','Active listening and perspective-taking','Maintaining team function and patient outcomes'] },
  { q:`Healthcare providers have among the highest rates of burnout of any profession. What are the causes, and how would you protect yourself?`, type:'Personal', points:['Systemic factors (hours, administrative burden)','Personal resilience strategies','Seeking help without stigma in medicine'] },
  { q:`Should medical schools practice affirmative action in admissions? Defend your position.`, type:'Policy', points:['Diversity in medicine and health disparities','Fairness vs. structural inequality',"Evidence on diversity's impact on healthcare outcomes"] },
  { q:`A new, very expensive drug can cure a rare disease but costs $3 million per patient. Should insurance be required to cover it?`, type:'Policy', points:['Cost-effectiveness analysis (QALY)','Individual patient needs vs. population health spending','Pharmaceutical pricing ethics'] },
  { q:`Tell me about a time you advocated for someone who could not advocate for themselves.`, type:'Personal', points:['Physician as patient advocate','Power differentials in healthcare','Concrete example with reflection'] },
  { q:`How has COVID-19 changed your perspective on medicine and public health?`, type:'Motivation', points:['Intersection of medicine and public policy','Healthcare system vulnerabilities exposed','Personal motivation reinforced or changed by the pandemic'] },
  { q:`A colleague makes a derogatory joke about a patient based on their race. You are in a team setting. How do you respond?`, type:'Professionalism', points:['Implicit bias and microaggressions in medicine','Real-time vs. later intervention','Creating psychologically safe clinical environments'] },
  { q:`What is the greatest ethical challenge facing medicine in the next 20 years?`, type:'Ethics', points:['AI in clinical decision-making','Genetic editing and enhancement','Health equity and global access to innovation'] },
  { q:`You are on a medical mission abroad and encounter a cultural practice that you believe harms patients. How do you navigate this?`, type:'Cultural Competency', points:['Cultural humility vs. moral absolutism','Working within communities vs. imposing external values','Sustainable vs. short-term mission work'] },
  { q:`You are the last person to speak in a group discussion and all other candidates have already made your point. What do you do?`, type:'Situational', points:['Intellectual honesty and avoiding repetition','Adding novel perspective or synthesis','Grace under unexpected pressure'] },
];

// ── COMPETITIONS & OPPORTUNITIES ──────────────────────────────────────────────
export const COMPETITIONS = [
  { name:'Intel ISEF', type:'Competition', desc:'Largest pre-college science fair — winners receive significant scholarship awards.', effort:'Elite', level:'National' },
  { name:'AAMC Research Program', type:'Research', desc:'AAMC-affiliated undergraduate research programs at medical institutions.', effort:'Competitive', level:'National' },
  { name:'Goldwater Scholarship', type:'Scholarship', desc:'Prestigious scholarship for science/math/engineering students planning research careers.', effort:'Elite', level:'National' },
  { name:'NIH Summer Research Program', type:'Research', desc:'Competitive paid summer research internship at the NIH campus in Bethesda, MD.', effort:'Elite', level:'National' },
  { name:'AMA Foundation Scholarship', type:'Scholarship', desc:'American Medical Association scholarship for medical school applicants.', effort:'Competitive', level:'National' },
  { name:'Alpha Epsilon Delta (Pre-Med Honor Society)', type:'Organization', desc:'Pre-med honor society with chapters at many universities — leadership opportunities.', effort:'Open', level:'State' },
  { name:'AMSA (American Medical Student Association)', type:'Organization', desc:'Largest independent medical student organization. Advocacy, leadership, service programs.', effort:'Open', level:'National' },
  { name:'Hospital Volunteering', type:'Volunteering', desc:'Direct patient contact — essential for applications. Minimum 100-200+ hours recommended.', effort:'Open', level:'State' },
  { name:'Habitat for Humanity', type:'Volunteering', desc:'Community service showing commitment to underserved populations — valued by med schools.', effort:'Open', level:'State' },
  { name:'Collegiate Science & Technology Entry Program (CSTEP)', type:'Research', desc:'NY state program funding research opportunities for underrepresented STEM students.', effort:'Competitive', level:'State' },
  { name:'Society for Advancement of Chicanos/Hispanics and Native Americans in Science (SACNAS)', type:'Conference', desc:'Annual conference with strong medical school recruiting and minority health focus.', effort:'Open', level:'National' },
  { name:'Association of American Indian Physicians Student Fellowship', type:'Research', desc:'Research fellowship specifically for Native American pre-med students.', effort:'Competitive', level:'National' },
  { name:'Soros Fellowship for New Americans', type:'Scholarship', desc:'Scholarship for immigrant and children of immigrants pursuing graduate education.', effort:'Elite', level:'National' },
  { name:'Jack Kent Cooke Foundation', type:'Scholarship', desc:'Scholarship for high-achieving students from lower-income families.', effort:'Elite', level:'National' },
  { name:'Global Health Corps Fellowship', type:'Clinical', desc:'Year-long paid fellowship in global public health — excellent for global health interest.', effort:'Elite', level:'National' },
  { name:'AmeriCorps Health Programs', type:'Clinical', desc:'Paid health service program with loan forgiveness — builds clinical hours and community service.', effort:'Open', level:'State' },
  { name:'Free Clinic Volunteering', type:'Clinical', desc:'Direct clinical experience with underserved populations — highly valued by adcoms.', effort:'Open', level:'State' },
  { name:'Sigma Xi Research Society', type:'Organization', desc:'Scientific research honor society — join as an associate member through undergraduate research.', effort:'Competitive', level:'National' },
  { name:'Emergency Medical Technician (EMT) Certification', type:'Clinical', desc:'EMT certification provides direct patient care experience and clinical skills.', effort:'Competitive', level:'State' },
  { name:'Urban Indian Health Commission', type:'Volunteering', desc:'Health service programs for urban Native American communities — valued community engagement.', effort:'Open', level:'State' },
];

// ── DIAGNOSTIC QUESTIONS ──────────────────────────────────────────────────────
export const DIAG_QS = [
  { q:'Which MCAT subject excites you most right now?', ch:['Biochemistry & Molecular Biology','Chemistry & Physics','Psychology & Sociology','Research Methods & Statistics'], type:'interest', map:['biochem','chemphys','psychsoc','research'] },
  { q:'A patient presents with elevated serum glucose and polyuria. Which pathway is most likely dysregulated?', ch:['Glycolysis and insulin signaling','Fluid mechanics and osmotic pressure','Social cognitive processing','Epidemiological risk factors'], type:'content', map:['biochem','chemphys','psychsoc','research'] },
  { q:'You find the most satisfaction in interactions that involve:', ch:['Complex problem-solving with technical detail','Physical hands-on procedures','Understanding human behavior and emotions','Collecting and analyzing data carefully'], type:'interest', map:['biochem','chemphys','psychsoc','research'] },
  { q:'The Nernst equation relates to which MCAT topic?', ch:['Membrane potential and ion gradients','Enzyme inhibition kinetics','Social stratification','Statistical power'], type:'content', map:['chemphys','biochem','psychsoc','research'] },
  { q:'Which career aspect appeals to you most?', ch:['Performing complex technical procedures and surgery','Managing multiple organ systems and chronic disease','Understanding patients\' psychological context','Advancing medicine through discovery'], type:'interest', map:['biochem','biochem','psychsoc','research'] },
  { q:'Le Chatelier\'s principle is applied when analyzing:', ch:['Acid-base equilibrium in blood buffering','Michaelis-Menten enzyme kinetics','Attribution errors in clinical settings','Cohort vs. case-control study design'], type:'content', map:['chemphys','biochem','psychsoc','research'] },
  { q:'When you think about your future practice, you imagine:', ch:['Operating room — high stakes, technical, immediate impact','Clinic or ward — longitudinal patient relationships','Therapy, consultation, or community mental health','Laboratory, bench, or population research'], type:'interest', map:['biochem','biochem','psychsoc','research'] },
  { q:'Which describes the bystander effect?', ch:['A pharmacokinetic drug interaction','Diffusion of responsibility reducing individual action in groups','Competitive inhibition of enzyme active sites','Confounding variable in observational studies'], type:'content', map:['chemphys','psychsoc','biochem','research'] },
  { q:'Which aspect of studying energizes you the most?', ch:['Memorizing pathways and mechanisms precisely','Working through physics and math problems','Reading about human behavior and society','Evaluating study designs and data critically'], type:'interest', map:['biochem','chemphys','psychsoc','research'] },
  { q:'Which specialty would you most want to shadow?', ch:['Surgery or Emergency Medicine','Internal Medicine or Family Medicine','Psychiatry or Pediatrics','Research or Public Health/Preventive Medicine'], type:'interest', map:['biochem','biochem','psychsoc','research'] },
  { q:'Okazaki fragments are associated with:', ch:['Lagging strand synthesis during DNA replication','Gluconeogenesis bypass reactions','Short-term memory encoding','Cross-sectional study sampling error'], type:'content', map:['biochem','chemphys','psychsoc','research'] },
  { q:'How comfortable are you with ambiguity in your work?', ch:['I prefer clear protocols and defined outcomes','I can adapt but prefer structured environments','I thrive in complex, interpersonal, uncertain situations','I seek to create clarity through research and evidence'], type:'interest', map:['chemphys','biochem','psychsoc','research'] },
];
