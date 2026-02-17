import type {
  IDelayKnowledgeBase,
  DelayCategory,
  DecisionFrameworkEntry,
  WorkedExample,
  GrayAreaScenario,
  CheatSheetSection,
  KnowledgeSection,
} from '../interfaces/IDelayKnowledgeBase';
import type { ProjectDocumentType } from '../entities/ProjectDocument';

const CONTRACT_BASIS = `Section 1-08.4: The Contractor must diligently pursue the Work to the Physical Completion Date. The Contractor must not voluntarily shut down or slow Work operations without requesting and obtaining prior approval of the Engineer.

Section 1-08.8(1): The Contractor must show that a claimed delay had a specific impact on the critical path, was the sole cause of such impact (except in concurrent delay), and could not have been avoided by resequencing of the Work or other reasonable alternative.

Section 1-08.8(2) - Non-Excusable Delays: Delays caused by factors within the Contractor's control that could have been foreseen or avoided had the Contractor exercised due care, prudence, foresight, or diligence and pursued the Work vigorously and without unauthorized interruption.`;

const CORE_TEST = `Was the Contractor doing everything within its power to diligently prosecute the Work on this day? If the answer is no, and the reason is not an owner-caused event, force majeure, or declared unworkable day, then the period of inactivity or inefficiency is a contractor-caused delay.`;

const DELAY_DEFINITION = `A contractor-caused delay is any act, omission, failure, or inefficiency by the Contractor (including its subcontractors, suppliers, and agents) that prevents or slows progress on the Work, and for which the Owner bears no responsibility. These delays are non-excusable, and the Contractor is not entitled to a time extension.

The core test is: Was the delay within the Contractor's control, and could it have been foreseen or avoided through due care, prudence, foresight, or diligence?`;

