import {
  assessmentFingerprint,
  editorialFingerprint,
  sourceDateAlias,
} from './identity.ts';
export {
  assessmentContentFingerprint,
  assessmentFingerprint,
  editorialContentFingerprint,
  editorialFingerprint,
  sourceDateAlias,
} from './identity.ts';

export interface StoryLinkManifest {
  storyFingerprint: string;
  storyContentFingerprint: string;
  assessmentFingerprint: string;
  assessmentContentFingerprint: string;
  preferred?: boolean;
}

export interface HistoricalEventManifest {
  id: string;
  aliases: readonly string[];
  selectedAssessmentFingerprint: string;
  selectedAssessmentContentFingerprint: string;
  assessmentContentFingerprints: readonly string[];
  selectionRationale: string;
  storyLinks: readonly StoryLinkManifest[];
}

type SourceRef = readonly [date: string, sourceUrl: string];
type AssessmentRef = readonly [cveId: string, score: number, fullTrifecta?: boolean, source?: SourceRef];
type StoryRef = readonly [cveId: string, headline: string, assessment: AssessmentRef];

function event(
  id: string,
  date: string,
  sourceUrl: string,
  selected: AssessmentRef,
  selectionRationale: string,
  stories: readonly StoryRef[] = [],
  additionalSources: readonly SourceRef[] = [],
): HistoricalEventManifest {
  const fingerprint = (reference: AssessmentRef) =>
    assessmentFingerprint(reference[0], reference[3]?.[0] ?? date, reference[3]?.[1] ?? sourceUrl, reference[1], reference[2] ?? false);
  const sources: SourceRef[] = [[date, sourceUrl], ...additionalSources];
  for (const reference of [selected, ...stories.map((story) => story[2])]) {
    if (reference[3]) sources.push(reference[3]);
  }
  return Object.freeze({
    id,
    aliases: Object.freeze([...new Set(sources.map(([sourceDate, url]) => sourceDateAlias(sourceDate, url)))]),
    selectedAssessmentFingerprint: fingerprint(selected),
    selectedAssessmentContentFingerprint: '',
    assessmentContentFingerprints: Object.freeze([]),
    selectionRationale,
    storyLinks: Object.freeze(
      stories.map(([cveId, headline, assessment]) => ({
        storyFingerprint: editorialFingerprint(cveId, headline),
        storyContentFingerprint: '',
        assessmentFingerprint: fingerprint(assessment),
        assessmentContentFingerprint: '',
      })),
    ),
  });
}

const SINGLE = 'The source snapshot contains one assessment for this event; that authored version is authoritative.';

