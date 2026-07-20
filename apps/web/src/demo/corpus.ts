/**
 * The demo corpus.
 *
 * Fourteen ENTIRELY FICTIONAL judgments in the `ZA` region profile — South
 * Africa is Molao's reference profile, not its subject. The parties, the judges,
 * the facts and every word of the reasoning are invented. The neutral and
 * reported citation *formats* are real because the point of the demo is to show
 * the citation machinery working; the judgments themselves are not, and none of
 * this text is taken from any real judgment.
 *
 * They form one connected line of authority (constitutional damages for
 * unlawful arrest, running into eviction and administrative review) so that
 * "cited by" and the citation graph have something real to chew on. Citations
 * appear inside the paragraph text and are extracted at load time by
 * `./extract`, exactly as the node's pinned extractor does — so what you see in
 * the demo is derived, not hand-authored.
 */

export interface DemoParagraph {
  number: string | null;
  text: string;
}

export interface DemoCase {
  id: string;
  neutral: string;
  /**
   * Region profile. The demo corpus is entirely `ZA` because South Africa is
   * the reference profile — but it is a field, not an assumption, and the UI
   * reads it rather than knowing it.
   */
  region: string;
  court: string;
  title: string;
  caseNumbers: string[];
  date: string;
  judges: string[];
  reported: string[];
  provenance: 'corroborated' | 'single' | 'manual';
  paragraphs: DemoParagraph[];
}

const p = (number: string | null, text: string): DemoParagraph => ({ number, text });