const CATEGORIES: ReadonlyArray<DelayCategory> = [
  {
    name: 'Resource & Staffing Failures',
    delayTypes: [
      {
        indicator: 'Insufficient crew size',
        whatToLookFor: 'Crew counts below what is needed for the planned activity. Compare daily crew numbers against schedule activity durations and planned production rates. Eg: "3 laborers on site" when activity requires 5+.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Key personnel absent',
        whatToLookFor: 'Superintendent, foreman, or specialty trade lead not on site. Look for entries like "waiting for foreman" or "no direction from superintendent."',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Late start / early quit',
        whatToLookFor: 'Crew arriving significantly after normal start time or leaving early without justification. Check sign-in times vs. standard work hours.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Crew standing idle (no owner cause)',
        whatToLookFor: 'Workers on site but not performing productive work. If no owner-caused hold, restriction, or access issue is noted, this is a contractor efficiency issue.',
        classification: 'Contractor Delay',
      },
    ],
  },
  {
    name: 'Subcontractor & Supplier Failures',
    delayTypes: [
      {
        indicator: 'Subcontractor no-show',
        whatToLookFor: 'Scheduled subcontractor did not mobilize. Entries like "electrical sub not on site" or "waiting on electrical crew." The general contractor is responsible for managing its subs.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Material/concrete delivery failure',
        whatToLookFor: 'Planned materials did not arrive or arrived late causing work interruption. Example: concrete truck delayed 1.5 hours causing potential cold joint. Supplier delays are attributable to the Contractor.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Wrong material delivered',
        whatToLookFor: 'Material arrived but was incorrect specification, size, or type. Requires reorder and impacts scheduled installation.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Sub performing work out of sequence',
        whatToLookFor: 'Subcontractor working in an area or on an activity not aligned with the current schedule update (unless revised on the schedule to reflect the revised sequencing), causing cascading impacts to other trades.',
        classification: 'Contractor Delay',
      },
    ],
  },
  {
    name: 'Quality Deficiencies & Rework',
    delayTypes: [
      {
        indicator: 'Defective work / NCR-related rework',
        whatToLookFor: 'Work rejected by inspector, failed test, or non-conformance report (NCR) issued. Examples: removing and replacing curb section, rebuilding riser due to being 2" too high, regrading subgrade for 4+ hours to correct elevations.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Signal head / equipment misalignment (NCR)',
        whatToLookFor: 'NCR for non-conforming installation. Example: signal heads not aligning with TCP, requiring adjustment at Contractor\'s cost.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Cold joints in concrete placement',
        whatToLookFor: 'Disruption in concrete pour sequence. Flag as potential NCR even if not yet formally issued. May require panel removal and replacement.',
        classification: 'Contractor Delay (Potential)',
      },
      {
        indicator: 'Incomplete work blocking successors',
        whatToLookFor: 'Predecessor activity not finished to the level required for the next trade to begin. Example: operations shut down because intersection section has not passed compaction testing.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Temporary protection deficiencies',
        whatToLookFor: 'Temp asphalt, sheeting, or barricades not providing adequate pedestrian/traffic protection. Likely requires rework to bring into compliance.',
        classification: 'Contractor Delay',
      },
    ],
  },
  {
    name: 'Planning, Coordination & Sequencing Failures',
    delayTypes: [
      {
        indicator: 'Forgotten or missed work',
        whatToLookFor: 'Inspector notes that contractor is returning to perform work that was missed or forgotten. Example: "Trenching for the conduit run that they forgot." Requires remobilization and disrupts sequence.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Work out of sequence vs. schedule',
        whatToLookFor: 'Crew working on activities not on the current schedule update or performing work in a different zone/location than planned (unless revised on the schedule to reflect the revised sequencing).',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Diverting resources to non-project scope',
        whatToLookFor: 'Contractor performing work not in the contract scope. Example: "Not the project\'s scope but here is a photo." Question why resources are being diverted.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Double handling of materials',
        whatToLookFor: 'Loading, moving, and re-loading material unnecessarily. Classify as contractor delay only if the double handling was not anticipated in the baseline schedule and reflects an inefficiency.',
        classification: 'Contractor Delay (Conditional)',
      },
      {
        indicator: 'Failure to request timely inspections',
        whatToLookFor: 'Work was ready for inspection but contractor did not provide required notice.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Late or incomplete submittals',
        whatToLookFor: 'Submittals not provided per the schedule or returned for correction due to incomplete/non-conforming content.',
        classification: 'Contractor Delay',
      },
    ],
  },
  {
    name: 'Equipment Failures & Utility Strikes',
    delayTypes: [
      {
        indicator: 'Equipment breakdown',
        whatToLookFor: 'Critical equipment non-operational. "Backhoe down; waiting for mechanic." Unless caused by an unforeseen site condition that falls into an accepted Differing Site Condition (DSC).',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Utility strike on known utility',
        whatToLookFor: 'Contractor strikes a utility that was shown on plans or previously located/marked. Example: "Civil crew has struck known 6" concrete storm drainpipe." Damage to known utilities is a contractor-caused event.',
        classification: 'Contractor Delay',
      },
      {
        indicator: 'Equipment not mobilized',
        whatToLookFor: 'Planned activity requires equipment that has not been brought to the site.',
        classification: 'Contractor Delay',
      },
    ],
  },
];

const EXCLUSIONS = `The following are generally NOT contractor-caused delays:

1. Differing Site Conditions (DSCs): Work under accepted DSCs is NOT a contractor-caused delay. Example: water service labeled as 3/4" in plans found to be 4" cast iron in the field. A full list of accepted DSCs will be maintained for reference.

2. Unforeseen underground conditions: Encountering roots, unmarked utilities, or unexpected existing electrical conduits in a trench that were not shown in the contract documents. For Utilities unless they are classified as Utility Strike.

3. Failed tests due to existing soil conditions: Compaction tests that fail due to heterogeneous in-situ material are not contractor error. The proctor value may not represent the actual soil characteristics at the test location.

4. Owner-directed work suspensions: Field Memoranda directing suspension of specific activities due to reasons other than safety. Suspension of work or specific activities due to safety reasons ARE Contractor-Caused Delay.

5. Design errors, omissions, or late design changes: Owner-issued design revisions, RFI responses that change scope.

6. Third-party delays beyond contractor control: Utility company failing to relocate on schedule, permit authority delays; but only if the contractor timely initiated the process.

7. Unusually severe weather: Only if declared an Unworkable Day by the Engineer per Section 1-08.5.

IMPORTANT: If an owner-caused event occurs but the Contractor fails to pursue available work elsewhere on the project, the period of inactivity in the unaffected areas may still be classified as a contractor-caused delay. The Contractor's obligation under Section 1-08.4 to diligently pursue the Work applies at all times.`;

