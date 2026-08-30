import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_WEBSITE,
} from "./Legal";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export const TERMS_OF_SERVICE: LegalSection[] = [
  {
    title: "1. Agreement",
    paragraphs: [
      "These Terms of Service (the “Terms”) are a legally binding agreement between you and StudySpotr (“StudySpotr,” “we,” “us,” or “our”) governing your access to and use of the StudySpotr mobile application, website, and related services (collectively, the “Service”).",
      "By creating an account, tapping Accept, or using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use StudySpotr.",
    ],
  },
  {
    title: "2. Eligibility",
    paragraphs: [
      "You must be at least 13 years old to use StudySpotr. If you are under the age of majority in your province or territory, you represent that a parent or guardian has reviewed and agreed to these Terms on your behalf.",
      "The Service is intended for students and others looking for places to study or work, and for related community features. You are responsible for complying with the rules of any school, campus, café, or other location you visit using the Service.",
    ],
  },
  {
    title: "3. Your account",
    paragraphs: [
      "You must provide accurate information when you register, including your name, email address, and username. You may also sign in with Google or Apple. You are responsible for all activity on your account and for keeping your login details secure.",
      "Notify us promptly if you believe your account has been accessed without permission. We may suspend or close accounts that are inaccurate, unsafe, inactive, or that violate these Terms.",
      "You can delete your account from Profile settings. Deletion removes or anonymizes personal data as described in the Privacy Policy, except where we must retain information for legal, security, or operational reasons.",
    ],
  },
  {
    title: "4. The Service",
    paragraphs: [
      "StudySpotr lets you discover and review study spots, share photos, post to a feed, join communities, RSVP to events, message other users, and manage a public or semi-public profile.",
      "Some features need device permissions, such as location, camera, microphone, or photo library access. You can turn those permissions off in your device settings, but related features may stop working.",
      "We may change, pause, or discontinue any part of the Service, including for maintenance, safety, or legal reasons. We do not promise that the Service will always be available, error-free, or that listings, hours, or amenities are complete or current.",
    ],
  },
  {
    title: "5. Acceptable use",
    paragraphs: [
      "You agree not to use StudySpotr to harass, threaten, stalk, defame, or harm others; to post illegal, sexual, hateful, or violent content; to impersonate anyone; or to collect other people’s information without permission.",
      "You may not spam, scrape, reverse engineer, overload, or interfere with the Service; create fake accounts or fake spots; manipulate reviews or engagement; or use the Service for advertising or commercial solicitation unless we agree in writing.",
      "Do not share content you do not have the right to share, including photos of other people taken without a reasonable basis to do so, or copyrighted material you do not own or license.",
    ],
  },
  {
    title: "6. User content",
    paragraphs: [
      "You keep ownership of the content you submit, including profile information, photos, videos, captions, reviews, spot listings, comments, community posts, and messages (“User Content”).",
      "By submitting User Content, you grant StudySpotr a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, display, distribute, and otherwise use that content as needed to operate, improve, promote, and protect the Service. This licence lasts as long as your content is on the Service and for a reasonable period afterward for backups and legal compliance.",
      "You are solely responsible for your User Content. We may remove, hide, or restrict content or accounts that we believe violate these Terms, our rules, or the law, or that create risk for users or StudySpotr. Reporting tools in the app do not guarantee a particular outcome.",
    ],
  },
  {
    title: "7. Messaging, communities, and events",
    paragraphs: [
      "Direct messages, community membership, friend connections, and event RSVPs are provided to help you connect with other people. Treat others with respect. Do not use these features to spam, solicit, or share harmful material.",
      "Community hosts and event organizers are responsible for their own events and for following venue and local rules. StudySpotr is not a party to your in-person meetings and is not liable for what happens at a study spot, community, or event.",
    ],
  },
  {
    title: "8. Location and safety",
    paragraphs: [
      "If you allow location access, we may use it to show nearby spots and related features. Location data can reveal where you are. Use your judgment about when to share your location, meet people, or visit a place listed in the app.",
      "StudySpotr does not perform background checks on users and does not guarantee the safety, accessibility, hours, Wi-Fi, or conditions of any location. You visit places and meet people at your own risk.",
    ],
  },
  {
    title: "9. Third-party services",
    paragraphs: [
      "The Service uses third parties to function, including authentication providers (such as Google and Apple), hosting and database providers, file storage, and email delivery. Their terms and privacy policies also apply when you use those providers.",
      "The Service may contain links to third-party websites or apps. We are not responsible for those services.",
    ],
  },
  {
    title: "10. Intellectual property",
    paragraphs: [
      "StudySpotr, the StudySpotr name and logo, and the software, design, and content we provide (other than User Content) are owned by StudySpotr or our licensors. You may not copy, modify, or distribute them except as needed to use the Service.",
    ],
  },
  {
    title: "11. Suspension and termination",
    paragraphs: [
      "You may stop using the Service at any time and may delete your account. We may suspend or terminate access immediately if you breach these Terms, if we are required to do so by law, or if we reasonably believe it is necessary to protect users, the Service, or StudySpotr.",
    ],
  },
  {
    title: "12. Disclaimers",
    paragraphs: [
      "THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, STUDYSPOTR DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.",
      "We do not warrant that spots, reviews, maps, hours, or user profiles are accurate, or that the Service will meet your needs or be uninterrupted or secure.",
    ],
  },
  {
    title: "13. Limitation of liability",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, STUDYSPOTR AND ITS DIRECTORS, OFFICERS, EMPLOYEES, AND PARTNERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM YOUR USE OF THE SERVICE.",
      "OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THE SERVICE WILL NOT EXCEED THE GREATER OF CAD $50 OR THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM (CURRENTLY THE SERVICE IS OFFERED WITHOUT A REQUIRED PAID SUBSCRIPTION).",
      "Some jurisdictions do not allow certain limitations. In those places, our liability is limited to the greatest extent permitted by law. Nothing in these Terms limits liability that cannot legally be limited, including for fraud or gross negligence.",
    ],
  },
  {
    title: "14. Indemnity",
    paragraphs: [
      "You will defend and indemnify StudySpotr against claims, damages, and expenses (including reasonable legal fees) arising from your User Content, your use of the Service, your meetings or visits arranged through the Service, or your breach of these Terms.",
    ],
  },
  {
    title: "15. Changes",
    paragraphs: [
      "We may update these Terms from time to time. If a change is material, we will provide notice in the app or by other reasonable means. The updated Terms take effect when posted unless we say otherwise. Continued use after that date means you accept the new Terms.",
    ],
  },
  {
    title: "16. Governing law",
    paragraphs: [
      "These Terms are governed by the laws of Canada and the Province of British Columbia, without regard to conflict-of-law rules. Courts located in British Columbia will have exclusive jurisdiction, except that we may seek injunctive relief in any jurisdiction to protect our rights.",
    ],
  },
  {
    title: "17. Contact",
    paragraphs: [
      `Questions about these Terms: ${LEGAL_CONTACT_EMAIL} or ${LEGAL_WEBSITE}.`,
    ],
  },
];