export const CORPUS: DemoCase[] = [
  {
    id: '71f3ec2778f70f69f9616414e52bf8ed1699b4470823a354247d041c576c6b17',
    neutral: '[2011] ZACC 14',
    region: 'ZA',
    court: 'ZACC',
    title: 'Rametsi v Minister of Safety and Security',
    caseNumbers: ['CCT 41/10'],
    date: '2011-05-19',
    judges: ['Rametsi J', 'Ngcobo CJ', 'Moseneke DCJ', 'Cameron J', 'Khampepe J'],
    reported: ['2011 (5) SA 401 (CC)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'RAMETSI J (Ngcobo CJ, Moseneke DCJ, Cameron J and Khampepe J concurring):'),
      p(
        '1',
        'The applicant was arrested without a warrant at his place of work, held for two nights in a police cell, and released without ever appearing before a court. No charge was put to him. The question before this Court is what the Constitution requires by way of remedy when the State deprives a person of liberty for no lawful reason at all.',
      ),
      p(
        '2',
        'The Minister does not defend the arrest. It is conceded to have been unlawful. The dispute is narrower and more difficult: whether the delictual action for wrongful arrest exhausts the applicant’s remedies, or whether section 38 of the Constitution permits an award of constitutional damages over and above the common-law award.',
      ),
      p(
        '3',
        'It is well established that a court will not develop a constitutional remedy where an existing remedy is adequate. Adequacy, however, is not measured only by the money that changes hands. A remedy is adequate when it vindicates the right that was infringed, and vindication has an objective dimension that is not reducible to the plaintiff’s loss.',
      ),
      p(
        '4',
        'The distinction matters most where the infringement is systemic. Where a police station arrests without warrant as a matter of routine, each individual award may be modest and the practice may nonetheless continue undisturbed. In such a case the common-law award does not vindicate the right; it prices it.',
      ),
      p(
        '5',
        'We therefore hold that constitutional damages may be awarded in addition to delictual damages where (a) the infringement is of a right in the Bill of Rights, (b) the existing remedy leaves the constitutional injury substantially unvindicated, and (c) the award is capable of serving a deterrent purpose that the existing remedy does not serve.',
      ),
      p(
        '6',
        'The award must remain proportionate. Constitutional damages are not punitive damages under another name, and courts must resist the temptation to use the public purse as an instrument of censure. The enquiry is what vindication requires, not what the conduct deserves.',
      ),
      p(
        '7',
        'On the facts, the applicant was detained for thirty-eight hours without any attempt to justify the detention, and the station in question had been the subject of two prior adverse findings. An award of R150 000 in constitutional damages, in addition to the delictual award, is appropriate.',
      ),
      p('8', 'The appeal is upheld with costs, including the costs of two counsel.'),
    ],
  },
  {
    id: '73bed98908337df8a806c9623992dee9e9a68abc01d3df81dbabcc092bd1ac0e',
    neutral: '[2013] ZASCA 88',
    region: 'ZA',
    court: 'ZASCA',
    title: 'Ndlovu v Sekhukhune Local Municipality',
    caseNumbers: ['552/12'],
    date: '2013-05-31',
    judges: ['Ndlovu JA', 'Brand JA', 'Majiedt JA'],
    reported: ['2014 (1) SA 55 (SCA)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'NDLOVU JA (Brand JA and Majiedt JA concurring):'),
      p(
        '1',
        'This appeal concerns whether a municipality that disconnects a household’s water supply without notice commits an infringement for which constitutional damages may be claimed, or whether the ratepayer is confined to the statutory review.',
      ),
      p(
        '2',
        'The Constitutional Court in Rametsi v Minister of Safety and Security [2011] ZACC 14 at para 5 laid down three requirements for an award of this kind. The second of them — that the existing remedy leaves the constitutional injury substantially unvindicated — is where this case turns.',
      ),
      p(
        '3',
        'A review that restores the water supply six months after the disconnection is not, on any view, a complete answer to six months without water. But it is an answer to part of it, and the court below erred in treating the availability of review as if it were nothing.',
      ),
      p(
        '4',
        'The correct approach is to ask what remains unvindicated after the existing remedy has done its work, and to fashion an award directed at that residue and no more. This is a narrower enquiry than the one the appellant urged upon us.',
      ),
      p(
        '5',
        'Applying that approach, the residue here is the two months during which the household was without water and no review had yet been launched, the delay being attributable to the municipality’s failure to give reasons. An award of R40 000 meets it.',
      ),
      p('6', 'The appeal succeeds in part. Each party is to pay its own costs.'),
    ],
  },
  {
    id: 'afc426689a0ea5a498d1d66185e1b0df77ef0635060081563736dbcda06ca652',
    neutral: '[2015] ZAGPJHC 210',
    region: 'ZA',
    court: 'ZAGPJHC',
    title: 'Thekiso v City of Johannesburg Metropolitan Municipality',
    caseNumbers: ['2014/33871'],
    date: '2015-09-04',
    judges: ['Thekiso AJ'],
    reported: [],
    provenance: 'single',
    paragraphs: [
      p(null, 'THEKISO AJ:'),
      p(
        '1',
        'The applicants are eighty-one occupiers of a disused office building in the inner city. The City seeks their eviction. They resist it on the ground that no meaningful engagement preceded the application and that they will be rendered homeless.',
      ),
      p(
        '2',
        'The Prevention of Illegal Eviction from and Unlawful Occupation of Land Act 19 of 1998 requires a court to consider whether it is just and equitable to grant an eviction order, having regard to all the relevant circumstances. That enquiry is not a formality to be disposed of in a paragraph.',
      ),
      p(
        '3',
        'Counsel for the applicants relied on Rametsi v Minister of Safety and Security [2011] ZACC 14 for the proposition that a right unvindicated by the ordinary remedy calls for a constitutional one. The reliance is misplaced. Rametsi concerns remedy after infringement; the present case concerns whether an infringement is to be permitted at all.',
      ),
      p(
        '4',
        'Nor does Ndlovu v Sekhukhune Local Municipality [2013] ZASCA 88 at para 4 assist. The residue enquiry described there presupposes a completed infringement against which a residue can be measured.',
      ),
      p(
        '5',
        'That said, the City’s engagement was plainly inadequate. Two letters delivered to a building of eighty-one occupiers, neither of which invited a response, does not constitute engagement in any sense the authorities recognise.',
      ),
      p(
        '6',
        'The application is postponed sine die. The City is directed to engage meaningfully with the occupiers and to file a report within ninety days. Costs are reserved.',
      ),
    ],
  },
  {
    id: 'ac22d2d84add874d7d533d6aeaabb656afb20ce1c0648750396d0c0a227abd9b',
    neutral: '[2016] ZACC 31',
    region: 'ZA',
    court: 'ZACC',
    title: 'Mabaso v Minister of Police',
    caseNumbers: ['CCT 188/15'],
    date: '2016-10-13',
    judges: ['Mabaso J', 'Mogoeng CJ', 'Froneman J', 'Jafta J'],
    reported: ['2017 (2) SA 1 (CC)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'MABASO J (Mogoeng CJ, Froneman J and Jafta J concurring):'),
      p(
        '1',
        'Five years after Rametsi v Minister of Safety and Security [2011] ZACC 14 this Court is asked to say whether the requirements laid down there are cumulative, and whether the third of them — deterrence — can ever be satisfied by an award against the State.',
      ),
      p(
        '2',
        'The argument that awards against the State cannot deter, because the State does not feel them, has a certain force. Public money is not the arresting officer’s money. But the argument proves too much: it would exclude constitutional damages in precisely the class of case for which they were devised.',
      ),
      p(
        '3',
        'The answer lies in how deterrence is understood. An award deters not by causing pain to a department but by fixing a public and quantified account of what the conduct cost, which the department must then explain. Rametsi at para 4 recognised this when it spoke of the objective dimension of vindication.',
      ),
      p(
        '4',
        'We confirm that the three requirements are cumulative. A court that finds the existing remedy adequate need go no further, and should not.',
      ),
      p(
        '5',
        'The Supreme Court of Appeal’s residue enquiry in Ndlovu v Sekhukhune Local Municipality [2013] ZASCA 88 at para 4 is a helpful gloss on the second requirement and we endorse it. It disciplines an enquiry that otherwise risks becoming impressionistic.',
      ),
      p(
        '6',
        'The applicant was arrested at a roadblock on a warrant that had been withdrawn eleven months earlier, the withdrawal never having been captured on the system. He spent four days in custody. The systemic character of the failure is not in dispute; the Minister’s own affidavit describes it as affecting an unknown but substantial number of warrants.',
      ),
      p(
        '7',
        'That concession is significant. Where a department admits a systemic defect, the second requirement will ordinarily be met, because the delictual action addresses the individual instance and leaves the defect untouched.',
      ),
      p(
        '8',
        'An award of R250 000 in constitutional damages is confirmed, together with a declaratory order that the failure to maintain an accurate warrant register infringes section 12(1)(a) of the Constitution.',
      ),
      p('9', 'The order of the Supreme Court of Appeal is set aside and replaced.'),
    ],
  },
  {
    id: 'b736f4a58be0728865a4be54e99508548b37adeb757e2bd6c2b3f0b1b90e7583',
    neutral: '[2017] ZASCA 154',
    region: 'ZA',
    court: 'ZASCA',
    title: 'Grootboom Trading (Pty) Ltd v Commissioner for the South African Revenue Service',
    caseNumbers: ['1104/16'],
    date: '2017-11-24',
    judges: ['Grootboom JA', 'Ponnan JA', 'Schippers AJA'],
    reported: ['2018 (3) SA 220 (SCA)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'GROOTBOOM JA (Ponnan JA and Schippers AJA concurring):'),
      p(
        '1',
        'The appellant’s tax affairs were the subject of an assessment raised without the audit letter the Tax Administration Act requires. The Commissioner says the omission is a formality; the appellant says it is jurisdictional.',
      ),
      p(
        '2',
        'A procedural requirement is jurisdictional where the empowering provision makes the exercise of the power conditional upon it. Nothing turns on whether the requirement is described as substantive or formal; the question is one of construction.',
      ),
      p(
        '3',
        'The residue enquiry in Ndlovu v Sekhukhune Local Municipality [2013] ZASCA 88 has no application to a review of this kind, where the remedy sought is the setting aside of the decision itself and not damages.',
      ),
      p(
        '4',
        'On a proper construction, section 42(2) makes the delivery of an audit letter a condition precedent. The assessment is a nullity and falls to be set aside.',
      ),
      p('5', 'The appeal is upheld with costs, including the costs of two counsel.'),
    ],
  },
  {
    id: '52a587e3a4e5f591ce7ab688ad8b089f0dd1b1bfa4981354578e7a825adf8f49',
    neutral: '[2018] ZAWCHC 77',
    region: 'ZA',
    court: 'ZAWCHC',
    title: 'Van der Westhuizen NO v Cape Peninsula Fisheries Board',
    caseNumbers: ['14422/2017'],
    date: '2018-06-08',
    judges: ['Van der Westhuizen J'],
    reported: [],
    provenance: 'single',
    paragraphs: [
      p(null, 'VAN DER WESTHUIZEN J:'),
      p(
        '1',
        'The applicant, in his capacity as trustee, challenges the refusal of a small-scale fishing permit. The refusal was communicated by SMS and no reasons were given.',
      ),
      p(
        '2',
        'Grootboom Trading (Pty) Ltd v Commissioner for the South African Revenue Service [2017] ZASCA 154 at para 2 establishes that the characterisation of a requirement as formal or substantive is not decisive. The same reasoning applies to the duty to give reasons.',
      ),
      p(
        '3',
        'Where reasons are required and none are given, a reviewing court is placed in the position of having to guess at the basis for the decision. It should not do so, and the ordinary consequence is that the decision is set aside.',
      ),
      p(
        '4',
        'The applicant also claims constitutional damages for the season’s lost catch. That claim must fail on the second requirement in Rametsi v Minister of Safety and Security [2011] ZACC 14 at para 5: a review that restores the permit before the next season vindicates the right substantially, and what remains is an ordinary delictual claim which has not been pleaded.',
      ),
      p(
        '5',
        'The decision is reviewed and set aside and remitted for reconsideration within sixty days. The claim for constitutional damages is dismissed. The respondent is to pay the costs of the review.',
      ),
    ],
  },
  {
    id: '65fabfa27597d4bd14d53ceee3c437fc82a162d67150c13c7188aa6f5d2725e0',
    neutral: '[2019] ZACC 8',
    region: 'ZA',
    court: 'ZACC',
    title: 'Sithole v Ekurhuleni Metropolitan Municipality',
    caseNumbers: ['CCT 212/18'],
    date: '2019-03-26',
    judges: ['Sithole J', 'Mogoeng CJ', 'Khampepe J', 'Theron J', 'Madlanga J'],
    reported: ['2019 (6) SA 112 (CC)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'SITHOLE J (Mogoeng CJ, Khampepe J, Theron J and Madlanga J concurring):'),
      p(
        '1',
        'This is an application for leave to appeal against an eviction order granted in circumstances where the municipality had offered no temporary emergency accommodation and had filed no report on its capacity to do so.',
      ),
      p(
        '2',
        'The High Court in Thekiso v City of Johannesburg Metropolitan Municipality [2015] ZAGPJHC 210 at para 5 held that two unanswered letters do not constitute meaningful engagement. That is plainly right, and we endorse it.',
      ),
      p(
        '3',
        'Engagement is not a procedural box. It is the mechanism by which the just-and-equitable enquiry is given content, because a court cannot weigh circumstances that no one has troubled to establish.',
      ),
      p(
        '4',
        'The applicants asked, in the alternative, for constitutional damages against the municipality. Mabaso v Minister of Police [2016] ZACC 31 at para 4 confirms that the three requirements are cumulative, and the first is not met here: an eviction lawfully granted infringes no right, and one unlawfully granted is met by setting it aside.',
      ),
      p(
        '5',
        'The observations in Rametsi v Minister of Safety and Security [2011] ZACC 14 at para 4 about systemic infringement do not carry the applicants further. A systemic failure to engage is a reason to refuse an eviction, not a reason to award damages alongside the refusal.',
      ),
      p(
        '6',
        'Leave to appeal is granted, the appeal is upheld, and the eviction order is set aside. The municipality is directed to file a report on the availability of temporary emergency accommodation within sixty days.',
      ),
      p(
        '7',
        'The claim for constitutional damages is dismissed. There is no order as to costs, this being constitutional litigation against the State.',
      ),
    ],
  },
  {
    id: '3fdb4f77c485f1cb74e229596468e4c24d187efea7336f92f15f770db029dfb8',
    neutral: '[2020] ZASCA 61',
    region: 'ZA',
    court: 'ZASCA',
    title: 'Motaung v Passenger Rail Agency of South Africa',
    caseNumbers: ['765/19'],
    date: '2020-06-05',
    judges: ['Motaung JA', 'Cachalia JA', 'Mbatha JA'],
    reported: ['2021 (1) SA 88 (SCA)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'MOTAUNG JA (Cachalia JA and Mbatha JA concurring):'),
      p(
        '1',
        'The appellant fell from a moving commuter train whose doors had been open since the previous station. The Agency admits the doors were defective and that it knew. It disputes only the quantum and the availability of constitutional damages.',
      ),
      p(
        '2',
        'Mabaso v Minister of Police [2016] ZACC 31 at para 7 holds that where an organ of State admits a systemic defect, the second requirement will ordinarily be met. The Agency’s admission that 40 per cent of its fleet has defective door interlocks is such an admission.',
      ),
      p(
        '3',
        'The Agency sought to distinguish Mabaso on the ground that it concerned deprivation of liberty rather than bodily integrity. The distinction is without substance. Nothing in the reasoning is confined to section 12(1)(a).',
      ),
      p(
        '4',
        'Sithole v Ekurhuleni Metropolitan Municipality [2019] ZACC 8 at para 4 is not to the contrary. It decided that an eviction set aside leaves no residue, which is a conclusion about that remedy, not a general limitation.',
      ),
      p(
        '5',
        'The delictual award compensates the appellant for the loss of his left arm. It does nothing about the remaining defective doors, and the Agency has been under a compliance notice for three years without effect.',
      ),
      p(
        '6',
        'An award of R400 000 in constitutional damages is made, together with a declarator and an order that the Agency report to the court on its door-interlock programme every six months for two years.',
      ),
      p('7', 'The appeal is upheld with costs.'),
    ],
  },
  {
    id: 'a7bec3b19b39eb35646eb12d19eaa479fc736435002a6da79516f61602c49641',
    neutral: '[2021] ZAKZDHC 40',
    region: 'ZA',
    court: 'ZAKZDHC',
    title: 'Pillay v MEC for Health, KwaZulu-Natal',
    caseNumbers: ['D 3391/2020'],
    date: '2021-08-17',
    judges: ['Pillay J'],
    reported: [],
    provenance: 'single',
    paragraphs: [
      p(null, 'PILLAY J:'),
      p(
        '1',
        'The plaintiff was turned away from a district hospital in labour and gave birth at the roadside. The child survived; the injuries did not resolve.',
      ),
      p(
        '2',
        'The MEC concedes negligence. The contested question is whether the supervisory relief granted in Motaung v Passenger Rail Agency of South Africa [2020] ZASCA 61 at para 6 is available in this Division on these facts.',
      ),
      p(
        '3',
        'Supervisory relief is not a remedy of first resort, but nothing confines it to the Supreme Court of Appeal. The requirement is a demonstrated pattern that ordinary relief will not disturb.',
      ),
      p(
        '4',
        'The evidence establishes eleven comparable turn-aways at the same hospital in fourteen months. Mabaso v Minister of Police [2016] ZACC 31 at para 7 applies squarely.',
      ),
      p(
        '5',
        'Judgment is granted in the agreed delictual amount, with R120 000 in constitutional damages and a reporting order in the terms set out in the annexure.',
      ),
    ],
  },
  {
    id: '68714dd53c42eff155695c6463b27275523112e7f0b573de204533fd5a2a69c0',
    neutral: '[2022] ZAGPJHC 512',
    region: 'ZA',
    court: 'ZAGPJHC',
    title: 'Khumalo v Minister of Home Affairs',
    caseNumbers: ['2021/48119'],
    date: '2022-07-29',
    judges: ['Khumalo AJ'],
    reported: [],
    provenance: 'single',
    paragraphs: [
      p(null, 'KHUMALO AJ:'),
      p(
        '1',
        'The applicant, a naturalised citizen, had her identity number blocked on the population register for four years without notice, reason, or any process by which she might have contested it.',
      ),
      p(
        '2',
        'The Department’s answering affidavit says the block was placed by an official who has since left and that no record of the reason survives. That is not an explanation; it is the absence of one.',
      ),
      p(
        '3',
        'Grootboom Trading (Pty) Ltd v Commissioner for the South African Revenue Service [2017] ZASCA 154 at para 4 holds that a decision taken without a condition precedent is a nullity. A block placed without any recorded basis is worse: there is no decision to review.',
      ),
      p(
        '4',
        'Counsel relied on Mokoena v Director-General, Department of Home Affairs [2020] ZAGPPHC 331, which is not before me and which I have not been able to obtain. I decide the matter without reference to it.',
      ),
      p(
        '5',
        'Sithole v Ekurhuleni Metropolitan Municipality [2019] ZACC 8 at para 4 requires an infringement of a right in the Bill of Rights before constitutional damages arise. Four years of statelessness in fact, if not in law, is such an infringement.',
      ),
      p(
        '6',
        'The block is set aside. The Department is directed to restore the applicant’s status within ten days and to pay R200 000 in constitutional damages, and the costs of the application on the attorney and client scale.',
      ),
    ],
  },
  {
    id: '70391ab9515f694d49c824a2d2296530a3004f71f630548d4d09c4460941f7a6',
    neutral: '[2023] ZAWCHC 119',
    region: 'ZA',
    court: 'ZAWCHC',
    title: 'Adams v Overberg District Municipality',
    caseNumbers: ['9911/2022'],
    date: '2023-05-11',
    judges: ['Adams J', 'Le Roux AJ'],
    reported: [],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'ADAMS J (Le Roux AJ concurring):'),
      p(
        '1',
        'This is a review of a decision to relocate an informal settlement of some four hundred households to a site eleven kilometres from the nearest clinic and school.',
      ),
      p(
        '2',
        'Van der Westhuizen NO v Cape Peninsula Fisheries Board [2018] ZAWCHC 77 at para 3 held that where reasons are required and none are given, the ordinary consequence is that the decision is set aside. Reasons were given here, but they address only cost.',
      ),
      p(
        '3',
        'A decision that engages the right of access to housing cannot be justified by cost alone, and the record discloses no consideration of any other factor.',
      ),
      p(
        '4',
        'Sithole v Ekurhuleni Metropolitan Municipality [2019] ZACC 8 at para 3 describes engagement as the mechanism by which the just-and-equitable enquiry is given content. The same is true of a relocation decision taken in the shadow of an eviction.',
      ),
      p(
        '5',
        'The decision is reviewed and set aside. The municipality is directed to engage meaningfully with the affected households and to place the outcome before this court within one hundred and twenty days.',
      ),
    ],
  },
  {
    id: '5941a989115f328d27731cd1c3e9b7eacae10638439bf862d3a9fb2d24f5c051',
    neutral: '[2024] ZACC 12',
    region: 'ZA',
    court: 'ZACC',
    title: 'Nkosi v Minister of Police',
    caseNumbers: ['CCT 91/23'],
    date: '2024-04-18',
    judges: ['Nkosi J', 'Zondo CJ', 'Maya DCJ', 'Majiedt J', 'Theron J', 'Mathopo J'],
    reported: ['2024 (4) SA 301 (CC)'],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'NKOSI J (Zondo CJ, Maya DCJ, Majiedt J, Theron J and Mathopo J concurring):'),
      p(
        '1',
        'Thirteen years after Rametsi v Minister of Safety and Security [2011] ZACC 14 this Court returns to constitutional damages for unlawful arrest, and to a question that Rametsi did not need to decide: what a court is to do when the systemic defect it identified in an earlier matter has not been repaired.',
      ),
      p(
        '2',
        'The applicant was arrested on the same withdrawn-warrant defect that this Court described in Mabaso v Minister of Police [2016] ZACC 31 at para 6. Eight years have passed. The Minister’s affidavit concedes that the warrant register remains unreconciled and that no timetable exists for reconciling it.',
      ),
      p(
        '3',
        'A concession of that kind puts the second requirement beyond argument. Where this Court has already declared a practice unconstitutional and the practice continues, the delictual award plainly leaves the constitutional injury unvindicated. Mabaso at para 7 anticipated the point.',
      ),
      p(
        '4',
        'The harder question is the third requirement. If an award of R250 000 in 2016 did not deter, what reason is there to think a larger award will? The Minister, understandably, presses this argument, though it sits oddly in the mouth of the party whose non-compliance gives it force.',
      ),
      p(
        '5',
        'We do not accept that a remedy is unavailable because it has previously been ignored. But we do accept that repetition of an ineffective remedy is not vindication either, and that a court asked for the same order a second time should ask what more is required.',
      ),
      p(
        '6',
        'Motaung v Passenger Rail Agency of South Africa [2020] ZASCA 61 at para 6 shows the way. Supervisory relief converts a declaration into an obligation with a date attached, and it does so without the court assuming the executive’s function.',
      ),
      p(
        '7',
        'The Supreme Court of Appeal was accordingly wrong to hold, in Minister of Police v Nkosi [2023] ZASCA 149 at para 22, that supervisory relief is exceptional. It is ordinary relief in an extraordinary situation, and the situation before us is extraordinary only because it has been allowed to persist.',
      ),
      p(
        '8',
        'We reaffirm the three requirements in Rametsi at para 5, subject to this clarification: where the second requirement is met by reason of an unremedied systemic defect, the third is presumptively met, and the enquiry moves to the form of relief rather than its availability.',
      ),
      p(
        '9',
        'Sithole v Ekurhuleni Metropolitan Municipality [2019] ZACC 8 at para 5 is not disturbed. What is said there about eviction concerns a remedy that is complete on the setting aside of the order; nothing in it bears on a defect that survives the order.',
      ),
      p(
        '10',
        'Constitutional damages of R300 000 are awarded. The Minister is directed to file, on affidavit, a plan for the reconciliation of the warrant register within ninety days, and to report to this Court on progress every six months until reconciliation is complete or three years have elapsed.',
      ),
      p(
        '11',
        'The Registrar is directed to bring each report to the attention of the Chief Justice for allocation.',
      ),
      p('12', 'The appeal is upheld with costs, including the costs of three counsel.'),
    ],
  },
  {
    id: '6d6e0390d962819ec89d497028e9c4f61e8ff66844aabecb362c6b49208f4b4d',
    neutral: '[2025] ZASCA 27',
    region: 'ZA',
    court: 'ZASCA',
    title: 'Fourie v Road Accident Fund',
    caseNumbers: ['288/24'],
    date: '2025-03-21',
    judges: ['Fourie JA', 'Molemela JA', 'Weiner JA'],
    reported: [],
    provenance: 'corroborated',
    paragraphs: [
      p(null, 'FOURIE JA (Molemela JA and Weiner JA concurring):'),
      p(
        '1',
        'The Fund did not oppose the claim, did not attend the trial, and did not pay the resulting order for nineteen months. The appellant asks for constitutional damages for the delay itself.',
      ),
      p(
        '2',
        'Nkosi v Minister of Police [2024] ZACC 12 at para 8 holds that where the second requirement is met by an unremedied systemic defect, the third is presumptively met. The Fund’s payment backlog is documented, admitted and long-standing.',
      ),
      p(
        '3',
        'That does not end the matter. The first requirement remains, and a delayed statutory payment is not obviously the infringement of a right in the Bill of Rights. Motaung v Passenger Rail Agency of South Africa [2020] ZASCA 61 at para 3 warns against confining the enquiry to a particular right, but it does not dispense with the need to identify one.',
      ),
      p(
        '4',
        'Pillay v MEC for Health, KwaZulu-Natal [2021] ZAKZDHC 40 at para 3 correctly states that supervisory relief requires a demonstrated pattern that ordinary relief will not disturb. The pattern is established; ordinary relief, in the form of execution, has not been attempted.',
      ),
      p(
        '5',
        'The appeal is dismissed on the constitutional damages claim and upheld on interest. The appellant is awarded mora interest from the date of the order below.',
      ),
    ],
  },
  {
    id: '996dc061c06395275d42d2d656b1341a74940795012d43cd6d662bc5fb991528',
    neutral: '[2025] ZAECGHC 41',
    region: 'ZA',
    court: 'ZAECGHC',
    title: 'Dlamini v Buffalo City Metropolitan Municipality',
    caseNumbers: ['1877/2024'],
    date: '2025-06-12',
    judges: ['Dlamini J'],
    reported: [],
    provenance: 'manual',
    paragraphs: [
      p(null, 'DLAMINI J:'),
      p(
        '1',
        'The applicants occupy nineteen dwellings on land the municipality intends to use for a pump station. They have been there since 2003. No alternative site was investigated.',
      ),
      p(
        '2',
        'Adams v Overberg District Municipality [2023] ZAWCHC 119 at para 3 holds that a decision engaging the right of access to housing cannot be justified by cost alone. The reasoning applies with equal force where the competing consideration is engineering convenience.',
      ),
      p(
        '3',
        'The municipality relied on Nkosi v Minister of Police [2024] ZACC 12 for the proposition that supervisory relief is now ordinary and that the court should simply order a report rather than refuse the relocation. That is not what Nkosi at para 7 says. Supervisory relief is ordinary relief in an extraordinary situation; it is not a substitute for deciding the matter.',
      ),
      p(
        '4',
        'Sithole v Ekurhuleni Metropolitan Municipality [2019] ZACC 8 at para 6 remains the governing authority. The municipality must engage, and it must report on temporary emergency accommodation before, not after, an order is made.',
      ),
      p(
        '5',
        'The application is dismissed. The municipality is granted leave to renew it once the report contemplated in Sithole has been filed. Costs are reserved.',
      ),
    ],
  },
];

/** Signer set for the demo release. Fictional, like everything else here. */
export const DEMO_SIGNERS = 4;
export const DEMO_THRESHOLD = 3;
export const DEMO_RELEASE = 7;