const DECISION_FRAMEWORK: ReadonlyArray<DecisionFrameworkEntry> = [
  {
    scenario: 'Crew arrived late to work area',
    keyQuestion: 'Was the late arrival caused by an owner-directed restriction, traffic control issue managed by owner, or permit condition?',
    ifYes: 'Owner Delay or Shared',
    ifNo: 'Contractor Delay',
  },
  {
    scenario: 'Work stopped for part of the day',
    keyQuestion: 'Was the stoppage directed by the Engineer, caused by a utility conflict, differing site condition, or third-party (not sub)?',
    ifYes: 'Potentially Owner Delay',
    ifNo: 'Contractor Delay',
  },
  {
    scenario: 'Material not available on site',
    keyQuestion: 'Was the material shortage caused by an owner design change, late approval, or procurement delay on an owner-furnished item?',
    ifYes: 'Owner Delay',
    ifNo: 'Contractor Delay',
  },
  {
    scenario: 'Rework performed',
    keyQuestion: 'Was the rework caused by a design error, changed condition, or owner-directed revision?',
    ifYes: 'Owner Delay',
    ifNo: 'Contractor Delay (NCR)',
  },
  {
    scenario: 'Low crew count or no work in an area',
    keyQuestion: 'Was an owner restriction, permit limitation, or utility conflict preventing access to the work area?',
    ifYes: 'Owner Delay',
    ifNo: 'Contractor Delay (Staffing)',
  },
  {
    scenario: 'Equipment breakdown',
    keyQuestion: 'Was the breakdown caused by an unforeseen site condition (e.g., hitting unmarked utility)?',
    ifYes: 'Potentially Shared',
    ifNo: 'Contractor Delay',
  },
  {
    scenario: 'Subcontractor did not show up',
    keyQuestion: 'Was the sub\'s absence caused by an owner-directed suspension, permit issue, or design hold?',
    ifYes: 'Owner Delay',
    ifNo: 'Contractor Delay',
  },
  {
    scenario: 'Weather day claimed but crew worked elsewhere',
    keyQuestion: 'Did the owner declare the day an Unworkable Day per Section 1-08.5?',
    ifYes: 'Non-Compensable (Weather)',
    ifNo: 'Contractor Delay if work was feasible',
  },
];