const BASE_HISTORICAL_MANIFEST: readonly HistoricalEventManifest[] = Object.freeze([
  event('2026-04-07-project-glasswing', '2026-04-07', 'https://www.anthropic.com/glasswing', ['SKYNET-2026-0016', 4], 'Two assessments cover the same source event. The selected version contributes five weighted points rather than six, preserving the conservative reviewed choice; both versions remain visible.', [
    ['SKYNET-2026-0016', 'Anthropic Put an Exploit-Hunter Behind a Velvet Rope', ['SKYNET-2026-0016', 4]],
    ['SKYNET-2026-0021', 'The Defensive Preview Already Knows the Offensive Playbook', ['SKYNET-2026-0021', 5]],
  ]),
  event('2026-04-08-turbotax-claude', '2026-04-08', 'https://blog.turbotax.intuit.com/tax-help/turbotax-on-claude-chatgpt-for-ai-tax-help-144205/', ['SKYNET-2026-0026', 1], 'Two assessments cover the same connector launch. The selected version contributes one weighted point rather than three, preserving the conservative reviewed choice; both versions remain visible.', [
    ['SKYNET-2026-0017', 'Claude Now Has a Tax Desk', ['SKYNET-2026-0017', 2]],
  ]),
  event('2026-04-08-safetensors-foundation', '2026-04-08', 'https://pytorch.org/blog/pytorch-foundation-announces-safetensors-as-newest-contributed-project-to-secure-ai-model-execution/', ['SKYNET-2026-0015', 0], SINGLE, [
    ['SKYNET-2026-0015', 'PyTorch Gave Safer Model Loading a Proper Home', ['SKYNET-2026-0015', 0]],
  ]),
  event('2026-04-09-openai-advertising', '2026-04-09', 'https://www.axios.com/2026/04/09/openai-100-billion-in-ad-revenue', ['SKYNET-2026-0012', 0], SINGLE, [
    ['SKYNET-2026-0012', 'OpenAI Pitched a $100 Billion Ad Machine', ['SKYNET-2026-0012', 0]],
  ]),
  event('2026-04-09-meta-coreweave', '2026-04-09', 'http://thenextweb.com/news/meta-coreweave-21-billion-ai-cloud-deal', ['SKYNET-2026-0013', 0], SINGLE, [
    ['SKYNET-2026-0013', 'Meta Reserved Another $21 Billion of Inference Capacity', ['SKYNET-2026-0013', 0]],
  ]),
  event('2026-04-09-florida-ai-investigation', '2026-04-09', 'https://www.cbsnews.com/miami/news/florida-investigates-openai-ai-risks-minors-safeguards/', ['SKYNET-2026-0011', 0], SINGLE),
  event('2026-04-11-amazon-ai-capex', '2026-04-11', 'https://www.aboutamazon.com/news/company-news/amazon-ceo-andy-jassy-2025-letter-to-shareholders', ['SKYNET-2026-0014', 0], SINGLE, [
    ['SKYNET-2026-0014', 'Amazon Put a $200 Billion Price Tag on AI Capacity', ['SKYNET-2026-0014', 0]],
  ]),
  event('2026-04-11-code-review-backlog', '2026-04-11', 'https://futurism.com/artificial-intelligence/ai-code-tearing-through-corporations', ['SKYNET-2026-0018', 3], 'The two assessments tie at three weighted points. The first authored assessment remains the reviewed selection; the later reassessment and both editorial versions remain visible.', [
    ['SKYNET-2026-0018', 'The Merge Queue Is Losing to the Autocomplete', ['SKYNET-2026-0018', 3]],
    ['SKYNET-2026-0012', 'A Million Lines Waiting for a Human', ['SKYNET-2026-0012', 3]],
  ]),
  event('2026-04-13-meta-ceo-agent', '2026-04-13', 'https://www.theguardian.com/technology/2026/apr/13/meta-ai-mark-zuckerberg-staff-talk-to-the-boss', ['SKYNET-2026-0025', 1], 'Two assessments cover the same reported product. The selected version contributes one weighted point rather than two, preserving the conservative reviewed choice; both versions remain visible.', [
    ['SKYNET-2026-0019', 'Meta Wants a CEO You Can Prompt', ['SKYNET-2026-0019', 2]],
  ]),
  event('2026-04-13-humanoid-half-marathon', '2026-04-13', 'https://www.euronews.com/next/2026/04/13/more-than-70-robot-teams-gear-up-for-chinas-second-humanoid-half-marathon', ['SKYNET-2026-0020', 3], SINGLE, [
    ['SKYNET-2026-0020', 'The Robot Half-Marathon Learned to Steer Itself', ['SKYNET-2026-0020', 3]],
  ]),
  event('2026-04-13-meta-smart-glasses', '2026-04-13', 'https://www.wired.com/story/meta-ray-ban-oakley-smart-glasses-no-face-recognition-civil-society/', ['SKYNET-2026-0010', 2], SINGLE, [
    ['SKYNET-2026-0010', 'Meta’s Glasses Wanted to Know Who You Are', ['SKYNET-2026-0010', 2]],
  ]),
  event('2026-04-14-openai-cyber-access', '2026-04-14', 'https://openai.com/index/scaling-trusted-access-for-cyber-defense/', ['SKYNET-2026-0022', 2], SINGLE, [
    ['SKYNET-2026-0022', 'OpenAI’s Cyber Guest List Just Got Much Longer', ['SKYNET-2026-0022', 2]],
  ]),
  event('2026-04-14-illinois-ai-liability', '2026-04-14', 'https://www.wired.com/story/anthropic-opposes-the-extreme-ai-liability-bill-that-openai-backed/', ['SKYNET-2026-0023', 2], SINGLE, [
    ['SKYNET-2026-0023', 'The Liability Shield Arrived Before the Damage Did', ['SKYNET-2026-0023', 2]],
  ]),
  event('2026-04-14-ukraine-unmanned-assault', '2026-04-14', 'https://thedebrief.org/ukraine-says-it-captured-a-russian-position-using-only-unmanned-systems-a-glimpse-of-future-warfare/', ['SKYNET-2026-0024', 3], SINGLE, [
    ['SKYNET-2026-0024', 'The Assault Team Was Mostly Batteries', ['SKYNET-2026-0024', 3]],
  ]),
  event('2026-04-14-medical-chatbot-audit', '2026-04-14', 'https://www.eurekalert.org/news-releases/1123655', ['SKYNET-2026-0013', 3], SINGLE, [
    ['SKYNET-2026-0013', 'The Bedside Manner Worked Better Than the Medicine', ['SKYNET-2026-0013', 3]],
  ]),
  event('2026-04-21-firefox-mythos-audit', '2026-04-21', 'https://blog.mozilla.org/en/privacy-security/ai-security-zero-day-vulnerabilities/', ['SKYNET-2026-0014', 1], SINGLE),
  event('2026-04-21-meta-employee-capture', '2026-04-21', 'https://fortune.com/2026/04/21/meta-will-start-tracking-employees-screens-and-keystrokes-to-train-ai/', ['SKYNET-2026-0015', 2], SINGLE, [
    ['SKYNET-2026-0015', 'Meta Wants Your Workday in the Training Set', ['SKYNET-2026-0015', 2]],
  ]),
  event('2026-04-21-florida-openai-criminal-probe', '2026-04-21', 'https://www.cbsnews.com/news/florida-criminal-investigation-openai-chatgpt-alleged-role-fsu-shooting/', ['SKYNET-2026-0016', 3], SINGLE, [
    ['SKYNET-2026-0016', 'Florida Put the Shooting Chat Logs Under Criminal Review', ['SKYNET-2026-0016', 3]],
  ]),
  event('2026-04-22-bixonimania', '2026-04-22', 'https://www.independent.co.uk/news/science/bixonimania-fake-eye-disease-ai-chatgpt-b2962538.html', ['SKYNET-2026-0017', 3], SINGLE, [
    ['SKYNET-2026-0017', 'The Chatbots Diagnosed a Disease That Never Existed', ['SKYNET-2026-0017', 3]],
  ]),
  event('2026-04-23-mythos-access-bypass', '2026-04-23', 'https://fortune.com/2026/04/23/anthropic-mythos-leak-dario-amodei-ceo-cybersecurity-hackers-exploits-ai/', ['SKYNET-2026-0018', 4], SINGLE, [
    ['SKYNET-2026-0018', 'Mythos Was Restricted Until Someone Guessed the Door', ['SKYNET-2026-0018', 4]],
  ]),
  event('2026-04-23-ai-layoffs', '2026-04-23', 'https://www.theguardian.com/technology/2026/apr/23/meta-microsoft-tech-ai-layoffs', ['SKYNET-2026-0015', 1], SINGLE),
  event('2026-04-25-openai-police-referral', '2026-04-25', 'https://www.theguardian.com/us-news/2026/apr/25/altman-apologizes-after-openai-failed-to-alert-police-before-fatal-canada-shooting', ['SKYNET-2026-0019', 3], SINGLE, [
    ['SKYNET-2026-0019', 'OpenAI Had the Flag. Not the Phone Call.', ['SKYNET-2026-0019', 3]],
  ]),
  event('2026-04-27-pocketos-data-deletion', '2026-04-27', 'https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-powered-ai-coding-agent-deletes-entire-company-database-in-9-seconds-backups-zapped-after-cursor-tool-powered-by-anthropics-claude-goes-rogue', ['SKYNET-2026-0020', 6], SINGLE, [
    ['SKYNET-2026-0020', 'The Staging Agent Found Prod and Deleted the Lifeboats', ['SKYNET-2026-0020', 6]],
  ]),
  event('2026-04-28-google-pentagon', '2026-04-28', 'https://thenextweb.com/news/google-pentagon-classified-ai-deal', ['SKYNET-2026-0021', 2], SINGLE, [
    ['SKYNET-2026-0021', 'Google Signed the Classified Clause Employees Tried to Stop', ['SKYNET-2026-0021', 2]],
  ]),
  event('2026-09-10-anthropic-misuse-report', '2026-09-10', 'https://www.anthropic.com/threat-intelligence-report-september-2026', ['SKYNET-2026-0022', 7], SINGLE, [
    ['SKYNET-2026-0022', 'Claude Hit Seven Abuse Categories in One Threat Report', ['SKYNET-2026-0022', 7]],
  ]),
  event('2026-09-11-anthropic-safety-resignation', '2026-09-11', 'https://www.scientificamerican.com/article/ai-jacob-coxon-quit-extinction-fears-security-experts-see-familiar-fight/', ['SKYNET-2026-0010', 2], SINGLE, [
    ['SKYNET-2026-0010', 'When the Alignment Lead Starts Agreeing With the Whistleblower', ['SKYNET-2026-0010', 2]],
  ]),
  event('2026-09-12-amodei-slowdown-warning', '2026-09-12', 'https://apnews.com/article/anthropic-ai-dario-amodei-d59552edcb27892d8ee4d98a48397706', ['SKYNET-2026-0015', 1], SINGLE),
  event('2026-09-16-openai-misalignment-reports', '2026-09-16', 'https://openai.com/index/model-misalignment-reporting-framework/', ['SKYNET-2026-0015', 6, true], SINGLE, [
    ['SKYNET-2026-0015', 'The Models Found the Repo, the Key, and the Internet', ['SKYNET-2026-0015', 6, true]],
  ]),
  event('2026-09-18-claude-r-and-d', '2026-09-18', 'https://apnews.com/article/anthropic-claude-ai-model-self-improvement-4d3a7430f57cbc7c39e1c5f2b7d7e132', ['SKYNET-2026-0015', 3], SINGLE, [
    ['SKYNET-2026-0015', 'Claude Started Helping Build the Next Claude', ['SKYNET-2026-0015', 3]],
  ]),
  event('2026-09-21-gemini-company-breach', '2026-09-21', 'https://www.securityweek.com/google-confirms-gemini-ai-breached-three-firms/', ['SKYNET-2026-0012', 5, true], 'Both assessments cover the same evaluation and tie at nine weighted points. The original selection remains authoritative; both reports and assessment versions are retained.', [
    ['SKYNET-2026-0012', 'The Eval Touched Real Targets. Then Kept Going.', ['SKYNET-2026-0012', 5, true]],
    ['SKYNET-2026-0018', 'The Cyber Eval Wandered Into Three Actual Companies', ['SKYNET-2026-0018', 5, true]],
  ]),
  event('2026-09-22-frontier-ai-control-call', '2026-09-22', 'https://www.government.nl/documents/2026/09/22/a-call-for-control-of-frontier-ai-models', ['SKYNET-2026-0013', 0], 'Both assessments describe the same joint statement and score zero. The original selection remains authoritative.'),
  event('2026-09-23-superintelligence-ban', '2026-09-23', 'https://rollcall.com/2026/09/23/ai-superintelligence-ban-proposed-by-casar-sanders/', ['SKYNET-2026-0015', 0], 'Both assessments describe the same legislative proposal and score zero. The original selection remains authoritative.'),
  event('2026-09-24-openai-medicare-agent', '2026-09-24', 'https://www.abc.net.au/news/2026-09-24/what-we-know-about-the-openai-medicare-hack/107189452', ['SKYNET-2026-0011', 5, true], 'Three assessments and reports cover the same June Medicare portal access. The original nine-point assessment remains selected, tying the second ABC assessment and conservatively preceding the ten-point BBC assessment. Different publication dates and URLs do not create additional incidents.', [
    ['SKYNET-2026-0011', "The Public Portal Wasn't Where the Agent Stopped", ['SKYNET-2026-0011', 5, true]],
    ['SKYNET-2026-0016', "The Agent Didn't Stop at the Public Files", ['SKYNET-2026-0016', 5, true, ['2026-09-24', 'https://www.abc.net.au/news/2026/09/24/ai-agent-accessed-australian-government-site-pm-says/107189078']]],
    ['SKYNET-2026-0024', 'The Research Agent Found the Staff-Only Door', ['SKYNET-2026-0024', 6, true, ['2026-09-23', 'https://www.bbc.co.uk/news/articles/c6vgy0333dppo']]],
  ]),
  event('2026-09-24-safa-private-standards', '2026-09-24', 'https://www.theinformation.com/articles/google-openai-anthropic-ai-safety-group-takes-shape?offer=rtsu-engagement-25%2Crtsu-featured-articles-pro', ['SKYNET-2026-0014', 1], 'The same private-standards announcement appears with and without an offer query parameter. Both assessments score one point; the original selection remains authoritative.', [], [
    ['2026-09-24', 'https://www.theinformation.com/articles/google-openai-anthropic-ai-safety-group-takes-shape/'],
  ]),
  event('2026-09-25-openai-dns-sandbox', '2026-09-25', 'https://alignment.openai.com/misalignment-reports/an-agent-used-dns-to-reach-an-external-chatbot/', ['SKYNET-2026-0017', 3], 'Two assessments cover the same DNS containment failure. The selected assessment assigns no governance amplifier because monitoring, intervention and disclosure are documented, contributing four weighted points rather than five. Both assessments and their corresponding reports remain visible.', [
    ['SKYNET-2026-0010', 'The Model Found the DNS Side Door', ['SKYNET-2026-0010', 4]],
    ['SKYNET-2026-0017', 'The Sandbox Blocked the Web. DNS Had Other Ideas.', ['SKYNET-2026-0017', 3]],
  ]),
  event('2026-09-25-anthropic-pentagon-ruling', '2026-09-25', 'https://media.cadc.uscourts.gov/opinions/docs/2026/09/26-1049-2194984.pdf', ['SKYNET-2026-0020', 3], SINGLE, [
    ['SKYNET-2026-0020', 'The Pentagon Wanted Fewer Guardrails. The Court Agreed.', ['SKYNET-2026-0020', 3]],
  ]),
  event('2026-09-25-openai-replicating-injections', '2026-09-25', 'https://alignment.openai.com/misalignment-reports/self-replicating-prompt-injections-exist/', ['SKYNET-2026-0026', 1], SINGLE),
  event('2026-09-25-cms-wiser-pilot', '2026-09-25', 'https://arstechnica.com/health/2026/09/trump-admin-using-ai-to-deny-medical-care-for-seniors-in-disastrous-experiment/', ['SKYNET-2026-0027', 4], SINGLE, [
    ['SKYNET-2026-0027', 'Medicare’s Queue Now Has a Partial Autopilot', ['SKYNET-2026-0027', 4]],
  ]),
  event('2026-09-26-frontier-incident-review', '2026-09-26', 'https://www.axios.com/2026/09/26/openai-anthropic-thousands-ai-security-incidents', ['SKYNET-2026-0019', 4], 'This assessment concerns the reported aggregate pattern of incidents, not a separate record for each underlying case. Its supplied criterion ratings are retained. The source does not identify the full incident set, so overlap with individually recorded cases remains uncertain.', [
    ['SKYNET-2026-0019', 'The Incident Count Has Gained Its Own Comma', ['SKYNET-2026-0019', 4]],
  ]),
  event('2026-09-28-aisi-astra-simulation', '2026-09-28', 'https://www.aisi.gov.uk/blog/gpt-6-astra-performs-unsanctioned-supply-chain-attacks-in-simulations', ['SKYNET-2026-0025', 2], SINGLE, [
    ['SKYNET-2026-0025', 'The Simulator Asked for Restraint. Astra Submitted Malicious Code.', ['SKYNET-2026-0025', 2]],
  ]),
]);

