// ─────────────────────────────────────────────────────────────────────────────
// In-house lesson content — barrel. One file per pathway (see PATHS in
// ../constants.js), merged here into a single LESSON_CONTENT object keyed by
// lesson id, exactly as the pre-split src/data/lessonContent.js used to export
// it. Add a new pathway's import/spread here as its batch is built — see the
// Learning Pathway completion plan for the build order.
// ─────────────────────────────────────────────────────────────────────────────
import { EXPLORING_CONTENT } from './exploring.js';
import { PHYSICIAN_CONTENT } from './physician.js';
import { NURSING_CONTENT } from './nursing.js';
import { PHYSICIAN_ASSISTANT_CONTENT } from './physicianAssistant.js';
import { PHARMACY_CONTENT } from './pharmacy.js';
import { DENTISTRY_CONTENT } from './dentistry.js';
import { BIOMED_RESEARCH_CONTENT } from './biomedResearch.js';
import { PHYSICAL_OCCUP_THERAPY_CONTENT } from './physicalOccupTherapy.js';
import { PUBLIC_HEALTH_CONTENT } from './publicHealth.js';
import { HEALTH_ADMIN_CONTENT } from './healthAdmin.js';
// The foundations tier (see data/foundationUnits.js) is not a pathway — its two
// units are appended to every pathway and share one id space, so its content
// merges in here exactly like a pathway's does.
import { COURSE_STRATEGY_CONTENT } from './courseStrategy.js';
import { CERTIFICATION_CONTENT } from './certifications.js';

export const LESSON_CONTENT = {
  ...EXPLORING_CONTENT,
  ...PHYSICIAN_CONTENT,
  ...NURSING_CONTENT,
  ...PHYSICIAN_ASSISTANT_CONTENT,
  ...PHARMACY_CONTENT,
  ...DENTISTRY_CONTENT,
  ...BIOMED_RESEARCH_CONTENT,
  ...PHYSICAL_OCCUP_THERAPY_CONTENT,
  ...PUBLIC_HEALTH_CONTENT,
  ...HEALTH_ADMIN_CONTENT,
  ...COURSE_STRATEGY_CONTENT,
  ...CERTIFICATION_CONTENT,
};