const WORKED_EXAMPLES_DELAYS: ReadonlyArray<WorkedExample> = [
  {
    id: 'A',
    title: 'Subgrade Rework - Regrading Due to Incorrect Elevations',
    excerpt: 'The 7:00 AM crew arrived on site and removed all plastic sheeting from the subgrade. Multiple areas were identified where the planned concrete depth would exceed the specified maximum of 13.5 inches. Civil Crew #3 spent more than four hours regrading the subgrade to achieve the required elevations. Operations were shut down at approximately 10:00 AM for the remainder of the day because a predecessor activity (intersection compaction) was not complete.',
    analysis: 'This entry contains two distinct contractor-caused delays. First, the subgrade was not graded to the correct elevations before concrete placement was scheduled, requiring 4+ hours of rework. Second, operations were shut down entirely because a predecessor activity (intersection compaction) was not complete. Both are planning and quality failures within the Contractor\'s control.',
    classification: 'CONTRACTOR DELAY - Rework + Incomplete predecessor blocking successor',
  },
  {
    id: 'B',
    title: 'Utility Strike on Known Storm Drain',
    excerpt: 'UTILITY STRIKE: Civil crew has struck known 6" concrete storm drainpipe during excavator operations. QC was informed of the event for documentation and CM team was informed as well as utility inspector.',
    analysis: 'The key word is "known." The utility was identified in the contract documents. Striking a known utility during excavation reflects a failure to exercise due care during operations. The time spent on damage assessment, repair coordination, and any work stoppage is a contractor-caused delay.',
    classification: 'CONTRACTOR DELAY - Utility strike on known utility',
  },
  {
    id: 'C',
    title: 'Concrete Delivery Delay Causing Cold Joint',
    excerpt: 'At 10:00 AM, concrete arrived on-site. The first truck was tested and approved for placement. The first two trucks were delivered without issues. However, the third truck arrived after a delay of approximately 1 hour and 24 minutes, potentially resulting in a cold joint.',
    analysis: 'Supplier delivery delays are attributable to the Contractor. The Contractor is responsible for managing its concrete supplier\'s delivery schedule. The 1.5-hour gap between trucks disrupted the pour and created a potential cold joint, which may require panel removal and replacement (further contractor delay if an NCR is issued).',
    classification: 'CONTRACTOR DELAY - Supplier failure + potential NCR',
  },
  {
    id: 'D',
    title: 'Forgotten Conduit Run',
    excerpt: 'Comment: Trenching for the conduit run that they forgot.',
    analysis: 'The word "forgot" indicates the Contractor missed this work during the planned sequence and had to remobilize a crew to perform it out of order. This requires re-excavation, trenching, and likely traffic control that was not in the original sequence. The remobilization effort and any disruption to other activities is contractor-caused.',
    classification: 'CONTRACTOR DELAY - Missed work requiring remobilization',
  },
  {
    id: 'E',
    title: 'Signal Head NCR and Rework',
    excerpt: 'Owner issued a non-conformance for the alignment of the signal heads at an intersection not lining up with what is shown in TCP. Subcontractor adjusted signal heads at no cost to the City. The cost is on the general contractor.',
    analysis: 'The subcontractor installed signal heads non-conforming to the traffic control plan, the owner issued an NCR, and the subcontractor had to rework the installation. Subcontractor rework is attributable to the general contractor.',
    classification: 'CONTRACTOR DELAY - Subcontractor NCR rework',
  },
  {
    id: 'F',
    title: 'Riser Rebuild Due to Dimensional Error',
    excerpt: 'Comment: Contractor having to rebuild this riser due to being 2" too high.',
    analysis: 'The riser was constructed outside of specified tolerances. The Contractor is responsible for verifying dimensions during construction. The time spent demolishing and rebuilding the riser is rework attributable to the Contractor.',
    classification: 'CONTRACTOR DELAY - Rework due to construction error',
  },
  {
    id: 'G',
    title: 'Signal Head Rework (Separate Incident)',
    excerpt: 'At 08:50 am subcontractor is installing an additional signal head on the wood pole for southbound traffic, this is to alleviate confusion due to one of the through motion signal heads being too close to the left turn signal head. Once complete, they will bag the one causing the confusion and move to shifting signal heads at another intersection.',
    analysis: 'The subcontractor is performing corrective work to fix a signal head placement issue that should have been done correctly the first time. The effort to add a new head, bag the problematic one, and then shift heads at another location represents multiple crew-hours of rework.',
    classification: 'CONTRACTOR DELAY - Subcontractor rework, should have been done right the first time',
  },
  {
    id: 'H',
    title: 'Temporary Asphalt Deficiency',
    excerpt: 'Temp asphalt appears to not provide positive protection for pedestrians.',
    analysis: 'Temporary pedestrian protection is the Contractor\'s responsibility. This deficiency will likely require additional temporary asphalt placement to achieve compliance, consuming crew time and materials that should have been applied correctly initially.',
    classification: 'CONTRACTOR DELAY - Deficient temp protection requiring rework',
  },
  {
    id: 'I',
    title: 'Resources Diverted to Non-Project Scope',
    excerpt: 'Comment: Not the project\'s scope but here is a photo from my site visit.',
    analysis: 'If the Contractor is directing labor, equipment, or supervision to work that is outside the contract scope, those resources are being diverted from contract work. The question to raise is: why are resources being directed to non-project work, and is this causing or contributing to delay on contract activities?',
    classification: 'CONTRACTOR DELAY (POTENTIAL) - Resource diversion to out-of-scope work',
  },
];