interface ContentAudit {
  assessments: readonly string[];
  selected?: string;
  editorials?: Readonly<Record<string, string>>;
  storyAssessments?: Readonly<Record<string, string>>;
}

const AUDITED_CONTENT: Readonly<Record<string, ContentAudit>> = Object.freeze({
  '2026-04-07-project-glasswing': { assessments: ['56729d9cd2c81ed0', 'c6a27ce65413d382'], selected: '56729d9cd2c81ed0', editorials: { '9a7dd63e5700ec82': 'b8208870cf392a2c', 'b68eaedce74b5230': '1c70b2c3f251cbd7' }, storyAssessments: { '9a7dd63e5700ec82': 'c6a27ce65413d382' } },
  '2026-04-08-safetensors-foundation': { assessments: ['f7f65d9f694915fb'], editorials: { '1567ab5c407cb808': '37da54e64a3e283a' } },
  '2026-04-08-turbotax-claude': { assessments: ['519f4789b21d0545', '58a26011d430661d'], selected: '58a26011d430661d', editorials: { '433eaa9199fc6a35': '952ae89fd5ed914b' }, storyAssessments: { '433eaa9199fc6a35': '519f4789b21d0545' } },
  '2026-04-09-florida-ai-investigation': { assessments: ['8256be89b7ac87a5'] },
  '2026-04-09-meta-coreweave': { assessments: ['bcd73c318573eca5'], editorials: { '9414b442bfff78ae': '2279a4fe9d136e4a' } },
  '2026-04-09-openai-advertising': { assessments: ['1aa57e599fd9c47d'], editorials: { 'aceee875b45b2e19': '257c02a5e7310d91' } },
  '2026-04-11-amazon-ai-capex': { assessments: ['9b24af84494f63b8'], editorials: { '41212910d742b68c': '4fd724cef1c51972' } },
  '2026-04-11-code-review-backlog': { assessments: ['0e31ffc1de921015', '46c20bd42d15fd48'], selected: '46c20bd42d15fd48', editorials: { '2fe3a7d1e7ebc60d': 'a4e65bab6952dc8f', '3f3162d9b63fa8ad': '875fa70e3c2ff87a' }, storyAssessments: { '3f3162d9b63fa8ad': '0e31ffc1de921015' } },
  '2026-04-13-humanoid-half-marathon': { assessments: ['e75e1d70f9fcce5c'], editorials: { '30b7b1e78c884b2b': '86b3b3607145400c' } },
  '2026-04-13-meta-ceo-agent': { assessments: ['a45984635f31a567', 'a0b0a14d7f84ef99'], selected: 'a0b0a14d7f84ef99', editorials: { 'e495de776ab4877b': 'b209dd34a6809cb0' }, storyAssessments: { 'e495de776ab4877b': 'a45984635f31a567' } },
  '2026-04-13-meta-smart-glasses': { assessments: ['2a4b22b1eb39c32d'], editorials: { '4f3806f8702e237c': '678070c3de67c5c7' } },
  '2026-04-14-illinois-ai-liability': { assessments: ['b8c7ac97cfb37583'], editorials: { 'f4472f359f806e41': '8f56c4be8f09563a' } },
  '2026-04-14-medical-chatbot-audit': { assessments: ['0c6423099b4b34cd'], editorials: { '81cc034255e4b42e': '83afb2f202d402ee' } },
  '2026-04-14-openai-cyber-access': { assessments: ['d44854b1ecf11015'], editorials: { 'bc00531df0572061': 'bef5db3b801f6117' } },
  '2026-04-14-ukraine-unmanned-assault': { assessments: ['5c0c4e017aa7bcf5'], editorials: { 'bb2a4eb7f4112f6b': '4258abf8bfe698e4' } },
  '2026-04-21-firefox-mythos-audit': { assessments: ['eda2cc52cfa10a2e'] },
  '2026-04-21-florida-openai-criminal-probe': { assessments: ['f8ec7dcaca11a05e'], editorials: { '81c0386d366972d1': '1f356b9dfeace7d9' } },
  '2026-04-21-meta-employee-capture': { assessments: ['d1934552e801990e'], editorials: { 'd4ad8a246459cc60': 'c97372c018a7080c' } },
  '2026-04-22-bixonimania': { assessments: ['626107aa9611b18e'], editorials: { '2c7bd4f981b65f35': '175e62335d9a571f' } },
  '2026-04-23-ai-layoffs': { assessments: ['eab9ecea7409dd86'] },
  '2026-04-23-mythos-access-bypass': { assessments: ['d3d71d7d2817dd39'], editorials: { 'ed2bc5b4dbe120a8': 'ad4923868d7a2c9a' } },
  '2026-04-25-openai-police-referral': { assessments: ['3625aef190fce8cd'], editorials: { '13992d96ab3a6522': '370fdb7945f0072d' } },
  '2026-04-27-pocketos-data-deletion': { assessments: ['2a4c05b818b5edec'], editorials: { '68073be801dc1f4c': '2a7252c2d58141be' } },
  '2026-04-28-google-pentagon': { assessments: ['27e352bcedaee090'], editorials: { 'b0371ab567a45951': '27d664c115d18aed' } },
  '2026-09-10-anthropic-misuse-report': { assessments: ['dcc81459b3af5815'], editorials: { '4dde3f119b6fef75': '18a6a3c325abdd57' } },
  '2026-09-11-anthropic-safety-resignation': { assessments: ['e819d3e8dbeb8aec'], editorials: { '4138ece803083e84': 'a3b499755a629621' } },
  '2026-09-12-amodei-slowdown-warning': { assessments: ['77808e7461f03f70'] },
  '2026-09-16-openai-misalignment-reports': { assessments: ['61dda5e0ba3593d4'], editorials: { 'ae97f829d1fae58d': '88183e7561bdd361' } },
  '2026-09-18-claude-r-and-d': { assessments: ['cb0877df6f9c9683'], editorials: { 'd23e8fae846a9172': '0a75f38c3eb5e310' } },
  '2026-09-21-gemini-company-breach': { assessments: ['1683c6093c334865', '1af8bd72f4182256'], selected: '1683c6093c334865', editorials: { '7c918e0764f931a3': '82d6755e18b5f702', 'fe492f827e3c6e26': '261ffefdaa01b059' }, storyAssessments: { 'fe492f827e3c6e26': '1af8bd72f4182256' } },
  '2026-09-22-frontier-ai-control-call': { assessments: ['275c1564e2ffda90', '8c4f9051418fc855'], selected: '275c1564e2ffda90' },
  '2026-09-23-superintelligence-ban': { assessments: ['30746824f6bf0900', 'c7d9c1e2b5b790a6'], selected: '30746824f6bf0900' },
  '2026-09-24-openai-medicare-agent': { assessments: ['c3d8e35ff0a013c3', 'ff494b0c83c70208', '5aaec9868dba8122'], selected: 'c3d8e35ff0a013c3', editorials: { '4fdb8022e81463de': 'f55f15ccb1453648', '1fbcbccf19f79a8b': '2921af6f136fdd0b', '79a357ad45acf391': 'fe9fdaf8256a1a64' }, storyAssessments: { '1fbcbccf19f79a8b': 'ff494b0c83c70208', '79a357ad45acf391': '5aaec9868dba8122' } },
  '2026-09-24-safa-private-standards': { assessments: ['8fad2cb44d8b0048', 'f1caf8d00eed1e7c'], selected: '8fad2cb44d8b0048' },
  '2026-09-25-openai-dns-sandbox': { assessments: ['7ddd4bcd705d9141', '466ff655b3761b39'], selected: '466ff655b3761b39', editorials: { 'e04cc41a4f49b466': 'be9dd520b2328d6c', 'cfe77a2d1e3809a9': 'b479fd0256e3df76' }, storyAssessments: { 'e04cc41a4f49b466': '7ddd4bcd705d9141' } },
  '2026-09-25-anthropic-pentagon-ruling': { assessments: ['5d15a43530d86401'], editorials: { '085f3c01a0063205': 'e6625ce91c61681d' } },
  '2026-09-25-openai-replicating-injections': { assessments: ['3ccfb727a905b7ab'] },
  '2026-09-25-cms-wiser-pilot': { assessments: ['4818c04c54e06e10'], editorials: { 'c350d02f48b297db': 'bf38afa1dfd1b865' } },
  '2026-09-26-frontier-incident-review': { assessments: ['68dcb6d70dbbca33'], editorials: { '10a756b57920c319': 'd5dca62e01da26ca' } },
  '2026-09-28-aisi-astra-simulation': { assessments: ['c90336d5e367cf59'], editorials: { '3e87df78359cbb4c': '91f7b91ebbae284a' } },
});