export const PRIVACY_POLICY: LegalSection[] = [
  {
    title: "1. Who we are",
    paragraphs: [
      "StudySpotr (“StudySpotr,” “we,” “us,” or “our”) provides a mobile app that helps people find study spots, connect with others, and share content. This Privacy Policy explains what personal information we collect, how we use it, and the choices you have.",
      "It applies to the StudySpotr app and related services. It does not apply to third-party websites, apps, or venues we do not control.",
    ],
  },
  {
    title: "2. Information we collect",
    paragraphs: [
      "Account information: first name, last name, email address, username, password (stored as a secure hash by our authentication provider), and sign-in identifiers if you use Google or Apple.",
      "Profile information: optional bio, school, field of study, city, country, profile photo, and similar details you choose to add.",
      "User content: study spots you create, reviews, ratings, photos and videos, captions, comments, likes, community membership, events and RSVPs, friend connections, and messages you send.",
      "Location: if you grant permission, approximate or precise location so we can show nearby spots and related features. You can disable location access in your device settings.",
      "Device and usage information: app version, device type, crash and diagnostic data, and basic logs needed to operate and secure the Service (such as IP address and timestamps on server requests).",
      "Communications: messages you send to us, and emails we send you about your account (for example password reset).",
    ],
  },
  {
    title: "3. Information from Google and Apple",
    paragraphs: [
      "If you sign in with Google or Apple, those providers share information with us that you authorize, typically your email address and name. Apple may hide your email behind a private relay address. We use this only to create and authenticate your StudySpotr account and to show your name on your profile unless you change it.",
      "We do not receive your Google or Apple password.",
    ],
  },
  {
    title: "4. How we use information",
    paragraphs: [
      "We use personal information to: create and secure your account; show your profile, spots, posts, and activity to other users as the product is designed; recommend nearby spots; operate messaging, friends, communities, and events; prevent abuse and spam; fix bugs; communicate with you about the Service; and comply with law.",
      "We do not sell your personal information. We do not use your content to train public generative AI models.",
    ],
  },
  {
    title: "5. How we share information",
    paragraphs: [
      "With other users: your public or community-visible profile, spots, reviews, photos, posts, comments, and similar content can be seen by other people using StudySpotr according to the visibility of each feature.",
      "With service providers that help us run StudySpotr, including: Supabase (authentication and database), cloud file storage for photos and videos, and email delivery for account messages. These providers may process data in Canada, the United States, or other countries.",
      "If you sign in with Google or Apple, those companies process your sign-in according to their own policies.",
      "We may disclose information if required by law, to protect people or the Service, or as part of a merger, acquisition, or financing, with appropriate safeguards.",
    ],
  },
  {
    title: "6. Location data",
    paragraphs: [
      "Location is used to sort and display nearby study spots and similar features. We do not require location to create an account. If you enable it, your device may send location to our servers while you use those features.",
      "Other users do not get a live map of your exact location unless a future feature you opt into says so. Spot listings you create may include coordinates or an address that you provide.",
    ],
  },
  {
    title: "7. Messages",
    paragraphs: [
      "Direct messages are stored so you and the other person can read them in the app. We may access message content if needed to investigate abuse, security issues, or legal requests, or to operate the messaging system. Do not send information in chat that you would not want stored.",
    ],
  },
  {
    title: "8. Retention",
    paragraphs: [
      "We keep account and content data for as long as your account is active. If you delete your account, we delete or anonymize personal information within a reasonable period, unless we must keep it longer for legal, security, backup, or dispute-resolution reasons.",
      "Backups may persist for a limited time after deletion before they are overwritten.",
    ],
  },
  {
    title: "9. Security",
    paragraphs: [
      "We use industry-standard measures such as encrypted connections (HTTPS) and token-based authentication. No method of transmission or storage is 100% secure. You can help by choosing a strong password (if you use email sign-in) and not sharing your account.",
    ],
  },
  {
    title: "10. Your choices and rights",
    paragraphs: [
      "You can access and update much of your information in Profile settings, including name, username, bio, school, location fields, and profile photo.",
      "You can delete your account in settings. You can turn off camera, photos, microphone, or location permissions in your device settings.",
      "Depending on where you live (including under Canadian privacy law / PIPEDA, and similar laws), you may have rights to access, correct, or delete personal information, or to withdraw consent. To make a request, email us at the address below. We may need to verify it is you.",
    ],
  },
  {
    title: "11. Children",
    paragraphs: [
      "StudySpotr is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe we have, contact us and we will delete it.",
    ],
  },
  {
    title: "12. International processing",
    paragraphs: [
      "We are based in Canada. Your information may be processed in Canada, the United States, or other countries where our providers operate. Those countries may have different privacy laws than your home jurisdiction.",
    ],
  },
  {
    title: "13. Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy. We will change the “Last updated” date and, for material changes, provide additional notice in the app when appropriate. Continued use after an update means you accept the revised policy.",
    ],
  },
  {
    title: "14. Contact",
    paragraphs: [
      `Privacy questions or requests: ${LEGAL_CONTACT_EMAIL}. Website: ${LEGAL_WEBSITE}.`,
    ],
  },
];