const WORKED_EXAMPLES_NOT_DELAYS: ReadonlyArray<WorkedExample> = [
  {
    id: 'J',
    title: 'Failed Compaction Test Due to Soil Conditions',
    excerpt: 'He can\'t get tests passing due to the heterogeneous material in this location. Seems firm and unyielding. No pumping is observed.',
    analysis: 'A compaction test on subgrade may not pass due to heterogeneous in-situ material since the proctor value used may not represent the characteristics of the soil at the exact test location. The inspector notes the ground is firm with no pumping. This is a soil condition issue, not a contractor error in compaction methods.',
    classification: 'NOT A CONTRACTOR DELAY - Existing soil condition',
  },
  {
    id: 'K',
    title: 'Differing Site Condition - Water Service Size Discrepancy',
    excerpt: 'DSC 294 - WS-1211 and WS-1210 Size Discrepancy: In the plans WS-1211 is labeled as a 3/4" service connection, in the field it was found to be a 4" cast iron service. In the plans WS-1210 is labeled as a 4" service connection, in the field it was found to be a 3/4" service.',
    analysis: 'This is a Differing Site Condition (DSC). The field conditions do not match the contract documents. Work performed under accepted DSCs is NOT a contractor-caused delay. Always cross-reference the accepted DSC list before classifying.',
    classification: 'NOT A CONTRACTOR DELAY - Accepted Differing Site Condition',
  },
  {
    id: 'L',
    title: 'Tree Roots Encountered During Excavation',
    excerpt: 'Comment: Immediately after removing curb from the roadway island, large roots were encountered. Contractor directed to utilize Vactor Truck tomorrow to remove dirt and find a path for the 2" water service, while minimizing tree root removal.',
    analysis: 'The Contractor has no control over roots existing at the location where the water service must pass. This is an existing site condition. The need to use specialized equipment (vactor truck) to navigate around roots is not a contractor efficiency failure.',
    classification: 'NOT A CONTRACTOR DELAY - Existing site condition beyond Contractor\'s control',
  },
  {
    id: 'M',
    title: 'Existing Electrical Conduits in Trench',
    excerpt: 'Comment: Civil Crew #5 removing additional pavement due to existing electrical conduits in the same trench as the water services and main. ESO on site during excavation.',
    analysis: 'This is an existing condition that the Contractor had no control over or contribution to. The presence of electrical conduits in the same trench as the planned water work was not shown in the contract documents. This is potentially a Differing Site Condition - check the accepted DSC list.',
    classification: 'NOT A CONTRACTOR DELAY - Existing condition, potentially a DSC',
  },
];