export const HISTORICAL_MANIFEST: readonly HistoricalEventManifest[] = Object.freeze(
  BASE_HISTORICAL_MANIFEST.map((entry) => {
    const audit = AUDITED_CONTENT[entry.id];
    if (!audit) throw new Error(`Historical manifest ${entry.id} has no content audit`);
    const selectedAssessmentContentFingerprint = audit.selected ?? (
      audit.assessments.length === 1 ? audit.assessments[0] : undefined
    );
    if (!selectedAssessmentContentFingerprint) {
      throw new Error(`Historical manifest ${entry.id} has no selected assessment content audit`);
    }
    return Object.freeze({
      ...entry,
      selectedAssessmentContentFingerprint,
      assessmentContentFingerprints: Object.freeze([...audit.assessments]),
      storyLinks: Object.freeze(entry.storyLinks.map((link) => {
        const storyContentFingerprint = audit.editorials?.[link.storyFingerprint];
        if (!storyContentFingerprint) {
          throw new Error(`Historical story ${link.storyFingerprint} has no content audit`);
        }
        const assessmentContent = audit.storyAssessments?.[link.storyFingerprint]
          ?? (link.assessmentFingerprint === entry.selectedAssessmentFingerprint
            ? selectedAssessmentContentFingerprint
            : undefined);
        if (!assessmentContent) {
          throw new Error(`Historical story ${link.storyFingerprint} has no assessment content audit`);
        }
        return Object.freeze({
          ...link,
          storyContentFingerprint,
          assessmentContentFingerprint: assessmentContent,
        });
      })),
    });
  }),
);