const WORKED_EXAMPLES_GRAY: ReadonlyArray<WorkedExample> = [
  {
    id: 'N',
    title: 'Damaged Water Service - DSC or Utility Strike?',
    excerpt: 'Comment: Flattened and broken 3/4" service. Water shut off by utility company at main and hole dewatered prior to this photo.',
    analysis: 'This needs verification. If the service was shown on the plans at its actual location and the Contractor struck it through careless excavation, it is a utility strike (contractor delay). If the service was not shown or was in an unexpected location, it may qualify as a Differing Site Condition. Flag as a potential contractor-caused delay pending DSC determination.',
    classification: 'FLAG FOR VERIFICATION - Cross-reference DSC list and plan documents',
  },
  {
    id: 'O',
    title: 'Irrigation Line Strike - DSC or Contractor Error?',
    excerpt: 'Badger truck boom struck a 1" irrigation line. Contractor will repair the line under appropriated bid item.',
    analysis: 'Similar to Example N. If the irrigation line was shown on plans and the Contractor struck it, this is a contractor-caused delay. If not shown on plans, it may be a DSC. The fact that the Contractor is repairing under a bid item suggests it may be covered, but the delay impact of the strike itself needs to be classified separately.',
    classification: 'FLAG FOR VERIFICATION - Verify if DSC or contractor-caused strike',
  },
  {
    id: 'P',
    title: 'Survey Challenges - Not Yet a Delay',
    excerpt: 'Trying to put stringlines on a slope with two breaks in the panels with only one survey point. Trying to get a survey point from behind a wall of removed ties.',
    analysis: 'This is not a good construction practice and may lead to non-compliant slope and elevation in the finished pavement. At this stage it is not a delay event. However, if the Contractor places the pavement with incorrect slope or elevation and this becomes an NCR, the corrective action requiring rework would then be a contractor-caused delay. Flag for monitoring.',
    classification: 'NOT YET A DELAY - Monitor for potential NCR and rework',
  },
  {
    id: 'Q',
    title: 'Double Handling of Spoil Material',
    excerpt: 'Loading spoil material and dumping it in another location just to load it up again for removal to off site.',
    analysis: 'Double handling can be a delay event if it was not planned in the baseline schedule. If the Contractor\'s original means and methods already included double handling at this location, then it is baked into the planned durations and is not an additional delay. If it was not planned and reflects an inefficiency, classify as contractor delay. Check baseline schedule activity assumptions.',
    classification: 'CONDITIONAL - Contractor delay only if not anticipated in baseline schedule',
  },
];

const GRAY_AREA_SCENARIOS: ReadonlyArray<GrayAreaScenario> = [
  {
    id: 1,
    title: 'Owner Event in One Zone, Contractor Idle in Other Zones',
    situation: 'Owner directed the Contractor to stop specific work in one zone due to a conflict. During the same period, the Contractor reduced or ceased activity in other operational areas even though those areas were accessible and unrestricted.',
    whyGray: 'The Contractor may argue the entire project was affected. However, the owner directive only suspended specific work within one zone and explicitly directed the Contractor to revise the work plan and resequence activities as necessary to maintain progress. The contract (Section 1-08.4) requires diligent prosecution of all available work.',
    howToClassify: 'The inactivity in the non-affected zones is a contractor-caused delay for concurrent delay analysis purposes. Document the available-but-idle work areas for each day during the suspension period. The delay in the directly affected activities may be owner-attributable, but the failure to prosecute work elsewhere is contractor-attributable.',
  },
  {
    id: 2,
    title: 'Utility Strike - Known vs. Unknown Utility',
    situation: 'Contractor strikes a utility during excavation. The daily report says "damage was noted to 6" concrete known storm drains from excavator bucket strike."',
    whyGray: 'If the utility was "known" (shown on plans, previously potholed, or identified through utility locates), the strike is contractor negligence. If the utility was "unknown" (not shown on plans, not in utility records), it may be a Differing Site Condition.',
    howToClassify: 'Always check: (1) Was the utility shown on the contract drawings? (2) Was it included in utility locate tickets? (3) Had it been previously potholed or exposed? If yes to any, classify as contractor delay. If no to all, flag for DSC evaluation. The word "known" in the inspector\'s report is a strong indicator of contractor responsibility.',
  },
  {
    id: 3,
    title: 'Slow Production vs. Delay',
    situation: 'Inspector notes that a crew placed 150 LF of curb over a full shift. The schedule assumes 300 LF/day production rate for this activity.',
    whyGray: 'Slow production alone is not necessarily a discrete "delay event" in the same way a utility strike or NCR is. However, sustained low productivity extends activity durations on the schedule and can consume available float.',
    howToClassify: 'Document the production rate observed vs. the scheduled rate. If the low production is sustained over multiple days and is not attributable to any owner-caused restriction, it supports a finding that the Contractor is not diligently prosecuting the Work per Section 1-08.4. Note it as a contractor efficiency issue for the concurrent delay record.',
  },
  {
    id: 4,
    title: 'Rework Caused by Design Change vs. Contractor Error',
    situation: 'Inspector reports that the Contractor is removing and rebuilding a section of work. The daily report does not state whether this is due to an NCR or a design revision.',
    whyGray: 'If the rework was directed by the owner due to a design change, it is an owner-caused event. If the rework is correcting defective work, it is contractor-caused. The daily report language alone may not be sufficient.',
    howToClassify: 'Cross-reference the NCR log and the change order / RFI log for the same date and location. If an NCR exists for that work, classify as contractor delay. If a design change or RFI response drove the rework, classify as owner delay. If neither record exists, flag for further investigation.',
  },
  {
    id: 5,
    title: 'Subcontractor Delay During Owner-Caused Suspension',
    situation: 'During a period when the owner has suspended work in one area, a subcontractor scheduled for a different, unaffected area fails to show up.',
    whyGray: 'The Contractor may try to attribute the subcontractor\'s absence to the owner suspension. However, if the subcontractor was scheduled for work in an area unaffected by the suspension, the no-show is a contractor/subcontractor management issue.',
    howToClassify: 'Classify the subcontractor no-show as contractor delay if the work area was accessible. The existence of an owner suspension in a different area does not excuse the Contractor from managing its subcontractors in unaffected areas.',
  },
];

const COMMON_PITFALLS: ReadonlyArray<string> = [
  'Do not assume weather = no contractor delay. If the weather did not prevent all work and the contractor chose not to work in available areas, the inactivity is contractor-caused.',
  'Do not ignore partial days. A crew that works 4 hours and leaves early has a partial-day contractor delay for the remaining hours (unless an owner event caused the early departure).',
  'Do not conflate "owner event in one zone" with "project-wide excuse." If the owner suspended work in one zone but other operational areas were fully accessible, the contractor\'s failure to work in those areas is a contractor-caused delay.',
  'Do not classify slow production as owner delay. If the contractor is working but at a pace significantly below what the schedule requires, that is a contractor efficiency issue unless an owner action directly caused the reduced productivity.',
  'Do not overlook submittal and procurement delays. If a material delivery is late because the contractor submitted late or submitted non-conforming documents, the resulting delay is contractor-caused.',
  'Watch for "voluntary shutdown." Section 1-08.4 prohibits the Contractor from voluntarily shutting down or slowing operations without Engineer approval.',
  'Do not assume utility strikes are always contractor delays. Check whether the utility was "known" (shown on plans) or "unknown" (potential DSC). The word "known" in the report is a strong indicator.',
  'Always cross-reference the DSC list. Work under accepted DSCs is not contractor-caused. Do not classify DSC-related work as contractor delay without checking.',
];

const GUIDING_PRINCIPLE = `The fundamental question is always: Was the Contractor doing everything within its power to diligently prosecute the Work on this day?

If the answer is no, and the reason is not an owner-caused event, force majeure, or declared unworkable day; then the period of inactivity or inefficiency is a contractor-caused delay and should be documented for the concurrent delay analysis.`;

const CHEAT_SHEET: CheatSheetSection = {
  isContractorDelay: [
    'Insufficient crews / late start / early quit',
    'No crew in available, unrestricted and scheduled work area',
    'Subcontractor no-show or supplier late delivery',
    'Rework from NCR / defective work / dimensional error requiring rework',
    'Utility strike on KNOWN/MARKED utility',
    'Equipment breakdown (contractor\'s equipment)',
    'Forgotten/missed work requiring remobilization',
    'Cold joint from late concrete delivery',
    'Resources diverted to out-of-scope work',
    'Work out of sequence vs. CPM schedule',
    'Temp protection deficiency requiring rework',
  ],
  isNotContractorDelay: [
    'Accepted Differing Site Conditions (DSCs)',
    'Unforeseen roots, unmarked utilities, soil conditions',
    'Failed compaction from heterogeneous in-situ material',
    'Owner-directed suspension (e.g., Field Memoranda)',
    'Design changes / late RFI responses by owner',
    'Engineer-declared Unworkable Days (weather)',
    'Third-party delays (utility co., permits) if Contractor initiated timely',
  ],
  flagForVerification: [
    'Utility strike - unknown if utility was on plans',
    'Rework - unclear if NCR or design change',
    'Double handling - check baseline schedule',
    'Bad practice not yet causing delay (monitor for NCR)',
  ],
  coreTest: 'Was the Contractor doing everything within its power to diligently prosecute the Work on this day? If NO (and not owner-caused) = Contractor Delay',
  keyQuestions: [
    'Was the delay within the Contractor\'s control?',
    'Could it have been avoided with due care?',
    'Was the utility "known" or "unknown"?',
    'Is there an accepted DSC for this location?',
    'Was rework from an NCR or a design change?',
    'Were other zones available but idle?',
  ],
};

const DOCUMENT_TYPE_SECTIONS: Record<ProjectDocumentType, ReadonlyArray<KnowledgeSection>> = {
  idr: [
    'delay_definition',
    'contract_basis',
    'categories',
    'exclusions',
    'decision_framework',
    'worked_examples_delays',
    'worked_examples_not_delays',
    'worked_examples_gray',
    'gray_areas',
    'common_pitfalls',
    'guiding_principle',
    'cheat_sheet',
  ],
  ncr: [
    'delay_definition',
    'categories',
    'exclusions',
    'decision_framework',
    'common_pitfalls',
    'guiding_principle',
    'cheat_sheet',
  ],
  field_memo: [
    'delay_definition',
    'contract_basis',
    'categories',
    'exclusions',
    'decision_framework',
    'gray_areas',
    'common_pitfalls',
    'guiding_principle',
    'cheat_sheet',
  ],
  other: [
    'delay_definition',
    'categories',
    'exclusions',
    'decision_framework',
    'common_pitfalls',
    'guiding_principle',
    'cheat_sheet',
  ],
  cpm_schedule: [
    'delay_definition',
    'cheat_sheet',
  ],
  contract_plan: [
    'delay_definition',
    'cheat_sheet',
  ],
  dsc_claim: [
    'delay_definition',
    'exclusions',
    'cheat_sheet',
  ],
};

export class ContractorDelayTrainingGuide implements IDelayKnowledgeBase {
  readonly contractBasis = CONTRACT_BASIS;
  readonly coreTest = CORE_TEST;
  readonly delayDefinition = DELAY_DEFINITION;
  readonly categories = CATEGORIES;
  readonly exclusions = EXCLUSIONS;
  readonly decisionFramework = DECISION_FRAMEWORK;
  readonly workedExamplesDelays = WORKED_EXAMPLES_DELAYS;
  readonly workedExamplesNotDelays = WORKED_EXAMPLES_NOT_DELAYS;
  readonly workedExamplesGray = WORKED_EXAMPLES_GRAY;
  readonly grayAreaScenarios = GRAY_AREA_SCENARIOS;
  readonly commonPitfalls = COMMON_PITFALLS;
  readonly guidingPrinciple = GUIDING_PRINCIPLE;
  readonly cheatSheet = CHEAT_SHEET;

  getSectionsForDocumentType(documentType: ProjectDocumentType): ReadonlyArray<KnowledgeSection> {
    return DOCUMENT_TYPE_SECTIONS[documentType] ?? DOCUMENT_TYPE_SECTIONS['other'];
  }
}
